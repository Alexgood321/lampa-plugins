'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const kp=require('../scripts/kp-demand-history.cjs');
const hot=require('../scripts/hot-discovery.cjs');
const NOW=new Date('2026-11-14T09:00:00Z');
const date=n=>new Date(NOW.getTime()-n*86400000).toISOString().slice(0,10);

test('KP daily rank history migrates v4.5 and retains exact 14-day horizon',()=>{
  const existing=Array.from({length:19},(_,i)=>({
    date:date(19-i),entries:[{id:42,rank:40-i}]}));
  const rows=kp.snapshots(existing,NOW,'rank',{
    fetched_at:NOW.toISOString(),entries:[{id:42,rank:7}]
  });
  assert.equal(rows.length,15);
  assert.equal(rows.at(0).date,date(14));
  assert.equal(rows.at(-1).date,date(0));
  assert.equal(rows.at(-1).entries[0].rank,7);
  assert.equal(kp.snapshots([{date:date(-1),entries:[{id:42,rank:1}]}],
    NOW,'rank').length,0);
});

test('KP rank deltas require two real dated top observations',()=>{
  const card={surs_hot_ratings:{kp:{kinopoisk_id:42}}};
  const ranks=kp.snapshots([
    {date:date(7),entries:[{id:42,rank:28}]},
    {date:date(3),entries:[{id:42,rank:18}]},
    {date:date(1),entries:[{id:42,rank:15}]},
    {date:date(0),entries:[{id:42,rank:7}]}
  ],NOW,'rank');
  const m=kp.momentum(card,ranks,[],NOW,NOW.toISOString());
  assert.equal(m.rank_deltas['1d'].delta,8);
  assert.equal(m.rank_deltas['3d'].delta,11);
  assert.equal(m.rank_deltas['7d'].delta,21);
  assert.equal(m.rank_deltas['14d'],undefined);
  const absent=kp.momentum({surs_hot_ratings:{kp:{kinopoisk_id:999}}},
    ranks,[],NOW,NOW.toISOString());
  assert.deepEqual(absent.rank_deltas,{});
  assert.equal(kp.extraBonus({
    surs_hot_kinopoisk_rank_deltas:absent.rank_deltas
  },.5,true),0);
});

test('KP vote growth uses exact independently dated observations',()=>{
  const card={surs_hot_ratings:{kp:{kinopoisk_id:42,votes:999999}}};
  const rows=kp.snapshots([
    {date:date(3),entries:[{id:42,votes:1000}]},
    {date:date(1),entries:[{id:42,votes:1200}]},
    {date:date(0),entries:[{id:42,votes:1380}]}
  ],NOW,'votes');
  const m=kp.momentum(card,[],rows,NOW);
  assert.equal(m.vote_growth['1d'].delta,180);
  assert.equal(m.vote_growth['3d'].delta,380);
  assert.equal(m.vote_growth['7d'],undefined);
  assert.deepEqual(kp.momentum(card,[],[],NOW).vote_growth,{});
  assert.deepEqual(kp.momentum(card,[],kp.snapshots([
    {date:date(5),entries:[{id:42,votes:1200}]}],NOW,'votes'),NOW).vote_growth,{});
});

test('KP evidence raises only bounded attention and never TMDB growth weights',()=>{
  const base={type:'movie',id:808,poster_path:'/p',vote_average:8.5,
    vote_count:3000,popularity:120,
    surs_hot_premiere_date:date(5),surs_hot_original_date:date(5),
    surs_hot_trend_day:8,surs_hot_trend_week:6,
    surs_hot_kinopoisk_popularity_rank:12};
  const neutral=hot.attentionFor(base,[base]);
  const rising={...base,
    surs_hot_kinopoisk_rank_deltas:{'1d':{delta:14}},
    surs_hot_kinopoisk_vote_growth:{'1d':{rate:.08}}};
  const boosted=hot.attentionFor(rising,[rising]);
  assert.ok(boosted.score>neutral.score);
  assert.ok(boosted.external_bonus<=.16);
  assert.ok(boosted.momentum_bonus>0);
  const falling=hot.attentionFor({...base,
    surs_hot_kinopoisk_rank_deltas:{'1d':{delta:-10}},
    surs_hot_kinopoisk_vote_growth:{'1d':{rate:-.04}}},[base]);
  assert.equal(falling.external_bonus,neutral.external_bonus);
  assert.deepEqual(
    hot.scoreCandidates([{...rising}],{snapshots:[]},NOW,null)[0].surs_hot_weights,
    {attention:.55,quality:.40,freshness:.05,growth:0});
});

test('top-40 comparison returns real membership and rank movements',()=>{
  const previous={items:[{type:'movie',id:1,title:'A'},
    {type:'movie',id:2,title:'B'},{type:'tv',id:3,title:'C'}]};
  const after=[{type:'tv',id:3,title:'C'},
    {type:'movie',id:1,title:'A'},{type:'movie',id:4,title:'D'}];
  const diff=kp.compareTop(previous,after);
  assert.equal(diff.retained,2);
  assert.equal(diff.added,1);
  assert.equal(diff.removed,1);
  assert.equal(diff.largest_rank_change,2);
  assert.equal(diff.top10_retained,2);
});
