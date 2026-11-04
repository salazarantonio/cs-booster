'use strict';
(()=>{
  class ReadCache {
    constructor({ttl=10000,now=()=>Date.now()}={}){this.ttl=ttl;this.now=now;this.values=new Map();this.pending=new Map();this.epoch=0;}
    read(key,load){
      const saved=this.values.get(key);
      if(saved&&this.now()-saved.at<this.ttl)return Promise.resolve(saved.value);
      if(this.pending.has(key))return this.pending.get(key);
      const epoch=this.epoch;
      const promise=Promise.resolve().then(load).then(value=>{
        if(epoch!==this.epoch)return this.read(key,load);
        this.values.set(key,{value,at:this.now()});
        return value;
      }).finally(()=>{if(this.pending.get(key)===promise)this.pending.delete(key);});
      this.pending.set(key,promise);
      return promise;
    }
    clear(){this.epoch++;this.values.clear();this.pending.clear();}
  }

  class PageRouter {
    constructor({content,render,shell,onStart=()=>{},onReady=()=>{},onError=()=>{},now=()=>Date.now(),ttl=10000}){
      Object.assign(this,{content,render,shell,onStart,onReady,onError,now,ttl});
      this.views=new Map();this.current=null;this.generation=0;
    }
    invalidate(){for(const view of this.views.values())view.dirty=true;}
    navigate(page,{force=false}={}){
      const generation=++this.generation;
      if(this.current){const old=this.views.get(this.current);if(old)old.nodes=Array.from(this.content.childNodes);}
      this.current=page;
      let view=this.views.get(page);
      if(!view){view={nodes:null,ready:false,dirty:false,at:0};this.views.set(page,view);}
      const fresh=view.ready&&!view.dirty&&this.now()-view.at<this.ttl&&!force;
      if(view.nodes)this.content.replaceChildren(...view.nodes);
      else this.content.innerHTML=this.shell(page);
      this.content.dataset.page=page;
      this.content.dataset.pageReady=fresh?'true':'false';
      this.content.dataset.cacheHit=fresh?'true':'false';
      this.content.inert=!fresh;
      this.content.setAttribute('aria-busy',fresh?'false':'true');
      this.onStart(page,{cached:fresh});
      if(fresh){this.onReady(page,{cached:true});return Promise.resolve({cached:true});}
      const isCurrent=()=>generation===this.generation&&page===this.current;
      return Promise.resolve().then(()=>this.render(page,{isCurrent})).then(()=>{
        if(!isCurrent())return {superseded:true};
        view.nodes=Array.from(this.content.childNodes);view.ready=true;view.dirty=false;view.at=this.now();
        this.content.inert=false;this.content.dataset.pageReady='true';this.content.setAttribute('aria-busy','false');
        this.onReady(page,{cached:false});return {cached:false};
      }).catch(error=>{
        if(!isCurrent())return {superseded:true};
        view.ready=false;view.dirty=true;
        this.content.inert=false;this.content.dataset.pageReady='false';this.content.setAttribute('aria-busy','false');
        this.onError(page,error);return {error};
      });
    }
  }
  window.BoosterNavigation=Object.freeze({ReadCache,PageRouter});
})();
