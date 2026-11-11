/**
 * TorrServer Switch Pro
 * Version: 2.1.1
 * Author: Alexgood321
 * Native Lampa settings, two-server health monitoring, guarded AUTO failover.
 */
(function (window, document) {
    'use strict';

    var VERSION = '2.1.1';
    var ID = 'alexgood321_torrserver_switch';
    var COMP = 'alexgood321_torrserver_switch_settings';
    var SINGLETON = '__alexgood321TorrServerSwitch';
    var CSS_ID = 'alex-ts-switch-pro-css';
    var BUTTON_CLASS = 'alex-ts-switch-pro';
    var P = 'alex_tss_';
    var SELECT_KEY = 'torrserver_use_link';
    var DEFAULTS = {
        enabled: true, header: true, monitor: true, mode: 'manual',
        interval: '60', timeout: '5000', fail_count: '3',
        recovery_count: '3', cooldown: '300', return_primary: true,
        pause_player: true, show_status: true, show_latency: false,
        notify: true, verify_manual: false,
        layout: 'round', display: 'alternate', animate: true,
        ts_duration: '3', ping_duration: '2',
        pause_focus: true, compact_ping: true, auto_badge: true
    };
    var OPTIONS = {
        mode: {manual:'Ручной',auto:'Автоматический'},
        layout: {round:'Круглая (Lampa)',pill:'Компактная плашка'},
        display: {alternate:'TS ↔ задержка',server:'Только TS',ping:'Только задержка'},
        ts_duration: {'2':'2 секунды','3':'3 секунды','4':'4 секунды','5':'5 секунд'},
        ping_duration: {'1':'1 секунда','2':'2 секунды','3':'3 секунды','4':'4 секунды'},
        interval: {'30':'30 секунд','60':'1 минута','120':'2 минуты','300':'5 минут'},
        timeout: {'3000':'3 секунды','5000':'5 секунд','8000':'8 секунд'},
        fail_count: {'2':'2 ошибки','3':'3 ошибки','5':'5 ошибок'},
        recovery_count: {'2':'2 проверки','3':'3 проверки','5':'5 проверок'},
        cooldown: {'120':'2 минуты','300':'5 минут','600':'10 минут','1200':'20 минут'}
    };

    if (window[SINGLETON] && typeof window[SINGLETON].destroy === 'function') {
        try {window[SINGLETON].destroy();} catch (ignored) {}
    }

    var active = true;
    var initialized = false;
    var button = null;
    var startTimer = null, checkTimer = null, refreshTimer = null;
    var presentationTimer = null, presentationPhase = 'server';
    var lastPresentationMode = '', pointerInside = false;
    var inProgress = false, probeGeneration = 0, inFlight = [];
    var lastClick = 0, lastSwitchAt = 0, manualHoldUntil = 0;
    var internalSelection = false;
    var stats = {
        one: freshStatus(),
        two: freshStatus()
    };

    function freshStatus() {
        return {state:'unknown',rtt:null,checked:0,successes:0,failures:0,
            lastOk:0,reason:'Ещё не проверен',version:''};
    }
    function hasLampa() {
        return !!(window.Lampa && Lampa.Storage && Lampa.SettingsApi &&
            Lampa.Head && Lampa.Storage.get && Lampa.Storage.set &&
            Lampa.Head.addElement && Lampa.Head.render && window.$);
    }
    function get(suffix) {
        var key = P + suffix, fallback = DEFAULTS[suffix];
        try {
            var value = Lampa.Storage.get(key, fallback);
            return value === '' || value === null || typeof value === 'undefined' ?
                fallback : value;
        } catch (error) { return fallback; }
    }
    function yes(suffix) {return get(suffix) === true || get(suffix) === 'true';}
    function num(suffix) {return Number(get(suffix)) || Number(DEFAULTS[suffix]) || 0;}
    function enabled() {return yes('enabled');}
    function mode() {return get('mode') === 'auto' ? 'auto' : 'manual';}
    function current() {
        try {return Lampa.Storage.field(SELECT_KEY) === 'two' ? 'two' : 'one';}
        catch (e) {return 'one';}
    }
    function serverAddress(slot) {
        try {
            return String(Lampa.Storage.get(
                slot === 'one' ? 'torrserver_url' : 'torrserver_url_two') || '').trim();
        } catch (e) {return '';}
    }
    function urlFor(slot) {
        var raw = serverAddress(slot);
        if (!raw) return '';
        if (!/^https?:\/\//i.test(raw)) raw = 'http://' + raw;
        if (!/^https?:\/\/[^/?#\s]+/i.test(raw)) return '';
        return raw.replace(/\/+$/,'').replace(/\/echo$/i,'') + '/echo';
    }
    function serverName(slot) {
        return 'TS ' + (slot === 'one' ? '1' : '2');
    }
    function notify(message) {
        if (!yes('notify')) return;
        try {if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);}
        catch (ignored) {}
    }
    function diagnose(status) {
        if (status.state === 'online') return 'Доступен' +
            (status.rtt !== null ? ' (' + status.rtt + ' мс)' : '');
        if (status.state === 'offline') return 'Недоступен';
        if (status.state === 'checking') return 'Проверяется';
        if (status.state === 'unconfigured') return 'Адрес не указан';
        return 'Не удалось проверить';
    }
    function statusLine(slot) {
        var st = stats[slot], s = serverName(slot) + ': ' + diagnose(st);
        if (st.state === 'online' && st.version) s += ' · ' + st.version;
        if (st.state === 'unknown' || st.state === 'offline') s += ' · ' + st.reason;
        if (st.checked) s += ' · проверка ' + new Date(st.checked).toLocaleTimeString();
        return s;
    }
    function refreshSettings() {
        try {
            var body = Lampa.Settings && Lampa.Settings.render && Lampa.Settings.render();
            if (!body || !body.find) return;
            ['one','two'].forEach(function (slot) {
                var el = body.find('[data-alex-ts-info="' + slot + '"]');
                if (el.length) el.find('.settings-param__descr').text(statusLine(slot));
            });
        } catch (ignored) {}
    }
    function displayMode() {
        var value=get('display');
        return value==='server'||value==='ping'?value:'alternate';
    }
    function pingLabel(st) {
        if (st.state === 'online' && st.rtt !== null && isFinite(Number(st.rtt))) {
            var ms=Math.max(0,Math.round(Number(st.rtt)));
            if (yes('compact_ping') && ms >= 1000) {
                var seconds=(ms/1000).toFixed(ms < 10000 ? 2 : 1);
                return {value:seconds.replace(/\.?0+$/,''),unit:'s'};
            }
            return {value:String(ms),unit:'ms'};
        }
        if (st.state === 'offline') return {value:'OFF',unit:'LINE'};
        if (st.state === 'unconfigured') return {value:'NO',unit:'URL'};
        if (st.state === 'checking') return {value:'…',unit:''};
        return {value:'—',unit:'ms'};
    }
    function stopPresentation() {
        if (presentationTimer !== null) clearTimeout(presentationTimer);
        presentationTimer = null;
    }
    function setPresentationPhase(value) {
        presentationPhase=value==='ping'?'ping':'server';
        if (button) button.attr('data-phase',presentationPhase);
    }
    function focusPausesPresentation() {
        if (!yes('pause_focus') || !button) return false;
        try {
            if (pointerInside) return true;
            if (typeof button.hasClass === 'function' &&
                (button.hasClass('focus') || button.hasClass('hover'))) return true;
            if (button[0] && button[0].matches && button[0].matches(':hover'))
                return true;
        } catch (ignored) {}
        return false;
    }
    function schedulePresentation() {
        stopPresentation();
        if (!active || !button || !enabled() || !yes('header') ||
            displayMode() !== 'alternate') return;
        var delay = presentationPhase === 'server' ? num('ts_duration') : num('ping_duration');
        presentationTimer = setTimeout(presentationTick, delay * 1000);
    }
    function presentationTick() {
        presentationTimer = null;
        if (!active || !button || !enabled() || !yes('header') ||
            displayMode() !== 'alternate') return;
        if ((document && document.hidden) || focusPausesPresentation()) {
            presentationTimer=setTimeout(presentationTick,350);
            return;
        }
        setPresentationPhase(presentationPhase==='server'?'ping':'server');
        schedulePresentation();
    }
    function restartPresentation() {
        stopPresentation();
        lastPresentationMode = displayMode();
        setPresentationPhase(lastPresentationMode==='ping'?'ping':'server');
        schedulePresentation();
    }
    function presentationChanged() {
        if (!active || !initialized) return;
        restartPresentation();
        refreshHeader();
    }
    function refreshHeader() {
        if (!active || !hasLampa()) return;
        if (!enabled() || !yes('header')) {
            stopPresentation();
            if (button) {button.remove();button = null;}
            markHeaderLayout(false);
            pointerInside=false;
            lastPresentationMode='';
            return;
        }
        if (!button) mountHeader();
        if (!button) return;

        var slot=current(), st=stats[slot];
        var ping=pingLabel(st), present=displayMode();
        button.find('.alex-ts-switch-number').text(slot==='two'?'2':'1');
        button.find('.alex-ts-switch-ping-value').text(ping.value);
        button.find('.alex-ts-switch-ping-unit').text(ping.unit);
        button.attr('data-server',slot);
        button.attr('data-mode',mode());
        button.attr('data-layout',get('layout')==='pill'?'pill':'round');
        button.attr('data-animate',yes('animate')?'on':'off');
        button.attr('data-ping-status',st.state);
        button.removeClass('alex-ts-state-online alex-ts-state-offline alex-ts-state-unknown');
        button.addClass('alex-ts-state-' +
            (yes('show_status') ? (st.state==='online'||st.state==='offline' ?
                st.state:'unknown') : 'unknown'));
        button.find('.alex-ts-switch-dot').toggle(yes('show_status'));
        button.find('.alex-ts-switch-auto').toggle(mode()==='auto' && yes('auto_badge'));
        button.attr('title',serverName(slot) + ' · ' +
            (mode()==='auto'?'AUTO':'MANUAL') + ' · ' + diagnose(st) +
            '. Нажмите для переключения');
        button.attr('aria-label',button.attr('title'));
        if (present!==lastPresentationMode) restartPresentation();
        else button.attr('data-phase',presentationPhase);
    }
    function refresh() {
        refreshHeader();
        refreshSettings();
    }
    function playerOpen() {
        try {return !!(Lampa.Player && Lampa.Player.opened && Lampa.Player.opened());}
        catch (ignored) {return false;}
    }
    function canAutoChange() {
        if (!active || !enabled() || mode() !== 'auto' || !yes('monitor')) return false;
        if (yes('pause_player') && playerOpen()) return false;
        if (document && document.hidden) return false;
        if (Date.now() < manualHoldUntil) return false;
        if (Date.now() - lastSwitchAt < num('cooldown') * 1000) return false;
        return true;
    }
    function changeServer(next, source) {
        if (next !== 'one' && next !== 'two') return false;
        if (!serverAddress(next)) {
            if (source !== 'auto') notify(serverName(next) + ': адрес не указан');
            return false;
        }
        if (current() === next) return true;
        internalSelection = true;
        try {
            Lampa.Storage.set(SELECT_KEY,next);
            if (current() !== next) throw new Error('Storage rejected change');
            lastSwitchAt = Date.now();
            if (source === 'manual' && mode() === 'auto')
                manualHoldUntil = lastSwitchAt + num('cooldown') * 1000;
            notify((source === 'auto' ? 'AUTO: ' : '') +
                'Выбран ' + serverName(next));
            return true;
        } catch (error) {
            console.warn('[TorrServer Switch Pro] Could not change server',error);
            return false;
        } finally {
            internalSelection = false;
            refresh();
        }
    }
    function encodeBasic() {
        try {
            if (Lampa.Storage.field('torrserver_auth') !== true &&
                Lampa.Storage.field('torrserver_auth') !== 'true') return '';
            var login = String(Lampa.Storage.get('torrserver_login') || '');
            var password = String(Lampa.Storage.get('torrserver_password') || '');
            var combined = login + ':' + password;
            if (Lampa.Base64 && Lampa.Base64.encode) return Lampa.Base64.encode(combined);
            if (window.btoa) return window.btoa(unescape(encodeURIComponent(combined)));
        } catch (ignored) {}
        return '';
    }
    function probe(slot, callback) {
        var url = urlFor(slot), start = Date.now();
        if (!url) {
            callback({state:'unconfigured',rtt:null,reason:'Адрес не указан',version:''});
            return;
        }
        if (!window.XMLHttpRequest) {
            callback({state:'unknown',rtt:null,reason:'HTTP-проверки недоступны',version:''});
            return;
        }
        var xhr = new window.XMLHttpRequest(), completed = false;
        var token = probeGeneration;
        inFlight.push(xhr);
        function finish(result) {
            if (completed) return;
            completed = true;
            var index = inFlight.indexOf(xhr);
            if (index >= 0) inFlight.splice(index,1);
            if (!active || token !== probeGeneration) return;
            callback(result);
        }
        try {
            xhr.open('GET',url,true);
            xhr.timeout = num('timeout');
            xhr.setRequestHeader('Accept','text/plain');
            var credentials = encodeBasic();
            if (credentials) xhr.setRequestHeader('Authorization','Basic ' + credentials);
            xhr.onload = function () {
                var code = Number(xhr.status) || 0;
                var body = String(xhr.responseText || '').trim().slice(0,96);
                if (code >= 200 && code < 300 && /^(?:MatriX|TorrServer)(?:[.\s/-]|$)/i.test(body)) {
                    finish({state:'online',rtt:Math.max(0,Date.now()-start),
                        reason:'OK',version:body.replace(/[\r\n].*$/,'').slice(0,36)});
                } else if (code >= 500) {
                    finish({state:'offline',rtt:null,reason:'HTTP ' + code,version:''});
                } else if (code === 401 || code === 403) {
                    finish({state:'unknown',rtt:null,reason:'Требуется авторизация',version:''});
                } else {
                    finish({state:'unknown',rtt:null,reason:'Неподходящий ответ HTTP ' + code,
                        version:''});
                }
            };
            xhr.onerror = function () {
                finish({state:stats[slot].lastOk ? 'offline':'unknown',
                    rtt:null,reason:'Сеть, CORS или HTTPS-блокировка',version:''});
            };
            xhr.ontimeout = function () {
                finish({state:'offline',rtt:null,reason:'Таймаут',version:''});
            };
            xhr.onabort = function () {
                finish({state:'unknown',rtt:null,reason:'Запрос прерван',version:''});
            };
            xhr.send(null);
        } catch (error) {
            finish({state:'unknown',rtt:null,reason:'Недоступная проверка',version:''});
        }
    }
    function updateStatus(slot, result) {
        var st = stats[slot];
        st.state = result.state;
        st.rtt = result.rtt;
        st.reason = result.reason;
        st.version = result.version;
        st.checked = Date.now();
        if (result.state === 'online') {
            st.successes++;
            st.failures = 0;
            st.lastOk = st.checked;
        } else if (result.state === 'offline' || result.state === 'unconfigured') {
            st.failures++;
            st.successes = 0;
        } else {
            // CORS, authentication and unexpected replies are not evidence of an outage.
            st.failures = 0;
            st.successes = 0;
        }
        refresh();
    }
    function autoDecide() {
        if (!canAutoChange()) return;
        var slot = current(), alternate = slot === 'one' ? 'two' : 'one';
        var bad = stats[slot], good = stats[alternate];
        if (bad.failures >= num('fail_count') &&
            good.state === 'online' && good.checked &&
            Date.now()-good.checked < num('interval')*2000) {
            changeServer(alternate,'auto');
            return;
        }
        if (slot === 'two' && yes('return_primary') &&
            stats.one.state === 'online' &&
            stats.one.successes >= num('recovery_count') &&
            stats.one.checked &&
            Date.now()-stats.one.checked < num('interval')*2000) {
            changeServer('one','auto');
        }
    }
    function abortAll() {
        probeGeneration++;
        var items = inFlight.splice(0);
        items.forEach(function (xhr) {try {xhr.abort();} catch (ignored) {}});
        inProgress = false;
    }
    function stopChecks() {
        if (checkTimer !== null) clearTimeout(checkTimer);
        checkTimer = null;
        abortAll();
    }
    function schedule(delay) {
        if (checkTimer !== null) clearTimeout(checkTimer);
        checkTimer = null;
        if (!active || !initialized || !enabled() || !yes('monitor')) return;
        checkTimer = setTimeout(function () {
            checkTimer = null;
            checkAll();
        },delay);
    }
    function checkAll() {
        if (!active || !initialized || !enabled() || !yes('monitor')) return;
        if (inProgress) return;
        if ((document && document.hidden) ||
            (window.navigator && window.navigator.onLine === false)) {
            schedule(num('interval')*1000);
            return;
        }
        inProgress = true;
        var count = 0, generation = probeGeneration;
        ['one','two'].forEach(function (slot) {
            stats[slot].state = 'checking';
            refresh();
            probe(slot,function (result) {
                if (!active || generation !== probeGeneration) return;
                updateStatus(slot,result);
                count++;
                if (count === 2) {
                    inProgress = false;
                    autoDecide();
                    schedule(num('interval')*1000);
                }
            });
        });
    }
    function checkNow() {
        if (!active) return;
        stopChecks();
        if (enabled()) {
            // Explicit check also works if periodic monitoring was switched off.
            var oldMonitor = yes('monitor');
            if (!oldMonitor) {
                var completed = 0;
                ['one','two'].forEach(function (slot) {
                    stats[slot].state = 'checking';
                    probe(slot,function (result) {
                        updateStatus(slot,result);
                        if (++completed === 2) notify('Проверка TorrServer завершена');
                    });
                });
            } else {
                checkAll();
            }
        } else notify('Плагин отключён в настройках');
    }
    function manualToggle(target) {
        if (!active || !initialized || !enabled()) return;
        var now = Date.now();
        if (now-lastClick < 450) return;
        lastClick = now;
        var next = target || (current()==='one'?'two':'one');
        if (!serverAddress(next)) {
            notify(serverName(next)+': адрес не указан');
            return;
        }
        if (yes('verify_manual')) {
            notify('Проверка '+serverName(next)+'…');
            var oldTarget = current();
            probe(next,function (result) {
                updateStatus(next,result);
                if (current() !== oldTarget) return;
                if (result.state === 'online') changeServer(next,'manual');
                else notify(serverName(next)+': '+diagnose(result)+'. Переключение отменено');
            });
        } else changeServer(next,'manual');
    }
    function markHeaderLayout(present) {
        try {
            var head=Lampa.Head.render();
            if (!head || !head.find) return;
            var body=head.find('.head__body');
            if (body && body.length) body.toggleClass('alex-ts-header-present',!!present);
        } catch (ignored) {}
    }
    function ensureCss() {
        if (!document || !document.head || !document.createElement) return;
        var style = document.getElementById(CSS_ID);
        if (!style) {
            style=document.createElement('style');
            style.id=CSS_ID;
            document.head.appendChild(style);
        }
        // Lampa's own .head__action is 2.8em round; native mobile is 3em.
        // Faces must be absolutely positioned: inline span height/transform
        // caused both frames to overlap in v2.1.0 on iOS WebKit.
        style.textContent =
            '.head__action.'+BUTTON_CLASS+'{' +
                'position:relative!important;box-sizing:border-box!important;' +
                'display:flex!important;align-items:center!important;justify-content:center!important;' +
                'width:2.8em!important;min-width:2.8em!important;height:2.8em!important;' +
                'flex:0 0 2.8em!important;padding:0!important;border-radius:50%!important;' +
                'background:rgba(43,45,48,.96)!important;color:#f9fafb!important;' +
                'overflow:visible!important;cursor:pointer!important;' +
                'transition:background-color .15s ease!important;}' +
            'body.true--mobile .head__action.'+BUTTON_CLASS+'{' +
                'width:3em!important;min-width:3em!important;height:3em!important;' +
                'flex-basis:3em!important;}' +
            '.head__action.'+BUTTON_CLASS+'[data-layout="pill"]{' +
                'width:5.6em!important;min-width:5.6em!important;' +
                'flex-basis:5.6em!important;border-radius:.65em!important;}' +
            'body.true--mobile .head__action.'+BUTTON_CLASS+'[data-layout="pill"]{' +
                'width:5.6em!important;min-width:5.6em!important;flex-basis:5.6em!important;}' +
            '.'+BUTTON_CLASS+' .alex-ts-switch-viewport{' +
                'display:block!important;position:absolute!important;' +
                'top:.22em;bottom:.22em;left:.18em;right:.18em;' +
                'box-sizing:border-box;overflow:hidden!important;' +
                'pointer-events:none;border-radius:inherit;}' +
            '.'+BUTTON_CLASS+' .alex-ts-switch-face{' +
                'display:flex!important;position:absolute!important;' +
                'top:0;right:0;bottom:0;left:0;inset:0;' +
                'width:100%;height:100%;box-sizing:border-box;' +
                'flex-direction:column;align-items:center;justify-content:center;' +
                'white-space:nowrap;line-height:1.04;opacity:1;' +
                'transform:translate3d(0,0,0);' +
                'transition:transform .25s ease,opacity .18s ease;}' +
            '.'+BUTTON_CLASS+' .alex-ts-switch-ping{' +
                'opacity:0;transform:translate3d(0,105%,0);}' +
            '.'+BUTTON_CLASS+'[data-phase="ping"] .alex-ts-switch-server{' +
                'opacity:0;transform:translate3d(0,-105%,0);}' +
            '.'+BUTTON_CLASS+'[data-phase="ping"] .alex-ts-switch-ping{' +
                'opacity:1;transform:translate3d(0,0,0);}' +
            '.'+BUTTON_CLASS+'[data-animate="off"] .alex-ts-switch-face{' +
                'transition:none!important;}' +
            '.'+BUTTON_CLASS+' .alex-ts-switch-kicker{' +
                'display:block;font-size:.63em;font-weight:650;letter-spacing:.02em;line-height:1;}' +
            '.'+BUTTON_CLASS+' .alex-ts-switch-number{' +
                'display:block;font-size:1.3em;font-weight:700;line-height:1.02;}' +
            '.'+BUTTON_CLASS+' .alex-ts-switch-ping-value{' +
                'display:block;font-size:1em;font-weight:700;line-height:1.08;letter-spacing:-.04em;}' +
            '.'+BUTTON_CLASS+' .alex-ts-switch-ping-unit{' +
                'display:block;font-size:.6em;font-weight:600;line-height:1.05;}' +
            '.'+BUTTON_CLASS+' .alex-ts-switch-dot{' +
                'position:absolute;z-index:2;top:.08em;right:.08em;' +
                'width:.46em;height:.46em;box-sizing:border-box;border-radius:50%;' +
                'background:#a7acb5;border:.09em solid #1c1d1e;pointer-events:none;}' +
            '.'+BUTTON_CLASS+'.alex-ts-state-online .alex-ts-switch-dot{background:#70d99f;}' +
            '.'+BUTTON_CLASS+'.alex-ts-state-offline .alex-ts-switch-dot{background:#ee7070;}' +
            '.'+BUTTON_CLASS+' .alex-ts-switch-auto{' +
                'position:absolute;z-index:2;bottom:.04em;left:.04em;' +
                'display:flex;align-items:center;justify-content:center;' +
                'width:1.4em;height:1.4em;box-sizing:border-box;' +
                'background:#496784;color:#fff;border:.16em solid #1c1d1e;' +
                'border-radius:50%;font-size:.55em;font-weight:700;pointer-events:none;}' +
            '.head__action.'+BUTTON_CLASS+'.focus,' +
            '.head__action.'+BUTTON_CLASS+'.hover{' +
                'background:#fff!important;color:#151719!important;' +
                'outline:2px solid white!important;outline-offset:2px!important;}' +
            '@media screen and (max-width:480px){' +
                'body.true--mobile .head__action.'+BUTTON_CLASS+'[data-layout="pill"]{' +
                    'width:3em!important;min-width:3em!important;height:3em!important;' +
                    'flex-basis:3em!important;border-radius:50%!important;}' +
            '}' +
            '@media screen and (max-width:640px){' +
                '.head__body.alex-ts-header-present .head__title{display:none!important;}' +
            '}' +
            '@media(prefers-reduced-motion:reduce){' +
                '.'+BUTTON_CLASS+' .alex-ts-switch-face{transition:none!important;}' +
            '}';
    }
    function mountHeader() {
        if (!active || !hasLampa() || !enabled() || !yes('header')) return;
        if (button && button.length) return;
        try {
            var head=Lampa.Head.render();
            if (!head || !head.find('.head__actions').length) return;
            ensureCss();
            var content='<div class="head__action selector '+BUTTON_CLASS+
                '" role="button" tabindex="0" data-phase="server" data-layout="round" data-animate="on">'+
                '<span class="alex-ts-switch-viewport">'+
                '<span class="alex-ts-switch-face alex-ts-switch-server">'+
                '<span class="alex-ts-switch-kicker">TS</span>'+
                '<span class="alex-ts-switch-number">1</span></span>'+
                '<span class="alex-ts-switch-face alex-ts-switch-ping">'+
                '<span class="alex-ts-switch-ping-value">—</span>'+
                '<span class="alex-ts-switch-ping-unit">ms</span></span>'+
                '</span><span class="alex-ts-switch-dot"></span>'+
                '<span class="alex-ts-switch-auto">A</span></div>';
            button=window.$(content);
            pointerInside=false;
            button.on('click.alex_ts_switch',function (e) {
                if (e && e.stopPropagation) e.stopPropagation();
                manualToggle();
            });
            button.on('mouseenter.alex_ts_switch',function () {pointerInside=true;});
            button.on('mouseleave.alex_ts_switch',function () {pointerInside=false;});
            Lampa.Head.addElement(button,manualToggle);
            markHeaderLayout(true);
            lastPresentationMode='';
        } catch (error) {
            button=null;
            markHeaderLayout(false);
            console.warn('[TorrServer Switch Pro] Header init failed',error);
        }
    }
    function configChanged() {
        if (!active || !initialized) return;
        abortAll();
        stats.one=freshStatus();
        stats.two=freshStatus();
        refresh();
        if (checkTimer !== null) clearTimeout(checkTimer);
        checkTimer=null;
        if (enabled() && yes('monitor')) schedule(50);
    }
    function addSetting(kind,key,title,description,values,onChange) {
        var data={component:COMP,param:{name:P+key,type:kind,default:DEFAULTS[key]},
            field:{name:title,description:description || ''}};
        if (values) data.param.values=values;
        if (onChange) data.onChange=onChange;
        Lampa.SettingsApi.addParam(data);
    }
    function addTitle(text) {
        Lampa.SettingsApi.addParam({component:COMP,param:{type:'title'},field:{name:text}});
    }
    function addButton(name,title,description,action) {
        Lampa.SettingsApi.addParam({component:COMP,
            param:{name:P+name,type:'button'},
            field:{name:title,description:description || ''},onChange:action});
    }
    function addServerAddress(slot) {
        var key=slot==='one'?'torrserver_url':'torrserver_url_two';
        Lampa.SettingsApi.addParam({
            component:COMP,
            param:{name:key,type:'input',default:'',values:'',placeholder:'http://host:8090'},
            field:{
                name:slot==='one'?'Адрес основного TS 1':'Адрес дополнительного TS 2',
                description:'Штатный адрес TorrServer в настройках Lampa.'
            },
            onChange:configChanged
        });
    }
    function addStatus(slot) {
        Lampa.SettingsApi.addParam({component:COMP,
            param:{type:'static'},field:{name:serverName(slot),description:statusLine(slot)},
            onRender:function (item) {
                item.attr('data-alex-ts-info',slot);
                item.find('.settings-param__descr').text(statusLine(slot));
            }});
    }
    function registerSettings() {
        if (!Lampa.SettingsApi || !Lampa.SettingsApi.addComponent) return;
        // Re-register cleanly when a new revision loads without restarting Lampa.
        try {Lampa.SettingsApi.removeComponent(COMP);} catch (ignored) {}
        Lampa.SettingsApi.addComponent({component:COMP,name:'TorrServer Switch Pro',
            icon:'<svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="5" width="28" height="11" rx="3"/><rect x="4" y="20" width="28" height="11" rx="3"/><path d="M10 11h2M10 26h2M18 11h8M18 26h8"/></svg>'
        });
        addTitle('Подключение TorrServer');
        addServerAddress('one');
        addServerAddress('two');
        addTitle('Основные настройки');
        addSetting('trigger','enabled','Включить плагин','Полностью выключает переключатель и проверки.',null,function(){configChanged();});
        addSetting('trigger','header','Кнопка в верхней панели','Показывать переключатель в шапке Lampa.',null,presentationChanged);
        addSetting('select','mode','Режим переключения',
            'AUTO выбирает доступный резерв после нескольких ошибок, MANUAL не переключает автоматически.',
            OPTIONS.mode,configChanged);
        addSetting('trigger','monitor','Мониторинг серверов',
            'Периодически проверять оба сервера по GET /echo.',null,configChanged);
        addSetting('trigger','notify','Уведомления',
            'Сообщения о ручной/автоматической смене и ошибках.',null,refresh);
        addTitle('Внешний вид кнопки');
        addSetting('select','layout','Форма кнопки',
            'Круглая соответствует штатным элементам Lampa; плашка шире.',
            OPTIONS.layout,presentationChanged);
        addSetting('select','display','Что показывать',
            'Только номер TS, только HTTP-задержку или их чередование.',
            OPTIONS.display,presentationChanged);
        addSetting('trigger','animate','Плавная прокрутка',
            'При отключении TS и задержка сменяются без анимации.',null,presentationChanged);
        addSetting('select','ts_duration','Время показа TS',
            'Длительность показа номера в режиме чередования.',
            OPTIONS.ts_duration,presentationChanged);
        addSetting('select','ping_duration','Время показа задержки',
            'Длительность показа HTTP RTT в режиме чередования.',
            OPTIONS.ping_duration,presentationChanged);
        addSetting('trigger','pause_focus','Пауза при фокусе',
            'При наведении мыши или выборе пультом содержимое не прокручивается.',
            null,presentationChanged);
        addSetting('trigger','compact_ping','Сокращать большую задержку',
            'Например, 1250 ms → 1.25 s, чтобы число помещалось в круге.',
            null,presentationChanged);
        addSetting('trigger','show_status','Точка состояния',
            'Зелёная — доступен, красная — недоступен, серая — статус неизвестен.',
            null,presentationChanged);
        addSetting('trigger','auto_badge','Метка AUTO',
            'Показывать маленькую букву A при автоматическом режиме.',
            null,presentationChanged);
        addTitle('Проверки и резервирование');
        addSetting('select','interval','Интервал проверок','Частота запросов к обоим серверам.',
            OPTIONS.interval,configChanged);
        addSetting('select','timeout','Таймаут ответа','Максимальное ожидание GET /echo.',
            OPTIONS.timeout,configChanged);
        addSetting('select','fail_count','Ошибок до перехода','Сколько подряд ошибок активного сервера требуется в AUTO.',
            OPTIONS.fail_count,configChanged);
        addSetting('trigger','return_primary','Возврат на основной',
            'AUTO возвращает TS 1 после подтверждения стабильной работы.',null,configChanged);
        addSetting('select','recovery_count','Успешных проверок для возврата',
            'Подтверждение восстановления основного сервера.',
            OPTIONS.recovery_count,configChanged);
        addSetting('select','cooldown','Пауза между переключениями',
            'Ограничивает частоту автоматических смен и ручных переопределений.',
            OPTIONS.cooldown,configChanged);
        addSetting('trigger','pause_player','Не менять при просмотре',
            'AUTO не переключает сервер, пока открыт встроенный проигрыватель.',
            null,refresh);
        addSetting('trigger','verify_manual','Проверять перед ручной сменой',
            'При недоступном /echo ручное переключение отменяется (возможно ограничение CORS).',
            null,refresh);
        addTitle('Диагностика и управление');
        addStatus('one');
        addStatus('two');
        addButton('check_now','Проверить оба сервера','Запустить проверку сейчас.',checkNow);
        addButton('choose_one','Выбрать основной TS 1','Принудительно переключить на основной.',function(){manualToggle('one');});
        addButton('choose_two','Выбрать дополнительный TS 2','Принудительно переключить на дополнительный.',function(){manualToggle('two');});
        addButton('reset','Сбросить настройки плагина',
            'Адреса TorrServer и текущий выбор не изменяются.',function () {
                Object.keys(DEFAULTS).forEach(function (key) {
                    Lampa.Storage.set(P+key,DEFAULTS[key]);
                });
                configChanged();
                notify('Настройки TorrServer Switch Pro сброшены');
                if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update();
            });
        try {
            if (Lampa.Settings && Lampa.Settings.main && Lampa.Settings.main().update)
                Lampa.Settings.main().update();
        } catch (ignored) {}
    }
    function storageChanged(event) {
        if (!active || !event || !initialized) return;
        if (event.name === SELECT_KEY) {
            if (!internalSelection && mode()==='auto')
                manualHoldUntil=Date.now()+num('cooldown')*1000;
            restartPresentation();
            refresh();
            return;
        }
        if (event.name === 'torrserver_url' || event.name === 'torrserver_url_two' ||
            event.name === 'torrserver_auth' ||
            event.name === 'torrserver_login' || event.name === 'torrserver_password') {
            configChanged();
            return;
        }
        if (event.name.indexOf(P) === 0) {
            var uiKey=event.name.slice(P.length);
            if ({header:1,show_status:1,show_latency:1,notify:1,
                 layout:1,display:1,animate:1,ts_duration:1,ping_duration:1,
                 pause_focus:1,compact_ping:1,auto_badge:1}[uiKey]) presentationChanged();
            else configChanged();
        }
    }
    function init() {
        if (!active || initialized || !hasLampa()) return false;
        initialized=true;
        registerSettings();
        if (Lampa.Storage.listener && Lampa.Storage.listener.follow)
            Lampa.Storage.listener.follow('change',storageChanged);
        if (Lampa.Settings && Lampa.Settings.listener && Lampa.Settings.listener.follow)
            Lampa.Settings.listener.follow('open',function (event) {
                if (active && event && event.name===COMP) refreshSettings();
            });
        if (window.addEventListener) window.addEventListener('focus',onFocus);
        mountHeader();
        refresh();
        if (enabled() && yes('monitor')) schedule(250);
        return true;
    }
    function onFocus() {
        if (active && initialized && enabled() && yes('monitor') &&
            !inProgress) schedule(500);
    }
    function boot() {
        if (init()) return;
        var attempts=0;
        startTimer=setInterval(function () {
            if (init() || !active || ++attempts >= 120) {
                clearInterval(startTimer);
                startTimer=null;
            }
        },500);
    }

    var instance={
        version:VERSION,
        status:stats,
        toggle:function(){manualToggle();},
        check:checkNow,
        refresh:refresh,
        destroy:function () {
            active=false;
            if (startTimer!==null) clearInterval(startTimer);
            if (checkTimer!==null) clearTimeout(checkTimer);
            if (refreshTimer!==null) clearTimeout(refreshTimer);
            stopPresentation();
            abortAll();
            if (window.removeEventListener) window.removeEventListener('focus',onFocus);
            if (button) {button.remove();button=null;}
            markHeaderLayout(false);
            try {if (window.Lampa && Lampa.SettingsApi && Lampa.SettingsApi.removeComponent)
                Lampa.SettingsApi.removeComponent(COMP);} catch (ignored) {}
        }
    };
    window[SINGLETON]=instance;
    boot();
})(window, document);
