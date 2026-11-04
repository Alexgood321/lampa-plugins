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
        window: {appready},
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
    vm.runInNewContext(source, ctx, {filename:'num_series.js'});
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
process.stdout.write('\nNUM Series Pro: ' + total + ' smoke checks passed\n');