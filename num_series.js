(function () {
    'use strict';

    if (window.plugin_num_series_ready) return;
    window.plugin_num_series_ready = true;

    var PLUGIN_NAME = 'NUM Series Pro';
    var VERSION = '1.3.0';

    function startPlugin() {
        // Локализация
        Lampa.Lang.add({
            num_series_title: {
                ru: 'NUM Серии и Сезоны',
                en: 'NUM Series & Seasons',
                uk: 'NUM Серії та Сезони'
            },
            num_season_all: {
                ru: 'Все серии',
                en: 'All episodes',
                uk: 'Всі серії'
            },
            num_season_prefix: {
                ru: 'Сезон',
                en: 'Season',
                uk: 'Сезон'
            },
            num_mark_season_watched: {
                ru: '✓ Отметить сезон',
                en: '✓ Mark season watched',
                uk: '✓ Відмітити сезон'
            },
            num_season_marked: {
                ru: 'Сезон отмечен как просмотренный',
                en: 'Season marked as watched',
                uk: 'Сезон відмічено як переглянутий'
            },
            num_continue_watching: {
                ru: 'ПРОДОЛЖИТЬ ПРОСМОТР',
                en: 'CONTINUE WATCHING',
                uk: 'ПРОДОВЖИТИ ПЕРЕГЛЯД'
            },
            num_play_now: {
                ru: 'Смотреть',
                en: 'Play',
                uk: 'Дивитися'
            },
            num_open_m3u_iina: {
                ru: '▶ Запустить весь сезон в IINA (плейлист)',
                en: '▶ Open full season in IINA (playlist)',
                uk: '▶ Відкрити весь сезон в IINA (плейлист)'
            }
        });

        // Стили UI
        var style = document.createElement('style');
        style.id = 'num-series-styles';
        style.textContent = `
            /* Панель сезонов */
            .num-season-bar {
                display: flex;
                flex-wrap: nowrap;
                align-items: center;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
                gap: 0.8em;
                padding: 1em 1.2em;
                background: linear-gradient(180deg, rgba(22, 22, 26, 0.95) 0%, rgba(14, 14, 17, 0.9) 100%);
                border-bottom: 1px solid rgba(255, 255, 255, 0.12);
                margin-bottom: 0.8em;
                position: sticky;
                top: 0;
                z-index: 100;
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                scrollbar-width: none;
            }
            .num-season-bar::-webkit-scrollbar {
                display: none;
            }

            /* Кнопки сезонов */
            .num-season-tab {
                flex-shrink: 0;
                display: inline-flex;
                align-items: center;
                gap: 0.6em;
                min-height: 48px;
                padding: 0.65em 1.3em;
                border-radius: 0.85em;
                background: rgba(255, 255, 255, 0.08);
                color: #e2e8f0;
                font-size: 1.15em;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
                border: 1px solid rgba(255, 255, 255, 0.1);
                user-select: none;
                -webkit-user-select: none;
                -webkit-tap-highlight-color: transparent;
            }

            /* Чипы счетчиков серий */
            .num-season-tab span.num-count {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 1.8em;
                height: 1.6em;
                padding: 0 0.55em;
                border-radius: 9999px;
                background: rgba(255, 255, 255, 0.12);
                color: #94a3b8;
                font-size: 0.82em;
                font-weight: 700;
                transition: all 0.2s ease;
            }

            /* Сезон полностью просмотрен (Зеленый бейдж) */
            .num-season-tab span.num-count--done {
                background: rgba(16, 185, 129, 0.25) !important;
                color: #34d399 !important;
                border: 1px solid rgba(52, 211, 153, 0.35);
            }

            /* Сезон в процессе просмотра (Янтарный бейдж) */
            .num-season-tab span.num-count--progress {
                background: rgba(245, 158, 11, 0.25) !important;
                color: #fbbf24 !important;
                border: 1px solid rgba(251, 191, 36, 0.35);
            }

            .num-season-tab:active {
                transform: scale(0.96);
            }

            /* Активный выбранный сезон */
            .num-season-tab.active {
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
                color: #ffffff !important;
                border-color: rgba(255, 255, 255, 0.4) !important;
                box-shadow: 0 4px 20px rgba(37, 99, 235, 0.5) !important;
                font-weight: 700;
            }

            .num-season-tab.active span.num-count {
                background: rgba(255, 255, 255, 0.28) !important;
                color: #ffffff !important;
            }

            .num-season-tab.active span.num-count--done {
                background: #10b981 !important;
                color: #ffffff !important;
            }

            /* Фокус пульта на ТВ */
            .num-season-tab.focus, .num-season-action.focus, .num-resume-banner.focus {
                outline: none !important;
                transform: scale(1.05);
                border-color: #60a5fa !important;
                background: rgba(255, 255, 255, 0.22);
                color: #ffffff;
                box-shadow: 0 0 0 3px #3b82f6, 0 8px 24px rgba(0, 0, 0, 0.6) !important;
                z-index: 5;
            }

            .num-season-tab.active.focus {
                background: linear-gradient(135deg, #60a5fa 0%, #2563eb 100%) !important;
                border-color: #ffffff !important;
                box-shadow: 0 0 0 3px #93c5fd, 0 8px 24px rgba(37, 99, 235, 0.7) !important;
                color: #ffffff !important;
            }

            /* Кнопка "Отметить сезон" */
            .num-season-action {
                flex-shrink: 0;
                display: inline-flex;
                align-items: center;
                gap: 0.5em;
                min-height: 48px;
                padding: 0.65em 1.1em;
                border-radius: 0.85em;
                background: rgba(16, 185, 129, 0.15);
                color: #34d399;
                font-size: 1.05em;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                border: 1px solid rgba(52, 211, 153, 0.3);
                user-select: none;
                margin-left: auto;
            }
            .num-season-action:hover {
                background: rgba(16, 185, 129, 0.28);
                color: #ffffff;
            }

            /* Баннер быстрого продолжения просмотра */
            .num-resume-banner {
                margin: 0 1.2em 1.2em 1.2em;
                padding: 1em 1.4em;
                border-radius: 1em;
                background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
                border: 1px solid rgba(59, 130, 246, 0.4);
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
                display: flex;
                align-items: center;
                gap: 1.2em;
                cursor: pointer;
                transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .num-resume-banner:hover {
                border-color: #60a5fa;
                background: linear-gradient(135deg, rgba(37, 99, 235, 0.25) 0%, rgba(15, 23, 42, 0.95) 100%);
            }

            .num-resume-banner__icon {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: #3b82f6;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                box-shadow: 0 4px 14px rgba(59, 130, 246, 0.5);
            }

            .num-resume-banner__body {
                flex-grow: 1;
                min-width: 0;
            }

            .num-resume-banner__label {
                font-size: 0.8em;
                font-weight: 700;
                letter-spacing: 0.08em;
                color: #60a5fa;
                margin-bottom: 0.2em;
            }

            .num-resume-banner__title {
                font-size: 1.25em;
                font-weight: 700;
                color: #ffffff;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .num-resume-banner__time {
                font-size: 0.95em;
                color: #94a3b8;
                font-weight: 500;
                background: rgba(255, 255, 255, 0.1);
                padding: 0.3em 0.8em;
                border-radius: 0.5em;
                white-space: nowrap;
            }

            .num-hidden-item {
                display: none !important;
            }

            .num-resume-badge {
                display: inline-block;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: #ffffff;
                font-size: 0.75em;
                font-weight: 700;
                padding: 0.2em 0.55em;
                border-radius: 0.4em;
                margin-left: 0.6em;
                vertical-align: middle;
                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
            }
        `;
        document.head.appendChild(style);

        // Функция безопасного экранирования HTML
        function escapeHtml(text) {
            if (!text) return '';
            return $('<div>').text(text).html();
        }

        // Получение активного базового URL TorrServer с учетом настроек Лампы
        function getTorrServerUrl() {
            if (Lampa.Torserver && typeof Lampa.Torserver.url === 'function') {
                var u = Lampa.Torserver.url();
                if (u) return u.replace(/\/$/, '');
            }
            return (Lampa.Storage.get('torrserver_url') || 'http://127.0.0.1:8090').replace(/\/$/, '');
        }

        // Очистка "грязных" названий файлов
        function cleanTechnicalTitle(rawTitle, epNum) {
            if (!rawTitle) return epNum ? 'Серия ' + epNum : '';
            var clean = rawTitle.replace(/\.(mkv|mp4|avi|ts|m4v|mov)$/i, '');
            clean = clean.replace(/[\._]/g, ' ');
            clean = clean.replace(/\b(1080p|720p|2160p|4k|uhd|hdr10\+?|hdr|dv|dolby\s*vision|sdr|bluray|blu-ray|bdrip|web-?dl(?:rip)?|webrip|hdtv|remux|hevc|x264|x265|h\.?264|h\.?265|avc|10bit|atmos|ddp?5\.1|ac3|dts(?:-hd)?|aac|flac|rus|eng|sub|dub|mvo|lostfilm|hdrezka|amedia|newstudio|alexfilm|tvshows|red\s*head\s*sound)\b/gi, '');
            clean = clean.replace(/\[?[sS]\d{1,2}[\.\s_-]*[eE]\d{1,3}\]?/gi, '');
            clean = clean.replace(/\[?\b\d{1,2}[xX]\d{1,3}\b\]?/gi, '');
            clean = clean.replace(/\[\s*\]|\(\s*\)/g, '').replace(/\s+/g, ' ').replace(/^[\s\-_]+|[\s\-_]+$/g, '').trim();

            if (epNum) {
                if (!clean || clean.length < 3 || /^\d+$/.test(clean)) {
                    return 'Серия ' + epNum;
                }
                return 'Серия ' + epNum + ' · ' + clean;
            }
            return clean || rawTitle;
        }

        // Парсер сезона и серии из пути
        function parseSeasonEpisode(path) {
            if (!path) return { season: 0, episode: 0 };
            var clean = path.replace(/_/g, ' ');
            var parts = clean.split('/');
            var fname = parts.pop() || '';
            var folder = parts.pop() || '';

            var season = 0;
            var episode = 0;

            var folderMatch = folder.match(/(?:season|сезон)\s*(\d{1,2})/i) || folder.match(/\b[sS](\d{1,2})\b/i);
            if (folderMatch) {
                season = parseInt(folderMatch[1], 10);
            }

            var seMatch = fname.match(/[sS](\d{1,2})[\.\s_-]*[eE](\d{1,3})/i) ||
                          fname.match(/\b(\d{1,2})[xX](\d{1,3})\b/i) ||
                          fname.match(/(?:сезон|season)\s*(\d{1,2})[^\d]+(?:сери[яи]|эпизод|episode)\s*(\d{1,3})/i);

            if (seMatch) {
                season = parseInt(seMatch[1], 10);
                episode = parseInt(seMatch[2], 10);
            } else {
                var numCodeMatch = fname.match(/\b([1-9])(\d{2})\b/);
                if (numCodeMatch) {
                    if (!season) season = parseInt(numCodeMatch[1], 10);
                    episode = parseInt(numCodeMatch[2], 10);
                } else {
                    var epMatch = fname.match(/(?:сери[яи]|эпизод|episode|ep|e)[\.\s_-]*(\d{1,3})\b/i) ||
                                  fname.match(/\b(\d{1,3})\s*(?:сери[яи]|эпизод|episode)\b/i) ||
                                  fname.match(/\b[-_ ](\d{1,3})\b(?:\.[\w\d]+)?$/i);
                    if (epMatch) {
                        episode = parseInt(epMatch[1], 10);
                    }
                }
            }

            return { season: season, episode: episode };
        }

        var activeSeason = null;
        var currentTorrentItems = [];

        Lampa.Listener.follow('torrent_file', function (e) {
            if (e.type === 'list_open') {
                currentTorrentItems = e.items || [];

                currentTorrentItems.forEach(function (item) {
                    var parsed = parseSeasonEpisode(item.path || item.path_human);
                    item.__num_season = item.season || parsed.season || 0;
                    item.__num_episode = item.episode || parsed.episode || 0;
                });
            }

            if (e.type === 'render') {
                var s = e.element.__num_season || e.element.season || 0;
                var ep = e.element.__num_episode || e.element.episode || 0;

                e.item.attr('data-num-season', s);
                e.item.attr('data-num-episode', ep);

                // Сохраняем точный процент просмотра из Timeline на DOM-элементе
                var percent = (e.element.timeline && e.element.timeline.percent) || 0;
                e.item.attr('data-num-percent', percent);

                // Очистка грязных названий при отсутствии метаданных TMDB
                var titleElem = e.item.find('.torrent-serial__title, .torrent-file__title');
                var currentTitleText = titleElem.text().trim();
                if (currentTitleText && (currentTitleText.indexOf('1080p') > -1 || currentTitleText.indexOf('WEB-DL') > -1 || currentTitleText.indexOf('.mkv') > -1)) {
                    var cleaned = cleanTechnicalTitle(currentTitleText, ep);
                    titleElem.text(cleaned);
                }

                // Индикатор прогресса на серии
                if (percent > 0 && percent < 85) {
                    if (!e.item.find('.num-resume-badge').length) {
                        titleElem.append('<span class="num-resume-badge">' + percent + '%</span>');
                    }
                }
            }

            if (e.type === 'onlong') {
                if (e.items && e.items.length > 1 && e.element.torrent_hash) {
                    var torrUrl = getTorrServerUrl();
                    var m3uLink = torrUrl + '/stream?link=' + e.element.torrent_hash + '&m3u';
                    var enabledController = Lampa.Controller.enabled() ? Lampa.Controller.enabled().name : 'modal';

                    e.menu.push({
                        title: Lampa.Lang.translate('num_open_m3u_iina'),
                        num_iina_m3u: true,
                        url: m3uLink,
                        onSelect: function () {
                            if (enabledController) Lampa.Controller.toggle(enabledController);
                            window.location.href = 'iina://weblink?url=' + encodeURIComponent(m3uLink);
                            if (Lampa.Noty) Lampa.Noty.show('Запуск плейлиста в IINA...');
                        }
                    });
                }
            }
        });

        // Слушатель выбора в SelectBox для IINA (дублирующая надежность)
        if (Lampa.Select && Lampa.Select.listener) {
            Lampa.Select.listener.follow('select', function (ev) {
                if (ev && ev.item && ev.item.num_iina_m3u && ev.item.url) {
                    window.location.href = 'iina://weblink?url=' + encodeURIComponent(ev.item.url);
                    if (Lampa.Noty) Lampa.Noty.show('Запуск плейлиста в IINA...');
                }
            });
        }

        // Обновление бейджей сезонов через реальный процент Timeline
        function updateSeasonTabBadges(container) {
            container.find('.num-season-tab').each(function () {
                var s = $(this).attr('data-season');
                var total = 0;
                var watched = 0;

                container.find('.torrent-serial, .torrent-file').each(function () {
                    var itemSeason = parseInt($(this).attr('data-num-season'), 10) || 0;
                    var percent = parseInt($(this).attr('data-num-percent'), 10) || 0;

                    if (s === 'all' || itemSeason === parseInt(s, 10)) {
                        total++;
                        if (percent >= 85) watched++;
                    }
                });

                var countSpan = $(this).find('span.num-count');
                countSpan.removeClass('num-count--done num-count--progress');

                if (s === 'all') {
                    countSpan.text(watched > 0 ? watched + '/' + total : total);
                } else {
                    if (watched === total && total > 0) {
                        countSpan.addClass('num-count--done').text(total + ' ✓');
                    } else if (watched > 0) {
                        countSpan.addClass('num-count--progress').text(watched + '/' + total);
                    } else {
                        countSpan.text(total);
                    }
                }
            });
        }

        // Обновление баннера "Продолжить просмотр"
        function updateContinueBanner(container, currentSeason) {
            container.find('.num-resume-banner').remove();

            var candidateElem = null;
            var visibleEpisodes = container.find('.torrent-serial:not(.num-hidden-item), .torrent-file:not(.num-hidden-item)');

            // 1. Ищем серию в процессе просмотра (0 < percent < 85)
            visibleEpisodes.each(function () {
                var percent = parseInt($(this).attr('data-num-percent'), 10) || 0;
                if (percent > 0 && percent < 85) {
                    candidateElem = $(this);
                    return false;
                }
            });

            // 2. Если в процессе нет — ищем первую непросмотренную (percent < 85)
            if (!candidateElem) {
                visibleEpisodes.each(function () {
                    var percent = parseInt($(this).attr('data-num-percent'), 10) || 0;
                    if (percent < 85) {
                        candidateElem = $(this);
                        return false;
                    }
                });
            }

            if (candidateElem && candidateElem.length) {
                var rawTitle = candidateElem.find('.torrent-serial__title, .torrent-file__title').text().replace(/\d+%/g, '').trim();
                var titleText = escapeHtml(rawTitle);
                var percent = parseInt(candidateElem.attr('data-num-percent'), 10) || 0;
                var timeLabel = percent > 0 ? percent + '%' : Lampa.Lang.translate('num_play_now') + ' ▶';

                var banner = $(`
                    <div class="num-resume-banner selector">
                        <div class="num-resume-banner__icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                        </div>
                        <div class="num-resume-banner__body">
                            <div class="num-resume-banner__label">${escapeHtml(Lampa.Lang.translate('num_continue_watching'))}</div>
                            <div class="num-resume-banner__title">${titleText}</div>
                        </div>
                        <div class="num-resume-banner__time">${escapeHtml(timeLabel)}</div>
                    </div>
                `);

                banner.on('hover:enter click', function (ev) {
                    ev.preventDefault();
                    candidateElem.trigger('hover:enter');
                });

                var seasonBar = container.find('.num-season-bar');
                if (seasonBar.length) {
                    seasonBar.after(banner);
                }
            }
        }

        // Фильтрация сезонов
        function applySeasonFilter(container, season) {
            activeSeason = season;

            container.find('.num-season-tab').each(function () {
                var tabSeason = $(this).attr('data-season');
                var isCurrent = (season === 'all' && tabSeason === 'all') || (tabSeason === String(season));
                $(this).toggleClass('active', isCurrent);
            });

            container.find('.torrent-serial, .torrent-file').each(function () {
                var itemSeason = parseInt($(this).attr('data-num-season'), 10) || 0;
                if (season === 'all' || itemSeason === 0 || itemSeason === parseInt(season, 10)) {
                    $(this).removeClass('num-hidden-item').addClass('selector');
                } else {
                    $(this).addClass('num-hidden-item').removeClass('selector');
                }
            });

            container.find('.torrnet-folder-name').each(function () {
                var nextItems = $(this).nextUntil('.torrnet-folder-name', ':not(.num-hidden-item)');
                $(this).toggle(nextItems.length > 0);
            });

            updateSeasonTabBadges(container);
            updateContinueBanner(container, season);

            if (Lampa.Controller && Lampa.Controller.collectionSet) {
                Lampa.Controller.collectionSet(container);
            }
        }

        // Корректная отметка сезона как просмотренного без выдуманных длительностей
        function markSeasonWatched(container, targetSeason) {
            var itemsToMark = [];
            currentTorrentItems.forEach(function (el) {
                if (targetSeason === 'all' || el.__num_season === parseInt(targetSeason, 10)) {
                    itemsToMark.push(el);
                }
            });

            itemsToMark.forEach(function (el) {
                if (!el.timeline) el.timeline = {};
                var duration = el.timeline.duration || 0;
                el.timeline.percent = 100;
                el.timeline.time = duration > 0 ? duration : 0;

                if (Lampa.Timeline && Lampa.Timeline.update) {
                    Lampa.Timeline.update(el.timeline);
                }

                // Синхронизируем с TorrServer только если известна реальная длительность
                if (duration > 0 && Lampa.Storage.field('torrserver_tracktimecode') && Lampa.Torserver && Lampa.Torserver.viewedSet) {
                    Lampa.Torserver.viewedSet(el.torrent_hash, el.id, duration);
                }
            });

            // Обновляем атрибуты и таймлайны в DOM
            container.find('.torrent-serial:not(.num-hidden-item), .torrent-file:not(.num-hidden-item)').each(function () {
                $(this).attr('data-num-percent', 100);
                $(this).find('.num-resume-badge').remove();
                
                var line = $(this).find('.time-line');
                if (line.length) {
                    line.removeClass('hide');
                    line.find('div').css('width', '100%');
                }
            });

            updateSeasonTabBadges(container);
            updateContinueBanner(container, targetSeason);

            if (Lampa.Noty) {
                Lampa.Noty.show(Lampa.Lang.translate('num_season_marked'));
            }
        }

        // Внедрение панели сезонов (вызывается после того как все timeline данные готовы)
        function checkAndInjectSeasonBar(targetContainer) {
            var container = targetContainer || $('.modal__content .torrent-files');
            if (!container.length) return;
            if (container.find('.num-season-bar').length) return;

            var seasonCounts = {};
            var episodes = container.find('.torrent-serial, .torrent-file');
            if (!episodes.length) return;

            episodes.each(function () {
                var s = parseInt($(this).attr('data-num-season'), 10) || 0;
                if (s > 0) seasonCounts[s] = (seasonCounts[s] || 0) + 1;
            });

            var seasons = Object.keys(seasonCounts).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; });

            if (seasons.length > 0) {
                var bar = $('<div class="num-season-bar selector-box"></div>');

                var totalFiles = episodes.length;
                var allTab = $('<div class="num-season-tab selector" data-season="all">' + escapeHtml(Lampa.Lang.translate('num_season_all')) + ' <span class="num-count">' + totalFiles + '</span></div>');
                bar.append(allTab);

                seasons.forEach(function (s) {
                    var count = seasonCounts[s];
                    var sTab = $('<div class="num-season-tab selector" data-season="' + s + '">' + escapeHtml(Lampa.Lang.translate('num_season_prefix')) + ' ' + s + ' <span class="num-count">' + count + '</span></div>');
                    bar.append(sTab);
                });

                // Кнопка быстрой отметки сезона
                var markBtn = $('<div class="num-season-action selector">' + escapeHtml(Lampa.Lang.translate('num_mark_season_watched')) + '</div>');
                markBtn.on('hover:enter click', function (e) {
                    e.preventDefault();
                    markSeasonWatched(container, activeSeason || 'all');
                });
                bar.append(markBtn);

                container.prepend(bar);

                // Определение сезона с незавершенным просмотром по реальным данным Timeline
                var determinedSeason = null;

                // 1. Сначала ищем сезон где серия прямо сейчас не досмотрена (0 < percent < 85)
                episodes.each(function () {
                    var s = parseInt($(this).attr('data-num-season'), 10) || 0;
                    var percent = parseInt($(this).attr('data-num-percent'), 10) || 0;
                    if (s > 0 && percent > 0 && percent < 85) {
                        determinedSeason = s;
                        return false;
                    }
                });

                // 2. Если таких нет — ищем первый сезон с непросмотренными сериями
                if (!determinedSeason) {
                    for (var i = 0; i < seasons.length; i++) {
                        var seasonNum = seasons[i];
                        var hasUnwatched = false;
                        episodes.each(function () {
                            var s = parseInt($(this).attr('data-num-season'), 10) || 0;
                            var percent = parseInt($(this).attr('data-num-percent'), 10) || 0;
                            if (s === seasonNum && percent < 85) {
                                hasUnwatched = true;
                                return false;
                            }
                        });
                        if (hasUnwatched) {
                            determinedSeason = seasonNum;
                            break;
                        }
                    }
                }

                if (!determinedSeason) determinedSeason = seasons[0];
                activeSeason = determinedSeason;

                // Плавное центрирование активной вкладки при фокусе
                bar.find('.num-season-tab').on('hover:focus', function () {
                    if (this.scrollIntoView) {
                        this.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                });

                bar.find('.num-season-tab').on('hover:enter click', function (e) {
                    e.preventDefault();
                    var s = $(this).attr('data-season');
                    applySeasonFilter(container, s);
                });

                applySeasonFilter(container, activeSeason);
            }
        }

        // Подписка на официальное событие Modal.update (без холостой нагрузки на CPU)
        if (Lampa.Modal && Lampa.Modal.listener) {
            Lampa.Modal.listener.follow('update', function (e) {
                if (e && e.new_html && e.new_html.hasClass('torrent-files')) {
                    setTimeout(function () {
                        checkAndInjectSeasonBar(e.new_html);
                    }, 50);
                }
            });
        }

        // Легковесный оптимизированный MutationObserver с дебаунсом как страховка
        var debounceTimer = null;
        var observer = new MutationObserver(function () {
            if (debounceTimer) return;
            debounceTimer = setTimeout(function () {
                debounceTimer = null;
                checkAndInjectSeasonBar();
            }, 120);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log(PLUGIN_NAME + ' v' + VERSION + ' initialized.');
    }

    if (typeof window !== 'undefined') {
        if (window.appready) {
            startPlugin();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') startPlugin();
            });
        }
    }
})();
