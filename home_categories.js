/**
 * Lampa Plugin: Home Categories Pro (Скрытие и настройка порядка категорий)
 * Version: 1.1.0
 * Author: Lampa Community & Alexgood321
 * Description: Полный контроль над главным экраном Lampa:
 *   - Мгновенное скрытие любых категорий (Сейчас смотрят, Рекомендуем посмотреть, Тренды, Ожидаемые, Жанры и др.)
 *   - Настройка точного порядка категорий (Вверх / Вниз) с поддержкой пульта ТВ и сенсорного экрана
 *   - Интеграция в «Настройки -> Каналы и Главный экран»
 *   - Глубокий перехват DOM, Component и Activity для 100% надёжного применения
 */

(function () {
    'use strict';

    if (window.plugin_home_categories_ready) return;
    window.plugin_home_categories_ready = true;

    var STORAGE_ORDER_KEY = 'home_categories_order_v1';
    var STORAGE_HIDDEN_KEY = 'home_categories_hidden_v1';
    var STORAGE_CUSTOM_KEY = 'home_categories_custom_v1';

    // Базовый список стандартных полок
    var BASE_CATEGORIES = [
        { id: 'continue', title: 'Продолжить просмотр', icon: '▶', key: 'title_continue' },
        { id: 'now_watch', title: 'Сейчас смотрят', icon: '👁', key: 'title_now_watch' },
        { id: 'episodes', title: 'Выходы новых эпизодов', icon: '🗓', key: 'title_upcoming_episodes' },
        { id: 'recommend', title: 'Рекомендуем посмотреть', icon: '★', key: 'title_recomend_watch' },
        { id: 'trend_day', title: 'Сегодня в тренде', icon: '🔥', key: 'title_trend_day' },
        { id: 'trend_week', title: 'В тренде за неделю', icon: '📈', key: 'title_trend_week' },
        { id: 'popular_movie', title: 'Популярные фильмы', icon: '🎬', key: 'title_popular_movie' },
        { id: 'popular_tv', title: 'Популярные сериалы', icon: '📺', key: 'title_popular_tv' },
        { id: 'upcoming', title: 'Смотрите в кинозалах (Ожидаемые)', icon: '🎟', key: 'title_upcoming' },
        { id: 'top_movie', title: 'Топ фильмы', icon: '🏆', key: 'title_top_movie' },
        { id: 'top_tv', title: 'Топ сериалы', icon: '⭐', key: 'title_top_tv' },
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

            var newCat = {
                id: catId,
                title: title,
                icon: '📁',
                isCustom: true
            };

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
                if (order.indexOf(id) === -1) {
                    order.push(id);
                }
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

    function toggleCategoryHidden(catId) {
        var map = getHiddenMap();
        if (map[catId]) {
            delete map[catId];
        } else {
            map[catId] = true;
        }
        saveHiddenMap(map);
        return Boolean(map[catId]);
    }

    /**
     * Точное распознавание категории по названию или объекту данных
     */
    function identifyCategory(itemOrData) {
        if (!itemOrData) return 'unknown';
        var title = (itemOrData.title || (itemOrData.data && itemOrData.data.title) || '').trim();
        var lower = title.toLowerCase();

        // 1. Точные совпадения
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

        // 2. Жанры
        var genresList = [
            'боевик', 'приключения', 'мультфильм', 'комедия', 'криминал',
            'документальный', 'драма', 'семейный', 'фэнтези', 'история',
            'ужасы', 'музыка', 'детектив', 'мелодрама', 'фантастика',
            'триллер', 'военный', 'вестерн'
        ];
        for (var i = 0; i < genresList.length; i++) {
            if (lower.indexOf(genresList[i]) >= 0) return 'genres';
        }

        // 3. Ключевые слова
        var keywordsList = [
            'сиквел', 'комикс', 'космос', 'выживание', 'зомби', 'школа',
            'месть', 'робот', 'вампир', 'пришельц', 'полиция', 'реинкарнация',
            'шпион', 'катастрофа'
        ];
        for (var k = 0; k < keywordsList.length; k++) {
            if (lower.indexOf(keywordsList[k]) >= 0) return 'keywords';
        }

        // 4. Персоны (актеры/режиссеры)
        if (itemOrData.icon_img || (itemOrData.params && itemOrData.params.icon_img)) {
            return 'persons';
        }

        // 5. Динамические пользовательские полки
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

    function filterAndSortData(dataArray) {
        if (!Array.isArray(dataArray)) return dataArray;

        var visible = dataArray.filter(function (item) {
            var catId = identifyCategory(item);
            return !isCategoryHidden(catId);
        });

        visible.sort(function (a, b) {
            var rankA = getCategoryRank(identifyCategory(a));
            var rankB = getCategoryRank(identifyCategory(b));
            return rankA - rankB;
        });

        return visible;
    }

    /**
     * ПРЯМАЯ ФИЛЬТРАЦИЯ И СОРТИРОВКА В DOM (Работает мгновенно на видимом экране)
     */
    function applyDOMFilterAndOrder(comp) {
        try {
            var lines = $('.items-line').toArray();
            if (!lines.length) return;

            var parent = null;
            var visibleLines = [];

            lines.forEach(function (el) {
                var line = $(el);
                var titleEl = line.find('.items-line__title');
                var title = (titleEl.text() || '').trim();
                if (!title) return;

                var catId = identifyCategory({ title: title });

                if (isCategoryHidden(catId)) {
                    // МГНОВЕННО УДАЛЯЕМ СКРЫТУЮ ПОЛКУ ИЗ DOM
                    line.remove();
                } else {
                    if (!parent) parent = el.parentNode;
                    visibleLines.push({
                        el: el,
                        rank: getCategoryRank(catId)
                    });
                }
            });

            // ПЕРЕСТАНОВКА ВИДИМЫХ ПОЛОК В ЗАДАННОМ ПОРЯДКЕ
            if (parent && visibleLines.length) {
                visibleLines.sort(function (a, b) {
                    return a.rank - b.rank;
                });
                visibleLines.forEach(function (item) {
                    parent.appendChild(item.el);
                });
            }

            // Синхронизация коллекции для пульта ТВ
            var activeComp = comp;
            if (!activeComp && Lampa.Activity && Lampa.Activity.active) {
                var act = Lampa.Activity.active();
                if (act && act.activity) activeComp = act.activity;
            }

            if (activeComp && Array.isArray(activeComp.items)) {
                activeComp.items = activeComp.items.filter(function (it) {
                    var catId = identifyCategory(it);
                    return !isCategoryHidden(catId);
                });

                activeComp.items.sort(function (a, b) {
                    return getCategoryRank(identifyCategory(a)) - getCategoryRank(identifyCategory(b));
                });

                if (activeComp.items.length > 0) {
                    activeComp.active = Math.max(0, Math.min(activeComp.active || 0, activeComp.items.length - 1));
                }
            }
        } catch (e) {
            console.error('HomeCategories: applyDOMFilterAndOrder error', e);
        }
    }

    /**
     * Применение изменений (DOM + инвалидация кэша Main + перерендер)
     */
    function applyChangesToScreen() {
        try {
            // 1. Мгновенная очистка текущего DOM
            applyDOMFilterAndOrder();

            // 2. Инвалидируем Main активность в стеке Lampa.Activity.all()
            if (Lampa.Activity && Lampa.Activity.all) {
                var all = Lampa.Activity.all();
                var mainAct = all.find(function (a) { return a.component === 'main'; });

                if (mainAct && mainAct.activity) {
                    try {
                        mainAct.activity.destroy();
                    } catch (e) {}
                    delete mainAct.activity; // Чтобы Lampa пересоздала Main заново при возврате
                }
            }

            // 3. Если мы прямо сейчас находимся на Главной — пересоздаём её
            var current = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
            if (current && current.component === 'main') {
                Lampa.Activity.replace();
            }

            Lampa.Noty.show('Настройки категорий сохранены и применены!');
        } catch (e) {
            console.error('HomeCategories: applyChangesToScreen error', e);
        }
    }

    /**
     * Глубокий перехват конструктора компонента Main через Lampa.Component
     */
    function hookComponentMain() {
        if (!Lampa.Component || !Lampa.Component.get) return;

        var origMainComponent = Lampa.Component.get('main');
        if (!origMainComponent) return;

        Lampa.Component.add('main', function (object) {
            var comp = new origMainComponent(object);
            var origBuild = comp.build;

            comp.build = function (data) {
                if (Array.isArray(data)) {
                    data = filterAndSortData(data);
                }
                var res = origBuild.call(this, data);

                setTimeout(function () {
                    applyDOMFilterAndOrder(comp);
                }, 50);

                return res;
            };

            return comp;
        });
    }

    /**
     * Перехват Lampa.Api
     */
    function hookApi() {
        if (!Lampa.Api) return;

        var origMain = Lampa.Api.main;
        Lampa.Api.main = function (params, oncomplite, onerror) {
            var wrappedOncomplite = function (data) {
                try {
                    if (Array.isArray(data)) {
                        data = filterAndSortData(data);
                    }
                } catch (e) {
                    console.error('HomeCategories: Api.main wrap error', e);
                }
                if (oncomplite) oncomplite(data);
            };

            var nextCall = origMain.call(this, params, wrappedOncomplite, onerror);

            if (typeof nextCall === 'function') {
                return function (resolve, reject) {
                    nextCall(function (nextData) {
                        try {
                            if (Array.isArray(nextData)) {
                                nextData = filterAndSortData(nextData);
                            }
                        } catch (e) {
                            console.error('HomeCategories: Api.main next error', e);
                        }
                        resolve(nextData);
                    }, reject);
                };
            }
            return nextCall;
        };
    }

    /**
     * Модальный интерфейс настройки категорий
     */
    function openManagerModal() {
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

                row.find('[data-action="up"]').on('hover:enter click', function (e) {
                    e.stopPropagation();
                    if (index <= 0) return;

                    var temp = orderedList[index];
                    orderedList[index] = orderedList[index - 1];
                    orderedList[index - 1] = temp;

                    saveOrder(orderedList.map(function (c) { return c.id; }));
                    updateRowsUI();

                    setTimeout(function () {
                        var target = listContainer.find(`[data-id="${cat.id}"] [data-action="up"]`)[0];
                        if (target && Lampa.Navigator && Lampa.Navigator.focused) {
                            Lampa.Navigator.focused(target);
                        }
                    }, 50);
                });

                row.find('[data-action="down"]').on('hover:enter click', function (e) {
                    e.stopPropagation();
                    if (index >= orderedList.length - 1) return;

                    var temp = orderedList[index];
                    orderedList[index] = orderedList[index + 1];
                    orderedList[index + 1] = temp;

                    saveOrder(orderedList.map(function (c) { return c.id; }));
                    updateRowsUI();

                    setTimeout(function () {
                        var target = listContainer.find(`[data-id="${cat.id}"] [data-action="down"]`)[0];
                        if (target && Lampa.Navigator && Lampa.Navigator.focused) {
                            Lampa.Navigator.focused(target);
                        }
                    }, 50);
                });

                row.find('[data-action="toggle"]').on('hover:enter click', function (e) {
                    e.stopPropagation();
                    if (hiddenMap[cat.id]) {
                        delete hiddenMap[cat.id];
                    } else {
                        hiddenMap[cat.id] = true;
                    }
                    saveHiddenMap(hiddenMap);
                    updateRowsUI();

                    setTimeout(function () {
                        var target = listContainer.find(`[data-id="${cat.id}"] [data-action="toggle"]`)[0];
                        if (target && Lampa.Navigator && Lampa.Navigator.focused) {
                            Lampa.Navigator.focused(target);
                        }
                    }, 50);
                });

                row.find('[data-action="title"]').on('hover:enter click', function (e) {
                    e.stopPropagation();
                    if (hiddenMap[cat.id]) {
                        delete hiddenMap[cat.id];
                    } else {
                        hiddenMap[cat.id] = true;
                    }
                    saveHiddenMap(hiddenMap);
                    updateRowsUI();

                    setTimeout(function () {
                        var target = listContainer.find(`[data-id="${cat.id}"] [data-action="title"]`)[0];
                        if (target && Lampa.Navigator && Lampa.Navigator.focused) {
                            Lampa.Navigator.focused(target);
                        }
                    }, 50);
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
                        saveOrder(orderedList.map(function (c) { return c.id; }));
                        saveHiddenMap(hiddenMap);
                        Lampa.Modal.close();
                        applyChangesToScreen();
                    }
                },
                {
                    name: 'Сбросить порядок',
                    onSelect: function () {
                        Lampa.Storage.set(STORAGE_ORDER_KEY, null);
                        Lampa.Storage.set(STORAGE_HIDDEN_KEY, {});
                        orderedList = BASE_CATEGORIES.slice();
                        hiddenMap = {};
                        updateRowsUI();
                        Lampa.Noty.show('Порядок и скрытие сброшены по умолчанию');
                    }
                },
                {
                    name: 'Закрыть',
                    onSelect: function () {
                        saveOrder(orderedList.map(function (c) { return c.id; }));
                        saveHiddenMap(hiddenMap);
                        Lampa.Modal.close();
                        applyChangesToScreen();
                    }
                }
            ],
            onBack: function () {
                saveOrder(orderedList.map(function (c) { return c.id; }));
                saveHiddenMap(hiddenMap);
                applyChangesToScreen();
            }
        });
    }

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

        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name === 'home_categories') {
                var body = e.body;
                body.empty();

                var banner = $(`
                    <div class="settings-param selector hc-settings-btn" style="border-left: 3px solid #38bdf8; background: rgba(56, 189, 248, 0.12); margin-bottom: 15px;">
                        <div class="settings-param__name" style="color: #38bdf8; font-weight: 700; font-size: 1.15em;">
                            ↕ Настроить порядок и видимость категорий
                        </div>
                        <div class="settings-param__descr" style="color: #e2e8f0;">
                            Интерактивный менеджер: перемещение полок вверх/вниз и мгновенное скрытие
                        </div>
                    </div>
                `);

                banner.on('hover:enter click', function () {
                    openManagerModal();
                });
                body.append(banner);

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
                    { id: 'genres', name: 'Скрыть «Подборки жанров (Боевик, Комедия и др.)»' },
                    { id: 'persons', name: 'Скрыть «Подборки актёров / персон»' },
                    { id: 'keywords', name: 'Скрыть «Тематические подборки (Космос, Зомби...)»' }
                ];

                toggles.forEach(function (t) {
                    var isHid = isCategoryHidden(t.id);
                    var row = $(`
                        <div class="settings-param selector" data-type="toggle">
                            <div class="settings-param__name">${escapeHtml(t.name)}</div>
                            <div class="settings-param__value">${isHid ? 'Да' : 'Нет'}</div>
                        </div>
                    `);

                    row.on('hover:enter click', function () {
                        var nowHidden = toggleCategoryHidden(t.id);
                        row.find('.settings-param__value').text(nowHidden ? 'Да' : 'Нет');
                        applyChangesToScreen();
                    });

                    body.append(row);
                });

                var resetBtn = $(`
                    <div class="settings-param selector" style="margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                        <div class="settings-param__name" style="color: #f87171;">⟲ Сбросить настройки категорий по умолчанию</div>
                        <div class="settings-param__descr">Восстановить исходное отображение и порядок полок</div>
                    </div>
                `);

                resetBtn.on('hover:enter click', function () {
                    Lampa.Storage.set(STORAGE_ORDER_KEY, null);
                    Lampa.Storage.set(STORAGE_HIDDEN_KEY, {});
                    Lampa.Noty.show('Настройки категорий сброшены!');
                    applyChangesToScreen();
                    body.find('.settings-param__value').text('Нет');
                });
                body.append(resetBtn);

                if (Lampa.Controller) {
                    Lampa.Controller.collectionSet(body);
                    Lampa.Controller.collectionFocus(banner[0], body);
                }
            }

            if (e.name === 'content_rows') {
                var cBody = e.body;
                if (!cBody.find('.hc-channel-shortcut').length) {
                    var shortcut = $(`
                        <div class="settings-param selector hc-channel-shortcut" style="border-left: 3px solid #38bdf8; background: rgba(56, 189, 248, 0.12); margin-bottom: 12px;">
                            <div class="settings-param__name" style="color: #38bdf8; font-weight: 700;">
                                ↕ Порядок и скрытие всех категорий (Сейчас смотрят, Рекомендуем...)
                            </div>
                            <div class="settings-param__descr" style="color: #cbd5e1;">
                                Нажмите здесь, чтобы настроить порядок полок и скрыть ненужные
                            </div>
                        </div>
                    `);

                    shortcut.on('hover:enter click', function () {
                        openManagerModal();
                    });

                    cBody.prepend(shortcut);
                }
            }
        });

        // Слушаем закрытие настроек для немедленного обновления главной страницы
        Lampa.Settings.listener.follow('close', function () {
            setTimeout(applyDOMFilterAndOrder, 80);
        });
    }

    function injectStyles() {
        if (document.getElementById('lampa-home-categories-style')) return;

        var css = `
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

            @media (max-width: 480px) {
                .hc-title {
                    font-size: 0.95em;
                }
                .hc-btn {
                    padding: 4px 8px;
                    font-size: 0.85em;
                }
                .hc-btn--status {
                    min-width: 80px;
                }
            }
        `;

        var style = document.createElement('style');
        style.id = 'lampa-home-categories-style';
        style.innerHTML = css;
        document.head.appendChild(style);
    }

    /**
     * Постоянный наблюдатель за появлением новых полок в DOM
     */
    function setupDOMObserver() {
        var timer = null;
        var observer = new MutationObserver(function (mutations) {
            var needCheck = false;
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
                    needCheck = true;
                    break;
                }
            }

            if (needCheck) {
                clearTimeout(timer);
                timer = setTimeout(function () {
                    applyDOMFilterAndOrder();
                }, 60);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Старт плагина
     */
    function init() {
        injectStyles();
        hookComponentMain();
        hookApi();
        registerSettings();
        setupDOMObserver();

        if (Lampa.Listener) {
            Lampa.Listener.follow('activity', function (e) {
                if (e.component === 'main') {
                    setTimeout(applyDOMFilterAndOrder, 80);
                }
            });
        }

        // Первичная проверка текущего экрана
        setTimeout(applyDOMFilterAndOrder, 200);

        console.log('HomeCategories: Plugin v1.1.0 successfully loaded!');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();