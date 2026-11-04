'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'num_series.js'), 'utf8');
new vm.Script(source, {filename: 'num_series.js'});
let total = 0;

function test(name, fn) {
    fn();
    process.stdout.write('✓ ' + name + '\n');
    total++;
}
function listener() {
    const map = new Map();
    return {
        follow(k, f) { map.set(k, (map.get(k) || []).concat([f])); },
        remove(k, f) { map.set(k, (map.get(k) || []).filter(x => x !== f)); },
        send(k, e) { (map.get(k) || []).slice().forEach(f => f(e)); },
        count(k) { return (map.get(k) || []).length; }
    };
}
function element() {
    const attrs = {};
    const value = {
        length: 1,
        attr(k,v) { if(arguments.length === 1) return attrs[k]; attrs[k] = String(v); return value; },
        find() { return element(); },
        text(t) { return t === undefined ? 'Test.S01E01.WEB-DL.1080p.mkv' : value; },
        html() { return ''; },
        append() { return value; },
        remove() { return value; },
        toggleClass() { return value; },
        css() { return value; },
        clone() { return value; },
        on() { return value; },
        trigger() { return value; },
        hasClass(s) { return s === 'torrent-files'; },
        prepend() { return value; },
        after() { return value; },
        toggle() { return value; }
    };
    return value;
}
function boot({mac = false, appready = true} = {}) {
    const stream = listener();
    const modal = listener();
    const timeline = listener();
    const storage = new Map();
    const settings = [];
    const components = [];
    const logs = [];
    const ctx = {
        window: {appready, location: {}},
        document: {createElement: () => ({style: {}}), head: {appendChild() {}}},
        navigator: {},
        $: () => element(),
        Lampa: {
            Listener: stream,
            Modal: {listener: modal, scroll: () => ({render: () => element()})},
            Timeline: {listener: timeline, update() {}, view: () => ({percent: 0, time: 0, updated: 0})},
            SettingsApi: {addComponent: c => components.push(c), addParam: p => settings.push(p)},
            Storage: {
                get: (k, defaultValue) => storage.has(k) ? storage.get(k) : defaultValue,
                set: (k,v) => storage.set(k,v),
                field: () => true
            },
            Controller: {enabled: () => ({name: 'modal'}), collectionSet() {}, toggle() {}},
            Lang: {add() {}, translate: s => s},
            Platform: {macOS: () => mac},
            Select: {show() {}},
            Noty: {show() {}},
            Torserver: {url: () => 'http://127.0.0.1:8090'}
        },
        console: {log: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' '))},
        setTimeout: fn => { fn(); return 1; },
        clearTimeout() {}
    };
    const runtime = source.replace("                console.log(PLUGIN_NAME + ' v' + VERSION + ' initialized.');", "window.__num2Qa = {groups, resumeCandidate, setWatched, undoBulk}; console.log(PLUGIN_NAME + ' v' + VERSION + ' initialized.');");
    if (runtime === source) throw new Error('QA injection anchor missing');
    vm.runInNewContext(runtime, ctx, {filename:'num_series.js'});
    return {...ctx, stream, modal, timeline, storage, settings, components, logs};
}

test('syntax and version', () => assert.match(source, /var VERSION = '2\.0\.0'/));
test('rollback version archived', () => {
    const old = fs.readFileSync(path.join(__dirname, '..', 'num_series_v1_3_0.js'), 'utf8');
    assert.match(old, /var VERSION = '1\.3\.0'/);
});
test('boot and native subscriptions', () => {
    const p = boot();
    assert.equal(p.stream.count('torrent_file'), 1);
    assert.equal(p.modal.count('update'), 1);
    assert.equal(p.timeline.count('update'), 1);
    assert.equal(p.timeline.count('read'), 1);
    assert.equal(p.settings.length, 7);
    assert.ok(p.logs.some(s => s.includes('v2.0.0')));
});
test('native episode metadata wins over filename fallback', () => {
    const p = boot();
    p.stream.send('torrent_file', {type:'list_open',items:[]});
    const raw = {season:4,episode:5,path:'Test.S02E07.mkv',timeline:{hash:42,percent:23}};
    const row = element();
    p.stream.send('torrent_file', {type:'render',element:raw,item:row});
    assert.equal(raw.__num_season, 4);
    assert.equal(raw.__num_episode, 5);
    assert.equal(row.attr('data-num-percent'), '23');
});
test('fallback recognizes a standard S02E07 name', () => {
    const p = boot();
    p.stream.send('torrent_file', {type:'list_open',items:[]});
    const raw = {season:0,episode:0,path:'Show.S02E07.1080p.mkv',timeline:{hash:45,percent:0}};
    p.stream.send('torrent_file', {type:'render',element:raw,item:element()});
    assert.equal(raw.__num_season, 2);
    assert.equal(raw.__num_episode, 7);
});
test('IINA action is Mac-only', () => {
    const p = boot({mac:false});
    const menu = [];
    p.stream.send('torrent_file',{type:'onlong',items:[{},{}],element:{torrent_hash:'hash'},menu});
    assert.equal(menu.length, 0);
    const m = boot({mac:true}), macMenu=[];
    m.stream.send('torrent_file',{type:'onlong',items:[{},{}],element:{torrent_hash:'hash'},menu:macMenu});
    assert.equal(macMenu.length, 1);
    macMenu[0].onSelect();
    assert.match(m.window.location.href, /^iina:\/\/weblink\?url=/);
});
test('settings persist under isolated keys', () => {
    const p = boot();
    const toggle = p.settings.find(s=>s.param.name==='num2_resume');
    toggle.onChange(false);
    assert.equal(p.storage.get('num2_resume'), false);
});
test('destroy removes subscriptions', () => {
    const p = boot();
    p.window.plugin_num_series_destroy();
    assert.equal(p.stream.count('torrent_file'), 0);
    assert.equal(p.modal.count('update'), 0);
    assert.equal(p.timeline.count('update'), 0);
});
test('no global MutationObserver or legacy Select listener', () => {
    assert.doesNotMatch(source, /new MutationObserver\(/);
    assert.doesNotMatch(source, /Lampa\.Select\.listener\.follow/);
});

test('alternative files of one episode count only once', () => {
    const p = boot();
    p.stream.send('torrent_file', {type:'list_open',items:[]});
    const a={season:1,episode:3,path:'Show.S01E03.mkv',timeline:{hash:'a',percent:30,updated:100}};
    const b={season:1,episode:3,path:'Show.S01E03.ALT.mkv',timeline:{hash:'b',percent:70,updated:150}};
    const c={season:1,episode:4,path:'Show.S01E04.mkv',timeline:{hash:'c',percent:0,updated:0}};
    [a,b,c].forEach(x=>p.stream.send('torrent_file',{type:'render',element:x,item:element()}));
    const groups=p.window.__num2Qa.groups();
    assert.equal(groups.length,2);
    assert.equal(groups[0].percent,70);
    assert.equal(groups[0].alternatives.length,2);
});
test('resume uses latest incomplete episode, then next episode', () => {
    const p=boot();
    const choose=p.window.__num2Qa.resumeCandidate;
    const rows=[
        {season:1,episode:1,percent:55,updated:50},
        {season:1,episode:2,percent:25,updated:300},
        {season:1,episode:3,percent:0,updated:0}
    ];
    assert.equal(choose(rows).episode,2);
    assert.equal(choose([
        {season:1,episode:1,percent:100,updated:10},
        {season:1,episode:2,percent:100,updated:20},
        {season:1,episode:3,percent:0,updated:0}
    ]).episode,3);
});
test('bulk operations target only chosen season and can undo', () => {
    const p=boot();
    p.stream.send('torrent_file',{type:'list_open',items:[]});
    const a={season:1,episode:1,path:'S01E01.mkv',torrent_hash:'T',id:1,timeline:{hash:'one',percent:30,time:18,duration:60}};
    const b={season:1,episode:2,path:'S01E02.mkv',torrent_hash:'T',id:2,timeline:{hash:'two',percent:0,time:0,duration:90}};
    const c={season:2,episode:1,path:'S02E01.mkv',torrent_hash:'T',id:3,timeline:{hash:'three',percent:45,time:27,duration:60}};
    [a,b,c].forEach(x=>p.stream.send('torrent_file',{type:'render',element:x,item:element()}));
    p.window.__num2Qa.setWatched('1',true);
    assert.equal(a.timeline.percent,100);
    assert.equal(b.timeline.percent,100);
    assert.equal(c.timeline.percent,45);
    p.window.__num2Qa.undoBulk();
    assert.equal(a.timeline.percent,30);
    assert.equal(a.timeline.time,18);
    assert.equal(b.timeline.percent,0);
    assert.equal(c.timeline.percent,45);
});
test('timeline updates refresh current row state', () => {
    const p=boot();
    p.stream.send('torrent_file',{type:'list_open',items:[]});
    const a={season:1,episode:1,path:'S01E01.mkv',timeline:{hash:'hash',percent:0,time:0,duration:100}};
    p.stream.send('torrent_file',{type:'render',element:a,item:element()});
    p.timeline.send('update',{data:{hash:'hash',road:{percent:46,time:46,duration:100,updated:333}}});
    assert.equal(a.timeline.percent,46);
    assert.equal(a.timeline.updated,333);
});

process.stdout.write('\nNUM Series Pro: ' + total + ' smoke checks passed\n');