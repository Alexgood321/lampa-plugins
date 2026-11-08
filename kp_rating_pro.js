/**
 * KP Rating Pro for Lampa v1.0.0
 * Global, lazy Kinopoisk ratings for standard Lampa posters.
 * Original implementation by Alexgood321. Does not copy rating.js or its credentials.
 * Uses the installed Lampa.Api.sources.KP and reuses the existing rating.js cache.
 */
(function () {
    'use strict';
    if (window.kp_rating_pro_initialized) return;
    window.kp_rating_pro_initialized = true;

    var VERSION = '1.0.0';
    var STORAGE_PREFIX = 'kp_rating_pro_';
    var CACHE_KEY = STORAGE_PREFIX + 'cache_v1';
    var BUDGET_KEY = STORAGE_PREFIX + 'budget_v1';
    var MODE_KEY = STORAGE_PREFIX + 'mode';
    var ENABLED_KEY = STORAGE_PREFIX + 'enabled';
    var KP_SOURCE_URL = 'https://cdn.jsdelivr.net/gh/nb557/plugins@cde2cf057e6634df43553fe8deeaef5030f95945/kp_source.js';
    var MAX_CACHE = 700;
    var MAX_REQUESTS_PER_DAY = 50;
    var MAX_PENDING = 80;
    var SUCCESS_TTL = 14 * 86400000;
    var MISS_TTL = 2 * 86400000;
    var REQUEST_TIMEOUT = 11500;
    var WAIT_BETWEEN_REQUESTS = 1200;
    var cache = {}, budget = null;
    var queue = [], inflight = false, activeJob = null, lastRequestAt = 0;
    var stateByNode = new WeakMap();
    var io = null, mo = null, scheduledScan = false, scanRoots = [];
    var saveTimer = null, dependencyLoading = false, dependencyFailed = false;
    var sourceTimer = null, sourceScript = null, sourceWaitCount = 0, pumpTimer = null, started = false;
    var metrics = window.KP_RATING_PRO_STATS = {
        version: VERSION, scanned: 0, decorated: 0, cacheHits: 0,
        externalCacheHits: 0, requests: 0, matched: 0, misses: 0,
        failed: 0, pending: 0, source: 'waiting'
    };

    function storageGet(key, fallback) {
        try { return Lampa.Storage.get(key, fallback); } catch (e) { return fallback; }
    }
    function storageSet(key, value) {
        try { Lampa.Storage.set(key, value); return true; } catch(e) { return false; }
    }
    function mode() {
        var v = storageGet(MODE_KEY, 'kp');
        return v === 'both' || v === 'tmdb' ? v : 'kp';
    }
    function enabled() { return storageGet(ENABLED_KEY, true) !== false; }
    function isValidRate(v) {
        return Number.isFinite(Number(v)) && Number(v) >= 0.1 && Number(v) <= 10;
    }
    function format(v) { return Number(v).toFixed(1); }
    function dayKey() { return new Date().toISOString().slice(0, 10); }
    function budgetLeft() {
        if (!budget || budget.day !== dayKey()) budget = {day: dayKey(), count: 0};
        return Math.max(0, MAX_REQUESTS_PER_DAY - budget.count);
    }
    function consumeBudget() {
        if (budgetLeft() <= 0) return false;
        budget.count += 1;
        storageSet(BUDGET_KEY, budget);
        return true;
    }
    function isFilm(card) {
        if (!card || typeof card !== 'object' || !card.id) return false;
        var type = kind(card);
        return type === 'movie' || type === 'tv';
    }
    function kind(card) {
        var type = card.type || card.media_type || '';
        if (type === 'movie' || type === 'film') return 'movie';
        if (type === 'tv' || type === 'series' || type === 'show' || card.name || card.first_air_date) return 'tv';
        if (card.title || card.release_date) return 'movie';
        return '';
    }
    function cacheKey(card) {
        return String(card.source || 'tmdb') + ':' + kind(card) + ':' + String(card.id);
    }
    function year(card) {
        var s = String(card.release_date || card.first_air_date || card.release_year || card.year || '');
        var m = s.match(/^(\d{4})/);
        return m ? Number(m[1]) : 0;
    }
    function normalize(v) {
        var s = String(v || '').toLowerCase().replace(/ё/g,'е');
        try { s = s.normalize('NFKC'); } catch(e) {}
        return s.replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();
    }
    function originalRating(card) {
        return Number(card.cub_hundred_rating || card.vote_average || 0);
    }
    function cacheLookup(card) {
        var key = cacheKey(card), item = cache[key];
        if (!item) return null;
        if (item.expires <= Date.now()) { delete cache[key]; return null; }
        metrics.cacheHits++;
        return item;
    }
    function legacyCacheLookup(card) {
        // The installed @t_anton rating.js stores {kp, imdb, timestamp} by TMDB ID.
        if (card.source && card.source !== 'tmdb' && card.source !== 'SURS' && card.source !== 'cub') return null;
        try {
            var all = Lampa.Storage.cache ? Lampa.Storage.cache('kp_rating', 500, {}) : storageGet('kp_rating', {});
            var found = all && all[String(card.id)];
            if (!found || !isValidRate(found.kp)) return null;
            if (!Number(found.timestamp) || Date.now() - Number(found.timestamp) > 14 * 86400000) return null;
            metrics.externalCacheHits++;
            return Number(found.kp);
        } catch(e) { return null; }
    }
    function trimCache() {
        var keys = Object.keys(cache), now = Date.now();
        keys.forEach(function(k) { if (!cache[k] || cache[k].expires < now) delete cache[k]; });
        keys = Object.keys(cache);
        if (keys.length > MAX_CACHE) {
            keys.sort(function(a,b) { return (cache[a].expires || 0) - (cache[b].expires || 0); });
            keys.slice(0, keys.length-MAX_CACHE).forEach(function(k) { delete cache[k]; });
        }
    }
    function saveCache() {
        if (saveTimer !== null) return;
        saveTimer = setTimeout(function(){ saveTimer = null; trimCache(); storageSet(CACHE_KEY, cache); }, 1500);
    }
    function writeCache(card, rating) {
        cache[cacheKey(card)] = {rate: rating || 0, expires: Date.now() + (rating ? SUCCESS_TTL : MISS_TTL)};
        saveCache();
    }
    function getVote(node) {
        return node.querySelector('.card__view .card__vote');
    }
    function makeVote(node) {
        var vote = getVote(node);
        if (vote) return vote;
        var view = node.querySelector('.card__view');
        if (!view || !document.createElement) return null;
        vote = document.createElement('div');
        vote.className = 'card__vote';
        view.appendChild(vote);
        return vote;
    }
    function applyRating(node, card, kp) {
        if (!node || !node.isConnected) return;
        var selected = mode();
        if (!enabled() || selected === 'tmdb') return restore(node, card);
        if (!isValidRate(kp)) return;
        var vote = makeVote(node);
        if (!vote) return;
        var native = originalRating(card);
        vote.classList.add('kp-rating-pro-vote');
        vote.classList.add('kp-rating-pro-kp');
        vote.setAttribute('aria-label','Кинопоиск ' + format(kp));
        vote.textContent = format(kp);
        var extra = node.querySelector('.kp-rating-pro-tmdb');
        if (selected === 'both' && card.source !== 'KP' && isValidRate(native)) {
            if (!extra) {
                extra = document.createElement('div');
                extra.className = 'kp-rating-pro-tmdb';
                vote.parentNode.appendChild(extra);
            }
            extra.textContent = 'TMDB ' + format(native);
        } else if (extra && extra.parentNode) extra.parentNode.removeChild(extra);
        metrics.decorated++;
    }
    function restore(node, card) {
        var vote = getVote(node);
        if (!vote) return;
        vote.classList.remove('kp-rating-pro-vote','kp-rating-pro-kp');
        vote.removeAttribute('aria-label');
        var native = originalRating(card);
        if (isValidRate(native)) vote.textContent = format(native);
        else vote.textContent = '';
        var extra = node.querySelector('.kp-rating-pro-tmdb');
        if (extra && extra.parentNode) extra.parentNode.removeChild(extra);
    }
    function getSource() {
        try {
            var kp = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.KP;
            if (kp && typeof kp.list === 'function') { metrics.source='ready'; return kp; }
        } catch(e) {}
        return null;
    }
    function ensureSource() {
        if (getSource() || dependencyLoading || dependencyFailed || !queue.length) return;
        if (window.kp_source_plugin) {
            // Another extension fetched KP, but might still wait for app.ready.
            if (++sourceWaitCount > 15) { metrics.source='unavailable'; dependencyFailed=true; return; }
            if (sourceTimer === null) sourceTimer = setTimeout(function(){ sourceTimer=null; pump(); }, 800);
            return;
        }
        dependencyLoading = true;
        // Give SURS time to register its bundled auto-loaded source before fetching.
        setTimeout(function() {
            if (getSource()) { dependencyLoading=false; pump(); return; }
            if (window.kp_source_plugin) { dependencyLoading=false; ensureSource(); return; }
            try {
                sourceScript = document.createElement('script');
                sourceScript.async = true;
                sourceScript.src = KP_SOURCE_URL;
                sourceScript.onload = function(){ dependencyLoading=false; metrics.source='registering'; pump(); };
                sourceScript.onerror = function(){ dependencyLoading=false; dependencyFailed=true; metrics.source='download_failed'; };
                document.head.appendChild(sourceScript);
            } catch(e) { dependencyLoading=false; dependencyFailed=true; metrics.source='download_failed'; }
        }, 750);
    }
    function candidates(response) {
        return response && Array.isArray(response.results) ? response.results : [];
    }
    function selectMatch(card, response, byImdb) {
        var opts = candidates(response), want = kind(card), y = year(card);
        var titles = [normalize(card.title || card.name), normalize(card.original_title || card.original_name)]
            .filter(Boolean);
        var matching = opts.filter(function(candidate) {
            if (!candidate || !isValidRate(candidate.kp_rating) || kind(candidate)!==want) return false;
            var cy = year(candidate);
            if (y && cy && Math.abs(cy-y)>1) return false;
            if (byImdb && card.imdb_id && candidate.imdb_id === card.imdb_id) return true;
            var names = [normalize(candidate.title||candidate.name),normalize(candidate.original_title||candidate.original_name)];
            return titles.some(function(t){ return names.indexOf(t)>=0; });
        });
        if (!matching.length) return null;
        matching.sort(function(a,b) { return Number(b.vote_count||0)-Number(a.vote_count||0); });
        return Number(matching[0].kp_rating);
    }
    function queryCard(source, card, done) {
        var imdb = String(card.imdb_id || '');
        var byImdb = /^tt\d{5,12}$/.test(imdb);
        var title = String(card.original_title || card.original_name || card.title || card.name || '').trim();
        if (!byImdb && !title) { done(null); return; }
        var params = byImdb ?
            {url:'filter',filter_url:'api/v2.2/films?imdbId='+encodeURIComponent(imdb),page:1} :
            {url:'api/v2.1/films/search-by-keyword',query:encodeURIComponent(title),page:1};
        var finished=false;
        var deadline = setTimeout(function(){ finish(null); },REQUEST_TIMEOUT);
        function finish(v){ if(finished)return;finished=true;clearTimeout(deadline);done(v); }
        try {
            source.list(params,function(resp){ finish(selectMatch(card, resp, byImdb)); },function(){ finish(null); });
        } catch(e){ finish(null); }
    }
    function enqueue(card, node) {
        var key = cacheKey(card), i;
        if(activeJob && activeJob.key===key){
            if(activeJob.nodes.indexOf(node)<0) activeJob.nodes.push(node);
            return;
        }
        for(i=0;i<queue.length;i++) if(queue[i].key===key) {
            if(queue[i].nodes.indexOf(node)<0) queue[i].nodes.push(node);
            return;
        }
        if(queue.length>=MAX_PENDING) return;
        queue.push({key:key,card:card,nodes:[node]});
        metrics.pending=queue.length;
        pump();
    }
    function pump() {
        if (inflight || !queue.length || !enabled() || mode()==='tmdb') return;
        if (budgetLeft() <= 0) { metrics.source='daily_limit'; return; }
        var source=getSource();
        if (!source) { ensureSource(); return; }
        var wait = Math.max(0, WAIT_BETWEEN_REQUESTS - (Date.now()-lastRequestAt));
        if (wait>0) {
            if(pumpTimer===null) pumpTimer=setTimeout(function(){pumpTimer=null;pump();}, wait);
            return;
        }
        var job=queue.shift();
        metrics.pending=queue.length;
        if (!job || !consumeBudget()) return;
        inflight=true;
        activeJob=job;
        metrics.requests++;
        lastRequestAt=Date.now();
        queryCard(source,job.card,function(rating){
            inflight=false;
            activeJob=null;
            if (isValidRate(rating)) { metrics.matched++; writeCache(job.card,rating); }
            else { metrics.misses++; writeCache(job.card,0); }
            job.nodes.forEach(function(node){
                if(node && node.card_data && cacheKey(node.card_data)===job.key && isValidRate(rating))
                    applyRating(node,node.card_data,rating);
            });
            if (queue.length) setTimeout(pump,WAIT_BETWEEN_REQUESTS);
        });
    }
    function updateCard(node) {
        if (!node || !node.isConnected || !node.querySelector) return;
        var card = node.card_data;
        if (!isFilm(card)) return;
        metrics.scanned++;
        var cur=stateByNode.get(node), key=cacheKey(card);
        if (!cur || cur.key!==key) stateByNode.set(node,{key:key});
        if (!enabled() || mode()==='tmdb') {restore(node,card);return;}
        if (isValidRate(card.kp_rating)) {applyRating(node,card,card.kp_rating);return;}
        if (card.source==='KP') return;
        var entry=cacheLookup(card);
        if (entry) {if (entry.rate) applyRating(node,card,entry.rate); return;}
        var legacy=legacyCacheLookup(card);
        if (legacy) {writeCache(card,legacy);applyRating(node,card,legacy);return;}
        enqueue(card,node);
    }
    function observeCard(node) {
        if (!node || stateByNode.has(node)) return;
        var card=node.card_data;
        if (!isFilm(card)) return;
        stateByNode.set(node,{key:cacheKey(card)});
        if (io) io.observe(node);
        else updateCard(node);
    }
    function scan(root, force) {
        if (!root || !root.querySelectorAll) return;
        if (root.matches && root.matches('.card')) {
            if (force) updateCard(root);
            else observeCard(root);
        }
        var cards=root.querySelectorAll('.card');
        for(var i=0;i<cards.length;i++) {
            if (force) updateCard(cards[i]);
            else observeCard(cards[i]);
        }
    }
    function queueScan(root) {
        if (root && root.nodeType===1 && scanRoots.length<100) scanRoots.push(root);
        if (scheduledScan) return;
        scheduledScan=true;
        setTimeout(function(){
            scheduledScan=false;
            var roots=scanRoots.splice(0);
            if (!roots.length || roots.length>=95) {scan(document.body,false);return;}
            roots.forEach(function(elem){scan(elem,false);});
        },75);
    }
    function installCss() {
        if (document.getElementById('kp-rating-pro-css')) return;
        var style=document.createElement('style');
        style.id='kp-rating-pro-css';
        style.textContent='.card__vote.kp-rating-pro-kp{display:flex;align-items:center;gap:.3em;white-space:nowrap}' +
          '.card__vote.kp-rating-pro-kp:before{content:"КП";font-size:.66em;opacity:.88;font-weight:600}' +
          '.kp-rating-pro-tmdb{position:absolute;bottom:2.15em;right:.3em;padding:.16em .35em;font-size:.65em;' +
          'background:rgba(0,0,0,.75);border-radius:.35em;color:#fff;pointer-events:none}';
        document.head.appendChild(style);
    }
    function registerSettings() {
        if (!Lampa.SettingsApi) return;
        Lampa.SettingsApi.addComponent({component:'kp_rating_pro',name:'KP Rating Pro',
            icon:'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18v14H3z"/><path d="m6 14 4-5 3 3 2-2 3 4"/></svg>'});
        Lampa.SettingsApi.addParam({component:'kp_rating_pro',param:{name:ENABLED_KEY,type:'trigger',default:true},
            field:{name:'Показывать рейтинги на постерах',description:'Только видимые карточки; загрузка не блокируется'},
            onChange:function(v){storageSet(ENABLED_KEY,!!v);scan(document.body,true);if(v)pump();}});
        Lampa.SettingsApi.addParam({component:'kp_rating_pro',param:{name:MODE_KEY,type:'select',default:'kp',values:{kp:'КП вместо TMDB',both:'КП и TMDB',tmdb:'Только стандартный рейтинг'}},
            field:{name:'Отображаемый рейтинг',description:'При отсутствии рейтинга КП сохраняется стандартный'},
            onChange:function(v){storageSet(MODE_KEY,v);scan(document.body,true);pump();}});
    }
    function start() {
        if (started) return;
        if (typeof Lampa==='undefined' || !Lampa.Storage || !document.body) return;
        started=true;
        cache=storageGet(CACHE_KEY,{}) || {};
        budget=storageGet(BUDGET_KEY,null);
        trimCache();
        installCss();
        registerSettings();
        if (typeof IntersectionObserver!=='undefined') {
            io=new IntersectionObserver(function(entries){
                entries.forEach(function(entry){ if(entry.isIntersecting) updateCard(entry.target); });
            },{rootMargin:'250px 0px',threshold:0});
        }
        if (typeof MutationObserver!=='undefined') {
            mo=new MutationObserver(function(mutations){
                mutations.forEach(function(m){
                    for(var i=0;i<m.addedNodes.length;i++) queueScan(m.addedNodes[i]);
                });
            });
            mo.observe(document.body,{childList:true,subtree:true});
        }
        scan(document.body,false);
        if (Lampa.Listener && typeof Lampa.Listener.follow==='function')
            Lampa.Listener.follow('activity',function(e){ if (e && e.type==='start') queueScan(document.body); });
        if (typeof document.addEventListener==='function') document.addEventListener('visibilitychange',function(){if(document.hidden){if(saveTimer){clearTimeout(saveTimer);saveTimer=null;storageSet(CACHE_KEY,cache);}}else queueScan(document.body);});
        window.kp_rating_pro_rescan=function(){scan(document.body,true);};
        window.kp_rating_pro_destroy=function(){
            if(io)io.disconnect(); if(mo)mo.disconnect();
            if(pumpTimer){clearTimeout(pumpTimer);pumpTimer=null;}
            if(sourceTimer){clearTimeout(sourceTimer);sourceTimer=null;}
            if(saveTimer){clearTimeout(saveTimer);saveTimer=null;storageSet(CACHE_KEY,cache);}
            window.kp_rating_pro_initialized=false;
            started=false;
        };
    }
    function tryStart() {
        if (typeof Lampa==='undefined' || !Lampa.Storage || !document.body) {
            setTimeout(tryStart,300); return;
        }
        start();
    }
    tryStart();
})();
