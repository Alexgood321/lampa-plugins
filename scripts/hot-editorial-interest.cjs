'use strict';
// Top-of-shelf current-demand preference. This is a bounded selection
// adjustment, never a rewrite of the public Hot Score or a hidden quota.
// Activity proxies are NOT actual plays or user-relevance measurements.
const key=c=>String(c.type)+':'+String(c.id);
function interestPenalty(card,position,strength=0){
  if(!Number.isFinite(strength)||strength<=0||
    position>20||position<1)return 0;
  const e=card.surs_hot_interest_evidence;
  // If this object is absent, do not infer "no interest" from missing
  // diagnostic fields. The original score stays authoritative.
  if(!e||e.current_interest_observed!==false)return 0;
  const age=Number(card.surs_hot_rank_age);
  // A new release still establishing demand must not be demoted.
  // 31-60d uses half the capped soft penalty, 61+d its full amount.
  const factor=Number.isFinite(age)&&age>=0&&age<=30?0:
    Number.isFinite(age)&&age<=60?.5:1;
  return Math.round(Math.min(6,strength)*factor*1000)/1000;
}
function summarize(items,previous,baseline){
  const id=x=>key(x),old=(previous||[]).slice(0,10).map(id);
  const control=(baseline||[]).slice(0,10).map(id);
  const top=items.slice(0,10).map(id);
  const prevRank=new Map((previous||[]).map((x,i)=>[id(x),i+1]));
  const shared=items.filter(x=>prevRank.has(id(x)));
  const change=shared.map((x,i)=>Math.abs(items.indexOf(x)+1-prevRank.get(id(x))));
  const top20=items.slice(0,20);
  return {
    selected:items.length,
    top10_overlap_previous:top.filter(x=>old.includes(x)).length,
    top10_overlap_control:top.filter(x=>control.includes(x)).length,
    top20_observed_interest:top20.filter(x=>
      x.surs_hot_interest_evidence?.current_interest_observed===true).length,
    top20_trending:top20.filter(x=>
      x.surs_hot_interest_evidence?.tmdb_trending===true).length,
    top20_independent_kp:top20.filter(x=>
      x.surs_hot_interest_evidence?.kinopoisk_top60===true).length,
    top20_one_rating:top20.filter(x=>
      x.surs_hot_rating_evidence?.source_count===1).length,
    top20_three_ratings:top20.filter(x=>
      x.surs_hot_rating_evidence?.source_count===3).length,
    mean_shared_rank_move:change.length?
      Math.round(change.reduce((a,b)=>a+b,0)/change.length*100)/100:0,
    max_shared_rank_move:change.length?Math.max(...change):0,
    interest_penalties:items.slice(0,20).filter(x=>
      Number(x.surs_hot_editorial_interest_penalty)>0).length
  };
}
function compare(eligible,previous,variants){
  const out={};
  const baseline=variants.zero||[];
  for(const [name,items] of Object.entries(variants))
    out[name]=summarize(items,previous,baseline);
  return {candidate_count:eligible.length,variants:out,
    note:'The comparison uses only observed demand proxies, not viewer behavior; prefer the weakest soft editorial adjustment that avoids material rank disruptions.'};
}
module.exports={interestPenalty,summarize,compare};
