import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../renderer/navigation.js',import.meta.url),'utf8');
function classes(){const context={window:{},Date,Map,Promise,Object,Array};vm.createContext(context);vm.runInContext(source,context);return context.window.BoosterNavigation;}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('concurrent readers share one query; recent values are reused and TTL expiry refreshes',async()=>{
  const {ReadCache}=classes();let now=0,calls=0;const cache=new ReadCache({now:()=>now,ttl:100});const wait=deferred();
  const a=cache.read('state',()=>{calls++;return wait.promise;}),b=cache.read('state',()=>{calls++;return 'unexpected';});
  await tick();assert.equal(calls,1);wait.resolve('confirmed');assert.deepEqual(await Promise.all([a,b]),['confirmed','confirmed']);
  assert.equal(await cache.read('state',()=>{calls++;}), 'confirmed');assert.equal(calls,1);
  now=101;assert.equal(await cache.read('state',()=>{calls++;return 'new';}), 'new');assert.equal(calls,2);
});

test('query failure is not cached',async()=>{
  const {ReadCache}=classes();const cache=new ReadCache();let calls=0;
  await assert.rejects(cache.read('state',()=>{calls++;throw new Error('denied');}),/denied/);
  assert.equal(await cache.read('state',()=>{calls++;return 'recovered';}),'recovered');assert.equal(calls,2);
});

test('invalidation while a query is pending makes old consumers await fresh data',async()=>{
  const {ReadCache}=classes();const cache=new ReadCache();const old=deferred();let calls=0;
  const read=cache.read('state',()=>++calls===1?old.promise:'new value');await tick();cache.clear();old.resolve('stale value');
  assert.equal(await read,'new value');assert.equal(calls,2);assert.equal(await cache.read('state',()=>0),'new value');
});

function routerFixture({ttl=100}={}){
  const {PageRouter}=classes();let now=0;const loads=[],waiting=new Map(),events=[];
  const content={childNodes:[],dataset:{},inert:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;},replaceChildren(...nodes){this.childNodes=nodes;},set innerHTML(value){this.childNodes=[{html:value}];},get innerHTML(){return this.childNodes.map(n=>n.html).join('');}};
  const router=new PageRouter({content,now:()=>now,ttl,shell:page=>'shell-'+page,onStart:(page,state)=>events.push({page,...state}),render:async(page,{isCurrent})=>{
    loads.push(page);const wait=deferred();waiting.set(page,wait);const node=await wait.promise;if(isCurrent())content.replaceChildren(node);
  }});
  return {router,content,loads,waiting,events,advance:ms=>{now+=ms;},async ready(page,node={html:page}){await tick();waiting.get(page).resolve(node);await tick();return node;}};
}

test('cold navigation shows a module shell immediately and blocks actions until data is ready',async()=>{
  const f=routerFixture();const load=f.router.navigate('cleanup');
  assert.equal(f.content.innerHTML,'shell-cleanup');assert.equal(f.content.inert,true);assert.equal(f.content.dataset.pageReady,'false');
  await f.ready('cleanup');await load;assert.equal(f.content.innerHTML,'cleanup');assert.equal(f.content.inert,false);
});

test('returning to a recent module restores the same nodes and controls without another query',async()=>{
  const f=routerFixture();const control={html:'settings',value:'unsaved text',onClick:()=>42};let load=f.router.navigate('settings');await f.ready('settings',control);await load;
  load=f.router.navigate('apps');await f.ready('apps');await load;
  const returning=f.router.navigate('settings');
  assert.equal(f.content.childNodes[0],control);assert.equal(f.content.childNodes[0].value,'unsaved text');assert.equal(f.content.childNodes[0].onClick(),42);
  assert.equal(f.content.inert,false);await returning;assert.deepEqual(f.loads,['settings','apps']);
});

test('expired or invalidated views remain visible while refreshing but cannot execute actions',async()=>{
  const f=routerFixture();let load=f.router.navigate('tweaks');const old=await f.ready('tweaks');await load;
  f.advance(101);load=f.router.navigate('tweaks');assert.equal(f.content.childNodes[0],old);assert.equal(f.content.inert,true);
  await f.ready('tweaks',{html:'updated'});await load;assert.equal(f.content.innerHTML,'updated');
  f.router.invalidate();load=f.router.navigate('tweaks');assert.equal(f.content.inert,true);await f.ready('tweaks');await load;
});

test('a late response cannot replace a module selected more recently',async()=>{
  const f=routerFixture();const first=f.router.navigate('slow');await tick();const second=f.router.navigate('fast');await f.ready('fast');await second;
  f.waiting.get('slow').resolve({html:'wrong-page'});await first;assert.equal(f.content.innerHTML,'fast');assert.equal(f.content.dataset.page,'fast');
});

test('manual refresh bypasses even a recent page cache',async()=>{
  const f=routerFixture();let load=f.router.navigate('settings');await f.ready('settings');await load;
  load=f.router.navigate('settings',{force:true});assert.equal(f.content.inert,true);await f.ready('settings');await load;assert.deepEqual(f.loads,['settings','settings']);
});

test('actual bridge invalidates read caches after partial or failed mutations',async()=>{
  const context={window:{},Date,Map,Promise,Object,Array,Set,model:{catalog:{cached:true}}};vm.createContext(context);vm.runInContext(source,context);
  const app=readFileSync(new URL('../renderer/app.js',import.meta.url),'utf8');const header=app.slice(app.indexOf('const readMethods='),app.indexOf('function head('));
  let reads=0;context.window.booster={getTweakStates:async()=>({revision:++reads}),cleanCaches:async()=>({ok:false,partial:true}),applyTweak:async()=>{throw new Error('interrupted');}};
  vm.runInContext(header+'\nglobalThis.apiForTest=api;globalThis.bridgeForTest=callBridge;',context);
  assert.equal((await context.apiForTest('getTweakStates')).revision,1);assert.equal((await context.apiForTest('getTweakStates')).revision,1);
  assert.equal((await context.bridgeForTest('cleanCaches',{})).partial,true);assert.equal((await context.apiForTest('getTweakStates')).revision,2);
  await assert.rejects(context.bridgeForTest('applyTweak',{}),/interrupted/);assert.equal((await context.apiForTest('getTweakStates')).revision,3);
});
