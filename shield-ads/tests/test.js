'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../lampa-shield-ads.js'), 'utf8');

function environment(withBlob) {
  const calls = { nativeUrls: [], objects: [], revoked: [], settings: [], logs: [] };
  const storage = { data: {}, get(k, d) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : d; }, set(k, v) { this.data[k] = v; } };
  const hooks = {};
  const app = {};
  const timers = [];
  const listener = {
    follow(name, cb) { (hooks[name] || (hooks[name] = [])).push(cb); },
    send(name, event) { (hooks[name] || []).slice().forEach(cb => cb(event)); return this; }
  };
  class XHR {
    constructor() { this.events = {}; this.readyState = 0; this.status = 0; this.responseText = ''; }
    addEventListener(n, cb) { (this.events[n] || (this.events[n] = [])).push(cb); }
    dispatchEvent(event) { (this.events[event.type] || []).forEach(fn => fn.call(this, event)); const cb = this['on' + event.type]; if (typeof cb === 'function') cb.call(this, event); }
    open(method, url) { this.method = method; this.url = url; this.readyState = 1; }
    send() { calls.nativeUrls.push(this.url); this.status = 200; this.readyState = 4; this.responseText = this.url.indexOf('blob:') === 0 ? '{"ad":[]}' : 'OK'; this.dispatchEvent({type: 'load'}); this.dispatchEvent({type: 'loadend'}); }
  }
  const context = {
    console: {log: (...args) => calls.logs.push(args)},
    XMLHttpRequest: XHR,
    URL: withBlob ? {
      createObjectURL: () => { const u = 'blob:ads-' + (calls.objects.length + 1); calls.objects.push(u); return u; },
      revokeObjectURL: (u) => calls.revoked.push(u)
    } : {},
    Blob: withBlob ? class Blob { constructor(parts) { this.parts = parts; } } : undefined,
    Lampa: {
      Storage: storage,
      SettingsApi: {addComponent: c=>calls.settings.push(c), addParam: c=>calls.settings.push(c)},
      Player: {listener},
      Listener: {follow: (name, cb) => { (app[name] || (app[name] = [])).push(cb); }}
    },
    appready: true,
    addEventListener() {},
    setTimeout: cb => { timers.push(cb); return timers.length; },
    clearTimeout: id => { timers[id - 1] = null; },
    document: {createEvent: () => ({ initEvent(type) { this.type = type; } })}
  };
  context.window = context;
  vm.runInNewContext(source, context, {filename:'lampa-shield-ads.js'});
  const make = (method, url) => { const x = new context.XMLHttpRequest(); let seen = 0; x.onload = () => { seen++; }; x.open(method, url, true); x.send(); return {xhr:x, seen}; };
  return {
    context, calls, hooks, storage, make,
    flush: () => { while (timers.length) { const next = timers.shift(); if (next) next(); } }
  };
}

function run() {
  const e = environment(true);
  assert.strictEqual(e.calls.settings.length, 3, 'settings register');
  assert.strictEqual(typeof e.context.Lampa.Player.listener.send, 'function', 'player send exists');
  let ad = e.make('GET', 'https://cub.red/api/ad/get/preroll');
  assert.strictEqual(ad.seen, 1, 'ad load callback fired');
  assert.strictEqual(ad.xhr.responseText, '{"ad":[]}', 'empty ad inventory returned');
  assert.deepStrictEqual(e.calls.nativeUrls, ['blob:ads-1'], 'no remote ad request');
  assert.deepStrictEqual(e.calls.revoked, ['blob:ads-1'], 'blob cleaned up');
  e.make('GET', 'https://cub.red/api/ad/get/banner?desktop=1');
  assert.strictEqual(e.calls.nativeUrls[1], 'blob:ads-2', 'banner filtered');
  e.make('POST', 'https://cub.red/api/ad/get/preroll');
  assert.strictEqual(e.calls.nativeUrls[2], 'https://cub.red/api/ad/get/preroll', 'POST unchanged');
  e.make('GET', 'https://cub.red/api/account/sync');
  assert.strictEqual(e.calls.nativeUrls[3], 'https://cub.red/api/account/sync', 'CUB sync untouched');
  e.make('GET', 'https://example.org/play.m3u8');
  assert.strictEqual(e.calls.nativeUrls[4], 'https://example.org/play.m3u8', 'stream untouched');
  e.make('GET', 'https://example.org/lookup?next=/api/ad/get/preroll');
  assert.strictEqual(e.calls.nativeUrls[5], 'https://example.org/lookup?next=/api/ad/get/preroll', 'no false positive in query');
  let playerData = {url: 'https://example.org/movie.mp4', vast_url: 'https://ads.example/123', playlist: [{url:'x'}]};
  e.context.Lampa.Player.listener.send('create', {data:playerData,abort(){}});
  assert.strictEqual(playerData.iptv, true, 'preroll bypass marker set');
  e.context.Lampa.Player.listener.send('start', playerData);
  assert.strictEqual('iptv' in playerData, false, 'preroll bypass marker restored before player start');
  assert.strictEqual('vast_url' in playerData, false, 'player VAST removed');
  assert.strictEqual(playerData.url, 'https://example.org/movie.mp4', 'player URL intact');
  assert.strictEqual(playerData.playlist[0].url, 'x', 'playlist untouched');
  assert.strictEqual(e.context.lampa_shield_ads_stats.adRequests, 2, 'ad request counter');
  assert.strictEqual(e.context.lampa_shield_ads_stats.playerVast, 1, 'VAST counter');
  assert.strictEqual(e.context.lampa_shield_ads_stats.prerollBypasses, 1, 'preroll bypass counter');
  const external = {url:'https://example.org/video'};
  e.context.Lampa.Player.listener.send('create', {data:external,abort(){}});
  assert.strictEqual(external.iptv, true, 'external player marked');
  e.context.Lampa.Player.listener.send('external', external);
  assert.strictEqual('iptv' in external, false, 'external player marker restored');
  const aborted = {url:'https://example.org/other'};
  e.context.Lampa.Player.listener.follow('create', function (event) { if (event.data === aborted) event.abort(); });
  e.context.Lampa.Player.listener.send('create', {data:aborted,abort(){}});
  assert.strictEqual('iptv' in aborted, false, 'aborted play unchanged');
  const destroyed = {url:'https://example.org/stream', iptv:false};
  e.context.Lampa.Player.listener.send('create', {data:destroyed,abort(){}});
  e.context.Lampa.Player.listener.send('destroy', {});
  assert.strictEqual(destroyed.iptv, false, 'destroy restores original false marker');
  e.storage.set('lampa_shield_ads_enabled', false);
  e.make('GET', 'https://cub.red/api/ad/get/preroll');
  assert.strictEqual(e.calls.nativeUrls[6], 'https://cub.red/api/ad/get/preroll', 'disabled passes ads');
  const dataOff = { vast_url: 'https://ads.example/' };
  e.context.Lampa.Player.listener.send('create', {data:dataOff,abort(){}});
  assert.strictEqual(dataOff.vast_url, 'https://ads.example/', 'disabled preserves VAST');
  vm.runInNewContext(source, e.context);
  assert.strictEqual(e.calls.settings.length, 3, 'idempotent script load');
  const fallback = environment(false);
  const f = fallback.make('GET', 'https://cub.red/api/ad/get/preroll');
  assert.strictEqual(f.seen, 0, 'fallback responds asynchronously');
  fallback.flush();
  assert.strictEqual(f.seen, 1, 'fallback event fired');
  assert.strictEqual(f.xhr.responseText, '{"ad":[]}', 'fallback response');
  assert.strictEqual(fallback.calls.nativeUrls.length, 0, 'fallback never sends remote request');
  assert.strictEqual(fallback.context.lampa_shield_ads_stats.fallbackResponses, 1, 'fallback counter');
  console.log('PASS: preroll bypass before overlay; normal/external/destroy/abort; ad XHR; CUB sync; fallback; toggle');
}
run();
