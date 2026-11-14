'use strict';
// A HOT shelf needs evidence of CURRENT interest. Missing IMDb/KP ratings
// are UNKNOWN rather than low quality, so do not numerically penalize them.
// Only a one-rating candidate without observable current interest is held.
const clampRank=(x,max)=>{
  const n=Number(x);
  return x!==null&&x!==undefined&&Number.isInteger(n)&&n>=1&&n<=max?n:null;
};
function evidence(card){
  const ratings=Number(card?.surs_hot_rating_evidence?.source_count)||
    Number(card?.surs_hot_coverage)||1;
  const age=Number(card?.surs_hot_rank_age);
  const votes=Number(card?.vote_count)||0;
  const percentile=Number(card?.surs_hot_attention_pop_percentile)||0;
  const day=clampRank(card?.surs_hot_trend_day,40);
  const week=clampRank(card?.surs_hot_trend_week,40);
  const kp=clampRank(card?.surs_hot_kinopoisk_popularity_rank,60);
  const trending=!!(day||week);
  const independent=!!kp;
  // Non-trending new launches may still be emerging within the discovery
  // pool. Require both recent release and substantial verified TMDB votes.
  const emerging=Number.isFinite(age)&&age>=0&&age<=30&&
    votes>=500&&percentile>=.65;
  // Positive momentum is a TMDB proxy, not an independent provider.
  const rising=card?.surs_hot_growth_status==='rising'&&
    Number(card?.surs_hot_growth_signal)>=.12&&
    votes>=500&&percentile>=.65&&Number.isFinite(age)&&age<=120;
  const current=trending||independent||emerging||rising;
  const singleSource=ratings<2;
  const reasons=[
    ...(trending?['tmdb_trending']:[]),
    ...(independent?['kinopoisk_top60']:[]),
    ...(emerging?['recent_emerging']:[]),
    ...(rising?['measured_positive_growth']:[])
  ];
  return {
    rating_sources:Math.min(3,Math.max(1,Math.round(ratings))),
    tmdb_trending:trending,kinopoisk_top60:independent,
    recent_emerging:emerging,measured_positive_growth:rising,
    current_interest_observed:current,
    one_source_eligible:!singleSource||current,
    interest_evidence:reasons
  };
}
function eligibilityReason(card){
  const e=evidence(card);
  return e.one_source_eligible?null:'single_source_interest_unconfirmed';
}
function diagnostic(items,allCandidates){
  const stats={selected:items.length,
    single_source_selected:0,single_source_with_interest:0,
    one_source_held:0,top20_interest_evidenced:0,
    all_selected_interest_evidenced:0,
    interest_signals:{tmdb_trending:0,kinopoisk_top60:0,
      recent_emerging:0,measured_positive_growth:0}};
  for(const x of allCandidates||[]){
    if(eligibilityReason(x))stats.one_source_held++;
  }
  for(const [i,card] of items.entries()){
    const e=evidence(card);
    if(e.rating_sources===1){
      stats.single_source_selected++;
      if(e.current_interest_observed)stats.single_source_with_interest++;
    }
    if(e.current_interest_observed){
      stats.all_selected_interest_evidenced++;
      if(i<20)stats.top20_interest_evidenced++;
    }
    for(const key of Object.keys(stats.interest_signals)){
      if(e[key])stats.interest_signals[key]++;
    }
  }
  return stats;
}
module.exports={evidence,eligibilityReason,diagnostic};
