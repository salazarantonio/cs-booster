import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { startDesktop, launchDesktop } from './desktop.mjs';

function fixture({lock=true,loadError=false}={}){
  const calls=[],handlers=new Map(),phases=[],serviceCalls=[];
  const app=new EventEmitter();
  app.setName=name=>calls.push(['name',name]);
  app.setPath=(name,value)=>{app[name]=value;calls.push(['path',name,value]);};
  app.getPath=name=>app[name];
  app.requestSingleInstanceLock=()=>{calls.push(['lock']);return lock;};
  app.whenReady=async()=>calls.push(['ready']);
  app.quit=()=>calls.push(['quit']);
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;Window.current=this;this.webContents=new EventEmitter();this.webContents.mainFrame={url:''};this.webContents.setWindowOpenHandler=fn=>{this.openHandler=fn;};}
    async loadURL(url){if(loadError)throw new Error('simulated load failure');this.webContents.mainFrame.url=url;this.emit('ready-to-show');}
    isDestroyed(){return false;}
    isMinimized(){return true;}
    restore(){calls.push(['restore']);}
    show(){calls.push(['show']);}
    focus(){calls.push(['focus']);}
  }
  const session={defaultSession:{setPermissionRequestHandler(fn){this.request=fn;},setPermissionCheckHandler(fn){this.check=fn;}}};
  const args={app,BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},session,root:path.resolve('fixture-desktop'),log:phase=>phases.push(phase),createService:directory=>{
    calls.push(['service',directory]);
    return new Proxy({},{get:(_target,method)=>async input=>{serviceCalls.push({method,input});return {ok:true};}});
  }};
  return {args,app,calls,handlers,phases,session,serviceCalls,get window(){return Window.current;}};
}

test('portable profile is configured before single-instance lock and readiness',async()=>{
  const f=fixture();const window=await startDesktop(f.args);
  assert.equal(window,f.window);
  const types=f.calls.map(c=>c[0]);
  assert.ok(types.indexOf('path')<types.indexOf('lock'));
  assert.ok(types.indexOf('lock')<types.indexOf('ready'));
  assert.deepEqual(f.phases,['profile-configured','single-instance-lock','app-ready','window-created','window-ready-to-show','page-loaded']);
});

test('entrypoint launcher returns before ready so ESM loading cannot deadlock readiness',async()=>{
  const f=fixture();let ready;const errors=[];
  f.app.whenReady=()=>new Promise(resolve=>{ready=resolve;});
  assert.equal(launchDesktop(f.args,error=>errors.push(error)),undefined);
  assert.equal(f.window,undefined);
  assert.ok(!f.phases.includes('app-ready'));
  ready();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(f.phases.includes('page-loaded'));
  assert.deepEqual(errors,[]);
});

test('a duplicate instance quits explicitly without creating a window or service',async()=>{
  const f=fixture({lock:false});assert.equal(await startDesktop(f.args),null);
  assert.equal(f.window,undefined);assert.equal(f.handlers.size,0);
  assert.deepEqual(f.calls.at(-1),['quit']);
});

test('second instance restores and focuses the existing minimized window',async()=>{
  const f=fixture();await startDesktop(f.args);f.app.emit('second-instance');
  assert.deepEqual(f.calls.slice(-3),[['restore'],['show'],['focus']]);
});

test('production IPC rejects foreign frames and changed origins before service invocation',async()=>{
  const f=fixture();await startDesktop(f.args);
  const invoke=f.handlers.get('booster:getCatalog'),frame=f.window.webContents.mainFrame;
  await assert.rejects(invoke({senderFrame:{url:frame.url}}),/Origem/);
  assert.equal(f.serviceCalls.length,0);
  assert.deepEqual(await invoke({senderFrame:frame}),{ok:true});
  frame.url='https://example.invalid/';
  await assert.rejects(invoke({senderFrame:frame}),/Origem/);
  assert.equal(f.serviceCalls.length,1);
});

test('production window keeps isolation and denies new windows, navigation, webviews and permissions',async()=>{
  const f=fixture();await startDesktop(f.args);
  const prefs=f.window.options.webPreferences;
  assert.equal(prefs.nodeIntegration,false);assert.equal(prefs.contextIsolation,true);assert.equal(prefs.sandbox,true);assert.equal(prefs.webviewTag,false);
  assert.deepEqual(f.window.openHandler(),{action:'deny'});
  let denied=0;const event={preventDefault(){denied++;}};
  f.window.webContents.emit('will-navigate',event,'https://example.invalid/');
  f.window.webContents.emit('will-attach-webview',event);
  assert.equal(denied,2);
  assert.equal(f.session.defaultSession.check(),false);
  let permission;f.session.defaultSession.request(null,'camera',value=>{permission=value;});assert.equal(permission,false);
});

test('page-load failure does not record a successful desktop load',async()=>{
  const f=fixture({loadError:true});await assert.rejects(startDesktop(f.args),/simulated load failure/);
  assert.ok(!f.phases.includes('page-loaded'));
});
