'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const editorial=require('../scripts/hot-editorial-interest.cjs');
const hot=require('../scripts/hot-discovery.cjs');
const NOW=new Date('2026-11-14T19:30:00Z');
const day=n=>new Date(NOW.getTime()-n*86400000).toISOString().slice(0,10);
const candidate=(id,{age=85,score=30,interest=false,
  sources=3,kind='movie',quality=8.1}={})=>({
  id,type:kind,title:'Candidate '+id,
  poster_path:'/test.jpg',genre_ids:[18],
  vote_average:quality,vote_count:1200,popularity:180,
  surs_hot_premiere_date:day(age),
  surs_hot_original_date:day(age),
  surs_hot_rank_age:age,
  surs_hot_track:'qualified',
  surs_hot_model_scores:{demand:score,baseline:score,fresh:score},
  surs_hot_base_score:score,
  surs_hot_interest_evidence:{current_interest_observed:interest,
    tmdb_trending:interest,kinopoisk_top60:false},
  surs_hot_rating_evidence:{source_count:sources}
});

test('no penalty for a release within its first 30 days without trend confirmation',()=>{
  const item=candidate(1,{age:18,interest:false});
  assert.equal(editorial.interestPenalty(item,1,4),0);
  assert.equal(editorial.interestPenalty(item,19,4),0);
});

test('missing evidence is unknown and does not automatically imply no interest',()=>{
  const item=candidate(2,{age:90});
  delete item.surs_hot_interest_evidence;
  assert.equal(editorial.interestPenalty(item,1,4),0);
});

test('only top-20 positions have a capped non-trending editorial penalty',()=>{
  const old=candidate(3,{age:90,interest:false});
  const young=candidate(4,{age:45,interest:false});
  const verified=candidate(5,{age:90,interest:true});
  assert.equal(editorial.interestPenalty(old,1,4),4);
  assert.equal(editorial.interestPenalty(young,5,4),2);
  assert.equal(editorial.interestPenalty(verified,5,4),0);
  assert.equal(editorial.interestPenalty(old,21,4),0);
  assert.equal(editorial.interestPenalty(old,1,100),6);
});

test('raw Hot score is not modified even when editorial order differs',()=>{
  const old=candidate(6,{age:90,score:34.5,interest:false});
  const trend=candidate(7,{age:90,score:32.5,interest:true});
  const original=hot.curatedSelection([old,trend],null,'demand',0);
  const adjusted=hot.curatedSelection([old,trend],null,'demand',4);
  assert.deepEqual(original.map(x=>x.id),[6,7]);
  assert.deepEqual(adjusted.map(x=>x.id),[7,6]);
  const revised=adjusted.find(x=>x.id===6);
  assert.equal(revised.surs_hot_score,34.5);
  assert.equal(revised.surs_hot_editorial_interest_penalty,4);
  assert.equal(revised.surs_hot_editorial_diversity_penalty,0);
  assert.equal(revised.surs_hot_editorial_penalty,4);
  assert.equal(adjusted[0].surs_hot_editorial_interest_penalty,0);
});

test('strong quality and interest still determine top ranks; no rigid hot quota',()=>{
  const strong=Array.from({length:9},(_,i)=>candidate(i+100,{
    age:90,score:90-i*4,interest:true,kind:i%2?'tv':'movie'}));
  const cold=Array.from({length:16},(_,i)=>candidate(i+200,{
    age:100,score:47-i,interest:false,kind:'movie'}));
  const late=Array.from({length:3},(_,i)=>candidate(i+300,{
    age:100,score:34-i,interest:true,kind:'tv'}));
  const ranked=hot.curatedSelection([...strong,...cold,...late],null,'demand',4);
  assert.equal(ranked.length,28);
  assert.equal(ranked[0].id,100);
  assert.equal(ranked.slice(0,9).filter(x=>x.surs_hot_interest_evidence.current_interest_observed).length,9);
  assert.ok(ranked.slice(0,20).some(x=>!x.surs_hot_interest_evidence.current_interest_observed));
});

test('bounded preference uses the same candidate set and reports tradeoffs',()=>{
  const title=Array.from({length:25},(_,i)=>candidate(i+400,{
    age:i%3===0?40:100,score:50-i,
    interest:i%4===0,kind:i%3===0?'tv':'movie'}));
  const variants={
    zero:hot.curatedSelection(title,null,'demand',0),
    light:hot.curatedSelection(title,null,'demand',2),
    balanced:hot.curatedSelection(title,null,'demand',4),
    strong:hot.curatedSelection(title,null,'demand',6)
  };
  const comparison=editorial.compare(title,variants.zero,variants);
  assert.equal(comparison.candidate_count,title.length);
  assert.equal(comparison.variants.zero.selected,title.length);
  assert.equal(comparison.variants.balanced.selected,title.length);
  assert.equal(comparison.variants.zero.top10_overlap_control,10);
  assert.ok(comparison.variants.balanced.top20_observed_interest>=
    comparison.variants.zero.top20_observed_interest);
  assert.ok(comparison.variants.balanced.top10_overlap_control>=7);
  for(const rows of Object.values(variants))
    assert.deepEqual(new Set(rows.map(x=>x.id)).size,title.length);
});

test('selector keeps unadjusted order when all variants have equal interest coverage',()=>{
  const variants={zero:{top20_observed_interest:16,top20_three_ratings:18,
    top10_overlap_control:10,mean_shared_rank_move:1.61,max_shared_rank_move:6},
    light:{top20_observed_interest:16,top20_three_ratings:18,
    top10_overlap_control:10,mean_shared_rank_move:1.65,max_shared_rank_move:7},
    balanced:{top20_observed_interest:16,top20_three_ratings:18,
    top10_overlap_control:10,mean_shared_rank_move:1.71,max_shared_rank_move:8},
    strong:{top20_observed_interest:16,top20_three_ratings:18,
    top10_overlap_control:10,mean_shared_rank_move:1.77,max_shared_rank_move:9}};
  assert.deepEqual(editorial.selectVariant({variants}),
    {name:'zero',strength:0,reason:'no_safe_observed_gain',uplift:0});
});

test('selector chooses lowest safe strength with real same-candidate coverage lift',()=>{
  const base={top20_observed_interest:16,top20_three_ratings:18,
    top10_overlap_control:10,mean_shared_rank_move:1.5,max_shared_rank_move:6};
  const stats={zero:base,
    light:{...base,top20_observed_interest:17,
      top10_overlap_control:9,mean_shared_rank_move:1.8,max_shared_rank_move:8},
    balanced:{...base,top20_observed_interest:18},
    strong:{...base,top20_observed_interest:19}};
  assert.deepEqual(editorial.selectVariant({variants:stats}),
    {name:'light',strength:2,reason:'measured_interest_coverage_gain',uplift:1});
});

test('selector refuses interest gains that sacrifice independent rating evidence',()=>{
  const base={top20_observed_interest:16,top20_three_ratings:18,
    top10_overlap_control:10,mean_shared_rank_move:1.5,max_shared_rank_move:6};
  const unsafe={...base,top20_observed_interest:17,
    top20_three_ratings:16};
  const unstable={...base,top20_observed_interest:17,
    top10_overlap_control:7};
  const stats={zero:base,light:unsafe,balanced:unstable,strong:unsafe};
  assert.equal(editorial.selectVariant({variants:stats}).strength,0);
});
