import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPackage } from './package.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'csb-package-test-'));
  t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()),'csb-package-test-')));await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'node_modules/electron/dist'),{recursive:true});
  await fs.writeFile(path.join(root,'node_modules/electron/dist/electron.exe'),'runtime-v1');
  for(const name of ['renderer','lib']){await fs.mkdir(path.join(root,name));await fs.writeFile(path.join(root,name,'entry.txt'),'source-v1');}
  for(const name of ['main.mjs','preload.cjs','package.json'])await fs.writeFile(path.join(root,name),'source-v1');
  return root;
}

test('repeat packaging publishes fresh runtime, preserves local data and archives the old package',async t=>{
  const root=await fixture(t);
  const first=await buildPackage({root,runId:'first'});
  const data=path.join(first.destination,'resources/app/data/settings');
  await fs.mkdir(data,{recursive:true});await fs.writeFile(path.join(data,'settings.json'),'keep-me');
  await fs.writeFile(path.join(root,'node_modules/electron/dist/electron.exe'),'runtime-v2');
  await fs.writeFile(path.join(root,'main.mjs'),'source-v2');
  const second=await buildPackage({root,runId:'second'});
  assert.equal(await fs.readFile(path.join(second.destination,'CS Booster.exe'),'utf8'),'runtime-v2');
  assert.equal(await fs.readFile(path.join(second.destination,'resources/app/main.mjs'),'utf8'),'source-v2');
  assert.equal(await fs.readFile(path.join(second.destination,'resources/app/data/settings/settings.json'),'utf8'),'keep-me');
  assert.equal(await fs.readFile(path.join(second.previous,'CS Booster.exe'),'utf8'),'runtime-v1');
  assert.equal(await fs.readFile(path.join(second.previous,'resources/app/data/settings/settings.json'),'utf8'),'keep-me');
  await assert.rejects(fs.stat(path.join(second.destination,'electron.exe')),{code:'ENOENT'});
});

test('failed publication restores the original package instead of deleting it',async t=>{
  const root=await fixture(t);await buildPackage({root,runId:'original'});
  const destination=path.join(root,'release','CS Booster');
  const api={...fs,rename:async(from,to)=>{
    if(from===path.join(root,'release','CS Booster.build-failure')&&to===destination)throw Object.assign(new Error('simulated locked destination'),{code:'EPERM'});
    return fs.rename(from,to);
  }};
  await assert.rejects(buildPackage({root,runId:'failure',fsApi:api}),/Pacote não publicado/);
  assert.equal(await fs.readFile(path.join(destination,'CS Booster.exe'),'utf8'),'runtime-v1');
  assert.ok((await fs.stat(path.join(root,'release','CS Booster.build-failure'))).isDirectory());
});
