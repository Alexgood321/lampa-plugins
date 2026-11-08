/**
 * KP Rating Pro for Lampa v1.1.0
 * Version: 1.1.0
 * Global, lazy Kinopoisk ratings for standard Lampa posters.
 * Original implementation by Alexgood321. Does not copy rating.js or its credentials.
 * Uses the installed Lampa.Api.sources.KP and reuses the existing rating.js cache.
 */
(function () {
    'use strict';
    if (window.kp_rating_pro_initialized) return;
    window.kp_rating_pro_initialized = true;

    var VERSION = '1.1.0';
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
    // The visible native badge prioritizes CUB. A source provider is tagged
    // only when it can be identified from the card's own data.
    function nativeProvider(card) {
        if (!card || card.cub_hundred_fire) return null;
        if (isValidRate(card.cub_hundred_rating))
            return {code:'cub', title:'CUB', value:Number(card.cub_hundred_rating)};
        if (String(card.source || '').toUpperCase() === 'KP' &&
            isValidRate(card.vote_average || card.kp_rating))
            return {code:'kp', title:'КП', value:Number(card.vote_average || card.kp_rating)};
        if (!isValidRate(card.vote_average)) return null;
        var origin = String(card.source || 'tmdb').toLowerCase();
        if (['tmdb','surs','surs_mod','cub'].indexOf(origin) < 0) return null;
        // No TMDB attribution for independent sources without explicit origin.
        if (origin === 'cub' && !card.tmdb_id && !card.tmdb_rating &&
            card.rating_source !== 'tmdb') return null;
        return {code:'tmdb', title:'TMDB', value:Number(card.vote_average)};
    }
    function directImdb(card) {
        var ratings = [card.imdb_rating, card.ratingImdb, card.imdbRating];
        for (var i=0;i<ratings.length;i++)
            if (isValidRate(ratings[i])) return Number(ratings[i]);
        return 0;
    }
    function rankedRatings(card, fromCache) {
        var result=[], c=fromCache || {};
        function add(code,title,value) {
            if (isValidRate(value))
                result.push({code:code,title:title,value:Number(value)});
        }
        var kp = isValidRate(card.kp_rating) ? Number(card.kp_rating) :
            (String(card.source || '').toUpperCase() === 'KP' &&
             isValidRate(card.vote_average) ? Number(card.vote_average) : Number(c.rate || c.kp || 0));
        var imdb = directImdb(card) || Number(c.imdb || 0);
        add('kp','КП',kp);
        add('imdb','IMDb',imdb);
        // TMDB rating is not inferred from third-party vote_average blindly.
        var origin=String(card.source || 'tmdb').toLowerCase();
        var canUseTMDB = ['tmdb','surs','surs_mod'].indexOf(origin)>=0;
        if (canUseTMDB) add('tmdb','TMDB',card.vote_average);
        else if (isValidRate(card.tmdb_rating)) add('tmdb','TMDB',card.tmdb_rating);
        else if (origin==='cub' && card.rating_source==='tmdb') add('tmdb','TMDB',card.vote_average);
        add('cub','CUB',card.cub_hundred_rating);
        return result;
    }
    function clearVoteLabels(vote) {
        if (!vote) return;
        vote.classList.remove('kp-rating-pro-vote','kp-rating-pro-kp',
            'kp-rating-pro-imdb','kp-rating-pro-native',
            'kp-rating-pro-native-tmdb','kp-rating-pro-native-cub',
            'kp-rating-pro-native-kp','kp-rating-pro-native-imdb');
        vote.removeAttribute('aria-label');
    }
    function decorateNative(node,card) {
        var vote = getVote(node), provider = nativeProvider(card);
        if (!vote) return;
        if (!provider || !isValidRate(Number(vote.textContent)) ||
            Math.abs(Number(vote.textContent)-Math.min(provider.value,10)) > 0.06) {
            clearVoteLabels(vote);
            return;
        }
        clearVoteLabels(vote);
        vote.classList.add('kp-rating-pro-native','kp-rating-pro-native-'+provider.code);
        vote.setAttribute('aria-label',provider.title+' '+format(provider.value));
    }
    function cacheLookup(card) {
        var key = cacheKey(card), item = cache[key];
        if (!item) return null;
        if (item.expires <= Date.now()) { delete cache[key]; return null; }
        metrics.cacheHits++;
        return item;
    }
    function legacyCacheLookup(card) {
        // @t_anton/rating.js stores independently sourced {kp, imdb, timestamp}
        // under the TMDB ID. Never assume another source's ID is a TMDB ID.
        if (card.source && card.source !== 'tmdb' && card.source !== 'SURS' && card.source !== 'cub') return null;
        try {
            var all = Lampa.Storage.cache ? Lampa.Storage.cache('kp_rating', 500, {}) : storageGet('kp_rating', {});
            var found = all && all[String(card.id)];
            if (!found || (!isValidRate(found.kp) && !isValidRate(found.imdb))) return null;
            if (!Number(found.timestamp) || Date.now() - Number(found.timestamp) > 14 * 86400000) return null;
            metrics.externalCacheHits++;
            return {
                kp: isValidRate(found.kp) ? Number(found.kp) : 0,
                imdb: isValidRate(found.imdb) ? Number(found.imdb) : 0
            };
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
        var values = rating && typeof rating === 'object' ? rating : {kp:rating};
        var kp = isValidRate(values.kp) ? Number(values.kp) : 0;
        var imdb = isValidRate(values.imdb) ? Number(values.imdb) : 0;
        cache[cacheKey(card)] = {
            rate: kp, imdb: imdb,
            expires: Date.now() + (kp || imdb ? SUCCESS_TTL : MISS_TTL)
        };
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
    function renderRanked(node,card,stored) {
        if (!node || !node.isConnected) return;
        if (!enabled()) return restore(node,card,false);
        if (mode()==='tmdb') return restore(node,card,true);
        if (card.cub_hundred_fire) return restore(node,card,false);
        var candidates = rankedRatings(card,stored);
        if (!candidates.length) return restore(node,card,true);
        var vote = getVote(node) || makeVote(node);
        if (!vote) return;
        var target = candidates[0], native = originalRating(card);
        var isOurs = vote.classList.contains('kp-rating-pro-vote');
        // When replacing with a fallback (not KP/IMDb), verify that the
        // native number has not been changed by an unrelated extension.
        if (!isOurs && target.code !== 'kp' && target.code !== 'imdb' &&
            (!isValidRate(Number(vote.textContent)) ||
             Math.abs(Number(vote.textContent) - native) > 0.06)) {
            return decorateNative(node,card);
        }
        clearVoteLabels(vote);
        vote.classList.add('kp-rating-pro-vote');
        if (target.code === 'kp') vote.classList.add('kp-rating-pro-kp');
        else if (target.code === 'imdb') vote.classList.add('kp-rating-pro-imdb');
        else vote.classList.add('kp-rating-pro-native','kp-rating-pro-native-'+target.code);
        vote.textContent = format(target.value);
        vote.setAttribute('aria-label',(target.code === 'kp' ? 'Кинопоиск' : target.title)+' '+format(target.value));
        var extra = node.querySelector('.kp-rating-pro-tmdb');
        var second = mode() === 'both' ? candidates[1] : null;
        if (second) {
            if (!extra) {
                extra = document.createElement('div');
                extra.className = 'kp-rating-pro-tmdb';
                vote.parentNode.appendChild(extra);
            }
            extra.textContent = second.title+' '+format(second.value);
        } else if (extra && extra.parentNode) extra.parentNode.removeChild(extra);
        metrics.decorated++;
        if (target.code === 'imdb')
            metrics.imdbSelected = (metrics.imdbSelected||0)+1;
    }
    function applyRating(node,card,rating) {
        renderRanked(node,card,rating && typeof rating === 'object' ? rating : {kp:rating});
    }
    function restore(node,card,showNativeLabel) {
        var vote = getVote(node);
        if (!vote) return;
        var wasReplaced = vote.classList.contains('kp-rating-pro-vote');
        clearVoteLabels(vote);
        if (wasReplaced) {
            var native=originalRating(card);
            vote.textContent=isValidRate(native) ? format(native) : '';
        }
        var extra=node.querySelector('.kp-rating-pro-tmdb');
        if (extra && extra.parentNode) extra.parentNode.removeChild(extra);
        if (showNativeLabel) decorateNative(node,card);
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
            if (!candidate || (!isValidRate(candidate.kp_rating) && !isValidRate(candidate.imdb_rating)) ||
                kind(candidate)!==want) return false;
            var cy=year(candidate);
            if (y && cy && Math.abs(cy-y)>1) return false;
            if (byImdb && card.imdb_id && candidate.imdb_id === card.imdb_id) return true;
            var names=[normalize(candidate.title||candidate.name),normalize(candidate.original_title||candidate.original_name)];
            return titles.some(function(t) {return names.indexOf(t)>=0;});
        });
        if (!matching.length) return null;
        matching.sort(function(a,b){return Number(b.vote_count||0)-Number(a.vote_count||0);});
        var result=matching[0];
        return {
            kp:isValidRate(result.kp_rating)?Number(result.kp_rating):0,
            imdb:isValidRate(result.imdb_rating)?Number(result.imdb_rating):0
        };
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
            var hasRating = rating && (isValidRate(rating.kp) || isValidRate(rating.imdb));
            if (hasRating) { metrics.matched++; writeCache(job.card,rating); }
            else { metrics.misses++; writeCache(job.card,0); }
            job.nodes.forEach(function(node){
                if(node && node.card_data && cacheKey(node.card_data)===job.key)
                    renderRanked(node,node.card_data,hasRating ? {rate:rating.kp,imdb:rating.imdb} : null);
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
        if (!enabled()) {restore(node,card,false);return;}
        if (mode()==='tmdb') {restore(node,card,true);return;}
        if (isValidRate(card.kp_rating)) {renderRanked(node,card,null);return;}
        var entry=cacheLookup(card);
        if (entry) {renderRanked(node,card,entry); return;}
        var legacy=legacyCacheLookup(card);
        if (legacy) {writeCache(card,legacy);renderRanked(node,card,legacy);return;}
        renderRanked(node,card,null);
        if (card.source==='KP') return;
        enqueue(card,node);
    }
    function observeCard(node) {
        if (!node || stateByNode.has(node)) return;
        var card=node.card_data;
        if (!isFilm(card)) return;
        stateByNode.set(node,{key:cacheKey(card)});
        if (enabled()) renderRanked(node,card,null);
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
        style.textContent='.card__vote.kp-rating-pro-kp,.card__vote.kp-rating-pro-native{display:flex;align-items:center;gap:.3em;white-space:nowrap}' +
          '.card__vote.kp-rating-pro-kp:before,.card__vote.kp-rating-pro-native-kp:before{content:"КП";font-size:.66em;opacity:.88;font-weight:600}' +
          '.card__vote.kp-rating-pro-native-tmdb:before{content:"TMDB";font-size:.62em;opacity:.88;font-weight:600}' +
          '.card__vote.kp-rating-pro-native-cub:before{content:"CUB";font-size:.66em;opacity:.88;font-weight:600}' +
          '.card__vote.kp-rating-pro-imdb:before{content:"IMDb";font-size:.62em;opacity:.88;font-weight:600}' +
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
        Lampa.SettingsApi.addParam({component:'kp_rating_pro',param:{name:MODE_KEY,type:'select',default:'kp',values:{kp:'Авто: КП → IMDb → TMDB → CUB',both:'Авто + второй рейтинг',tmdb:'Штатный рейтинг Lampa'}},
            field:{name:'Отображаемый рейтинг',description:'Приоритет: КП, затем IMDb, TMDB, CUB. Только подтверждённые источники'},
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
