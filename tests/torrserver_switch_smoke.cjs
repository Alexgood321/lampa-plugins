'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');

const original = fs.readFileSync(require('node:path').join(__dirname,'..','torrserver_switch.js'),'utf8');
assert.match(original, /Version: 2\.0\.0/);
const keys={torrserver_use_link:'one',torrserver_url:'http://primary:8090',
    torrserver_url_two:'http://secondary:8090'};
const callbacks={};
const sections={};
const params={};
const calls=[];
const responses={one:{state:'up'},two:{state:'up'}};
let playerOpened=false;
let button=null;

class JQ {
    constructor() {this.length=1;this.events={};this.attrs={};this.classes=[];this.children={};this.removed=false;}
    find(query) {
        if(query==='.head__actions') return new JQ();
        if(query.indexOf('data-alex-ts-info')>=0) return {length:0};
        return this.children[query] || (this.children[query]=new JQ());
    }
    on(event,fn) {this.events[event]=fn;return this;}
    text(value) {if(arguments.length){this.inner=value;return this;}return this.inner;}
    attr(name,value) {if(arguments.length===2){this.attrs[name]=value;return this;}return this.attrs[name];}
    addClass(x) {this.classes.push(x);return this;}
    removeClass() {return this;}
    toggleClass() {return this;}
    toggle() {return this;}
    remove() {this.removed=true;return this;}
}
class FakeXHR {
    open(method,url) {this.url=url;assert.equal(method,'GET');}
    setRequestHeader(name,value) {if(name==='Authorization') assert.ok(value.startsWith('Basic '));}
    send() {
        calls.push(this.url);
        const which=this.url.includes('primary')?'one':'two';
        const response=responses[which];
        if(response.state==='up') {this.status=200;this.responseText='MatriX.146';this.onload();}
        else if(response.state==='server_down') {this.status=503;this.responseText='';this.onload();}
        else if(response.state==='cors') this.onerror();
        else if(response.state==='timeout') this.ontimeout();
    }
    abort(){if(this.onabort)this.onabort();}
}
const listeners={change:[],open:[]};
const Lampa={
    Storage:{
        get:(key,fallback)=>Object.hasOwn(keys,key)?keys[key]:fallback,
        field:key=>Object.hasOwn(keys,key)?keys[key]:(key==='torrserver_use_link'?'one':false),
        set:(key,value)=>{
            keys[key]=value;
            listeners.change.forEach(fn=>fn({name:key,value}));
        },
        listener:{follow:(event,fn)=>listeners[event].push(fn)}
    },
    SettingsApi:{
        addComponent:comp=>{sections[comp.component]=comp;},
        removeComponent:name=>{delete sections[name];delete params[name];},
        addParam:param=>(params[param.component]??=[]).push(param)
    },
    Settings:{
        main:()=>({update(){}}),
        render:()=>new JQ(),
        listener:{follow:(event,fn)=>listeners[event].push(fn)},
        update(){}
    },
    Head:{
        render:()=>new JQ(),
        addElement:(item,handler)=>{button=item;item.events['hover:enter']=handler;return item;}
    },
    Player:{opened:()=>playerOpened},
    Noty:{show(){}}
};
let nextTimer=0;
const timers=new Map();
const context={
    window:{
        Lampa,$:()=>new JQ(),
        XMLHttpRequest:FakeXHR,
        navigator:{onLine:true},
        addEventListener(){},removeEventListener(){}
    },
    Lampa,
    document:{
        hidden:false,head:{appendChild(node){this.style=node;}},
        createElement:()=>({id:'',textContent:''}),
        getElementById:()=>null
    },
    setInterval:(fn)=>{timers.set(++nextTimer,fn);return nextTimer;},
    clearInterval:n=>timers.delete(n),
    setTimeout:(fn)=>{timers.set(++nextTimer,fn);return nextTimer;},
    clearTimeout:n=>timers.delete(n),
    console,Date,unescape,encodeURIComponent
};
context.window.document=context.document;
vm.runInNewContext(original,context);
const plugin=context.window.__alexgood321TorrServerSwitch;
assert.equal(plugin.version,'2.0.0');
assert.ok(sections.alexgood321_torrserver_switch_settings);
assert.ok(params.alexgood321_torrserver_switch_settings.length>=20);
assert.ok(button);
assert.match(button.find('.alex-ts-switch-label').text(),/TS 1/);
assert.equal(keys.torrserver_use_link,'one');

plugin.toggle();
assert.equal(keys.torrserver_use_link,'two','manual button selects backup');
plugin.toggle();
assert.equal(keys.torrserver_use_link,'two','debounce blocks immediate double action');
keys.alex_tss_header=false;
Lampa.Storage.set('alex_tss_header',false);
assert.ok(button.removed,'disabling header removes button');
Lampa.Storage.set('alex_tss_header',true);
assert.equal(button.removed,false,'re-enabling header inserts button');

Lampa.Storage.set('torrserver_use_link','one');
Lampa.Storage.set('alex_tss_mode','auto');
Lampa.Storage.set('alex_tss_fail_count','2');
Lampa.Storage.set('alex_tss_return_primary',false);
responses.one={state:'server_down'};
plugin.check();
assert.equal(keys.torrserver_use_link,'one','first failure must not switch');
plugin.check();
assert.equal(keys.torrserver_use_link,'two','second failure switches to verified backup');

responses.one={state:'up'};
plugin.check();
assert.equal(keys.torrserver_use_link,'two','return disabled');
Lampa.Storage.set('alex_tss_mode','manual');
Lampa.Storage.set('torrserver_use_link','one');
responses.one={state:'cors'};
plugin.check();
assert.equal(plugin.status.one.state,'unknown','CORS is not claimed to prove outage');
assert.equal(plugin.status.one.failures,0,'CORS is not a hard failure');
assert.ok(calls.some(x=>x.endsWith('/echo')),'probes use official health endpoint');
plugin.destroy();
assert.equal(sections.alexgood321_torrserver_switch_settings,undefined);
console.log('TorrServer Switch Pro 2.0: smoke checks passed');