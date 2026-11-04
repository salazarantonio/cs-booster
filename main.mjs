import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createService } from './lib/service.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const page = pathToFileURL(path.join(root, 'renderer/index.html')).href;
const methods = ['getDashboard','getCatalog','getSettings','setSettings','getTweakStates','applyTweak','listBackups','restoreBackup','getCleanupPreview','cleanCaches','getSteamInfo','getMitigationStatus','planMitigation','compareCaptures','getLogs'];
const single = app.requestSingleInstanceLock();
let window;
if (!single) app.quit();
else {
  app.setName('CS Booster');
  // Store user data beside the portable app. No installation or elevation needed.
  app.setPath('userData', path.join(root, 'data'));
  app.on('second-instance', () => { if(window){window.show();window.focus();} });
  await app.whenReady();
  const service = createService(path.join(app.getPath('userData'), 'settings'));
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  for (const method of methods) ipcMain.handle('booster:'+method, async (event, input) => {
    if (event.senderFrame !== window?.webContents.mainFrame || event.senderFrame.url.split('#')[0] !== page) throw new Error('Origem não autorizada.');
    if (input !== undefined && JSON.stringify(input).length > 65_000_000) throw new Error('Arquivo excede o limite permitido.');
    return service[method](input);
  });
  window = new BrowserWindow({width:1320,height:920,minWidth:940,minHeight:660,title:'CS Booster',backgroundColor:'#0b111e',autoHideMenuBar:true,
    webPreferences:{preload:path.join(root,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url.split('#')[0]!==page)event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  await window.loadURL(page);
  app.on('window-all-closed',()=>app.quit());
}
