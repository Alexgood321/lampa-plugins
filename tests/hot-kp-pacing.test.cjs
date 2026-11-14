'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const budget=require('../scripts/hot-source-budget.cjs');
const hot=require('../scripts/hot-discovery.cjs');
const NOW=new Date('2026-11-14T10:00:00Z');
const day=n=>new Date(NOW.getTime()-n*86400000).toISOString().slice(0,10);

test('cumulative three-hour UTC quota stops several morning manual runs from consuming day budget',()=>{
  const early=budget.pacedRunAllowance(null,new Date('2026-11-14T00:17:00Z'));
  assert.equal(early.slot,0);
  assert.equal(early.cumulative_cap,26);
  assert.equal(early.allowed,26);
  const after=budget.pacedRunAllowance({date:'2026-11-14',used:26},
    new Date('2026-11-14T00:50:00Z'));
  assert.equal(after.allowed,0);
  const later=budget.pacedRunAllowance({date:'2026-11-14',used:26},
    new Date('2026-11-14T03:17:00Z'));
  assert.equal(later.cumulative_cap,52);
  assert.equal(later.allowed,26);
  const end=budget.pacedRunAllowance({date:'2026-11-14',used:175},
    new Date('2026-11-14T21:17:00Z'));
  assert.equal(end.allowed,35);
  const reset=budget.pacedRunAllowance({date:'2026-11-14',used:210},
    new Date('2026-11-15T00:17:00Z'));
  assert.equal(reset.allowed,26);
  assert.equal(reset.spent,0);
});

test('KP negative misses back off if old and untrending but refresh early on new demand',()=>{
  assert.equal(budget.negativeCacheKeepDays({
    surs_hot_rank_age:5}),0);
  assert.equal(budget.negativeCacheKeepDays({
    surs_hot_rank_age:60}),1);
  assert.equal(budget.negativeCacheKeepDays({
    surs_hot_rank_age:240}),3);
  assert.equal(budget.negativeCacheKeepDays({
    surs_hot_rank_age:240,surs_hot_trend_week:3}),0);
});

test('single-run paced ledger cannot exceed slot allowance',()=>{
  const now=new Date('2026-11-14T00:17:00Z');
  const pace=budget.pacedRunAllowance(null,now);
  const gate=budget.dailyBudget(null,now,{daily:budget.KP_DAILY_BUDGET,
    run:pace.allowed});
  let count=0;
  while(gate.charge())count++;
  assert.equal(count,26);
  assert.equal(gate.used,26);
  assert.equal(gate.runUsed,26);
  assert.equal(gate.charge(),false);
});

function fixture({wrongKnown=false}={}){
  const items=Array.from({length:12},(_,i)=>({
    id:4010+i,title:'Verified '+i,release_date:day(20),
    poster_path:'/p',genre_ids:[18],popularity:150-i,
    vote_average:8.3,vote_count:1400
  }));
  const key=n=>'tt'+String(1000000+n);
  const firstId=key(4010),kpId=99001;
  const kpEntries={};
  for(const item of items){
    const imdbId=key(item.id);
    kpEntries[imdbId]={imdbId,checked_at:day(0),kp:null};
  }
  kpEntries[firstId]={imdbId:firstId,checked_at:day(6),
    kp:{value:8.4,votes:4000,via:'kinopoisk_unofficial',kinopoisk_id:kpId},
    imdb:{value:8.5,votes:6500}};
  const calls={direct:0,search:0,collection:0};
  const transport=async(url,headers={})=>{
    const u=new URL(url),p=u.pathname;
    if(url.startsWith('https://kinopoiskapiunofficial.tech/')){
      assert.equal(headers['X-API-KEY'],'kp-fixture');
      if(p.endsWith('/collections')){calls.collection++;throw Error('No popularity refresh expected');}
      if(p.endsWith('/'+kpId)){
        calls.direct++;
        return {imdbId:wrongKnown?'tt99999999':firstId,
          kinopoiskId:kpId,ratingKinopoisk:8.7,
          ratingKinopoiskVoteCount:4400,
          ratingImdb:8.6,ratingImdbVoteCount:6600};
      }
      if(p.endsWith('/99002'))
        return {imdbId:firstId,kinopoiskId:99002,
          ratingKinopoisk:8.8,ratingKinopoiskVoteCount:5000,
          ratingImdb:8.7,ratingImdbVoteCount:7000};
      calls.search++;
      return {items:[{imdbId:u.searchParams.get('imdbId'),kinopoiskId:99002}]};
    }
    if(p.includes('/trending/')||p.includes('/discover/'))
      return {results:p.includes('/movie')?items:[]};
    if(p.includes('/movie/')){
      const id=Number(p.split('/').pop());
      return {id,title:'Verified '+id,release_date:day(20),
        poster_path:'/p',vote_average:8.3,vote_count:1400,
        popularity:150-(id-4010),imdb_id:key(id),
        genres:[{id:18}],production_countries:[{iso_3166_1:'US'}],
        release_dates:{results:[{iso_3166_1:'US',
          release_dates:[{type:3,release_date:day(20)}]}]}};
    }
    return null;
  };
  const kpCache={schema:1,entries:kpEntries,
    popular:{source:'TOP_POPULAR_ALL',fetched_at:NOW.toISOString(),
      entries:[{id:kpId,rank:3}]},
    daily_budget:{date:day(0),used:0},
    rating_history:[{date:day(0),entries:Array.from({length:12},(_,i)=>({
      id:80000+i,votes:300}))}]};
  return {transport,calls,kpCache,firstId};
}

test('expired exact IMDb/KP pair refreshes via ONE verified detail call',async()=>{
  const f=fixture();
  const result=await hot.build({now:NOW,tmdbToken:'tmdb-fixture',
    kinopoiskKey:'kp-fixture',kpCache:f.kpCache,
    transport:f.transport,history:{snapshots:[]},detailLimit:30});
  assert.equal(result.feed.items.length,12);
  assert.equal(f.calls.direct,1);
  assert.equal(f.calls.search,0);
  assert.equal(result.feed.diagnostics.kp_known_id_refresh_calls,1);
  assert.equal(result.feed.diagnostics.kp_known_id_refresh_matches,1);
  assert.equal(result.feed.diagnostics.kp_search_calls,0);
  assert.equal(result.kpCache.entries[f.firstId].kp.value,8.7);
  assert.equal(result.kpCache.entries[f.firstId].imdb.value,8.6);
  assert.equal(result.feed.diagnostics.kp_preview_ratings_from_cache||0,0);
});

test('mismatched known KP detail is rejected; fallback search verifies new ID',async()=>{
  const f=fixture({wrongKnown:true});
  const result=await hot.build({now:NOW,tmdbToken:'tmdb-fixture',
    kinopoiskKey:'kp-fixture',kpCache:f.kpCache,
    transport:f.transport,history:{snapshots:[]},detailLimit:30});
  assert.equal(f.calls.direct,1);
  assert.equal(f.calls.search,1);
  assert.equal(result.feed.diagnostics.kp_known_id_mismatch,1);
  assert.equal(result.kpCache.entries[f.firstId].kp.kinopoisk_id,99002);
  assert.equal(result.feed.diagnostics.kp_known_id_refresh_matches||0,0);
});

test('pre-ranked current KP cache is used before deciding whom to enrich',async()=>{
  const f=fixture();
  const validId='tt'+String(1000000+4011);
  f.kpCache.entries[validId]={
    imdbId:validId,checked_at:day(0),
    kp:{value:8.5,votes:4400,via:'kinopoisk_unofficial',kinopoisk_id:99007},
    imdb:{value:8.4,votes:8800}
  };
  f.kpCache.popular.entries.push({id:99007,rank:1});
  const result=await hot.build({now:NOW,tmdbToken:'tmdb-fixture',
    kinopoiskKey:'kp-fixture',kpCache:f.kpCache,
    transport:f.transport,history:{snapshots:[]},detailLimit:30});
  assert.ok(result.feed.diagnostics.kp_preview_ranked_from_cache>=1);
  assert.ok(result.feed.diagnostics.kp_preview_ratings_from_cache>=1);
  const card=result.feed.items.find(x=>x.id===4011);
  assert.equal(card.surs_hot_kinopoisk_popularity_rank,1);
  assert.equal(card.surs_hot_ratings.kp.kinopoisk_id,99007);
});
