'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'../kp_rating_pro.js'),'utf8');
const a = source.indexOf('    function start() {');
const b = source.indexOf('    function tryStart() {',a);
assert.ok(a>=0 && b>a);
const active = new Map();
const documentHandlers = new Map();
let scans = 0, queued = 0, removed = 0;
const document = {
    body: {}, hidden: false,
    addEventListener(key, fn){ documentHandlers.set(key, fn); },
    removeEventListener(key, fn) {
        assert.equal(documentHandlers.get(key),fn);
        documentHandlers.delete(key); removed++;
    }
};
class Observer {
    observe() {}
    disconnect() {}
}
const context = {
    window: {}, document,
    Lampa: {
        Storage: {},
        Listener: {
            follow(name,fn) {active.set(name,fn);},
            remove(name,fn){assert.equal(active.get(name),fn);active.delete(name);removed++;}
        }
    },
    CACHE_KEY:'kp_rating_pro_cache_v1', BUDGET_KEY:'kp_rating_pro_budget_v1',
    cache: {}, budget:null, started:false, stateByNode:new WeakMap(),
    io:null, mo:null, scheduledScan:false, scanRoots:[],
    scanTimer:null, pumpTimer:null, sourceTimer:null, saveTimer:null,
    storageGet(_key,fallback){return fallback;},
    storageSet() {},
    trimCache(){}, installCss(){}, registerSettings(){},
    scan(){scans++;}, queueScan(){queued++;}, pump(){},
    IntersectionObserver:Observer, MutationObserver:Observer,
    console, Date, WeakMap, clearTimeout
};
vm.createContext(context);
vm.runInContext(source.slice(a,b)+'\nthis.start=start;',context);
context.start();
assert.equal(context.started,true);
assert.equal(scans,1);
const oldHandler = active.get('activity');
const oldVisible = documentHandlers.get('visibilitychange');
assert.equal(typeof oldHandler,'function');
assert.equal(typeof oldVisible,'function');
oldHandler({type:'start'});
assert.equal(queued,1);
context.window.kp_rating_pro_destroy();
assert.equal(removed,2);
assert.equal(active.size,0);
assert.equal(documentHandlers.size,0);
assert.equal(context.started,false);
assert.equal(context.window.kp_rating_pro_initialized,false);
assert.equal(context.window.kp_rating_pro_rescan,undefined);
oldHandler({type:'start'});
oldVisible();
assert.equal(queued,1,'destroyed handlers must be inert');
context.start();
assert.equal(scans,2);
assert.equal(active.size,1);
assert.equal(documentHandlers.size,1);
assert.notEqual(active.get('activity'),oldHandler);
assert.match(source,/if\(scanTimer\)\{clearTimeout\(scanTimer\);scanTimer=null;\}/);
console.log('PASS KP Rating Pro: observer, event listener, timer and restart lifecycle');
