/**
 * TorrServer Switch Pro
 * Version: 1.0.0
 * Author: Alexgood321
 * Quickly toggle Lampa's native primary/secondary TorrServer selection.
 */
(function (window, document) {
    'use strict';

    var ID = 'alexgood321_torrserver_switch';
    var VERSION = '1.0.0';
    var KEY = 'torrserver_use_link';
    var READY_KEY = '__alexgood321TorrServerSwitch';
    var STYLE_ID = 'alexgood321-ts-switch-style';
    var CLASS = 'alexgood321-ts-switch';
    var plugin = {version: VERSION, active: true, button: null, timer: null};
    var lastActionAt = 0;
    var listenerAttached = false;

    if (window[READY_KEY] && typeof window[READY_KEY].destroy === 'function') {
        window[READY_KEY].destroy();
    }
    window[READY_KEY] = plugin;

    function apiReady() {
        return typeof window.Lampa !== 'undefined' &&
            Lampa.Storage && typeof Lampa.Storage.get === 'function' &&
            typeof Lampa.Storage.set === 'function' &&
            typeof Lampa.Storage.field === 'function' &&
            Lampa.Head && typeof Lampa.Head.addElement === 'function' &&
            typeof Lampa.Head.render === 'function' &&
            typeof window.$ === 'function';
    }

    function selected() {
        return Lampa.Storage.field(KEY) === 'two' ? 'two' : 'one';
    }

    function address(slot) {
        var value = Lampa.Storage.get(slot === 'two' ? 'torrserver_url_two' : 'torrserver_url');
        return String(value || '').trim();
    }

    function notify(message) {
        if (Lampa.Noty && typeof Lampa.Noty.show === 'function') {
            Lampa.Noty.show(message);
        } else if (window.console && typeof console.info === 'function') {
            console.info('[TorrServer Switch]', message);
        }
    }

    function refresh() {
        if (!plugin.active || !plugin.button || !plugin.button.length || !apiReady()) return;
        var current = selected();
        var number = current === 'two' ? '2' : '1';
        var label = current === 'two' ? 'дополнительный' : 'основной';
        var configured = !!address(current);
        var title = 'TorrServer ' + number + ' (' + label + ')' +
            (configured ? '. Нажмите для переключения.' : '. Адрес не указан.');

        plugin.button.find('.alexgood321-ts-switch-label').text('TS ' + number);
        plugin.button.toggleClass('alexgood321-ts-switch--two', current === 'two');
        plugin.button.toggleClass('alexgood321-ts-switch--missing', !configured);
        plugin.button.attr('title', title);
        plugin.button.attr('aria-label', title);
        plugin.button.attr('data-active-server', current);
    }

    function toggle() {
        if (!plugin.active || !apiReady()) return;
        var now = Date.now();
        if (now - lastActionAt < 400) return;
        lastActionAt = now;

        var next = selected() === 'two' ? 'one' : 'two';
        if (!address(next)) {
            notify(next === 'two'
                ? 'Дополнительный TorrServer не указан в настройках.'
                : 'Основной TorrServer не указан в настройках.');
            refresh();
            return;
        }

        try {
            Lampa.Storage.set(KEY, next);
            refresh();
            if (selected() === next) {
                notify('Выбран TorrServer ' + (next === 'two' ? '2 (дополнительный)' : '1 (основной)'));
            } else {
                notify('Не удалось переключить TorrServer.');
            }
        } catch (error) {
            refresh();
            notify('Ошибка переключения TorrServer.');
            if (window.console && console.error) console.error('[TorrServer Switch]', error);
        }
    }

    function ensureStyle() {
        if (!document || !document.head || !document.createElement || document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
            '.head__action.' + CLASS + '{' +
            'box-sizing:border-box!important;display:inline-flex!important;' +
            'align-items:center!important;justify-content:center!important;' +
            'flex-shrink:0!important;gap:.28em!important;' +
            'width:auto!important;min-width:3.8em!important;' +
            'height:2.7em!important;padding:0 .55em!important;' +
            'border-radius:.6em!important;background:rgba(55,112,104,.33)!important;' +
            'box-shadow:inset 0 0 0 1px rgba(125,211,186,.5)!important;' +
            'color:#e5fbf4!important;cursor:pointer!important;}' +
            '.head__action.' + CLASS + '.alexgood321-ts-switch--two{' +
            'background:rgba(139,105,54,.35)!important;' +
            'box-shadow:inset 0 0 0 1px rgba(232,184,103,.57)!important;' +
            'color:#ffe3aa!important;}' +
            '.head__action.' + CLASS + '.alexgood321-ts-switch--missing{' +
            'opacity:.66!important;}' +
            '.' + CLASS + ' svg{width:1.1em!important;height:1.1em!important;' +
            'flex-shrink:0;fill:none;stroke:currentColor;stroke-width:1.8;' +
            'stroke-linecap:round;stroke-linejoin:round;}' +
            '.' + CLASS + ' .alexgood321-ts-switch-label{' +
            'font-size:.78em;font-weight:700;white-space:nowrap;letter-spacing:.02em;}' +
            '.head__action.' + CLASS + '.focus,' +
            '.head__action.' + CLASS + '.hover,' +
            '.head__action.' + CLASS + ':focus-visible{' +
            'outline:2px solid #fff!important;outline-offset:2px!important;}' +
            '@media(max-width:480px){.head__action.' + CLASS + '{' +
            'min-width:3.4em!important;height:2.5em!important;padding:0 .4em!important;' +
            '}}';
        document.head.appendChild(style);
    }

    function attachStorageListener() {
        if (listenerAttached || !Lampa.Storage.listener ||
            typeof Lampa.Storage.listener.follow !== 'function') return;
        listenerAttached = true;
        Lampa.Storage.listener.follow('change', function (event) {
            if (plugin.active && event &&
                (event.name === KEY || event.name === 'torrserver_url' ||
                 event.name === 'torrserver_url_two')) refresh();
        });
    }

    function mount() {
        if (!plugin.active || !apiReady()) return false;
        var head;
        try {
            head = Lampa.Head.render();
            if (!head || !head.length || !head.find('.head__actions').length) return false;
        } catch (error) { return false; }

        if (plugin.button && plugin.button.length &&
            head.find('.' + CLASS).length) {
            refresh();
            return true;
        }

        ensureStyle();
        var html = '<div class="head__action selector ' + CLASS + '" role="button" tabindex="0">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="3" y="3" width="18" height="7" rx="2"/>' +
            '<rect x="3" y="14" width="18" height="7" rx="2"/>' +
            '<path d="M7 6.5h.01M7 17.5h.01M11 6.5h7M11 17.5h7"/>' +
            '</svg><span class="alexgood321-ts-switch-label">TS 1</span></div>';
        var button = window.$(html);
        button.on('click.alexgood321_ts_switch', function (event) {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            toggle();
        });
        Lampa.Head.addElement(button, toggle);
        plugin.button = button;
        attachStorageListener();
        refresh();
        return true;
    }

    function start() {
        if (mount()) return;
        var attempts = 0;
        plugin.timer = window.setInterval(function () {
            if (!plugin.active || mount() || ++attempts >= 60) {
                window.clearInterval(plugin.timer);
                plugin.timer = null;
            }
        }, 500);
    }

    plugin.destroy = function () {
        plugin.active = false;
        if (plugin.timer !== null) window.clearInterval(plugin.timer);
        plugin.timer = null;
        if (plugin.button) plugin.button.remove();
        plugin.button = null;
    };

    plugin.toggle = toggle;
    plugin.refresh = refresh;
    plugin.mount = mount;

    if (window.Lampa) {
        Lampa.Manifest = Lampa.Manifest || {};
        Lampa.Manifest.plugins = Lampa.Manifest.plugins || {};
        Lampa.Manifest.plugins[ID] = {
            type: 'other', name: 'TorrServer Switch Pro', version: VERSION,
            description: 'Переключение основного и дополнительного TorrServer в верхней панели.'
        };
    }

    start();
})(window, document);
