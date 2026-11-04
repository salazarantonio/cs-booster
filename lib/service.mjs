import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { planMitigations } from './core/seguranca-avancada.mjs';
import { compareCaptures as compare } from './core/comparar-capturas.mjs';
import { createCleanupService } from './cleanup.mjs';
import { createDebloatService } from './debloat.mjs';
import { createMitigationService } from './mitigations.mjs';

const exec = promisify(execFile);
const USER = 'Software\\Microsoft\\Windows\\CurrentVersion';
const entry = (key,name,value,type='DWord') => ({hive:'CurrentUser',key,name,value,type});
export const TWEAKS = Object.freeze({
  'enable-dark-mode': [entry(`${USER}\\Themes\\Personalize`,'AppsUseLightTheme',0),entry(`${USER}\\Themes\\Personalize`,'SystemUsesLightTheme',0)],
  'align-taskbar-left': [entry(`${USER}\\Explorer\\Advanced`,'TaskbarAl',0)],
  'enable-end-task-right-click': [entry(`${USER}\\Explorer\\Advanced\\TaskbarDeveloperSettings`,'TaskbarEndTask',1)],
  'menu-show-delay-zero': [entry('Control Panel\\Desktop','MenuShowDelay','0','String')],
  'disable-mouse-acceleration': [entry('Control Panel\\Mouse','MouseSpeed','0','String'),entry('Control Panel\\Mouse','MouseThreshold1','0','String'),entry('Control Panel\\Mouse','MouseThreshold2','0','String')],
  'enable-game-mode': [entry('Software\\Microsoft\\GameBar','AutoGameModeEnabled',1)],
});

export async function runPowerShell(script) {
  if (process.platform !== 'win32') throw new Error('Recurso disponível somente no Windows.');
  const encoded=Buffer.from("$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new();"+script,'utf16le').toString('base64');
  const exe=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  try {
    const {stdout}=await exec(exe,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,timeout:25000,maxBuffer:2*1024*1024});
    return stdout.trim() ? JSON.parse(stdout.replace(/^\uFEFF/,'')) : null;
  } catch (error) {
    const detail=/<S S="Error">([^<]+)/.exec(error.stderr || '')?.[1]?.split('_x000D_')[0];
    throw new Error(detail || (error.killed ? 'A consulta do Windows excedeu o tempo limite.' : 'O Windows não permitiu concluir esta operação.'));
  }
}
const literal = value => `'${String(value).replaceAll("'","''")}'`;

export class WindowsRegistry {
  constructor(powershell=runPowerShell) { this.powershell=powershell; }
  async read(e) {
    const script=`$base=[Microsoft.Win32.Registry]::${e.hive};$k=$base.OpenSubKey(${literal(e.key)});try {if($null -eq $k -or $k.GetValueNames() -notcontains ${literal(e.name)}){@{exists=$false}|ConvertTo-Json -Compress}else{$type=$k.GetValueKind(${literal(e.name)}).ToString();if($type -notin @('DWord','String')){throw 'Tipo de registro não suportado para backup seguro'};@{exists=$true;type=$type;value=$k.GetValue(${literal(e.name)},$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}|ConvertTo-Json -Compress}}finally{if($k){$k.Dispose()}}`;
    return this.powershell(script);
  }
  async write(e,snapshot) {
    validateSnapshot(snapshot);
    const encoded=Buffer.from(JSON.stringify(snapshot),'utf8').toString('base64');
    return this.powershell(`$s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json;$base=[Microsoft.Win32.Registry]::${e.hive};if($s.exists){$k=$base.CreateSubKey(${literal(e.key)})}else{$k=$base.OpenSubKey(${literal(e.key)},$true)};try{if($k){if($s.exists){$v=if($s.type -eq 'DWord'){[int]$s.value}else{[string]$s.value};$k.SetValue(${literal(e.name)},$v,([Enum]::Parse([Microsoft.Win32.RegistryValueKind],[string]$s.type)))}else{$k.DeleteValue(${literal(e.name)},$false)}};@{ok=$true}|ConvertTo-Json -Compress}finally{if($k){$k.Dispose()}}`);
  }
}

function validateSnapshot(s) {
  if (!s || typeof s.exists!=='boolean') throw new Error('Backup inválido: existência ausente.');
  if (!s.exists) return;
  if (!['DWord','String'].includes(s.type)) throw new Error('Tipo de backup não suportado.');
  if (s.type==='String' && typeof s.value!=='string') throw new Error('Texto de backup inválido.');
  if (s.type==='DWord' && (!Number.isInteger(s.value)||s.value < -2147483648||s.value>2147483647)) throw new Error('DWORD de backup inválido.');
}
const snapshotEqual=(a,b)=>a.exists===b.exists && (!a.exists || (a.type===b.type && a.value===b.value));

export function createService(dataDir, {registry=new WindowsRegistry(),powershell=runPowerShell}={}) {
  dataDir=path.resolve(dataDir);
  const debloat = createDebloatService(dataDir,{powershell});
  const cleanup = createCleanupService(dataDir,{powershell});
  const mitigation = createMitigationService(path.join(process.env.ProgramData||'C:\\ProgramData','CSBooster'),{registry,powershell});
  const backupDir=path.join(dataDir,'backups');
  let queue=Promise.resolve();
  const exclusive=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  async function init(){await fs.mkdir(backupDir,{recursive:true});}
  async function save(name,value){await init();const dest=path.join(dataDir,name);const temp=dest+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2),'utf8');await fs.rename(temp,dest);}
  async function log(action,status,detail=''){await init();await fs.appendFile(path.join(dataDir,'actions.jsonl'),JSON.stringify({at:new Date().toISOString(),action,status,detail})+'\n');}
  async function getSettings(){try{return JSON.parse(await fs.readFile(path.join(dataDir,'settings.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {displayName:os.userInfo().username,language:'pt-BR'};}}
  async function setSettings(input){return exclusive(async()=>{if(!input||typeof input!=='object')throw new Error('Preferências inválidas.');const current=await getSettings();if('displayName'in input){if(typeof input.displayName!=='string'||input.displayName.length>80)throw new Error('Nome inválido.');current.displayName=input.displayName.trim()||os.userInfo().username;}await save('settings.json',current);return current;});}
  async function getCatalog(){const c=JSON.parse(await fs.readFile(new URL('./core/catalogo.json',import.meta.url),'utf8'));return {...c,tweaks:c.existingTweaks.map(t=>({...t,supported:!!TWEAKS[t.id]||t.id==='debloat-windows',status:TWEAKS[t.id]||t.id==='debloat-windows'?'available':'planned',reason:TWEAKS[t.id]||t.id==='debloat-windows'?null:'Executor ainda não validado nesta versão.'}))};}
  async function getTweakStates(){return Promise.all(Object.entries(TWEAKS).map(async([id,entries])=>{try{const values=await Promise.all(entries.map(e=>registry.read(e)));return {id,supported:true,enabled:entries.every((e,i)=>snapshotEqual(values[i],{exists:true,type:e.type,value:e.value})),values};}catch(e){return {id,supported:true,enabled:null,error:e.message};}}));}
  async function snapshot(id){const definitions=TWEAKS[id];if(!definitions)throw new Error('Ajuste não suportado.');return Promise.all(definitions.map(async e=>{const current=await registry.read(e);validateSnapshot(current);return {entry:{hive:e.hive,key:e.key,name:e.name},snapshot:current};}));}
  async function writeBackup(id,values,reason){await init();const backup={version:1,id:randomUUID(),tweakId:id,at:new Date().toISOString(),reason,values};await fs.writeFile(path.join(backupDir,backup.id+'.json'),JSON.stringify(backup,null,2),{flag:'wx'});return backup;}
  async function listBackups(){await init();const result=[];for(const name of await fs.readdir(backupDir)){if(!/^[0-9a-f-]{36}\.json$/.test(name))continue;try{const item=JSON.parse(await fs.readFile(path.join(backupDir,name),'utf8'));result.push({id:item.id,tweakId:item.tweakId,at:item.at,reason:item.reason});}catch{}}return result.sort((a,b)=>b.at.localeCompare(a.at));}
  async function readBackup(id){if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw new Error('Identificador de backup inválido.');const b=JSON.parse(await fs.readFile(path.join(backupDir,id+'.json'),'utf8'));const definitions=TWEAKS[b.tweakId];if(b.id!==id||b.version!==1||!definitions||!Array.isArray(b.values)||b.values.length!==definitions.length)throw new Error('Backup inválido.');b.values.forEach((v,i)=>{const e=definitions[i];if(v.entry.hive!==e.hive||v.entry.key!==e.key||v.entry.name!==e.name)throw new Error('Backup contém destino não autorizado.');validateSnapshot(v.snapshot);});return b;}
  async function applyEntries(id,values,action){const recovery=await writeBackup(id,await snapshot(id),action);try{for(let i=0;i<values.length;i++){await registry.write(TWEAKS[id][i],values[i]);const check=await registry.read(TWEAKS[id][i]);if(!snapshotEqual(check,values[i]))throw new Error('A verificação do registro não confirmou a alteração.');}await log(id,'success',action);return {ok:true,backupId:recovery.id,restartRequired:true,message:'Registro atualizado e verificado. Algumas alterações exigem sair da sessão ou reiniciar; o estado efetivo ainda depende do Windows.'};}catch(e){await log(id,'failed',e.message);throw new Error(`Alteração não concluída: ${e.message}. Backup para recuperação: ${recovery.id}`);}}
  async function applyTweak({id,enabled}={}){return exclusive(async()=>{if(!Object.hasOwn(TWEAKS,id)||typeof enabled!=='boolean')throw new Error('Ajuste ou estado não suportado.');if(!enabled){const backup=(await listBackups()).find(b=>b.tweakId===id&&b.reason==='apply');if(!backup)throw new Error('Não há estado anterior salvo. Use o Windows para escolher outro valor.');const b=await readBackup(backup.id);return applyEntries(id,b.values.map(v=>v.snapshot),'restore');}const desired=TWEAKS[id].map(e=>({exists:true,type:e.type,value:e.value}));const current=await snapshot(id);if(current.every((v,i)=>snapshotEqual(v.snapshot,desired[i])))return {ok:true,alreadyConfigured:true,message:'Este ajuste já está configurado. Nenhuma alteração executada.'};return applyEntries(id,desired,'apply');});}
  async function restoreBackup({id}={}){return exclusive(async()=>{const b=await readBackup(id);return applyEntries(b.tweakId,b.values.map(v=>v.snapshot),'restore');});}
  async function getDashboard(){const basic={platform:os.platform(),hostname:os.hostname(),cpu:os.cpus()[0]?.model||'Desconhecido',logicalProcessors:os.cpus().length,memoryTotal:os.totalmem(),memoryFree:os.freemem(),uptime:os.uptime(),osVersion:os.release(),supportedTweaks:Object.keys(TWEAKS).length};try{const info=await powershell(`$o=Get-CimInstance Win32_OperatingSystem;$b=Get-CimInstance Win32_BIOS;$v=@(Get-CimInstance Win32_VideoController|Select-Object Name,DriverVersion);$d=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3'|Select-Object DeviceID,Size,FreeSpace);@{windows=$o.Caption;build=$o.BuildNumber;bios=$b.SMBIOSBIOSVersion;gpu=$v;disks=$d}|ConvertTo-Json -Depth 5 -Compress`);return {...basic,...info};}catch(e){return {...basic,diagnosticError:e.message};}}
  async function getSteamInfo(){try{const info=await powershell(`$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Valve\\Steam');try{@{steamPath=if($k){$k.GetValue('SteamPath')}else{$null}}|ConvertTo-Json -Compress}finally{if($k){$k.Dispose()}}`);const root=info?.steamPath;if(!root)return {found:false,libraries:[],accounts:[]};const steamPath=path.resolve(root);const libraries=[steamPath];try{const vdf=await fs.readFile(path.join(steamPath,'steamapps','libraryfolders.vdf'),'utf8');for(const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)){const p=path.resolve(m[1].replaceAll('\\\\','\\'));if(!libraries.includes(p))libraries.push(p);}}catch{}const accounts=[];try{for(const name of await fs.readdir(path.join(steamPath,'userdata'))){if(/^\d+$/.test(name)){const config=path.join(steamPath,'userdata',name,'730');accounts.push({id:name,cs2ConfigPath:config,hasCs2Config:await fs.stat(config).then(s=>s.isDirectory(),()=>false)});}}}catch{}const games=[];for(const lib of libraries){try{const vdf=await fs.readFile(path.join(lib,'steamapps','appmanifest_730.acf'),'utf8');const name=/"installdir"\s+"([^"]+)"/.exec(vdf)?.[1];if(name&&!/[\\/]/.test(name))games.push({library:lib,path:path.join(lib,'steamapps','common',name),shaderCache:path.join(lib,'steamapps','shadercache','730')});}catch{}}return {found:true,steamPath,libraries,accounts,games,supported:true,mutationsSupported:false};}catch(e){return {found:false,error:e.message,libraries:[],accounts:[]};}}
  async function cleanCaches(input){const result=await cleanup.cleanCaches(input);try{await log('cleanup',result.ok?'success':'partial',JSON.stringify({ids:input?.ids,results:result.results}));}catch(e){return {...result,logError:e.message,message:result.message+' Não foi possível atualizar o log de ações.'};}return result;}
  async function getLogs(){await init();try{return (await fs.readFile(path.join(dataDir,'actions.jsonl'),'utf8')).trim().split('\n').filter(Boolean).slice(-100).map(line=>JSON.parse(line));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  return {getDashboard,getCatalog,getSettings,setSettings,getTweakStates,applyTweak,listBackups,restoreBackup,getCleanupPreview:cleanup.getCleanupPreview,cleanCaches,getSteamInfo,...debloat,...mitigation,planMitigation:input=>planMitigations(input),compareCaptures:({before,after})=>compare(before,after),getLogs};
}
