import { app, BrowserWindow, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../lib/service.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const qa=path.resolve(root,'data','qa');
await fs.mkdir(qa,{recursive:true});
await fs.mkdir(path.join(root,'evidence'),{recursive:true});
app.setPath('userData',path.join(qa,'electron'));
await app.whenReady();
let writes=0;
const registry={read:async()=>({exists:false}),write:async()=>{writes++;throw new Error('Writes forbidden in UI smoke test');}};
const service=createService(path.join(qa,'data'),{registry,powershell:async()=>({})});
for(const method of Object.keys(service)) if(typeof service[method]==='function') ipcMain.handle('booster:'+method,(_event,input)=>service[method](input));
const win=new BrowserWindow({show:false,width:1320,height:920,webPreferences:{preload:path.join(root,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
const errors=[];
win.webContents.on('console-message',(_event,level,message)=>{if(level===3)errors.push(message);});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=source=>win.webContents.executeJavaScript(source);
try {
  await win.loadFile(path.join(root,'renderer/index.html'));
  await sleep(500);
  const results=[];
  for(const route of ['dashboard','tweaks','cleanup','games','diagnostics','security','restore','apps','settings']) {
    await run(`location.hash=${JSON.stringify(route)}`);
    await sleep(250);
    const state=await run(`({heading:document.querySelector('main h1')?.textContent, text:document.querySelector('main').innerText, overflow:document.documentElement.scrollWidth>innerWidth})`);
    if(!state.heading||state.overflow||state.text.includes('Não foi possível carregar'))throw new Error('Route failed: '+route+' '+JSON.stringify(state));
    if(route==='cleanup') {
      const cleanupState=await run(`({count:document.querySelectorAll('.cleanup-switch').length,checked:document.querySelectorAll('.cleanup-switch:checked').length,disabled:document.querySelector('#clean')?.disabled})`);
      if(cleanupState.count!==8||cleanupState.checked!==0||cleanupState.disabled!==true)throw new Error('Invalid cleanup default state: '+JSON.stringify(cleanupState));
    }
    results.push({route,heading:state.heading});
    if(route==='dashboard'||route==='tweaks'||route==='security') await fs.writeFile(path.join(root,'evidence',route+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await run(`location.hash='tweaks'`);await sleep(200);
  const count=await run(`document.querySelectorAll('#tweak-list .card').length`);
  if(count!==29)throw new Error('Expected 29 tweaks, found '+count);
  if(await run(`document.querySelectorAll('.recommend-star').length`)!==6)throw new Error('Expected six recommended stars');
  await run(`document.querySelector('#search').value='Modo Escuro';document.querySelector('#search').dispatchEvent(new Event('input'))`);
  if(await run(`document.querySelectorAll('[data-tweak]').length`)!==1)throw new Error('Search filter failed');
  await run(`document.querySelector('[data-tweak]').click()`);await sleep(100);
  if(!await run(`document.querySelector('dialog').open`))throw new Error('Confirmation missing');
  await run(`document.querySelector('dialog button[value=cancel]').click()`);await sleep(100);
  if(writes)throw new Error('Unexpected write');
  if(errors.length)throw new Error(errors.join('\n'));
  await fs.writeFile(path.join(root,'evidence/ui-validation.json'),JSON.stringify({passed:true,routes:results,tweakCount:count,search:true,confirmationCancel:true,registryWrites:writes},null,2));
  console.log('UI smoke passed: nine routes, 29 cards, search and cancel; zero registry writes.');
  app.exit(0);
}catch(error){console.error(error);app.exit(1);}
