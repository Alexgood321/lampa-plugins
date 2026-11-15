'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {updateCatalog, isNewer} = require('../scripts/surs-store-reconcile.cjs');

const oldSha = 'a'.repeat(40);
const newSha = 'b'.repeat(40);
function makeCatalog() {
  const entries = {
    'SURS Pro': {repo:'Alexgood321/lampa-plugins',path:'surs.js',owned:true,
      sha:oldSha,version:'4.0.9',link:'old-link',published_at:'2026-11-10T00:00:00Z'}
  };
  for (let i = 0; i < 7; i++) {
    entries['Other '+i] = {repo:'Alexgood321/lampa-plugins',path:'other'+i+'.js',owned:true,
      sha:oldSha,version:'1.0.0'};
  }
  return {
    results:[{title:'Мои',results:[{name:'SURS Pro',link:'old-link',version:'4.0.9'}]},
      {title:'Главный экран',results:[{name:'SURS Pro',link:'old-link',version:'4.0.9'}]}],
    meta:{tracked:entries,history:{'SURS Pro':[{sha:oldSha,version:'4.0.9'}]},
      last_checked_at:'2026-11-14T10:00:00Z'}
  };
}
function sources(catalog, replacement) {
  const ret = {};
  for(const name of Object.keys(catalog.meta.tracked))ret[name]={sha:oldSha};
  if (replacement)ret['SURS Pro']={sha:newSha,published_at:'2026-11-15T09:48:54Z'};
  return ret;
}
test('SURS 4.0.10 updates both cards and pin without changing others',()=>{
  const data=makeCatalog(),observed=sources(data,true);
  assert.equal(updateCatalog(data,observed,'4.0.10','2026-11-15T10:00:00Z'),true);
  assert.equal(data.meta.tracked['SURS Pro'].version,'4.0.10');
  assert.equal(data.meta.tracked['SURS Pro'].sha,newSha);
  assert.equal(data.meta.tracked['Other 1'].sha,oldSha);
  assert.equal(data.meta.history['SURS Pro'].at(-1).version,'4.0.10');
  assert.equal(data.meta.last_checked_at,'2026-11-15T10:00:00Z');
  assert.equal(data.results[0].results[0].link,data.results[1].results[0].link);
});
test('heartbeat is a no-op until a verified 45-minute interval',()=>{
  const data=makeCatalog(),observed=sources(data,false);
  data.meta.last_checked_at='2026-11-15T09:50:00Z';
  assert.equal(updateCatalog(data,observed,'4.0.9','2026-11-15T10:00:00Z'),false);
  assert.equal(updateCatalog(data,observed,'4.0.9','2026-11-15T10:50:00Z'),true);
});
test('no false freshness stamp when another first-party pin is behind',()=>{
  const data=makeCatalog(),observed=sources(data,true);
  observed['Other 1']={sha:newSha};
  assert.throws(()=>updateCatalog(data,observed,'4.0.10','2026-11-15T10:00:00Z'),
    /Central catalog is behind/);
  assert.equal(data.meta.last_checked_at,'2026-11-14T10:00:00Z');
});
test('rejects a SURS version rollback or missing first-party pins',()=>{
  const data=makeCatalog(),observed=sources(data,true);
  assert.equal(isNewer('4.0.10','4.0.9'),true);
  assert.equal(isNewer('4.0.8','4.0.9'),false);
  assert.throws(()=>updateCatalog(data,observed,'4.0.9','2026-11-15T10:00:00Z'),
    /non-incremented version/);
  delete observed['Other 6'];
  assert.throws(()=>updateCatalog(data,observed,'4.0.10','2026-11-15T10:00:00Z'),
    /Unverified first-party plugin/);
});
