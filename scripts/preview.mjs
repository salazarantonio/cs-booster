import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createService } from '../lib/service.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const service=createService(path.join(root,'data-preview'));
const allowed=['getDashboard','getCatalog','getSettings','getTweakStates','listBackups','getCleanupPreview','getSteamInfo','getMitigationStatus','getLogs','getDebloatApps','listMitigationBackups'];
const bridge=`window.booster=Object.fromEntries(${JSON.stringify(allowed)}.map(name=>[name,async()=>{const r=await fetch('/api/'+name);const data=await r.json();if(!r.ok)throw new Error(data.error||'Consulta indisponível');return data}]));for(const name of ['setSettings','applyTweak','restoreBackup','cleanCaches','planMitigation','compareCaptures','applyDebloat','applyMitigation','restoreMitigation'])window.booster[name]=async()=>{throw new Error('Use o aplicativo desktop para este recurso. A prévia é somente leitura.')};`;
const files={'/':'index.html','/styles.css':'styles.css','/app.js':'app.js'};
http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  try {
    if(req.method!=='GET') {res.writeHead(405).end();return;}
    if(req.url==='/preview-bridge.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(bridge);return;}
    if(req.url.startsWith('/api/')){const name=req.url.slice(5);if(!allowed.includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(await service[name]()));return;}
    const file=files[req.url];if(!file){res.writeHead(404).end();return;}
    let contents=await fs.readFile(path.join(root,'renderer',file),'utf8');
    if(file==='index.html')contents=contents.replace('<script src="app.js">','<script src="preview-bridge.js"></script><script src="app.js">');
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8');res.end(contents);
  } catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
}).listen(Number(process.env.CS_BOOSTER_PREVIEW_PORT||4317),'127.0.0.1',()=>console.log('Prévia CS Booster somente leitura iniciada.'));
