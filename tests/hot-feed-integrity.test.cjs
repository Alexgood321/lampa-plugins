'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const integrity=require('../scripts/hot-feed-integrity.cjs');
const hot=require('../scripts/hot-discovery.cjs');
const NOW=new Date('2026-11-14T18:00:00Z');
const isoDays=n=>new Date(NOW.getTime()-86400000*n).toISOString().slice(0,10);

function pageRows({missing=null,empty=null}={}) {
  const rows=[];
  for(const type of ['movie','tv']) {
    for(const span of ['day','week']) {
      const key=type+':'+span;
      rows.push({job:{type,channel:'trending_'+span,
        url:'trending/'+type+'/'+span+'?page=1'},
        result:missing===key?null:{results:empty===key?[]:
          Array.from({length:12},(_,id)=>({id:id+1}))}});
    }
    for(let i=1;i<=4;i++)rows.push({job:{type,
      channel:'recent_popularity.desc',url:'discover/'+type+'?page='+i},
      result:{results:[{id:i}]}});
  }
  return rows;
}
test('all four TMDB trending first pages and discovery lanes are required for publication',()=>{
  const healthy=integrity.evaluateTmdbPages(pageRows());
  assert.equal(healthy.healthy,true);
  assert.equal(healthy.healthy_lanes,4);
  assert.equal(healthy.discovery_nonempty_pages,8);
  const missing=integrity.evaluateTmdbPages(pageRows({missing:'tv:week'}));
  assert.equal(missing.healthy,false);
  assert.deepEqual(missing.failed_lanes,['tv:week']);
  const empty=integrity.evaluateTmdbPages(pageRows({empty:'movie:day'}));
  assert.deepEqual(empty.failed_lanes,['movie:day']);
  const gate=integrity.publicationGate(null,{items:[]},missing,{strict:true});
  assert.equal(gate.validated,false);
  assert.throws(()=>integrity.assertPublicationGate(gate),
    /source-integrity gate/);
});

test('provider degradation fails closed even when a feed contains valid cards',()=>{
  const previous={sources:{tmdb:true},items:Array.from({length:12},(_,i)=>({
    id:100+i,type:'movie',surs_hot_trend_day:i+1}))};
  const current={items:previous.items.map(x=>({...x,
    surs_hot_trend_day:null,surs_hot_trend_week:null}))};
  const good=integrity.evaluateTmdbPages(pageRows());
  const bad=integrity.evaluateTmdbPages(pageRows({missing:'tv:week'}));
  const drop=integrity.publicationGate(previous,current,good,{strict:true});
  assert.equal(drop.validated,false);
  assert.match(drop.errors.join(';'),/trending vanished/);
  const missing=integrity.publicationGate(previous,current,bad,{strict:true});
  assert.ok(missing.errors.length>=2);
  assert.equal(integrity.publicationGate(previous,current,bad,{strict:false}).validated,
    true);
});

test('genuine rank reshuffles produce warnings not hard failures',()=>{
  const previous={sources:{tmdb:true},items:Array.from({length:20},(_,i)=>({
    id:i+1,type:'movie',surs_hot_trend_day:i+1}))};
  const current={items:[...previous.items.slice(10),...previous.items.slice(0,10)]};
  const gate=integrity.publicationGate(previous,current,
    integrity.evaluateTmdbPages(pageRows()),{strict:true});
  assert.equal(gate.validated,true);
  assert.ok(gate.warnings.includes('top10_high_churn'));
  assert.equal(gate.drift.top10_overlap,0);
  assert.equal(gate.drift.retained,20);
  assert.equal(gate.drift.largest_shared_rank_move,10);
});

test('toCard preserves observed zero popularity and zero votes instead of stale discovery fallback',()=>{
  const raw={id:8001,type:'movie',title:'Example',popularity:250,
    vote_count:1200,vote_average:8.8,_channels:['discover_popularity.desc']};
  const details={id:8001,title:'Example',popularity:0,
    vote_count:0,vote_average:0,poster_path:'/x',
    genres:[{id:18}],release_date:isoDays(10),
    production_countries:[{iso_3166_1:'US'}]};
  const p={date:isoDays(10),kind:'theatrical',original:isoDays(10)};
  const card=hot.toCard(raw,details,'movie',p);
  assert.equal(card.popularity,0);
  assert.equal(card.vote_count,0);
  assert.equal(card.vote_average,0);
  const unknown=hot.toCard(raw,{...details,popularity:undefined,
    vote_count:undefined,vote_average:undefined},'movie',p);
  assert.equal(unknown.popularity,250);
  assert.equal(unknown.vote_count,1200);
  assert.equal(unknown.vote_average,8.8);
});

function stubTransport({brokenTvWeek=false}={}){
  const movies=Array.from({length:13},(_,i)=>({
    id:6000+i,title:'Movie '+i,poster_path:'/p',genre_ids:[18],
    release_date:isoDays(16),popularity:100-i,
    vote_average:8.1,vote_count:800}));
  const series=Array.from({length:13},(_,i)=>({
    id:8000+i,name:'Series '+i,poster_path:'/p',genre_ids:[18],
    first_air_date:isoDays(25),popularity:100-i,
    vote_average:8.1,vote_count:800}));
  return async function transport(url){
    const path=new URL(url).pathname;
    if(path.includes('/trending/')||path.includes('/discover/')){
      if(brokenTvWeek&&path.includes('/trending/tv/week'))return null;
      return {results:path.includes('/movie')?movies:series};
    }
    const id=Number(path.split('/').pop()),movie=path.includes('/movie/');
    if(movie)return {
      ...movies.find(x=>x.id===id),
      genres:[{id:18}],production_countries:[{iso_3166_1:'US'}],
      release_dates:{results:[{iso_3166_1:'US',release_dates:[{
        type:3,release_date:isoDays(16)}]}]}
    };
    if(path.includes('/tv/'))return {
      ...series.find(x=>x.id===id),
      genres:[{id:18}],origin_country:['US'],
      seasons:[{season_number:1,air_date:isoDays(25)}]
    };
    return null;
  };
}
test('strict build publishes complete source lanes but refuses broken TMDB week feed',async()=>{
  const opts={now:NOW,tmdbToken:'test',transport:stubTransport(),
    history:{snapshots:[]},detailLimit:40,
    strictSourceHealth:true};
  const result=await hot.build(opts);
  assert.equal(result.feed.algorithm,'hot-discovery-4.13');
  assert.equal(result.feed.diagnostics.feed_integrity.validated,true);
  assert.equal(result.feed.diagnostics.feed_integrity.source_health.healthy,true);
  assert.ok(result.feed.items.length>=12);
  await assert.rejects(()=>hot.build({...opts,transport:stubTransport({
    brokenTvWeek:true
  })}),/source-integrity gate/);
});
