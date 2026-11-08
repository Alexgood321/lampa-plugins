'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'kp_rating_pro.js'), 'utf8');
new vm.Script(src);
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
let pass = 0;
function fakeClassList(init) {
    let classes = new Set((init||'').split(' ').filter(Boolean));
    return {contains:x=>classes.has(x),add:(...a)=>a.forEach(x=>classes.add(x)),remove:(...a)=>a.forEach(x=>classes.delete(x))};
}
class Node {
    constructor(type='div',classes=''){
        this.tagName=type.toUpperCase();this.nodeType=1;this.className=classes;
        this.classList=fakeClassList(classes);this.children=[];
        this.parentNode=null;this.isConnected=true;this.textContent='';this.attributes={};
    }
    appendChild(child){child.parentNode=this;this.children.push(child);return child;}
    querySelector(sel){
        if(sel==='.card__view .card__vote'){
            const view=this.querySelector('.card__view');return view&&view.querySelector('.card__vote');
        }
        const name=sel.startsWith('.')?sel.slice(1):sel;
        const stack=[...this.children];
        while(stack.length){const e=stack.shift();if(e.className.split(' ').includes(name)||e.classList.contains(name)) return e;stack.unshift(...e.children);}
        return null;
    }
    querySelectorAll(sel){
        const name=sel.slice(1), out=[],stack=[...this.children];
        while(stack.length){const e=stack.shift();if(e.className.split(' ').includes(name))out.push(e);stack.unshift(...e.children);}
        return out;
    }
    matches(sel){return sel==='.card' && this.className.split(' ').includes('card');}
    setAttribute(k,v){this.attributes[k]=v;}
    removeAttribute(k){delete this.attributes[k];}
    removeChild(child){let i=this.children.indexOf(child);if(i>=0)this.children.splice(i,1);}
}
function environment({kpSource=null,ratingCache=null,budget=null,ownCache=null}={}){
    const store=new Map();
    if(ratingCache)store.set('kp_rating',ratingCache);
    if(ownCache)store.set('kp_rating_pro_cache_v1',ownCache);
    if(budget)store.set('kp_rating_pro_budget_v1',budget);
    const body=new Node('body');const head=new Node('head');
    let io=null, mo=null;const settings=[];
    class Intersection {
        constructor(cb){this.cb=cb;this.watched=[];io=this;}
        observe(el){this.watched.push(el);}disconnect(){}
        fire(el){this.cb([{target:el,isIntersecting:true}]);}
    }
    class Mutation {
        constructor(cb){this.cb=cb;mo=this;}observe(){}disconnect(){}
    }
    const doc={body,head,hidden:false,getElementById:()=>null,
        createElement:(type)=>new Node(type),addEventListener:()=>{}};
    const Lampa={Storage:{get:(key,def)=>store.has(key)?store.get(key):def,
        set:(key,val)=>store.set(key,val),cache:(key,max,def)=>store.has(key)?store.get(key):def},
        Api:{sources:kpSource?{KP:kpSource}:{}},SettingsApi:{addComponent:()=>{},addParam:p=>settings.push(p)},
        Listener:{follow:()=>{}}};
    const window={};
    vm.runInNewContext(src,{window,document:doc,Lampa,IntersectionObserver:Intersection,MutationObserver:Mutation,
        setTimeout,clearTimeout,Date,console,WeakMap,Map,Set}, {filename:'kp_rating_pro.js'});
    const card=(data,initial='8.1')=>{
        const el=new Node('div','card'), view=new Node('div','card__view'),vote=new Node('div','card__vote');
        vote.textContent=initial;view.appendChild(vote);el.appendChild(view);el.card_data=data;
        body.appendChild(el);return el;
    };
    return {store,settings,Lampa,window,card,body,head,getObserver:()=>io,getMutation:()=>mo};
}
async function test(name,fn){await fn();pass++;console.log('✓',name);}
(async()=>{
await test('KP rating from card replaces native vote, without API request',async()=>{
    const app=environment();const el=app.card({id:'KP_1',source:'KP',type:'movie',title:'Test',kp_rating:8.6,vote_average:8.6});
    app.window.kp_rating_pro_rescan();
    const vote=el.querySelector('.card__vote');
    assert.equal(vote.textContent,'8.6');assert.equal(vote.attributes['aria-label'],'Кинопоиск 8.6');
    assert.equal(app.window.KP_RATING_PRO_STATS.requests,0);
    app.store.set('kp_rating_pro_mode','tmdb');app.window.kp_rating_pro_rescan();
    assert.equal(vote.textContent,'8.6');assert.equal(vote.attributes['aria-label'],'КП 8.6');
    assert.ok(vote.classList.contains('kp-rating-pro-native-kp'));
    app.window.kp_rating_pro_destroy();
});
await test('Existing rating.js cached KP value is reused without API',async()=>{
    const old={156:{kp:9.2,timestamp:Date.now()}};
    const app=environment({ratingCache:old});
    const el=app.card({id:156,source:'tmdb',type:'movie',title:'Test',vote_average:6.5});
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'9.2');
    assert.equal(app.window.KP_RATING_PRO_STATS.externalCacheHits,1);
    assert.equal(app.window.KP_RATING_PRO_STATS.requests,0);
    app.window.kp_rating_pro_destroy();
});
await test('Invisible posters produce no requests until IntersectionObserver event',async()=>{
    let calls=0;
    const KP={list:(args,done)=>{calls++;done({results:[],total_pages:1});}};
    const app=environment({kpSource:KP});
    const el=app.card({id:99,source:'tmdb',title:'Test movie',type:'movie',release_date:'2026-01-01',vote_average:6.4});
    app.getMutation().cb([{addedNodes:[el]}]);await wait(110);
    assert.equal(calls,0);
    app.getObserver().fire(el);await wait(30);
    assert.equal(calls,1);
    assert.equal(el.querySelector('.card__vote').textContent,'8.1');
    app.window.kp_rating_pro_destroy();
});
await test('Exact Kinopoisk match by title/year can update poster, wrong matches rejected',async()=>{
    const KP={list:(params,done)=>done({results:[
        {id:'KP_1',type:'movie',title:'Some other film',release_date:'2026',kp_rating:9.9,vote_count:2000},
        {id:'KP_2',type:'movie',title:'Верное название',release_date:'2026',kp_rating:8.8,vote_count:1000},
        {id:'KP_3',type:'movie',title:'Верное название',release_date:'2000',kp_rating:9.2,vote_count:6000}
    ]})};
    const app=environment({kpSource:KP});
    const el=app.card({id:42,source:'tmdb',type:'movie',title:'Верное название',release_date:'2026-09-01',vote_average:7.6});
    app.window.kp_rating_pro_rescan();await wait(30);
    assert.equal(el.querySelector('.card__vote').textContent,'8.8');
    assert.equal(app.window.KP_RATING_PRO_STATS.matched,1);
    app.window.kp_rating_pro_destroy();
});
await test('No confident match preserves original TMDB rating',async()=>{
    const KP={list:(params,done)=>done({results:[{id:'KP_5',type:'movie',title:'Completely different',kp_rating:9.9,release_date:'2026'}]})};
    const app=environment({kpSource:KP});
    const el=app.card({id:43,source:'tmdb',type:'movie',title:'Film A',release_date:'2026',vote_average:6.9},'6.9');
    app.window.kp_rating_pro_rescan();await wait(30);
    assert.equal(el.querySelector('.card__vote').textContent,'6.9');
    assert.equal(app.window.KP_RATING_PRO_STATS.misses,1);
    app.window.kp_rating_pro_destroy();
});
await test('Daily budget blocks poster lookups and preserves native rating',async()=>{
    let calls=0;
    const KP={list:()=>calls++};
    const app=environment({kpSource:KP,budget:{day:new Date().toISOString().slice(0,10),count:50}});
    const el=app.card({id:17,title:'Film',type:'movie',vote_average:8},'8.0');
    app.window.kp_rating_pro_rescan();await wait(30);
    assert.equal(calls,0);assert.equal(el.querySelector('.card__vote').textContent,'8.0');
    assert.equal(app.window.KP_RATING_PRO_STATS.source,'daily_limit');
    app.window.kp_rating_pro_destroy();
});
await test('Both ratings mode retains KP as primary and displays TMDB separately',async()=>{
    const app=environment();app.store.set('kp_rating_pro_mode','both');
    const el=app.card({id:44,source:'tmdb',type:'tv',kp_rating:8.3,first_air_date:'2026',vote_average:7.1});
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'8.3');
    assert.ok(el.querySelector('.kp-rating-pro-tmdb'));
    app.window.kp_rating_pro_destroy();
});

 await test('Native TMDB source label appears without waiting for KP',async()=>{
    const app=environment({budget:{day:new Date().toISOString().slice(0,10),count:50}});
    const el=app.card({id:700,source:'tmdb',type:'movie',title:'Film',vote_average:8.5},'8.5');
    app.window.kp_rating_pro_rescan();
    const vote=el.querySelector('.card__vote');
    assert.equal(vote.textContent,'8.5');
    assert.ok(vote.classList.contains('kp-rating-pro-native-tmdb'));
    assert.equal(vote.attributes['aria-label'],'TMDB 8.5');
    app.window.kp_rating_pro_destroy();
 });
 await test('CUB native rating is correctly labeled CUB',async()=>{
    const app=environment();app.store.set('kp_rating_pro_mode','tmdb');
    const el=app.card({id:701,source:'cub',type:'movie',title:'CUB film',cub_hundred_rating:7.7,vote_average:8.8},'7.7');
    app.window.kp_rating_pro_rescan();
    const vote=el.querySelector('.card__vote');
    assert.equal(vote.textContent,'7.7');
    assert.ok(vote.classList.contains('kp-rating-pro-native-cub'));
    assert.ok(!vote.classList.contains('kp-rating-pro-native-tmdb'));
    app.window.kp_rating_pro_destroy();
 });
 await test('Both mode uses CUB label for native CUB score',async()=>{
    const app=environment();app.store.set('kp_rating_pro_mode','both');
    const el=app.card({id:702,source:'cub',type:'tv',kp_rating:8.7,cub_hundred_rating:8.1,vote_average:7.5});
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'8.7');
    assert.equal(el.querySelector('.kp-rating-pro-tmdb').textContent,'CUB 8.1');
    app.window.kp_rating_pro_destroy();
 });
 await test('Unverified source and CUB fire counters receive no false labels',async()=>{
    const app=environment();app.store.set('kp_rating_pro_mode','tmdb');
    const u=app.card({id:703,source:'unverified',type:'movie',vote_average:6.4},'6.4');
    const f=app.card({id:704,source:'cub',type:'movie',cub_hundred_fire:765,cub_hundred_rating:7.2,vote_average:8.0},'765');
    app.window.kp_rating_pro_rescan();
    assert.ok(!u.querySelector('.card__vote').classList.contains('kp-rating-pro-native'));
    assert.ok(!f.querySelector('.card__vote').classList.contains('kp-rating-pro-native'));
    assert.equal(f.querySelector('.card__vote').textContent,'765');
    app.window.kp_rating_pro_destroy();
 });
 await test('Changing the rating mode never leaves outdated labels',async()=>{
    const app=environment();
    const el=app.card({id:705,source:'tmdb',type:'movie',kp_rating:9.1,vote_average:7.8},'7.8');
    app.window.kp_rating_pro_rescan();
    const vote=el.querySelector('.card__vote');
    assert.equal(vote.textContent,'9.1');
    assert.ok(vote.classList.contains('kp-rating-pro-kp'));
    app.store.set('kp_rating_pro_mode','tmdb');
    app.window.kp_rating_pro_rescan();
    assert.equal(vote.textContent,'7.8');
    assert.ok(vote.classList.contains('kp-rating-pro-native-tmdb'));
    assert.ok(!vote.classList.contains('kp-rating-pro-kp'));
    app.store.set('kp_rating_pro_mode','kp');
    app.window.kp_rating_pro_rescan();
    assert.equal(vote.textContent,'9.1');
    assert.ok(vote.classList.contains('kp-rating-pro-kp'));
    assert.ok(!vote.classList.contains('kp-rating-pro-native-tmdb'));
    app.window.kp_rating_pro_destroy();
 });
 
 await test('IMDb from existing rating.js cache is selected when KP is unavailable',async()=>{
    const old={156:{kp:0,imdb:8.4,timestamp:Date.now()}};
    const app=environment({ratingCache:old});
    const el=app.card({id:156,source:'tmdb',type:'movie',title:'Film',vote_average:7.1},'7.1');
    app.window.kp_rating_pro_rescan();
    const vote=el.querySelector('.card__vote');
    assert.equal(vote.textContent,'8.4');
    assert.equal(vote.attributes['aria-label'],'IMDb 8.4');
    assert.ok(vote.classList.contains('kp-rating-pro-imdb'));
    assert.equal(app.window.KP_RATING_PRO_STATS.requests,0);
    app.window.kp_rating_pro_destroy();
 });
 await test('KP stays above IMDb even when the IMDb numeric rating is higher',async()=>{
    const old={158:{kp:7.3,imdb:9.1,timestamp:Date.now()}};
    const app=environment({ratingCache:old});
    const el=app.card({id:158,source:'tmdb',type:'movie',vote_average:8.4});
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'7.3');
    assert.equal(el.querySelector('.card__vote').attributes['aria-label'],'Кинопоиск 7.3');
    app.window.kp_rating_pro_destroy();
 });
 await test('Direct IMDb value from KP source is trusted and does not request API',async()=>{
    const app=environment();
    const el=app.card({id:'KP_100',source:'KP',type:'tv',imdb_rating:8.7,kp_rating:0,vote_average:0},'8.1');
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'8.7');
    assert.equal(el.querySelector('.card__vote').attributes['aria-label'],'IMDb 8.7');
    assert.equal(app.window.KP_RATING_PRO_STATS.requests,0);
    app.window.kp_rating_pro_destroy();
 });
 await test('IMDb from KP network match works even with no Kinopoisk rating',async()=>{
    const KP={list:(params,done)=>done({results:[{id:'KP_44',type:'movie',title:'IMDb Only',
        imdb_rating:8.2,kp_rating:0,release_date:'2026'}]})};
    const app=environment({kpSource:KP});
    const el=app.card({id:805,source:'tmdb',type:'movie',title:'IMDb Only',release_date:'2026',vote_average:7.0},'7.0');
    app.window.kp_rating_pro_rescan();await wait(30);
    assert.equal(el.querySelector('.card__vote').textContent,'8.2');
    assert.equal(el.querySelector('.card__vote').attributes['aria-label'],'IMDb 8.2');
    assert.equal(app.window.KP_RATING_PRO_STATS.matched,1);
    app.window.kp_rating_pro_destroy();
 });
 await test('Verified TMDB outranks verified CUB when KP and IMDb are absent',async()=>{
    const app=environment();
    const el=app.card({id:806,source:'tmdb',type:'movie',title:'Hybrid',
        cub_hundred_rating:8.8,vote_average:7.2},'8.8');
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'7.2');
    assert.equal(el.querySelector('.card__vote').attributes['aria-label'],'TMDB 7.2');
    app.window.kp_rating_pro_destroy();
 });
 await test('CUB remains the only proven fallback if source does not establish TMDB provenance',async()=>{
    const app=environment();
    const el=app.card({id:807,source:'cub',type:'movie',
        cub_hundred_rating:8.2,vote_average:9.6},'8.2');
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'8.2');
    assert.equal(el.querySelector('.card__vote').attributes['aria-label'],'CUB 8.2');
    app.window.kp_rating_pro_destroy();
 });
 await test('Auto plus secondary shows IMDb before TMDB with KP selected',async()=>{
    const app=environment();app.store.set('kp_rating_pro_mode','both');
    const el=app.card({id:808,source:'tmdb',type:'movie',kp_rating:8.4,
        imdb_rating:9.0,vote_average:8.5});
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'8.4');
    assert.equal(el.querySelector('.kp-rating-pro-tmdb').textContent,'IMDb 9.0');
    app.window.kp_rating_pro_destroy();
 });
 await test('IMDb selected after cached miss does not perform repeat API calls',async()=>{
    const KP={list:()=>{throw new Error('should not be called')}};
    const app=environment({kpSource:KP});
    const el=app.card({id:809,source:'tmdb',type:'movie',imdb_rating:8.9,vote_average:7.2});
    app.store.set('kp_rating_pro_budget_v1',{day:new Date().toISOString().slice(0,10),count:50});
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'8.9');
    app.window.kp_rating_pro_destroy();
 });

 
 await test('Old negative KP cache does not suppress IMDb in rating.js cache',async()=>{
    const cached={910:{kp:0,imdb:8.6,timestamp:Date.now()}};
    const oldOwn={'tmdb:movie:910':{rate:0,expires:Date.now()+86400000}};
    const app=environment({ratingCache:cached,ownCache:oldOwn});
    const el=app.card({id:910,source:'tmdb',type:'movie',vote_average:7.2},'7.2');
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'8.6');
    assert.equal(el.querySelector('.card__vote').attributes['aria-label'],'IMDb 8.6');
    app.window.kp_rating_pro_destroy();
 });
 await test('CUB IDs are not confused with rating.js TMDB cache keys',async()=>{
    const old={921:{kp:9.9,imdb:9.9,timestamp:Date.now()}};
    const app=environment({ratingCache:old,budget:{day:new Date().toISOString().slice(0,10),count:50}});
    const el=app.card({id:921,source:'cub',type:'movie',cub_hundred_rating:7.4},'7.4');
    app.window.kp_rating_pro_rescan();
    assert.equal(el.querySelector('.card__vote').textContent,'7.4');
    assert.ok(el.querySelector('.card__vote').classList.contains('kp-rating-pro-native-cub'));
    app.window.kp_rating_pro_destroy();
 });

 console.log(`PASS KP Rating Pro: ${pass} tests`);
})().catch(err=>{console.error(err);process.exitCode=1;});
