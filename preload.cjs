const { contextBridge, ipcRenderer } = require('electron');
const names = ['getDashboard','getCatalog','getSettings','setSettings','getTweakStates','applyTweak','listBackups','restoreBackup','getCleanupPreview','cleanCaches','getSteamInfo','getMitigationStatus','planMitigation','compareCaptures','getLogs','getDebloatApps','applyDebloat','applyMitigation','listMitigationBackups','restoreMitigation'];
const api = {};
for(const name of names) api[name] = input => ipcRenderer.invoke('booster:'+name,input);
contextBridge.exposeInMainWorld('booster',Object.freeze(api));
