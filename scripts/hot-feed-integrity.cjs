'use strict';
// Hot Discovery provider-integrity and transparent release-drift diagnostics.
// This module never treats interest proxies as verified viewer engagement.
const LANES=['movie:day','movie:week','tv:day','tv:week'];
const id=x=>String(x?.type)+':'+String(x?.id);
function evaluateTmdbPages(pages) {
  const lanes={};
  for(const key of LANES)lanes[key]={
    page:1,reported:false,valid:false,items:0
  };
  let discoveryValid=0,discoveryNonempty=0,totalFailures=0;
  for(const row of pages||[]){
    const job=row?.job||{},result=row?.result;
    const valid=Array.isArray(result?.results);
    if(!valid)totalFailures++;
    const count=valid?result.results.length:0;
    if(job.channel?.startsWith('trending_')&&
      /(?:^|[?&])page=1(?:&|$)/.test(String(job.url||''))){
      const key=job.type+':'+job.channel.slice('trending_'.length);
      if(lanes[key]){
        lanes[key]={page:1,reported:true,valid,items:count};
      }
    }
    if(job.channel?.startsWith('discover_')||
      job.channel?.startsWith('recent_')){
      if(valid)discoveryValid++;
      if(count>0)discoveryNonempty++;
    }
  }
  const failed=LANES.filter(key=>{
    const row=lanes[key];
    return !row.reported||!row.valid||row.items<5;
  });
  return {
    trending_first_pages:lanes,required_lanes:LANES.length,
    healthy_lanes:LANES.length-failed.length,
    failed_lanes:failed,discovery_valid_pages:discoveryValid,
    discovery_nonempty_pages:discoveryNonempty,
    failed_pages:totalFailures,
    healthy:failed.length===0&&discoveryNonempty>=4
  };
}
function drift(previous,next) {
  const old=Array.isArray(previous?.items)?previous.items:[];
  const current=Array.isArray(next?.items)?next.items:[];
  const before=new Map(old.map((x,i)=>[id(x),i+1]));
  const after=new Map(current.map((x,i)=>[id(x),i+1]));
  const top=(n,items)=>items.slice(0,n).map(id);
  const top10Before=new Set(top(10,old));
  const top20Before=new Set(top(20,old));
  const shared=current.filter(x=>before.has(id(x)));
  const moves=shared.map(x=>Math.abs(after.get(id(x))-before.get(id(x))));
  const old10=old.slice(0,10).filter(x=>x.surs_hot_trend_day||
    x.surs_hot_trend_week).length;
  const new10=current.slice(0,10).filter(x=>x.surs_hot_trend_day||
    x.surs_hot_trend_week).length;
  return {
    prior_count:old.length,current_count:current.length,
    retained:shared.length,added:current.length-shared.length,
    removed:old.length-shared.length,
    top10_overlap:current.slice(0,10).filter(x=>top10Before.has(id(x))).length,
    top20_overlap:current.slice(0,20).filter(x=>top20Before.has(id(x))).length,
    largest_shared_rank_move:moves.length?Math.max(...moves):0,
    mean_shared_rank_move:moves.length?
      Math.round(100*moves.reduce((a,b)=>a+b,0)/moves.length)/100:0,
    prev_top10_tmdb_trending:old10,current_top10_tmdb_trending:new10,
    large_churn:old.length>=12&&
      current.slice(0,10).filter(x=>top10Before.has(id(x))).length<=5,
    note:'Diagnostic only; churn is not evidence of viewer satisfaction.'
  };
}
function publicationGate(previous,next,status,{strict=false}={}) {
  const current=next?.items||[],havePrevious=
    Array.isArray(previous?.items)&&previous.items.length>=12&&
    previous.sources?.tmdb===true;
  const stats=drift(previous,next);
  const errors=[],warnings=[];
  if(strict&&(!status?.healthy)){
    errors.push('TMDB trending/discover lanes incomplete: '+
      (status?.failed_lanes||[]).join(','));
  }
  if(strict&&havePrevious&&stats.prev_top10_tmdb_trending>=6&&
    stats.current_top10_tmdb_trending===0)
    errors.push('TMDB trending vanished from all top-10 entries');
  if(stats.large_churn)warnings.push('top10_high_churn');
  if(stats.mean_shared_rank_move>=8)warnings.push('large_shared_rank_moves');
  if(havePrevious&&stats.prev_top10_tmdb_trending>=6&&
    stats.current_top10_tmdb_trending<4)
    warnings.push('top10_tmdb_trending_coverage_low');
  return {
    validated:errors.length===0,strict,errors,warnings,
    drift:stats,source_health:status
  };
}
function assertPublicationGate(gate) {
  if(gate?.validated!==true)
    throw Error('Hot Discovery source-integrity gate: '+
      (gate?.errors||['unknown reason']).join('; '));
  return true;
}
module.exports={LANES,evaluateTmdbPages,drift,publicationGate,
  assertPublicationGate};
