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
  assert.equal(result.feed.algorithm,'hot-discovery-4.11');
  assert.equal(result.feed.diagnostics.ranking_model,
    'source-aware-demand-first-v4.11-integrity');
  assert.equal(result.audit.candidate_total,36);
  assert.equal(result.audit.candidates.length,36);
  assert.equal(result.feed.diagnostics.primary_window_days,60);
  assert.equal(result.feed.diagnostics.active_model,'demand');
  assert.deepEqual(Object.keys(result.feed.diagnostics.selected_by_recency),
    ['0-60','61-120','121-365','366+']);
  assert.equal(result.feed.diagnostics.quality_floor,7.2);
  assert.equal(result.feed.diagnostics.weights_with_growth.quality,30);
  assert.equal(result.feed.diagnostics.weights_without_growth.attention,60);
  assert.equal(result.feed.diagnostics.rating_coverage.kinopoisk,0);
  assert.ok(result.feed.diagnostics.selected_by_kind.movie>0);
  assert.ok(result.feed.diagnostics.selected_by_kind.new_tv>0);
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

test('Hot Score is an unchanged quantitative metric despite editorial order',()=>{
  const basic={type:'movie',poster_path:'/p',vote_average:8.6,vote_count:4000,
    surs_hot_premiere_date:day(45)};
  const rows=Array.from({length:20},(_,i)=>({...basic,id:700+i,popularity:10+i*5}));
  const output=hot.scoreCandidates(rows,{snapshots:[]},NOW,null);
  assert.equal(output.length,20);
  for(let i=0;i<output.length;i++){
    assert.equal(output[i].surs_hot_rank,i+1);
    assert.equal(output[i].surs_hot_score,
      Math.round(output[i].surs_hot_base_score*100)/100);
  }
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
test('long-running series only enters on a verified recent season',()=>{
  const card={type:'tv',id:777,poster_path:'/p',popularity:200,
    surs_hot_premiere_kind:'season',surs_hot_premiere_date:day(10),
    vote_average:9,vote_count:5000,surs_hot_trend_day:3,
    surs_hot_original_date:day(3000)};
  assert.equal(hot.scoreCandidates([card],{snapshots:[]},NOW,null).length,0);
  assert.equal(hot.eligibilityReason(card,NOW),'season_not_verified');
  const recent={...card,surs_hot_original_date:day(200),
    surs_hot_season_verified:false};
  hot.scoreCandidates([recent],{snapshots:[]},NOW,null);
  assert.equal(hot.eligibilityReason(recent,NOW),'season_not_verified');
  const verified={...card,surs_hot_season_verified:true};
  assert.equal(hot.scoreCandidates([verified],{snapshots:[]},NOW,null).length,1);
  assert.equal(verified.surs_hot_recency_tier,0);
});
test('weights omit unmeasured growth instead of adding neutral scores',()=>{
  const card=()=>({type:'movie',id:42,poster_path:'/p',popularity:90,
    vote_average:8.4,vote_count:900,surs_hot_premiere_date:day(60)});
  const noHistory=hot.scoreCandidates([card()],{snapshots:[]},NOW,null)[0];
  assert.deepEqual(noHistory.surs_hot_weights,{attention:.55,quality:.40,freshness:.05,growth:0});
  const measured=hot.scoreCandidates([card()],{snapshots:[{
    date:day(7),items:{'movie:42':{p:20}}
  }]},NOW,null)[0];
  assert.deepEqual(measured.surs_hot_weights,{attention:.45,quality:.35,freshness:.05,growth:.15});
  assert.equal(measured.surs_hot_growth_measured,true);
});

test('discovery prioritizes recent 60-day film and series lanes without discarding old sources',()=>{
  const jobs=hot.discoveryJobs(NOW);
  assert.ok(jobs.length>40);
  assert.ok(jobs.slice(0,12).every(x=>x.channel.startsWith('recent_')));
  assert.ok(jobs.some(x=>x.channel==='recent_digital'));
  assert.ok(jobs.some(x=>x.channel==='recent_season'));
  assert.ok(jobs.some(x=>x.channel==='trending_week'&&x.type==='movie'));
  assert.ok(jobs.some(x=>x.channel==='digital'));
});
test('smooth freshness lets stronger demand beat merely newer releases',()=>{
  const make=(id,age,rating=8.3)=>({id,type:'movie',poster_path:'/p',
    vote_average:rating,vote_count:2000,popularity:120,
    surs_hot_premiere_date:day(age),surs_hot_original_date:day(age)});
  const recent=make(5,10,7.8);
  const older={...make(3,90,8.4),popularity:400,
    surs_hot_trend_day:2,surs_hot_trend_week:3};
  const rows=hot.scoreCandidates([recent,older],{snapshots:[]},NOW,null);
  assert.deepEqual(rows.map(x=>x.id),[3,5]);
  assert.ok(Math.abs(hot.scoreCandidates([
    make(60,60),make(61,61)],{snapshots:[]},NOW,null)[0].surs_hot_freshness-
    hot.scoreCandidates([make(60,60),make(61,61)],
      {snapshots:[]},NOW,null)[1].surs_hot_freshness)<.01);
});
test('late digital US listing does not reset an older original premiere',()=>{
  const late={id:431,type:'movie',poster_path:'/p',
    vote_average:9,vote_count:5000,popularity:200,
    surs_hot_premiere_date:day(5),surs_hot_original_date:day(210),
    surs_hot_first_us_release_date:day(5),
    surs_hot_premiere_kind:'digital',surs_hot_trend_day:3};
  const fresh={id:432,type:'movie',poster_path:'/p',
    vote_average:8.3,vote_count:500,popularity:35,
    surs_hot_premiere_date:day(12),surs_hot_original_date:day(20),
    surs_hot_premiere_kind:'theatrical'};
  const ordered=hot.scoreCandidates([late,fresh],{snapshots:[]},NOW,null);
  assert.equal(ordered.length,2);
  const old=ordered.find(x=>x.id===431);
  assert.equal(old.surs_hot_age,5);
  assert.equal(old.surs_hot_rank_age,210);
  assert.equal(old.surs_hot_recency_tier,2);
});
test('day 60/61,120/121,365/366 do not create sudden score gaps',()=>{
  const card=(id,age)=>({id,type:'movie',poster_path:'/p',
    vote_average:8.2,vote_count:700,popularity:100,
    surs_hot_trend_day:3,surs_hot_trend_week:4,
    surs_hot_kinopoisk_popularity_rank:5,
    surs_hot_premiere_date:day(age),surs_hot_original_date:day(age)});
  const rows=hot.scoreCandidates([card(60,60),card(61,61),
    card(120,120),card(121,121),card(365,365),card(366,366)],
    {snapshots:[]},NOW,null);
  assert.equal(rows.length,6);
  const byId=new Map(rows.map(x=>[x.id,x]));
  for(const [a,b] of [[60,61],[120,121],[365,366]]){
    assert.ok(Math.abs(byId.get(a).surs_hot_score-
      byId.get(b).surs_hot_score)<1.5);
    assert.ok(byId.get(a).surs_hot_rank_age+1===byId.get(b).surs_hot_rank_age);
  }
});
test('high current buzz can rescue mixed reviews, not a poorly rated or unverified title',()=>{
  const make=(id,rating,trends)=>({id,type:'movie',
    poster_path:'/p',vote_average:rating,vote_count:1500,
    popularity:trends?500:40,surs_hot_premiere_date:day(12),
    surs_hot_original_date:day(12),
    surs_hot_trend_day:trends?2:null,
    surs_hot_trend_week:trends?3:null});
  const candidates=[make(1,6.9,true),make(2,5.2,true),
    make(3,6.9,false),make(4,8.2,false)];
  const rows=hot.scoreCandidates(candidates,{snapshots:[]},NOW,null);
  assert.ok(rows.some(x=>x.id===1));
  assert.equal(rows.find(x=>x.id===1).surs_hot_track,'breakout');
  assert.ok(!rows.some(x=>x.id===2||x.id===3));
  assert.ok(rows.some(x=>x.id===4));
});
test('24h snapshot measures audience momentum without fabricating playback counts',()=>{
  const c={id:80,type:'movie',popularity:160,vote_count:1500};
  const history={snapshots:[{date:day(1),
    items:{'movie:80':{p:50,v:900}}}]};
  const g=hot.growthFor(c,history,NOW);
  assert.equal(g.measured,true);
  assert.ok(g.periods['1d']>.5);
  assert.equal(Object.keys(g.periods).length,1);
  assert.equal(hot.growthFor(c,{snapshots:[]},NOW).measured,false);
});
test('current attention outranks legacy popularity in the same premiere band',()=>{
  const base={type:'tv',poster_path:'/p',vote_average:8.3,
    vote_count:2000,surs_hot_premiere_kind:'series',
    surs_hot_premiere_date:day(15),surs_hot_original_date:day(15)};
  const buzz={...base,id:81,popularity:200,surs_hot_trend_day:2,
    surs_hot_trend_week:3};
  const old={...base,id:82,popularity:240};
  const rows=hot.scoreCandidates([old,buzz],{snapshots:[]},NOW,null);
  assert.deepEqual(rows.map(x=>x.id),[81,82]);
  assert.ok(rows[0].surs_hot_attention>rows[1].surs_hot_attention);
  assert.equal(rows[1].surs_hot_attention_sources,0);
});
test('season variety is soft and does not fabricate a monotonic score',()=>{
  const raw=[];
  for(let i=0;i<22;i++)raw.push({
    id:3000+i,type:'tv',poster_path:'/p',vote_average:9.2,
    vote_count:9000,popularity:600-i*3,
    surs_hot_premiere_kind:'season',surs_hot_season_verified:true,
    surs_hot_season_rating:{value:8.8,votes:110},
    surs_hot_premiere_date:day(10),surs_hot_original_date:day(1800),
    surs_hot_trend_day:i+1,surs_hot_trend_week:i+1});
  for(let i=0;i<26;i++)raw.push({
    id:5000+i,type:'movie',poster_path:'/p',vote_average:8.3,
    vote_count:1300,popularity:110-i,
    surs_hot_premiere_kind:'theatrical',
    surs_hot_premiere_date:day(15),surs_hot_original_date:day(15),
    surs_hot_trend_day:i+1,surs_hot_trend_week:i+1});
  const rows=hot.scoreCandidates(raw,{snapshots:[]},NOW,null);
  assert.equal(rows.length,40);
  assert.equal(new Set(rows.map(x=>x.type+':'+x.id)).size,40);
  assert.ok(rows.filter(x=>x.type==='movie').length>0);
  assert.ok(rows.filter(x=>x.type==='tv').length>0);
  assert.ok(rows.every(x=>x.surs_hot_score===
    Math.round(x.surs_hot_base_score*100)/100));
});
test('returning series are not discarded when there are too few alternatives',()=>{
  const tv=Array.from({length:15},(_,i)=>({
    id:9000+i,type:'tv',poster_path:'/p',vote_average:8.8,
    vote_count:2000,popularity:200-i,
    surs_hot_premiere_kind:'season',surs_hot_season_verified:true,
    surs_hot_season_rating:{value:8.5,votes:120},
    surs_hot_premiere_date:day(12),surs_hot_original_date:day(900)
  }));
  const ranked=hot.scoreCandidates(tv,{snapshots:[]},NOW,null);
  assert.equal(ranked.length,15);
  assert.equal(ranked.filter(x=>x.surs_hot_premiere_kind==='season').length,15);
});
test('a stale 200-day movie needs current interest rather than ratings alone',()=>{
  const now={type:'movie',id:400,poster_path:'/p',
    vote_average:7.8,vote_count:900,popularity:90,
    surs_hot_premiere_date:day(20),surs_hot_original_date:day(20)};
  const old={...now,id:401,vote_average:9.3,
    vote_count:18000,popularity:800,
    surs_hot_premiere_date:day(200),surs_hot_original_date:day(200)};
  const stale=hot.scoreCandidates([old,now],{snapshots:[]},NOW,null);
  assert.deepEqual(stale.map(x=>x.id),[400]);
  const trending={...old,surs_hot_trend_day:1,surs_hot_trend_week:3};
  const recovered=hot.scoreCandidates([trending,{...now}],
    {snapshots:[]},NOW,null);
  assert.deepEqual(recovered.map(x=>x.id),[401,400]);
});
test('Kinopoisk API is matched only by exact IMDb ID, not a translated title',()=>{
  const id='tt1234567';
  const rows={total:2,items:[
    {imdbId:'tt7654321',kinopoiskId:33,ratingKinopoisk:9.8,
      ratingKinopoiskVoteCount:20000,nameRu:'Совпало название'},
    {imdbId:id,kinopoiskId:44,ratingKinopoisk:8.1,
      ratingKinopoiskVoteCount:4200,ratingImdb:8.2,ratingImdbVoteCount:5300}
  ]};
  assert.deepEqual(hot.parseKinopoisk(rows,id),{
    kp:{value:8.1,votes:4200,via:'kinopoisk_unofficial',kinopoisk_id:44},
    imdb:{value:8.2,votes:5300,via:'kinopoisk_unofficial'}
  });
  assert.deepEqual(hot.parseKinopoisk(rows,'tt9999999'),{});
  assert.deepEqual(hot.parseKinopoisk({items:[{
    imdbId:id,ratingKinopoisk:8.6,ratingKinopoiskVoteCount:0}]},id),{});
});
test('Kinopoisk search omits votes; details are verified with exact IMDb ID',()=>{
  const id='tt1234567',result={items:[{imdbId:id,kinopoiskId:301,
    ratingKinopoisk:8.2,ratingImdb:8.1}]};
  assert.equal(hot.matchedKpSearchRow(result,id).kinopoiskId,301);
  assert.deepEqual(hot.parseKinopoisk(result,id),{});
  assert.deepEqual(hot.parseKinopoisk({
    imdbId:id,kinopoiskId:301,ratingKinopoisk:8.2,
    ratingKinopoiskVoteCount:1400,ratingImdb:8.1,
    ratingImdbVoteCount:1900},id),{
      kp:{value:8.2,votes:1400,via:'kinopoisk_unofficial',kinopoisk_id:301},
      imdb:{value:8.1,votes:1900,via:'kinopoisk_unofficial'}});
  assert.deepEqual(hot.parseKinopoisk({
    imdbId:'tt7654321',kinopoiskId:301,
    ratingKinopoisk:9,ratingKinopoiskVoteCount:10000},id),{});
});
test('three high agreeing ratings beat two; three mediocre ones earn no bonus',()=>{
  const base={vote_average:8.3,vote_count:6000};
  const three={...base,surs_hot_ratings:{
    imdb:{value:8.2,votes:15000},kp:{value:8.25,votes:50000}
  }};
  const two={...base,surs_hot_ratings:{imdb:{value:8.2,votes:15000}}};
  const low={vote_average:6.1,vote_count:6000,surs_hot_ratings:{
    imdb:{value:6.2,votes:8000},kp:{value:6.15,votes:9000}
  }};
  const a=hot.qualityFor(three),b=hot.qualityFor(two),
    c=hot.qualityFor(low);
  assert.equal(a.agreement.level,'triple_high');
  assert.equal(a.agreement.bonus,.38);
  assert.equal(b.agreement.level,'pair_high');
  assert.equal(b.agreement.bonus,.16);
  assert.ok(a.score>b.score);
  assert.equal(c.agreement.bonus,0);
  assert.ok(c.score<7.2);
});
test('disagreement never creates agreement bonus and season history cannot masquerade as season consensus',()=>{
  const divergent={vote_average:8.8,vote_count:3000,
    surs_hot_ratings:{imdb:{value:6.5,votes:4500},kp:{value:6.4,votes:4500}}};
  const d=hot.qualityFor(divergent);
  assert.equal(d.agreement.level,'disputed');
  assert.equal(d.agreement.bonus,0);
  const season=hot.qualityFor({...divergent,surs_hot_premiere_kind:'season',
    surs_hot_season_rating:{value:8.4,votes:100}});
  assert.equal(season.agreement.bonus,0);
});
test('one-day movement is not yet 15 percent confirmed growth',()=>{
  const card={type:'movie',id:77,poster_path:'/p',vote_average:8.5,
    vote_count:3000,popularity:130,surs_hot_premiere_date:day(8)};
  const one=hot.scoreCandidates([{...card}],{snapshots:[{date:day(1),
    items:{'movie:77':{p:50,v:2000}}}]},NOW,null)[0];
  assert.equal(one.surs_hot_growth_measured,true);
  assert.equal(one.surs_hot_growth_confirmed,false);
  assert.deepEqual(one.surs_hot_weights,
    {attention:.55,quality:.40,freshness:.05,growth:0});
  const three=hot.scoreCandidates([{...card}],{snapshots:[{date:day(3),
    items:{'movie:77':{p:50,v:2000}}}]},NOW,null)[0];
  assert.equal(three.surs_hot_growth_confirmed,true);
  assert.deepEqual(three.surs_hot_weights,
    {attention:.45,quality:.35,freshness:.05,growth:.15});
});
test('full pipeline combines verified KP and IMDb scores and audits all candidates',async()=>{
  let lastKpImdbId='';
  const transport=async(url,headers={})=>{
    const parsed=new URL(url),pathname=parsed.pathname;
    if(url.startsWith('https://kinopoiskapiunofficial.tech/')){
      assert.equal(headers['X-API-KEY'],'kp-fixture');
      if(pathname.endsWith('/230'))return {
        imdbId:lastKpImdbId,kinopoiskId:230,
        ratingKinopoisk:8.2,ratingKinopoiskVoteCount:5000,
        ratingImdb:8.1,ratingImdbVoteCount:9000};
      lastKpImdbId=parsed.searchParams.get('imdbId');
      return {items:[{imdbId:lastKpImdbId,kinopoiskId:230,
        ratingKinopoisk:8.2,ratingImdb:8.1}]};
    }
    if(url.startsWith('https://api.mdblist.com/')){
      const id=Number(pathname.split('/').filter(Boolean).at(-1));
      return {ids:{tmdb:id},ratings:[{source:'imdb',value:8.15,votes:10000}]};
    }
    if(pathname.includes('/trending/')||pathname.includes('/discover/')){
      const tv=pathname.includes('/tv');
      return {results:Array.from({length:18},(_,i)=>tv?
        {id:2000+i,name:'Series '+i,genre_ids:[18],poster_path:'/p',
          popularity:90,vote_average:8.2,vote_count:1200}:
        movie(1000+i))};
    }
    const id=Number(pathname.split('/').pop()),imdbId='tt'+String(id).padStart(7,'0');
    if(pathname.includes('/movie/'))return {...detail(id),imdb_id:imdbId};
    if(pathname.includes('/tv/'))return {id,name:'TV '+id,first_air_date:day(30),
      poster_path:'/p',origin_country:['US'],genres:[{id:18}],
      popularity:90,vote_average:8.2,vote_count:1500,
      external_ids:{imdb_id:imdbId},seasons:[{season_number:1,air_date:day(30)}]};
    return null;
  };
  const result=await hot.build({now:NOW,tmdbToken:'sample-token',
    mdblistKey:'mdb-fixture',kinopoiskKey:'kp-fixture',
    transport,history:{snapshots:[]},detailLimit:80});
  assert.equal(result.feed.algorithm,'hot-discovery-4.11');
  assert.equal(result.audit.candidate_total,36);
  assert.equal(result.audit.candidates.length,36);
  assert.ok(result.feed.diagnostics.kp_calls>0);
  assert.ok(result.feed.diagnostics.kp_matched>0);
  assert.ok(result.feed.diagnostics.kp_detail_calls>0);
  assert.ok(result.feed.diagnostics.kp_search_calls>0);
  assert.ok(result.feed.diagnostics.kp_calls<=45);
  assert.ok(Object.keys(result.kpCache.entries).length>0);
  const cached=await hot.build({now:NOW,tmdbToken:'sample-token',
    mdblistKey:'mdb-fixture',kinopoiskKey:'kp-fixture',
    kpCache:result.kpCache,transport,history:{snapshots:[]},detailLimit:80});
  assert.ok(cached.feed.diagnostics.kp_cache_hits>0);
  assert.ok(cached.feed.diagnostics.rating_coverage.kinopoisk>=
    result.feed.diagnostics.rating_coverage.kinopoisk);
  assert.ok(cached.feed.diagnostics.kp_calls<=45);
  assert.ok(!JSON.stringify(cached.kpCache).includes('kp-fixture'));
  assert.ok(result.feed.diagnostics.mdblist_calls>0);
  assert.ok(result.feed.diagnostics.rating_coverage.triple>0);
  assert.ok(result.feed.items.some(x=>x.surs_hot_rating_agreement.level==='triple_high'));
  assert.ok(result.audit.candidates.some(x=>x.kp&&x.imdb));
  assert.ok(!JSON.stringify(result.feed).includes('kp-fixture'));
  assert.ok(!JSON.stringify(result.audit).includes('mdb-fixture'));
});

test('independent Kinopoisk Popular rank increases attention only for verified matches',()=>{
  const base={type:'movie',poster_path:'/p',vote_average:8.2,
    vote_count:1700,popularity:75,surs_hot_premiere_date:day(12),
    surs_hot_original_date:day(12)};
  const first={...base,id:301,surs_hot_trend_day:4,
    surs_hot_trend_week:7,surs_hot_kinopoisk_popularity_rank:1};
  const second={...base,id:302,surs_hot_trend_day:4,
    surs_hot_trend_week:7};
  const a=hot.attentionFor(first,[first,second]);
  const b=hot.attentionFor(second,[first,second]);
  assert.ok(a.score>b.score);
  assert.ok(a.external_bonus>0&&a.external_bonus<=.16);
  assert.equal(a.external_rank,1);
  assert.equal(a.cross_confirmed,true);
  assert.equal(b.external_bonus,0);
  assert.equal(b.external_rank,null);
  assert.equal(b.score,b.tmdb_score);
  assert.equal(hot.externalPopularity({...first,
    surs_hot_kinopoisk_popularity_rank:0}).bonus,0);
  assert.equal(hot.externalPopularity({...first,
    surs_hot_kinopoisk_popularity_rank:900}).bonus,0);
});
test('new popularity source is optional, cached and never counted as film views',async()=>{
  const NOW_DATE=new Date(NOW);
  const smallFixture=Array.from({length:12},(_,i)=>({
    id:2000+i,type:'movie',poster_path:'/p',vote_average:8.3,
    vote_count:1500,popularity:100-i,genre_ids:[18],
    release_date:day(15),title:'Candidate '+i}));
  let collectionCalls=0;
  const transport=async(url,headers={})=>{
    const u=new URL(url),pathname=u.pathname;
    if(pathname.endsWith('/collections')){
      collectionCalls++;
      assert.equal(headers['X-API-KEY'],'kp-test');
      return {total:3,totalPages:1,items:[
        {kinopoiskId:30001},{kinopoiskId:30002},{kinopoiskId:30003}]};
    }
    if(url.startsWith('https://kinopoiskapiunofficial.tech/')){
      if(pathname.endsWith('/30001'))return {imdbId:'tt1002000',
        kinopoiskId:30001,ratingKinopoisk:8.3,
        ratingKinopoiskVoteCount:9000};
      if(pathname.endsWith('/30002'))return {imdbId:'tt1002001',
        kinopoiskId:30002,ratingKinopoisk:8.3,
        ratingKinopoiskVoteCount:9000};
      return {items:[{imdbId:u.searchParams.get('imdbId'),
        kinopoiskId:u.searchParams.get('imdbId')==='tt1002000'?30001:
          u.searchParams.get('imdbId')==='tt1002001'?30002:30003}]};
    }
    if(pathname.includes('/trending/')||pathname.includes('/discover/'))
      return {results:smallFixture};
    if(pathname.includes('/movie/')){
      const id=Number(pathname.split('/').pop());
      return {id,imdb_id:'tt'+String(id+1000000),title:'Candidate '+(id-2000),
        release_date:day(15),poster_path:'/p',
        production_countries:[{iso_3166_1:'US'}],
        release_dates:{results:[{iso_3166_1:'US',
          release_dates:[{type:3,release_date:day(15)}]}]},
        genres:[{id:18}],vote_average:8.3,vote_count:1500,popularity:100};
    }
    return null;
  };
  const first=await hot.build({now:NOW_DATE,tmdbToken:'test',
    kinopoiskKey:'kp-test',transport,history:{snapshots:[]},detailLimit:24});
  assert.equal(first.feed.algorithm,'hot-discovery-4.11');
  assert.equal(first.kpCache.popular_history.length,1);
  assert.equal(first.kpCache.rating_history.length,1);
  assert.equal(first.feed.sources.kinopoisk_popularity,true);
  assert.equal(first.feed.diagnostics.kp_popularity_calls,1);
  assert.ok(first.feed.diagnostics.kp_popularity_matched>0);
  assert.ok(first.feed.diagnostics.external_demand.selected_matching>0);
  assert.equal(first.feed.diagnostics.external_demand.not_stream_count,true);
  assert.equal(collectionCalls,1);
  const second=await hot.build({now:NOW_DATE,tmdbToken:'test',
    kinopoiskKey:'kp-test',transport,history:{snapshots:[]},
    kpCache:first.kpCache,detailLimit:24});
  assert.equal(collectionCalls,1);
  assert.equal(second.feed.diagnostics.kp_popularity_calls,0);
  assert.equal(second.feed.diagnostics.kp_popularity_cache_hit,true);
  assert.equal(second.feed.diagnostics.external_demand.available,true);
  assert.equal(second.feed.diagnostics.external_demand.selected_matching,
    first.feed.diagnostics.external_demand.selected_matching);
  const nextDay=await hot.build({now:new Date(NOW_DATE.getTime()+86400000),
    tmdbToken:'test',kinopoiskKey:'kp-test',transport,
    history:{snapshots:[]},kpCache:second.kpCache,detailLimit:24});
  assert.equal(nextDay.kpCache.popular_history.length,2);
  assert.ok(nextDay.feed.diagnostics.kp_vote_refresh_calls>=1);
  assert.ok(nextDay.feed.diagnostics.kp_calls<=45);
  assert.ok(nextDay.feed.diagnostics.comparison);
});
