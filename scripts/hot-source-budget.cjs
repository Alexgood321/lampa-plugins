'use strict';
// Shared source-budget and verified-response memo helpers for Hot Discovery.
const TMDB_DETAIL_TTL_HOURS=9;
const TMDB_SEASON_TTL_HOURS=6;
const TMDB_CACHE_RETENTION_HOURS=36;
const MAX_TMDB_CACHE_ITEMS=650;
const KP_DAILY_BUDGET=210; // Safely below the published 500/day default quota.
const ymd=x=>new Date(x).toISOString().slice(0,10);
const hours=(now,stamp)=>(new Date(now).getTime()-Date.parse(stamp))/3600000;

function dailyBudget(prior,now,{daily=KP_DAILY_BUDGET,run=45}={}){
  const today=ymd(now),start=prior?.date===today&&
    Number.isSafeInteger(prior.used)&&prior.used>=0?prior.used:0;
  let used=start,runUsed=0;
  function can(n=1,reserve=0){
    return Number.isInteger(n)&&n>=1&&Number.isInteger(reserve)&&reserve>=0&&
      used+n+reserve<=daily&&runUsed+n+reserve<=run;
  }
  function charge(){
    if(!can())return false;
    used++;runUsed++;return true;
  }
  function snapshot(){return {date:today,used,limit:daily};}
  function remaining(){return Math.max(0,Math.min(daily-used,run-runUsed));}
  return {can,charge,snapshot,remaining,get used(){return used;},
    get runUsed(){return runUsed;},get carried(){return start;}};
}

function memo(raw){
  return {schema:1,entries:{...((raw&&raw.entries&&
    typeof raw.entries==='object'&&!Array.isArray(raw.entries))?raw.entries:{})}};
}
function cached(cache,key,now,ttlHours){
  const item=cache?.entries?.[key];
  if(!item||!item.data||typeof item.data!=='object'||
     !item.at)return null;
  const age=hours(now,item.at);
  return Number.isFinite(age)&&age>=0&&age<=ttlHours?item.data:null;
}
function save(cache,key,data,now){
  if(!data||typeof data!=='object')return false;
  cache.entries[key]={at:new Date(now).toISOString(),data};
  return true;
}
function normalizeDetail(d,type){
  if(!d||!Number.isSafeInteger(Number(d.id))||Number(d.id)<1)return null;
  const common={
    id:Number(d.id),title:d.title,name:d.name,
    original_title:d.original_title,original_name:d.original_name,
    release_date:d.release_date,first_air_date:d.first_air_date,
    poster_path:d.poster_path,backdrop_path:d.backdrop_path,
    overview:typeof d.overview==='string'?d.overview.slice(0,1200):'',
    genres:Array.isArray(d.genres)?d.genres.map(g=>({id:g.id})):[],
    popularity:d.popularity,vote_average:d.vote_average,
    vote_count:d.vote_count,
    external_ids:d.external_ids&&typeof d.external_ids==='object'?
      {imdb_id:d.external_ids.imdb_id}:undefined,
    imdb_id:d.imdb_id
  };
  if(type==='movie'){
    return {...common,production_countries:Array.isArray(d.production_countries)?
      d.production_countries.map(c=>({iso_3166_1:c.iso_3166_1})):[],
      release_dates:{results:(d.release_dates?.results||[])
        .filter(x=>x.iso_3166_1==='US').map(x=>({
          iso_3166_1:'US',release_dates:(x.release_dates||[])
            .map(r=>({type:r.type,release_date:r.release_date}))
        }))}};
  }
  if(type==='tv'){
    return {...common,origin_country:Array.isArray(d.origin_country)?
      d.origin_country:[],seasons:Array.isArray(d.seasons)?
      d.seasons.map(x=>({season_number:x.season_number,air_date:x.air_date})):[]};
  }
  return null;
}
function normalizeSeason(d){
  if(!d||!Number.isInteger(Number(d.season_number))||
     !Array.isArray(d.episodes))return null;
  return {season_number:Number(d.season_number),
    episodes:d.episodes.map(e=>({
      episode_number:e.episode_number,air_date:e.air_date,
      vote_count:e.vote_count,vote_average:e.vote_average}))};
}
// Cache contains static metadata and the old dynamic fields. A new TMDB
// discovery response is the current observation, EVEN WHEN its metrics fell.
// Never use Math.max(old,now): doing so fabricates sustained demand.
function overlayFreshSignals(prior,observed) {
  const raw=observed&&typeof observed==='object'?observed:{};
  const has=(key,min,max=Infinity,integer=false)=>{
    if(!Object.prototype.hasOwnProperty.call(raw,key)||
      raw[key]===null||raw[key]==='')return false;
    const n=Number(raw[key]);
    return Number.isFinite(n)&&n>=min&&n<=max&&
      (!integer||Number.isSafeInteger(n));
  };
  const currentPopularity=has('popularity',0);
  const currentVotes=has('vote_count',0,Infinity,true);
  const currentAverage=has('vote_average',0,10);
  return {
    data:{...prior,
      ...(currentPopularity?{popularity:Number(raw.popularity)}:{}),
      ...(currentVotes?{vote_count:Number(raw.vote_count)}:{}),
      ...(currentAverage?{vote_average:Number(raw.vote_average)}:{})},
    current_popularity:currentPopularity,
    current_votes:currentVotes,
    current_rating:currentAverage
  };
}
function prune(cache,now){
  const pairs=Object.entries(cache?.entries||{}).filter(([k,e])=>k&&e&&
    e.data&&e.at&&Number.isFinite(hours(now,e.at))&&
    hours(now,e.at)>=0&&hours(now,e.at)<=TMDB_CACHE_RETENTION_HOURS)
    .sort((a,b)=>b[1].at.localeCompare(a[1].at))
    .slice(0,MAX_TMDB_CACHE_ITEMS);
  return {schema:1,entries:Object.fromEntries(pairs)};
}
module.exports={KP_DAILY_BUDGET,TMDB_DETAIL_TTL_HOURS,
  TMDB_SEASON_TTL_HOURS,TMDB_CACHE_RETENTION_HOURS,dailyBudget,memo,
  cached,save,normalizeDetail,normalizeSeason,overlayFreshSignals,prune};
