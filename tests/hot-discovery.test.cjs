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
  assert.deepEqual(hot.growthFor(card,{snapshots:[]},NOW),{score:.5,measured:false});
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
  assert.equal(result.feed.mode,'shadow');
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
