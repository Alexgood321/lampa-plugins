'use strict';
// Hot Discovery 4.7: pure, testable ranking primitives.
// Do not equate TMDB/KP popularity ranks or rating counts with real streams.
const DAY=86400000;
const WEIGHTS={
  baseline:{attention:.45,quality:.35,growth:.15,freshness:.05},
  demand:{attention:.50,quality:.30,growth:.15,freshness:.05},
  fresh:{attention:.45,quality:.30,growth:.15,freshness:.10}
};
const day=x=>{
  const s=String(x||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const n=Date.parse(s+'T00:00:00Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s?s:null;
};
const age=(d,now)=>d?Math.floor((Date.parse(day(now instanceof Date?now.toISOString():now)+'T00:00:00Z')-
  Date.parse(d+'T00:00:00Z'))/DAY):9999;
const clamp=x=>Math.min(1,Math.max(0,Number(x)||0));
const round=(x,dp=3)=>Math.round(x*10**dp)/10**dp;
function movieAgeSource(card,now){
  // US distribution dates are authoritative for the stated US shelf.
  // A TMDB international release_date can precede the first US screening.
  const us=day(card.surs_hot_first_us_release_date);
  const original=day(card.surs_hot_original_date);
  const premiere=day(card.surs_hot_premiere_date);
  const first=us||original||premiere;
  const d=age(first,now);
  return {date:first,age:d<0?9999:d,confirmed_us:!!us};
}
function rankAge(card,now){
  if(card.type==='movie')return movieAgeSource(card,now);
  const current=day(card.surs_hot_premiere_date);
  return {date:current,age:age(current,now),confirmed_us:true};
}
function smoothFreshness(ageDays){
  // Smooth exponential; no 25-point cliff when age changes by a day.
  return round(Math.exp(-Math.max(0,ageDays)/145),4);
}
function growthState(score,periods){
  const confirmed=Object.keys(periods||{}).some(k=>k!=='1d');
  if(!confirmed)return {status:'unknown',confirmed:false,signal:0};
  const n=Number(score);
  const status=n>.55?'rising':n<.45?'falling':'flat';
  return {status,confirmed:true,
    signal:status==='rising'?round(clamp((n-.53)*3.3),4):0};
}
function effectiveWeights(weights,confirmed){
  if(confirmed)return weights;
  // Preserve the documented 4.6 fallback instead of silently rebasing it.
  if(weights===WEIGHTS.baseline)return {
    attention:.55,quality:.40,growth:0,freshness:.05};
  const base=weights.attention+weights.quality+weights.freshness;
  return {attention:round(weights.attention/base,6),
    quality:round(weights.quality/base,6),growth:0,
    freshness:round(weights.freshness/base,6)};
}
function modelScore({attention,quality,growth,freshness},weights,confirmed){
  const w=effectiveWeights(weights,confirmed);
  const q=clamp((quality-6.4)/2.8);
  const value=w.attention*clamp(attention)+w.quality*q+
    w.growth*clamp(growth)+w.freshness*clamp(freshness);
  return round(100*value,3);
}
function oldActivity(card,measured,rankingAge){
  if(rankingAge<=180)return {ok:true,reason:'recent'};
  const d=Number(card.surs_hot_trend_day)||999;
  const w=Number(card.surs_hot_trend_week)||999;
  const kp=Number(card.surs_hot_kinopoisk_popularity_rank)||999;
  const tmdbActive=d<=40||w<=40;
  const kpActive=kp<=30;
  const rising=measured?.status==='rising'&&measured.signal>=.08;
  if(rankingAge<=365){
    const ok=tmdbActive||kpActive||
      (rising&&(Number(card.surs_hot_attention)||0)>=.28);
    return {ok,reason:ok?'old_active':'old_no_current_interest'};
  }
  const ok=(tmdbActive&&kp<=20)||
    (d<=10&&rising)||(w<=10&&rising);
  return {ok,reason:ok?'old_breakout':'very_old_no_breakout'};
}
function compareModels(eligible,modelRankings){
  const out={},id=x=>x.type+':'+x.id;
  const reference=modelRankings.baseline||[];
  const baseSet=new Set(reference.slice(0,10).map(id));
  for(const [model,rows] of Object.entries(modelRankings)){
    const head=rows.slice(0,10);
    const ages=head.map(c=>c.surs_hot_rank_age).filter(Number.isFinite);
    out[model]={top10:head.map(id),top10_overlap_baseline:
      head.filter(x=>baseSet.has(id(x))).length,
      top10_mean_age:ages.length?round(ages.reduce((a,b)=>a+b,0)/ages.length,1):null,
      top10_tmdb_trending:head.filter(x=>
        !!(x.surs_hot_trend_day||x.surs_hot_trend_week)).length,
      top10_kp_popular:head.filter(x=>
        Number.isInteger(x.surs_hot_kinopoisk_popularity_rank)).length,
      top10_both:head.filter(x=>x.surs_hot_cross_source_interest).length};
  }
  return {candidate_count:eligible.length,models:out,
    note:'Descriptive comparison; not an independent relevance benchmark.'};
}
module.exports={WEIGHTS,rankAge,movieAgeSource,smoothFreshness,growthState,
  effectiveWeights,modelScore,oldActivity,compareModels,clamp};
