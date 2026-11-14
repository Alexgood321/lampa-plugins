'use strict';
// Verified Kinopoisk popularity and rating-count observations for Hot Discovery.
// A missing top entry or an unobserved day is unknown, never a zero ranking.
const DAY=86400000;
const MAX_DAYS=14; // 15 dated observations allow exact 14-day comparisons.
const HORIZONS=[1,3,7,14];
const day=value=>{
  const s=String(value||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const date=Date.parse(s+'T00:00:00Z');
  return Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===s?s:null;
};
const age=(older,newer)=>Math.round((Date.parse(newer+'T00:00:00Z')-
  Date.parse(older+'T00:00:00Z'))/DAY);
const valueAt=(snapshot,id,key)=>snapshot?.entries?.find(x=>x.id===id)?.[key];
function snapshots(rows,now,key,legacy=null) {
  if(!['rank','votes'].includes(key))throw Error('Unsupported KP observation');
  const current=day(now instanceof Date?now.toISOString():now),unique=new Map();
  if(!current)throw Error('Invalid KP observation date');
  const accept=(date,entries,overwrite=true)=>{
    const observed=day(date);
    if(!observed||age(observed,current)<0||age(observed,current)>MAX_DAYS||
      !Array.isArray(entries))return;
    const seen=new Set(),valid=[];
    for(const entry of entries){
      const id=Number(entry?.id),value=Number(entry?.[key]);
      if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(value)||
        value<1||(key==='rank'&&value>60)||seen.has(id))continue;
      seen.add(id);valid.push({id,[key]:value});
    }
    if(valid.length&&(!unique.has(observed)||overwrite))
      unique.set(observed,{date:observed,entries:valid});
  };
  // One-day v4.5 popularity is promoted on upgrade without manufacturing history.
  if(legacy&&key==='rank')accept(legacy.fetched_at,legacy.entries,false);
  for(const row of Array.isArray(rows)?rows:[])
    if(row&&typeof row==='object')accept(row.date,row.entries);
  return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function momentum(card,rankHistory,voteHistory,now,rankAsOf=null){
  const id=Number(card?.surs_hot_ratings?.kp?.kinopoisk_id);
  const result={rank_deltas:{},vote_growth:{},rank_as_of:null,votes_as_of:null};
  if(!Number.isSafeInteger(id)||id<1)return result;
  const date=day(rankAsOf)||day(now instanceof Date?now.toISOString():now);
  const rankRows=Array.isArray(rankHistory)?rankHistory:[];
  const currentRank=valueAt(rankRows.find(x=>x.date===date),id,'rank');
  if(Number.isSafeInteger(currentRank)&&currentRank>0){
    result.rank_as_of=date;
    for(const horizon of HORIZONS){
      const older=rankRows.find(x=>age(x.date,date)===horizon);
      const prior=valueAt(older,id,'rank');
      if(Number.isSafeInteger(prior)&&prior>0)
        result.rank_deltas[horizon+'d']={delta:prior-currentRank,
          from:prior,to:currentRank,days:horizon};
    }
  }
  // Only independently fetched detail responses are persisted as vote samples.
  const currentDay=day(now instanceof Date?now.toISOString():now);
  const voteRows=(Array.isArray(voteHistory)?voteHistory:[]).slice().reverse();
  const recent=voteRows.find(x=>age(x.date,currentDay)>=0&&
    age(x.date,currentDay)<=2&&Number.isSafeInteger(valueAt(x,id,'votes')));
  const currentVotes=valueAt(recent,id,'votes');
  if(Number.isSafeInteger(currentVotes)&&currentVotes>0){
    result.votes_as_of=recent.date;
    for(const horizon of HORIZONS){
      const older=voteRows.find(x=>age(x.date,recent.date)===horizon);
      const prior=valueAt(older,id,'votes');
      if(Number.isSafeInteger(prior)&&prior>0)
        result.vote_growth[horizon+'d']={delta:currentVotes-prior,
          rate:Math.round((currentVotes-prior)/prior*100000)/100000,
          from:prior,to:currentVotes,days:horizon};
    }
  }
  return result;
}
function extraBonus(card,strength,confirmed){
  const deltas=Object.values(card.surs_hot_kinopoisk_rank_deltas||{});
  const changes=Object.values(card.surs_hot_kinopoisk_vote_growth||{});
  const rankRise=Math.min(1,Math.max(0,...deltas.map(x=>Number(x.delta)||0))/15);
  const votesRise=Math.min(1,Math.max(0,...changes.map(x=>Number(x.rate)||0))/.04);
  const cap=confirmed?.16:.10,base=strength*cap;
  // Account for new evidence inside the EXISTING cap; the 15% TMDB growth
  // component must not consume these Russian-market observations again.
  const requested=strength*((confirmed?.02:.012)*rankRise+
    (confirmed?.008:.004)*votesRise);
  return Math.max(0,Math.min(cap-base,requested));
}
function compareTop(previous,next){
  const before=Array.isArray(previous?.items)?previous.items.slice(0,40):[];
  const after=Array.isArray(next)?next.slice(0,40):[];
  const id=c=>c.type+':'+c.id;
  const oldRanks=new Map(before.map((c,i)=>[id(c),i+1]));
  const afterIds=new Set(after.map(id));
  const retained=after.filter(c=>oldRanks.has(id(c))).length;
  const moves=after.filter(c=>oldRanks.has(id(c))).map(c=>
    Math.abs(oldRanks.get(id(c))-(after.findIndex(x=>id(x)===id(c))+1)));
  return {previous_count:before.length,new_count:after.length,retained,
    added:after.length-retained,
    removed:before.filter(c=>!afterIds.has(id(c))).length,
    top10_retained:after.slice(0,10).filter(c=>
      before.slice(0,10).some(p=>id(p)===id(c))).length,
    largest_rank_change:moves.length?Math.max(...moves):0,
    top10_before:before.slice(0,10).map(c=>({id:id(c),title:c.title||c.name})),
    top10_after:after.slice(0,10).map(c=>({id:id(c),title:c.title||c.name}))};
}
module.exports={snapshots,momentum,extraBonus,compareTop};
