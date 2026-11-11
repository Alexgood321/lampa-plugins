/**
 * TorrServer Switch Pro
 * Version: 2.0.1
 * Author: Alexgood321
 * Native Lampa settings, two-server health monitoring, guarded AUTO failover.
 */
(function (window, document) {
    'use strict';

    var VERSION = '2.0.1';
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
        notify: true, verify_manual: false
    };
    var OPTIONS = {
        mode: {manual:'Ручной',auto:'Автоматический'},
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
    function refreshHeader() {
        if (!active || !hasLampa()) return;
        if (!enabled() || !yes('header')) {
            if (button) {button.remove();button = null;}
            return;
        }
        if (!button) mountHeader();
        if (!button) return;
        var slot = current(), s = stats[slot], txt = serverName(slot);
        if (mode() === 'auto') txt += ' AUTO';
        if (yes('show_latency') && s.state === 'online' && s.rtt !== null)
            txt += ' ' + s.rtt + 'ms';
        button.find('.alex-ts-switch-label').text(txt);
        button.removeClass('alex-ts-state-online alex-ts-state-offline alex-ts-state-unknown');
        button.addClass('alex-ts-state-' +
            (yes('show_status') ? (s.state === 'online' || s.state === 'offline' ?
                s.state : 'unknown') : 'unknown'));
        button.find('.alex-ts-switch-dot').toggle(yes('show_status'));
        button.attr('data-server',slot);
        button.attr('data-mode',mode());
        button.attr('title',serverName(slot) + ' · ' +
            (mode() === 'auto' ? 'AUTO' : 'MANUAL') + ' · ' + diagnose(s) +
            '. Нажмите для переключения');
        button.attr('aria-label',button.attr('title'));
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
    function ensureCss() {
        if (!document || !document.head || !document.createElement) return;
        var style = document.getElementById(CSS_ID);
        if (!style) {
            style=document.createElement('style');
            style.id=CSS_ID;
            document.head.appendChild(style);
        }
        style.textContent =
            '.head__action.'+BUTTON_CLASS+'{display:inline-flex!important;align-items:center!important;'+
            'justify-content:center!important;gap:.3em!important;flex-shrink:0!important;'+
            'width:auto!important;min-width:3.7em!important;height:2.7em!important;'+
            'padding:0 .6em!important;border-radius:.55em!important;'+
            'background:rgba(135,145,160,.18)!important;'+
            'box-shadow:inset 0 0 0 1px rgba(200,210,220,.45)!important;'+
            'color:#edf1f8!important;box-sizing:border-box!important;cursor:pointer!important}'+
            '.'+BUTTON_CLASS+' .alex-ts-switch-label{font-size:.77em;font-weight:700;white-space:nowrap}'+
            '.'+BUTTON_CLASS+' .alex-ts-switch-dot{width:.46em;height:.46em;'+
            'border-radius:50%;background:#a6acb7;flex-shrink:0}'+
            '.head__action.'+BUTTON_CLASS+'.alex-ts-state-online{'+
            'background:rgba(55,127,100,.32)!important;'+
            'box-shadow:inset 0 0 0 1px rgba(98,209,157,.55)!important}'+
            '.'+BUTTON_CLASS+'.alex-ts-state-online .alex-ts-switch-dot{background:#62d69c}'+
            '.head__action.'+BUTTON_CLASS+'.alex-ts-state-offline{'+
            'background:rgba(148,62,63,.35)!important;'+
            'box-shadow:inset 0 0 0 1px rgba(240,104,104,.55)!important}'+
            '.'+BUTTON_CLASS+'.alex-ts-state-offline .alex-ts-switch-dot{background:#f16d6d}'+
            '.head__action.'+BUTTON_CLASS+'.focus,'+
            '.head__action.'+BUTTON_CLASS+'.hover{'+
            'outline:2px solid white!important;outline-offset:2px!important}'+
            '@media(max-width:480px){.head__action.'+BUTTON_CLASS+'{'+
            'min-width:3.2em!important;padding:0 .4em!important;height:2.45em!important}}';
    }
    function mountHeader() {
        if (!active || !hasLampa() || !enabled() || !yes('header')) return;
        if (button && button.length) return;
        try {
            var head = Lampa.Head.render();
            if (!head || !head.find('.head__actions').length) return;
            ensureCss();
            var content='<div class="head__action selector '+BUTTON_CLASS+'" role="button" tabindex="0">'+
                '<span class="alex-ts-switch-dot"></span>'+
                '<span class="alex-ts-switch-label">TS 1</span></div>';
            button=window.$(content);
            button.on('click.alex_ts_switch',function (e) {
                if (e && e.stopPropagation) e.stopPropagation();
                manualToggle();
            });
            Lampa.Head.addElement(button,manualToggle);
        } catch (e) {
            button=null;
            console.warn('[TorrServer Switch Pro] Header init failed',e);
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
        addSetting('trigger','header','Кнопка в верхней панели','Показывать TS 1 / TS 2 в шапке Lampa.',null,refreshHeader);
        addSetting('select','mode','Режим переключения',
            'AUTO выбирает доступный резерв после нескольких ошибок, MANUAL не переключает автоматически.',
            OPTIONS.mode,configChanged);
        addSetting('trigger','monitor','Мониторинг серверов',
            'Периодически проверять оба сервера по GET /echo.',null,configChanged);
        addSetting('trigger','show_status','Цвет состояния кнопки',
            'Зелёный — доступен, красный — недоступен, серый — проверка невозможна.',null,refreshHeader);
        addSetting('trigger','show_latency','Время ответа в кнопке',
            'Показывать HTTP RTT в миллисекундах, если сервер доступен.',null,refreshHeader);
        addSetting('trigger','notify','Уведомления',
            'Сообщения о ручной/автоматической смене и ошибках.',null,refresh);
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
            refresh();
            return;
        }
        if (event.name === 'torrserver_url' || event.name === 'torrserver_url_two' ||
            event.name === 'torrserver_auth' ||
            event.name === 'torrserver_login' || event.name === 'torrserver_password') {
            configChanged();
            return;
        }
        if (event.name.indexOf(P) === 0) configChanged();
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
            abortAll();
            if (window.removeEventListener) window.removeEventListener('focus',onFocus);
            if (button) {button.remove();button=null;}
            try {if (window.Lampa && Lampa.SettingsApi && Lampa.SettingsApi.removeComponent)
                Lampa.SettingsApi.removeComponent(COMP);} catch (ignored) {}
        }
    };
    window[SINGLETON]=instance;
    boot();
})(window, document);
