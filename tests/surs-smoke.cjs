'use strict';
// SURS Pro smoke/regression tests. Run: node tests/surs-smoke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'surs.js'), 'utf8');
const editorSource = fs.readFileSync(path.join(__dirname, '..', 'surs-editor.js'), 'utf8');
const readableSource = fs.readFileSync(path.join(__dirname, '..', 'build', 'surs.source.txt'), 'utf8');
const source = mainSource + '\n' + editorSource;
new vm.Script(source, { filename: 'surs.js' });
let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    process.stdout.write('✓ ' + name + '\n');
}
function boot({ ready = true, saved = null, tv = false, coarse = false, touchPoints = 0, failSourceRegistrationOnce = false } = {}) {
    const stored = new Map();
    if (saved !== null) stored.set('surs_fixed_shelves_v2', saved);
    const timers = [];
    const warnings = [];
    let contentRowsCalls = 0;
    const added = [];
    const settings = [];
    const components = [];
    const navigations = [];
    const window = { appready: true, matchMedia: () => ({matches: coarse}), navigator: {maxTouchPoints: touchPoints} };
    const Lampa = {
        Reguest: function () {},
        Api: {
            sources: ready ? { tmdb: {
                get: (url, params, done) => done({ results: [{ id: 123, title: 'Тестовый фильм' }] })
            }} : {},
            partNext: (parts, limit, loaded, empty) => {
                const picked = parts.filter(x => typeof x === 'function').slice(0, limit);
                const output = [];
                picked.forEach(fn => fn(value => {
                    if (value && Array.isArray(value.results) && value.results.length) output.push(value);
                }));
                picked.forEach(fn => { const idx = parts.indexOf(fn); if (idx >= 0) parts[idx] = false; });
                if (output.length) loaded(output);
                else if (typeof empty === 'function') empty();
            }
        },
        ContentRows: {
            add: row => added.push(row),
            call: () => { contentRowsCalls++; }
        },
        Storage: {
            get: (key, fallback) => stored.has(key) ? stored.get(key) : fallback,
            field: key => stored.has(key) ? stored.get(key) : true,
            set: (key, value) => stored.set(key, value)
        },
        SettingsApi: {
            addComponent: component => components.push(component),
            addParam: param => settings.push(param)
        },
        Activity: { active: () => true, replace: value => navigations.push(value) },
        Listener: { follow: () => {} },
        Noty: { show: () => {} },
        Platform: { screen: type => type === 'tv' && tv },
        Favorite: { continues: () => [] },
        Maker: { make: (type, data, choose) => {
            if (typeof choose === 'function') return choose({only: (...selected) => selected});
            return { type, data };
        }}
    };
    if (failSourceRegistrationOnce) {
        let shouldFail = true;
        Object.defineProperty(Lampa.Api.sources, 'SURS', {
            configurable: true,
            enumerable: true,
            set(value) {
                if (shouldFail) {
                    shouldFail = false;
                    throw new Error('Injected registration failure');
                }
                Object.defineProperty(this, 'SURS', {
                    configurable: true, enumerable: true, writable: true, value
                });
            }
        });
    }
    const $ = target => {
        if (target && typeof target.addClass === 'function') {
            if (!target.css) target.css = (key, value) => { if (!target.styles) target.styles = {}; target.styles[key] = value; return target; };
            if (!target.attr) target.attr = (key, value) => { if (!target.attrs) target.attrs = {}; target.attrs[key] = value; return target; };
            return target;
        }
        return { length: 1, append: () => {}, html: () => {} };
    };
    const ctx = {
        window, Lampa, $,
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
        clearTimeout: () => {},
        console: { log: () => {}, error: (...m) => warnings.push(m), warn: (...m) => warnings.push(m) }
    };
    vm.runInNewContext(mainSource, ctx, { filename: 'surs.js' });
    const rows = () => window.LampaShelfManager.getSavedShelves();
    const getMain = (sourceId = 'SURS') => {
        let result;
        Lampa.Api.sources[sourceId].main({ source: sourceId }, x => { result = x; }, () => { result = []; });
        return result;
    };
    return { ctx, stored, timers, warnings, window, Lampa, added, settings, components, navigations, rows, getMain,
        contentRowsCalls: () => contentRowsCalls };
}



test('cold boot repairs only a mismatched TMDB main and never other screens', () => {
    const app = boot({saved:[{id:'nav_buttons',enabled:true}]});
    app.Lampa.Activity.active = () => ({component:'main',source:'tmdb'});
    const rescue = app.timers.find(x=>x.ms===650);
    assert.ok(rescue);
    rescue.fn();
    const refresh = app.timers.find(x=>x.ms===80);
    assert.ok(refresh);
    refresh.fn();
    assert.equal(app.navigations.length,1);
    assert.equal(app.navigations[0].source,'SURS');
    rescue.fn();
    assert.equal(app.navigations.length,1);
    assert.equal(app.window.SURS_PERFORMANCE.boot_rescue.from,'tmdb');

    const custom = boot();
    custom.Lampa.Activity.active = () => ({component:'main',source:'KP'});
    custom.timers.find(x=>x.ms===650).fn();
    assert.equal(custom.navigations.length,0);

    const full = boot();
    full.Lampa.Activity.active = () => ({component:'full',source:'tmdb'});
    full.timers.find(x=>x.ms===650).fn();
    assert.equal(full.navigations.length,0);
});
test('discovered shelf storage batching preserves latest metadata and writes once', () => {
    const app = boot();
    const write = app.Lampa.Storage.set;
    let writes=0;
    app.Lampa.Storage.set = (key,value) => {
        if(key==='surs_discovered_shelves_v2') writes++;
        return write(key,value);
    };
    for(let i=0;i<25;i++)
        app.window.surs_register_shelf({id:'debounce_'+i,title:'Row '+i});
    assert.equal(writes,0);
    const scheduled = app.timers.filter(x=>x.ms===400);
    assert.ok(scheduled.length>=25);
    scheduled.forEach(x=>x.fn());
    assert.equal(writes,1);
    assert.equal(app.stored.get('surs_discovered_shelves_v2').filter(x => x.id.startsWith('debounce_')).length,25);
    app.window.surs_register_shelf({id:'debounce_24',title:'Last modified'});
    app.timers.filter(x=>x.ms===400).slice(-1)[0].fn();
    assert.equal(writes,2);
    assert.equal(app.stored.get('surs_discovered_shelves_v2').find(x=>x.id==='debounce_24').title,'Last modified');
});
test('US8 cached preview returns immediately without additional network requests', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    const now=new Date().toISOString().slice(0,10);
    const entry={id:991,title:'Cached film',release_date:now,original_language:'en',
        poster_path:'/poster',overview:'Story',vote_average:8.8,vote_count:1200,genre_ids:[18]};
    let requests=0;
    app.Lampa.Api.sources.SURS.get=(url,p,cb)=> {
        requests++;
        cb({results:entry.type==='tv'?[]:[entry],total_pages:1});
    };
    const first=app.getMain();
    assert.equal(first[0].results[0].id,991);
    const before=requests;
    const again=app.getMain();
    assert.equal(again[0].results[0].id,991);
    assert.equal(requests,before);
    assert.equal(app.window.SURS_PERFORMANCE.us8_preview.cache_hit,true);
});
test('KP cached preview works when source is temporarily unavailable', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    const year=String(new Date().getFullYear());
    const record={id:'KP_932',source:'KP',type:'movie',
        kp_rating:8.6,vote_count:380,release_date:year,
        production_countries:[{name:'США'}],genres:[{name:'драма'}]};
    app.Lampa.Api.sources.KP={list:(p,cb)=>cb({results:[record],total_pages:1})};
    assert.equal(app.getMain()[0].results.length,1);
    delete app.Lampa.Api.sources.KP;
    const cached=app.getMain();
    assert.equal(cached[0].results[0].id,'KP_932');
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.status,'cached');
});


test('KP source autoloads a pinned original dependency and shares one download', () => {
    const app = boot({saved:[{id:'kp_new_8',enabled:true}]});
    const scripts = [];
    app.Lampa.Api.partNext = (parts, limit, loaded, empty) => {
        parts[0](row => loaded([row]));
    };
    app.ctx.document = {
        createElement: tag => {
            assert.equal(tag,'script');
            return {async:false,src:'',onload:null,onerror:null};
        },
        head: {appendChild: script => scripts.push(script)}
    };
    const results = [];
    const api = app.Lampa.Api.sources.SURS;
    api.main({}, value=>results.push(value), ()=>results.push([]));
    api.main({}, value=>results.push(value), ()=>results.push([]));
    assert.equal(scripts.length,1);
    assert.match(scripts[0].src,/nb557\/plugins@cde2cf057e6634df43553fe8deeaef5030f95945\/kp_source\.js/);
    const yr=String(new Date().getFullYear());
    let calls=0;
    app.Lampa.Api.sources.KP={list:(args,done)=>{
        calls++;
        done({results:[{id:'KP_auto_'+calls,source:'KP',
            type:args.filter_url.includes('FILM')?'movie':'tv',
            kp_rating:8.6,vote_count:450,release_date:yr,first_air_date:yr,
            production_countries:[{name:'США'}],genres:[{name:'драма'}]}],total_pages:1});
    }};
    scripts[0].onload();
    assert.equal(results.length,2);
    assert.equal(results[0][0].title,'Новинки США · КП 7,5+');
    assert.equal(results[0][0].results.length,3);
    assert.equal(calls,6); // Two independent main() invocations, three requests each.
    assert.equal(app.window.SURS_PERFORMANCE.kp8_dependency.status,'ready');
});
test('KP source reports an automatic dependency download failure', () => {
    const app = boot({saved:[{id:'kp_new_8',enabled:true}]});
    const scripts=[];
    app.Lampa.Api.partNext = (parts, limit, loaded, empty) => {
        parts[0](row => row.results && row.results.length ? loaded([row]) : empty());
    };
    app.ctx.document = {
        createElement:()=>({}),
        head:{appendChild:s=>scripts.push(s)}
    };
    const messages=[];
    app.Lampa.Noty.show=message=>messages.push(message);
    let data;
    app.Lampa.Api.sources.SURS.main({},x=>data=x,()=>data=[]);
    assert.equal(scripts.length,1);
    scripts[0].onerror();
    assert.ok(Array.isArray(data) && data.length===0);
    assert.equal(app.window.SURS_PERFORMANCE.kp8_dependency.status,'failed');
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.failed_reason,'script_download_failed');
    assert.ok(messages.some(m=>m.includes('не удалось загрузить источник')));
});

test('KP 8+ is registered and enabled directly below navigation by default', () => {
    const app = boot();
    const kp = app.window.LampaShelfManager.getAllShelves().find(x => x.id === 'kp_new_8');
    assert.ok(kp);
    assert.equal(kp.def, true);
    assert.deepEqual(Array.from(app.rows().slice(0,3),x=>x.id),['nav_buttons','kp_new_8','us_new_8']);
    assert.equal(app.rows()[1].enabled, true);
    assert.ok(mainSource.includes('Lampa.Api.sources.KP'));
    assert.ok(!mainSource.includes('cors.kp556.workers.dev'));
});
test('KP 8+ uses native source filters, excludes weak ratings and offers More', () => {
    const app = boot({saved:[{id:'kp_new_8',title:'Новинки США · КП 7,5+',enabled:true}]});
    const requests = [];
    app.Lampa.Api.sources.KP = {
        kpFilters: (params, cb) => cb([], [{id:1,title:'США'}], {}, {'США':1}),
        list: (params, ok) => {
            requests.push(params.filter_url + '&page=' + params.page);
            const type = /type=FILM(?:&|$)/.test(params.filter_url) ? 'movie' : 'tv';
            const current = new Date().getFullYear();
            const card = (id, rating, votes, genre) => ({
                id:'KP_' + id, kinopoisk_id:id, source:'KP', type,
                img:'poster', kp_rating:rating, vote_count:votes,
                release_date:String(current), first_air_date:String(current),
                genres:genre?[{name:genre}]:[],
                production_countries:[{name:'США'}]
            });
            ok({results:[card(requests.length * 10,8.5,500,'драма'),
                         card(requests.length * 10+1,8.2,0,'драма'),
                         card(requests.length * 10+3,8.1,10,'драма'),
                         card(requests.length * 10+2,9.1,500,'аниме')],
                total_pages:2});
        }
    };
    const result = app.getMain();
    assert.equal(result.length,1);
    assert.equal(result[0].title,'Новинки США · КП 7,5+');
    assert.ok(result[0].results.length > 0);
    assert.ok(result[0].results.every(x=>x.kp_rating >= 8 && x.source === 'KP'));
    assert.ok(requests.length === 6);
    assert.ok(result[0].results.some(x => x.vote_count === 0));
    assert.ok(result[0].results.every(x => x.vote_count === 0 || x.vote_count >= 150));
    assert.ok(requests.every(x=>x.includes('countries=1') && x.includes('ratingFrom=7.5') && x.includes('yearFrom=')));
    assert.equal(result[0].url,'surs_kp_new_8');
    let catalog;
    const p = {url:'surs_kp_new_8',page:1};
    app.Lampa.Api.sources.SURS.list(p, data=>{catalog=data;}, ()=>{});
    assert.equal(catalog.url, 'surs_kp_new_8');
    assert.ok(catalog.results.length);
});


test('KP 8+ does not depend on filters endpoint and uses documented US country id', () => {
    const app = boot({saved:[{id:'kp_new_8',enabled:true}]});
    const calls = [];
    const notes = [];
    app.Lampa.Noty.show = msg => notes.push(msg);
    app.Lampa.Api.sources.KP = {
        list: (params, success) => {
            calls.push(params.filter_url);
            const type = params.filter_url.includes('type=FILM') ? 'movie' : 'tv';
            const year = String(new Date().getFullYear());
            success({results:[{
                id:'KP_' + calls.length, source:'KP', type,
                kp_rating:8.4, vote_count:350, release_date:year, first_air_date:year,
                production_countries:[{name:'США'}], genres:[{name:'драма'}]
            }], total_pages:1});
        }
    };
    const result = app.getMain();
    assert.equal(calls.length,3);
    assert.ok(calls.every(query=>query.includes('countries=1')));
    assert.ok(result.some(row=>row.title==='Новинки США · КП 7,5+'));
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.status,'ready');
    assert.equal(notes.length,0);
});
test('KP 8+ explains missing source instead of reporting incorrect ratings', () => {
    const app = boot({saved:[{id:'kp_new_8',enabled:true}]});
    const notes=[];
    app.Lampa.Noty.show = note => notes.push(note);
    assert.equal(app.getMain().length,0);
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.status,'missing_source');
    assert.ok(notes[0].includes('источник Кинопоиска'));
});
test('KP 8+ distinguishes API failure from valid empty filtered results', () => {
    const app = boot({saved:[{id:'kp_new_8',enabled:true}]});
    const notes=[];
    app.Lampa.Noty.show = note => notes.push(note);
    app.Lampa.Api.sources.KP={list:(params,done,fail)=>fail({status:429})};
    assert.equal(app.getMain().length,0);
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.status,'api_error');
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.pages_failed,3);
    assert.ok(notes[0].includes('не отвечает'));
});
test('KP 8+ checks second page whenever fewer than 20 cards match', () => {
    const app = boot({saved:[{id:'kp_new_8',enabled:true}]});
    const requests=[];
    const year=String(new Date().getFullYear());
    app.Lampa.Api.sources.KP={list:(params,cb)=>{
        requests.push(params);
        const type = params.filter_url.includes('type=FILM')?'movie':'tv';
        cb({results:[{id:'KP_'+requests.length,source:'KP',type,release_date:year,
            first_air_date:year,vote_count:450,kp_rating:params.page===1?7.4:8.6,
            genres:[{name:'драма'}],production_countries:[{name:'США'}]}],total_pages:2});
    }};
    const rows=app.getMain();
    assert.equal(requests.length,6);
    assert.ok(rows.length===1 && rows[0].results.length===3);
    assert.ok(requests.slice(3).every(x=>x.page===2));
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.status,'ready');
});


test('KP 8+ preview scans deeper pages to collect at least 20 valid cards', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    const requests=[],yr=String(new Date().getFullYear());
    app.Lampa.Api.sources.KP={list:(p,ok)=>{
        requests.push({url:p.filter_url,page:p.page});
        const type=p.filter_url.includes('type=FILM')?'movie':'tv';
        const items=Array.from({length:6},(_,i)=>({
            id:'KP_'+p.filter_url.split('type=')[1]+'_'+p.page+'_'+i,source:'KP',type,
            release_date:yr,first_air_date:yr,kp_rating:i<2?8.6:7.6,
            vote_count:520,genres:[{name:'драма'}],production_countries:[{name:'США'}]
        }));
        ok({results:items,total_pages:10});
    }};
    const rows=app.getMain();
    assert.equal(rows.length,1);
    assert.ok(rows[0].results.length>=20);
    assert.ok(rows[0].results.every(x=>x.kp_rating>=7.5));
    assert.equal(new Set(rows[0].results.map(x=>x.id)).size,rows[0].results.length);
    assert.ok(Math.max(...requests.map(x=>x.page))>2);
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.stop_reason,'target');
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.timeout,false);
    assert.ok(requests.length<=30);
});
test('KP 8+ preview respects ten-page cap even if fewer titles qualify', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    const requests=[],yr=String(new Date().getFullYear());
    app.Lampa.Api.sources.KP={list:(p,ok)=>{
        requests.push(p);
        const type=p.filter_url.includes('type=FILM')?'movie':'tv';
        ok({results:[{id:'KP_'+p.filter_url.split('type=')[1]+'_'+p.page,
            type,release_date:yr,first_air_date:yr,kp_rating:p.page===1?8.3:7.1,
            vote_count:300,genres:[{name:'драма'}],production_countries:[{name:'США'}]}],
            total_pages:60});
    }};
    const rows=app.getMain();
    assert.equal(requests.length,30);
    assert.equal(Math.max(...requests.map(x=>x.page)),10);
    assert.equal(rows[0].results.length,3);
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.stop_reason,'exhausted');
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.matched,3);
});
test('KP 8+ preview stops at API page count and rejects low ratings', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    const requests=[],yr=String(new Date().getFullYear());
    app.Lampa.Api.sources.KP={list:(p,ok)=>{
        requests.push(p);
        const type=p.filter_url.includes('type=FILM')?'movie':'tv';
        ok({results:[{id:'KP_'+p.filter_url.split('type=')[1]+'_'+p.page,type,
            release_date:yr,first_air_date:yr,kp_rating:8.4,vote_count:310,
            genres:[{name:'драма'}],production_countries:[{name:'США'}]},
            {id:'invalid_'+p.page,type,release_date:yr,first_air_date:yr,
             kp_rating:null,vote_count:450}],total_pages:3});
    }};
    const rows=app.getMain();
    assert.equal(requests.length,9);
    assert.equal(rows[0].results.length,9);
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.stop_reason,'exhausted');
    assert.ok(rows[0].results.every(x=>x.kp_rating>=7.5));
});
test('KP 8+ uses a new preview cache key instead of old four-card cache', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    const prior={saved_at:Date.now(),total_pages:2,
        results:[{id:'KP_old',type:'movie',kp_rating:8.1}]};
    app.stored.set('surs_preview_cache_v1_kp_new_8',prior);
    const year=String(new Date().getFullYear());
    let calls=0;
    app.Lampa.Api.sources.KP={list:(p,ok)=>{
        calls++;
        const type=p.filter_url.includes('type=FILM')?'movie':'tv';
        ok({results:[{id:'KP_new_'+p.filter_url.split('type=')[1]+'_'+p.page,
            type,release_date:year,first_air_date:year,kp_rating:8.5,
            vote_count:400,genres:[{name:'драма'}],production_countries:[{name:'США'}]}],
            total_pages:4});
    }};
    const rows=app.getMain();
    assert.ok(calls>3);
    assert.ok(rows[0].results.length>3);
    assert.ok(!rows[0].results.some(x=>x.id==='KP_old'));
    const fresh=app.stored.get('surs_preview_cache_v1_kp_new_8_rating75_v1');
    assert.ok(fresh && fresh.results.length>3);
    assert.equal(app.stored.get('surs_preview_cache_v1_kp_new_8'),prior);
});
test('KP 8+ deadline returns partial results without accepting late requests', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    const requested=[],yr=String(new Date().getFullYear());
    app.Lampa.Api.sources.KP={list:(p,ok,fail)=>requested.push({p,ok,fail})};
    let delivered=0,rows;
    // Native test harness is synchronous; emulate Lampa partNext's async callback.
    app.Lampa.Api.partNext=(parts,limit,loaded,empty)=>
        parts[0](x=>{rows=[x];loaded([x]);});
    app.Lampa.Api.sources.SURS.main({},data=>{rows=data;delivered++;},()=>delivered++);
    assert.equal(requested.length,3);
    const type=requested[0].p.filter_url.includes('type=FILM')?'movie':'tv';
    requested[0].ok({results:[{id:'KP_partial',type,release_date:yr,first_air_date:yr,
        kp_rating:8.3,vote_count:650,genres:[{name:'драма'}],production_countries:[{name:'США'}]}],
        total_pages:10});
    app.timers.filter(x=>x.ms===6900).forEach(x=>x.fn());
    assert.equal(delivered,1);
    assert.equal(rows[0].results.length,1);
    assert.equal(app.window.SURS_PERFORMANCE.kp8_preview.timeout,true);
    requested.slice(1).forEach(x=>x.ok({results:[],total_pages:10}));
    assert.equal(delivered,1);
});


test('KP 7.5 threshold matches exactly 7.5 and rejects 7.49', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    const year=String(new Date().getFullYear()),queries=[];
    app.Lampa.Api.sources.KP={list:(p,ok)=>{
        queries.push(p.filter_url);
        const type=p.filter_url.includes('type=FILM')?'movie':'tv';
        ok({results:[
            {id:'KP_equal_'+queries.length,type,kp_rating:7.5,vote_count:410,
             release_date:year,first_air_date:year,
             genres:[{name:'драма'}],production_countries:[{name:'США'}]},
            {id:'KP_below_'+queries.length,type,kp_rating:7.49,vote_count:410,
             release_date:year,first_air_date:year},
            {id:'KP_invalid_'+queries.length,type,kp_rating:null,vote_count:410,
             release_date:year,first_air_date:year}
        ],total_pages:1});
    }};
    const rows=app.getMain();
    assert.equal(queries.length,3);
    assert.ok(queries.every(q=>q.includes('ratingFrom=7.5')));
    assert.equal(rows[0].results.length,3);
    assert.equal(rows[0].title,'Новинки США · КП 7,5+');
    assert.ok(rows[0].results.every(x=>x.kp_rating===7.5));
});
test('KP catalog searches current and previous years in separate windows', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    const year=new Date().getFullYear(),requests=[];
    app.Lampa.Api.sources.KP={list:(p,ok)=>{
        const y=Number((p.filter_url.match(/yearFrom=(\d{4})/)||[])[1]);
        const to=Number((p.filter_url.match(/yearTo=(\d{4})/)||[])[1]);
        requests.push({year:y,page:p.page,url:p.filter_url});
        assert.equal(y,to);
        const type=p.filter_url.includes('type=FILM')?'movie':'tv';
        ok({results:Array.from({length:5},(_,i)=>({
            id:'KP_'+y+'_'+p.filter_url.split('type=')[1]+'_'+i,
            type,kp_rating:7.5+i/10,vote_count:500,
            release_date:String(y),first_air_date:String(y),
            genres:[{name:'драма'}],production_countries:[{name:'США'}]
        })),total_pages:1});
    }};
    const params={url:'surs_kp_new_8',page:1};
    let first;
    app.Lampa.Api.sources.SURS.list(params,x=>{first=x;},()=>{throw Error('Empty first catalog page')});
    assert.equal(requests.length,6);
    assert.equal(new Set(requests.map(x=>x.year)).size,2);
    assert.ok(requests.some(x=>x.year===year));
    assert.ok(requests.some(x=>x.year===year-1));
    assert.ok(requests.every(x=>x.url.includes('ratingFrom=7.5')));
    assert.equal(first.results.length,20);
    assert.equal(first.total_pages,2);
    params.page=2;
    let second;
    app.Lampa.Api.sources.SURS.list(params,x=>{second=x;},()=>{throw Error('Empty second catalog page')});
    assert.equal(second.results.length,10);
    assert.equal(new Set(first.results.concat(second.results).map(x=>x.id)).size,30);
    assert.equal(requests.length,6);
});
test('KP catalog request depth is capped at 30 across both years', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    const calls=[];
    app.Lampa.Api.sources.KP={list:(p,ok)=>{
        calls.push(p);
        const type=p.filter_url.includes('type=FILM')?'movie':'tv';
        const y=Number((p.filter_url.match(/yearFrom=(\d{4})/)||[])[1]);
        ok({results:[{id:'KP_low_'+y+'_'+p.page+'_'+p.filter_url.split('type=')[1],
            type,kp_rating:7.49,vote_count:400,release_date:String(y),
            first_air_date:String(y)}],total_pages:100});
    }};
    let noResults=false;
    app.Lampa.Api.sources.SURS.list({url:'surs_kp_new_8',page:1},
        ()=>{throw Error('Unexpected result')},()=>{noResults=true});
    assert.equal(noResults,true);
    assert.equal(calls.length,30);
    assert.equal(Math.max(...calls.map(c=>c.page)),5);
    assert.equal(app.window.SURS_PERFORMANCE.kp8_catalog.pages_requested,30);
});
test('KP 7.5 release ignores cached 8.0 selections', () => {
    const app=boot({saved:[{id:'kp_new_8',enabled:true}]});
    app.stored.set('surs_preview_cache_v1_kp_new_8_deep_v1',{
        saved_at:Date.now(),results:[{id:'KP_old',kp_rating:8.2}],total_pages:2
    });
    const year=String(new Date().getFullYear());
    app.Lampa.Api.sources.KP={list:(p,ok)=>{
        const type=p.filter_url.includes('type=FILM')?'movie':'tv';
        ok({results:[{id:'KP_new_'+p.filter_url.split('type=')[1],
            type,kp_rating:7.5,vote_count:450,
            release_date:year,first_air_date:year,
            genres:[{name:'драма'}],production_countries:[{name:'США'}]}],total_pages:1});
    }};
    const rows=app.getMain();
    assert.equal(rows[0].results.length,3);
    assert.ok(rows[0].results.every(x=>x.kp_rating===7.5));
    assert.ok(app.stored.has('surs_preview_cache_v1_kp_new_8_rating75_v1'));
});

test('editor JavaScript and stylesheet are deferred', () => {
    assert.doesNotMatch(mainSource, /function addEditorStyles\(/);
    assert.doesNotMatch(mainSource, /function renderModalContent\(/);
    assert.match(editorSource, /function addEditorStyles\(/);
    assert.match(editorSource, /function openShelfManagerModal\(/);
    assert.match(mainSource, /__SURS_EDITOR_FACTORY_397/);
    assert.match(mainSource, /replace\(\/\\\/surs\\\.js/);
});
test('deferred editor exposes a constructible factory', () => {
    const context={window:{}};
    vm.runInNewContext(editorSource,context,{filename:'surs-editor.js'});
    assert.equal(typeof context.window.__SURS_EDITOR_FACTORY_397,'function');
    assert.equal(typeof context.window.__SURS_EDITOR_FACTORY_397({}),'function');
});
test('compact source builds with preserved UI and smaller initial script', () => {
    assert.ok(mainSource.length < readableSource.length * 0.85);
    assert.match(mainSource, /Версия: 3\.9\.20/);
    assert.match(readableSource, /Версия: 3\.9\.20/);
    assert.match(mainSource, /surs-fixed-styles/);
    assert.doesNotMatch(mainSource, /function addEditorStyles\(/);
});
test('logo requests deduplicate and limit active network calls', () => {
    const app=boot({saved:[{id:'streaming_global',enabled:true}]});
    app.Lampa.TMDB={api:path=>path,key:()=> 'key',image:path=>path};
    const requests=[];
    app.Lampa.Network={silent:(url,onSuccess,onError)=>requests.push({url,onSuccess,onError})};
    const shelf=app.getMain()[0];
    assert.equal(shelf.title,'Мировые стриминги');
    const fake={addClass(){return this;},attr(){return this;},on(){return this;},find(){return {replaceWith(){}};}};
    for(let i=0;i<6;i++) shelf.results[i].params.emit.onCreate.call({html:fake});
    shelf.results[0].params.emit.onCreate.call({html:fake});
    assert.equal(requests.length,3);
    assert.equal(app.window.SURS_PERFORMANCE.logos.deduplicated,1);
    assert.equal(app.window.SURS_PERFORMANCE.logos.max_active,3);
    requests[0].onSuccess({logo_path:'/logo.png'});
    assert.equal(requests.length,4);
    requests[1].onError();
    assert.equal(requests.length,5);
    assert.equal(app.window.SURS_PERFORMANCE.logos.failures,1);
    assert.equal(app.window.SURS_PERFORMANCE.logos.active,3);
});
test('performance diagnostics track startup and progressive row rendering', () => {
    const app=boot({saved:[{id:'nav_buttons',enabled:true}]});
    assert.equal(typeof app.window.SURS_PERFORMANCE.ready_at,'number');
    assert.equal(typeof app.window.SURS_PERFORMANCE.init_ms,'number');
    app.Lampa.Manifest={app_digital:300};
    app.Lampa.Activity.active=()=>({component:'main',source:'SURS',activity:{component:{emit(){}}}});
    let done=0;
    app.Lampa.Api.sources.SURS.main({source:'SURS'},()=>{done++;},()=>{});
    let guard=0;
    while(true){
        const task=app.timers.find(t=>t.ms===0&&!t.executed);
        if(!task)break;
        task.executed=true;task.fn();
        if(++guard>40)throw Error('Timer runaway');
    }
    const stats=app.window.SURS_PERFORMANCE.screens.MAIN;
    assert.equal(stats.render_batches,1);
    assert.equal(stats.rendered_rows,1);
    assert.equal(done,1);
});
test('US premiere defaults migrate after navigation and honor explicit disabling', () => {
    const original=[{id:'stream_netflix',enabled:true},{id:'nav_buttons',enabled:true},{id:'core_continue',enabled:true}];
    const app=boot({saved:original});
    assert.deepEqual(Array.from(app.rows(),x=>x.id),['stream_netflix','nav_buttons','kp_new_8','us_new_8','core_continue']);
    assert.equal(app.stored.get('surs_fixed_shelves_v2'),original);
    assert.equal(app.rows()[2].enabled,true);
    const disabled=app.rows().map(x=>Object.assign({},x));disabled[2].enabled=false;
    app.window.LampaShelfManager.saveShelves(disabled);
    assert.equal(app.rows()[2].enabled,false);
    assert.equal(app.rows().filter(x=>x.id==='us_new_8').length,1);
    assert.ok(!app.window.LampaShelfManager.getSavedShelves('NEW').some(x=>x.id==='us_new_8'));
});

test('KP 8+ migrates saved homes once and preserves user settings', () => {
    const saved = [{id:'nav_buttons',enabled:true},{id:'us_new_8',enabled:true},{id:'core_continue',enabled:true}];
    const app = boot({saved});
    const manager = app.window.LampaShelfManager;
    assert.deepEqual(Array.from(manager.getSavedShelves(),x=>x.id),['nav_buttons','kp_new_8','us_new_8','core_continue']);
    assert.deepEqual(Array.from(manager.getSavedShelves(),x=>x.id),['nav_buttons','kp_new_8','us_new_8','core_continue']);
    assert.equal(app.stored.get('surs_fixed_shelves_v2'), saved);
    const modified = manager.getSavedShelves().map(x=>Object.assign({},x));
    modified[1].enabled = false;
    manager.saveShelves(modified);
    assert.equal(manager.getSavedShelves()[1].enabled,false);
    assert.equal(manager.getSavedShelves().filter(x=>x.id==='kp_new_8').length,1);
    assert.ok(!manager.getSavedShelves('NEW').some(x=>x.id==='kp_new_8'));
    assert.ok(!manager.getSavedShelves('RUS').some(x=>x.id==='kp_new_8'));
});
test('KP 8+ migration does not alter custom homes without navigation', () => {
    const saved = [{id:'core_continue',enabled:true},{id:'us_new_8',enabled:false},{id:'trend_movies',enabled:true}];
    const app = boot({saved});
    assert.deepEqual(Array.from(app.rows(),x=>x.id),['core_continue','us_new_8','trend_movies']);
    assert.equal(app.rows()[1].enabled,false);
});
test('US premiere loader enforces country, genre, rating, language and mixed date order', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    const requests=[];
    app.Lampa.Api.partNext=(parts,limit,loaded)=>parts[0](value=>loaded([value]));
    app.Lampa.Api.sources.SURS.get=(query,params,success,error)=>requests.push({query,params,success,error});
    let returned=null;app.Lampa.Api.sources.SURS.main({},x=>returned=x,()=>returned=[]);
    assert.equal(requests.length,4);
    assert.ok(requests.every(r=>r.query.includes('with_origin_country=US') &&
        r.query.includes('with_original_language=en') &&
        r.query.includes('vote_average.gte=8') &&
        r.query.includes('vote_count.gte=' + (r.query.indexOf('discover/movie?')===0 ? 300 : 150))));
    const now=new Date().toISOString().slice(0,10);
    const older=new Date();older.setMonth(older.getMonth()-3);
    const before=older.toISOString().slice(0,10);
    const film=(id,date,rest={})=>Object.assign({
        id,title:'Film',release_date:date,poster_path:'/a',overview:'Story',
        vote_average:8.4,vote_count:1200,original_language:'en',genre_ids:[18]
    },rest);
    const series=(id,date,rest={})=>Object.assign({
        id,name:'Series',first_air_date:date,poster_path:'/b',overview:'Story',
        vote_average:8.2,vote_count:900,original_language:'en',genre_ids:[18],origin_country:['US']
    },rest);
    requests[0].success({total_pages:2,results:[film(1,before),film(2,now,{genre_ids:[16]}),
        film(3,now,{vote_average:7.9}),film(4,now,{vote_count:299}),
        film(5,now,{poster_path:null}),film(6,now,{original_language:'fr'})]});
    requests[1].success({total_pages:2,results:[film(1,before),film(8,now)]});
    requests[2].success({total_pages:2,results:[series(9,now),series(10,now,{genre_ids:[16]}),
        series(11,now,{origin_country:['GB']}),series(12,now,{genre_ids:[10764]}),
        series(13,now,{vote_count:149})]});
    requests[3].success({total_pages:2,results:[series(9,now)]});
    assert.equal(returned.length,1);
    assert.deepEqual(Array.from(returned[0].results,x=>x.id),[8,9,1]);
    assert.deepEqual(Array.from(returned[0].results,x=>x.type),['movie','tv','movie']);
});
test('US premiere loader keeps partial results when requests fail', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    const requests=[];
    app.Lampa.Api.partNext=(parts,limit,loaded)=>parts[0](value=>loaded([value]));
    app.Lampa.Api.sources.SURS.get=(q,p,success,error)=>requests.push({success,error});
    let delivered=0,result=null;
    app.Lampa.Api.sources.SURS.main({},x=>{delivered++;result=x},()=>{delivered++});
    const now=new Date().toISOString().slice(0,10);
    requests[0].success({total_pages:2,results:[{id:12,release_date:now,title:'Film',poster_path:'/a',
        overview:'Story',vote_average:8.2,vote_count:1400,original_language:'en',genre_ids:[18]}]});
    requests[0].success({results:[{id:22}]});
    for(let i=1;i<4;i++)requests[i].error();
    assert.equal(delivered,1);
    assert.equal(result[0].results.length,1);
    app.timers.filter(x=>x.ms===7200).forEach(x=>x.fn());
    assert.equal(delivered,1);
});
test('US 8+ line uses native Lampa More route and pagination metadata', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    const date=new Date().toISOString().slice(0,10);
    app.Lampa.Api.sources.SURS.get=(url,p,ok)=>ok({
        total_pages:5,
        results:url.indexOf('discover/movie?')===0 ? [{
            id:40,title:'Film',release_date:date,original_language:'en',
            poster_path:'/x',overview:'Film',genre_ids:[18],
            vote_average:8.6,vote_count:1100
        }] : []
    });
    const row=app.getMain()[0];
    assert.equal(row.url,'surs_us_new_8');
    assert.equal(row.source,'SURS');
    assert.equal(row.page,1);
    assert.ok(row.total_pages>1);
    assert.equal(row.results[0].source,'tmdb');
});
test('US 8+ full catalog pages preserve mixed date order and never duplicate', () => {
    const app=boot();
    const calls=[];
    app.Lampa.Api.sources.SURS.get=(url,p,ok)=>{
        const type=url.indexOf('discover/movie?')===0?'movie':'tv';
        const page=Number((url.split('&page=')[1]||'1').split('&')[0]);
        calls.push(type+page);
        const results=Array.from({length:20},(_,i)=>{
            const n=(page-1)*20+i;
            const date=new Date();
            date.setUTCDate(date.getUTCDate()-(n*2+(type==='tv'?1:0)));
            const stamp=date.toISOString().slice(0,10);
            return Object.assign({
                id:(type==='movie'?1000:2000)+n,original_language:'en',
                poster_path:'/p',overview:'Story',genre_ids:[18],
                vote_average:8.5,vote_count:1600
            },type==='movie'?{title:'Film',release_date:stamp}:
                {name:'Series',first_air_date:stamp,origin_country:['US']});
        });
        ok({results:results,total_pages:3});
    };
    const request={url:'surs_us_new_8',source:'SURS',page:1};
    let all=[];
    for(let page=1;page<=3;page++){
        request.page=page;
        let output;
        app.Lampa.Api.sources.SURS.list(request,data=>output=data,
            ()=>{throw Error('Unexpected category error')});
        assert.equal(output.results.length,20);
        assert.ok(output.total_pages>=6);
        all=all.concat(output.results);
    }
    assert.equal(all.length,60);
    assert.equal(new Set(all.map(x=>x.type+':'+x.id)).size,60);
    assert.equal(all[0].id,1000);
    assert.equal(all[19].id,2009);
    assert.equal(all[20].id,1010);
    assert.equal(all[40].id,1020);
    assert.ok(all.every((x,i)=>!i||
        (all[i-1].release_date||all[i-1].first_air_date)>=
        (x.release_date||x.first_air_date)));
    assert.equal(calls.length,4);
    app.Lampa.Api.sources.SURS.list({url:'surs_us_new_8',page:1},
        ()=>{},()=>{});
    assert.equal(calls.length,6);
});
test('US 8+ category failure and other TMDB category fallback', () => {
    const app=boot();
    app.Lampa.Api.sources.tmdb.list=(params,ok)=>ok({results:[{id:77}]});
    let original;
    app.Lampa.Api.sources.SURS.list({url:'discover/movie'},
        data=>original=data,()=>{});
    assert.equal(original.results[0].id,77);
    app.Lampa.Api.sources.SURS.get=(url,params,ok,error)=>error();
    let successes=0,errors=0;
    app.Lampa.Api.sources.SURS.list({url:'surs_us_new_8',page:1},
        ()=>successes++,()=>errors++);
    assert.equal(successes,0);
    assert.equal(errors,1);
});
test('US 8+ Bayesian score rejects limited-vote 8.0 ratings', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    const date=new Date().toISOString().slice(0,10);
    const film=(id,rating,votes)=>({
        id,title:'Film',release_date:date,poster_path:'/p',overview:'Film',
        genre_ids:[18],original_language:'en',vote_average:rating,vote_count:votes
    });
    const series=(id,rating,votes)=>({
        id,name:'Series',first_air_date:date,poster_path:'/p',overview:'Series',
        genre_ids:[18],origin_country:['US'],original_language:'en',
        vote_average:rating,vote_count:votes
    });
    const requests=[];
    app.Lampa.Api.sources.SURS.get=(url,p,ok,error)=>requests.push({url,ok,error});
    app.Lampa.Api.partNext=(parts,limit,loaded)=>parts[0](value=>loaded([value]));
    let rows;
    app.Lampa.Api.sources.SURS.main({},value=>rows=value,()=>{throw Error('Empty')});
    assert.equal(requests.length,4);
    requests[0].ok({total_pages:2,results:[film(1,8,510),film(2,8.0,3000),film(3,8.5,500)]});
    requests[1].ok({total_pages:2,results:[film(4,9.4,299)]});
    requests[2].ok({total_pages:2,results:[series(5,8.0,310),series(6,8.3,900),series(7,8.7,300)]});
    requests[3].ok({total_pages:2,results:[series(8,8.9,149)]});
    assert.deepEqual(Array.from(rows[0].results,item=>item.id),[6,7,2,3,5,1]);
    assert.ok(rows[0].results.every(item=>item.vote_average>=8 && item.surs_weighted_score>=7.5));
    const boundary=rows[0].results.find(item=>item.id===3);
    assert.equal(boundary.vote_average,8.5);
    assert.ok(Math.abs(boundary.surs_weighted_score-7.833333333333333)<1e-9);
});
test('US 8+ full catalog applies matching quality gates', () => {
    const app=boot();
    const date=new Date().toISOString().slice(0,10);
    const requests=[];
    app.Lampa.Api.sources.SURS.get=(url,p,ok)=>{
        requests.push(url);
        const movie=url.indexOf('discover/movie?')===0;
        const item=movie?{id:51,title:'Movie',release_date:date,genre_ids:[18],
            original_language:'en',poster_path:'/p',overview:'Movie',
            vote_average:8.5,vote_count:500}:
            {id:52,name:'TV',first_air_date:date,genre_ids:[18],
            origin_country:['US'],original_language:'en',poster_path:'/p',
            overview:'TV',vote_average:8,vote_count:300};
        ok({total_pages:1,results:[item]});
    };
    let result;
    app.Lampa.Api.sources.SURS.list({url:'surs_us_new_8',page:1},
        output=>result=output,()=>{throw Error('Empty catalog')});
    assert.equal(result.results.length,2);
    assert.deepEqual(Array.from(result.results,x=>x.id),[51,52]);
    assert.ok(result.results.every(x=>x.surs_weighted_score>=7.5));
    assert.ok(requests.some(url=>url.includes('vote_count.gte=300')));
    assert.ok(requests.some(url=>url.includes('vote_count.gte=150')));
});
test('US 8+ adaptive preview halts on empty TMDB pages even if total_pages claims more', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    const requests=[];
    app.Lampa.Api.partNext=(parts,limit,loaded)=>parts[0](value=>loaded([value]));
    app.Lampa.Api.sources.SURS.get=(url,p,ok)=>{requests.push(url);ok({results:[],total_pages:10});};
    let rows;
    app.Lampa.Api.sources.SURS.main({},value=>rows=value,()=>{throw Error('Empty')});
    assert.equal(requests.length,4);
    assert.equal(rows[0].results.length,0);
    assert.equal(app.window.SURS_PERFORMANCE.us8_preview.pages_requested,4);
    assert.equal(app.window.SURS_PERFORMANCE.us8_preview.pages_completed,4);
});
test('US 8+ adaptive preview searches beyond two pages to meet its quality target', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    app.Lampa.Api.partNext=(parts,limit,loaded)=>parts[0](value=>loaded([value]));
    const calls=[], date=new Date().toISOString().slice(0,10);
    app.Lampa.Api.sources.SURS.get=(url,p,ok)=>{
        calls.push(url);
        const movie=url.indexOf('discover/movie?')===0;
        const page=Number((url.split('&page=')[1]||'1').split('&')[0]);
        const results=Array.from({length:20},(_,i)=>{
            const id=(movie?1000:2000)+page*20+i;
            return Object.assign({
                id,poster_path:'/poster',overview:'Story',original_language:'en',
                genre_ids:[18],vote_average:i%5===0?8.6:7.9,vote_count:1200
            },movie?{title:'Film',release_date:date}:
                {name:'Series',first_air_date:date,origin_country:['US']});
        });
        ok({results,total_pages:10});
    };
    let rows;
    app.Lampa.Api.sources.SURS.main({},value=>rows=value,()=>{throw Error('Empty')});
    assert.equal(calls.length,12);
    assert.equal(rows[0].results.length,48);
    assert.ok(calls.some(url=>url.includes('page=6')));
    assert.ok(rows[0].results.every(x=>x.vote_average>=8&&x.surs_weighted_score>=7.5));
    assert.equal(new Set(rows[0].results.map(x=>x.type+':'+x.id)).size,48);
    assert.equal(app.window.SURS_PERFORMANCE.us8_preview.pages_requested,12);
    assert.equal(app.window.SURS_PERFORMANCE.us8_preview.matched,48);
});
test('US 8+ adaptive preview stops at ten pages per type when there are few matches', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    app.Lampa.Api.partNext=(parts,limit,loaded)=>parts[0](value=>loaded([value]));
    const urls=[], date=new Date().toISOString().slice(0,10);
    app.Lampa.Api.sources.SURS.get=(url,p,ok)=>{
        urls.push(url);
        const movie=url.indexOf('discover/movie?')===0;
        const page=Number((url.split('&page=')[1]||'1').split('&')[0]);
        const results=Array.from({length:20},(_,i)=>({
            id:(movie?1000:2000)+page*20+i,
            title:movie?'Film':undefined,name:movie?undefined:'Series',
            release_date:movie?date:undefined,first_air_date:movie?undefined:date,
            origin_country:['US'],poster_path:'/p',overview:'Story',
            original_language:'en',genre_ids:[18],
            vote_average:i===0?8.8:7.9,vote_count:1200
        }));
        ok({results,total_pages:20});
    };
    let rows;
    app.Lampa.Api.sources.SURS.main({},x=>rows=x,()=>{throw Error('Empty')});
    assert.equal(urls.length,20);
    assert.equal(rows[0].results.length,20);
    assert.equal(Math.max(...urls.map(u=>Number((u.split('&page=')[1]||'0').split('&')[0]))),10);
    assert.equal(app.window.SURS_PERFORMANCE.us8_preview.pages_requested,20);
    assert.equal(app.window.SURS_PERFORMANCE.us8_preview.timeout,false);
});
test('US 8+ preview ends on target without scanning unnecessary pages', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    app.Lampa.Api.partNext=(parts,limit,loaded)=>parts[0](value=>loaded([value]));
    const urls=[], date=new Date().toISOString().slice(0,10);
    app.Lampa.Api.sources.SURS.get=(url,p,ok)=>{
        urls.push(url);
        const movie=url.indexOf('discover/movie?')===0;
        const page=Number((url.split('&page=')[1]||'1').split('&')[0]);
        const results=Array.from({length:20},(_,i)=>({
            id:(movie?1000:2000)+page*20+i,
            title:movie?'Film':undefined,name:movie?undefined:'Series',
            release_date:movie?date:undefined,first_air_date:movie?undefined:date,
            origin_country:['US'],poster_path:'/p',overview:'Story',
            original_language:'en',genre_ids:[18],vote_average:8.6,vote_count:1200
        }));
        ok({results,total_pages:10});
    };
    let rows;
    app.Lampa.Api.sources.SURS.main({},x=>rows=x,()=>{throw Error('Empty')});
    assert.equal(urls.length,4);
    assert.equal(rows[0].results.length,60);
    assert.equal(app.window.SURS_PERFORMANCE.us8_preview.matched,80);
});
test('US 8+ preview timeout returns partial results and ignores late callbacks', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    app.Lampa.Api.partNext=(parts,limit,loaded)=>parts[0](value=>loaded([value]));
    const requests=[];
    app.Lampa.Api.sources.SURS.get=(url,p,ok,error)=>requests.push({url,ok,error});
    let completed=0,rows;
    app.Lampa.Api.sources.SURS.main({},x=>{rows=x;completed++},()=>completed++);
    assert.equal(requests.length,4);
    const date=new Date().toISOString().slice(0,10);
    requests[0].ok({results:[{id:93,title:'Film',release_date:date,
        poster_path:'/p',overview:'Story',genre_ids:[18],
        original_language:'en',vote_average:8.5,vote_count:1500}],total_pages:10});
    app.timers.filter(x=>x.ms===7200).forEach(x=>x.fn());
    assert.equal(completed,1);
    assert.equal(rows[0].results.length,1);
    assert.equal(app.window.SURS_PERFORMANCE.us8_preview.timeout,true);
    for(let i=1;i<4;i++)requests[i].ok({results:[],total_pages:10});
    assert.equal(completed,1);
    assert.equal(requests.length,4);
});
test('US 8+ balanced filter includes rated titles at new thresholds but still rejects weak evidence', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    const date=new Date().toISOString().slice(0,10);
    const movie=(id,rating,votes)=>({
        id,title:'Movie',release_date:date,poster_path:'/a',overview:'Film',
        genre_ids:[18],original_language:'en',vote_average:rating,vote_count:votes
    });
    const tv=(id,rating,votes)=>({
        id,name:'Series',first_air_date:date,poster_path:'/a',overview:'TV',
        genre_ids:[18],origin_country:['US'],original_language:'en',
        vote_average:rating,vote_count:votes
    });
    const urls=[];
    app.Lampa.Api.sources.SURS.get=(url,p,ok)=>{
        urls.push(url);
        const isMovie=url.indexOf('discover/movie?')===0;
        ok({total_pages:2,results:isMovie ? [
            movie(10,8,300), movie(11,8,399), movie(12,8,400),
            movie(13,8.5,300), movie(14,8.9,299),movie(15,7.9,700)
        ] : [
            tv(20,8,150),tv(21,8,199),tv(22,8,200),
            tv(23,8.5,150),tv(24,8.9,149),tv(25,7.9,300)
        ]});
    };
    const results=app.getMain()[0].results;
    assert.deepEqual(Array.from(results,x=>x.id).sort((a,b)=>a-b),[12,13,22,23]);
    assert.ok(results.every(x=>x.vote_average>=8 && x.surs_weighted_score>=7.5));
    assert.ok(urls.some(x=>x.includes('vote_count.gte=300')));
    assert.ok(urls.some(x=>x.includes('vote_count.gte=150')));
});
test('US 8+ preview diagnostics distinguish sparse TMDB dataset from request failures', () => {
    const app=boot({saved:[{id:'us_new_8',enabled:true}]});
    const calls=[];
    const date=new Date().toISOString().slice(0,10);
    app.Lampa.Api.sources.SURS.get=(url,p,ok)=>{
        calls.push(url);
        const isMovie=url.indexOf('discover/movie?')===0;
        const row=isMovie?{id:33,title:'Movie',release_date:date,poster_path:'/p',
            overview:'Film',vote_average:8.4,vote_count:550,genre_ids:[18],
            original_language:'en'}:
            {id:44,name:'Series',first_air_date:date,poster_path:'/p',
             overview:'TV',vote_average:8.6,vote_count:260,genre_ids:[18],
             origin_country:['US'],original_language:'en'};
        ok({total_pages:2,total_results:isMovie?2:2,results:[row]});
    };
    const data=app.getMain()[0];
    const metrics=app.window.SURS_PERFORMANCE.us8_preview;
    assert.equal(data.results.length,2);
    assert.equal(metrics.raw_candidates,4);
    assert.equal(metrics.pages_movie,2);
    assert.equal(metrics.pages_tv,2);
    assert.equal(metrics.pages_requested,4);
    assert.equal(metrics.pages_completed,4);
    assert.equal(metrics.matched,2);
    assert.equal(metrics.tmdb_total_movie,2);
    assert.equal(metrics.tmdb_total_tv,2);
    assert.equal(metrics.stop_reason,'exhausted');
    assert.equal(metrics.timeout,false);
});
test('plugin syntax and version', () => {
    assert.match(source, /Версия: 3\.9\.20/);
});
test('factory default enables US premieres below navigation', () => {
    const app = boot();
    const rows = app.rows();
    const expected = [
        'nav_buttons', 'kp_new_8', 'us_new_8', 'core_continue', 'new_movies', 'new_tv',
        'trend_movies', 'trend_tv', 'period_10s', 'period_00s',
        'genres_icons', 'streaming_global', 'streaming_russian'
    ];
    assert.equal(rows.length, 25);
    assert.deepEqual(Array.from(rows.slice(0, 13), x => x.id), expected);
    assert.equal(rows.filter(x => x.enabled).length, 11);
    assert.equal(rows.filter(x => !x.enabled).length, 14);
    assert.equal(rows.find(x=>x.id==='new_movies').enabled,false);
    assert.equal(rows.find(x=>x.id==='new_tv').enabled,false);
    assert.ok(rows.slice(13).every(x => !x.enabled));
});
test('custom saved shelf order and visibility survive the update', () => {
    const custom = [
        { id: 'stream_netflix', title: 'Netflix', enabled: true },
        { id: 'nav_buttons', title: 'Навигация', enabled: false },
        { id: 'core_continue', title: 'Продолжить просмотр', enabled: true }
    ];
    const app = boot({ saved: custom });
    assert.deepEqual(Array.from(app.rows(), x => x.id), ['stream_netflix','nav_buttons','kp_new_8','us_new_8','core_continue']);
    assert.deepEqual(Array.from(app.rows(), x => x.enabled), [true,false,true,true,true]);
});
test('legacy factory 22-enabled configuration automatically migrates to 10 active', () => {
    const legacy = [
        'nav_buttons','core_continue','streaming_russian','streaming_global',
        'genres_icons','trend_movies','trend_tv','upcoming_episodes',
        'new_movies','new_tv','rus_movies','rus_tv',
        'stream_kinopoisk','stream_premier','stream_netflix','stream_apple',
        'turkish_tv','korean_tv','genre_comedy','genre_action',
        'genre_scifi','period_00s'
    ].map(id => ({ id, enabled: true }));
    const app = boot({ saved: legacy });
    assert.equal(app.rows().filter(x => x.enabled).length, 11);
    assert.equal(app.rows()[4].id, 'new_movies');
    assert.equal(app.stored.get('surs_fixed_shelves_v2').length, 25);
    assert.equal(app.stored.get('surs_fixed_shelves_v2')[4].id, 'new_movies');
});
test('the previous 3.8.2 factory profile migrates, but customized visibility does not', () => {
    const last = [
        'nav_buttons','core_continue','new_movies','new_tv',
        'trend_movies','trend_tv','upcoming_episodes','rus_movies',
        'rus_tv','genres_icons','streaming_russian','streaming_global',
        'stream_kinopoisk','stream_premier','stream_netflix','stream_apple',
        'turkish_tv','korean_tv','genre_comedy','genre_action',
        'genre_scifi','period_00s'
    ].map((id, i) => ({id, enabled: i < 12}));
    const app = boot({saved: last});
    assert.equal(app.rows().length, 25);
    assert.equal(app.rows().filter(x => x.enabled).length, 11);
    assert.equal(app.rows()[8].id, 'period_10s');

    last[12].enabled = true;
    const customized = boot({saved: last});
    assert.equal(customized.rows().length, 24);
    assert.equal(customized.rows()[8].id, 'upcoming_episodes');
    assert.equal(customized.rows().filter(x => x.enabled).length, 15);
});
test('custom rearrangement of legacy profile is not migrated', () => {
    const legacy = [
        'nav_buttons','core_continue','streaming_russian','streaming_global',
        'genres_icons','trend_movies','trend_tv','upcoming_episodes',
        'new_movies','new_tv','rus_movies','rus_tv',
        'stream_kinopoisk','stream_premier','stream_netflix','stream_apple',
        'turkish_tv','korean_tv','genre_comedy','genre_action',
        'genre_scifi','period_00s'
    ].map(id => ({ id, enabled: true }));
    const swapped = legacy.splice(3,1)[0];
    legacy.splice(2,0,swapped);
    const app = boot({ saved: legacy });
    assert.equal(app.rows()[4].id, 'streaming_global');
    assert.equal(app.rows().filter(x => x.enabled).length, 24);
});
test('reset immediately persists factory defaults and schedules screen refresh', () => {
    const app = boot({ saved: [
        { id: 'stream_netflix', enabled: true },
        { id: 'genre_action', enabled: true }
    ]});
    assert.equal(app.window.LampaShelfManager.version, '3.9.20');
    const defaults = app.window.LampaShelfManager.resetDefaults();
    assert.equal(defaults.length, 25);
    assert.equal(defaults.filter(x => x.enabled).length, 11);
    assert.equal(app.stored.get('surs_fixed_shelves_v2').length, 25);
    assert.equal(app.rows()[4].id, 'new_movies');
    const refresh = app.timers.find(t => t.ms === 80);
    assert.ok(refresh);
    refresh.fn();
    assert.equal(app.navigations[0].source, 'SURS');
});
test('continue watching cards load Release module and use first_air_date for TV', () => {
    const app = boot({ saved: [{ id: 'core_continue', enabled: true }] });
    const tv = { id: 10, title: 'Сериал', first_air_date: '2022-09-08' };
    const film = { id: 11, title: 'Фильм', release_date: '2023-05-20' };
    app.Lampa.Favorite.continues = type => type === 'tv' ? [tv] : [film];
    const rows = app.getMain();
    assert.equal(rows.length, 1);
    const cards = rows[0].results;
    assert.equal(cards.length, 2);
    assert.equal(cards[0].release_date, '2022-09-08');
    assert.deepEqual(Array.from(cards[0].params.createInstance(cards[0])), ['Card','Release','Callback']);
    assert.deepEqual(Array.from(cards[1].params.createInstance(cards[1])), ['Card','Release','Callback']);
});
test('default shelves are retained', () => {
    const app = boot();
    assert.ok(app.rows().length >= 20);
    assert.equal(app.Lampa.Api.sources.SURS !== undefined, true);
});
test('empty saved list retains navigation entry', () => {
    const app = boot({ saved: [] });
    assert.equal(app.rows().length, 1);
    assert.equal(app.rows()[0].id, 'nav_buttons');
});
test('disabled shelves are not discarded', () => {
    const saved = [
        { id: 'core_continue', enabled: false },
        { id: 'trend_movies', enabled: false }
    ];
    const app = boot({ saved });
    assert.equal(app.rows().length, 2);
    assert.equal(app.getMain()[0].title, 'Быстрый переход');
});
test('duplicate IDs and stale anonymous disabled rows are removed in view', () => {
    const app = boot({ saved: [
        { id: 'core_continue', enabled: true },
        { id: 'core_continue', enabled: false },
        { id: 'ext_row_abc123', enabled: false, title: 'Сторонняя полка' }
    ]});
    assert.equal(app.rows().length, 1);
});
test('anonymous ContentRows are not registered', () => {
    const app = boot();
    app.Lampa.ContentRows.add({ call: () => () => {} });
    assert.equal(app.window.LampaShelfManager.getAllShelves().some(x => x.id.startsWith('ext_row_')), false);
});
test('named rows have stable IDs', () => {
    const app = boot();
    const row = { name: 'example', title: 'Example', call: () => () => {} };
    app.Lampa.ContentRows.add(row);
    app.Lampa.ContentRows.add(row);
    assert.equal(app.window.LampaShelfManager.getAllShelves().filter(x => x.id === 'ext_example').length, 1);
});
test('ContentRows arrays of callbacks are flattened as cards', () => {
    const app = boot({ saved: [{ id: 'ext_example', title: 'Example', enabled: true, cat: 'plugin' }] });
    app.Lampa.ContentRows.add({
        name: 'example', title: 'Example',
        call: () => [
            cb => cb({ title: 'Example', results: [{ id: 1, title: 'A' }] }),
            cb => cb({ results: [{ id: 2, title: 'B' }] })
        ]
    });
    const data = app.getMain();
    assert.equal(data.length, 1);
    assert.equal(data[0].results.length, 2);
    assert.deepEqual(Array.from(data[0].results, x => x.id), [1,2]);
});
test('named plugin is not duplicated during discovery', () => {
    const app = boot();
    app.Lampa.ContentRows.add({ name: 'shots_main', title: 'Shots', call: () => null });
    const before = app.window.LampaShelfManager.getAllShelves().length;
    app.window.LampaShelfManager.rescan(false);
    assert.equal(app.window.LampaShelfManager.getAllShelves().length, before);
    assert.equal(app.contentRowsCalls(), 0);
});
test('main load does not call native ContentRows while scanning', () => {
    const app=boot({saved:[{id:'nav_buttons',enabled:true}]});
    app.Lampa.ContentRows.call=()=>{throw Error('Native scan is forbidden');};
    assert.equal(app.getMain().length,1);
    assert.equal(app.contentRowsCalls(),0);
});
test('ContentRows handler uses native receiver and respects SURS ordering', () => {
    const saved=[{id:'ext_first',title:'First',enabled:true},{id:'ext_second',title:'Second',enabled:true}];
    const app=boot({saved});
    const first={name:'first',title:'First',index:1,screen:['main'],call:function(params,screen){
        assert.equal(this,first);
        assert.equal(screen,'main');
        return cb=>cb({title:'First',results:[{id:1}]});
    }};
    app.Lampa.ContentRows.add(first);
    app.Lampa.ContentRows.add({name:'second',title:'Second',call:()=>cb=>cb({title:'Second',results:[{id:2}]})});
    assert.deepEqual(Array.from(app.getMain(),x=>x.title),['First','Second']);
    assert.deepEqual(Array.from(app.rows(),x=>x.id),saved.map(x=>x.id));
});
test('updating discovery metadata retains previously live loader', () => {
    const app=boot({saved:[{id:'ext_sample',title:'Sample',enabled:true}]});
    app.window.surs_register_shelf({id:'ext_sample',title:'Sample',loader:cb=>cb({results:[{id:42}]})});
    app.window.surs_register_shelf({id:'ext_sample',title:'Updated title'});
    assert.equal(app.getMain()[0].results[0].id,42);
    assert.equal(app.window.LampaShelfManager.getAllShelves().filter(x=>x.id==='ext_sample').length,1);
});
test('ContentRows interception can recover after add is replaced', () => {
    const app=boot({saved:[{id:'nav_buttons',enabled:true}]});
    app.Lampa.ContentRows.add=row=>app.added.push(row);
    app.getMain();
    app.Lampa.ContentRows.add({name:'late_plugin',title:'Late',call:()=>null});
    assert.ok(app.window.LampaShelfManager.getAllShelves().some(x=>x.id==='ext_late_plugin'));
});
test('custom Card factories use item data for nav, streaming and genres', () => {
    for (const id of ['nav_buttons', 'streaming_global', 'streaming_russian', 'genres_icons']) {
        const app = boot({saved:[{id,enabled:true}]});
        app.Lampa.Lang = { translate: key => key };
        app.Lampa.Maker.make = (type, data) => ({type,data});
        const result = app.getMain();
        assert.equal(result.length, 1);
        const card = result[0].results[0];
        const made = card.params.createInstance(card);
        assert.equal(made.type,'Card');
        assert.equal(made.data,card);
    }
});
test('external callbacks ignore malformed payloads and late duplicate completions', () => {
    const app=boot({saved:[{id:'ext_double',enabled:true}]});
    let callbackCount=0;
    app.Lampa.Api.partNext = (parts, limit, onData, onEmpty) => {
        parts[0](row => {
            callbackCount++;
            if (row.results.length) onData([row]);
            else onEmpty();
        });
    };
    app.window.surs_register_shelf({id:'ext_double',loader: cb => {
        cb(null);
        cb({results:[{id:99}]});
    }});
    app.getMain();
    assert.equal(callbackCount,1);
    assert.equal(app.window.SURS_SHELF_STATUS.ext_double.state,'empty');
    app.timers.filter(x=>x.ms >= 5000).forEach(timer => timer.fn());
    assert.equal(callbackCount,1);
    assert.equal(app.window.SURS_SHELF_STATUS.ext_double.state,'empty');
});
test('external callback throw after first response does not replace the result', () => {
    const app=boot({saved:[{id:'ext_throw',enabled:true}]});
    app.window.surs_register_shelf({id:'ext_throw',loader: cb => {
        cb(function(done){
            done({results:[{id:31}]});
            throw new Error('Late plugin exception');
        });
    }});
    const rows=app.getMain();
    assert.equal(rows[0].results[0].id,31);
    assert.equal(app.window.SURS_SHELF_STATUS.ext_throw.state,'ready');
});
test('boot failure retries and sets ready only after source registration succeeds', () => {
    const app=boot({failSourceRegistrationOnce:true});
    assert.equal(!!app.window.plugin_surs_fixed_ready,false);
    assert.equal(!!app.window.plugin_surs_fixed_starting,false);
    assert.equal(app.settings.length,0);
    const retry=app.timers.find(t=>t.ms===1000);
    assert.ok(retry);
    retry.fn();
    assert.equal(app.window.plugin_surs_fixed_ready,true);
    assert.equal(app.window.plugin_surs_fixed_starting,false);
    assert.equal(app.components.length,1);
    assert.equal(app.window.LampaShelfManager.version,'3.9.20');
});
test('startup waits if Lampa global is not defined', () => {
    const queued=[];
    const window={appready:false};
    vm.runInNewContext(source,{
        window,
        setTimeout: fn => queued.push(fn),
        console:{error:()=>{},warn:()=>{},log:()=>{}}
    },{filename:'surs.js'});
    assert.equal(!!window.plugin_surs_fixed_ready,false);
    assert.ok(queued.length > 0);
});
test('progressive Lampa3 displays nav before TMDB and appends rows in order', () => {
    const app=boot({saved:[
        {id:'nav_buttons',enabled:true},{id:'us_new_8',enabled:false},
        {id:'trend_movies',enabled:true},{id:'trend_tv',enabled:true},{id:'genres_icons',enabled:true}
    ]});
    app.Lampa.Manifest={app_digital:300};
    app.Lampa.Lang={translate:key=>key};
    const requests={}, late=[];
    app.Lampa.Activity.active=()=>({component:'main',source:'SURS',
        activity:{component:{emit:(type,rows)=>{if(type==='build')late.push(...rows);}}}});
    app.Lampa.Api.sources.SURS.get=(url,p,done)=>{requests[url]=done;};
    const initial=[];
    app.Lampa.Api.sources.SURS.main({source:'SURS'},rows=>initial.push(...rows),()=>{});
    let ticks=0;
    function flush() {
        while (true) {
            const next=app.timers.find(t=>t.ms===0&&!t.done);
            if(!next)break;
            next.done=true; next.fn();
            if(++ticks>100)throw Error('Timer recursion');
        }
    }
    flush();
    assert.equal(initial.length,1);
    assert.equal(initial[0].title,'Быстрый переход');
    requests['trending/tv/week']({results:[{id:2,title:'Сериал'}]});
    flush();
    assert.equal(late.length,0);
    requests['trending/movie/week']({results:[{id:1,title:'Фильм'}]});
    flush();
    assert.deepEqual(Array.from(late,x=>x.title),[
        'В тренде: Фильмы недели','В тренде: Сериалы недели','Жанры кино и сериалов'
    ]);
    assert.equal(app.window.SURS_PERFORMANCE.screens.MAIN.completed,5);
    assert.equal(typeof app.window.SURS_PERFORMANCE.screens.MAIN.first_row_ms,'number');
});
test('progressive loader drops late callbacks when page is no longer current', () => {
    const app=boot({saved:[{id:'nav_buttons',enabled:true},{id:'us_new_8',enabled:false},{id:'trend_movies',enabled:true}]});
    app.Lampa.Manifest={app_digital:300};
    let active={component:'main',source:'SURS',activity:{component:{emit:()=>{}}}};
    app.Lampa.Activity.active=()=>active;
    let deliver;
    app.Lampa.Api.sources.SURS.get=(url,p,cb)=>{deliver=cb;};
    const initial=[];
    app.Lampa.Api.sources.SURS.main({source:'SURS'},rows=>initial.push(...rows),()=>{});
    const tick=()=>{let limit=0;while(true){const x=app.timers.find(t=>t.ms===0&&!t.done);if(!x)break;x.done=true;x.fn();if(++limit>50)throw Error('too many timers');}};
    tick();
    assert.equal(initial.length,1);
    active={component:'full',source:'tmdb'};
    deliver({results:[{id:3,title:'Фильм'}]});
    tick();
    assert.equal(initial.length,1);
});
test('storage errors are detectable without silently losing old shelf settings', () => {
    const app=boot({saved:[{id:'nav_buttons',enabled:true}]});
    const old=app.stored.get('surs_fixed_shelves_v2');
    app.Lampa.Storage.set=(key,list,noListen,onError)=>{onError(new Error('QuotaExceededError'));};
    assert.equal(app.window.LampaShelfManager.saveShelves([{id:'trend_movies',enabled:true}]),false);
    assert.equal(app.stored.get('surs_fixed_shelves_v2'),old);
    app.Lampa.Storage.set=()=>{};
    assert.equal(app.window.LampaShelfManager.saveShelves([{id:'trend_tv',enabled:true}]),false);
    assert.equal(app.stored.get('surs_fixed_shelves_v2'),old);
});
test('failed reset must not clear the current configuration', () => {
    const app=boot({saved:[{id:'nav_buttons',enabled:true}]});
    const previous=app.stored.get('surs_fixed_shelves_v2');
    app.Lampa.Storage.set=()=>{throw new Error('Storage blocked');};
    assert.equal(app.window.LampaShelfManager.resetDefaults(),null);
    assert.equal(app.stored.get('surs_fixed_shelves_v2'),previous);
});
test('named Trakt ContentRow retains its receiver', () => {
    const app=boot({saved:[{id:'trakt_watchlist',enabled:true}]});
    const row={name:'TraktWatchlistRow',title:'Watchlist',call:function(params,screen){
        assert.equal(this,row);
        assert.equal(screen,'main');
        return cb=>cb({results:[{movie:{ids:{tmdb:321},title:'Фильм',year:2024}}]});
    }};
    app.Lampa.ContentRows.add(row);
    assert.equal(app.getMain()[0].results[0].id,321);
});
test('Trakt does not run unrelated ContentRows or inspect function source', () => {
    const app=boot({saved:[{id:'trakt_watchlist',enabled:true}]});
    app.Lampa.ContentRows.call=()=>{throw Error('Unsafe ContentRows scan');};
    assert.equal(app.getMain().length,0);
    assert.equal(app.contentRowsCalls(),0);
    assert.doesNotMatch(source,/fnStr\.indexOf\(targetRowName\)/);
});
test('Trakt cards use correct TMDB IDs', () => {
    const app = boot({ saved: [{ id: 'ext_TraktWatchlistRow', title: 'Trakt', enabled: true, cat: 'plugin' }] });
    app.Lampa.ContentRows.add({
        name: 'TraktWatchlistRow', title: 'Trakt Watchlist',
        call: () => cb => cb({ results: [{ movie: { title: 'Film', ids: { tmdb: 135, trakt: 12 }, year: 2024 } }] })
    });
    const data = app.getMain();
    assert.equal(data[0].results[0].id, 135);
    assert.equal(data[0].results[0].release_year, '2024');
});
test('early load retries without setting ready flag', () => {
    const app = boot({ ready: false });
    assert.equal(!!app.window.plugin_surs_fixed_ready, false);
    assert.ok(app.timers.some(x => x.ms === 150));
    app.Lampa.Api.sources.tmdb = { get: (url, params, cb) => cb({ results: [] }) };
    app.timers.find(x => x.ms === 150).fn();
    assert.equal(app.window.plugin_surs_fixed_ready, true);
});
test('new editor has phone, tablet, reduced-motion and scoped modal rules', () => {
    assert.match(source, /@media screen and \(max-width: 700px\)/);
    assert.match(source, /@media screen and \(min-width: 701px\) and \(max-width: 1100px\)/);
    assert.match(source, /prefers-reduced-motion: reduce/);
    assert.match(source, /modal\.surs-sm-modal\.surs-sm--touch/);
    assert.match(source, /modal\.surs-sm-modal\.surs-sm--tv/);
    assert.match(source, /data-action="cancel"/);
    assert.match(source, /data-action="search"/);
});
test('navigation row carries a responsive line hook and exactly seven entries', () => {
    const app = boot({ saved: [{id:'nav_buttons',enabled:true}] });
    const result = app.getMain();
    assert.equal(result.length, 1);
    const row = result[0];
    assert.equal(row.results.length, 7);
    assert.equal(row.params.items.mapping, 'line');
    assert.equal(row.params.items.view, 7);
    assert.equal(row.params.items.align_left, true);
    assert.ok(typeof row.params.emit.onCreate === 'function');
});
test('TV keeps one horizontal DPAD-friendly line even if a coarse pointer is reported', () => {
    const app = boot({ saved: [{id:'nav_buttons',enabled:true}], tv: true, coarse: true });
    const row = app.getMain()[0];
    const classes = [];
    row.params.emit.onCreate.call({html:{addClass:name => classes.push(name)}});
    assert.deepEqual(classes,['surs-nav-line']);
});
test('iPhone/iPad use single-row navigation without altering regular content rows', () => {
    const app = boot({ saved: [{id:'nav_buttons',enabled:true}], coarse: true });
    const row = app.getMain()[0];
    const classes = [];
    row.params.emit.onCreate.call({html:{addClass:name => classes.push(name)}});
    assert.deepEqual(classes,['surs-nav-line','surs-nav-line--touch']);
    const desktop = boot({ saved: [{id:'nav_buttons',enabled:true}] });
    const unchanged = [];
    desktop.getMain()[0].params.emit.onCreate.call({html:{addClass:name => unchanged.push(name)}});
    assert.deepEqual(unchanged,['surs-nav-line']);
    assert.match(source,/\.surs-nav-line--touch \.scroll__body\.mapping--line\s*\{\s*grid-template-columns: repeat\(var\(--surs-nav-count, 7\), minmax\(0, 1fr\)\) !important/);
    assert.doesNotMatch(source,/\.surs-nav-line--touch \.scroll__body\.mapping--line\s*\{\s*grid-template-columns: repeat\([34],/);
});
test('iPad pointer fallback identifies touch input via maxTouchPoints', () => {
    const app = boot({ saved: [{id:'nav_buttons',enabled:true}], coarse:false, touchPoints:5 });
    const classes=[];
    app.getMain()[0].params.emit.onCreate.call({html:{addClass:name=>classes.push(name)}});
    assert.equal(classes.includes('surs-nav-line--touch'),true);
});
test('navigation CSS remains isolated and hides film badges on quick buttons', () => {
    assert.match(source,/\.surs-nav-line \.scroll__body\.mapping--line\s*\{\s*display: grid !important/);
    assert.match(source,/\.surs-nav-line \.card__type,/);
    assert.match(source,/\.surs-nav-line \.card__quality,/);
    assert.match(source,/\.surs-nav-line \.card--button-compact\s*\{/);
    assert.doesNotMatch(source,/\.items-line\s*\{\s*display:\s*grid/);
});
test('mobile navigation has short labels and accessible full names', () => {
    const labels = ['Главная', 'Мир', 'Россия', 'Полки', 'Избр.', 'История', 'Настр.'];
    const block = source.slice(source.indexOf('var mobileLabels = {'),source.indexOf('var results = baseButtons.map('));
    labels.forEach(label => assert.ok(block.includes("'" + label + "'")));
    assert.match(source, /\$h\.attr\('aria-label', b\.title\)/);
    assert.match(source, /\$h\.attr\('title', b\.title\)/);
    assert.match(source, /card__button-label--mobile/);
});
test('very narrow phones keep icon-only seven-column layout', () => {
    assert.match(source, /@media screen and \(max-width: 350px\)/);
    assert.match(source, /\.surs-nav-line--touch \.card__button-label--mobile\s*\{\s*display: none !important/);
    assert.match(source,/grid-template-columns: repeat\(var\(--surs-nav-count, 7\), minmax\(0, 1fr\)\) !important/);
});
test('compact rules apply only to navigation cards', () => {
    assert.match(source, /\.surs-nav-line--touch \.card--button-compact \{/);
    assert.match(source, /\.surs-nav-line--touch \.card__button-icon \{/);
    assert.doesNotMatch(source, /\n\s*\.card--button-compact\s*\{[^}]*height:\s*4\.5em/);
});
test('seven independent visibility triggers exist in SURS settings', () => {
    const app = boot();
    const triggers = app.settings.filter(item => item.param.type === 'trigger' &&
        item.param.name.startsWith('surs_nav_visible_'));
    const expected = ['surs_main', 'surs_new', 'surs_rus', 'surs_shelf_manager',
        'surs_bookmarks', 'surs_history', 'surs_settings'];
    assert.deepEqual(triggers.map(x => x.param.name),
        expected.map(id => 'surs_nav_visible_' + id));
    assert.ok(triggers.every(x => x.param.default === true && x.component === 'surs'));
    assert.ok(triggers.every(x => typeof x.onChange === 'function'));
    assert.ok(app.settings.some(x => x.param.name === 'surs_nav_refresh'));
});
test('hide Home and Settings: five icons remain, order and widths update', () => {
    const app = boot({saved:[{id:'nav_buttons',enabled:true}],coarse:true});
    app.stored.set('surs_nav_visible_surs_main',false);
    app.stored.set('surs_nav_visible_surs_settings',false);
    const rows = app.getMain();
    assert.equal(rows.length,1);
    const bar=rows[0];
    assert.equal(bar.results.length,5);
    assert.deepEqual(Array.from(bar.results,x=>x.title),[
        'Новинки Мир','Новинки Россия','Порядок полок','Закладки','История'
    ]);
    assert.equal(bar.params.items.view,5);
    const html = { addClass: () => {} };
    bar.params.emit.onCreate.call({html});
    assert.equal(html.styles['--surs-nav-count'],'5');
    assert.equal(html.attrs['data-surs-nav-count'],'5');
});
test('single remaining button is correctly count-limited and centered', () => {
    const app = boot({saved:[{id:'nav_buttons',enabled:true}],coarse:true});
    const all = ['surs_main','surs_new','surs_rus','surs_shelf_manager',
        'surs_bookmarks','surs_history','surs_settings'];
    all.forEach(id=>app.stored.set('surs_nav_visible_'+id,id==='surs_bookmarks'));
    const bar=app.getMain()[0];
    assert.equal(bar.results.length,1);
    assert.equal(bar.results[0].title,'Закладки');
    assert.equal(bar.params.items.view,1);
    assert.match(source,/\.surs-nav-line\[data-surs-nav-count="1"\] \.scroll__body\.mapping--line \{ max-width: 10em !important/);
});
test('hiding all nav buttons omits empty row; restored icon works', () => {
    const app = boot({saved:[{id:'nav_buttons',enabled:true},{id:'new_movies',enabled:true}]});
    const names=['surs_main','surs_new','surs_rus','surs_shelf_manager',
        'surs_bookmarks','surs_history','surs_settings'];
    names.forEach(id=>app.stored.set('surs_nav_visible_'+id,false));
    const hidden=app.getMain();
    assert.ok(hidden.every(x=>x.title!=='Быстрый переход'));
    app.stored.set('surs_nav_visible_surs_settings',true);
    const restored=app.getMain();
    assert.ok(restored.some(x=>x.title==='Быстрый переход'));
    assert.equal(restored.find(x=>x.title==='Быстрый переход').results.length,1);
});
test('navigation preferences are independent from factory shelf reset', () => {
    const app=boot({saved:[{id:'nav_buttons',enabled:true}]});
    app.stored.set('surs_nav_visible_surs_settings',false);
    app.window.LampaShelfManager.resetDefaults();
    assert.equal(app.stored.get('surs_nav_visible_surs_settings'),false);
    assert.equal(app.window.LampaShelfManager.getSavedShelves().length,25);
});
test('apply button refreshes home while individual toggles leave settings open', () => {
    const app=boot();
    const option=app.settings.find(x=>x.param.name==='surs_nav_visible_surs_main');
    option.onChange(false);
    assert.equal(app.navigations.length,0);
    const apply=app.settings.find(x=>x.param.name==='surs_nav_refresh');
    apply.onChange();
    const refresh=app.timers.find(x=>x.ms===80);
    assert.ok(refresh);
    refresh.fn();
    assert.equal(app.navigations[0].source,'SURS');
});
test('dynamic CSS columns and scoped fallback widths work across viewports', () => {
    assert.match(source,/grid-template-columns: repeat\(var\(--surs-nav-count, 7\), minmax\(0, 1fr\)\)/);
    for(let n=1;n<=6;n++){
        assert.ok(source.includes('.surs-nav-line[data-surs-nav-count="'+n+'"]'));
    }
    assert.doesNotMatch(source,/\.items-line\s*\{\s*grid-template-columns:/);
});
test('mobile modal is fullscreen without modifying global Lampa modals', () => {
    assert.match(source,/\.modal\.surs-sm-modal\.surs-sm--touch \.modal__content\s*\{/);
    assert.match(source,/height: 100dvh !important/);
    assert.match(source,/shell\.addClass\('surs-sm-modal'\)/);
    assert.match(source,/shell\.addClass\('surs-sm--touch'\)/);
    assert.match(source,/shell\.addClass\('surs-sm--tv'\)/);
    assert.doesNotMatch(source, /\n\s*\.modal__content\s*\{[^}]*height: 100dvh/);
});
test('editor uses dedicated flexible scrolling area and fixed controls', () => {
    assert.match(source,/\.modal\.surs-sm-modal \.surs-sm-wrap\s*\{[^}]*display: flex;[^}]*flex-direction: column;/);
    assert.match(source,/\.surs-sm-list\s*\{[^}]*flex: 1 1 0;[^}]*overflow-y: auto;/);
    assert.match(source,/\.modal\.surs-sm-modal\.surs-sm--touch \.surs-sm-footer\s*\{/);
    assert.match(source,/env\(safe-area-inset-bottom, 0px\)/);
    assert.doesNotMatch(source,/@media \(max-width: 680px\)/);
});
test('mobile editor has responsive type and 44px touch targets', () => {
    assert.match(source,/\.surs-sm-name\s*\{[^}]*font-size: 15px !important;/);
    assert.match(source,/\.surs-sm-desc\s*\{[^}]*font-size: 12px !important;/);
    assert.match(source,/\.surs-sm-item\s*\{[^}]*min-height: 76px;/);
    assert.match(source,/\.surs-sm-drag-handle\s*\{[^}]*min-width: 44px !important;/);
    assert.match(source,/\.surs-sm-toolbar\s*\{[^}]*display: flex;/);
});
test('mobile header has close, overflow, summary and accessible actions', () => {
    assert.match(source,/data-action="back" role="button" aria-label="Закрыть редактор"/);
    assert.match(source,/data-action="options" role="button" aria-label="Дополнительные действия"/);
    assert.match(source,/Сбросить полки раздела/);
    assert.doesNotMatch(source,/data-action="categories"/);
    assert.match(source,/surs-sm-counter/);
});
test('inline live search filters existing list without destroying focused input', () => {
    assert.match(source,/type="search" class="surs-sm-search-input"/);
    assert.match(source,/searchInput\.on\('input', function\(\)/);
    assert.match(source,/filterVisibleRows\(\)/);
    assert.match(source,/surs-sm-row-filtered/);
    assert.match(source,/surs-sm-empty-search/);
    assert.match(source,/openSearchKeyboard\(\)/);
});
test('all categories remain in the horizontal tab strip', () => {
    [
        ["all", "Все"], ["enabled", "Активные"], ["hidden", "Скрытые"],
        ["surs", "SURS"], ["core", "Lampa Core"], ["plugin", "Плагины"],
        ["streaming", "Стриминги"], ["genre", "Жанры"]
    ].forEach(([id, label]) => {
        assert.ok(source.includes("{ id: '" + id + "', title: '" + label + "' }"));
    });
    assert.doesNotMatch(source,/title: 'Категория полок'/);
    assert.doesNotMatch(source,/data-action="categories"/);
});
test('mobile tabs scroll horizontally with native inertial touch', () => {
    assert.match(source,/\.modal\.surs-sm-modal\.surs-sm--touch \.surs-sm-tabs\s*\{[^}]*overflow-x: auto !important;/);
    assert.match(source,/-webkit-overflow-scrolling: touch/);
    assert.match(source,/touch-action: pan-x/);
    assert.match(source,/scroll-snap-type: x proximity/);
    assert.match(source,/\.modal\.surs-sm-modal\.surs-sm--touch \.surs-sm-tab\s*\{[^}]*flex: 0 0 auto !important;/);
    assert.match(source,/\.modal\.surs-sm-modal\.surs-sm--touch \.surs-sm-tab\s*\{[^}]*min-height: 44px !important;/);
    assert.doesNotMatch(source,/\.surs-sm-tab\[data-cat="plugin"\][^}]*display: none/);
});
test('selected category stays visible after a filter or reorder redraw', () => {
    assert.match(source,/var previousTabScroll = oldTabs\.length \? oldTabs\.scrollLeft\(\) : 0;/);
    assert.match(source,/newContent\.find\('\.surs-sm-tabs'\)\.scrollLeft\(previousTabScroll\);/);
    assert.match(source,/selectedTab\.getBoundingClientRect/);
    assert.match(source,/tabViewport\.scrollLeft \+=/);
    assert.match(source,/tabViewport\.scrollLeft -=/);
});
test('swipeable filters retain native selection and do not affect content search', () => {
    assert.match(source,/activeCategory = t\.id;/);
    assert.match(source,/refreshListFocus\(null, 'tab'\)/);
    assert.match(source,/searchInput\.on\('input', function\(\)/);
    assert.match(source,/Lampa\.Controller\.collectionSet\(newContent\)/);
});
test('exit protects unsaved changes and Apply is disabled if unchanged', () => {
    assert.match(source,/function hasUnsavedChanges\(\)/);
    assert.match(source,/title: 'Есть несохранённые изменения'/);
    assert.match(source,/Сохранить и выйти/);
    assert.match(source,/Выйти без сохранения/);
    assert.match(source,/Продолжить редактирование/);
    assert.match(source,/aria-disabled="[^"]*hasUnsavedChanges\(\)/);
    assert.match(source,/if \(!hasUnsavedChanges\(\)\) \{/);
    assert.match(source,/requestCloseEditor\(\)/);
});
test('mobile footer includes only Add and Apply with overflow elsewhere', () => {
    assert.match(source,/\.surs-sm--touch \.surs-sm-footer \[data-action="rescan"\]/);
    assert.match(source,/\.surs-sm--touch \.surs-sm-footer \[data-action="reset"\]/);
    assert.match(source,/\.surs-sm--touch \.surs-sm-footer \[data-action="cancel"\]/);
    assert.match(source,/\.surs-sm--touch \.surs-sm-footer \[data-action="add"\]/);
    assert.match(source,/\.surs-sm--touch \.surs-sm-footer \[data-action="apply"\]/);
    assert.match(source,/title: 'Действия с полками'/);
    assert.match(source,/choice\.action === 'hide-all-plugins'/);
});
test('touch reordering waits for hold and cleans up on cancel', () => {
    assert.match(source,/touchTimer = setTimeout\(function\(\) \{[^}]*touchArmed = true;/);
    assert.match(source,/220\)/);
    assert.match(source,/handle\.on\('touchend touchcancel'/);
    assert.match(source,/if \(!touchArmed\) \{/);
    assert.match(source,/function clearTouchReorder\(\)/);
    assert.match(source,/document\.elementFromPoint/);
});
test('TV D-pad uses visible filtered rows and fixed accessible focus', () => {
    assert.match(source,/root\.find\('\.surs-sm-item:visible'\)/);
    assert.match(source,/surs-sm--tv \.surs-sm-search-trigger/);
    assert.match(source,/Lampa\.Controller\.collectionSet\(newContent\)/);
    assert.match(source,/aria-pressed=/);
    assert.match(source,/aria-label=/);
});
test('existing factory configuration and nav buttons are still present', () => {
    const app = boot();
    assert.equal(app.rows().length,25);
    assert.equal(app.rows().filter(x=>x.enabled).length,11);
    assert.equal(app.settings.filter(x=>x.param.name && x.param.name.startsWith('surs_nav_visible_')).length,7);
});
test('three independent screen profiles have the expected factory defaults', () => {
    const app=boot();
    const manager=app.window.LampaShelfManager;
    const main=manager.getSavedShelves();
    const world=manager.getSavedShelves('NEW');
    const russia=manager.getSavedShelves('RUS');
    assert.equal(main.length,25);
    assert.equal(main.filter(x=>x.enabled).length,11);
    assert.equal(main.find(x=>x.id==='rus_movies').enabled,false);
    assert.equal(main.find(x=>x.id==='rus_tv').enabled,false);
    assert.equal(main.find(x=>x.id==='new_movies').enabled,false);
    assert.equal(main.find(x=>x.id==='new_tv').enabled,false);
    assert.deepEqual(Array.from(world,x=>x.id),[
        'nav_buttons','streaming_global','new_movies','new_tv','trend_movies','trend_tv'
    ]);
    assert.ok(world.every(x=>x.enabled));
    assert.deepEqual(Array.from(russia,x=>x.id),[
        'nav_buttons','streaming_russian','rus_movies','rus_tv',
        'stream_kinopoisk','stream_premier','stream_start'
    ]);
    assert.deepEqual(Array.from(russia,x=>x.enabled),[true,true,true,true,false,false,false]);
    assert.equal(app.stored.has('surs_shelves_world_v1'),false);
    assert.equal(app.stored.has('surs_shelves_russia_v1'),false);
});
test('Russian screen displays cinema and series although both are hidden on main', () => {
    const app=boot();
    const main=app.getMain('SURS');
    const russian=app.getMain('SURS RUS');
    const mainTitles=main.map(x=>x.title);
    const russianTitles=russian.map(x=>x.title);
    assert.equal(mainTitles.includes('Российские фильмы (Новинки)'),false);
    assert.equal(mainTitles.includes('Российские сериалы (Новинки)'),false);
    assert.equal(russianTitles.includes('Российские фильмы (Новинки)'),true);
    assert.equal(russianTitles.includes('Российские сериалы (Новинки)'),true);
    assert.equal(russianTitles.includes('Российские стриминги'),true);
});
test('World screen displays its own premieres regardless of main visibility', () => {
    const app=boot({saved:[
        {id:'nav_buttons',enabled:true},
        {id:'new_movies',enabled:false},
        {id:'new_tv',enabled:false}
    ]});
    const main=app.getMain('SURS'),world=app.getMain('SURS NEW');
    assert.equal(main.some(x=>x.title==='Свежие новинки кино'),false);
    assert.equal(world.some(x=>x.title==='Свежие новинки кино'),true);
    assert.equal(world.some(x=>x.title==='Свежие новинки сериалов'),true);
});
test('Russia profile updates never mutate home or world', () => {
    const app=boot();
    const manager=app.window.LampaShelfManager;
    const mainBefore=JSON.stringify(manager.getSavedShelves());
    const worldBefore=JSON.stringify(manager.getSavedShelves('NEW'));
    manager.saveShelves([
        {id:'rus_tv',enabled:true,title:'Сериалы России'},
        {id:'rus_movies',enabled:false,title:'Фильмы России'}
    ],'RUS');
    assert.equal(manager.getSavedShelves('RUS')[0].id,'rus_tv');
    assert.equal(manager.getSavedShelves('RUS')[1].enabled,false);
    assert.equal(JSON.stringify(manager.getSavedShelves()),mainBefore);
    assert.equal(JSON.stringify(manager.getSavedShelves('NEW')),worldBefore);
    assert.equal(app.stored.has('surs_fixed_shelves_v2'),false);
    assert.equal(app.stored.has('surs_shelves_world_v1'),false);
});
test('World profile updates do not change Russia or home', () => {
    const app=boot();
    const manager=app.window.LampaShelfManager;
    manager.saveShelves([{id:'new_tv',enabled:true,title:'Сериалы'}],'NEW');
    assert.equal(manager.getSavedShelves('NEW').length,1);
    assert.equal(manager.getSavedShelves('RUS').filter(x=>x.enabled).length,4);
    assert.equal(manager.getSavedShelves().filter(x=>x.enabled).length,11);
});
test('scope reset restores only that section, source and visible defaults', () => {
    const app=boot({saved:[{id:'rus_movies',enabled:false},{id:'nav_buttons',enabled:true}]});
    const manager=app.window.LampaShelfManager;
    manager.saveShelves([{id:'rus_movies',enabled:false}],'RUS');
    manager.saveShelves([{id:'new_movies',enabled:false}],'NEW');
    const originalHome=JSON.stringify(manager.getSavedShelves());
    const originalWorld=JSON.stringify(manager.getSavedShelves('NEW'));
    const defaults=manager.resetDefaults('RUS');
    assert.equal(defaults.filter(x=>x.enabled).length,4);
    assert.equal(defaults.find(x=>x.id==='rus_movies').enabled,true);
    assert.equal(JSON.stringify(manager.getSavedShelves()),originalHome);
    assert.equal(JSON.stringify(manager.getSavedShelves('NEW')),originalWorld);
    const job=app.timers.find(t=>t.ms===80);
    assert.ok(job);
    job.fn();
    assert.equal(app.navigations[0].source,'SURS RUS');
});
test('separate settings buttons and editor tabs exist for both sections', () => {
    const app=boot();
    const buttons=app.settings.filter(x=>x.param && x.param.name && x.param.name.indexOf('surs_open_')===0);
    assert.ok(buttons.some(x=>x.param.name==='surs_open_editor'));
    assert.ok(buttons.some(x=>x.param.name==='surs_open_world_editor'));
    assert.ok(buttons.some(x=>x.param.name==='surs_open_russia_editor'));
    assert.match(source,/data-surs-screen=/);
    assert.match(source,/role="tablist" aria-label="Настраиваемый экран"/);
    assert.match(source,/function switchEditorScope\(nextScope\)/);
    assert.match(source,/Сохранить и перейти/);
    assert.match(source,/Перейти без сохранения/);
});
test('responsive independent screen tabs remain touch-friendly', () => {
    assert.match(source,/\.modal\.surs-sm-modal \.surs-sm-screen-tab \{/);
    assert.match(source,/min-height: 44px/);
    assert.match(source,/\.modal\.surs-sm-modal\.surs-sm--touch \.surs-sm-screen-tab \{/);
    assert.match(source,/\.surs-sm-screen-tab\.active/);
});
test('saved home profile uses the original storage key after update', () => {
    const custom=[{id:'nav_buttons',enabled:true},{id:'rus_movies',enabled:false}];
    const app=boot({saved:custom});
    const manager=app.window.LampaShelfManager;
    manager.saveShelves([{id:'rus_movies',enabled:false}],'RUS');
    assert.deepEqual(Array.from(manager.getSavedShelves(),x=>x.id),['nav_buttons','kp_new_8','us_new_8','rus_movies']);
    assert.equal(app.stored.get('surs_fixed_shelves_v2'),custom);
});
test('main factory reset leaves customized World and Russia profiles untouched', () => {
    const app=boot();
    const manager=app.window.LampaShelfManager;
    manager.saveShelves([{id:'rus_tv',enabled:false}],'RUS');
    manager.saveShelves([{id:'trend_movies',enabled:false}],'NEW');
    manager.resetDefaults();
    assert.equal(manager.getSavedShelves().filter(x=>x.enabled).length,11);
    assert.equal(manager.getSavedShelves('RUS')[0].enabled,false);
    assert.equal(manager.getSavedShelves('NEW')[0].enabled,false);
});
test('screen profile tabs support TV D-pad directional navigation', () => {
    assert.match(source,/cur\.hasClass\('surs-sm-screen-tab'\)/);
    assert.match(source,/root\.find\('\.surs-sm-screen-tab'\)/);
    assert.match(source,/root\.find\('\.surs-sm-screen-tab\.active'\)/);
    assert.match(source,/function switchEditorScope\(nextScope\)/);
});
test('profile edits save under dedicated keys and refresh their own activity', () => {
    assert.match(source,/saveShelves\(shelves, editorScope\)/);
    assert.match(source,/refreshSursHome\(editorScope\)/);
    assert.match(source,/surs_shelves_world_v1/);
    assert.match(source,/surs_shelves_russia_v1/);
    assert.match(source,/openShelfManagerModal\('MAIN'\)/);
});
test('world premieres are enabled by default in World but not on Home', () => {
    const app=boot();
    const home=app.getMain('SURS');
    const world=app.getMain('SURS NEW');
    const titles=items=>items.map(x=>x.title);
    assert.ok(!titles(home).includes('Свежие новинки кино'));
    assert.ok(!titles(home).includes('Свежие новинки сериалов'));
    assert.ok(titles(world).includes('Свежие новинки кино'));
    assert.ok(titles(world).includes('Свежие новинки сериалов'));
});
test('user-enabled world premieres on home remain enabled after upgrade', () => {
    const saved=[
        {id:'nav_buttons',enabled:true,title:'Быстрый переход'},
        {id:'new_movies',enabled:true,title:'Новинки мирового кино'},
        {id:'new_tv',enabled:true,title:'Новинки сериалов'}
    ];
    const app=boot({saved});
    assert.equal(app.rows().find(x=>x.id==='new_movies').enabled,true);
    assert.equal(app.rows().find(x=>x.id==='new_tv').enabled,true);
    assert.ok(app.getMain('SURS').length>=2);
    assert.equal(app.stored.get('surs_fixed_shelves_v2'),saved);
});
test('native main menu handlers are preserved', () => {
    assert.doesNotMatch(source, /mainButton\.off\('hover:enter click'\)/);
});
console.log('\nSURS smoke tests: ' + passed + ' passed.');
