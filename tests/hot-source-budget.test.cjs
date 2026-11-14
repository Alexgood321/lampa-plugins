'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const budget=require('../scripts/hot-source-budget.cjs');
const hot=require('../scripts/hot-discovery.cjs');
const NOW=new Date('2026-11-14T10:00:00Z');
const day=n=>new Date(NOW.getTime()-n*86400000).toISOString().slice(0,10);

test('KP UTC per-day ledger prevents exceeding the daily cap across runs',()=>{
  const a=budget.dailyBudget(null,NOW,{daily:4,run:3});
  assert.equal(a.can(3),true);
  assert.equal(a.charge(),true);
  assert.equal(a.charge(),true);
  assert.equal(a.charge(),true);
  assert.equal(a.charge(),false);
  assert.equal(a.snapshot().used,3);
  const b=budget.dailyBudget(a.snapshot(),NOW,{daily:4,run:3});
  assert.equal(b.carried,3);
  assert.equal(b.charge(),true);
  assert.equal(b.charge(),false);
  assert.equal(b.snapshot().used,4);
  const c=budget.dailyBudget(b.snapshot(),new Date(NOW.getTime()+86400000),
    {daily:4,run:3});
  assert.equal(c.used,0);
  assert.equal(c.charge(),true);
});

test('KP explicit reservation preserves capacity for top and vote samples',()=>{
  const b=budget.dailyBudget(null,NOW,{daily:20,run:12});
  assert.equal(b.can(2,10),true);
  b.charge();b.charge();
  assert.equal(b.can(2,10),false);
  assert.equal(b.can(2,2),true);
});

test('KP budget sanitizes malformed ledger, never accepting negative counts',()=>{
  assert.equal(budget.dailyBudget({date:day(0),used:-20},NOW,
    {daily:10,run:4}).used,0);
  assert.equal(budget.dailyBudget({date:day(0),used:1000},NOW,
    {daily:10,run:4}).charge(),false);
  assert.equal(budget.dailyBudget({date:day(1),used:7},NOW,
    {daily:10,run:4}).used,0);
});

test('TMDB memo only serves verified unexpired entries',()=>{
  const memo=budget.memo(null);
  const data={id:22,vote_count:50};
  assert.equal(budget.cached(memo,'detail:movie:22',NOW,9),null);
  budget.save(memo,'detail:movie:22',data,NOW);
  assert.deepEqual(budget.cached(memo,'detail:movie:22',NOW,9),data);
  assert.equal(budget.cached(memo,'detail:movie:22',
    new Date(NOW.getTime()+10*3600000),9),null);
  assert.equal(budget.cached(memo,'detail:movie:22',
    new Date(NOW.getTime()-3600000),9),null);
});

test('TMDB normalized movie cache omits unrelated data and keeps US dates',()=>{
  const norm=budget.normalizeDetail({
    id:31,title:'Test',release_date:day(4),poster_path:'/p',
    vote_count:300,vote_average:8.1,popularity:30,
    production_countries:[{iso_3166_1:'US'}],
    release_dates:{results:[
      {iso_3166_1:'US',release_dates:[{type:4,release_date:day(3),note:'secret'}]},
      {iso_3166_1:'GB',release_dates:[{type:4,release_date:day(2)}]}]},
    genres:[{id:18,name:'Drama'}],secret:'not-in-cache'
  },'movie');
  assert.equal(norm.id,31);
  assert.equal(norm.release_dates.results.length,1);
  assert.equal(norm.release_dates.results[0].release_dates[0].note,undefined);
  assert.equal(norm.secret,undefined);
  assert.deepEqual(norm.production_countries,[{iso_3166_1:'US'}]);
});

test('TMDB season cache retains actual episode release and vote evidence',()=>{
  const norm=budget.normalizeSeason({season_number:2,
    episodes:[{episode_number:1,air_date:day(8),vote_count:30,
      vote_average:8.4,private:'none'}]});
  assert.equal(norm.season_number,2);
  assert.equal(norm.episodes[0].vote_count,30);
  assert.equal(norm.episodes[0].private,undefined);
});

test('TMDB prune removes expired data, retains recent evidence',()=>{
  const memo=budget.memo({});
  budget.save(memo,'detail:movie:1',{id:1},
    new Date(NOW.getTime()-40*3600000));
  budget.save(memo,'detail:movie:2',{id:2},
    new Date(NOW.getTime()-3*3600000));
  const clean=budget.prune(memo,NOW);
  assert.equal(Object.keys(clean.entries).length,1);
  assert.ok(clean.entries['detail:movie:2']);
});

test('two same-day real builder passes reuse TMDB details, not Trending',async()=>{
  const input=Array.from({length:12},(_,i)=>({
    id:2000+i,type:'movie',title:'Cached '+i,
    release_date:day(15),poster_path:'/p',genre_ids:[18],
    vote_average:8.2,vote_count:1500,popularity:130-i
  }));
  const transport=async url=>{
    const p=new URL(url).pathname;
    if(p.includes('/trending/')||p.includes('/discover/')){
      return {results:p.includes('/movie')?input:[]};
    }
    if(p.includes('/movie/')){
      const id=Number(p.split('/').pop());
      return {id,title:'Cached '+id,release_date:day(15),
        production_countries:[{iso_3166_1:'US'}],
        genres:[{id:18}],poster_path:'/p',
        vote_count:1500,vote_average:8.2,popularity:100,
        release_dates:{results:[{iso_3166_1:'US',
          release_dates:[{type:3,release_date:day(15)}]}]}};
    }
    return null;
  };
  const first=await hot.build({now:NOW,tmdbToken:'test',
    transport,history:{snapshots:[]},detailLimit:24});
  assert.equal(first.feed.items.length,12);
  assert.equal(first.feed.diagnostics.tmdb_detail_cache_hits,0);
  assert.equal(first.feed.diagnostics.tmdb_detail_cache_misses,12);
  const second=await hot.build({now:new Date(NOW.getTime()+3*3600000),
    tmdbToken:'test',transport,history:{snapshots:[]},
    tmdbCache:first.tmdbCache,detailLimit:24});
  assert.equal(second.feed.items.length,12);
  assert.equal(second.feed.diagnostics.tmdb_detail_cache_hits,12);
  assert.equal(second.feed.diagnostics.tmdb_detail_cache_misses,0);
  assert.ok(second.feed.diagnostics.tmdb_calls<
    first.feed.diagnostics.tmdb_calls);
  assert.deepEqual(second.feed.items.map(x=>x.id),
    first.feed.items.map(x=>x.id));
});

test('expired TMDB cache triggers fresh detail retrieval rather than stale reuse',async()=>{
  const item={id:300,type:'movie',title:'Title',release_date:day(10),
    poster_path:'/p',genre_ids:[18],vote_average:8,vote_count:500,popularity:50};
  const transport=async url=>{
    const p=new URL(url).pathname;
    if(p.includes('/trending/')||p.includes('/discover/'))
      return {results:p.includes('/movie')?
        Array.from({length:12},(_,i)=>({...item,id:item.id+i})):[]};
    if(p.includes('/movie/'))return {id:Number(p.split('/').pop()),
      title:'Detail',release_date:day(10),
      poster_path:'/p',genres:[{id:18}],
      vote_average:8,vote_count:500,popularity:50,
      production_countries:[{iso_3166_1:'US'}],release_dates:{results:[]}};
    return null;
  };
  const first=await hot.build({now:NOW,tmdbToken:'test',
    transport,history:{snapshots:[]},detailLimit:24});
  const later=await hot.build({now:new Date(NOW.getTime()+10*3600000),
    tmdbToken:'test',transport,history:{snapshots:[]},
    tmdbCache:first.tmdbCache,detailLimit:24});
  assert.equal(later.feed.diagnostics.tmdb_detail_cache_hits,0);
  assert.equal(later.feed.diagnostics.tmdb_detail_cache_misses,12);
});
