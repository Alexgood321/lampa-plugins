#!/usr/bin/env node
'use strict';
// SURS Hot Discovery. Node 22; no external packages and no third-party keys in the output.
const fs = require('node:fs');
const path = require('node:path');
const BASE = 'https://api.themoviedb.org/3';
const MDB = 'https://api.mdblist.com';
const DAY = 86400000;
const MIN_ITEMS = 12, MAX_ITEMS = 40, MAX_DETAILS = 260, MAX_MDB_CALLS = 50;
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
  const digital=entries.filter(r=>Number(r.type)===4).map(r=>isoDate(r.release_date))
    .filter(d=>d&&daysSince(d,now)>=0).sort().pop();
  const theatrical=entries.filter(r=>[2,3].includes(Number(r.type)))
    .map(r=>isoDate(r.release_date)).filter(d=>d&&daysSince(d,now)>=0).sort()[0];
  // Releasing digitally makes a film newly watchable, but never claim the date if absent.
  const actual=(digital && (!original||digital>=original)) ? digital : (theatrical||original);
  return {date:actual,kind:digital&&actual===digital?'digital':'theatrical',original,digital,theatrical};
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
  const end=dateOnly(now);
  const jobs=[];
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
function qualityFor(c) {
  const votes=number(c.vote_count),tmdb=number(c.vote_average);
  if(tmdb<1||tmdb>10)return {score:0,confidence:0,source_count:0};
  const adjusted=(votes*tmdb+140*6.65)/(votes+140);
  let quality=adjusted,count=1;
  const evidence=c.surs_hot_ratings||{};
  if(evidence.imdb&&evidence.imdb.value>=1&&evidence.imdb.value<=10) {
    const v=evidence.imdb.votes;
    const iv=(v*evidence.imdb.value+300*6.65)/(v+300);
    quality=.72*quality+.28*iv;count++;
  }
  if(evidence.metacritic&&evidence.metacritic.value>0) {
    quality=.92*quality+.08*evidence.metacritic.value;count++;
  }
  // Rotten Tomatoes/Letterboxd are shown in diagnostics, not silently double-counted.
  if(c.surs_hot_season_rating) {
    const sv=c.surs_hot_season_rating.votes;
    const p=sv/(sv+100);
    quality=(1-p*.70)*quality+(p*.70)*c.surs_hot_season_rating.value;
  } else if(c.surs_hot_premiere_kind==='season')quality-=.22; // series-wide proxy
  return {score:round(quality,3),confidence:round(Math.min(1,votes/(votes+140)),3),source_count:count};
}
function trendScore(c,peers) {
  const d=c.surs_hot_trend_day, w=c.surs_hot_trend_week;
  const trendRank=n=>n?1/(1+Math.log10(1+n)*.45):0;
  const trend=d?trendRank(d):w?trendRank(w)*.85:0;
  const ordered=peers.filter(x=>x.type===c.type).map(x=>number(x.popularity)).sort((a,b)=>b-a);
  const rank=ordered.findIndex(x=>x<=number(c.popularity));
  const pop=ordered.length>1?1-rank/(ordered.length-1):.5;
  return round(Math.min(1,.8*trend+.2*pop),3);
}
function growthFor(c,history,now) {
  const current=number(c.popularity);
  const snapshots=(history&&history.snapshots||[]).filter(s=>daysSince(s.date,now)>=3)
    .sort((a,b)=>b.date.localeCompare(a.date));
  const old=snapshots.find(s=>s.items&&s.items[identity(c)]);
  if(!old)return {score:.5,measured:false};
  const previous=number(old.items[identity(c)].p);
  const change=Math.log((current+1)/(previous+1));
  return {score:round(Math.min(1,Math.max(0,.5+change*.38)),3),measured:true};
}
function scoreCandidates(candidates,history,now,previous) {
  for(const c of candidates) {
    const age=daysSince(c.surs_hot_premiere_date,now);
    const quality=qualityFor(c),heat=trendScore(c,candidates),growth=growthFor(c,history,now);
    const freshness=round(Math.exp(-Math.max(0,age)/110),3);
    c.surs_hot_quality=quality.score;
    c.surs_hot_confidence=quality.confidence;
    c.surs_hot_coverage=quality.source_count;
    c.surs_hot_heat=heat;
    c.surs_hot_growth=growth.score;
    c.surs_hot_growth_measured=growth.measured;
    c.surs_hot_freshness=freshness;
    c.surs_hot_age=age;
    c.surs_hot_provisional=number(c.vote_count)<80||
      (c.surs_hot_premiere_kind==='season'&&!c.surs_hot_season_rating);
    const q=Math.min(1,Math.max(0,(quality.score-5.5)/4.5));
    c.surs_hot_score=round(100*(.55*q+.25*heat+.10*growth.score+.10*freshness));
  }
  const eligible=candidates.filter(c=>c.poster_path&&c.surs_hot_age>=0&&
    c.surs_hot_age<=550&&c.surs_hot_quality>=6.65&&
    number(c.vote_count)>=8&&
    !(number(c.vote_count)>=250&&number(c.vote_average)<6.3));
  const previousRank=new Map((previous?.items||[]).map((c,i)=>[identity(c),i]));
  eligible.sort((a,b)=>{
    const delta=b.surs_hot_score-a.surs_hot_score;
    if(Math.abs(delta)>=.75)return delta;
    const pa=previousRank.get(identity(a)),pb=previousRank.get(identity(b));
    if(pa!==undefined&&pb!==undefined&&pa!==pb)return pa-pb;
    if(delta)return delta;
    return identity(a).localeCompare(identity(b));
  });
  return eligible.slice(0,MAX_ITEMS).map((c,i)=>({...c,surs_hot_rank:i+1}));
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
    surs_hot_discovery:raw._channels||[],
    surs_hot_trend_day:raw._trendDay||null,surs_hot_trend_week:raw._trendWeek||null};
  return card;
}
async function build({now=new Date(),tmdbToken,mdblistKey='',listIds=[],history={},previous=null,
  transport=requestJSON,detailLimit=MAX_DETAILS}={}) {
  if(!tmdbToken)throw Error('Missing TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY');
  const nowDate=new Date(now),stats={tmdb_calls:0,tmdb_failures:0,mdblist_calls:0,
    mdblist_failures:0,season_calls:0,discovered:0,us_verified:0,eligible:0};
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
  let remaining=true;
  while(keys.length<detailLimit&&remaining){
    remaining=false;
    for(const queue of queues){
      while(queue.length&&visited.has(queue[0]))queue.shift();
      if(queue.length&&keys.length<detailLimit){
        const key=queue.shift();visited.add(key);keys.push(key);remaining=true;
      }
    }
  }
  const detailRows=await poolMap(keys,5,async key=>{
    const raw=found.get(key),type=raw.type;
    const extra=type==='movie'?'release_dates,external_ids':'external_ids';
    const data=await tmdb(type+'/'+raw.id+'?append_to_response='+extra);
    if(!data||!data.id||!eligibleUS(data,type)||!data.poster_path||blocked(data,type))return null;
    const p=type==='movie'?moviePremiere(data,nowDate):tvPremiere(data,nowDate);
    const age=daysSince(p.date,nowDate);
    if(age<0||age>550)return null;
    return toCard(raw,data,type,p);
  });
  const candidates=detailRows.filter(Boolean);
  stats.us_verified=candidates.length;
  const seasonCandidates=candidates.filter(c=>c.type==='tv'&&c.surs_hot_premiere_kind==='season')
    .sort((a,b)=>number(b.popularity)-number(a.popularity)).slice(0,30);
  await poolMap(seasonCandidates,4,async c=>{
    stats.season_calls++;
    const d=await tmdb('tv/'+c.id+'/season/'+c.surs_hot_season);
    if(!Array.isArray(d?.episodes))return;
    const episodes=d.episodes.filter(e=>isoDate(e.air_date)&&daysSince(e.air_date,nowDate)>=0&&
      number(e.vote_count)>=2&&number(e.vote_average)>=1);
    const v=episodes.reduce((n,e)=>n+number(e.vote_count),0);
    if(v>=30)c.surs_hot_season_rating={value:round(episodes.reduce((sum,e)=>
      sum+number(e.vote_average)*number(e.vote_count),0)/v,3),votes:v,
      episodes_rated:episodes.length,episodes_released:d.episodes.filter(e=>
        isoDate(e.air_date)&&daysSince(e.air_date,nowDate)>=0).length};
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
        if(info&&Number(info.ids?.tmdb||c.id)===c.id)c.surs_hot_ratings=parseMdb(info);
      }catch(e){stats.mdblist_failures++;}
    });
  }
  const items=scoreCandidates(candidates,history,nowDate,previous);
  stats.eligible=candidates.filter(c=>c.surs_hot_quality>=6.65&&c.surs_hot_age<=550).length;
  const feed={schema:1,algorithm:'hot-discovery-4.0',mode:'shadow',
    generated_at:nowDate.toISOString(),sources:{tmdb:true,mdblist:!!mdblistKey},
    items,diagnostics:{...stats,selected:items.length,provisional:items.filter(c=>c.surs_hot_provisional).length,
      measured_growth:items.filter(c=>c.surs_hot_growth_measured).length,
      top10:items.slice(0,10).map(c=>({id:c.id,type:c.type,title:c.title,
        premiere:c.surs_hot_premiere_date,kind:c.surs_hot_premiere_kind,
        score:c.surs_hot_score,quality:c.surs_hot_quality,heat:c.surs_hot_heat}))}};
  validateFeed(feed,nowDate);
  return {feed,history:nextHistory(history,candidates,nowDate)};
}
function readJSON(file,fallback) {try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){return fallback;}}
async function main(){
  const root=path.join(__dirname,'..'),out=path.join(root,'data','hot-discovery.json');
  const historyFile=path.join(root,'data','hot-discovery-history.json');
  const now=new Date(),old=readJSON(out,null);
  const result=await build({now,tmdbToken:process.env.TMDB_READ_ACCESS_TOKEN||
    process.env.TMDB_API_KEY||'',mdblistKey:process.env.MDBLIST_API_KEY||'',
    listIds:(process.env.MDBLIST_LIST_IDS||'').split(',').map(x=>x.trim()).filter(Boolean),
    previous:old,history:readJSON(historyFile,{schema:1,snapshots:[]})});
  fs.mkdirSync(path.dirname(out),{recursive:true});
  // Only publish after validation; CI/workflow preserves the previous good feed on failure.
  const content=JSON.stringify(result.feed,null,2)+'\n';
  const hist=JSON.stringify(result.history)+'\n';
  fs.writeFileSync(out+'.tmp',content);fs.renameSync(out+'.tmp',out);
  fs.writeFileSync(historyFile+'.tmp',hist);fs.renameSync(historyFile+'.tmp',historyFile);
  process.stdout.write(JSON.stringify({generated_at:result.feed.generated_at,
    selected:result.feed.items.length,diagnostics:result.feed.diagnostics})+'\n');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={eligibleUS,moviePremiere,tvPremiere,discoveryJobs,qualityFor,growthFor,
  scoreCandidates,nextHistory,validateFeed,build,parseMdb,daysSince};
