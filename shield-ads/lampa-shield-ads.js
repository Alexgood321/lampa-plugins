/**
 * Lampa Shield Ads v1.0.0
 * Focused ad suppression for Lampa 3.x on WebKit / Android WebView / desktop.
 * Derived from an audit of Lampa Shield by DeMoN288 and Lampa source.
 * Original: https://gist.github.com/DeMoN288/24ccaa65bf99d51c8d9cea7ef9bf1ec4
 * This is a separate, clean-room Ads Only implementation, NOT a git fork.
 * License: MIT (this implementation). No source code from the gist is copied.
 */
(function () {
    'use strict';

    if (window.__lampaShieldAdsV1) return;
    window.__lampaShieldAdsV1 = true;

    var PLUGIN = 'lampa_shield_ads';
    var KEY = 'lampa_shield_ads_enabled';
    var stats = { adRequests: 0, playerVast: 0, fallbackResponses: 0 };
    var playerHooked = false;
    var settingsReady = false;
    var xhrHooked = false;
    var nativeXhrOpen = null;
    var nativeXhrSend = null;
    var STATE = '__lampaShieldAdsState';
    var EMPTY_ADS = '{"ad":[]}';

    function enabled() {
        var api = window.Lampa && window.Lampa.Storage;
        var v;
        try { v = api && api.get ? api.get(KEY, true) : true; }
        catch (e) { v = true; }
        return v !== false && v !== 'false' && v !== 0 && v !== '0';
    }

    function adRequest(url, method) {
        if (!enabled()) return false;
        if (method && String(method).toUpperCase() !== 'GET') return false;
        // Exact API routes, not arbitrary URLs containing an advertising keyword.
        var path = String(url || '').split(/[?#]/)[0];
        return /\/api\/ad\/get\/(?:preroll|banner)\/?$/i.test(path);
    }

    function fire(xhr, type) {
        try {
            if (document.createEvent && xhr.dispatchEvent) {
                var ev = document.createEvent('Event');
                ev.initEvent(type, false, false);
                xhr.dispatchEvent(ev);
                return;
            }
        } catch (e) {}
        var fn = xhr['on' + type];
        if (typeof fn === 'function') {
            try { fn.call(xhr, { type: type, target: xhr }); } catch (e2) {}
        }
    }

    function fallbackResponse(xhr, st) {
        // A network-free async response for older engines without Blob URLs.
        // The real send() is deliberately not called.
        stats.fallbackResponses++;
        try {
            Object.defineProperty(xhr, 'readyState', { configurable: true, get: function () { return 4; } });
            Object.defineProperty(xhr, 'status', { configurable: true, get: function () { return 200; } });
            Object.defineProperty(xhr, 'statusText', { configurable: true, get: function () { return 'OK'; } });
            Object.defineProperty(xhr, 'responseText', { configurable: true, get: function () { return EMPTY_ADS; } });
            Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return EMPTY_ADS; } });
        } catch (e) {
            // On constrained XHR implementations a synthetic response may fail.
            // Still avoid sending the advertising request.
        }
        setTimeout(function () {
            if (st.aborted) return;
            fire(xhr, 'readystatechange');
            fire(xhr, 'load');
            fire(xhr, 'loadend');
        }, 0);
    }

    function installXhrHook() {
        if (xhrHooked || !window.XMLHttpRequest || !window.XMLHttpRequest.prototype) return;
        var proto = window.XMLHttpRequest.prototype;
        if (proto.open.__lampaShieldAdsWrapped) {
            xhrHooked = true;
            return;
        }
        nativeXhrOpen = proto.open;
        nativeXhrSend = proto.send;

        function wrappedOpen(method, url) {
            var st = { blocked: false, fallback: false, aborted: false, blob: null };
            this[STATE] = st;
            if (adRequest(url, method)) {
                st.blocked = true;
                stats.adRequests++;
                // Local Blob URL gives a real 200 response using native XHR;
                // the core VastManager receives {ad: []} and never starts preroll.
                try {
                    if (window.Blob && window.URL && typeof window.URL.createObjectURL === 'function') {
                        var objectUrl = window.URL.createObjectURL(new window.Blob([EMPTY_ADS], { type: 'application/json' }));
                        st.blob = objectUrl;
                        var xhr = this;
                        var args = Array.prototype.slice.call(arguments);
                        args[1] = objectUrl;
                        var result = nativeXhrOpen.apply(xhr, args);
                        if (typeof xhr.addEventListener === 'function') {
                            xhr.addEventListener('loadend', function () {
                                if (st.blob && window.URL && window.URL.revokeObjectURL) {
                                    window.URL.revokeObjectURL(st.blob);
                                    st.blob = null;
                                }
                            }, false);
                        }
                        return result;
                    }
                } catch (blobError) {
                    if (st.blob && window.URL && window.URL.revokeObjectURL) {
                        try { window.URL.revokeObjectURL(st.blob); } catch (ignored) {}
                        st.blob = null;
                    }
                }
                st.fallback = true;
            }
            return nativeXhrOpen.apply(this, arguments);
        }

        function wrappedSend() {
            var st = this[STATE];
            if (st && st.blocked && st.fallback) {
                fallbackResponse(this, st);
                return;
            }
            return nativeXhrSend.apply(this, arguments);
        }

        wrappedOpen.__lampaShieldAdsWrapped = true;
        proto.open = wrappedOpen;
        proto.send = wrappedSend;
        xhrHooked = true;
    }

    function installPlayerHook() {
        var player = window.Lampa && window.Lampa.Player;
        if (playerHooked || !player || !player.listener || typeof player.listener.follow !== 'function') return;
        player.listener.follow('create', function (event) {
            if (!enabled() || !event || !event.data) return;
            var data = event.data;
            if (typeof data.vast_url === 'string' && data.vast_url.length) {
                // Core preroll.js reads vast_url directly from the player data.
                // Remove only this ad field. Stream URL, playlist and CUB are untouched.
                delete data.vast_url;
                stats.playerVast++;
            }
        });
        playerHooked = true;
    }

    function status() {
        return 'За сеанс: запросов ' + stats.adRequests +
            ' · VAST плагинов ' + stats.playerVast +
            ' · совместимый режим ' + stats.fallbackResponses;
    }

    function installSettings() {
        var api = window.Lampa && window.Lampa.SettingsApi;
        if (settingsReady || !api || typeof api.addComponent !== 'function' || typeof api.addParam !== 'function') return;
        api.addComponent({
            component: PLUGIN,
            name: 'Блокировка рекламы',
            icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>'
        });
        api.addParam({
            component: PLUGIN,
            param: { name: KEY, type: 'trigger', 'default': true },
            field: { name: 'Блокировать preroll', description: 'Встроенная реклама CUB и VAST от онлайн-плагинов. Для очистки ранее загруженных объявлений перезапустите Lampa.' }
        });
        api.addParam({
            component: PLUGIN,
            param: { name: PLUGIN + '_status', type: 'static' },
            field: { name: status() },
            onRender: function (item) {
                if (item && item.find) item.find('.settings-param__name').text(status());
            }
        });
        settingsReady = true;
    }

    function onReady() {
        installXhrHook();
        installPlayerHook();
        installSettings();
        try { console.log('Lampa Shield Ads', 'v1.0.0 ready'); } catch (e) {}
    }

    // Intercept early: VastManager.init() performs an immediate XHR fetch.
    installXhrHook();
    installPlayerHook();
    window.lampa_shield_ads_stats = stats;

    if (window.appready) onReady();
    else if (window.Lampa && window.Lampa.Listener && typeof window.Lampa.Listener.follow === 'function') {
        window.Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') onReady();
        });
    } else {
        // Defensive fallback for unusual plugin loaders.
        window.addEventListener('load', onReady, false);
    }
}());
