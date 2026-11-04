import { app, BrowserWindow, ipcMain, session, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, appendFileSync } from 'node:fs';
import { createService } from './lib/service.mjs';
import { launchDesktop } from './lib/desktop.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const log=(phase,details={})=>{
  try{mkdirSync(path.join(root,'data'),{recursive:true});appendFileSync(path.join(root,'data','startup.jsonl'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,phase,...details})+'\n');}
  catch(error){console.error('Startup log unavailable:',error.message);}
};
const fail=error=>{
  log('startup-error',{message:error?.message||String(error)});
  dialog.showErrorBox('Não foi possível abrir o CS Booster','A inicialização falhou. Consulte o relatório startup.jsonl na pasta de dados do aplicativo.');
  app.exit(1);
};
process.on('uncaughtException',fail);
process.on('unhandledRejection',fail);
log('main-entry',{electron:process.versions.electron,version:app.getVersion()});
launchDesktop({app,BrowserWindow,ipcMain,session,root,createService,log},fail);
