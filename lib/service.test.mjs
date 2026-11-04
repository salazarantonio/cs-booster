import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createService, TWEAKS, WindowsRegistry } from './service.mjs';

function mockRegistry() {
  const data=new Map(); let writes=0;
  const key=e=>`${e.hive}|${e.key}|${e.name}`;
  return {data,get writes(){return writes;},read:async e=>structuredClone(data.get(key(e))||{exists:false}),write:async(e,s)=>{writes++;data.set(key(e),structuredClone(s));},seed(e,s){data.set(key(e),structuredClone(s));}};
}
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cs-booster-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const registry=mockRegistry();const service=createService(dir,{registry,powershell:async()=>({})});return {dir,registry,service};}
test('rejects unlisted tweaks and nonboolean states before any write',async t=>{const{service,registry}=await fixture(t);await assert.rejects(service.applyTweak({id:'disable-defender-rtp',enabled:true}));await assert.rejects(service.applyTweak({id:'enable-dark-mode',enabled:'yes'}));assert.equal(registry.writes,0);});
test('backup restores absent value and original nondefault DWORD exactly',async t=>{const{service,registry}=await fixture(t);const defs=TWEAKS['enable-dark-mode'];registry.seed(defs[0],{exists:true,type:'DWord',value:7});const result=await service.applyTweak({id:'enable-dark-mode',enabled:true});assert.equal(result.ok,true);assert.equal((await registry.read(defs[0])).value,0);await service.restoreBackup({id:result.backupId});assert.deepEqual(await registry.read(defs[0]),{exists:true,type:'DWord',value:7});assert.deepEqual(await registry.read(defs[1]),{exists:false});});
test('preserves String kind and value when restoring menu delay',async t=>{const{service,registry}=await fixture(t);const def=TWEAKS['menu-show-delay-zero'][0];registry.seed(def,{exists:true,type:'String',value:'275'});await service.applyTweak({id:'menu-show-delay-zero',enabled:true});await service.applyTweak({id:'menu-show-delay-zero',enabled:false});assert.deepEqual(await registry.read(def),{exists:true,type:'String',value:'275'});});
test('repeated enable never replaces original backup with optimized values',async t=>{const{service,registry}=await fixture(t);const def=TWEAKS['align-taskbar-left'][0];registry.seed(def,{exists:true,type:'DWord',value:1});await service.applyTweak({id:'align-taskbar-left',enabled:true});const second=await service.applyTweak({id:'align-taskbar-left',enabled:true});assert.equal(second.alreadyConfigured,true);assert.equal((await service.listBackups()).length,1);await service.applyTweak({id:'align-taskbar-left',enabled:false});assert.equal((await registry.read(def)).value,1);});
test('tampered backup cannot choose registry paths',async t=>{const{service,registry,dir}=await fixture(t);const result=await service.applyTweak({id:'align-taskbar-left',enabled:true});const file=path.join(dir,'backups',result.backupId+'.json');const backup=JSON.parse(await fs.readFile(file,'utf8'));backup.values[0].entry.key='Unauthorized';await fs.writeFile(file,JSON.stringify(backup));const before=registry.writes;await assert.rejects(service.restoreBackup({id:result.backupId}),/não autorizado/);assert.equal(registry.writes,before);await assert.rejects(service.restoreBackup({id:'../../test'}));});
test('failed write reports failure while leaving recovery backup',async t=>{const{service,registry}=await fixture(t);registry.write=async()=>{throw new Error('access denied');};await assert.rejects(service.applyTweak({id:'align-taskbar-left',enabled:true}),/não concluída/);assert.equal((await service.listBackups()).length,1);assert.equal((await service.getLogs()).at(-1).status,'failed');});
test('cleanup rejects unknown actions and missing confirmation; settings accept only profile name',async t=>{const{service}=await fixture(t);await assert.rejects(service.cleanCaches({ids:['unknown-cache']}));await assert.rejects(service.cleanCaches({ids:['temp']}),/Confirme/);const settings=await service.setSettings({displayName:'CS Player',execute:'anything'});assert.equal(settings.displayName,'CS Player');assert.equal(settings.execute,undefined);});

test('batched registry query sends all nine fixed destinations in exactly one PowerShell call',async()=>{
  const entries=Object.values(TWEAKS).flat();let calls=0;let received;
  const registry=new WindowsRegistry(async script=>{
    calls++;
    const encoded=/FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)?.[1];
    received=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    assert.match(script,/Registry\]::CurrentUser/);
    assert.doesNotMatch(script,/SetValue|DeleteValue|CreateSubKey/);
    return {items:entries.map((e,index)=>({index,snapshot:{exists:true,type:e.type,value:e.value}}))};
  });
  const snapshots=await registry.readMany(entries);
  assert.equal(entries.length,9);assert.equal(calls,1);
  assert.deepEqual(received,entries.map(({key,name})=>({key,name})));
  assert.deepEqual(snapshots,entries.map(e=>({exists:true,type:e.type,value:e.value})));
});
test('native Windows read-only batch preserves all input entries across JSON decoding',{skip:process.platform!=='win32'},async()=>{
  const entries=Object.values(TWEAKS).flat();
  const values=await new WindowsRegistry().readMany(entries);
  assert.equal(values.length,9);
  for(const value of values)assert.equal(typeof value.error==='string'||typeof value.exists==='boolean',true);
});
test('batched registry query rejects unauthorized destinations before invoking PowerShell',async()=>{
  let calls=0;const registry=new WindowsRegistry(async()=>{calls++;return null;});
  for(const entries of [[{...TWEAKS['enable-dark-mode'][0],hive:'LocalMachine'}],[{hive:'CurrentUser',key:"Anything';throw 'injected",name:'X'}],null])await assert.rejects(registry.readMany(entries),/não autorizado/);
  assert.deepEqual(await registry.readMany([]),[]);assert.equal(calls,0);
});
test('batched registry response requires complete ordered indices and validates individual snapshot types',async()=>{
  const entries=TWEAKS['enable-dark-mode'];
  for(const items of [[],[{index:0,snapshot:{exists:false}}],[{index:1,snapshot:{exists:false}},{index:0,snapshot:{exists:false}}]]){
    const registry=new WindowsRegistry(async()=>({items}));await assert.rejects(registry.readMany(entries),/incompleta ou inválida/);
  }
  const registry=new WindowsRegistry(async()=>({items:[{index:0,snapshot:{exists:false}},{index:1,snapshot:{exists:true,type:'Binary',value:[]}}]}));
  const rows=await registry.readMany(entries);assert.deepEqual(rows[0],{exists:false});assert.match(rows[1].error,/não suportado/);
  const denied=new WindowsRegistry(async()=>({items:[{index:0,error:'Acesso negado'},{index:1,snapshot:{exists:true,type:'DWord',value:'0'}}]}));
  const failures=await denied.readMany(entries);assert.equal(failures[0].error,'Acesso negado');assert.match(failures[1].error,/DWORD/);
});
test('getTweakStates batches once, maps mixed states and isolates per-entry failures to their tweak',async t=>{
  const{service,registry}=await fixture(t);let calls=0;
  registry.read=async()=>{throw new Error('Individual read must not be called');};
  registry.readMany=async entries=>{calls++;return entries.map(e=>e.name==='MouseThreshold1'?{error:'Acesso negado'}:e.name==='TaskbarAl'?{exists:false}:{exists:true,type:e.type,value:e.value});};
  const states=await service.getTweakStates();assert.equal(calls,1);assert.equal(states.length,6);
  assert.equal(states.find(s=>s.id==='enable-dark-mode').enabled,true);
  assert.equal(states.find(s=>s.id==='align-taskbar-left').enabled,false);
  const mouse=states.find(s=>s.id==='disable-mouse-acceleration');assert.equal(mouse.enabled,null);assert.equal(mouse.error,'Acesso negado');
  assert.equal(states.find(s=>s.id==='enable-game-mode').enabled,true);
});
test('getTweakStates reports malformed or failed batch as unknown, never disabled',async t=>{
  const{service,registry}=await fixture(t);
  registry.readMany=async()=>[];assert.equal((await service.getTweakStates()).every(s=>s.enabled===null&&/incompleta/.test(s.error)),true);
  registry.readMany=async()=>{throw new Error('Processo indisponível');};assert.equal((await service.getTweakStates()).every(s=>s.enabled===null&&s.error==='Processo indisponível'),true);
  registry.readMany=async entries=>entries.map(e=>e.name==='AutoGameModeEnabled'?{exists:true,type:'DWord',value:'1'}:{exists:true,type:e.type,value:e.value});
  const states=await service.getTweakStates();assert.equal(states.find(s=>s.id==='enable-game-mode').enabled,null);assert.equal(states.find(s=>s.id==='enable-dark-mode').enabled,true);
});
test('getTweakStates retains read-only mock fallback and does not cache external state',async t=>{
  const{service,registry}=await fixture(t);let calls=0;let active=true;
  registry.read=async e=>{calls++;if(e.name==='MouseSpeed')throw new Error('Falha pontual');return active?{exists:true,type:e.type,value:e.value}:{exists:false};};
  const first=await service.getTweakStates();active=false;const second=await service.getTweakStates();
  assert.equal(calls,18);assert.equal(first.find(s=>s.id==='enable-game-mode').enabled,true);assert.equal(second.find(s=>s.id==='enable-game-mode').enabled,false);assert.equal(first.find(s=>s.id==='disable-mouse-acceleration').enabled,null);
});
