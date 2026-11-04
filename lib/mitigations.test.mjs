import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMitigationService, MITIGATION_ENTRIES } from './mitigations.mjs';

async function fixture(t,system={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'csb-mitigations-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const data=new Map();const calls=[];
  const entryKey=e=>`${e.hive}|${e.key}|${e.name}`;
  const registry={
    read:async e=>structuredClone(data.get(entryKey(e))||{exists:false}),
    write:async(e,value)=>{calls.push({entry:structuredClone(e),value:structuredClone(value)});data.set(entryKey(e),structuredClone(value));},
  };
  const info={isAdmin:true,vendor:'Intel',hyperV:false,computerName:'TEST-PC',...system};
  const powershell=async script=>script.includes('WindowsIdentity')?structuredClone(info):script.includes('trusted')?{trusted:true}:{protected:true};
  const service=createMitigationService(dir,{registry,powershell});
  const seed=(i,value)=>data.set(entryKey(MITIGATION_ENTRIES[i]),structuredClone(value));
  const value=i=>registry.read(MITIGATION_ENTRIES[i]);
  return {dir,data,calls,registry,info,powershell,service,seed,value};
}
const reduced={vendor:'Intel',profileIds:['desligar-tudo'],confirmReducedSecurity:true};

test('reduced-security profile requires explicit boolean acknowledgment before any writes',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.service.applyMitigation({...reduced,confirmReducedSecurity:false}),/Confirme explicitamente/);
  await assert.rejects(f.service.applyMitigation({...reduced,confirmReducedSecurity:'true'}),/Confirme explicitamente/);
  assert.equal(f.calls.length,0);
  assert.deepEqual(await f.service.listMitigationBackups(),[]);
});
test('administrator and OS vendor checks reject spoofed renderer arguments',async t=>{
  const f=await fixture(t,{isAdmin:false});
  await assert.rejects(f.service.applyMitigation(reduced),/administrador/);
  f.info.isAdmin=true;f.info.vendor='AMD';
  await assert.rejects(f.service.applyMitigation(reduced),/não corresponde/);
  f.info.vendor='Unknown';
  await assert.rejects(f.service.applyMitigation(reduced),/não identificado/);
  assert.equal(f.calls.length,0);
});
test('desligar-tudo writes only documented override/mask and preserves unrelated MinVm',async t=>{
  const f=await fixture(t);f.seed(2,{exists:true,type:'String',value:'2.0'});
  const result=await f.service.applyMitigation(reduced);
  assert.equal(result.ok,true);assert.equal(result.effectiveState,'unknown');assert.equal(result.restartRequired,true);
  assert.deepEqual(await f.value(0),{exists:true,type:'DWord',value:3});
  assert.deepEqual(await f.value(1),{exists:true,type:'DWord',value:3});
  assert.deepEqual(await f.value(2),{exists:true,type:'String',value:'2.0'});
  assert.equal(f.calls.length,2);
});
test('restore reinstates absence, exact type and nondefault original value',async t=>{
  const f=await fixture(t);f.seed(0,{exists:true,type:'DWord',value:72});f.seed(2,{exists:true,type:'String',value:'custom'});
  const result=await f.service.applyMitigation(reduced);
  await f.service.restoreMitigation({id:result.backupId});
  assert.deepEqual(await f.value(0),{exists:true,type:'DWord',value:72});
  assert.deepEqual(await f.value(1),{exists:false});
  assert.deepEqual(await f.value(2),{exists:true,type:'String',value:'custom'});
  assert.equal((await f.service.listMitigationBackups()).length,2);
});
test('padrao removes all three managed values instead of writing zero',async t=>{
  const f=await fixture(t);f.seed(0,{exists:true,type:'DWord',value:3});f.seed(1,{exists:true,type:'DWord',value:3});f.seed(2,{exists:true,type:'String',value:'1.0'});
  const result=await f.service.applyMitigation({vendor:'Intel',profileIds:['padrao']});
  for(let i=0;i<3;i++)assert.deepEqual(await f.value(i),{exists:false});
  assert.equal(result.ok,true);
});
test('Hyper-V profiles set MinVm only with verified Hyper-V and reject unknown feature state',async t=>{
  const f=await fixture(t,{hyperV:true});
  await f.service.applyMitigation({vendor:'Intel',profileIds:['intel-full']});
  assert.deepEqual(await f.value(2),{exists:true,type:'String',value:'1.0'});
  f.info.hyperV=null;const count=f.calls.length;
  await assert.rejects(f.service.applyMitigation({vendor:'Intel',profileIds:['intel-full']}),/verificar o Hyper-V/);
  assert.equal(f.calls.length,count);
});
test('tampered destination, invalid payload and path traversal are refused',async t=>{
  const f=await fixture(t);const result=await f.service.applyMitigation(reduced);
  const file=path.join(f.dir,'mitigation-backups',result.backupId+'.json');const original=JSON.parse(await fs.readFile(file,'utf8'));
  const invalid=structuredClone(original);invalid.values[0].entry.key='SOFTWARE\\Unauthorized';await fs.writeFile(file,JSON.stringify(invalid));
  const count=f.calls.length;
  await assert.rejects(f.service.restoreMitigation({id:result.backupId}),/não autorizado/);
  invalid.values=original.values;invalid.values[0].snapshot={exists:true,type:'Binary',value:[]};await fs.writeFile(file,JSON.stringify(invalid));
  await assert.rejects(f.service.restoreMitigation({id:result.backupId}),/não suportado/);
  await assert.rejects(f.service.restoreMitigation({id:'../../settings'}),/Identificador/);
  assert.equal(f.calls.length,count);
});
test('partial write failure rolls back even when writer throws after changing the value',async t=>{
  const f=await fixture(t);f.seed(0,{exists:true,type:'DWord',value:72});
  const base=f.registry.write;let once=true;
  f.registry.write=async(e,v)=>{await base(e,v);if(e.name==='FeatureSettingsOverrideMask'&&once){once=false;throw new Error('simulated post-write failure');}};
  let failure;try{await f.service.applyMitigation(reduced);}catch(e){failure=e;}
  assert.ok(failure);assert.equal(failure.rollbackSucceeded,true);
  assert.deepEqual(await f.value(0),{exists:true,type:'DWord',value:72});
  assert.deepEqual(await f.value(1),{exists:false});
  assert.equal((await f.service.listMitigationBackups()).length,1);
});
test('failed rollback is explicitly reported rather than claiming recovery',async t=>{
  const f=await fixture(t);const base=f.registry.write;
  f.registry.write=async(e,v)=>{if(e.name==='FeatureSettingsOverrideMask')throw new Error('denied mask');if(e.name==='FeatureSettingsOverride'&&!v.exists)throw new Error('denied rollback');return base(e,v);};
  await assert.rejects(f.service.applyMitigation(reduced),e=>e.rollbackSucceeded===false&&e.rollbackErrors.length>=1&&/incompleta/.test(e.message));
});
test('status reports configured values without asserting effective kernel protection',async t=>{
  const f=await fixture(t,{isAdmin:false});f.seed(0,{exists:true,type:'DWord',value:3});
  const result=await f.service.getMitigationStatus();assert.equal(result.effectiveState,'unknown');assert.equal(result.verificationAvailable,false);assert.equal(result.applySupported,false);assert.equal(result.isAdministrator,false);assert.equal(result.requiresAdministrator,true);assert.equal(result.configured.override.value,3);assert.equal(f.calls.length,0);
});
test('backup with untrusted owner or writable ACL is refused before restoration',async t=>{
  const f=await fixture(t);const applied=await f.service.applyMitigation(reduced);const count=f.calls.length;
  const service=createMitigationService(f.dir,{registry:f.registry,powershell:async s=>s.includes('WindowsIdentity')?f.info:s.includes('trusted')?{trusted:false}:{protected:true}});
  await assert.rejects(service.restoreMitigation({id:applied.backupId}),/Backup recusado/);
  assert.equal(f.calls.length,count);
  assert.deepEqual(await service.listMitigationBackups(),[]);
});
test('missing explicit backup trust verdict cannot be treated as trusted',async t=>{
  const f=await fixture(t);const applied=await f.service.applyMitigation(reduced);const count=f.calls.length;
  const service=createMitigationService(f.dir,{registry:f.registry,powershell:async s=>s.includes('WindowsIdentity')?f.info:{protected:true}});
  await assert.rejects(service.restoreMitigation({id:applied.backupId}),/Backup recusado/);
  assert.equal(f.calls.length,count);
});
test('missing backup protection result prevents registry changes',async t=>{
  const f=await fixture(t);const service=createMitigationService(f.dir,{registry:f.registry,powershell:async s=>s.includes('WindowsIdentity')?f.info:{protected:false}});
  await assert.rejects(service.applyMitigation(reduced),/proteger a pasta/);assert.equal(f.calls.length,0);
});

