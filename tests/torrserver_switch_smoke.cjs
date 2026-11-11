'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');

const original = fs.readFileSync(require('node:path').join(__dirname,'..','torrserver_switch.js'),'utf8');
assert.match(original, /Version: 2\.1\.2/);
const keys={torrserver_use_link:'one',torrserver_url:'http://primary:8090',
    torrserver_url_two:'http://secondary:8090'};
const callbacks={};
const sections={};
const params={};
const calls=[];
const responses={one:{state:'up'},two:{state:'up'}};
let playerOpened=false;
let timeOffset=0;
class MockDate extends Date {static now(){return Date.now()+timeOffset;}}
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
    addClass(x) {this.classes.push(...x.split(/\s+/));return this;}
    removeClass(x) {this.classes=this.classes.filter(c=>!x.split(/\s+/).includes(c));return this;}
    hasClass(x) {return this.classes.includes(x);}
    toggleClass(x,enabled) {if(enabled)this.addClass(x);else this.removeClass(x);return this;}
    toggle(value) {this.visible=!!value;return this;}
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
const delays=new Map();
function runTimer(delay) {
    const record=[...delays.entries()].find(([,n])=>n===delay);
    assert.ok(record,'Expected scheduled timer '+delay+'ms');
    const id=record[0], callback=timers.get(id);
    timers.delete(id);delays.delete(id);callback();
}
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
    setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,fn);delays.set(id,delay);return id;},
    clearTimeout:n=>{timers.delete(n);delays.delete(n);},
    console,Date:MockDate,unescape,encodeURIComponent
};
context.window.document=context.document;
vm.runInNewContext(original,context);
const plugin=context.window.__alexgood321TorrServerSwitch;
assert.equal(plugin.version,'2.1.2');
assert.ok(sections.alexgood321_torrserver_switch_settings);
assert.ok(params.alexgood321_torrserver_switch_settings.length>=20);
assert.ok(params.alexgood321_torrserver_switch_settings.some(p=>p.param.name==='torrserver_url' && p.param.type==='input'));
assert.ok(params.alexgood321_torrserver_switch_settings.some(p=>p.param.name==='torrserver_url_two' && p.param.type==='input'));
assert.ok(params.alexgood321_torrserver_switch_settings.some(p=>p.param.name==='alex_tss_mode' && p.param.type==='select'));
assert.ok(params.alexgood321_torrserver_switch_settings.some(p=>p.param.name==='alex_tss_header' && p.param.type==='trigger'));
assert.ok(button);
const style=context.document.head.style.textContent;
assert.match(style,/alex-ts-switch-face\{display:flex!important;position:absolute!important;top:0;right:0;bottom:0;left:0;inset:0/,'absolute full-size faces required including older WebView fallback');
assert.match(style,/max-width:480px/,'compact fallback for wide pill layout on small screens');
assert.match(style,/alex-ts-switch-ping\{opacity:0;transform:translate3d\(0,105%,0\)/,'offscreen ping frame');
assert.match(style,/data-phase="ping"] .alex-ts-switch-server/,'server hidden during ping');
assert.match(style,/max-width:640px/,'small viewport title protection');
assert.match(style,/prefers-reduced-motion:reduce/,'reduced motion fallback');
assert.match(style,/alex-ts-switch-ping-unit\{display:block;font-size:\.7em;font-weight:600;line-height:1\.05/,'readable ms label');
assert.match(style,/alex-ts-switch-dot\{position:absolute;z-index:2;top:\.2em;right:\.2em/,'status dot is inset inside circle');
assert.doesNotMatch(style,/height:200%;width:100%;transform:translateY/,'broken inline track must not return');
const settings=params.alexgood321_torrserver_switch_settings;
for(const name of ['layout','display','animate','ts_duration','ping_duration',
    'pause_focus','compact_ping','auto_badge','show_status']) {
    assert.ok(settings.some(p=>p.param.name==='alex_tss_'+name),name+' exposed in settings');
}
assert.equal(button.attr('data-layout'),'round','matches native Lampa circular geometry');
assert.equal(button.attr('data-phase'),'server','starts with server label');
assert.equal(button.find('.alex-ts-switch-number').text(),'1');
assert.equal(button.attr('data-animate'),'on','smooth transition enabled by default');
runTimer(3000);
assert.equal(button.attr('data-phase'),'ping','ping appears after TS 3s');
runTimer(2000);
assert.equal(button.attr('data-phase'),'server','server returns after ping 2s');
Lampa.Storage.set('alex_tss_layout','pill');
assert.equal(button.attr('data-layout'),'pill','older shape can be restored');
Lampa.Storage.set('alex_tss_layout','round');
assert.equal(button.attr('data-layout'),'round','round layout restored');
Lampa.Storage.set('alex_tss_display','ping');
assert.equal(button.attr('data-phase'),'ping','ping-only mode');
Lampa.Storage.set('alex_tss_display','server');
assert.equal(button.attr('data-phase'),'server','server-only mode');
Lampa.Storage.set('alex_tss_animate',false);
assert.equal(button.attr('data-animate'),'off','animation can be disabled');
Lampa.Storage.set('alex_tss_display','alternate');
assert.equal(button.attr('data-phase'),'server','alternate restarts with TS');
Lampa.Storage.set('alex_tss_ts_duration','4');
runTimer(4000);
assert.equal(button.attr('data-phase'),'ping','custom duration applied');
Lampa.Storage.set('alex_tss_ping_duration','1');
runTimer(4000);
assert.equal(button.attr('data-phase'),'ping','presentation config resets to TS then rotates');
runTimer(1000);
assert.equal(button.attr('data-phase'),'server','custom ping duration applied');
Lampa.Storage.set('alex_tss_pause_focus',true);
button.addClass('focus');
runTimer(4000);
assert.equal(button.attr('data-phase'),'server','focus freezes content');
button.removeClass('focus');
runTimer(350);
assert.equal(button.attr('data-phase'),'ping','animation resumes when focus leaves');
Lampa.Storage.set('alex_tss_pause_focus',false);
Lampa.Storage.set('alex_tss_display','server');
assert.equal(keys.torrserver_use_link,'one');
assert.equal(keys.torrserver_url,'http://primary:8090','native primary address is preserved');
assert.equal(keys.torrserver_url_two,'http://secondary:8090','native backup address is preserved');
plugin.status.two.state='online';
plugin.status.two.rtt=1250;
Lampa.Storage.set('torrserver_use_link','two');
assert.equal(button.find('.alex-ts-switch-number').text(),'2','native server selection updates');
assert.equal(button.find('.alex-ts-switch-ping-value').text(),'1.25','large RTT compacted');
assert.equal(button.find('.alex-ts-switch-ping-unit').text(),'s');
Lampa.Storage.set('alex_tss_compact_ping',false);
assert.equal(button.find('.alex-ts-switch-ping-value').text(),'1250','compact RTT can be disabled');
assert.equal(button.find('.alex-ts-switch-ping-unit').text(),'ms');
Lampa.Storage.set('alex_tss_compact_ping',true);
Lampa.Storage.set('torrserver_use_link','one');

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
timeOffset=360000; // Previous manual switch cooldown has expired.
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
const statusBefore=plugin.status.one;
Lampa.Storage.set('alex_tss_auto_badge',false);
assert.equal(plugin.status.one,statusBefore,'appearance change must not reset probe status');
Lampa.Storage.set('alex_tss_auto_badge',true);
Lampa.Storage.set('alex_tss_display','ping');
assert.equal(button.attr('data-phase'),'ping');
Lampa.Storage.set('alex_tss_display','alternate');
assert.equal(button.attr('data-phase'),'server');
plugin.destroy();
assert.equal(sections.alexgood321_torrserver_switch_settings,undefined);
console.log('TorrServer Switch Pro 2.1.2: smoke, CSS layout and presentation checks passed');