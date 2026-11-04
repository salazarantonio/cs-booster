import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildCleanupScript, createCleanupService } from './cleanup.mjs';

const exec=promisify(execFile);
const windows=process.platform==='win32';
const info={isAdministrator:true,sid:'S-1-5-21-111-222-333-1001',drives:['C:\\'],windowsUpdateRunning:false,bitsRunning:false};
const environment={LOCALAPPDATA:'C:\\Users\\Fixture\\AppData\\Local',SystemRoot:'C:\\Windows'};
function decode(script){const match=/FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script);return match?JSON.parse(Buffer.from(match[1],'base64').toString('utf8')):null;}
function result(id,extra={}){return {id,status:'completed',bytes:0,fileCount:0,deletedBytes:0,deletedFiles:0,skipped:0,errors:[],bounded:false,...extra};}
async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'csb-cleanup-fixture-'));
  assert.ok(path.resolve(dir).startsWith(path.join(path.resolve(os.tmpdir()),'csb-cleanup-fixture-')));
  t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.join(path.resolve(os.tmpdir()),'csb-cleanup-fixture-')));await fs.rm(dir,{recursive:true,force:true});});
  return dir;
}
async function native(script){
  const encoded=Buffer.from("$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new();"+script,'utf16le').toString('base64');
  const {stdout}=await exec(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,timeout:24000,maxBuffer:1024*1024});
  return JSON.parse(stdout.trim());
}
async function runFixture(root,kind='tree',execute=true,prefix='',suffix=''){
  // Only explicitly-created isolated fixture paths reach native deletion tests.
  assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()),'csb-cleanup-fixture-')));
  return native(prefix+buildCleanupScript({id:'fixture',roots:[{path:root,kind}],execute})+suffix);
}

test('known IDs and explicit confirmations are required before OS inspection',async t=>{
  const dir=await fixture(t);let calls=0;const service=createCleanupService(dir,{environment,powershell:async()=>{calls++;return info;}});
  await assert.rejects(service.cleanCaches({ids:['directx'],confirmed:true}),/conhecidas/);
  await assert.rejects(service.cleanCaches({ids:['temp']}),/Confirme/);
  await assert.rejects(service.cleanCaches({ids:['recyclebin'],confirmed:true}),/separadamente/);
  await assert.rejects(service.cleanCaches({ids:['temp','temp'],confirmed:true}),/duplicação/);
  assert.equal(calls,0);
});
test('preview exposes five fixed actions and honors admin and active-update gates',async t=>{
  const dir=await fixture(t);const requests=[];
  const service=createCleanupService(dir,{environment,powershell:async script=>{const req=decode(script);if(!req)return {...info,isAdministrator:false,windowsUpdateRunning:true};requests.push(req);return result(req.id);}});
  const preview=await service.getCleanupPreview();
  assert.deepEqual(preview.items.map(i=>i.id),['temp','prefetch','recyclebin','windows-update','thumbnails']);
  assert.equal(preview.items.find(i=>i.id==='prefetch').supported,false);
  assert.equal(preview.items.find(i=>i.id==='windows-update').supported,false);
  assert.deepEqual(requests.find(r=>r.id==='temp').roots.map(r=>r.path),['C:\\Users\\Fixture\\AppData\\Local\\Temp']);
  assert.equal(requests.every(r=>r.execute===false),true);
  assert.equal(requests.find(r=>r.id==='recyclebin').roots[0].path,'C:\\$Recycle.Bin\\'+info.sid);
});
test('root-relative and noncanonical environment paths are not accepted as cleanup roots',async t=>{
  const dir=await fixture(t);const requests=[];
  const service=createCleanupService(dir,{environment:{LOCALAPPDATA:'\\relative',SystemRoot:'C:\\Windows\\..\\Other'},powershell:async script=>{const req=decode(script);if(!req)return info;requests.push(req);return result(req.id);}});
  const preview=await service.getCleanupPreview();
  for(const id of ['temp','prefetch','windows-update','thumbnails'])assert.equal(preview.items.find(i=>i.id===id).supported,false);
  assert.deepEqual(requests.map(r=>r.id),['recyclebin']);
});
test('isolated native tree fixture preview is read-only then deletes exact bytes without deleting root',{skip:!windows},async t=>{
  const root=await fixture(t);await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'a.tmp'),'abc');await fs.writeFile(path.join(root,'nested','b.tmp'),'12345');
  const preview=await runFixture(root,'tree',false);assert.equal(preview.bytes,8);assert.equal(preview.fileCount,2);assert.equal(preview.deletedFiles,0);assert.equal(await fs.readFile(path.join(root,'a.tmp'),'utf8'),'abc');
  const outcome=await runFixture(root);assert.equal(outcome.status,'completed');assert.equal(outcome.deletedBytes,8);assert.equal(outcome.deletedFiles,2);assert.equal((await fs.stat(root)).isDirectory(),true);assert.deepEqual(await fs.readdir(root),[]);
});
test('isolated native fixture writes durable per-file checkpoint using a nonreplaceable open handle',{skip:!windows},async t=>{
  const base=await fixture(t);const root=path.join(base,'target');await fs.mkdir(root);await fs.writeFile(path.join(root,'a.tmp'),'12345');
  const checkpoint=path.join(base,'checkpoint.json');const request={id:'fixture',roots:[{path:root,kind:'tree'}],execute:true,checkpoint};
  const r=await native(buildCleanupScript(request));assert.equal(r.deletedBytes,5);const saved=JSON.parse(await fs.readFile(checkpoint,'utf8'));assert.equal(saved.deletedFiles,1);assert.equal(saved.deletedBytes,5);
});
test('native fixture refuses unknown Windows Update state before traversal',{skip:!windows},async t=>{
  const root=await fixture(t);await fs.writeFile(path.join(root,'keep.tmp'),'keep');
  const prefix="function Get-Service { throw 'simulated service query failure' };\n";
  const r=await native(prefix+buildCleanupScript({id:'windows-update',roots:[{path:root,kind:'tree'}],execute:true}));
  assert.equal(r.status,'partial');assert.equal(r.deletedFiles,0);assert.equal(await fs.readFile(path.join(root,'keep.tmp'),'utf8'),'keep');
});
test('native fixture refreshes update service state again before deletion',{skip:!windows},async t=>{
  const root=await fixture(t);await fs.writeFile(path.join(root,'keep.tmp'),'keep');
  const prefix=`function Get-Service { foreach($name in @('wuauserv','BITS')){$s=[pscustomobject]@{Status='Stopped';Calls=0};$s|Add-Member -MemberType ScriptMethod -Name Refresh -Value {$this.Calls++;if($this.Calls -gt 1){$this.Status='Running'}};$s} };\n`;
  const r=await native(prefix+buildCleanupScript({id:'windows-update',roots:[{path:root,kind:'tree'}],execute:true}));
  assert.equal(r.status,'partial');assert.equal(r.deletedFiles,0);assert.equal(await fs.readFile(path.join(root,'keep.tmp'),'utf8'),'keep');
});
test('isolated thumbnail fixture only removes matching top-level files',{skip:!windows},async t=>{
  const root=await fixture(t);await fs.writeFile(path.join(root,'thumbcache_32.db'),'123');await fs.writeFile(path.join(root,'iconcache_32.db'),'safe');await fs.writeFile(path.join(root,'thumbcache_32.db.bak'),'safe');await fs.mkdir(path.join(root,'thumbcache_folder.db'));await fs.writeFile(path.join(root,'thumbcache_folder.db','keep.txt'),'safe');
  const r=await runFixture(root,'thumbnails');assert.equal(r.deletedBytes,3);assert.equal(r.deletedFiles,1);assert.equal(await fs.readFile(path.join(root,'iconcache_32.db'),'utf8'),'safe');assert.equal(await fs.readFile(path.join(root,'thumbcache_folder.db','keep.txt'),'utf8'),'safe');
});
test('isolated recycle fixture preserves unrelated entries and removes payload before paired metadata',{skip:!windows},async t=>{
  const root=await fixture(t);for(const[name,content]of [['$R123','abc'],['$I123','meta'],['desktop.ini','keep'],['$Iorphan','keep']])await fs.writeFile(path.join(root,name),content);
  await fs.mkdir(path.join(root,'$R456'));await fs.writeFile(path.join(root,'$R456','a'),'12');await fs.writeFile(path.join(root,'$I456'),'meta');
  const r=await runFixture(root,'recyclebin');assert.equal(r.status,'completed');assert.equal(r.deletedFiles,4);assert.equal(r.deletedBytes,13);assert.deepEqual((await fs.readdir(root)).sort(),['$Iorphan','desktop.ini']);
});
test('isolated junction fixture is refused before deleting any file in that root',{skip:!windows},async t=>{
  const base=await fixture(t);const root=path.join(base,'target'),outside=path.join(base,'outside');await fs.mkdir(root);await fs.mkdir(outside);await fs.writeFile(path.join(root,'a.tmp'),'keep');await fs.writeFile(path.join(outside,'protected.txt'),'keep');try{await fs.symlink(outside,path.join(root,'junction'),'junction');}catch(e){if(['EPERM','EACCES'].includes(e.code)){t.skip('O ambiente bloqueia criação de junctions nas pastas temporárias de teste.');return;}throw e;}
  const r=await runFixture(root);assert.equal(r.status,'partial');assert.equal(r.deletedFiles,0);assert.equal(await fs.readFile(path.join(root,'a.tmp'),'utf8'),'keep');assert.equal(await fs.readFile(path.join(outside,'protected.txt'),'utf8'),'keep');
});
test('isolated locked-file fixture reports skip and preserves paired recycle metadata',{skip:!windows},async t=>{
  const root=await fixture(t);const locked=path.join(root,'$Rlocked');await fs.writeFile(locked,'locked');await fs.writeFile(path.join(root,'$Ilocked'),'meta');await fs.writeFile(path.join(root,'$Rfree'),'free');await fs.writeFile(path.join(root,'$Ifree'),'meta');
  const literal="'"+locked.replaceAll("'","''")+"'";
  const prefix=`$lock=[IO.File]::Open(${literal},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{\n`;
  const r=await runFixture(root,'recyclebin',true,prefix,'\n}finally{$lock.Dispose()}');
  assert.equal(r.status,'partial');assert.equal(r.deletedBytes,8);assert.equal(r.deletedFiles,2);assert.ok(r.skipped>=2);assert.equal(await fs.readFile(path.join(root,'$Rlocked'),'utf8'),'locked');assert.equal(await fs.readFile(path.join(root,'$Ilocked'),'utf8'),'meta');
});
test('isolated deep fixture hits bound without starting deletion',{skip:!windows},async t=>{
  const root=await fixture(t);await fs.writeFile(path.join(root,'safe.tmp'),'keep');let p=root;for(let i=0;i<35;i++){p=path.join(p,'d');await fs.mkdir(p);}await fs.writeFile(path.join(p,'deep'),'keep');const r=await runFixture(root);assert.equal(r.bounded,true);assert.equal(r.deletedFiles,0);assert.equal(await fs.readFile(path.join(root,'safe.tmp'),'utf8'),'keep');
});
test('timeout preserves confirmed checkpoint counts and last-attempt timestamp without success',async t=>{
  const dir=await fixture(t);const service=createCleanupService(dir,{environment,powershell:async script=>{const req=decode(script);if(!req)return info;await fs.writeFile(req.checkpoint,JSON.stringify(result(req.id,{deletedFiles:1,deletedBytes:7})));throw new Error('timeout');}});
  const r=await service.cleanCaches({ids:['temp'],confirmed:true});assert.equal(r.ok,false);assert.equal(r.partial,true);assert.equal(r.results[0].unknownOutcome,true);assert.equal(r.results[0].deletedBytes,7);assert.equal(r.lastCleanupAt,undefined);assert.ok(r.lastAttemptedAt);
  const state=JSON.parse(await fs.readFile(path.join(dir,'cleanup-state.json'),'utf8'));assert.equal(state.results[0].deletedFiles,1);
});
test('interrupted operation without checkpoint never reports fictitious zero bytes',async t=>{
  const dir=await fixture(t);const service=createCleanupService(dir,{environment,powershell:async script=>{if(!decode(script))return info;throw new Error('process killed');}});
  const r=await service.cleanCaches({ids:['temp'],confirmed:true});assert.equal(r.results[0].deletedBytes,null);assert.equal(r.results[0].deletedFiles,null);assert.equal(r.results[0].status,'failed');
});
test('failed OS probe persists attempted timestamp and reports that deletion did not start',async t=>{
  const dir=await fixture(t);const service=createCleanupService(dir,{environment,powershell:async()=>{throw new Error('permission denied');}});
  const r=await service.cleanCaches({ids:['temp'],confirmed:true});assert.equal(r.ok,false);assert.ok(r.lastAttemptedAt);assert.equal(r.lastCleanupAt,undefined);assert.equal(r.results[0].deletedBytes,0);assert.match(r.results[0].errors[0],/Nenhuma exclusão iniciada/);
  const state=JSON.parse(await fs.readFile(path.join(dir,'cleanup-state.json'),'utf8'));assert.equal(state.lastAttemptedAt,r.lastAttemptedAt);
});
test('runs cannot overlap and completed timestamp is persisted only for completed actions',async t=>{
  const dir=await fixture(t);let entered;const waiting=new Promise(r=>{entered=r;});let release;const hold=new Promise(r=>{release=r;});
  const service=createCleanupService(dir,{environment,powershell:async script=>{const req=decode(script);if(!req)return info;entered();await hold;return result(req.id,{deletedFiles:1,deletedBytes:4});}});
  const first=service.cleanCaches({ids:['temp'],confirmed:true});await waiting;await assert.rejects(service.cleanCaches({ids:['thumbnails'],confirmed:true}),/andamento/);release();const r=await first;assert.equal(r.ok,true);assert.ok(r.lastCleanupAt);const state=JSON.parse(await fs.readFile(path.join(dir,'cleanup-state.json'),'utf8'));assert.equal(state.lastCleanupAt,r.lastCleanupAt);
});
