'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const hot=require('../scripts/hot-discovery.cjs');
const NOW=new Date('2026-11-09T10:00:00Z');
const day=n=>new Date(NOW.getTime()-n*86400000).toISOString().slice(0,10);
const movie=(id,age=40)=>({id,title:'Movie '+id,original_title:'Movie '+id,release_date:day(age),
  poster_path:'/p.jpg',vote_average:8.3,vote_count:900,popularity:120,genre_ids:[18]});
const detail=(id,age=40)=>({...movie(id,age),genres:[{id:18}],
  production_countries:[{iso_3166_1:'US'}],release_dates:{results:[]}});
test('US digital date is an actual premiere, never a future date',()=>{
  const m=detail(1,200);
  m.release_dates.results=[{iso_3166_1:'US',release_dates:[
    {type:3,release_date:day(200)+'T00:00:00Z'},
    {type:4,release_date:day(5)+'T00:00:00Z'}]}];
  assert.equal(hot.moviePremiere(m,NOW).date,day(5));
  assert.equal(hot.moviePremiere(m,NOW).kind,'digital');
  m.release_dates.results[0].release_dates[1].release_date='2027-01-01T00:00:00Z';
  assert.equal(hot.moviePremiere(m,NOW).date,day(200));
});
test('TV season premiere, not a random episode or season zero special',()=>{
  const t={first_air_date:day(900),last_episode_to_air:{air_date:day(2)},
    seasons:[{season_number:0,air_date:day(2)},{season_number:1,air_date:day(900)}]};
  assert.equal(hot.tvPremiere(t,NOW).kind,'series');
  t.seasons.push({season_number:2,air_date:day(15)});
  assert.equal(hot.tvPremiere(t,NOW).kind,'season');
  assert.equal(hot.tvPremiere(t,NOW).date,day(15));
});
test('Bayesian shrinkage respects vote reliability',()=>{
  assert.ok(hot.qualityFor({vote_average:8.3,vote_count:9000}).score>
    hot.qualityFor({vote_average:9.9,vote_count:12}).score);
});
test('score excludes stale items and highly popular confirmed weak items',()=>{
  const base={type:'movie',poster_path:'/x.jpg',popularity:100};
  const cards=[
    {...base,id:1,vote_average:5,vote_count:5000,surs_hot_premiere_date:day(7)},
    {...base,id:2,vote_average:8.4,vote_count:900,surs_hot_premiere_date:day(40)},
    {...base,id:3,vote_average:9.9,vote_count:5000,surs_hot_premiere_date:day(700)}];
  assert.deepEqual(hot.scoreCandidates(cards,{snapshots:[]},NOW,null).map(c=>c.id),[2]);
});
test('growth history starts neutral, then reflects observed change',()=>{
  const card={type:'movie',id:3,popularity:90};
  assert.equal(hot.growthFor(card,{snapshots:[]},NOW).score,.5);
  assert.equal(hot.growthFor(card,{snapshots:[]},NOW).measured,false);
  assert.ok(hot.growthFor(card,{snapshots:[{date:day(7),items:{'movie:3':{p:15}}}]},NOW).score>.5);
  const history=hot.nextHistory({snapshots:[{date:day(40),items:{}}]},
    [card],NOW);
  assert.equal(history.snapshots.length,1);
});
test('feed validation rejects duplicates and future release dates',()=>{
  const feed={schema:1,generated_at:NOW.toISOString(),items:
    Array.from({length:12},(_,i)=>({id:50+i,type:'movie',poster_path:'/p.jpg',
      surs_hot_premiere_date:day(2),surs_hot_score:77}))};
  assert.equal(hot.validateFeed(feed,NOW),true);
  feed.items[1].id=50;
  assert.throws(()=>hot.validateFeed(feed,NOW),/Invalid item/);
});
test('Discovery includes low-vote films, Trending, digital and season searches',()=>{
  const jobs=hot.discoveryJobs(NOW);
  assert.ok(jobs.some(x=>x.channel==='digital'&&x.url.includes('with_release_type=4')));
  assert.ok(jobs.some(x=>x.channel==='season'));
  assert.ok(jobs.some(x=>x.channel==='trending_week'&&x.type==='movie'));
  assert.ok(jobs.some(x=>x.channel==='discover_primary_release_date.desc'&&
    !x.url.includes('vote_count.gte')));
});
test('MDBList IMDb and critic scores are normalized with distinct source identities',()=>{
  const r=hot.parseMdb({ratings:[{source:'imdb',value:8.5,votes:5000},
    {source:'metacritic',value:80,votes:45},{source:'letterboxd',value:4.2,votes:1000}]});
  assert.equal(r.imdb.value,8.5);assert.equal(r.metacritic.value,8);
  assert.equal(r.letterboxd.value,8.4);
});
test('Mocked complete pipeline publishes US movies/TV as normalized Lampa cards',async()=>{
  const seen=[];
  const transport=async url=>{
    seen.push(url);
    const p=new URL(url).pathname;
    if(p.includes('/trending/')||p.includes('/discover/')){
      const tv=p.includes('/tv');
      return {results:Array.from({length:18},(_,i)=>tv?
        {id:2000+i,name:'Series '+i,first_air_date:day(50),poster_path:'/p.jpg',
          origin_country:['US'],genre_ids:[18],popularity:80,
          vote_average:8.2,vote_count:1100}:movie(1000+i)),total_pages:1};
    }
    if(p.includes('/movie/'))return detail(Number(p.split('/').pop()));
    if(p.includes('/tv/')){
      const id=Number(p.split('/').pop());
      return {id,name:'Series '+id,first_air_date:day(50),poster_path:'/p.jpg',
        origin_country:['US'],genres:[{id:18}],vote_average:8.2,
        vote_count:1100,popularity:80,seasons:[{season_number:1,air_date:day(50)}]};
    }
    return null;
  };
  const result=await hot.build({now:NOW,tmdbToken:'sample-token',transport,
    history:{snapshots:[]},detailLimit:80});
  assert.equal(result.feed.items.length,36);
  assert.equal(result.feed.mode,'primary');
  assert.equal(result.feed.algorithm,'hot-discovery-4.1');
  assert.equal(result.feed.diagnostics.quality_floor,7.2);
  assert.ok(result.feed.items.some(x=>x.type==='movie'));
  assert.ok(result.feed.items.some(x=>x.type==='tv'));
  assert.ok(result.feed.items.every(x=>x.source==='tmdb'&&x.surs_hot_rank));
  assert.ok(!JSON.stringify(result.feed).includes('sample-token'));
  assert.equal(result.history.snapshots.length,1);
  assert.ok(seen.some(x=>x.includes('trending/movie/week')));
});
test('No credentials or insufficient data never create synthetic published feed',async()=>{
  await assert.rejects(hot.build({now:NOW,transport:async()=>({results:[]})}),/Missing TMDB/);
  await assert.rejects(hot.build({now:NOW,tmdbToken:'sample-token',
    transport:async()=>({results:[]})}),/Invalid Hot Discovery feed/);
});

test('hot ranking strictly follows the visible score without a hidden diversity shuffle',()=>{
  const basic={type:'movie',poster_path:'/p',vote_average:8.6,vote_count:4000,
    surs_hot_premiere_date:day(45)};
  const rows=Array.from({length:20},(_,i)=>({...basic,id:700+i,popularity:10+i*5}));
  const output=hot.scoreCandidates(rows,{snapshots:[]},NOW,null);
  assert.equal(output.length,20);
  for(let i=1;i<output.length;i++)
    assert.ok(output[i-1].surs_hot_score>=output[i].surs_hot_score);
});
test('a new digital listing does not reclassify decades-old movies as a new release',()=>{
  const m=detail(975,800);
  m.release_dates.results=[{iso_3166_1:'US',release_dates:[
    {type:4,release_date:day(4)+'T00:00:00Z'}]}];
  const premiere=hot.moviePremiere(m,NOW);
  const cards=[{...m,type:'movie',surs_hot_premiere_date:premiere.date,
    surs_hot_original_date:premiere.original,surs_hot_premiere_kind:'digital'}];
  assert.equal(hot.scoreCandidates(cards,{snapshots:[]},NOW,null).length,0);
});

test('growth measures independent 3, 7 and 14 day periods without inventing missing history',()=>{
  const c={type:'movie',id:111,popularity:90};
  const history={snapshots:[3,7,14].map(n=>({
    date:day(n),items:{'movie:111':{p:10+n,v:100}}
  }))};
  const g=hot.growthFor(c,history,NOW);
  assert.equal(g.measured,true);
  assert.equal(Object.keys(g.periods).length,3);
  assert.ok(g.periods['3d']>.5&&g.periods['7d']>.5&&g.periods['14d']>.5);
  const stale=hot.growthFor(c,{snapshots:[{
    date:day(30),items:{'movie:111':{p:3}}
  }]},NOW);
  assert.equal(stale.measured,false);
});

test('first US digital date wins over a later digital re-release',()=>{
  const m=detail(976,220);
  m.release_dates.results=[{iso_3166_1:'US',release_dates:[
    {type:3,release_date:day(220)+'T00:00:00Z'},
    {type:4,release_date:day(160)+'T00:00:00Z'},
    {type:4,release_date:day(3)+'T00:00:00Z'}]}];
  assert.equal(hot.moviePremiere(m,NOW).date,day(160));
  assert.equal(hot.moviePremiere(m,NOW).kind,'digital');
});
test('quality and vote evidence gate excludes inflated TMDB scores',()=>{
  const make=(id,rating,votes)=>({id,type:'movie',poster_path:'/p',
    vote_average:rating,vote_count:votes,popularity:100,
    surs_hot_premiere_date:day(12)});
  const selected=hot.scoreCandidates([
    make(1,9.9,12),make(2,6.9,5000),
    make(3,8.4,120),make(4,8.6,1000)
  ],{snapshots:[]},NOW,null);
  assert.deepEqual(new Set(selected.map(x=>x.id)),new Set([3,4]));
});
test('early IMDb-backed premiere may pass a narrow evidence exception',()=>{
  const card={id:5,type:'movie',poster_path:'/p',vote_average:9,
    vote_count:70,popularity:100,surs_hot_premiere_date:day(10),
    surs_hot_trend_day:9};
  assert.equal(hot.scoreCandidates([{...card}],{snapshots:[]},NOW,null).length,0);
  const backed={...card,surs_hot_ratings:{imdb:{value:8.8,votes:5000}}};
  const selected=hot.scoreCandidates([backed],{snapshots:[]},NOW,null);
  assert.equal(selected.length,1);
  assert.equal(selected[0].surs_hot_provisional,true);
});
test('new season is verified by actually aired regular episodes, not summary',()=>{
  const c={type:'tv',id:22,surs_hot_season:2,
    surs_hot_premiere_kind:'season',surs_hot_premiere_date:day(2)};
  assert.equal(hot.verifySeason(c,{season_number:2,episodes:[
    {episode_number:1,air_date:day(-7),vote_count:0},
    {episode_number:2,air_date:day(-3),vote_count:0}
  ]},NOW),false);
  assert.equal(hot.verifySeason(c,{season_number:2,episodes:[
    {episode_number:1,air_date:day(45),vote_count:30,vote_average:8.7},
    {episode_number:2,air_date:day(5),vote_count:15,vote_average:8.1},
    {episode_number:3,air_date:day(-5),vote_count:900,vote_average:10}
  ]},NOW),true);
  assert.equal(c.surs_hot_premiere_date,day(45));
  assert.equal(c.surs_hot_season_rating.votes,45);
  assert.equal(c.surs_hot_episodes_released,2);
});
test('old returning series cannot enter without verified new season',()=>{
  const card={type:'tv',id:777,poster_path:'/p',popularity:200,
    surs_hot_premiere_kind:'season',surs_hot_premiere_date:day(10),
    vote_average:9,vote_count:5000,surs_hot_trend_day:3,
    surs_hot_original_date:day(3000)};
  assert.equal(hot.scoreCandidates([card],{snapshots:[]},NOW,null).length,0);
  assert.equal(hot.eligibilityReason(card,NOW),'original_too_old');
  const recent={...card,surs_hot_original_date:day(200),
    surs_hot_season_verified:false};
  hot.scoreCandidates([recent],{snapshots:[]},NOW,null);
  assert.equal(hot.eligibilityReason(recent,NOW),'season_not_verified');
});
test('weights omit unmeasured growth instead of adding neutral scores',()=>{
  const card=()=>({type:'movie',id:42,poster_path:'/p',popularity:90,
    vote_average:8.4,vote_count:900,surs_hot_premiere_date:day(60)});
  const noHistory=hot.scoreCandidates([card()],{snapshots:[]},NOW,null)[0];
  assert.deepEqual(noHistory.surs_hot_weights,{quality:.70,heat:.30,growth:0});
  const measured=hot.scoreCandidates([card()],{snapshots:[{
    date:day(7),items:{'movie:42':{p:20}}
  }]},NOW,null)[0];
  assert.deepEqual(measured.surs_hot_weights,{quality:.60,heat:.25,growth:.15});
  assert.equal(measured.surs_hot_growth_measured,true);
});
