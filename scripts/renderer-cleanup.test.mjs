import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8');
const cleanupSource = source.slice(source.indexOf('const cleanupDefinitions'), source.indexOf('async function games('));
const ids = ['directx','nvidia-dx','nvidia-gl','temp','prefetch','recyclebin','windows-update','thumbnails'];

// Execute the actual renderer event handler with a minimal DOM adapter, not a
// second implementation of its confirmation rules. All backend calls are fakes.
async function fixture({confirmations=[],result,unsupported=[],reasons={}}={}) {
  const elements=new Map(),calls=[],prompts=[],toasts=[];
  const element=()=>({textContent:'',innerHTML:'',hidden:true,disabled:false,isConnected:true,setAttribute(){},removeAttribute(){}});
  const inputs=ids.map(id=>({...element(),value:id,checked:false,disabled:unsupported.includes(id)}));
  for(const id of ['content','cleanup-items','clean','cleanup-selection','cleanup-report','cleanup-report-message','cleanup-report-items','last-cleanup','last-cleanup-attempt'])elements.set('#'+id,element());
  elements.get('#clean').disabled=true;
  elements.get('#cleanup-items').querySelectorAll=()=>inputs;
  // Capture declarative markup too, so the test cannot pass merely because
  // the DOM adapter happened to initialize its input array as unchecked.
  const sandbox={
    model:{page:'cleanup'},
    $:selector=>elements.get(selector),
    escape:value=>String(value??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),
    head:()=>'',notice:text=>String(text),detailed:()=>'',pageCheck:()=>()=>true,
    callBridge:(method,input)=>sandbox.window.booster[method](input),
    api:async method=>{
      assert.equal(method,'getCleanupPreview');
      return {items:ids.map(id=>({id,supported:!unsupported.includes(id),reason:reasons[id],bytes:4096})),lastCleanupAt:null};
    },
    confirmAction:async(title,text)=>{prompts.push({title,text});return confirmations.shift()??false;},
    toast:(message,error)=>toasts.push({message,error}),
    window:{booster:{cleanCaches:async input=>{calls.push(input);return result??{ok:true,results:input.ids.map(id=>({id,status:'completed',deletedBytes:512,deletedFiles:1,skipped:0,errors:[]}))};}}},
  };
  vm.createContext(sandbox);
  vm.runInContext(cleanupSource+'\nglobalThis.renderCleanup=cleanup;',sandbox);
  await sandbox.renderCleanup();
  const select=(...chosen)=>{
    for(const input of inputs)input.checked=chosen.includes(input.value);
    elements.get('#cleanup-items').onchange();
  };
  return {elements,inputs,calls,prompts,toasts,select,click:()=>elements.get('#clean').onclick()};
}

test('cleanup starts with all eight accumulated options, no preselection and disabled execution', async()=>{
  const f=await fixture();
  const markup=f.elements.get('#content').innerHTML;
  const tags=[...markup.matchAll(/<input\b[^>]*class="cleanup-switch"[^>]*>/g)].map(match=>match[0]);
  assert.equal(tags.length,8);
  assert.ok(tags.every(tag=>! /\bchecked\b/.test(tag)));
  assert.match(markup,/<button[^>]*id="clean"[^>]*disabled/);
  assert.equal(f.elements.get('#clean').disabled,true);
  assert.deepEqual(f.calls,[]);
  assert.match(markup,/Caches de jogos e drivers/);
  assert.match(markup,/Limpeza do sistema/);
  for(const title of ['Cache DirectX','Cache NVIDIA DirectX','Cache NVIDIA OpenGL','Limpar arquivos temporários','Limpar arquivos Prefetch','Esvaziar Lixeira','Limpar cache do Windows Update','Limpar cache de miniaturas'])assert.ok(markup.includes(title));
});

test('shader caches and system cleanup share the same selection and warn about recompilation',async()=>{
  const f=await fixture({confirmations:[true]});
  f.select('directx','nvidia-dx','nvidia-gl','temp');await f.click();
  assert.equal(f.calls.length,1);
  assert.deepEqual(Array.from(f.calls[0].ids),['directx','nvidia-dx','nvidia-gl','temp']);
  assert.match(f.prompts[0].text,/shaders serão recompilados/);
  assert.equal(f.calls[0].confirmRecycleBin,undefined);
  for(const name of ['Cache DirectX','Cache NVIDIA DirectX','Cache NVIDIA OpenGL','Limpar arquivos temporários'])assert.ok(f.elements.get('#cleanup-report-items').innerHTML.includes(name));
});

test('cancelling permanent deletion never calls the backend', async()=>{
  const f=await fixture({confirmations:[false]});
  f.select('temp');await f.click();
  assert.equal(f.prompts.length,1);
  assert.equal(f.calls.length,0);
  assert.equal(f.elements.get('#clean').disabled,false);
});

test('recycle bin has an extra cancellation boundary', async()=>{
  const f=await fixture({confirmations:[true,false]});
  f.select('recyclebin');await f.click();
  assert.equal(f.prompts.length,2);
  assert.match(f.prompts[1].title,/Lixeira/);
  assert.equal(f.calls.length,0);
});

test('confirmed recycle bin request carries both confirmations and deselects afterward', async()=>{
  const f=await fixture({confirmations:[true,true]});
  f.select('temp','recyclebin');await f.click();
  assert.equal(f.calls.length,1);
  assert.deepEqual(Array.from(f.calls[0].ids),['temp','recyclebin']);
  assert.equal(f.calls[0].confirmed,true);
  assert.equal(f.calls[0].confirmRecycleBin,true);
  assert.equal(f.inputs.some(input=>input.checked),false);
  assert.equal(f.elements.get('#clean').disabled,true);
});

test('unsupported selections cannot reach the executor, including programmatic checked state',async()=>{
  const f=await fixture({confirmations:[true],unsupported:['prefetch']});
  f.select('prefetch');await f.click();
  assert.equal(f.calls.length,0);
});

test('partial failures retain item errors and actual deleted bytes',async()=>{
  const result={ok:false,partial:true,message:'Falha parcial',results:[{id:'temp',status:'partial',deletedBytes:2048,deletedFiles:2,skipped:3,errors:['Arquivo em uso']}],lastAttemptedAt:'2026-11-04T12:00:00Z'};
  const f=await fixture({confirmations:[true],result});
  f.select('temp');await f.click();
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].confirmRecycleBin,undefined);
  const report=f.elements.get('#cleanup-report-items').innerHTML;
  assert.match(report,/Parcial/);assert.match(report,/2\.0 KB/);assert.match(report,/Arquivo em uso/);assert.match(report,/Ignorados: 3/);
  assert.equal(f.toasts.at(-1).error,true);
  assert.equal(f.elements.get('#last-cleanup').textContent,'');
});

test('missing per-item results never produce invented byte counts or a confirmed deletion',async()=>{
  const f=await fixture({confirmations:[true],result:{ok:false,message:'Não executado',results:[]}});
  f.select('temp');await f.click();
  const report=f.elements.get('#cleanup-report-items').innerHTML;
  assert.match(report,/Não foi possível confirmar a exclusão/);
  assert.doesNotMatch(report,/0 B/);
});


test('supported cleanup item still exposes its scope limitation',async()=>{
  const reason='A pasta Temp do Windows exige administrador; apenas pasta do usuário será considerada.';
  const f=await fixture({reasons:{temp:reason}});
  const markup=f.elements.get('#content').innerHTML;
  assert.ok(markup.includes(reason));
  assert.match(markup,/class="cleanup-reason"/);
  assert.equal(f.inputs.find(input=>input.value==='temp').disabled,false);
});
