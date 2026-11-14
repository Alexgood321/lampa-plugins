#!/usr/bin/env node
'use strict';
// SURS Hot Discovery. Node 22; no external packages and no third-party keys in the output.
const fs = require('node:fs');
const path = require('node:path');
const kpDemand = require('./kp-demand-history.cjs');
const hot47 = require('./hot-ranking-4-7.cjs');
const sourceBudget = require('./hot-source-budget.cjs');
const BASE = 'https://api.themoviedb.org/3';
const MDB = 'https://api.mdblist.com';
const KP_API = 'https://kinopoiskapiunofficial.tech/api/v2.2/films';
const DAY = 86400000;
const MIN_ITEMS = 12, MAX_ITEMS = 40, MAX_DETAILS = 320, MAX_MDB_CALLS = 50;
const MAX_FIRST_PASS = 260;
// Total HTTP calls per run; each new rated title may cost search + details.
const MAX_KP_CALLS = 45, KP_RATING_TTL_DAYS = 3, KP_MISS_TTL_DAYS = 1;
const KP_POPULAR_PAGES = 3, KP_POPULAR_CACHE_HOURS = 36;
const KP_VOTE_REFRESH_DAILY = 12; // Included in the existing 45-request/run cap.
// Demand is a PUBLIC RANK proxy, not a verified stream count or watch count.
const MAX_SEASON_CALLS = 45;
const QUALITY_FLOOR = 7.2, MIN_VOTES = 100, ORIGINAL_MAX_AGE = 730;
const RECENT_DAYS = 60; // The main discovery window, not a hard age cutoff.
// Interest-first curation: quality blocks weak releases but strong, verified
// audience attention can rescue a mixed-review breakout.
const BREAKOUT_QUALITY_FLOOR = 6.55;
const TOP10_RETURNING_LIMIT = 3, TOP20_RETURNING_LIMIT = 6,
  TOP40_RETURNING_LIMIT = 12;
const EXCLUDED = {movie:[16,99,10770],tv:[16,99,10763,10764,10766,10767]};
const round = (n,dp=2) => Math.round(n * 10**dp) / 10**dp;
const dateOnly = d => new Date(d).toISOString().slice(0,10);
const isoDate = value => {
  const valueString = String(value||'').slice(0,10);
  return /^\d{4}-\d\d-\d\d$/.test(valueString) && !Number.isNaN(Date.parse(valueString+'T00:00:00Z'))
    ? valueString : null;
};
const daysSince = (day,now) => day ? Math.floor((Date.parse(dateOnly(now)+'T00:00:00Z') -
  Date.parse(day+'T00:00:00Z')) / DAY) : 9999;
const identity = c => c.type+':'+c.id;
const number = v => Number.isFinite(Number(v)) ? Number(v) : 0;
function eligibleUS(details,type) {
  if(type==='tv') return Array.isArray(details.origin_country)&&details.origin_country.includes('US');
  return Array.isArray(details.production_countries)&&details.production_countries.some(c=>c.iso_3166_1==='US');
}
function blocked(c,type) {
  return Array.isArray(c.genre_ids) && c.genre_ids.some(id=>EXCLUDED[type].includes(Number(id))) ||
    Array.isArray(c.genres) && c.genres.some(g=>EXCLUDED[type].includes(Number(g.id)));
}
function moviePremiere(details,now) {
  const original=isoDate(details.release_date);
  const entries=(details.release_dates&&details.release_dates.results||[])
    .filter(r=>r.iso_3166_1==='US').flatMap(r=>r.release_dates||[]);
  // TMDB can list several digital/limited re-releases. Only the FIRST US
  // release of each type is a premiere; a later listing is not a new film.
  const first=types=>entries.filter(r=>types.includes(Number(r.type)))
    .map(r=>isoDate(r.release_date)).filter(Boolean).sort()[0]||null;
  const earliestDigital=first([4]),earliestTheatrical=first([2,3]);
  const digital=earliestDigital&&daysSince(earliestDigital,now)>=0?earliestDigital:null;
  const theatrical=earliestTheatrical&&daysSince(earliestTheatrical,now)>=0?
    earliestTheatrical:null;
  const releasedOriginal=original&&daysSince(original,now)>=0?original:null;
  const actual=digital&&(!original||digital>=original||
    (theatrical&&digital<theatrical))?digital:
    (theatrical||releasedOriginal);
  const firstUS=[digital,theatrical].filter(Boolean).sort()[0]||null;
  return {date:actual,kind:actual===digital?'digital':'theatrical',
    original,digital,theatrical,firstUS};
}
function tvPremiere(details,now) {
  const original=isoDate(details.first_air_date);
  const recent=(details.seasons||[]).filter(s=>Number.isInteger(s.season_number)&&s.season_number>=2)
    .map(s=>({date:isoDate(s.air_date),number:s.season_number}))
    .filter(s=>s.date&&daysSince(s.date,now)>=0&&daysSince(s.date,now)<=550)
    .sort((a,b)=>b.date.localeCompare(a.date));
  if(recent[0]&&(!original||recent[0].date>original))
    return {date:recent[0].date,kind:'season',number:recent[0].number,original};
  return {date:original,kind:'series',original};
}
function discoveryJobs(now) {
  const start=dateOnly(new Date(new Date(now).getTime()-550*DAY));
  const recentStart=dateOnly(new Date(new Date(now).getTime()-RECENT_DAYS*DAY));
  const end=dateOnly(now);
  const jobs=[];
  // Give 0-60d releases their own discovery lanes FIRST. The detail budget
  // is limited to 260; older Trending titles must not crowd out recent works.
  for(const type of ['movie','tv']) {
    const dateKey=type==='movie'?'primary_release_date':'first_air_date';
    const common='with_origin_country=US&include_adult=false&'+dateKey+'.gte='+
      recentStart+'&'+dateKey+'.lte='+end+
      '&without_genres='+EXCLUDED[type].join(',');
    for(const sort of [dateKey+'.desc','popularity.desc'])
      for(let page=1;page<=3;page++)
        jobs.push({type,channel:'recent_'+sort,
          url:'discover/'+type+'?'+common+'&sort_by='+sort+'&page='+page});
  }
  for(let page=1;page<=3;page++)jobs.push({type:'movie',channel:'recent_digital',
    url:'discover/movie?region=US&with_origin_country=US&with_release_type=4'+
      '&release_date.gte='+recentStart+'&release_date.lte='+end+
      '&sort_by=release_date.desc&page='+page});
  for(let page=1;page<=3;page++)jobs.push({type:'tv',channel:'recent_season',
    url:'discover/tv?with_origin_country=US&include_adult=false'+
      '&air_date.gte='+recentStart+'&air_date.lte='+end+
      '&sort_by=popularity.desc&page='+page});
  for(const type of ['movie','tv'])for(const span of ['day','week'])for(let page=1;page<=2;page++)
    jobs.push({type,channel:'trending_'+span,url:'trending/'+type+'/'+span+'?page='+page});
  for(const type of ['movie','tv']) {
    const dateKey=type==='movie'?'primary_release_date':'first_air_date';
    const common='with_origin_country=US&include_adult=false&'+dateKey+'.gte='+start+
      '&'+dateKey+'.lte='+end+'&without_genres='+EXCLUDED[type].join(',');
    for(const sort of [dateKey+'.desc','popularity.desc','vote_average.desc'])
      for(let page=1;page<=3;page++) {
        let query=common+'&sort_by='+sort+'&page='+page;
        if(sort==='vote_average.desc')query+='&vote_count.gte=10';
        jobs.push({type,channel:'discover_'+sort,url:'discover/'+type+'?'+query});
      }
  }
  for(let page=1;page<=3;page++)jobs.push({type:'movie',channel:'digital',
    url:'discover/movie?region=US&with_origin_country=US&with_release_type=4'+
      '&release_date.gte='+start+'&release_date.lte='+end+
      '&sort_by=release_date.desc&page='+page});
  for(let page=1;page<=3;page++)jobs.push({type:'tv',channel:'season',
    url:'discover/tv?with_origin_country=US&include_adult=false'+
      '&air_date.gte='+start+'&air_date.lte='+end+
      '&sort_by=popularity.desc&page='+page});
  return jobs;
}
async function requestJSON(url,headers={},post=null) {
  for(let attempt=0;attempt<3;attempt++) {
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
    try {
      const res=await fetch(url,{signal:ctrl.signal,headers:{
        Accept:'application/json','User-Agent':'SURS-Hot-Discovery/4.0',...headers},
        ...(post?{method:'POST',body:JSON.stringify(post)}:{})});
      if(res.ok)return await res.json();
      if(res.status===404)return null;
      if(![429,500,502,503,504].includes(res.status))throw Error('HTTP '+res.status+' '+new URL(url).pathname);
      if(attempt===2)throw Error('HTTP '+res.status+' '+new URL(url).pathname);
    } catch(e){if(attempt===2)throw e;} finally{clearTimeout(timer);}
    await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
}
async function poolMap(items,limit,fn) {
  const out=new Array(items.length);let pos=0;
  async function worker() {while(pos<items.length){const i=pos++;out[i]=await fn(items[i],i);}}
  await Promise.all(Array.from({length:Math.min(items.length,limit)},()=>worker()));
  return out;
}
function parseMdb(info) {
  if(!info||!Array.isArray(info.ratings))return {};
  const result={};
  for(const r of info.ratings) {
    const name=String(r.source||'').toLowerCase().replace(/[^a-z]/g,'');
    const votes=number(r.votes),raw=number(r.value??r.score);
    if(!raw)continue;
    if(name==='imdb'&&raw<=10)result.imdb={value:raw,votes};
    if(name.includes('metacritic'))result.metacritic={value:raw>10?raw/10:raw,votes};
    if(name.includes('rotten')||name==='tomatoes')result.rottentomatoes={value:raw>10?raw/10:raw,votes};
    if(name.includes('letterboxd'))result.letterboxd={value:raw<=5?raw*2:raw,votes};
  }
  return result;
}
function matchedKpSearchRow(data,imdbId) {
  if(!/^tt\d{6,12}$/.test(String(imdbId||'')))return null;
  const rows=Array.isArray(data?.items)?data.items:
    Array.isArray(data?.films)?data.films:
    data&&data.kinopoiskId?[data]:[];
  const row=rows.find(x=>String(x.imdbId||'')===imdbId);
  return row&&Number.isSafeInteger(Number(row.kinopoiskId))&&
    Number(row.kinopoiskId)>0?row:null;
}
function parseKinopoisk(data,imdbId) {
  const item=matchedKpSearchRow(data,imdbId);
  if(!item)return {};
  const result={};
  const kp=number(item.ratingKinopoisk),kv=number(item.ratingKinopoiskVoteCount);
  if(kp>=1&&kp<=10&&kv>=1)
    result.kp={value:kp,votes:kv,via:'kinopoisk_unofficial',
      kinopoisk_id:item.kinopoiskId};
  const imdb=number(item.ratingImdb),iv=number(item.ratingImdbVoteCount);
  if(imdb>=1&&imdb<=10&&iv>=1)
    result.imdb={value:imdb,votes:iv,via:'kinopoisk_unofficial'};
  return result;
}
function stableRating(r,minVotes=1) {
  const value=number(r?.value),votes=number(r?.votes);
  return value>=1&&value<=10&&votes>=minVotes?{value,votes}:null;
}
function qualityAgreement(ratings,isSeason=false) {
  const keys=['tmdb','imdb','kp'].filter(k=>
    stableRating(ratings[k],k==='imdb'?250:100));
  if(keys.length<2||isSeason)
    return {sources:keys.length,bonus:0,spread:null,level:'unconfirmed'};
  const values=keys.map(k=>ratings[k].value);
  const spread=Math.max(...values)-Math.min(...values);
  const high=values.every(v=>v>=7.2);
  const triple=keys.length===3&&spread<=.75&&high;
  const pair=keys.length>=2&&spread<=.6&&high;
  return {sources:keys.length,spread:round(spread,3),
    bonus:triple?.38:pair?.16:0,
    level:triple?'triple_high':pair?'pair_high':
      spread>1.5?'disputed':'mixed'};
}
function qualityFor(c) {
  const tmdb=stableRating({value:c.vote_average,votes:c.vote_count});
  if(!tmdb)return {score:0,base_score:0,confidence:0,source_count:0,
    agreement:qualityAgreement({}),adjusted_ratings:{}};
  const ratings={tmdb},evidence=c.surs_hot_ratings||{};
  for(const key of ['imdb','kp']){
    const rating=stableRating(evidence[key]);
    if(rating)ratings[key]=rating;
  }
  const weights={tmdb:.32,imdb:.36,kp:.32},priors={tmdb:140,imdb:300,kp:180};
  let weighted=0,weightSum=0;
  const adjusted={};
  for(const [key,r] of Object.entries(ratings)){
    const p=priors[key],bayes=(r.votes*r.value+p*6.65)/(r.votes+p);
    adjusted[key]=round(bayes,3);
    weighted+=weights[key]*bayes;
    weightSum+=weights[key];
  }
  const base=weighted/weightSum;
  const isSeason=c.surs_hot_premiere_kind==='season';
  const agreement=qualityAgreement(ratings,isSeason);
  let quality=Math.min(10,base+agreement.bonus);
  if(c.surs_hot_season_rating){
    const p=c.surs_hot_season_rating.votes/
      (c.surs_hot_season_rating.votes+100);
    quality=(1-p*.7)*quality+(p*.7)*c.surs_hot_season_rating.value;
  }else if(isSeason)quality-=.22;
  return {score:round(quality,3),base_score:round(base,3),
    confidence:round(Math.min(1,tmdb.votes/(tmdb.votes+140)),3),
    source_count:Object.keys(ratings).length,agreement,
    adjusted_ratings:adjusted};
}
// Normalized TMDB attention proxies. These are NOT counted as streams or
// cross-platform demand: the data source is TMDB only.
function rankHeat(rank,maxRank=80) {
  if(!Number.isInteger(rank)||rank<1)return 0;
  return round(Math.max(0,1-Math.log(1+rank)/Math.log(1+maxRank)),4);
}
function externalPopularity(c) {
  const rank=Number(c.surs_hot_kinopoisk_popularity_rank);
  if(!Number.isInteger(rank)||rank<1||rank>KP_POPULAR_PAGES*20)
    return {bonus:0,rank:null,cross_confirmed:false};
  const strength=rankHeat(rank,KP_POPULAR_PAGES*20);
  // Extra credit for independently corroborated TMDB day/week activity.
  // Absence from KP Top is UNKNOWN, never a negative rating.
  const confirmed=!!(c.surs_hot_trend_day||c.surs_hot_trend_week);
  const base=strength*(confirmed?.16:.10);
  const extra=kpDemand.extraBonus(c,strength,confirmed);
  return {bonus:round(Math.min(confirmed?.16:.10,base+extra),4),
    momentum_bonus:round(extra,4),rank,cross_confirmed:confirmed};
}
function attentionFor(c,peers) {
  const day=rankHeat(c.surs_hot_trend_day),week=rankHeat(c.surs_hot_trend_week);
  const ordered=peers.filter(x=>x.type===c.type)
    .map(x=>number(x.popularity)).sort((a,b)=>b-a);
  const index=ordered.findIndex(p=>p<=number(c.popularity));
  const pop=ordered.length>1?1-index/(ordered.length-1):.5;
  const activeDay=!!c.surs_hot_trend_day,activeWeek=!!c.surs_hot_trend_week;
  // A historically popular but currently untrending series should not top
  // the feed purely because its cumulative rating is excellent.
  // Day/week trends are correlated observations from ONE provider (TMDB).
  // They form one source signal; both days are not independent confirmations.
  const leading=Math.max(day,week),supporting=Math.min(day,week);
  const tmdbTrend=.85*leading+.15*supporting;
  const interest=activeDay||activeWeek?
    .82*tmdbTrend+.18*pop:.25*pop;
  const outside=externalPopularity(c);
  return {score:round(Math.min(1,interest+outside.bonus),3),
    tmdb_score:round(Math.min(1,interest),3),
    external_bonus:outside.bonus,momentum_bonus:outside.momentum_bonus||0,
    external_rank:outside.rank,cross_confirmed:outside.cross_confirmed,
    day,week,popularity_percentile:round(pop,3),
    trend_confirmed:activeDay&&activeWeek,
    source_count:Number(activeDay||activeWeek)+Number(!!outside.rank)};
}
function trendScore(c,peers) {return attentionFor(c,peers).score;}
// Season launch must be backed by at least one actually aired regular episode.
// The whole-series rating is not accepted as a new-season rating by itself.
function verifySeason(c,details,now) {
  if(!details||Number(details.season_number)!==c.surs_hot_season||
      !Array.isArray(details.episodes))return false;
  const released=details.episodes.filter(e=>Number(e.episode_number)>=1&&
    isoDate(e.air_date)&&daysSince(e.air_date,now)>=0);
  if(!released.length)return false;
  const premiere=released.map(e=>isoDate(e.air_date)).sort()[0];
  if(daysSince(premiere,now)>550)return false;
  c.surs_hot_premiere_date=premiere;
  c.surs_hot_season_verified=true;
  c.surs_hot_episodes_released=released.length;
  const rated=released.filter(e=>number(e.vote_count)>=2&&
    number(e.vote_average)>=1&&number(e.vote_average)<=10);
  const votes=rated.reduce((n,e)=>n+number(e.vote_count),0);
  if(votes>=30)c.surs_hot_season_rating={
    value:round(rated.reduce((sum,e)=>sum+
      number(e.vote_average)*number(e.vote_count),0)/votes,3),
    votes,episodes_rated:rated.length,episodes_released:released.length};
  return true;
}
function growthFor(c,history,now) {
  const snapshots=(history&&history.snapshots||[]).slice()
    .sort((a,b)=>b.date.localeCompare(a.date));
  const key=identity(c),current=number(c.popularity),votes=number(c.vote_count),
    periods={};
  for(const horizon of [1,3,7,14]) {
    const old=snapshots.find(s=>daysSince(s.date,now)>=horizon&&
      daysSince(s.date,now)<=horizon+(horizon===1?0:2)&&s.items&&s.items[key]);
    if(!old)continue;
    const prev=old.items[key],prior=number(prev.p);
    const popDelta=Math.log((current+1)/(prior+1));
    let score=Math.min(1,Math.max(0,.5+popDelta*.28));
    if(Number.isFinite(Number(prev.v))&&votes>=number(prev.v)){
      const voteGain=Math.max(0,votes-number(prev.v));
      const volume=Math.min(1,Math.log1p(voteGain)/Math.log(101));
      score=.75*score+.25*(.5+.5*volume);
    }
    periods[horizon+'d']=round(score,3);
  }
  const values=Object.values(periods);
  const score=values.length?
    round(values.reduce((a,b)=>a+b,0)/values.length,3):.5;
  const state=hot47.growthState(score,periods);
  return {score,measured:values.length>0,periods,...state};
}
function eligibilityReason(c,now) {
  if(!c.poster_path)return 'poster_missing';
  if(c.surs_hot_age<0||c.surs_hot_age>550)return 'premiere_outside_window';
  if(c.type==='movie'&&c.surs_hot_original_date&&
    daysSince(c.surs_hot_original_date,now)>ORIGINAL_MAX_AGE)
    return 'original_too_old';
  if(c.surs_hot_premiere_kind==='season'&&!c.surs_hot_season_verified)
    return 'season_not_verified';
  if(c.surs_hot_quality<BREAKOUT_QUALITY_FLOOR)return 'quality_below_floor';
  const votes=number(c.vote_count);
  if(votes<MIN_VOTES) {
    const imdb=c.surs_hot_ratings&&c.surs_hot_ratings.imdb;
    const external=imdb&&number(imdb.votes)>=1000&&number(imdb.value)>=7.7;
    const strongTrend=(c.surs_hot_trend_day&&c.surs_hot_trend_day<=20)||
      (c.surs_hot_trend_week&&c.surs_hot_trend_week<=20);
    if(!(votes>=50&&c.surs_hot_age<=45&&c.surs_hot_quality>=7.6&&
      external&&strongTrend))return 'insufficient_votes';
  }
  if(c.surs_hot_quality<QUALITY_FLOOR) {
    // Below the normal quality bar: require strong simultaneous 24h and 7d
    // TMDB interest plus popularity breadth; do not equate a high one-day
    // spike to demonstrated popularity on other services.
    const day=number(c.surs_hot_trend_day),week=number(c.surs_hot_trend_week);
    const pop=number(c.surs_hot_attention_pop_percentile);
    const sustained=day>=1&&day<=12&&week>=1&&week<=35&&pop>=.6;
    const rising=day>=1&&day<=8&&pop>=.75&&
      c.surs_hot_growth_measured&&c.surs_hot_growth>=.65;
    if(!(votes>=MIN_VOTES&&c.surs_hot_rank_age<=60&&
      (sustained||rising)))return 'buzz_not_confirmed';
  }
  if(c.surs_hot_premiere_kind==='season'&&!c.surs_hot_season_rating) {
    const trending=(c.surs_hot_trend_day&&c.surs_hot_trend_day<=25)||
      (c.surs_hot_trend_week&&c.surs_hot_trend_week<=25);
    if(!(c.surs_hot_age<=90&&votes>=500&&
      c.surs_hot_quality>=7.7&&trending))
      return 'season_rating_unconfirmed';
  }
  // Old releases require live, independently observable activity.
  // A 181-day threshold never directly subtracts any ranking score.
  const activity=hot47.oldActivity(c,{
    status:c.surs_hot_growth_status,signal:c.surs_hot_growth_signal},
    Number(c.surs_hot_rank_age));
  if(!activity.ok)return activity.reason;
  return null;
}
function recencyTier(c,now) {
  // Retain tiers for diagnostics only; no tier is permitted to add or
  // subtract points in the rank formula.
  const ranked=hot47.rankAge(c,now),age=ranked.age;
  return {age,date:ranked.date,confirmed_us:ranked.confirmed_us,
    tier:age<=60?0:age<=120?1:age<=365?2:3};
}
function isReturning(c) {
  return c.type==='tv'&&c.surs_hot_premiere_kind==='season';
}
function kindOf(c) {
  return isReturning(c)?'returning_tv':c.type==='movie'?'movie':'new_tv';
}
function diversityPenalty(candidate,chosen,position=chosen.length+1) {
  const recent=chosen.slice(-5),kind=kindOf(candidate);
  const sameKind=recent.filter(x=>kindOf(x)===kind).length;
  const genres=Array.isArray(candidate.genre_ids)?candidate.genre_ids:[];
  const first=genres[0];
  const repeats=first==null?0:recent.filter(x=>
    Array.isArray(x.genre_ids)&&x.genre_ids[0]===first).length;
  // Editorial diversity is a SOFT bounded selection penalty, never a
  // 25-point age cliff, hard quota or reduction to the public Hot Score.
  let penalty=Math.max(0,sameKind-2)*.6+Math.max(0,repeats-2)*.3;
  if(isReturning(candidate)){
    const n=chosen.filter(isReturning).length;
    const guide=position<=10?3:position<=20?6:12;
    if(n>=guide)penalty+=Math.min(4,2+(n-guide)*.6);
  }
  if(candidate.surs_hot_track==='breakout'){
    const n=chosen.filter(x=>x.surs_hot_track==='breakout').length;
    const guide=position<=10?2:position<=20?5:10;
    if(n>=guide)penalty+=Math.min(3,1.4+(n-guide)*.5);
  }
  return round(Math.min(6,penalty),3);
}
function curatedSelection(candidates,previous,model='baseline') {
  const remaining=candidates.slice(),picked=[];
  const previousRank=new Map((previous?.items||[])
    .map((c,i)=>[identity(c),i]));
  for(let position=1;position<=MAX_ITEMS&&remaining.length;position++){
    remaining.sort((a,b)=>{
      const sa=number(a.surs_hot_model_scores?.[model]??a.surs_hot_base_score)-
        diversityPenalty(a,picked,position);
      const sb=number(b.surs_hot_model_scores?.[model]??b.surs_hot_base_score)-
        diversityPenalty(b,picked,position);
      if(Math.abs(sb-sa)>.000001)return sb-sa;
      const pa=previousRank.get(identity(a)),pb=previousRank.get(identity(b));
      if(pa!==undefined&&pb!==undefined&&pa!==pb)return pa-pb;
      return identity(a).localeCompare(identity(b));
    });
    const winner=remaining.shift();
    const editorialPenalty=diversityPenalty(winner,picked,position);
    const modelScore=number(winner.surs_hot_model_scores?.[model]??winner.surs_hot_base_score);
    picked.push({...winner,surs_hot_score:round(modelScore,2),
      surs_hot_demand_score:round(modelScore,2),
      surs_hot_editorial_penalty:editorialPenalty,
      surs_hot_rank:position});
  }
  return picked;
}
function scoreCandidates(candidates,history,now,previous,model='baseline') {
  for(const c of candidates) {
    const age=daysSince(c.surs_hot_premiere_date,now);
    const quality=qualityFor(c),attention=attentionFor(c,candidates),
      growth=growthFor(c,history,now);
    c.surs_hot_quality=quality.score;
    c.surs_hot_confidence=quality.confidence;
    c.surs_hot_coverage=quality.source_count;
    c.surs_hot_quality_base=quality.base_score;
    c.surs_hot_rating_agreement=quality.agreement;
    c.surs_hot_adjusted_ratings=quality.adjusted_ratings;
    c.surs_hot_heat=attention.score;
    c.surs_hot_attention=attention.score;
    c.surs_hot_attention_tmdb=attention.tmdb_score;
    c.surs_hot_external_demand_bonus=attention.external_bonus;
    c.surs_hot_kinopoisk_momentum_bonus=attention.momentum_bonus||0;
    c.surs_hot_cross_source_interest=attention.cross_confirmed;
    c.surs_hot_attention_pop_percentile=attention.popularity_percentile;
    c.surs_hot_attention_day=attention.day;
    c.surs_hot_attention_week=attention.week;
    c.surs_hot_attention_sources=attention.source_count;
    c.surs_hot_growth=growth.score;
    c.surs_hot_growth_measured=growth.measured;
    c.surs_hot_growth_periods=growth.periods;
    c.surs_hot_growth_status=growth.status;
    c.surs_hot_growth_signal=growth.signal;
    c.surs_hot_growth_confirmed=growth.confirmed;
    c.surs_hot_age=age;
    const period=recencyTier(c,now);
    c.surs_hot_rank_age=period.age;
    c.surs_hot_rank_date=period.date;
    c.surs_hot_age_source_verified=period.confirmed_us;
    c.surs_hot_recency_tier=period.tier;
    c.surs_hot_provisional=number(c.vote_count)<MIN_VOTES||
      (c.surs_hot_premiere_kind==='season'&&!c.surs_hot_season_rating);
    c.surs_hot_track=quality.score<QUALITY_FLOOR?'breakout':
      quality.score>=7.8?'critically_strong':'qualified';
    const freshness=hot47.smoothFreshness(period.age);
    c.surs_hot_freshness=freshness;
    c.surs_hot_model_scores={};
    const metrics={attention:attention.score,quality:quality.score,
      growth:growth.signal,freshness};
    for(const [name,weights] of Object.entries(hot47.WEIGHTS)){
      const effective=hot47.effectiveWeights(weights,growth.confirmed);
      c.surs_hot_model_scores[name]=hot47.modelScore(metrics,effective,true);
    }
    c.surs_hot_weights=hot47.effectiveWeights(
      hot47.WEIGHTS[model]||hot47.WEIGHTS.baseline,growth.confirmed);
    c.surs_hot_base_score=c.surs_hot_model_scores[model]??c.surs_hot_model_scores.baseline;
  }
  return curatedSelection(candidates.filter(c=>!eligibilityReason(c,now)),previous,model);
}
function nextHistory(history,candidates,now) {
  const day=dateOnly(now);
  const items={};
  for(const c of candidates)items[identity(c)]={p:round(number(c.popularity),2),
    v:number(c.vote_count),td:c.surs_hot_trend_day||0,tw:c.surs_hot_trend_week||0};
  const old=(history?.snapshots||[]).filter(s=>s.date!==day&&daysSince(s.date,now)>=0&&
    daysSince(s.date,now)<=31);
  return {schema:1,snapshots:[...old,{date:day,items}].sort((a,b)=>a.date.localeCompare(b.date))};
}
function validateFeed(feed,now) {
  if(!feed||feed.schema!==1||!Array.isArray(feed.items)||feed.items.length<MIN_ITEMS||
    feed.items.length>MAX_ITEMS||!Number.isFinite(Date.parse(feed.generated_at)))
    throw Error('Invalid Hot Discovery feed');
  const seen=new Set();
  for(const c of feed.items) {
    if(!['movie','tv'].includes(c.type)||!Number.isSafeInteger(c.id)||c.id<=0||
      typeof c.poster_path!=='string'||!c.poster_path.startsWith('/')||
      !isoDate(c.surs_hot_premiere_date)||daysSince(c.surs_hot_premiere_date,now)<0||
      daysSince(c.surs_hot_premiere_date,now)>550||
      !Number.isFinite(c.surs_hot_score)||seen.has(identity(c)))
      throw Error('Invalid item '+identity(c));
    seen.add(identity(c));
  }
  return true;
}
function toCard(raw,details,type,premiere) {
  const card={id:number(details.id),source:'tmdb',type,media_type:type,
    title:details.title||details.name||raw.title||raw.name||'',
    name:details.name||details.title||raw.name||raw.title||'',
    original_title:details.original_title||raw.original_title||'',
    original_name:details.original_name||raw.original_name||'',
    release_date:type==='movie'?isoDate(details.release_date):undefined,
    first_air_date:type==='tv'?isoDate(details.first_air_date):undefined,
    poster_path:details.poster_path,backdrop_path:details.backdrop_path||null,
    overview:String(details.overview||'').slice(0,1200),
    genre_ids:(details.genres||[]).map(g=>g.id),
    origin_country:type==='tv'?details.origin_country:undefined,
    popularity:number(details.popularity||raw.popularity),
    vote_average:number(details.vote_average||raw.vote_average),
    vote_count:number(details.vote_count||raw.vote_count),
    surs_hot_premiere_date:premiere.date,surs_hot_premiere_kind:premiere.kind,
    surs_hot_season:premiere.number||null,
    surs_hot_original_date:premiere.original,
    surs_hot_digital_date:premiere.digital||null,
    surs_hot_first_us_release_date:premiere.firstUS||null,
    surs_hot_digital_status:type==='movie'?
      (premiere.digital?'verified_us_digital_date':'digital_date_unconfirmed'):null,
    surs_hot_discovery:raw._channels||[],
    surs_hot_trend_day:raw._trendDay||null,surs_hot_trend_week:raw._trendWeek||null,
    surs_hot_imdb_id:/^tt\d{6,12}$/.test(String(details.external_ids?.imdb_id||
      details.imdb_id||''))?(details.external_ids?.imdb_id||details.imdb_id):null};
  return card;
}
async function build({now=new Date(),tmdbToken,mdblistKey='',kinopoiskKey='',kpCache={},
  tmdbCache={},listIds=[],history={},previous=null,
  transport=requestJSON,detailLimit=MAX_DETAILS}={}) {
  if(!tmdbToken)throw Error('Missing TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY');
  const nowDate=new Date(now),tmdbMemo=sourceBudget.memo(tmdbCache),
    stats={tmdb_calls:0,tmdb_failures:0,tmdb_detail_cache_hits:0,
    tmdb_detail_cache_misses:0,tmdb_season_cache_hits:0,tmdb_season_cache_misses:0,
    mdblist_calls:0,
    mdblist_failures:0,kp_calls:0,kp_failures:0,kp_matched:0,
    kp_search_calls:0,kp_detail_calls:0,kp_cache_hits:0,
    kp_search_empty:0,kp_detail_unrated:0,kp_no_imdb:0,
    kp_popularity_calls:0,kp_popularity_failures:0,
    kp_popularity_cache_hit:false,kp_popularity_matched:0,
    kp_vote_refresh_calls:0,kp_vote_refresh_failures:0,kp_votes_recorded:0,
    season_calls:0,discovered:0,us_verified:0,eligible:0,
    first_pass_details:0,second_pass_details:0,second_pass_verified:0};
  const tmdb=async relative=>{
    stats.tmdb_calls++;
    const keyAuth=/^[0-9a-f]{32}$/i.test(tmdbToken);
    const url=BASE+'/'+relative+(relative.includes('?')?'&':'?')+'language=ru-RU'+
      (keyAuth?'&api_key='+encodeURIComponent(tmdbToken):'');
    try{return await transport(url,keyAuth?{}:{Authorization:'Bearer '+tmdbToken});}
    catch(e){stats.tmdb_failures++;return null;}
  };
  const jobs=discoveryJobs(nowDate);
  const pages=await poolMap(jobs,5,async job=>({job,result:await tmdb(job.url)}));
  const found=new Map(),buckets=new Map();
  for(const {job,result} of pages) {
    if(!Array.isArray(result?.results))continue;
    const bucket=job.channel+':'+job.type;
    if(!buckets.has(bucket))buckets.set(bucket,[]);
    result.results.forEach((raw,i)=>{
      if(!Number.isSafeInteger(raw.id)||!raw.id||raw.adult===true||blocked(raw,job.type))
        return;
      const key=job.type+':'+raw.id;
      const seen=found.get(key)||{...raw,type:job.type,_channels:[],_trendDay:null,_trendWeek:null};
      if(!seen._channels.includes(job.channel))seen._channels.push(job.channel);
      const rank=(Number(job.url.match(/page=(\d+)/)?.[1]||1)-1)*20+i+1;
      if(job.channel==='trending_day')seen._trendDay=Math.min(seen._trendDay||9999,rank);
      if(job.channel==='trending_week')seen._trendWeek=Math.min(seen._trendWeek||9999,rank);
      seen.popularity=Math.max(number(seen.popularity),number(raw.popularity));
      found.set(key,seen);
      buckets.get(bucket).push(key);
    });
  }
  // MDBList lists are optional discovery sources, never guesses at list identifiers.
  if(mdblistKey&&listIds.length){
    for(const id of listIds.slice(0,4)){
      if(!/^\d+$/.test(String(id)))continue;
      stats.mdblist_calls++;
      try{
        const url=MDB+'/lists/'+id+'/items?limit=100&apikey='+encodeURIComponent(mdblistKey);
        const data=await transport(url);
        const list=Array.isArray(data)?data:(data?.items||data?.results||[]);
        const bucket='mdblist:'+id;
        buckets.set(bucket,[]);
        for(const row of list){
          const type=row.type==='show'||row.type==='tv'?'tv':row.type==='movie'?'movie':null;
          const tid=Number(row.ids?.tmdb||row.tmdb_id);
          if(!type||!Number.isSafeInteger(tid)||tid<=0)continue;
          const key=type+':'+tid;
          if(!found.has(key))found.set(key,{id:tid,type,_channels:[bucket]});
          else if(!found.get(key)._channels.includes(bucket))found.get(key)._channels.push(bucket);
          buckets.get(bucket).push(key);
        }
      }catch(e){stats.mdblist_failures++;}
    }
  }
  stats.discovered=found.size;
  // Round-robin discovery lanes to prevent Trending or Popularity monopolizing details.
  const keys=[],visited=new Set(),queues=[...buckets.values()].map(x=>[...new Set(x)]);
  const primaryLimit=Math.min(detailLimit,MAX_FIRST_PASS);
  let remaining=true;
  while(keys.length<primaryLimit&&remaining){
    remaining=false;
    for(const queue of queues){
      while(queue.length&&visited.has(queue[0]))queue.shift();
      if(queue.length&&keys.length<primaryLimit){
        const key=queue.shift();visited.add(key);keys.push(key);remaining=true;
      }
    }
  }
  stats.first_pass_details=keys.length;
  // Pass two: independently scan eligible-looking discoveries ignored by the
  // original 260-key detail budget. No titles are invented and every extra
  // candidate must still pass the same verified US/release/quality checks.
  if(keys.length<detailLimit){
    const extras=[...found.entries()].filter(([key])=>!visited.has(key))
      .map(([key,raw])=>{
        const date=isoDate(raw.release_date||raw.first_air_date);
        const age=daysSince(date,nowDate);
        const recent=Math.max(0,1-Math.max(0,age)/550);
        const buzz=Math.max(rankHeat(raw._trendDay),rankHeat(raw._trendWeek));
        return {key,type:raw.type,priority:3*buzz+Math.log1p(number(raw.popularity))*.15+
          Math.max(0,number(raw.vote_average)-6)*.05+recent*.55};
      });
    const groups={movie:[],tv:[]};
    for(const x of extras)groups[x.type]?.push(x);
    for(const list of Object.values(groups))
      list.sort((a,b)=>b.priority-a.priority||a.key.localeCompare(b.key));
    let turn=0;
    while(keys.length<detailLimit&&(groups.movie.length||groups.tv.length)){
      const type=turn++%2?'tv':'movie';
      const row=(groups[type].length?groups[type]:groups[type==='tv'?'movie':'tv']).shift();
      if(row&&!visited.has(row.key)){visited.add(row.key);keys.push(row.key);}
    }
  }
  stats.second_pass_details=keys.length-stats.first_pass_details;
  const secondPassKeys=new Set(keys.slice(stats.first_pass_details));
  const detailRows=await poolMap(keys,5,async key=>{
    const raw=found.get(key),type=raw.type;
    const memoKey='detail:'+key;
    const prior=sourceBudget.cached(tmdbMemo,memoKey,nowDate,
      sourceBudget.TMDB_DETAIL_TTL_HOURS);
    let data;
    if(prior){
      stats.tmdb_detail_cache_hits++;
      // Discovery/Trending responses supply fresher dynamic metrics. Static
      // metadata is reused only within the bounded TTL.
      data={...prior,
        popularity:Math.max(number(prior.popularity),number(raw.popularity)),
        vote_count:number(raw.vote_count)>0?number(raw.vote_count):prior.vote_count,
        vote_average:number(raw.vote_count)>0?number(raw.vote_average):prior.vote_average};
    }else{
      stats.tmdb_detail_cache_misses++;
      const extra=type==='movie'?'release_dates,external_ids':'external_ids';
      data=await tmdb(type+'/'+raw.id+'?append_to_response='+extra);
      if(data&&data.id===raw.id){
        const normalized=sourceBudget.normalizeDetail(data,type);
        if(normalized)sourceBudget.save(tmdbMemo,memoKey,normalized,nowDate);
      }
    }
    if(!data||!data.id||!eligibleUS(data,type)||!data.poster_path||blocked(data,type))return null;
    const p=type==='movie'?moviePremiere(data,nowDate):tvPremiere(data,nowDate);
    const age=daysSince(p.date,nowDate);
    if(age<0||age>550)return null;
    const card=toCard(raw,data,type,p);
    card.surs_hot_discovery_pass=secondPassKeys.has(key)?2:1;
    return card;
  });
  const candidates=detailRows.filter(Boolean);
  stats.us_verified=candidates.length;
  stats.second_pass_verified=candidates.filter(c=>c.surs_hot_discovery_pass===2).length;
  const seasonCandidates=candidates.filter(c=>c.type==='tv'&&
    c.surs_hot_premiere_kind==='season')
    .sort((a,b)=>number(b.popularity)-number(a.popularity))
    .slice(0,MAX_SEASON_CALLS);
  await poolMap(seasonCandidates,4,async c=>{
    const key='season:tv:'+c.id+':'+c.surs_hot_season;
    let d=sourceBudget.cached(tmdbMemo,key,nowDate,
      sourceBudget.TMDB_SEASON_TTL_HOURS);
    if(d)stats.tmdb_season_cache_hits++;
    else{
      stats.tmdb_season_cache_misses++;
      stats.season_calls++;
      d=await tmdb('tv/'+c.id+'/season/'+c.surs_hot_season);
      if(d&&Number(d.season_number)===c.surs_hot_season){
        const normalized=sourceBudget.normalizeSeason(d);
        if(normalized)sourceBudget.save(tmdbMemo,key,normalized,nowDate);
      }
    }
    verifySeason(c,d,nowDate);
  });
  if(mdblistKey){
    const subset=candidates.slice().sort((a,b)=>
      number(b.popularity)-number(a.popularity)).slice(0,MAX_MDB_CALLS);
    await poolMap(subset,3,async c=>{
      stats.mdblist_calls++;
      try{
        const type=c.type==='movie'?'movie':'show';
        const info=await transport(MDB+'/tmdb/'+type+'/'+c.id+'/?apikey='+
          encodeURIComponent(mdblistKey));
        if(info&&Number(info.ids?.tmdb)===c.id)
          c.surs_hot_ratings={...(c.surs_hot_ratings||{}),...parseMdb(info)};
      }catch(e){stats.mdblist_failures++;}
    });
  }
  const kpEntries={...(kpCache?.entries||{})},nowDay=dateOnly(nowDate);
  const kpBudget=sourceBudget.dailyBudget(kpCache?.daily_budget,nowDate,
    {daily:sourceBudget.KP_DAILY_BUDGET,run:MAX_KP_CALLS});
  stats.kp_daily_carried=kpBudget.carried;
  const kpRequest=async url=>{
    if(!kpBudget.charge())throw Error('KP request budget exhausted');
    stats.kp_calls++;
    return transport(url,{'X-API-KEY':kinopoiskKey});
  };
  // The published top needs up to 3 calls/day. Daily vote-count sampling
  // needs its own reserved budget to avoid starvation by rating searches.
  const priorTop=kpCache?.popular;
  const topFresh=priorTop?.fetched_at&&
    dateOnly(priorTop.fetched_at)===nowDay;
  const topReserve=topFresh?0:KP_POPULAR_PAGES;
  const todaysVotes=(kpCache?.rating_history||[])
    .find(x=>x.date===nowDay)?.entries?.length||0;
  const voteReserve= todaysVotes>=KP_VOTE_REFRESH_DAILY?0:
    Math.min(8,KP_VOTE_REFRESH_DAILY-todaysVotes);
  const reserve=topReserve+voteReserve;
  const validKpEntry=(row,imdbId)=>{
    if(!row||row.imdbId!==imdbId||!isoDate(row.checked_at))return false;
    const age=daysSince(row.checked_at,nowDate);
    if(age<0||age>(row.kp?KP_RATING_TTL_DAYS:KP_MISS_TTL_DAYS))return false;
    return !row.kp||!!stableRating(row.kp);
  };
  if(kinopoiskKey){
    // Reserve the daily quota for works that are plausible top-40 picks.
    const preview=scoreCandidates(candidates,history,nowDate,previous,'demand');
    const indexed=new Map(candidates.map(c=>[identity(c),c]));
    const order=[...preview.map(c=>indexed.get(identity(c))),
      ...candidates.slice().sort((a,b)=>
        number(b.popularity)-number(a.popularity))],seen=new Set();
    for(const c of order){
      if(!c||seen.has(identity(c)))continue;
      seen.add(identity(c));
      const imdbId=c.surs_hot_imdb_id;
      if(!imdbId){stats.kp_no_imdb++;continue;}
      const cached=kpEntries[imdbId];
      if(validKpEntry(cached,imdbId)){
        stats.kp_cache_hits++;
        if(cached.kp)stats.kp_matched++;
        const prior=c.surs_hot_ratings||{};
        c.surs_hot_ratings={...prior,...(cached.kp?{kp:cached.kp,
          ...(!prior.imdb&&cached.imdb?{imdb:cached.imdb}:{})}:{})};
        continue;
      }
      if(!kpBudget.can(2,reserve)){
        stats.kp_rating_budget_deferred=(stats.kp_rating_budget_deferred||0)+1;
        continue;
      }
      try{
        stats.kp_search_calls++;
        const found=await kpRequest(KP_API+'?imdbId='+encodeURIComponent(imdbId));
        const row=matchedKpSearchRow(found,imdbId);
        if(!row){
          stats.kp_search_empty++;
          kpEntries[imdbId]={imdbId,checked_at:nowDay,kp:null};
          continue;
        }
        let parsed=parseKinopoisk(row,imdbId);
        // The search endpoint doesn't expose the vote counts. Fetch details
        // only for an exact IMDb-ID match, and verify the detail response too.
        if(!parsed.kp){
          stats.kp_detail_calls++;
          const details=await kpRequest(KP_API+'/'+row.kinopoiskId);
          parsed=parseKinopoisk(details,imdbId);
        }
        if(!parsed.kp)stats.kp_detail_unrated++;
        else stats.kp_matched++;
        kpEntries[imdbId]={imdbId,checked_at:nowDay,
          kp:parsed.kp||null,imdb:parsed.imdb||null};
        const prior=c.surs_hot_ratings||{};
        c.surs_hot_ratings={...prior,...parsed};
        if(prior.imdb)c.surs_hot_ratings.imdb=prior.imdb;
      }catch(e){stats.kp_failures++;}
    }
  }
  // Independent public "TOP_POPULAR_ALL" collection of the Kinopoisk
  // Unofficial API. This is a popularity ranking, NOT playback statistics.
  // Read only 3 pages once per UTC day; use the committed cache on later
  // runs. Match by IDs verified during the existing IMDb-based KP lookup.
  let kpPopular=kpCache?.popular||null;
  const popularAgeHours=kpPopular?.fetched_at?
    (nowDate.getTime()-Date.parse(kpPopular.fetched_at))/3600000:Infinity;
  const validPop=x=>x&&x.source==='TOP_POPULAR_ALL'&&
    Array.isArray(x.entries)&&x.entries.length>0&&
    Number.isFinite(Date.parse(x.fetched_at));
  const cachedPopular=validPop(kpPopular)&&popularAgeHours>=0&&
    popularAgeHours<=KP_POPULAR_CACHE_HOURS;
  const shouldRefresh=kinopoiskKey&&(!cachedPopular||
    dateOnly(kpPopular.fetched_at)!==nowDay);
  if(shouldRefresh){
    const popularItems=[],seenIds=new Set();
    let allPagesValid=true;
    for(let page=1;page<=KP_POPULAR_PAGES;page++){
      try{
        if(!kpBudget.can()){
          stats.kp_popularity_budget_deferred=(stats.kp_popularity_budget_deferred||0)+1;
          allPagesValid=false;break;
        }
        stats.kp_popularity_calls++;
        const data=await kpRequest(KP_API+'/collections?type=TOP_POPULAR_ALL&page='+page);
        if(!Array.isArray(data?.items))throw Error('Bad KP popular collection response');
        data.items.forEach((row,i)=>{
          const id=Number(row.kinopoiskId);
          if(!Number.isSafeInteger(id)||id<=0||seenIds.has(id))return;
          seenIds.add(id);
          popularItems.push({id,rank:(page-1)*20+i+1});
        });
        if(data.items.length<20)break;
      }catch(e){stats.kp_popularity_failures++;allPagesValid=false;break;}
    }
    if(allPagesValid&&popularItems.length>0){
      kpPopular={source:'TOP_POPULAR_ALL',fetched_at:nowDate.toISOString(),
        entries:popularItems};
    }
  }else if(kinopoiskKey&&cachedPopular)stats.kp_popularity_cache_hit=true;
  const usePopular=!!kinopoiskKey&&validPop(kpPopular)&&
    (nowDate.getTime()-Date.parse(kpPopular.fetched_at))/3600000>=0&&
    (nowDate.getTime()-Date.parse(kpPopular.fetched_at))/3600000<=
      KP_POPULAR_CACHE_HOURS;
  if(usePopular){
    const ranks=new Map(kpPopular.entries.map(x=>[Number(x.id),Number(x.rank)]));
    for(const c of candidates){
      const id=Number(c.surs_hot_ratings?.kp?.kinopoisk_id);
      const rank=ranks.get(id);
      if(Number.isInteger(rank)&&rank>0&&rank<=KP_POPULAR_PAGES*20){
        c.surs_hot_kinopoisk_popularity_rank=rank;
        stats.kp_popularity_matched++;
      }
    }
  }
  // Promote verified v4.5 top and retain one independently fetched rank per day.
  const rankHistory=kpDemand.snapshots(kpCache?.popular_history,
    nowDate,'rank',kpPopular);
  const voteHistory=kpDemand.snapshots(kpCache?.rating_history,nowDate,'votes');
  const dayVotes=new Map((voteHistory.find(s=>s.date===nowDay)?.entries||[])
    .map(x=>[x.id,x.votes]));
  const recordVotes=(id,votes)=>{
    if(Number.isSafeInteger(id)&&id>0&&
      Number.isSafeInteger(votes)&&votes>0)dayVotes.set(id,votes);
  };
  // Three-day cached rating totals never masquerade as daily vote samples.
  if(kinopoiskKey)for(const c of candidates){
    const entry=c.surs_hot_imdb_id&&kpEntries[c.surs_hot_imdb_id];
    if(entry?.checked_at===nowDay&&entry.kp)
      recordVotes(Number(entry.kp.kinopoisk_id),Number(entry.kp.votes));
  }
  if(usePopular){
    const ranked=candidates.filter(c=>
      Number.isInteger(c.surs_hot_kinopoisk_popularity_rank)&&
      Number.isSafeInteger(Number(c.surs_hot_ratings?.kp?.kinopoisk_id))&&
      /^tt\d{6,12}$/.test(String(c.surs_hot_imdb_id||'')))
      .sort((a,b)=>a.surs_hot_kinopoisk_popularity_rank-
        b.surs_hot_kinopoisk_popularity_rank);
    let refreshed=0;
    for(const c of ranked){
      if(refreshed>=KP_VOTE_REFRESH_DAILY||dayVotes.size>=KP_VOTE_REFRESH_DAILY||
        !kpBudget.can())break;
      const kpId=Number(c.surs_hot_ratings.kp.kinopoisk_id);
      if(dayVotes.has(kpId))continue;
      refreshed++;stats.kp_vote_refresh_calls++;
      try{
        const detail=await kpRequest(KP_API+'/'+kpId);
        if(Number(detail?.kinopoiskId)!==kpId||
          String(detail?.imdbId)!==c.surs_hot_imdb_id)continue;
        const updated=parseKinopoisk(detail,c.surs_hot_imdb_id);
        if(!updated.kp)continue;
        recordVotes(kpId,Number(updated.kp.votes));
        c.surs_hot_ratings={...(c.surs_hot_ratings||{}),kp:updated.kp};
        if(!c.surs_hot_ratings.imdb&&updated.imdb)
          c.surs_hot_ratings.imdb=updated.imdb;
        kpEntries[c.surs_hot_imdb_id]={imdbId:c.surs_hot_imdb_id,
          checked_at:nowDay,kp:updated.kp,imdb:updated.imdb||null};
      }catch(e){stats.kp_vote_refresh_failures++;}
    }
  }
  stats.kp_votes_recorded=dayVotes.size;
  stats.kp_daily_used=kpBudget.used;
  stats.kp_daily_remaining=Math.max(0,sourceBudget.KP_DAILY_BUDGET-kpBudget.used);
  stats.kp_run_remaining=kpBudget.remaining();
  const updatedVoteHistory=kpDemand.snapshots(
    [...voteHistory.filter(x=>x.date!==nowDay),
      ...(dayVotes.size?[{date:nowDay,
        entries:[...dayVotes].map(([id,votes])=>({id,votes}))}]:[])],
    nowDate,'votes');
  for(const c of candidates){
    const measured=kpDemand.momentum(c,rankHistory,updatedVoteHistory,
      nowDate,usePopular?kpPopular.fetched_at:null);
    c.surs_hot_kinopoisk_rank_deltas=measured.rank_deltas;
    c.surs_hot_kinopoisk_vote_growth=measured.vote_growth;
    c.surs_hot_kinopoisk_rank_as_of=measured.rank_as_of;
    c.surs_hot_kinopoisk_votes_as_of=measured.votes_as_of;
  }
  if(stats.tmdb_failures>Math.max(3,Math.floor(stats.tmdb_calls*.25)))
    throw Error('TMDB partial outage: refusing to replace last verified feed');
  const items=scoreCandidates(candidates,history,nowDate,previous,'demand');
  const comparison=kpDemand.compareTop(previous,items);
  const eligibleForVariants=candidates.filter(c=>!eligibilityReason(c,nowDate));
  const modelComparison=hot47.compareModels(eligibleForVariants,{
    baseline:curatedSelection(eligibleForVariants,previous,'baseline'),
    demand:items,
    fresh:curatedSelection(eligibleForVariants,previous,'fresh')
  });
  stats.second_pass_eligible=eligibleForVariants.filter(c=>
    c.surs_hot_discovery_pass===2).length;
  stats.second_pass_selected=items.filter(c=>c.surs_hot_discovery_pass===2).length;
  const rejections={};
  for(const c of candidates){
    const reason=eligibilityReason(c,nowDate);
    if(reason)rejections[reason]=(rejections[reason]||0)+1;
    else stats.eligible++;
  }
  const recencyCounts={'0-60':0,'61-120':0,'121-365':0,'366+':0};
  for(const c of items) {
    const band=['0-60','61-120','121-365','366+'][c.surs_hot_recency_tier];
    recencyCounts[band]++;
  }
  const byKind={movie:0,new_tv:0,returning_tv:0};
  const byTrack={qualified:0,critically_strong:0,breakout:0};
  for(const c of items){
    byKind[kindOf(c)]++;
    byTrack[c.surs_hot_track]=(byTrack[c.surs_hot_track]||0)+1;
  }
  const audit={schema:1,algorithm:'hot-discovery-4.7',
    generated_at:nowDate.toISOString(),candidate_total:candidates.length,
    eligible:stats.eligible,selected:items.length,
    candidates:candidates.slice().sort((a,b)=>
      number(b.surs_hot_base_score)-number(a.surs_hot_base_score))
      .slice(0,200).map(c=>({
        id:c.id,type:c.type,title:c.title,kind:c.surs_hot_premiere_kind,
        premiere:c.surs_hot_premiere_date,age:c.surs_hot_rank_age,
        tmdb:c.vote_average,tmdb_votes:c.vote_count,
        imdb:c.surs_hot_ratings?.imdb||null,kp:c.surs_hot_ratings?.kp||null,
        attention:c.surs_hot_attention,
        growth_status:c.surs_hot_growth_status,
        growth_signal:c.surs_hot_growth_signal,
        rank_age:c.surs_hot_rank_age,
        discovery_pass:c.surs_hot_discovery_pass,
        model_scores:c.surs_hot_model_scores,
        external_popularity_rank:c.surs_hot_kinopoisk_popularity_rank||null,
        external_bonus:c.surs_hot_external_demand_bonus||0,
        rank_deltas:c.surs_hot_kinopoisk_rank_deltas||{},
        vote_growth:c.surs_hot_kinopoisk_vote_growth||{},
        momentum_bonus:c.surs_hot_kinopoisk_momentum_bonus||0,
        cross_source_interest:!!c.surs_hot_cross_source_interest,
        quality:c.surs_hot_quality,
        agreement:c.surs_hot_rating_agreement,
        base_score:c.surs_hot_base_score,rejection:eligibilityReason(c,nowDate),
        selected_rank:items.find(x=>identity(x)===identity(c))?.surs_hot_rank||null
      }))};
  const feed={schema:1,algorithm:'hot-discovery-4.7',mode:'primary',
    generated_at:nowDate.toISOString(),
     sources:{tmdb:true,mdblist:!!mdblistKey,kinopoisk:!!kinopoiskKey,
        kinopoisk_popularity:usePopular},
    items,diagnostics:{...stats,selected:items.length,
      quality_floor:QUALITY_FLOOR,min_votes:MIN_VOTES,
      primary_window_days:RECENT_DAYS,selected_by_recency:recencyCounts,
      ranking_model:'source-aware-demand-first-v4.7',
      active_model:'demand',
      comparison,model_comparison:modelComparison,
      external_demand:{
        source:'kinopoisk_unofficial_TOP_POPULAR_ALL',
        refreshed_at:usePopular?kpPopular.fetched_at:null,
        available:usePopular,
        compared_candidates:stats.kp_popularity_matched,
        selected_matching:items.filter(c=>
          Number.isInteger(c.surs_hot_kinopoisk_popularity_rank)).length,
        selected_cross_confirmed:items.filter(c=>
          c.surs_hot_cross_source_interest).length,
        max_attention_bonus:.16,
        momentum_rank_measured:items.filter(c=>
          Object.keys(c.surs_hot_kinopoisk_rank_deltas||{}).length>0).length,
        momentum_votes_measured:items.filter(c=>
          Object.keys(c.surs_hot_kinopoisk_vote_growth||{}).length>0).length,
        momentum_positive:items.filter(c=>
          (c.surs_hot_kinopoisk_momentum_bonus||0)>0).length,
        history_dates:rankHistory.map(x=>x.date),
        rating_history_dates:updatedVoteHistory.map(x=>x.date),
        not_stream_count:true
      },
      weights_with_growth:{attention:50,quality:30,freshness:5,growth:15},
      weights_without_growth:{attention:60,quality:35,freshness:5,growth:0},
      rating_coverage:{
        tmdb:items.filter(c=>number(c.vote_count)>0).length,
        imdb:items.filter(c=>stableRating(c.surs_hot_ratings?.imdb)).length,
        kinopoisk:items.filter(c=>stableRating(c.surs_hot_ratings?.kp)).length,
        triple:items.filter(c=>c.surs_hot_rating_agreement?.sources===3).length,
        triple_agreement:items.filter(c=>c.surs_hot_rating_agreement?.level==='triple_high').length,
        double_agreement:items.filter(c=>c.surs_hot_rating_agreement?.level==='pair_high').length,
        growth_confirmed:items.filter(c=>c.surs_hot_growth_confirmed).length
      },
      selected_by_kind:byKind,selected_by_track:byTrack,
      returning_top10:items.slice(0,10).filter(isReturning).length,
      returning_top20:items.slice(0,20).filter(isReturning).length,
      breakouts_top10:items.slice(0,10).filter(c=>c.surs_hot_track==='breakout').length,
      rejections,
      provisional:items.filter(c=>c.surs_hot_provisional).length,
      measured_growth:items.filter(c=>c.surs_hot_growth_measured).length,
      positive_growth:items.filter(c=>c.surs_hot_growth_status==='rising').length,
      falling_growth:items.filter(c=>c.surs_hot_growth_status==='falling').length,
      flat_growth:items.filter(c=>c.surs_hot_growth_status==='flat').length,
      unknown_growth:items.filter(c=>c.surs_hot_growth_status==='unknown').length,
      digital_status: {
        verified:items.filter(c=>c.type==='movie'&&
          c.surs_hot_digital_status==='verified_us_digital_date').length,
        unknown:items.filter(c=>c.type==='movie'&&
          c.surs_hot_digital_status==='digital_date_unconfirmed').length
      },
      top10:items.slice(0,10).map(c=>({id:c.id,type:c.type,title:c.title,
        premiere:c.surs_hot_premiere_date,kind:c.surs_hot_premiere_kind,
        score:c.surs_hot_score,quality:c.surs_hot_quality,heat:c.surs_hot_heat}))}};
  validateFeed(feed,nowDate);
  return {feed,audit,history:nextHistory(history,candidates,nowDate),
    kpCache:{schema:1,entries:kpEntries,
      ...(validPop(kpPopular)?{popular:kpPopular}:{}),
      popular_history:rankHistory,rating_history:updatedVoteHistory,
      daily_budget:kpBudget.snapshot()},
    tmdbCache:sourceBudget.prune(tmdbMemo,nowDate)};
}
function readJSON(file,fallback) {try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){return fallback;}}
async function main(){
  const root=path.join(__dirname,'..'),out=path.join(root,'data','hot-discovery.json');
  const historyFile=path.join(root,'data','hot-discovery-history.json');
  const auditFile=path.join(root,'data','hot-discovery-audit.json');
  const kpCacheFile=path.join(root,'data','hot-discovery-kp-cache.json');
  const now=new Date(),old=readJSON(out,null);
  const result=await build({now,tmdbToken:process.env.TMDB_READ_ACCESS_TOKEN||
    process.env.TMDB_API_KEY||'',mdblistKey:process.env.MDBLIST_API_KEY||'',
    kinopoiskKey:process.env.KINOPOISK_API_KEY||'',
    kpCache:readJSON(kpCacheFile,{schema:1,entries:{}}),
    listIds:(process.env.MDBLIST_LIST_IDS||'').split(',').map(x=>x.trim()).filter(Boolean),
    previous:old,history:readJSON(historyFile,{schema:1,snapshots:[]})});
  fs.mkdirSync(path.dirname(out),{recursive:true});
  // Only publish after validation; CI/workflow preserves the previous good feed on failure.
  const content=JSON.stringify(result.feed,null,2)+'\n';
  const hist=JSON.stringify(result.history)+'\n';
  // Source snapshots are collected every 3h; display ranking changes once per UTC day.
  // This avoids the shelf jumping around multiple times during the same day.
  // Publish a newly versioned algorithm immediately, even on the same day.
  const sameDay=old&&old.schema===1&&
    old.algorithm===result.feed.algorithm&&
    dateOnly(old.generated_at)===dateOnly(now)&&
    !!old.sources?.kinopoisk_popularity===
      !!result.feed.sources?.kinopoisk_popularity&&
    ['kinopoisk','mdblist'].every(k=>
      !!old.sources?.[k]===!!result.feed.sources?.[k])&&
    number(result.feed.diagnostics?.rating_coverage?.kinopoisk)<
      number(old.diagnostics?.rating_coverage?.kinopoisk)+5;
  if(!sameDay){
    fs.writeFileSync(out+'.tmp',content);fs.renameSync(out+'.tmp',out);
  }
  fs.writeFileSync(historyFile+'.tmp',hist);fs.renameSync(historyFile+'.tmp',historyFile);
  fs.writeFileSync(auditFile+'.tmp',JSON.stringify(result.audit,null,2)+'\n');
  fs.renameSync(auditFile+'.tmp',auditFile);
  fs.writeFileSync(kpCacheFile+'.tmp',JSON.stringify(result.kpCache,null,2)+'\n');
  fs.renameSync(kpCacheFile+'.tmp',kpCacheFile);
  process.stdout.write(JSON.stringify({generated_at:result.feed.generated_at,
    selected:result.feed.items.length,diagnostics:result.feed.diagnostics})+'\n');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={eligibleUS,moviePremiere,tvPremiere,discoveryJobs,qualityFor,growthFor,
  scoreCandidates,recencyTier,attentionFor,curatedSelection,eligibilityReason,
  verifySeason,nextHistory,validateFeed,build,parseMdb,parseKinopoisk,
  qualityAgreement,matchedKpSearchRow,externalPopularity,daysSince};
