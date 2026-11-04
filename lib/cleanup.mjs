import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';

const DEFINITIONS = Object.freeze([
  {id:'directx',title:'Cache DirectX',description:'Cache de shaders DirectX da conta atual. Será recompilado pelos jogos.',group:'shaders'},
  {id:'nvidia-dx',title:'Cache NVIDIA DirectX',description:'Cache DirectX do driver NVIDIA da conta atual. Será recompilado quando necessário.',group:'shaders'},
  {id:'nvidia-gl',title:'Cache NVIDIA OpenGL',description:'Cache OpenGL do driver NVIDIA da conta atual. Será recompilado quando necessário.',group:'shaders'},
  {id:'temp',title:'Limpar arquivos temporários',description:'Arquivos temporários do usuário e do Windows. Arquivos em uso serão ignorados.'},
  {id:'prefetch',title:'Limpar arquivos Prefetch',description:'Cache Prefetch do Windows. Será recriado; a primeira abertura de programas pode ficar mais lenta.',requiresAdministrator:true},
  {id:'recyclebin',title:'Esvaziar Lixeira',description:'Remove definitivamente os itens da Lixeira da conta atual. Não pode ser desfeito.'},
  {id:'windows-update',title:'Limpar cache do Windows Update',description:'Somente SoftwareDistribution\\Download. Indisponível enquanto Windows Update ou BITS estiver ativo.',requiresAdministrator:true},
  {id:'thumbnails',title:'Limpar cache de miniaturas',description:'Somente thumbcache_*.db da conta atual. Arquivos bloqueados pelo Explorer serão ignorados.'},
]);
const ids=new Set(DEFINITIONS.map(d=>d.id));
const probeScript=`$i=[Security.Principal.WindowsIdentity]::GetCurrent();$p=[Security.Principal.WindowsPrincipal]::new($i);$drives=@([IO.DriveInfo]::GetDrives()|Where-Object {$_.DriveType -eq 'Fixed' -and $_.IsReady}|ForEach-Object {$_.RootDirectory.FullName});$update=$null;$bits=$null;try{$update=((Get-Service -Name wuauserv -ErrorAction Stop).Status -eq 'Running')}catch{};try{$bits=((Get-Service -Name BITS -ErrorAction Stop).Status -eq 'Running')}catch{};@{isAdministrator=$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);sid=$i.User.Value;drives=$drives;windowsUpdateRunning=$update;bitsRunning=$bits}|ConvertTo-Json -Compress`;

// All filesystem targets are built in the backend. Renderer input only selects IDs.
function targets(info,env) {
  const local=env.LOCALAPPDATA,win=env.SystemRoot||env.WINDIR;
  const root=(p,kind='tree',requiresAdministrator=false)=>({path:p,kind,requiresAdministrator});
  const canonical=value=>typeof value==='string'&&/^[A-Za-z]:\\/.test(value)&&path.win32.normalize(value)===value;
  const validLocal=canonical(local);
  const validWin=canonical(win);
  const items=DEFINITIONS.map(d=>({...d,roots:[],supported:true}));
  const byId=Object.fromEntries(items.map(i=>[i.id,i]));
  if(validLocal){byId.directx.roots.push(root(path.win32.join(local,'D3DSCache')));byId['nvidia-dx'].roots.push(root(path.win32.join(local,'NVIDIA','DXCache')));byId['nvidia-gl'].roots.push(root(path.win32.join(local,'NVIDIA','GLCache')));byId.temp.roots.push(root(path.win32.join(local,'Temp')));byId.thumbnails.roots.push(root(path.win32.join(local,'Microsoft','Windows','Explorer'),'thumbnails'));}
  if(validWin){byId.temp.roots.push(root(path.win32.join(win,'Temp'),'tree',true));byId.prefetch.roots.push(root(path.win32.join(win,'Prefetch'),'tree',true));byId['windows-update'].roots.push(root(path.win32.join(win,'SoftwareDistribution','Download'),'tree',true));}
  if(/^S-1-5-21-(?:\d+-){2}\d+-\d+$/.test(info.sid||'')&&Array.isArray(info.drives)){
    for(const drive of info.drives){if(typeof drive==='string'&&/^[a-z]:\\$/i.test(drive))byId.recyclebin.roots.push(root(path.win32.join(drive,'$Recycle.Bin',info.sid),'recyclebin'));}
  }
  for(const item of items){
    const requires=item.roots.filter(r=>r.requiresAdministrator&&!info.isAdministrator);
    item.roots=item.roots.filter(r=>!r.requiresAdministrator||info.isAdministrator);
    if(requires.length)item.reason=item.id==='temp'?'A pasta Temp do Windows exige administrador; apenas a pasta do usuário será considerada.':'Abra o CS Booster como administrador.';
    if(item.id==='windows-update'&&(info.windowsUpdateRunning!==false||info.bitsRunning!==false)){item.roots=[];item.reason='Windows Update/BITS ativo ou estado não verificado. A aplicação não para serviços.';}
    if(!item.roots.length){item.supported=false;item.reason||='Não foi possível identificar um destino autorizado.';}
  }
  return items;
}

// Native scanner does not follow reparse points. It constructs a finite manifest
// before deletion, then revalidates every ancestry immediately before each action.
// File.Delete and Directory.Delete(path,false) are used; never recursive deletion.
// As with any path-based Win32 operation, validation/deletion is not atomic against
// a hostile concurrent directory rename; failures are reported, not hidden.
const nativeTemplate=String.raw`
$request=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__PAYLOAD__'))|ConvertFrom-Json
$watch=[Diagnostics.Stopwatch]::StartNew()
$result=[ordered]@{id=$request.id;status='completed';bytes=[long]0;fileCount=0;deletedBytes=[long]0;deletedFiles=0;skipped=0;errors=[Collections.Generic.List[string]]::new();bounded=$false;unknownOutcome=$false}
$limit=20000;$maxDepth=32;$script:count=0
$script:updateControllers=$null
$checkpointStream=$null
if($request.execute -and $request.checkpoint){$checkpointStream=[IO.FileStream]::new([string]$request.checkpoint,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)}
function Error-Note([string]$message){if($result.errors.Count -lt 12){$result.errors.Add($message)}}
function Deadline{if($watch.Elapsed.TotalSeconds -gt 12){throw 'Limite de tempo da operação atingido.'}}
function Check-Update{
  if($request.id -ne 'windows-update'){return}
  if($null -eq $script:updateControllers){$script:updateControllers=@(Get-Service -Name @('wuauserv','BITS') -ErrorAction Stop)}
  if($script:updateControllers.Count -ne 2){throw 'Estado do Windows Update/BITS não verificado.'}
  foreach($service in $script:updateControllers){$service.Refresh();if($service.Status -ne 'Stopped'){throw 'Windows Update/BITS ativo. A limpeza foi interrompida sem parar serviços.'}}
}
function Checked-Path([string]$p){
  Deadline
  $full=[IO.Path]::GetFullPath($p)
  if($full.StartsWith('\') -or ($full -ne $script:root -and -not $full.StartsWith($script:root+'\',[StringComparison]::OrdinalIgnoreCase))){throw 'Destino fora da pasta autorizada.'}
  $current=$full
  while($current){
    $attributes=[IO.File]::GetAttributes($current)
    if(($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Link, junction ou ponto de redirecionamento recusado.'}
    $parent=[IO.Directory]::GetParent($current)
    $current=if($parent){$parent.FullName}else{$null}
  }
  return $full
}
function Scan-Node([string]$p,[int]$depth,[string]$group){
  Deadline
  $script:count++
  if($script:count -gt $limit -or $depth -gt $maxDepth){$result.bounded=$true;throw 'Inventário excedeu o limite de entradas ou profundidade.'}
  $full=Checked-Path $p
  $attrs=[IO.File]::GetAttributes($full)
  if(($attrs -band [IO.FileAttributes]::Directory) -ne 0){
    $script:dirs.Add([pscustomobject]@{path=$full;group=$group})
    foreach($child in [IO.Directory]::EnumerateFileSystemEntries($full)){Scan-Node $child ($depth+1) $group}
  }else{
    $item=[IO.FileInfo]::new($full)
    $script:files.Add([pscustomobject]@{path=$full;size=[long]$item.Length;group=$group})
  }
}
function Checkpoint{
  if($checkpointStream){$json=$result|ConvertTo-Json -Depth 6 -Compress;$bytes=[Text.UTF8Encoding]::new($false).GetBytes($json);$checkpointStream.Position=0;$checkpointStream.SetLength(0);$checkpointStream.Write($bytes,0,$bytes.Length);$checkpointStream.Flush()}
}
foreach($target in $request.roots){
  $script:root=[IO.Path]::GetFullPath([string]$target.path).TrimEnd([char]'\')
  $script:files=[Collections.Generic.List[object]]::new();$script:dirs=[Collections.Generic.List[object]]::new();$metadata=[Collections.Generic.List[object]]::new()
  try{
    Check-Update
    if($script:root -eq [IO.Path]::GetPathRoot($script:root).TrimEnd([char]'\')){throw 'A raiz de um volume nunca é um destino permitido.'}
    if(-not [IO.Directory]::Exists($script:root)){
      try{[void][IO.File]::GetAttributes($script:root)}catch [IO.FileNotFoundException]{continue}catch [IO.DirectoryNotFoundException]{continue}
      throw 'Destino ausente, inacessível ou não é uma pasta.'
    }
    [void](Checked-Path $script:root)
    foreach($child in [IO.Directory]::EnumerateFileSystemEntries($script:root)){
      Deadline;$script:count++;if($script:count -gt $limit){$result.bounded=$true;throw 'Inventário excedeu o limite de entradas.'}
      if($target.kind -eq 'thumbnails'){
        $script:count++;if($script:count -gt $limit){$result.bounded=$true;throw 'Inventário excedeu o limite de entradas.'}
        if([IO.Path]::GetFileName($child) -notlike 'thumbcache_*.db'){continue}
        $full=Checked-Path $child
        if(([IO.File]::GetAttributes($full) -band [IO.FileAttributes]::Directory) -ne 0){continue}
        Scan-Node $full 0 ''
      }elseif($target.kind -eq 'recyclebin'){
        if([IO.Path]::GetFileName($child) -notmatch '^\$R'){continue}
        Scan-Node $child 0 $child
        $name=[IO.Path]::GetFileName($child);$meta=[IO.Path]::Combine($script:root,('$I'+$name.Substring(2)))
        if([IO.File]::Exists($meta)){$full=Checked-Path $meta;$metadata.Add([pscustomobject]@{path=$full;size=[long]([IO.FileInfo]::new($full)).Length;group=$child})}
      }else{Scan-Node $child 0 ''}
    }
    foreach($file in $script:files){$result.bytes+=$file.size;$result.fileCount++}
    foreach($file in $metadata){$result.bytes+=$file.size;$result.fileCount++}
  }catch{
    $result.skipped++;$result.status='partial';Error-Note $_.Exception.Message
    if($watch.Elapsed.TotalSeconds -gt 12){break}else{continue}
  }
  if(-not $request.execute){continue}
  $failedGroups=[Collections.Generic.HashSet[string]]::new()
  foreach($file in $script:files){
    try{
      Check-Update
      $full=Checked-Path $file.path
      if(([IO.File]::GetAttributes($full) -band [IO.FileAttributes]::Directory) -ne 0){throw 'O arquivo mudou de tipo após a prévia.'}
      $size=[long]([IO.FileInfo]::new($full)).Length
      [IO.File]::Delete($full)
      $result.deletedBytes+=$size;$result.deletedFiles++;Checkpoint
    }catch{$result.skipped++;$result.status='partial';if($file.group){[void]$failedGroups.Add([string]$file.group)};Error-Note $_.Exception.Message}
    if($watch.Elapsed.TotalSeconds -gt 12){$result.bounded=$true;break}
  }
  foreach($dir in ($script:dirs|Sort-Object {$_.path.Length} -Descending)){
    try{Check-Update;$full=Checked-Path $dir.path;[IO.Directory]::Delete($full,$false)}catch{$result.skipped++;$result.status='partial';if($dir.group){[void]$failedGroups.Add([string]$dir.group)};Error-Note $_.Exception.Message}
    if($watch.Elapsed.TotalSeconds -gt 12){$result.bounded=$true;break}
  }
  foreach($file in $metadata){
    if($failedGroups.Contains([string]$file.group)){$result.skipped++;$result.status='partial';continue}
    try{
      if([IO.File]::Exists([string]$file.group) -or [IO.Directory]::Exists([string]$file.group)){throw 'O conteúdo da Lixeira permaneceu; metadados preservados.'}
      $full=Checked-Path $file.path;$size=[long]([IO.FileInfo]::new($full)).Length;[IO.File]::Delete($full);$result.deletedBytes+=$size;$result.deletedFiles++;Checkpoint
    }catch{$result.skipped++;$result.status='partial';Error-Note $_.Exception.Message}
  }
  if($watch.Elapsed.TotalSeconds -gt 12){$result.bounded=$true;$result.status='partial';break}
}
Checkpoint
if($checkpointStream){$checkpointStream.Dispose()}
$result|ConvertTo-Json -Depth 6 -Compress
`;

export function buildCleanupScript(request){
  const payload=Buffer.from(JSON.stringify(request),'utf8').toString('base64');
  return nativeTemplate.replace('__PAYLOAD__',payload);
}

function validateResult(raw,id){
  if(!raw||raw.id!==id||!['completed','partial','skipped','failed'].includes(raw.status))throw new Error('Resposta de limpeza inválida.');
  for(const key of ['bytes','fileCount','deletedBytes','deletedFiles','skipped'])if(!Number.isFinite(raw[key])||raw[key]<0)throw new Error('Contagem de limpeza inválida.');
  if(!Array.isArray(raw.errors)||raw.errors.some(v=>typeof v!=='string'))throw new Error('Relatório de erros inválido.');
  return raw;
}

export function createCleanupService(dataDir,{powershell,environment=process.env}={}){
  if(typeof powershell!=='function')throw new Error('Consulta do Windows indisponível.');
  const statePath=path.join(path.resolve(dataDir),'cleanup-state.json');
  let running=false;
  async function readState(){try{return JSON.parse(await fs.readFile(statePath,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
  async function saveState(state){await fs.mkdir(path.dirname(statePath),{recursive:true});const tmp=statePath+'.tmp';await fs.writeFile(tmp,JSON.stringify(state,null,2),'utf8');await fs.rename(tmp,statePath);}
  async function getTargets(){const info=await powershell(probeScript);if(!info||typeof info.isAdministrator!=='boolean')throw new Error('Não foi possível verificar permissões do Windows.');return targets(info,environment);}
  async function getCleanupPreview(){
    const state=await readState();let items;
    try{items=await getTargets();}catch(e){return {supported:false,items:DEFINITIONS.map(d=>({...d,supported:false,reason:e.message})),lastAttemptedAt:state.lastAttemptedAt,lastCleanupAt:state.lastCleanupAt};}
    const output=[];
    for(const item of items){
      if(!item.supported){output.push(item);continue;}
      try{const raw=validateResult(await powershell(buildCleanupScript({id:item.id,roots:item.roots,execute:false})),item.id);output.push({...item,bytes:raw.bytes,fileCount:raw.fileCount,bounded:raw.bounded,reason:[item.reason,...raw.errors].filter(Boolean).join(' '),supported:raw.status==='completed'});}catch(e){output.push({...item,supported:false,reason:e.message});}
    }
    return {supported:output.some(i=>i.supported),items:output,lastAttemptedAt:state.lastAttemptedAt,lastCleanupAt:state.lastCleanupAt};
  }
  async function cleanCaches({ids:selected,confirmed,confirmRecycleBin}={}){
    if(!Array.isArray(selected)||!selected.length||selected.length>DEFINITIONS.length||selected.some(id=>!ids.has(id))||new Set(selected).size!==selected.length)throw new Error('Selecione somente ações de limpeza conhecidas, sem duplicação.');
    if(confirmed!==true)throw new Error('Confirme a exclusão permanente dos arquivos selecionados.');
    if(selected.includes('recyclebin')&&confirmRecycleBin!==true)throw new Error('Confirme separadamente o esvaziamento irreversível da Lixeira.');
    if(running)throw new Error('Já existe uma limpeza em andamento. Aguarde a conclusão.');
    running=true;
    try{
      const state=await readState();state.lastAttemptedAt=new Date().toISOString();state.results=[];await saveState(state);
      let items;try{items=await getTargets();}catch(e){state.results=selected.map(id=>({id,status:'failed',deletedBytes:0,deletedFiles:0,skipped:1,errors:[`Nenhuma exclusão iniciada: ${e.message}`]}));await saveState(state);return {ok:false,partial:true,results:state.results,lastAttemptedAt:state.lastAttemptedAt,lastCleanupAt:state.lastCleanupAt,message:'Não foi possível verificar os destinos. Nenhuma exclusão iniciada.'};}
      for(const id of selected){
        const item=items.find(i=>i.id===id);
        if(!item.supported){state.results.push({id,status:'skipped',deletedBytes:0,deletedFiles:0,skipped:1,errors:[item.reason]});await saveState(state);continue;}
        const checkpoint=path.join(path.dirname(statePath),`cleanup-progress-${randomUUID()}.json`);
        try{
          const result=validateResult(await powershell(buildCleanupScript({id,roots:item.roots,execute:true,checkpoint})),id);
          state.results.push(result);
        }catch(e){
          let partial;try{partial=validateResult(JSON.parse(await fs.readFile(checkpoint,'utf8')),id);}catch{}
          state.results.push({...partial,id,status:partial?'partial':'failed',unknownOutcome:true,deletedBytes:partial?.deletedBytes??null,deletedFiles:partial?.deletedFiles??null,skipped:partial?.skipped??null,errors:[...(partial?.errors||[]),`Execução interrompida: ${e.message}. Contagens são apenas as operações confirmadas; o resultado final pode estar incompleto.`]});
        }finally{await fs.unlink(checkpoint).catch(()=>{});}
        await saveState(state);
      }
      const allCompleted=state.results.every(r=>r.status==='completed');
      if(allCompleted)state.lastCleanupAt=new Date().toISOString();
      await saveState(state);
      return {ok:allCompleted,partial:!allCompleted,results:state.results,lastAttemptedAt:state.lastAttemptedAt,lastCleanupAt:state.lastCleanupAt,message:allCompleted?'Limpeza concluída. As exclusões são permanentes.':'Limpeza com itens ignorados, falhas ou resultado incompleto. Confira o relatório por ação.'};
    }finally{running=false;}
  }
  return {getCleanupPreview,cleanCaches};
}
