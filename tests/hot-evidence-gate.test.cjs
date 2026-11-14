'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const evidence=require('../scripts/hot-evidence-gate.cjs');
const hot=require('../scripts/hot-discovery.cjs');

const NOW=new Date('2026-11-14T18:00:00Z');
const date=days=>new Date(NOW.getTime()-days*86400000).toISOString().slice(0,10);
function card(id,{age=70,votes=1500,day=null,week=null,kp=null,
  source_count=1,percentile=.4,status='flat',signal=0}={}){
  return {id,type:'movie',title:'Movie '+id,poster_path:'/a',
    surs_hot_premiere_date:date(age),surs_hot_original_date:date(age),
    surs_hot_rank_age:age,surs_hot_age:age,
    vote_average:8.2,vote_count:votes,popularity:100,
    surs_hot_quality:8.2,surs_hot_coverage:source_count,
    surs_hot_rating_evidence:{source_count},
    surs_hot_trend_day:day,surs_hot_trend_week:week,
    surs_hot_kinopoisk_popularity_rank:kp,
    surs_hot_attention_pop_percentile:percentile,
    surs_hot_growth_status:status,surs_hot_growth_signal:signal};
}

test('a TMDB-only non-trending title with flat demand is not automatically a hot discovery',()=>{
  const weak=card(1);
  const r=evidence.evidence(weak);
  assert.equal(r.rating_sources,1);
  assert.equal(r.current_interest_observed,false);
  assert.deepEqual(r.interest_evidence,[]);
  assert.equal(evidence.eligibilityReason(weak),'single_source_interest_unconfirmed');
  assert.equal(hot.eligibilityReason(weak,NOW),'single_source_interest_unconfirmed');
});

test('one-rating titles retain admission when current TMDB Trending verifies interest',()=>{
  for(const cfg of [{day:35},{week:40},{day:1,week:2}]){
    const candidate=card(2,cfg);
    assert.equal(evidence.eligibilityReason(candidate),null);
    assert.equal(evidence.evidence(candidate).tmdb_trending,true);
    assert.equal(hot.eligibilityReason(candidate,NOW),null);
  }
});

test('cross-source ratings are not penalized for missing Trending or KP popular rank',()=>{
  for(const sources of [2,3]){
    const verified=card(3,{source_count:sources});
    const e=evidence.evidence(verified);
    assert.equal(e.one_source_eligible,true);
    assert.equal(e.current_interest_observed,false);
    assert.equal(evidence.eligibilityReason(verified),null);
    assert.equal(hot.eligibilityReason(verified,NOW),null);
  }
});

test('genuinely emerging new releases can pass before appearing in Trending',()=>{
  const emerging=card(4,{age:15,votes:850,percentile:.86});
  assert.equal(evidence.eligibilityReason(emerging),null);
  assert.deepEqual(evidence.evidence(emerging).interest_evidence,['recent_emerging']);
  assert.equal(evidence.eligibilityReason(card(5,{age:31,votes:850,percentile:.86})),
    'single_source_interest_unconfirmed');
  assert.equal(evidence.eligibilityReason(card(6,{age:15,votes:150,percentile:.86})),
    'single_source_interest_unconfirmed');
});

test('positive multi-day demand growth can qualify a moderately aged one-rating title',()=>{
  const rising=card(7,{age:100,votes:2200,percentile:.78,
    status:'rising',signal:.25});
  assert.equal(evidence.eligibilityReason(rising),null);
  assert.equal(evidence.evidence(rising).measured_positive_growth,true);
  assert.equal(evidence.eligibilityReason(card(8,{age:100,votes:2200,
    percentile:.78,status:'flat',signal:.25})),
    'single_source_interest_unconfirmed');
  assert.equal(evidence.eligibilityReason(card(9,{age:100,votes:2200,
    percentile:.78,status:'rising',signal:.04})),
    'single_source_interest_unconfirmed');
});

test('no source missingness penalty is ever subtracted from the objective score',()=>{
  const a=card(10,{day:10,source_count:1});
  const b=card(11,{day:10,source_count:3});
  const rows=hot.scoreCandidates([a,b],{snapshots:[]},NOW,null,'demand');
  assert.equal(rows.length,2);
  assert.equal(rows[0].surs_hot_base_score,rows[1].surs_hot_base_score);
  assert.equal(rows[0].surs_hot_score,rows[1].surs_hot_score);
  assert.equal(rows[0].surs_hot_interest_evidence.tmdb_trending,true);
});

test('filtered single-source long tail is traceable and not forced into 40-card shelf',()=>{
  const strong=Array.from({length:20},(_,i)=>card(100+i,{
    source_count:3,day:i+1}));
  const unsupported=Array.from({length:10},(_,i)=>card(200+i,{
    source_count:1,age:70+i,percentile:.15}));
  const supported=Array.from({length:3},(_,i)=>card(300+i,{
    source_count:1,week:i+5,percentile:.4}));
  const rows=hot.scoreCandidates([...strong,...unsupported,...supported],
    {snapshots:[]},NOW,null,'demand');
  assert.equal(rows.length,23);
  const stats=evidence.diagnostic(rows,unsupported);
  assert.equal(stats.single_source_selected,3);
  assert.equal(stats.single_source_with_interest,3);
  assert.equal(stats.one_source_held,10);
  assert.equal(stats.selected,23);
  assert.equal(stats.top20_interest_evidenced,20);
});
