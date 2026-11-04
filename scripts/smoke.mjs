import { app, BrowserWindow, ipcMain } from 'electron';
import { promises as fs, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../lib/service.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const qa=path.resolve(root,'data','qa');
mkdirSync(path.join(qa,'electron'),{recursive:true});
app.setPath('userData',path.join(qa,'electron'));
async function smoke(){
const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
await fs.mkdir(qa,{recursive:true});
await fs.mkdir(path.join(root,'evidence'),{recursive:true});
await app.whenReady();
let writes=0,cleanupExecutions=0;
const registry={read:async()=>({exists:false}),write:async()=>{writes++;throw new Error('Writes forbidden in UI smoke test');}};
// This test never starts PowerShell or writes the Windows registry. Only the
// service's isolated QA settings/logs may be persisted.
const powershell=async script=>{
  const payload=/FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script);
  if(payload){
    const request=JSON.parse(Buffer.from(payload[1],'base64').toString('utf8'));
    if(Array.isArray(request.roots)){
      if(request.execute)cleanupExecutions++;
      return {id:request.id,status:'completed',bytes:1024,fileCount:1,deletedBytes:0,deletedFiles:0,skipped:0,errors:[],bounded:false};
    }
  }
  if(script.includes('VendorIdentifier'))return {isAdmin:false,vendor:'Intel',hyperV:false};
  if(script.includes('DriveInfo'))return {isAdministrator:false,sid:'S-1-5-21-111-222-333-1001',drives:['C:\\'],windowsUpdateRunning:false,bitsRunning:false};
  if(script.includes('Get-AppxPackage'))return {packages:[]};
  if(script.includes('SteamPath'))return {steamPath:null};
  if(script.includes('Get-CimInstance'))return {windows:'Windows de teste simulado',gpu:[],disks:[]};
  throw new Error('Unexpected OS query in desktop test');
};
const service=createService(path.join(qa,'data'),{registry,powershell});
const queryCalls={};
for(const method of Object.keys(service)) if(typeof service[method]==='function') ipcMain.handle('booster:'+method,(_event,input)=>{queryCalls[method]=(queryCalls[method]||0)+1;return service[method](input);});
const win=new BrowserWindow({show:false,width:1320,height:920,webPreferences:{preload:path.join(root,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
const errors=[];
const screenshotWarnings=[];
let phase='initialization';
win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
win.webContents.on('render-process-gone',(_event,details)=>errors.push('Renderer exited: '+details.reason));
win.webContents.on('preload-error',(_event,_path,error)=>errors.push('Preload failed: '+error.message));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=source=>win.webContents.executeJavaScript(source);
const until=async(source,label)=>{const deadline=Date.now()+8000;while(Date.now()<deadline){if(await run(source))return;await sleep(50);}throw new Error('Timed out: '+label);};
const route=async name=>{await run(`location.hash=${JSON.stringify(name)}`);await until(`model.readyPage===${JSON.stringify(name)}&&document.querySelector('main h1')&&!document.querySelector('main .loading')`,name);};
try {
  await win.loadFile(path.join(root,'renderer/index.html'));
  await until(`model.readyPage==='dashboard'&&document.querySelector('main h1')&&!document.querySelector('main .loading')`,'initial page');
  const isolation=await run(`({require:typeof require,process:typeof process,bridge:typeof window.booster?.getCatalog,rawIpc:typeof window.ipcRenderer})`);
  if(isolation.require!=='undefined'||isolation.process!=='undefined'||isolation.bridge!=='function'||isolation.rawIpc!=='undefined')throw new Error('Unexpected renderer privileges: '+JSON.stringify(isolation));
  const results=[];
  for(const route of ['dashboard','tweaks','cleanup','games','diagnostics','security','restore','apps','settings']) {
    phase='route: '+route;
    console.log('Checking '+phase);
    await run(`location.hash=${JSON.stringify(route)}`);
    await until(`model.readyPage===${JSON.stringify(route)}&&document.querySelector('main h1')&&!document.querySelector('main .loading')`,route);
    const state=await run(`({heading:document.querySelector('main h1')?.textContent, text:document.querySelector('main').innerText, overflow:document.documentElement.scrollWidth>innerWidth})`);
    if(!state.heading||state.overflow||state.text.includes('Não foi possível carregar'))throw new Error('Route failed: '+route+' '+JSON.stringify(state));
    if(route==='dashboard'&&!state.text.includes('CS Booster · '+manifest.version))throw new Error('Dashboard version differs from package');
    if(route==='cleanup') {
      const cleanupState=await run(`({count:document.querySelectorAll('.cleanup-switch').length,checked:document.querySelectorAll('.cleanup-switch:checked').length,disabled:document.querySelector('#clean')?.disabled})`);
      if(cleanupState.count!==8||cleanupState.checked!==0||cleanupState.disabled!==true)throw new Error('Invalid cleanup default state: '+JSON.stringify(cleanupState));
    }
    if(route==='security'&&await run(`document.querySelector('#apply-mitigation')?.disabled`)!==true)throw new Error('Mitigation apply must be unavailable without administrator');
    results.push({route,heading:state.heading});
    if(route==='dashboard'||route==='tweaks'||route==='security') {
      // A hidden window may have no compositor surface. Screenshot failure is
      // reported separately; DOM, IPC and isolation assertions still must pass.
      try { await fs.writeFile(path.join(root,'evidence',route+'.png'),(await win.webContents.capturePage()).toPNG()); }
      catch(error) { screenshotWarnings.push({route,message:String(error.message||error)});console.warn('Screenshot unavailable for '+route+': '+String(error.message||error)); }
    }
  }
  phase='warm navigation and explicit refresh';
  // Returning to a recent module must preserve its controls and avoid queries.
  await run(`document.querySelector('#display-name').value='Rascunho preservado'`);
  const beforeReturn=JSON.stringify(queryCalls);
  await route('apps');await route('settings');
  if(await run(`document.querySelector('#display-name').value`)!=='Rascunho preservado')throw new Error('Warm navigation lost form state');
  if(JSON.stringify(queryCalls)!==beforeReturn)throw new Error('Warm navigation repeated a backend query');
  if(await run(`document.querySelector('main .loading')!==null`))throw new Error('Global loading screen returned');
  const settingsReads=queryCalls.getSettings||0;
  await run(`document.querySelector('#refresh').click()`);
  await until(`model.readyPage==='settings'`,'explicit refresh');
  if((queryCalls.getSettings||0)<=settingsReads)throw new Error('Explicit refresh reused stale settings');
  await route('tweaks');
  phase='catalog filters and cancellation';
  const count=await run(`document.querySelectorAll('#tweak-list .card').length`);
  if(count!==29)throw new Error('Expected 29 tweaks, found '+count);
  if(await run(`document.querySelectorAll('.recommend-star').length`)!==6)throw new Error('Expected six recommended stars');
  await run(`document.querySelector('[data-filter="Recomendados"]').click()`);
  if(await run(`document.querySelectorAll('#tweak-list .card').length`)!==6)throw new Error('Recommended filter failed');
  await run(`document.querySelector('[data-filter="Todos"]').click()`);
  await run(`document.querySelector('#search').value='Modo Escuro';document.querySelector('#search').dispatchEvent(new Event('input'))`);
  if(await run(`document.querySelectorAll('[data-tweak]').length`)!==1)throw new Error('Search filter failed');
  await run(`document.querySelector('[data-tweak]').click()`);
  if(!await run(`document.querySelector('dialog').open`))throw new Error('Confirmation missing');
  await run(`document.querySelector('#confirm-dialog button[value=cancel]').click()`);
  await until(`!document.querySelector('#confirm-dialog').open`,'cancel tweak');
  await route('cleanup');
  phase='cleanup cancellation';
  await run(`const input=document.querySelector('.cleanup-switch[value="directx"]');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#clean').click()`);
  if(!await run(`document.querySelector('#confirm-dialog').open`))throw new Error('Cleanup confirmation missing');
  await run(`document.querySelector('#confirm-dialog button[value=cancel]').click()`);
  await until(`!document.querySelector('#clean').disabled`,'cancel cleanup');
  if(cleanupExecutions!==0)throw new Error('Cancel unexpectedly executed cleanup');
  await route('tweaks');
  phase='selective debloat';
  await run(`document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'))`);
  await run(`document.querySelector('[data-debloat]').click()`);
  if(!await run(`document.querySelector('#debloat-choice').open`))throw new Error('Debloat method choice missing');
  await run(`document.querySelector('#debloat-choice button[value="selective"]').click()`);
  await until(`document.querySelector('#debloat-select').open`,'selective debloat');
  if(await run(`document.querySelectorAll('#debloat-apps input:checked').length`)!==0||!await run(`document.querySelector('#debloat-remove').disabled`))throw new Error('Unexpected debloat preselection');
  await run(`document.querySelector('#debloat-select form button').click()`);
  const metadata={scenario:'smoke',gameBuild:'test',resolution:'1920x1080',graphics:'low',captureMethod:'normalized-test',shaderWarmup:true};
  phase='comparison IPC and final assertions';
  const before={metadata,frames:Array.from({length:100},()=>({frametimeMs:10}))};
  const after={metadata,frames:Array.from({length:100},()=>({frametimeMs:5}))};
  const comparison=await run(`window.booster.compareCaptures(${JSON.stringify({before,after})})`);
  if(comparison.before.averageFps!==100||comparison.after.averageFps!==200||comparison.comparableMetadata!==true)throw new Error('Comparison IPC failed');
  if(writes)throw new Error('Unexpected write');
  if(errors.length)throw new Error(errors.join('\n'));
  await fs.writeFile(path.join(root,'evidence/ui-validation.json'),JSON.stringify({passed:true,at:new Date().toISOString(),version:manifest.version,adapters:'simulated-only',routes:results,tweakCount:count,cleanupCount:8,search:true,recommendedFilter:true,confirmationCancel:true,debloatDefaultEmpty:true,nonAdminMitigationsBlocked:true,comparisonIpc:true,warmNavigation:true,warmNavigationQueries:0,formStatePreserved:true,explicitRefresh:true,screenshotWarnings,isolation,registryWrites:writes,cleanupExecutions},null,2));
  console.log('UI smoke passed: nine routes, catalog/search/recommendations, eight cleanup options, cancellation, debloat, non-admin gate, isolation and comparison IPC; zero Windows mutations.');
  app.exit(0);
}catch(error){console.error('Failed during '+phase);console.error(error?.stack||error);app.exit(1);}

}
// Do not top-level-await readiness from an Electron ESM entrypoint.
smoke().catch(error=>{console.error(error);app.exit(1);});
