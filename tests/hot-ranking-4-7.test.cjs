'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../scripts/hot-ranking-4-7.cjs');
const hot=require('../scripts/hot-discovery.cjs');
const NOW=new Date('2026-11-14T09:00:00Z');
const day=n=>new Date(NOW.getTime()-n*86400000).toISOString().slice(0,10);
const base=(id,ageDays=20)=>({id,type:'movie',title:'Test '+id,
  poster_path:'/p',vote_average:8.2,vote_count:1400,popularity:110,
  surs_hot_premiere_date:day(ageDays),surs_hot_original_date:day(ageDays)});

test('US first premiere prevents a 2-day foreign-release boundary penalty',()=>{
  const a={...base(1,120),surs_hot_original_date:day(122),
    surs_hot_first_us_release_date:day(120)};
  assert.equal(model.rankAge(a,NOW).age,120);
  assert.equal(model.rankAge(a,NOW).date,day(120));
  const scoreA=model.smoothFreshness(120),scoreB=model.smoothFreshness(121);
  assert.ok(scoreA>scoreB&&scoreA-scoreB<.005);
});

test('old movie digital listing cannot reset original launch age',()=>{
  const a={...base(1,5),surs_hot_original_date:day(220),
    surs_hot_first_us_release_date:day(5)};
  assert.equal(model.rankAge(a,NOW).age,220);
});

test('freshness has no hard 60/61 or 120/121 cliffs',()=>{
  for(const n of [60,120,180,365]){
    const gap=model.smoothFreshness(n)-model.smoothFreshness(n+1);
    assert.ok(gap>=0&&gap<.01);
  }
  assert.ok(model.smoothFreshness(10)>model.smoothFreshness(200));
});

test('one day, missing or flat histories never earn positive momentum',()=>{
  assert.deepEqual(model.growthState(.8,{'1d':.8}),{
    status:'unknown',confirmed:false,signal:0});
  assert.deepEqual(model.growthState(.5,{'3d':.5}),{
    status:'flat',confirmed:true,signal:0});
  assert.deepEqual(model.growthState(.38,{'7d':.38}),{
    status:'falling',confirmed:true,signal:0});
  assert.ok(model.growthState(.72,{'3d':.72}).signal>0);
});

test('weights retain 45/35/15/5 and fallback 55/40/0/5',()=>{
  assert.deepEqual(model.effectiveWeights(model.WEIGHTS.baseline,false),{
    attention:.55,quality:.40,growth:0,freshness:.05});
  assert.deepEqual(model.effectiveWeights(model.WEIGHTS.baseline,true),
    model.WEIGHTS.baseline);
  for(const m of Object.values(model.WEIGHTS)){
    assert.ok(Math.abs(Object.values(m).reduce((a,b)=>a+b,0)-1)<1e-6);
  }
});

test('new model measures demand, never assigns bonus to flat growth',()=>{
  const weights=model.WEIGHTS.baseline;
  const base={attention:.6,quality:8,growth:0,freshness:.8};
  const flat=model.modelScore(base,weights,true);
  const rising=model.modelScore({...base,growth:.7},weights,true);
  assert.ok(rising>flat);
  assert.equal(flat,model.modelScore({...base,growth:0},weights,true));
});

test('recent low demand can be overtaken by 120-day strong confirmed demand',()=>{
  const recent={...base(11,20),popularity:10,vote_average:7.7};
  const old={...base(12,120),popularity:500,vote_average:8.3,
    surs_hot_trend_day:1,surs_hot_trend_week:2,
    surs_hot_kinopoisk_popularity_rank:2};
  const output=hot.scoreCandidates([recent,old],{snapshots:[]},NOW,null);
  assert.deepEqual(output.map(x=>x.id),[12,11]);
});

test('old release without live demand is withheld but active old release can return',()=>{
  const stale={...base(21,210),popularity:140,vote_average:9};
  const active={...base(22,210),popularity:160,
    surs_hot_trend_day:4,surs_hot_trend_week:8};
  const out=hot.scoreCandidates([stale,active],{snapshots:[]},NOW,null);
  assert.deepEqual(out.map(x=>x.id),[22]);
  assert.equal(hot.eligibilityReason(stale,NOW),'old_no_current_interest');
});

test('365+ day release needs strong new breakout evidence',()=>{
  const stale={...base(31,390),popularity:200};
  const tmdbOnly={...base(32,390),popularity:200,surs_hot_trend_day:2};
  const both={...base(33,390),popularity:200,
    surs_hot_trend_day:2,surs_hot_kinopoisk_popularity_rank:3};
  const out=hot.scoreCandidates([stale,tmdbOnly,both],
    {snapshots:[]},NOW,null);
  assert.deepEqual(out.map(x=>x.id),[33]);
});

test('ranking score is not overwritten by editorial placement',()=>{
  const movies=Array.from({length:15},(_,i)=>({
    ...base(500+i,30),popularity:120-i*2,
    surs_hot_trend_day:i+1,surs_hot_trend_week:i+1}));
  const shows=Array.from({length:15},(_,i)=>({
    ...base(600+i,30),type:'tv',
    surs_hot_premiere_kind:'season',surs_hot_season_verified:true,
    surs_hot_season_rating:{value:9,votes:200},
    surs_hot_trend_day:1,surs_hot_trend_week:1,popularity:500}));
  const out=hot.scoreCandidates([...movies,...shows],
    {snapshots:[]},NOW,null);
  assert.ok(out.length>=20);
  for(const item of out){
    assert.equal(item.surs_hot_score,
      Math.round(item.surs_hot_base_score*100)/100);
    assert.ok(item.surs_hot_editorial_penalty>=0);
  }
  assert.deepEqual(out.map(x=>x.surs_hot_rank),
    out.map((_,i)=>i+1));
});

test('three models compare on the same eligible candidate set',()=>{
  const list=Array.from({length:20},(_,i)=>({
    ...base(700+i,15+i*8),popularity:500-i*10,
    surs_hot_trend_day:i<6?i+1:null,
    surs_hot_trend_week:i<9?i+2:null}));
  const baseline=hot.scoreCandidates(list,{snapshots:[]},NOW,null);
  const variants={
    baseline,
    demand:hot.curatedSelection(list.filter(x=>!hot.eligibilityReason(x,NOW)),null,'demand'),
    fresh:hot.curatedSelection(list.filter(x=>!hot.eligibilityReason(x,NOW)),null,'fresh')
  };
  const comparison=model.compareModels(list,variants);
  assert.equal(comparison.models.baseline.top10.length,10);
  assert.ok(comparison.models.demand.top10_overlap_baseline>=0);
  assert.ok(comparison.models.fresh.top10_mean_age>=0);
  assert.equal(comparison.candidate_count,list.length);
});

test('sufficient and insufficient digital date evidence remain distinct',()=>{
  const p={...base(998,7),surs_hot_digital_status:'digital_date_unconfirmed'};
  const q={...base(999,7),surs_hot_digital_status:'verified_us_digital_date'};
  const out=hot.scoreCandidates([p,q],{snapshots:[]},NOW,null);
  assert.equal(out.length,2);
  assert.notEqual(p.surs_hot_digital_status,q.surs_hot_digital_status);
});
