/**
 * Lampa Plugin: Home Categories Pro (Скрытие и настройка порядка категорий)
 * Version: 2.0.1
 * Author: Lampa Community & Alexgood321
 * Standard: Полное соответствие официальной документации Lampa (docs/ru)
 * Features:
 *   - Мгновенное скрытие любых полок (Сейчас смотрят, Рекомендуем, Тренды, Ожидаемые и др.)
 *   - Интерактивная сортировка (Вверх / Вниз) с поддержкой пульта ТВ и сенсорного экрана
 *   - Официальная интеграция через Lampa.SettingsApi
 *   - Кнопка «Порядок полок» прямо в боковом меню Lampa и в разделе Настройки -> Каналы
 *   - Безопасное управление DOM без повреждения стека Lampa.Activity
 */

(function () {
    'use strict';

    if (window.plugin_home_categories_destroy) {
        try { window.plugin_home_categories_destroy(); } catch (e) {}
    }

    window.plugin_home_categories_ready = true;

    var PERF_START = Date.now();
    var PERF = window.__LampaPluginPerf = window.__LampaPluginPerf || {};
    var HC_PERF = PERF.home_categories = PERF.home_categories || {
        scans: 0, total_ms: 0, max_ms: 0, mutations: 0, scheduled: 0, ready_ms: 0
    };

    var STORAGE_ORDER_KEY = 'home_categories_order_v2';
    var STORAGE_HIDDEN_KEY = 'home_categories_hidden_v2';
    var STORAGE_CUSTOM_KEY = 'home_categories_custom_v2';

    // Базовый список полок Главного экрана
    var BASE_CATEGORIES = [
        { id: 'continue', title: 'Продолжить просмотр', icon: '▶' },
        { id: 'now_watch', title: 'Сейчас смотрят', icon: '👁' },
        { id: 'episodes', title: 'Выходы новых эпизодов', icon: '🗓' },
        { id: 'recommend', title: 'Рекомендуем посмотреть', icon: '★' },
        { id: 'trend_day', title: 'Сегодня в тренде', icon: '🔥' },
        { id: 'trend_week', title: 'В тренде за неделю', icon: '📈' },
        { id: 'popular_movie', title: 'Популярные фильмы', icon: '🎬' },
        { id: 'popular_tv', title: 'Популярные сериалы', icon: '📺' },
        { id: 'upcoming', title: 'Смотрите в кинозалах (Ожидаемые)', icon: '🎟' },
        { id: 'top_movie', title: 'Топ фильмы', icon: '🏆' },
        { id: 'top_tv', title: 'Топ сериалы', icon: '⭐' },
        { id: 'genres', title: 'Подборки жанров (Боевик, Комедия и др.)', icon: '🎭', isGroup: true },
        { id: 'keywords', title: 'Тематические подборки (Космос, Зомби и др.)', icon: '🏷', isGroup: true },
        { id: 'persons', title: 'Популярные актёры / персоны', icon: '👤', isGroup: true }
    ];

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Безопасный биндинг событий: предотвращает двойное срабатывание (hover:enter + click)
    function safeBind(el, fn) {
        var lastTime = 0;
        el.on('hover:enter click', function (e) {
            if (e) {
                if (e.stopPropagation) e.stopPropagation();
                if (e.preventDefault) e.preventDefault();
            }
            var now = Date.now();
            if (now - lastTime < 280) return;
            lastTime = now;
            fn(e);
        });
    }

    function getAllCategories() {
        var custom = [];
        try {
            custom = Lampa.Storage.get(STORAGE_CUSTOM_KEY, []) || [];
        } catch (e) {}

        var list = BASE_CATEGORIES.slice();
        if (Array.isArray(custom)) {
            custom.forEach(function (c) {
                if (c && c.id && !list.some(function (b) { return b.id === c.id; })) {
                    list.push(c);
                }
            });
        }
        return list;
    }

    function registerCustomCategory(catId, title) {
        if (!catId || !title || catId === 'unknown') return;
        try {
            var list = getAllCategories();
            if (list.some(function (c) { return c.id === catId; })) return;

            var newCat = { id: catId, title: title, icon: '📁', isCustom: true };
            var custom = Lampa.Storage.get(STORAGE_CUSTOM_KEY, []) || [];
            if (!Array.isArray(custom)) custom = [];
            custom.push(newCat);
            Lampa.Storage.set(STORAGE_CUSTOM_KEY, custom);

            var order = getSavedOrder();
            if (order.indexOf(catId) === -1) {
                order.push(catId);
                saveOrder(order);
            }
        } catch (e) {
            console.error('HomeCategories: registerCustomCategory error', e);
        }
    }

    function getSavedOrder() {
        var all = getAllCategories();
        var defaultOrder = all.map(function (c) { return c.id; });
        var saved = null;
        try {
            saved = Lampa.Storage.get(STORAGE_ORDER_KEY, null);
        } catch (e) {}

        if (Array.isArray(saved) && saved.length) {
            var order = saved.slice();
            defaultOrder.forEach(function (id) {
                if (order.indexOf(id) === -1) order.push(id);
            });
            return order;
        }
        return defaultOrder;
    }

    function saveOrder(order) {
        try {
            Lampa.Storage.set(STORAGE_ORDER_KEY, order);
        } catch (e) {}
    }

    function getHiddenMap() {
        try {
            return Lampa.Storage.get(STORAGE_HIDDEN_KEY, {}) || {};
        } catch (e) {
            return {};
        }
    }

    function saveHiddenMap(map) {
        try {
            Lampa.Storage.set(STORAGE_HIDDEN_KEY, map);
        } catch (e) {}
    }

    function isCategoryHidden(catId) {
        var map = getHiddenMap();
        return Boolean(map[catId]);
    }

    function setCategoryHidden(catId, hidden) {
        var map = getHiddenMap();
        if (hidden) {
            map[catId] = true;
        } else {
            delete map[catId];
        }
        saveHiddenMap(map);
    }

    function identifyCategory(itemOrData) {
        if (!itemOrData) return 'unknown';
        var title = (itemOrData.title || (itemOrData.data && itemOrData.data.title) || '').trim();
        var lower = title.toLowerCase();

        if (/сейчас\s*смотрят|now.*watch/i.test(lower)) return 'now_watch';
        if (/рекоменд/i.test(lower)) return 'recommend';
        if (/продолж.*просм/i.test(lower) || lower === 'продолжить' || lower === 'продолжать просмотр') return 'continue';
        if (/сегодня.*тренде|тренде.*день/i.test(lower)) return 'trend_day';
        if (/тренде.*недел/i.test(lower)) return 'trend_week';
        if (/кинозал|ожидаем/i.test(lower)) return 'upcoming';
        if (/популярн.*фильм/i.test(lower)) return 'popular_movie';
        if (/популярн.*сериал/i.test(lower)) return 'popular_tv';
        if (/топ.*фильм/i.test(lower)) return 'top_movie';
        if (/топ.*сериал/i.test(lower)) return 'top_tv';
        if (/эпизод|выход.*эпизод|недавн.*выход|ближайш.*выход/i.test(lower)) return 'episodes';
        if (/топ\s*100/i.test(lower)) return 'top_100';
        if (/высоком качеств/i.test(lower)) return 'uhd';

        var genresList = [
            'боевик', 'приключения', 'мультфильм', 'комедия', 'криминал',
            'документальный', 'драма', 'семейный', 'фэнтези', 'история',
            'ужасы', 'музыка', 'детектив', 'мелодрама', 'фантастика',
            'триллер', 'военный', 'вестерн'
        ];
        for (var i = 0; i < genresList.length; i++) {
            if (lower.indexOf(genresList[i]) >= 0) return 'genres';
        }

        var keywordsList = [
            'сиквел', 'комикс', 'космос', 'выживание', 'зомби', 'школа',
            'месть', 'робот', 'вампир', 'пришельц', 'полиция', 'реинкарнация',
            'шпион', 'катастрофа'
        ];
        for (var k = 0; k < keywordsList.length; k++) {
            if (lower.indexOf(keywordsList[k]) >= 0) return 'keywords';
        }

        if (itemOrData.icon_img || (itemOrData.params && itemOrData.params.icon_img)) {
            return 'persons';
        }

        if (title) {
            var slug = 'custom_' + title.replace(/[^a-zA-Zа-яА-Я0-9_]/g, '_').toLowerCase();
            registerCustomCategory(slug, title);
            return slug;
        }

        return 'unknown';
    }

    function getCategoryRank(catId) {
        var order = getSavedOrder();
        var idx = order.indexOf(catId);
        return idx >= 0 ? idx : 999;
    }

    /**
     * ПРЯМОЙ БЕЗОПАСНЫЙ DOM-ДВИЖОК
     */
    function updateDOM() {
        var scanStarted = Date.now();
        HC_PERF.scans++;
        try {
            var lines = document.querySelectorAll('.items-line');
            if (!lines || !lines.length) return;

            var scrollBody = null;
            var visibleLines = [];
            var order = getSavedOrder();
            var ranks = Object.create(null);
            for (var k = 0; k < order.length; k++) ranks[order[k]] = k;
            function rankFor(category) {
                return Object.prototype.hasOwnProperty.call(ranks, category) ? ranks[category] : 999;
            }

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var titleEl = line.querySelector('.items-line__title');
                var title = (titleEl ? titleEl.textContent : '').trim();
                if (!title) continue;

                var catId = identifyCategory({ title: title });

                if (isCategoryHidden(catId)) {
                    if (line.getAttribute('data-hc-hidden') !== 'true') {
                        line.setAttribute('data-hc-hidden', 'true');
                        line.style.setProperty('display', 'none', 'important');
                    }
                } else {
                    if (line.getAttribute('data-hc-hidden') === 'true') {
                        line.removeAttribute('data-hc-hidden');
                        line.style.display = '';
                    }

                    if (!scrollBody && line.parentNode) {
                        scrollBody = line.parentNode;
                    }

                    visibleLines.push({
                        el: line,
                        rank: rankFor(catId)
                    });
                }
            }

            // Перестановка полок в DOM в соответствии с выбранным порядком
            if (scrollBody && visibleLines.length > 1) {
                visibleLines.sort(function (a, b) {
                    return a.rank - b.rank;
                });

                for (var j = 0; j < visibleLines.length; j++) {
                    if (scrollBody.children[j] !== visibleLines[j].el) {
                        scrollBody.appendChild(visibleLines[j].el);
                    }
                }
            }

            syncControllerItems(rankFor);
        } catch (e) {
            console.error('HomeCategories: updateDOM error', e);
        } finally {
            var elapsed = Date.now() - scanStarted;
            HC_PERF.total_ms += elapsed;
            if (elapsed > HC_PERF.max_ms) HC_PERF.max_ms = elapsed;
        }
    }

    /**
     * Синхронизация пульта ТВ (D-pad)
     */
    function syncControllerItems(rankFor) {
        rankFor = rankFor || getCategoryRank;
        try {
            var active = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
            if (!active || !active.activity) return;

            var comp = active.activity;
            if (!Array.isArray(comp.items) || !comp.items.length) return;

            var visible = comp.items.filter(function (item) {
                var el = item.render ? item.render(true) : null;
                if (el && el.getAttribute && el.getAttribute('data-hc-hidden') === 'true') {
                    return false;
                }
                var catId = identifyCategory(item);
                return !isCategoryHidden(catId);
            });

            visible.sort(function (a, b) {
                return rankFor(identifyCategory(a)) - rankFor(identifyCategory(b));
            });

            comp.items = visible;
            if (comp.items.length > 0) {
                comp.active = Math.max(0, Math.min(comp.active || 0, comp.items.length - 1));
            }
        } catch (e) {
            console.error('HomeCategories: syncControllerItems error', e);
        }
    }

    /**
     * Интерактивный модальный менеджер категорий (Вверх / Вниз / Скрыть)
     */
    var isModalOpen = false;

    function openManagerModal() {
        if (isModalOpen) return;
        isModalOpen = true;

        var allCats = getAllCategories();
        var currentOrder = getSavedOrder().slice();
        var hiddenMap = Object.assign({}, getHiddenMap());

        var orderedList = [];
        currentOrder.forEach(function (id) {
            var found = allCats.find(function (c) { return c.id === id; });
            if (found) orderedList.push(found);
        });

        allCats.forEach(function (c) {
            if (!orderedList.some(function (o) { return o.id === c.id; })) {
                orderedList.push(c);
            }
        });

        var modalHtml = $('<div class="hc-modal-wrap"></div>');
        var headHtml = $(`
            <div class="hc-modal-header">
                <div class="hc-modal-header__title">Категории Главного экрана</div>
                <div class="hc-modal-header__subtitle">
                    Настройте порядок (<span class="hc-tag">▲ Вверх</span> / <span class="hc-tag">▼ Вниз</span>) и скрывайте ненужные полки (<span class="hc-tag">👁 Скрыть</span>)
                </div>
            </div>
        `);
        modalHtml.append(headHtml);

        var listContainer = $('<div class="hc-list-container"></div>');
        modalHtml.append(listContainer);

        function updateRowsUI() {
            listContainer.empty();

            orderedList.forEach(function (cat, index) {
                var isHidden = Boolean(hiddenMap[cat.id]);
                var row = $(`
                    <div class="hc-row ${isHidden ? 'is-hidden' : 'is-visible'}" data-id="${escapeHtml(cat.id)}" data-index="${index}">
                        <div class="hc-badge">#${index + 1}</div>
                        <div class="hc-title-box selector" data-action="title" tabindex="0">
                            <span class="hc-icon">${cat.icon || '📁'}</span>
                            <span class="hc-title">${escapeHtml(cat.title)}</span>
                        </div>
                        <div class="hc-btn hc-btn--status selector ${isHidden ? 'is-off' : 'is-on'}" data-action="toggle" tabindex="0">
                            ${isHidden ? '✗ Скрыта' : '✓ Видима'}
                        </div>
                        <div class="hc-btn hc-btn--up selector ${index === 0 ? 'is-disabled' : ''}" data-action="up" tabindex="0" title="Переместить выше">
                            ▲
                        </div>
                        <div class="hc-btn hc-btn--down selector ${index === orderedList.length - 1 ? 'is-disabled' : ''}" data-action="down" tabindex="0" title="Переместить ниже">
                            ▼
                        </div>
                    </div>
                `);

                safeBind(row.find('[data-action="up"]'), function () {
                    if (index <= 0) return;

                    var temp = orderedList[index];
                    orderedList[index] = orderedList[index - 1];
                    orderedList[index - 1] = temp;

                    saveOrder(orderedList.map(function (c) { return c.id; }));
                    updateDOM();
                    updateRowsUI();

                    setTimeout(function () {
                        var target = listContainer.find(`[data-id="${cat.id}"] [data-action="up"]`)[0];
                        if (target && Lampa.Navigator && Lampa.Navigator.focused) {
                            Lampa.Navigator.focused(target);
                        }
                    }, 40);
                });

                safeBind(row.find('[data-action="down"]'), function () {
                    if (index >= orderedList.length - 1) return;

                    var temp = orderedList[index];
                    orderedList[index] = orderedList[index + 1];
                    orderedList[index + 1] = temp;

                    saveOrder(orderedList.map(function (c) { return c.id; }));
                    updateDOM();
                    updateRowsUI();

                    setTimeout(function () {
                        var target = listContainer.find(`[data-id="${cat.id}"] [data-action="down"]`)[0];
                        if (target && Lampa.Navigator && Lampa.Navigator.focused) {
                            Lampa.Navigator.focused(target);
                        }
                    }, 40);
                });

                safeBind(row.find('[data-action="toggle"]'), function () {
                    if (hiddenMap[cat.id]) {
                        delete hiddenMap[cat.id];
                    } else {
                        hiddenMap[cat.id] = true;
                    }
                    saveHiddenMap(hiddenMap);
                    updateDOM();
                    updateRowsUI();

                    setTimeout(function () {
                        var target = listContainer.find(`[data-id="${cat.id}"] [data-action="toggle"]`)[0];
                        if (target && Lampa.Navigator && Lampa.Navigator.focused) {
                            Lampa.Navigator.focused(target);
                        }
                    }, 40);
                });

                safeBind(row.find('[data-action="title"]'), function () {
                    if (hiddenMap[cat.id]) {
                        delete hiddenMap[cat.id];
                    } else {
                        hiddenMap[cat.id] = true;
                    }
                    saveHiddenMap(hiddenMap);
                    updateDOM();
                    updateRowsUI();

                    setTimeout(function () {
                        var target = listContainer.find(`[data-id="${cat.id}"] [data-action="title"]`)[0];
                        if (target && Lampa.Navigator && Lampa.Navigator.focused) {
                            Lampa.Navigator.focused(target);
                        }
                    }, 40);
                });

                listContainer.append(row);
            });
        }

        updateRowsUI();

        Lampa.Modal.open({
            title: '',
            html: modalHtml,
            size: 'medium',
            mask: true,
            buttons: [
                {
                    name: 'Применить и закрыть',
                    onSelect: function () {
                        isModalOpen = false;
                        saveOrder(orderedList.map(function (c) { return c.id; }));
                        saveHiddenMap(hiddenMap);
                        updateDOM();
                        Lampa.Modal.close();
                        Lampa.Noty.show('Настройки категорий сохранены!');
                    }
                },
                {
                    name: 'Сбросить порядок',
                    onSelect: function () {
                        Lampa.Storage.set(STORAGE_ORDER_KEY, null);
                        Lampa.Storage.set(STORAGE_HIDDEN_KEY, {});
                        orderedList = BASE_CATEGORIES.slice();
                        hiddenMap = {};
                        updateDOM();
                        updateRowsUI();
                        Lampa.Noty.show('Порядок и скрытие сброшены');
                    }
                },
                {
                    name: 'Закрыть',
                    onSelect: function () {
                        isModalOpen = false;
                        saveOrder(orderedList.map(function (c) { return c.id; }));
                        saveHiddenMap(hiddenMap);
                        updateDOM();
                        Lampa.Modal.close();
                    }
                }
            ],
            onBack: function () {
                isModalOpen = false;
                saveOrder(orderedList.map(function (c) { return c.id; }));
                saveHiddenMap(hiddenMap);
                updateDOM();
                Lampa.Modal.close();
            }
        });
    }

    /**
     * Официальная интеграция через Lampa.SettingsApi
     */
    function registerSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: 'home_categories',
            name: 'Категории Главного экрана',
            icon: `<svg width="39" height="39" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>`,
            after: 'content_rows'
        });

        // 1. Кнопка открытия визуального менеджера в настройках
        Lampa.SettingsApi.addParam({
            component: 'home_categories',
            param: {
                name: 'hc_open_manager_param',
                type: 'static'
            },
            field: {
                name: '↕ Настроить порядок полок (вверх / вниз)',
                description: 'Интерактивный список: перемещение и быстрое скрытие'
            },
            onRender: function (item) {
                item.css({
                    'border-left': '3px solid #38bdf8',
                    'background': 'rgba(56, 189, 248, 0.12)',
                    'margin-bottom': '12px'
                });
                item.find('.settings-param__name').css({
                    'color': '#38bdf8',
                    'font-weight': '700'
                });
                safeBind(item, function () {
                    openManagerModal();
                });
            }
        });

        // 2. Системные переключатели
        var toggles = [
            { id: 'now_watch', name: 'Скрыть «Сейчас смотрят»' },
            { id: 'episodes', name: 'Скрыть «Выходы эпизодов»' },
            { id: 'recommend', name: 'Скрыть «Рекомендуем посмотреть»' },
            { id: 'trend_day', name: 'Скрыть «Сегодня в тренде»' },
            { id: 'trend_week', name: 'Скрыть «В тренде за неделю»' },
            { id: 'upcoming', name: 'Скрыть «Смотрите в кинозалах (Ожидаемые)»' },
            { id: 'popular_movie', name: 'Скрыть «Популярные фильмы»' },
            { id: 'popular_tv', name: 'Скрыть «Популярные сериалы»' },
            { id: 'top_movie', name: 'Скрыть «Топ фильмы»' },
            { id: 'top_tv', name: 'Скрыть «Топ сериалы»' },
            { id: 'genres', name: 'Скрыть «Подборки жанров»' },
            { id: 'persons', name: 'Скрыть «Подборки актёров / персон»' },
            { id: 'keywords', name: 'Скрыть «Тематические подборки»' }
        ];

        toggles.forEach(function (t) {
            Lampa.SettingsApi.addParam({
                component: 'home_categories',
                param: {
                    name: 'hc_param_' + t.id,
                    type: 'trigger',
                    default: isCategoryHidden(t.id)
                },
                field: {
                    name: t.name
                },
                onChange: function (value) {
                    setCategoryHidden(t.id, value);
                    updateDOM();
                }
            });
        });

        // Слушаем открытие настроек «Каналы» для добавления ярлыка
        if (Lampa.Settings && Lampa.Settings.listener) {
            Lampa.Settings.listener.follow('open', function (e) {
                if (e.name === 'content_rows') {
                    var cBody = e.body;
                    if (!cBody.find('.hc-channel-shortcut').length) {
                        var shortcut = $(`
                            <div class="settings-param selector hc-channel-shortcut" style="border-left: 3px solid #38bdf8; background: rgba(56, 189, 248, 0.12); margin-bottom: 12px;">
                                <div class="settings-param__name" style="color: #38bdf8; font-weight: 700;">
                                    ↕ Порядок и скрытие всех категорий (Сейчас смотрят, Рекомендуем...)
                                </div>
                                <div class="settings-param__descr" style="color: #cbd5e1;">
                                    Нажмите здесь для открытия менеджера категорий
                                </div>
                            </div>
                        `);

                        safeBind(shortcut, function () {
                            openManagerModal();
                        });

                        cBody.prepend(shortcut);
                    }
                }
            });

            Lampa.Settings.listener.follow('close', function () {
                updateDOM();
            });
        }
    }

    /**
     * Добавление кнопки в главное боковое меню
     */
    function addSideMenuItem() {
        try {
            var menuList = $('.menu .menu__list');
            if (!menuList.length) return;
            var targetList = menuList.eq(1).length ? menuList.eq(1) : menuList.eq(0);
            if (targetList.find('.hc-menu-item').length) return;

            var btn = $(`
                <li class="menu__item selector hc-menu-item">
                    <div class="menu__ico">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                    </div>
                    <div class="menu__text">Порядок полок</div>
                </li>
            `);

            safeBind(btn, function () {
                openManagerModal();
            });

            targetList.prepend(btn);
        } catch (e) {
            console.error('HomeCategories: addSideMenuItem error', e);
        }
    }

    /**
     * Официальное внедрение CSS
     */
    function injectStyles() {
        var existing = document.getElementById('lampa-home-categories-style');
        if (existing) existing.remove();

        var css = `
            .items-line[data-hc-hidden="true"] {
                display: none !important;
                visibility: hidden !important;
                height: 0 !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
            }

            .hc-modal-wrap {
                padding: 10px 5px;
                color: #f8fafc;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }

            .hc-modal-header {
                padding: 0 10px 15px 10px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.12);
                margin-bottom: 15px;
            }

            .hc-modal-header__title {
                font-size: 1.4em;
                font-weight: 800;
                letter-spacing: -0.02em;
                color: #ffffff;
                margin-bottom: 4px;
            }

            .hc-modal-header__subtitle {
                font-size: 0.95em;
                color: #94a3b8;
                line-height: 1.4;
            }

            .hc-tag {
                background: rgba(255, 255, 255, 0.1);
                color: #e2e8f0;
                padding: 2px 7px;
                border-radius: 4px;
                font-size: 0.88em;
                font-weight: 600;
            }

            .hc-list-container {
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-height: 58vh;
                overflow-y: auto;
                padding-right: 4px;
            }

            .hc-row {
                display: flex;
                align-items: center;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                padding: 8px 12px;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                min-height: 52px;
                box-sizing: border-box;
            }

            .hc-row.is-hidden {
                opacity: 0.5;
                background: rgba(239, 68, 68, 0.04);
                border-color: rgba(239, 68, 68, 0.15);
            }

            .hc-row:hover, .hc-row.focus {
                background: rgba(255, 255, 255, 0.09);
                border-color: rgba(56, 189, 248, 0.5);
            }

            .hc-badge {
                font-size: 0.9em;
                font-weight: 800;
                color: #64748b;
                width: 34px;
                flex-shrink: 0;
            }

            .hc-row.is-visible .hc-badge {
                color: #38bdf8;
            }

            .hc-title-box {
                display: flex;
                align-items: center;
                flex: 1;
                cursor: pointer;
                padding: 6px 10px;
                border-radius: 8px;
                transition: background 0.15s ease;
                min-width: 0;
            }

            .hc-title-box.focus, .hc-title-box:hover {
                background: rgba(56, 189, 248, 0.18);
                outline: 2px solid #38bdf8;
            }

            .hc-icon {
                font-size: 1.25em;
                margin-right: 10px;
                flex-shrink: 0;
            }

            .hc-title {
                font-size: 1.05em;
                font-weight: 600;
                color: #f1f5f9;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .hc-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 6px 12px;
                border-radius: 8px;
                font-size: 0.92em;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.15s ease;
                flex-shrink: 0;
                margin-left: 6px;
                user-select: none;
                min-height: 38px;
                box-sizing: border-box;
            }

            .hc-btn.focus {
                outline: 2px solid #38bdf8;
                box-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
                transform: scale(1.05);
            }

            .hc-btn--status {
                min-width: 95px;
            }

            .hc-btn--status.is-on {
                background: rgba(34, 197, 94, 0.15);
                color: #4ade80;
                border: 1px solid rgba(34, 197, 94, 0.3);
            }

            .hc-btn--status.is-on.focus {
                background: #22c55e;
                color: #ffffff;
            }

            .hc-btn--status.is-off {
                background: rgba(239, 68, 68, 0.15);
                color: #f87171;
                border: 1px solid rgba(239, 68, 68, 0.3);
            }

            .hc-btn--status.is-off.focus {
                background: #ef4444;
                color: #ffffff;
            }

            .hc-btn--up, .hc-btn--down {
                width: 38px;
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.12);
                font-size: 1em;
            }

            .hc-btn--up.focus, .hc-btn--down.focus {
                background: #38bdf8;
                color: #0f172a;
                border-color: #38bdf8;
            }

            .hc-btn.is-disabled {
                opacity: 0.25;
                pointer-events: none;
            }
        `;

        var style = document.createElement('style');
        style.id = 'lampa-home-categories-style';
        style.innerHTML = css;
        document.head.appendChild(style);
    }

    // Activity events and relevant DOM additions replace unconditional 300 ms polling.
    var domObserver = null;
    var scanTimer = null;
    var menuCheckPending = false;

    function scheduleDOMScan(checkMenu) {
        menuCheckPending = menuCheckPending || Boolean(checkMenu);
        if (scanTimer !== null) return;
        HC_PERF.scheduled++;
        scanTimer = setTimeout(function () {
            scanTimer = null;
            var refreshMenu = menuCheckPending;
            menuCheckPending = false;
            updateDOM();
            if (refreshMenu) addSideMenuItem();
        }, 120);
    }

    function relevantNode(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.matches && node.matches('.items-line, .menu__list, .menu__items, .menu')) return true;
        return Boolean(node.querySelector &&
            node.querySelector('.items-line, .menu__list, .menu__items'));
    }

    function setupWatchers() {
        if (typeof MutationObserver === 'undefined' || !document.body) return;
        if (domObserver) domObserver.disconnect();
        domObserver = new MutationObserver(function (mutations) {
            HC_PERF.mutations += mutations.length;
            for (var i = 0; i < mutations.length; i++) {
                var nodes = mutations[i].addedNodes;
                if (!nodes) continue;
                for (var j = 0; j < nodes.length; j++) {
                    if (relevantNode(nodes[j])) {
                        scheduleDOMScan(true);
                        return;
                    }
                }
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
    }

    window.plugin_home_categories_destroy = function () {
        if (scanTimer !== null) clearTimeout(scanTimer);
        scanTimer = null;
        if (domObserver) domObserver.disconnect();
        var style = document.getElementById('lampa-home-categories-style');
        if (style) style.remove();
        $('.hc-menu-item').remove();
        $('.hc-channel-shortcut').remove();
        isModalOpen = false;
        delete window.HomeCategoriesPro;
    };

    // Экспорт для отладки
    window.HomeCategoriesPro = {
        updateDOM: updateDOM,
        setHidden: setCategoryHidden,
        openModal: openManagerModal,
        performance: HC_PERF
    };

    function init() {
        injectStyles();
        registerSettings();
        addSideMenuItem();
        setupWatchers();

        if (Lampa.Listener) {
            Lampa.Listener.follow('activity', function (e) {
                if (e.component === 'main') {
                    scheduleDOMScan(true);
                }
            });
        }

        updateDOM();
        HC_PERF.ready_ms = Date.now() - PERF_START;
        console.log('HomeCategories: Plugin v2.0.1 (event-driven) initialized!');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();