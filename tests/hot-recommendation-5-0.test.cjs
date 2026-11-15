'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const hot=require('../scripts/hot-discovery.cjs');
const r5=require('../scripts/hot-recommendation-5-0.cjs');
const NOW=new Date('2026-11-15T12:00:00Z');
const day=n=>new Date(NOW.getTime()-n*86400000).toISOString().slice(0,10);
const common={
  poster_path:'/x.jpg',genre_ids:[18],vote_average:7.5,vote_count:51,
  popularity:38,surs_hot_premiere_date:day(23),
  surs_hot_original_date:day(23),
  surs_hot_first_us_release_date:day(23),
  surs_hot_digital_status:'digital_date_unconfirmed',
  surs_hot_kinopoisk_popularity_rank:6,
  surs_hot_ratings:{
    imdb:{value:7.4,votes:7175},
    kp:{value:7.7,votes:5400,kinopoisk_id:11095481}
  }
};
const film=(id,extra={})=>({...common,type:'movie',id,...extra});
const newSeason=(id,extra={})=>({
  type:'tv',id,poster_path:'/x.jpg',genre_ids:[18],vote_average:8.3,
  vote_count:1500,popularity:170,surs_hot_premiere_date:day(38),
  surs_hot_original_date:day(900),surs_hot_premiere_kind:'season',
  surs_hot_season_verified:true,
  surs_hot_last_regular_episode_date:day(2),
  surs_hot_regular_episode_last14d:true,
  surs_hot_season_rating:{value:8.1,votes:75,episodes_rated:5,episodes_released:5},
  surs_hot_ratings:{imdb:{value:8.2,votes:92000},
    kp:{value:8.3,votes:22000}},
  ...extra
});

test('independently verified IMDb+KP ratings rescue a fresh KP hot movie with few TMDB votes',()=>{
  const item=film(1400);
  const selected=hot.scoreCandidates([item],{snapshots:[]},NOW,null,'demand',true);
  assert.equal(selected.length,1);
  const x=selected[0];
  assert.equal(x.id,1400);
  assert.equal(x.surs_hot_external_rating_exception,true);
  assert.equal(x.surs_hot_interest_evidence.current_interest_observed,true);
  assert.ok(x.surs_hot_independent_demand_floor>.55);
  assert.ok(x.surs_hot_attention>.55);
  assert.ok(x.surs_hot_confidence>.7);
  assert.equal(x.surs_hot_availability,'theatrical_digital_unconfirmed');
});

test('KP rank alone without independently supported ratings never bypasses vote gate',()=>{
  const withoutVotes=film(1401,{surs_hot_ratings:{
    imdb:{value:7.4,votes:7},kp:{value:7.7,votes:40}
  }});
  assert.equal(hot.scoreCandidates([withoutVotes],{snapshots:[]},NOW,
    null,'demand',true).length,0);
  assert.equal(r5.demandFloor(withoutVotes),0);
});

test('independent KP signal is not fabricated for a title outside Top-30',()=>{
  const item=film(1402,{surs_hot_kinopoisk_popularity_rank:81});
  assert.equal(r5.demandFloor(item),0);
  assert.equal(hot.scoreCandidates([item],{snapshots:[]},NOW,
    null,'demand',true).length,0);
});

test('newly aired episode without observed audience interest is not a hot title 31-60 days old',()=>{
  const item=newSeason(1403);
  const old=hot.scoreCandidates([item],{snapshots:[]},NOW,null,'demand',false);
  assert.equal(old.length,1);
  assert.equal(old[0].surs_hot_active_season_secondary,true);
  const current=hot.scoreCandidates([item],{snapshots:[]},NOW,
    null,'demand',true);
  assert.equal(current.length,0);
});

test('new season 31-60 days old with verified current demand stays eligible',()=>{
  const item=newSeason(1404,{surs_hot_trend_week:15});
  const current=hot.scoreCandidates([item],{snapshots:[]},NOW,
    null,'demand',true);
  assert.equal(current.length,1);
  assert.equal(current[0].surs_hot_interest_evidence.current_interest_observed,true);
});

test('digital status is factual and theatrical penalty is separate from score',()=>{
  const cinema=film(1405),digital=film(1406,{
    surs_hot_digital_status:'verified_us_digital_date',
    surs_hot_premiere_kind:'digital'});
  assert.equal(r5.availability(cinema),'theatrical_digital_unconfirmed');
  assert.equal(r5.availability(digital),'us_digital_release_verified');
  const ranked=hot.curatedSelection(
    [cinema,digital].map((c,i)=>({...c,
      surs_hot_model_scores:{demand:50+i,baseline:50+i},
      surs_hot_base_score:50+i,surs_hot_interest_evidence:{
        current_interest_observed:true
      }})),null,'demand',0);
  const cinemaRanked=ranked.find(x=>x.id===1405);
  assert.equal(cinemaRanked.surs_hot_editorial_distribution_penalty,3);
  assert.equal(cinemaRanked.surs_hot_score,50);
  assert.equal(cinemaRanked.surs_hot_editorial_penalty,3);
  assert.equal(ranked[0].id,1406);
});

test('confidence uses multiple real vote communities instead of treating TMDB as the only measure',()=>{
  const withExternal=film(1407);
  const tmdbOnly=film(1408,{surs_hot_ratings:{}});
  assert.ok(r5.confidence(withExternal)>r5.confidence(tmdbOnly));
  assert.ok(r5.confidence(withExternal)<1);
});

test('missing KP rank or IMDb votes are unknown, not a confirmed external signal',()=>{
  assert.equal(r5.externalRatingsPass(film(1409,{
    surs_hot_kinopoisk_popularity_rank:null
  })),false);
  assert.equal(r5.externalRatingsPass(film(1410,{
    surs_hot_ratings:{kp:{value:8,votes:5000},imdb:null}
  })),false);
});

test('old verified theatrical movies are not admitted solely on popular ratings',()=>{
  const item=film(1411,{
    surs_hot_premiere_date:day(110),
    surs_hot_original_date:day(110),
    surs_hot_first_us_release_date:day(110)
  });
  assert.equal(hot.scoreCandidates([item],{snapshots:[]},NOW,
    null,'demand',true).length,0);
});

test('ranking diagnostics disclose rescued titles and unverified theatrical availability',()=>{
 const x=film(1412,{
   surs_hot_external_rating_exception:true,
   surs_hot_interest_evidence:{current_interest_observed:true}});
 const diag=r5.diagnostics([x],[x]);
 assert.equal(diag.external_ratings_recovered,1);
 assert.equal(diag.theatrical_without_verified_digital,1);
 assert.equal(diag.interest_unobserved,0);
});

test('a fresh under-voted series with BOTH trending horizons keeps its place as provisional',()=>{
 const fresh={id:1421,type:'tv',poster_path:'/p.jpg',genre_ids:[18],
   vote_average:7.7,vote_count:55,popularity:260,
   surs_hot_premiere_date:day(16),surs_hot_original_date:day(16),
   surs_hot_premiere_kind:'series',
   surs_hot_trend_day:25,surs_hot_trend_week:28};
 const selected=hot.scoreCandidates([fresh],{snapshots:[]},NOW,
   null,'demand',true);
 assert.equal(selected.length,1);
 assert.equal(selected[0].surs_hot_fresh_provisional,true);
 const justOne={...fresh,id:1422,surs_hot_trend_week:null};
 assert.equal(hot.scoreCandidates([justOne],{snapshots:[]},NOW,
   null,'demand',true).length,0);
});
