'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const source=require('../scripts/hot-source-budget.cjs');
const hot=require('../scripts/hot-discovery.cjs');
const NOW=new Date('2026-11-14T10:00:00Z');
const day=n=>new Date(NOW.getTime()-n*86400000).toISOString().slice(0,10);

test('cached popularity may decline: never preserve its previous maximum',()=>{
  const cached={id:42,popularity:280,vote_count:9000,vote_average:8.7,
    poster_path:'/p'};
  const fresh=source.overlayFreshSignals(cached,{
    popularity:14,vote_count:8800,vote_average:7.8});
  assert.equal(fresh.data.popularity,14);
  assert.equal(fresh.data.vote_count,8800);
  assert.equal(fresh.data.vote_average,7.8);
  assert.equal(fresh.current_popularity,true);
  assert.equal(fresh.current_votes,true);
  assert.equal(cached.popularity,280);
});

test('explicit zero popularity and zero votes are current observations',()=>{
  const fresh=source.overlayFreshSignals({
    popularity:99,vote_count:200,vote_average:8.4
  },{popularity:0,vote_count:0,vote_average:0});
  assert.equal(fresh.data.popularity,0);
  assert.equal(fresh.data.vote_count,0);
  assert.equal(fresh.data.vote_average,0);
  assert.equal(fresh.current_popularity,true);
  assert.equal(fresh.current_votes,true);
});

test('missing current popularity is unknown, not falsely attributed to current run',()=>{
  const old={popularity:83,vote_count:1000,vote_average:8.1};
  const fresh=source.overlayFreshSignals(old,{vote_count:1250});
  assert.equal(fresh.data.popularity,83);
  assert.equal(fresh.data.vote_count,1250);
  assert.equal(fresh.current_popularity,false);
  assert.equal(fresh.current_votes,true);
  const invalid=source.overlayFreshSignals(old,{
    popularity:-1,vote_count:'broken',vote_average:14});
  assert.equal(invalid.current_popularity,false);
  assert.equal(invalid.current_votes,false);
  assert.equal(invalid.data.vote_average,8.1);
});

test('no fresh current popularity cannot manufacture positive 3-day growth',()=>{
  const c={id:42,type:'movie',popularity:160,vote_count:2000,
    surs_hot_current_popularity_observed:false};
  const history={snapshots:[{date:day(3),
    items:{'movie:42':{p:20,v:800}}}]};
  const g=hot.growthFor(c,history,NOW);
  assert.equal(g.measured,false);
  assert.equal(g.confirmed,false);
  assert.equal(g.status,'unknown');
  assert.equal(g.signal,0);
  assert.deepEqual(g.periods,{});
});

test('two same-day generator runs update falling Popularity from discovery',async()=>{
  let popularity=200,voteCount=2000;
  const records=Array.from({length:12},(_,i)=>({
    id:3000+i,type:'movie',title:'Truth '+i,genre_ids:[18],
    release_date:day(12),poster_path:'/p',vote_average:8.2,
    vote_count:voteCount,popularity
  }));
  const transport=async url=>{
    const path=new URL(url).pathname;
    if(path.includes('/trending/')||path.includes('/discover/')){
      return {results:path.includes('/movie')?
        records.map(x=>({...x,popularity,vote_count:voteCount})):[]};
    }
    if(path.includes('/movie/')){
      const id=Number(path.split('/').pop());
      return {id,title:'Truth '+id,release_date:day(12),poster_path:'/p',
        vote_average:8.2,vote_count:2000,popularity:200,
        production_countries:[{iso_3166_1:'US'}],
        release_dates:{results:[{iso_3166_1:'US',
          release_dates:[{type:3,release_date:day(12)}]}]},
        genres:[{id:18}]};
    }
    return null;
  };
  const first=await hot.build({now:NOW,tmdbToken:'test',
    transport,history:{snapshots:[]},detailLimit:24});
  assert.equal(first.feed.items.length,12);
  popularity=10;voteCount=1500;
  const second=await hot.build({now:new Date(NOW.getTime()+3*3600000),
    tmdbToken:'test',transport,history:{snapshots:[]},
    tmdbCache:first.tmdbCache,detailLimit:24});
  assert.equal(second.feed.items.length,12);
  assert.ok(second.feed.items.every(x=>x.popularity===10));
  assert.ok(second.feed.items.every(x=>x.vote_count===1500));
  assert.ok(second.feed.items.every(x=>x.surs_hot_current_popularity_observed));
  assert.equal(second.feed.diagnostics.tmdb_detail_cache_hits,12);
  assert.equal(second.feed.diagnostics.tmdb_cached_popularity_unobserved,0);
  assert.equal(second.feed.diagnostics.rating_evidence.selected,12);
  assert.equal(second.feed.diagnostics.rating_evidence.limited,12);
  assert.equal(second.feed.diagnostics.rating_evidence.missing_both,12);
});
