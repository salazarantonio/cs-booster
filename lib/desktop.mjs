import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DESKTOP_METHODS=Object.freeze(['getDashboard','getCatalog','getSettings','setSettings','getTweakStates','applyTweak','listBackups','restoreBackup','getCleanupPreview','cleanCaches','getSteamInfo','getMitigationStatus','planMitigation','compareCaptures','getLogs','getDebloatApps','applyDebloat','applyMitigation','listMitigationBackups','restoreMitigation']);

// Electron must be able to finish loading its ESM entrypoint before ready.
// Deliberately return undefined so even awaiting this launcher cannot make
// module loading depend on app.whenReady().
export function launchDesktop(options,onError){
  startDesktop(options).catch(onError);
}

export async function startDesktop({app,BrowserWindow,ipcMain,session,root,createService,log=()=>{}}){
  const page=pathToFileURL(path.join(root,'renderer/index.html')).href;
  // The profile must be selected before requesting the lock: both instances
  // must use this portable app's profile, rather than an unrelated default.
  app.setName('CS Booster');
  app.setPath('userData',path.join(root,'data'));
  log('profile-configured');
  const single=app.requestSingleInstanceLock();
  log('single-instance-lock',{acquired:single});
  if(!single){app.quit();return null;}
  let window;
  app.on('second-instance',()=>{
    log('second-instance');
    if(window&&!window.isDestroyed()){
      if(window.isMinimized())window.restore();
      window.show();window.focus();
    }
  });
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>log('before-quit'));
  app.on('child-process-gone',(_event,details)=>log('child-process-gone',{type:details.type,reason:details.reason,exitCode:details.exitCode}));
  await app.whenReady();
  log('app-ready');
  const service=createService(path.join(app.getPath('userData'),'settings'));
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  for(const method of DESKTOP_METHODS)ipcMain.handle('booster:'+method,async(event,input)=>{
    if(event.senderFrame!==window?.webContents.mainFrame||event.senderFrame?.url?.split('#')[0]!==page)throw new Error('Origem não autorizada.');
    if(input!==undefined&&JSON.stringify(input).length>65_000_000)throw new Error('Arquivo excede o limite permitido.');
    return service[method](input);
  });
  window=new BrowserWindow({width:1320,height:920,minWidth:940,minHeight:660,title:'CS Booster',backgroundColor:'#0b111e',autoHideMenuBar:true,
    webPreferences:{preload:path.join(root,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false}});
  log('window-created');
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url.split('#')[0]!==page)event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('preload-error',(_event,_file,error)=>log('preload-error',{message:error.message}));
  window.webContents.on('render-process-gone',(_event,details)=>log('render-process-gone',{reason:details.reason,exitCode:details.exitCode}));
  window.webContents.on('did-fail-load',(_event,code,description)=>log('page-load-failed',{code,description}));
  window.once('ready-to-show',()=>log('window-ready-to-show'));
  await window.loadURL(page);
  log('page-loaded');
  return window;
}
