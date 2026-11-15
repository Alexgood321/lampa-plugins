'use strict';
// Hot Discovery 5.0: independent-source safeguards.
// Popularity charts are proxies for attention, NOT verified plays.
// IMDb/KP numeric ratings reflect different rating communities but their
// values may arrive through one Kinopoisk Unofficial API response.
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const valid=(r,votes,minRating=0)=>r&&n(r.value)>=minRating&&n(r.value)<=10&&
  n(r.votes)>=votes;
const clamp=x=>Math.max(0,Math.min(1,x));
function independentRating(card){
  const ratings=card?.surs_hot_ratings||{};
  const imdb=valid(ratings.imdb,1000,7.0);
  const kp=valid(ratings.kp,500,7.0);
  return {imdb:!!imdb,kp:!!kp,both:!!imdb&&!!kp};
}
function confidence(card){
  const ratings=card?.surs_hot_ratings||{};
  const tmdb=n(card?.vote_count);
  const tmdbConfidence=clamp(tmdb/(tmdb+140));
  const imdb=valid(ratings.imdb,250,1)?n(ratings.imdb.votes):0;
  const kp=valid(ratings.kp,100,1)?n(ratings.kp.votes):0;
  const weights={tmdb:.32,imdb:.36,kp:.32};
  let total=weights.tmdb*tmdbConfidence,den=weights.tmdb;
  if(imdb){total+=weights.imdb*clamp(imdb/(imdb+300));den+=weights.imdb;}
  if(kp){total+=weights.kp*clamp(kp/(kp+180));den+=weights.kp;}
  return Math.round(total/den*1000)/1000;
}
function externalRatingsPass(card){
  if(card?.type!=='movie'||n(card?.surs_hot_age)>60||
    n(card?.surs_hot_age)<0||n(card?.vote_count)<35)return false;
  if(!independentRating(card).both)return false;
  const rank=n(card?.surs_hot_kinopoisk_popularity_rank);
  if(!Number.isInteger(rank)||rank<1||rank>30)return false;
  return n(card?.surs_hot_quality)>=7.15&&
    n(card?.surs_hot_interest_evidence?.rating_sources)>=2;
}
function demandFloor(card){
  // Only rescue a strong independent KP rank whose two external rating
  // communities have enough votes. Not all legacy KP Top-100 titles qualify.
  const rank=n(card?.surs_hot_kinopoisk_popularity_rank);
  if(!Number.isInteger(rank)||rank<1||rank>20||
    !independentRating(card).both)return 0;
  // Top-1 ≈ .70, Top-10 ≈ .56, Top-20 ≈ .40. These remain proxies.
  return Math.round((.38+.32*(21-rank)/20)*1000)/1000;
}
function availability(card){
  if(card?.type==='tv')
    return card?.surs_hot_premiere_kind==='season'?
      'aired_new_season':'aired_new_series';
  return card?.surs_hot_digital_status==='verified_us_digital_date'?
    'us_digital_release_verified':
    card?.surs_hot_digital_status==='digital_date_unconfirmed'?
      'theatrical_digital_unconfirmed':'availability_unknown';
}
function distributionPenalty(card){
  // Small, explicitly visible curation tie-breaker. A cinema premiere is
  // still a real new title; it just is not declared watchable at home.
  return availability(card)==='theatrical_digital_unconfirmed'?3:0;
}
function currentInterestNeeded(card){
  return card?.surs_hot_interest_evidence?.current_interest_observed===true;
}
function diagnostics(items,eligible){
  const count=(xs,fn)=>xs.filter(fn).length;
  const top=items.slice(0,10),all=items||[];
  return {
    ranked:all.length,
    external_ratings_recovered:count(all,x=>x.surs_hot_external_rating_exception),
    external_ratings_recovered_top10:count(top,x=>x.surs_hot_external_rating_exception),
    independent_kp_chart_top10:count(top,x=>
      Number.isInteger(x.surs_hot_kinopoisk_popularity_rank)&&
        x.surs_hot_kinopoisk_popularity_rank<=30),
    interest_unobserved:count(all,x=>!currentInterestNeeded(x)),
    theatrical_without_verified_digital:count(all,x=>
      availability(x)==='theatrical_digital_unconfirmed'),
    eligible_without_current_interest:count(eligible||[],x=>!currentInterestNeeded(x))
  };
}
module.exports={independentRating,confidence,externalRatingsPass,
  demandFloor,availability,distributionPenalty,currentInterestNeeded,diagnostics};
