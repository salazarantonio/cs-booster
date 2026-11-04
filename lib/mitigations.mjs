import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { planMitigations } from './core/seguranca-avancada.mjs';

const memoryKey = 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management';
const virtualizationKey = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Virtualization';
export const MITIGATION_ENTRIES = Object.freeze([
  Object.freeze({hive:'LocalMachine',key:memoryKey,name:'FeatureSettingsOverride'}),
  Object.freeze({hive:'LocalMachine',key:memoryKey,name:'FeatureSettingsOverrideMask'}),
  Object.freeze({hive:'LocalMachine',key:virtualizationKey,name:'MinVmVersionForCpuBasedMitigations'}),
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const equal=(a,b)=>a.exists===b.exists&&(!a.exists||(a.type===b.type&&a.value===b.value));
const copy=value=>structuredClone(value);

// OS identity and administrator state are acquired here, never supplied by the renderer.
const systemProbe = `
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();
$principal=[Security.Principal.WindowsPrincipal]::new($identity);
$admin=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);
$cpu=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0');
try{$raw=if($cpu){[string]$cpu.GetValue('VendorIdentifier')}else{''}}finally{if($cpu){$cpu.Dispose()}}
$vendor=if($raw -eq 'GenuineIntel'){'Intel'}elseif($raw -eq 'AuthenticAMD'){'AMD'}elseif($raw -match 'ARM' -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){'ARM'}else{'Unknown'};
$hyperV=$null;
if($admin){try{$feature=Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -ErrorAction Stop;$hyperV=($feature.State -eq 'Enabled')}catch{}}
@{isAdmin=$admin;vendor=$vendor;hyperV=$hyperV;computerName=$env:COMPUTERNAME}|ConvertTo-Json -Compress
`;

function checkedSnapshot(s) {
  if (!s||typeof s!=='object'||Array.isArray(s)||typeof s.exists!=='boolean') throw new Error('Estado de backup inválido.');
  if (!s.exists) return {exists:false};
  if (s.type==='DWord'&&Number.isInteger(s.value)&&s.value>=-2147483648&&s.value<=2147483647) return {exists:true,type:'DWord',value:s.value};
  if (s.type==='String'&&typeof s.value==='string'&&s.value.length<=4096) return {exists:true,type:'String',value:s.value};
  throw new Error('Tipo ou valor de backup não suportado.');
}

export function createMitigationService(dataDir,{registry,powershell}={}) {
  if (!registry||typeof registry.read!=='function'||typeof registry.write!=='function'||typeof powershell!=='function') throw new Error('Dependências do serviço de mitigações ausentes.');
  const backupDir=path.resolve(dataDir,'mitigation-backups');
  let queue=Promise.resolve();
  const exclusive=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};

  async function system(requireAdmin=false) {
    const info=await powershell(systemProbe);
    if (!info||typeof info.isAdmin!=='boolean'||typeof info.vendor!=='string') throw new Error('Não foi possível verificar o Windows e o fabricante da CPU.');
    if (requireAdmin&&!info.isAdmin) throw new Error('Abra o CS Booster como administrador para alterar ou restaurar mitigações.');
    if (requireAdmin&&!['Intel','AMD','ARM'].includes(info.vendor)) throw new Error('Fabricante da CPU não identificado; nenhuma alteração foi executada.');
    return info;
  }
  async function readValues(){return Promise.all(MITIGATION_ENTRIES.map(async e=>({entry:copy(e),snapshot:checkedSnapshot(await registry.read(e))})));}
  async function ensureDirectory(create=false) {
    if (create) await fs.mkdir(backupDir,{recursive:true});
    const real=await fs.realpath(backupDir);
    if (real.toLowerCase()!==backupDir.toLowerCase()||(await fs.lstat(backupDir)).isSymbolicLink()) throw new Error('Pasta de backups redirecionada; operação recusada.');
  }
  async function protectDirectory() {
    await ensureDirectory(true);
    // Reduce exposure of backups read by an elevated application. The caller's
    // production dataDir should itself be an administrator-controlled location.
    const encoded=Buffer.from(backupDir,'utf8').toString('base64');
    const result=await powershell(`$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$admins=[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544');$system=[Security.Principal.SecurityIdentifier]::new('S-1-5-18');$acl.SetOwner($admins);foreach($sid in @($admins,$system)){$rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)};Set-Acl -LiteralPath $p -AclObject $acl -ErrorAction Stop;@{protected=$true}|ConvertTo-Json -Compress`);
    if (result?.protected!==true) throw new Error('Não foi possível proteger a pasta de backups.');
  }
  async function saveBackup(values,info,reason) {
    await protectDirectory();
    const record={version:1,id:randomUUID(),at:new Date().toISOString(),vendor:info.vendor,computerName:info.computerName||null,reason,values};
    const file=path.join(backupDir,record.id+'.json');
    await fs.writeFile(file,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});
    const encoded=Buffer.from(file,'utf8').toString('base64');
    const protection=await powershell(`$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$acl=[Security.AccessControl.FileSecurity]::new();$acl.SetAccessRuleProtection($true,$false);$admins=[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544');$system=[Security.Principal.SecurityIdentifier]::new('S-1-5-18');$acl.SetOwner($admins);foreach($sid in @($admins,$system)){$rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow');$acl.AddAccessRule($rule)};Set-Acl -LiteralPath $p -AclObject $acl -ErrorAction Stop;@{protected=$true}|ConvertTo-Json -Compress`);
    if(protection?.protected!==true)throw new Error('Não foi possível proteger o arquivo de backup. Nenhum valor de registro foi alterado.');
    return record;
  }
  async function verifyBackupTrust(file) {
    const encoded=Buffer.from(file,'utf8').toString('base64');
    const result=await powershell(`$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$item=Get-Item -LiteralPath $p -Force -ErrorAction Stop;$acl=Get-Acl -LiteralPath $p -ErrorAction Stop;$allowed=@('S-1-5-32-544','S-1-5-18');$owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;$trusted=($owner -in $allowed) -and (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0);$writeMask=[Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership;foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed -and ($rule.FileSystemRights -band $writeMask) -ne 0){$trusted=$false}};@{trusted=[bool]$trusted}|ConvertTo-Json -Compress`);
    if(result?.trusted!==true)throw new Error('Backup recusado: proprietário, permissões ou redirecionamento do arquivo não são confiáveis.');
  }
  function validateBackup(record,id) {
    if (!record||record.version!==1||record.id!==id||!['Intel','AMD','ARM'].includes(record.vendor)||!Array.isArray(record.values)||record.values.length!==MITIGATION_ENTRIES.length) throw new Error('Backup de mitigações inválido.');
    const values=record.values.map((v,i)=>{const allowed=MITIGATION_ENTRIES[i];if(!v?.entry||Object.keys(allowed).some(key=>v.entry[key]!==allowed[key]))throw new Error('Backup contém destino não autorizado.');return {entry:copy(allowed),snapshot:checkedSnapshot(v.snapshot)};});
    return {...record,values};
  }
  async function readBackup(id) {
    if(typeof id!=='string'||!uuidPattern.test(id))throw new Error('Identificador de backup inválido.');
    await ensureDirectory();
    const file=path.join(backupDir,id+'.json');
    const stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024)throw new Error('Arquivo de backup não permitido.');
    await verifyBackupTrust(file);
    return validateBackup(JSON.parse(await fs.readFile(file,'utf8')),id);
  }
  async function listMitigationBackups(){
    try{await ensureDirectory();}catch(e){if(['ENOENT','EACCES','EPERM'].includes(e.code))return [];throw e;}
    const records=[];
    let names;try{names=await fs.readdir(backupDir);}catch(e){if(['EACCES','EPERM'].includes(e.code))return [];throw e;}
    for(const name of names){
      if(!name.endsWith('.json')||!uuidPattern.test(name.slice(0,-5)))continue;
      try{const b=await readBackup(name.slice(0,-5));records.push({id:b.id,at:b.at,vendor:b.vendor,reason:b.reason,computerName:b.computerName});}catch{ /* Invalid files are never offered as restorable backups. */ }
    }
    return records.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  }
  async function writeVerified(index,snapshot){
    await registry.write(MITIGATION_ENTRIES[index],snapshot);
    const actual=checkedSnapshot(await registry.read(MITIGATION_ENTRIES[index]));
    if(!equal(actual,snapshot))throw new Error(`A verificação de ${MITIGATION_ENTRIES[index].name} falhou.`);
  }
  async function change(desired,info,reason) {
    const before=await readValues();
    const backup=await saveBackup(before,info,reason);
    const touched=[];
    try{
      for(let i=0;i<MITIGATION_ENTRIES.length;i++){
        if(equal(before[i].snapshot,desired[i]))continue;
        // Record before the write: an adapter may throw after performing it.
        touched.push(i);
        await writeVerified(i,desired[i]);
      }
      return {ok:true,backupId:backup.id,restartRequired:touched.length>0,effectiveState:'unknown',message:touched.length?'Configuração gravada e verificada. Reinicie quando desejar; o estado efetivo do kernel ainda não foi verificado.':'A configuração já correspondia ao perfil. Backup criado; nenhuma mudança foi necessária.'};
    }catch(error){
      const rollbackErrors=[];
      for(const i of touched.reverse()){try{await writeVerified(i,before[i].snapshot);}catch(e){rollbackErrors.push(`${MITIGATION_ENTRIES[i].name}: ${e.message}`);}}
      const failure=new Error(rollbackErrors.length?`A alteração falhou e a reversão ficou incompleta. Backup: ${backup.id}. ${rollbackErrors.join(' ')}`:`A alteração falhou; os valores tocados foram restaurados e verificados. Backup: ${backup.id}. ${error.message}`);
      failure.backupId=backup.id;failure.rollbackSucceeded=rollbackErrors.length===0;failure.rollbackErrors=rollbackErrors;
      throw failure;
    }
  }
  async function getMitigationStatus(){
    const values=await readValues();
    let info;try{info=await system();}catch(e){info={isAdmin:false,vendor:'Unknown',probeError:e.message};}
    return {supported:true,configured:{override:values[0].snapshot,mask:values[1].snapshot,minVm:values[2].snapshot},vendor:info.vendor,isAdmin:info.isAdmin,isAdministrator:info.isAdmin,requiresAdministrator:true,hyperV:info.hyperV??null,probeError:info.probeError,effectiveState:'unknown',verificationAvailable:false,applySupported:info.isAdmin&&['Intel','AMD','ARM'].includes(info.vendor),message:'Leitura do registro não comprova proteção efetiva no kernel.'};
  }
  async function applyMitigation({vendor,profileIds,confirmReducedSecurity}={}){
    return exclusive(async()=>{
      const plan=planMitigations({vendor,profileIds});
      if(plan.reducedSecurity&&confirmReducedSecurity!==true)throw new Error('Confirme explicitamente que este perfil reduz as proteções de segurança da CPU.');
      const info=await system(true);
      if(info.vendor!==vendor)throw new Error('O fabricante selecionado não corresponde à CPU detectada no Windows.');
      // Re-plan against trusted OS identity as a second compatibility check.
      const verifiedPlan=planMitigations({vendor:info.vendor,profileIds});
      const desired=(await readValues()).map(v=>v.snapshot);
      if(verifiedPlan.operation==='remove-overrides'){
        desired.fill({exists:false});
      }else{
        desired[0]={exists:true,type:'DWord',value:verifiedPlan.override};
        desired[1]={exists:true,type:'DWord',value:verifiedPlan.mask};
        if(verifiedPlan.minVm){
          if(typeof info.hyperV!=='boolean')throw new Error('Não foi possível verificar o Hyper-V para este perfil. Nenhuma alteração foi executada.');
          if(info.hyperV)desired[2]={exists:true,type:'String',value:'1.0'};
        }
      }
      return {...await change(desired,info,`apply:${verifiedPlan.profileIds.join(',')}`),profileIds:verifiedPlan.profileIds,reducedSecurity:verifiedPlan.reducedSecurity};
    });
  }
  async function restoreMitigation({id}={}){
    return exclusive(async()=>{
      const info=await system(true);
      const backup=await readBackup(id);
      if(backup.vendor!==info.vendor||(backup.computerName&&backup.computerName!==info.computerName))throw new Error('O backup pertence a outro computador ou fabricante.');
      return change(backup.values.map(v=>v.snapshot),info,`restore:${id}`);
    });
  }
  return {getMitigationStatus,applyMitigation,listMitigationBackups,restoreMitigation};
}
