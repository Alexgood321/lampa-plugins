(function () {
    'use strict';

    if (window.plugin_num_series_destroy) {
        try { window.plugin_num_series_destroy(); } catch (error) { console.warn('NUM Series cleanup:', error); }
    } else if (window.plugin_num_series_ready) {
        return; // Первая замена 1.3.0 требует перезапуска Lampa
    }
    window.plugin_num_series_ready = true;

    var PLUGIN_NAME = 'NUM Series Pro';
    var VERSION = '2.0.9';

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

        // Нативная компактная компоновка. Все стили ограничены префиксом num2.
        var style = document.createElement('style');
        style.id = 'num-series-styles';
        style.textContent = [
            '.num2-bar{display:flex;align-items:center;gap:.36em;max-width:100%;padding:.26em 0;margin:0 0 .46em;background:transparent;border:0;box-sizing:border-box;}',
            '.num2-tabs{display:flex;position:relative;flex:1;min-width:0;max-width:100%;align-items:center;gap:.45em;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;touch-action:pan-x;}',
            '.num2-tabs::-webkit-scrollbar{display:none;}',
            '.num2-tab,.num2-actions{display:inline-flex;align-items:center;justify-content:center;gap:.34em;flex:0 0 auto;min-height:2.55em;padding:.35em .65em;border:1px solid rgba(255,255,255,.055);border-radius:.46em;background:rgba(255,255,255,.06);color:rgba(255,255,255,.78);font-size:.9em;font-weight:500;white-space:nowrap;box-sizing:border-box;cursor:pointer;}',
            '.num2-tab.active{background:rgba(255,255,255,.17);border-color:rgba(255,255,255,.34);color:#fff;font-weight:600;}',
            '.num2-tab.focus,.num2-actions.focus,.num2-resume.focus{background:rgba(255,255,255,.25);outline:2px solid currentColor;outline-offset:1px;color:#fff;}',
            '.num2-tab .num2-count{color:rgba(255,255,255,.63);font-size:.84em;font-variant-numeric:tabular-nums;}',
            '.num2-tab.active .num2-count{color:#fff;}',
            '.num2-tab .num2-done{color:#70d6a0;}',
            '.num2-actions{width:2.45em;min-width:2.45em;height:2.45em;min-height:2.45em;padding:0;opacity:.88;background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.09);}',
            '.num2-actions svg{display:block;width:1.25em;height:1.25em;pointer-events:none;}',
            '.num2-resume{display:flex;gap:.8em;align-items:center;min-height:3.35em;padding:.55em .85em;margin:0 0 .7em;border:1px solid rgba(255,255,255,.12);border-radius:.6em;background:rgba(255,255,255,.055);box-sizing:border-box;cursor:pointer;}',
            '.num2-play{display:flex;align-items:center;justify-content:center;width:2.25em;height:2.25em;flex:0 0 auto;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;}',
            '.num2-play svg{display:block;width:1.2em;height:1.2em;flex:0 0 auto;fill:currentColor;transform:translateX(.08em);}',
            '.num2-resume-body{flex:1;min-width:0;}',
            '.num2-resume-top{display:flex;align-items:center;gap:.55em;min-width:0;font-size:.81em;margin-bottom:.16em;}',
            '.num2-resume-status{flex:0 0 auto;color:rgba(255,255,255,.8);font-weight:600;}',
            '.num2-resume-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.55;}',
            '.num2-resume-title{font-size:1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.num2-resume-percent{flex:0 0 auto;font-size:.85em;opacity:.76;font-variant-numeric:tabular-nums;}',
            '.num2-progress{height:3px;margin-top:.38em;background:rgba(255,255,255,.12);border-radius:4px;overflow:hidden;}',
            '.num2-progress>div{height:100%;background:#71c99f;}',
            '.num-hidden-item{display:none!important;}',
            '.num2-episode-done{border-left:3px solid #40b97d!important;}',
            '.num2-episode-inferred{border-left:3px solid rgba(64,185,125,.72)!important;}',
            '.num2-episode-started{border-left:3px solid #d9a143!important;}',
            '.num2-episode-action{display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;margin-left:.55em;width:1.8em;height:1.8em;min-width:1.8em;border-radius:50%;border:1px solid rgba(255,255,255,.24);color:rgba(255,255,255,.65);cursor:pointer;box-sizing:border-box;touch-action:manipulation;}',
            '.num2-episode-action svg{width:1em;height:1em;display:block;stroke:currentColor;stroke-width:2.3;fill:none;pointer-events:none;}',
            '.num2-episode-action[data-state=done]{background:rgba(55,174,105,.24);border-color:#40b97d;color:#78e5a8;}',
            '.num2-episode-action[data-state=inferred]{border-color:#40b97d;color:#78e5a8;background:rgba(55,174,105,.08);}',
            '.num2-episode-action[data-state=started]{border-color:#d9a143;color:#e7b457;background:rgba(217,161,67,.10);}',
            '.num2-episode-action:focus-visible{outline:2px solid #fff;outline-offset:2px;}',
            '.num-resume-badge{display:inline-block;margin-left:.4em;padding:.08em .35em;border-radius:.25em;font-size:.75em;color:#b6e6c7;background:rgba(83,179,120,.14);font-variant-numeric:tabular-nums;}',
            '@media(max-width:600px){.num2-bar{gap:.5em;padding:.3em 0;margin-bottom:.75em}.num2-tabs{display:flex!important;gap:.4em}.num2-tab{min-height:3.35em;padding:.65em 1em;font-size:.96em;border-radius:.52em}.num2-actions{flex:0 0 3.35em;width:3.35em;min-width:3.35em;height:3.35em;min-height:3.35em;border-radius:.52em}.num2-resume{min-height:4.3em;padding:.85em .95em;gap:.8em;border-radius:.7em;margin-bottom:1em}.num2-play{width:2.6em;height:2.6em}.num2-resume-title{font-size:1em}.num2-resume-top{font-size:.85em;margin-bottom:.25em}}',
            '@media(max-width:600px){.num2-episode-action{width:2.15em;height:2.15em;min-width:2.15em;margin-left:.7em}}',
            // Телевизоры, десктопы и планшеты: отдельная комфортная вертикальная сетка.
            // До 600px используются прежние мобильные размеры без изменений.
            '@media(min-width:601px){' +
                '.num2-bar{gap:.65em;padding:.45em 0;margin-bottom:.85em}' +
                '.num2-tabs{gap:.65em}' +
                '.num2-tab{min-height:3.4em;padding:.68em 1.08em;font-size:1em;line-height:1.3;border-radius:.55em}' +
                '.num2-tab .num2-count{font-size:.9em}' +
                '.num2-actions{flex:0 0 3.4em;width:3.4em;min-width:3.4em;height:3.4em;min-height:3.4em;font-size:1em;border-radius:.55em}' +
                '.num2-actions svg{width:1.4em;height:1.4em}' +
                '.num2-resume{min-height:5.85em;padding:1.08em 1.3em;gap:1.15em;margin-bottom:1.5em;border-radius:.75em}' +
                '.num2-play{width:3em;height:3em}' +
                '.num2-play svg{width:1.35em;height:1.35em}' +
                '.num2-resume-top{font-size:.98em;line-height:1.4;gap:1em;margin-bottom:.48em;flex-wrap:wrap}' +
                '.num2-resume-status{line-height:1.4}' +
                '.num2-resume-meta{font-size:.93em;line-height:1.4}' +
                '.num2-resume-title{font-size:1.12em;line-height:1.42;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}' +
                '.num2-resume-percent{font-size:.98em}' +
                '.num2-progress{height:4px;margin-top:.72em}' +
                '}',
            '@media(prefers-reduced-motion:reduce){.num2-tab,.num2-resume{scroll-behavior:auto;}}'
        ].join('\n');
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

        var activeSeason = 'all';
        var currentTorrentItems = [];
        var currentRows = [];
        var currentCard = null;
        var syncUnsubscribe = null;
        var currentContainer = null;
        var lastBulk = null;
        var refreshTimer = null;
        var subscriptions = [];
        var threshold = 90;
        var preferences = [
            { id: 'resume', title: 'Показывать продолжение просмотра', value: true },
            { id: 'autoseason', title: 'Автоматически выбирать сезон', value: true },
            { id: 'counters', title: 'Показывать счётчики серий', value: true },
            { id: 'percents', title: 'Показывать проценты просмотра', value: true },
            { id: 'clean', title: 'Очищать технические названия', value: true },
            { id: 'iina', title: 'Открытие сезона в IINA на Mac', value: true },
            { id: 'confirm', title: 'Подтверждать массовые действия', value: true }
        ];
        function setting(id) {
            var descriptor = preferences.filter(function (pref) { return pref.id === id; })[0];
            var fallback = descriptor ? descriptor.value : true;
            return Boolean(Lampa.Storage.get('num2_' + id, fallback));
        }
        function follow(listener, type, handler) {
            if (!listener || typeof listener.follow !== 'function') return;
            listener.follow(type, handler);
            subscriptions.push({ listener: listener, type: type, handler: handler });
        }
        function safeAction(element, handler) {
            var previous = 0;
            element.on('hover:enter click', function (event) {
                if (event && event.preventDefault) event.preventDefault();
                if (event && event.stopPropagation) event.stopPropagation();
                if (Date.now() - previous < 280) return;
                previous = Date.now();
                handler(event);
            });
        }
        // Lampa.Modal.bind() срабатывает до внедрения наших контролов.
        // Без отдельного hover:focus фокус пульта перемещается к вкладке,
        // но модальное окно оставляет её за верхней границей скролла.
        function scrollHeaderIntoView(element) {
            if (!element || !currentContainer || !currentContainer.length) return;
            if (!Lampa.Platform || typeof Lampa.Platform.screen !== 'function' ||
                !Lampa.Platform.screen('tv')) return;
            if (currentContainer[0] && typeof currentContainer[0].contains === 'function' &&
                !currentContainer[0].contains(element)) return;
            var scroll = Lampa.Modal && Lampa.Modal.scroll && Lampa.Modal.scroll();
            if (scroll && typeof scroll.update === 'function') scroll.update($(element), false);
        }
        function canUseIINA() {
            return setting('iina') && Lampa.Platform && typeof Lampa.Platform.macOS === 'function' && Lampa.Platform.macOS();
        }
        function cloudApi() {
            var sync = window.LampaSyncPro;
            return sync && typeof sync.getEpisodeState==='function' ? sync : null;
        }
        function selectedCard(row) {
            if(row && row.element && row.element.card)return row.element.card;
            if(currentCard)return currentCard;
            if(Lampa.Activity && typeof Lampa.Activity.active==='function'){
                var a=Lampa.Activity.active() || {};
                return a.movie || a.card || null;
            }
            return null;
        }
        function effectivePercent(row) {
            if(!row || !row.element || !row.element.timeline)return 0;
            var native=Math.max(0,Math.min(100,Number(row.element.timeline.percent)||0));
            if(!row.season || !row.episode)return native;
            var sync=cloudApi(),card=selectedCard(row);
            if(!sync || !card)return native;
            var ep='s'+row.season+':e'+row.episode;
            var record=sync.getEpisodeState(card,ep);
            if(record && record.state==='completed')return 100;
            if(record && record.state==='reset')return 0;
            if(typeof sync.getResume==='function'){
                var resume=sync.getResume(card);
                if(resume && resume.episode_key===ep && resume.duration_seconds>0 &&
                    resume.watched_state!=='completed')
                    return Math.max(native,Math.min(100,100*Number(resume.position_seconds||0)/Number(resume.duration_seconds)));
            }
            return native;
        }
        // A series status is shared across different torrents and devices via Sync Pro.
        // 'inferred' is intentionally distinct from a manually or playback-confirmed completion.
        function episodeStatus(row) {
            if (!row || !row.element || !row.element.timeline) return 'none';
            var native = Math.max(0, Math.min(100, Number(row.element.timeline.percent) || 0));
            if (row.season > 0 && row.episode > 0) {
                var api = cloudApi(), card = selectedCard(row);
                if (api && card) {
                    var record = api.getEpisodeState(card, 's' + row.season + ':e' + row.episode);
                    if (record && record.state === 'completed')
                        return record.basis === 'inferred' ? 'inferred' : 'done';
                    if (record && record.state === 'reset') return 'none';
                    if (record && record.state === 'in_progress') return 'started';
                }
            }
            if (native >= threshold) return 'done';
            if (native > 0) return 'started';
            return 'none';
        }
        function markSingle(row, watched) {
            if (!row || row.season <= 0 || row.episode <= 0) return;
            var sync = cloudApi(), card = selectedCard(row);
            // Do not promise cloud delivery when Sync Pro is unavailable.
            var saved = !!(sync && card && typeof sync.markEpisode === 'function' &&
                sync.markEpisode(card, 's' + row.season + ':e' + row.episode, watched));
            var changes = {};
            currentRows.filter(function (candidate) {
                return candidate.season === row.season && candidate.episode === row.episode &&
                    candidate.element && candidate.element.timeline;
            }).forEach(function (candidate) {
                var item = candidate.element, timeline = item.timeline;
                var key = String(timeline.hash || item.path || item.id || '') + ':' +
                    String(item.torrent_hash || '');
                if (changes[key]) return;
                changes[key] = true;
                timeline.percent = watched ? 100 : 0;
                timeline.time = watched ? (Number(timeline.duration) || 0) : 0;
                if (Lampa.Timeline && Lampa.Timeline.update && timeline.hash)
                    Lampa.Timeline.update(timeline);
                if (Lampa.Storage.field('torrserver_tracktimecode') &&
                    Lampa.Torserver && typeof Lampa.Torserver.viewedSet === 'function' &&
                    item.torrent_hash && item.id != null &&
                    (!watched || Number(timeline.duration) > 0)) {
                    Lampa.Torserver.viewedSet(item.torrent_hash, item.id, timeline.time);
                }
            });
            refreshCloud();
            if (!saved && Lampa.Noty && Lampa.Noty.show)
                Lampa.Noty.show('Отметка сохранена локально. Для синхронизации войдите в Sync Pro.');
        }
        function paintEpisodeStatus(row) {
            if (!row || !row.item || row.season <= 0 || row.episode <= 0) return;
            var status = episodeStatus(row);
            row.item.attr('data-num-watch-state', status);
            row.item.toggleClass('num2-episode-done', status === 'done');
            row.item.toggleClass('num2-episode-inferred', status === 'inferred');
            row.item.toggleClass('num2-episode-started', status === 'started');
            var title = row.item.find('.torrent-serial__title, .torrent-file__title');
            title.find('.num2-episode-action').remove();
            var complete = status === 'done' || status === 'inferred';
            var hint = complete ? 'Снять отметку о просмотре' : 'Отметить серию просмотренной';
            var icon = complete ?
                '<path d="M4 12.5l5.1 5.1L20 6.7"/>' :
                status === 'started' ? '<path d="M9 5l10 7-10 7z"/>' :
                '<circle cx="12" cy="12" r="8"/>';
            var badge = $('<span class="num2-episode-action" data-state="' + status +
                '" role="button" aria-label="' + hint + '" title="' + hint + '">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true">' + icon + '</svg></span>');
            badge.on('click', function (event) {
                if (event && event.preventDefault) event.preventDefault();
                if (event && event.stopPropagation) event.stopPropagation();
                markSingle(row, !complete);
            });
            title.append(badge);
        }
        function paintPercent(row, value) {
            if(!row || !row.item || !row.element || !row.element.timeline)return;
            var percent=Math.max(0,Math.min(100,Number(value)||0));
            row.item.attr('data-num-percent',percent);
            row.item.attr('data-num-updated',Number(row.element.timeline.updated)||0);
            var title=row.item.find('.torrent-serial__title, .torrent-file__title');
            title.find('.num-resume-badge').remove();
            if(setting('percents') && percent>0 && percent<threshold)
                title.append('<span class="num-resume-badge">'+Math.round(percent)+'%</span>');
            paintEpisodeStatus(row);
        }
        function refreshCloud() {
            if(!currentRows.length || !currentContainer || !currentContainer.length)return;
            currentRows.forEach(function(row){paintPercent(row,effectivePercent(row));});
            scheduleRefresh();
        }
        function ensureCloudListener() {
            if(syncUnsubscribe)return;
            var sync=cloudApi();
            if(sync && typeof sync.onChange==='function')
                syncUnsubscribe=sync.onChange(refreshCloud);
        }
        function reportMark(row,watched,seen) {
            var sync=cloudApi(),card=selectedCard(row);
            if(!sync || !card || !row || !row.season || !row.episode)return;
            var key=row.season+':'+row.episode;
            if(seen[key])return;
            seen[key]=true;
            if(typeof sync.markEpisode==='function')
                sync.markEpisode(card,'s'+row.season+':e'+row.episode,watched);
        }
        function setPercent(row, value) {
            var percent = Math.max(0, Math.min(100, Number(value) || 0));
            row.element.timeline.percent = percent;
            paintPercent(row,effectivePercent(row));
        }
        function onTorrentFile(event) {
            if (!event) return;
            ensureCloudListener();
            if (event.type === 'list_open') {
                currentCard=event.params && (event.params.movie || event.params.card) ||
                    event.movie || event.card || (
                        Lampa.Activity && typeof Lampa.Activity.active==='function' &&
                        (Lampa.Activity.active() || {}).movie
                    ) || null;
                currentTorrentItems = event.items || [];
                currentRows = [];
                currentContainer = null;
                activeSeason = 'all';
                lastBulk = null;
            }
            if (event.type === 'render' && event.element && event.item) {
                var element = event.element;
                if(element.card)currentCard=element.card;
                else if(event.params && event.params.movie)currentCard=event.params.movie;
                var parsed = parseSeasonEpisode(element.path || element.path_human);
                var season = Number(element.season) || parsed.season || 0;
                var episode = Number(element.episode) || parsed.episode || 0;
                element.__num_season = season;
                element.__num_episode = episode;
                event.item.attr('data-num-season', season);
                event.item.attr('data-num-episode', episode);
                var row = { element: element, item: event.item, season: season, episode: episode };
                currentRows.push(row);
                if (setting('clean')) {
                    var title = event.item.find('.torrent-serial__title, .torrent-file__title');
                    var original = title.text().trim();
                    if (/\.(mkv|mp4|avi)\b|1080p|2160p|WEB-DL|BluRay/i.test(original)) {
                        title.text(cleanTechnicalTitle(original, episode));
                    }
                }
                if (element.timeline) setPercent(row, element.timeline.percent);
            }
            if (event.type === 'onlong' && event.menu && event.element) {
                var chosen = currentRows.filter(function (r) { return r.element === event.element; })[0];
                if (chosen && chosen.season > 0 && chosen.episode > 0) {
                    var status = episodeStatus(chosen);
                    var watched = status !== 'done' && status !== 'inferred';
                    event.menu.unshift({
                        title: watched ? '✓ Отметить серию просмотренной' : '↺ Снять отметку просмотра',
                        onSelect: function () { markSingle(chosen, watched); }
                    });
                }
            }
            if (event.type === 'onlong' && canUseIINA() && event.menu && event.items && event.items.length > 1 && event.element && event.element.torrent_hash) {
                var url = getTorrServerUrl() + '/stream?link=' + encodeURIComponent(event.element.torrent_hash) + '&m3u';
                event.menu.push({
                    title: Lampa.Lang.translate('num_open_m3u_iina'),
                    onSelect: function () {
                        window.location.href = 'iina://weblink?url=' + encodeURIComponent(url);
                    }
                });
            }
            if (event.type === 'list_close') {
                currentContainer = null;
                currentRows = [];
            }
        }
        follow(Lampa.Listener, 'torrent_file', onTorrentFile);

        // Операции ведутся по оригинальным timeline-объектам Lampa, а не по HTML.
        function groups() {
            var map = {};
            var result = [];
            currentRows.forEach(function (row) {
                if (!row.element || !row.element.timeline || row.season <= 0 || row.episode <= 0) return;
                var key = row.season + ':' + row.episode;
                var progress = effectivePercent(row);
                var updated = Number(row.element.timeline.updated) || 0;
                var group = map[key];
                if (!group) {
                    group = map[key] = { key: key, season: row.season, episode: row.episode, percent: 0, updated: 0, row: row, alternatives: [] };
                    result.push(group);
                }
                group.alternatives.push(row);
                if (progress >= group.percent || (progress > 0 && updated > group.updated)) group.row = row;
                group.percent = Math.max(group.percent, progress);
                group.updated = Math.max(group.updated, updated);
            });
            result.sort(function (a, b) { return a.season - b.season || a.episode - b.episode; });
            return result;
        }
        function resumeCandidate(list) {
            if (!list.length) return null;
            var sync=cloudApi(), card=selectedCard(list[0] && list[0].row);
            if(sync && card && typeof sync.getResume==='function'){
                var current=sync.getResume(card), match=current && String(current.episode_key||'').match(/^s(\d+):e(\d+)$/);
                if(match){
                    var picked=list.filter(function(x){return x.season===Number(match[1]) &&
                        x.episode===Number(match[2]);})[0];
                    if(picked && picked.percent<threshold)return picked;
                    if(picked && picked.percent>=threshold){
                        var next=list.filter(function(x){return x.percent<threshold &&
                            (x.season>picked.season || x.season===picked.season && x.episode>picked.episode);})[0];
                        if(next)return next;
                    }
                }
            }
            var partial = list.filter(function (entry) { return entry.percent > 0 && entry.percent < threshold; });
            if (partial.length) {
                partial.sort(function (a,b) { return b.updated - a.updated || a.season - b.season || a.episode - b.episode; });
                return partial[0];
            }
            var watched = list.filter(function (entry) { return entry.percent >= threshold; });
            if (watched.length) {
                watched.sort(function (a,b) { return b.updated - a.updated || b.season - a.season || b.episode - a.episode; });
                var last = watched[0];
                var next = list.filter(function (entry) {
                    return entry.percent < threshold && (entry.season > last.season || (entry.season === last.season && entry.episode > last.episode));
                })[0];
                if (next) return next;
            }
            return list.filter(function (entry) { return entry.percent < threshold; })[0] || null;
        }

                // Числитель всегда показывает просмотренные серии, включая ноль.
        function formatSeasonCount(watched, total) {
            return String(watched) + '/' + String(total);
        }
        function seasonStats(season, episodes) {
            var list = (episodes || groups()).filter(function (entry) {
                return season === 'all' || String(entry.season) === String(season);
            });
            var total = list.length;
            var watched = list.filter(function (entry) { return entry.percent >= threshold; }).length;
            if (season === 'unknown') {
                var unknown = currentRows.filter(function (row) { return row.season === 0; });
                total = unknown.length;
                watched = unknown.filter(function (row) {
                    return row.element.timeline && Number(row.element.timeline.percent) >= threshold;
                }).length;
            }
            return { total: total, watched: watched };
        }
        function seasonLabel(season) {
            return season === 'all' ? 'Все серии' : season === 'unknown' ? 'Не определено' : 'Сезон ' + season;
        }
        function updateSeasonTabBadges(container) {
            var episodes = groups();
            container.find('.num2-tab').each(function () {
                var tab = $(this), season = tab.attr('data-season');
                var stats = seasonStats(season, episodes);
                var text = setting('counters') ? formatSeasonCount(stats.watched, stats.total) : '';
                tab.find('.num2-count').text(text).toggleClass('num2-done', stats.total > 0 && stats.watched === stats.total);
                tab.attr('aria-label', seasonLabel(season) + (text ? ', просмотрено ' + stats.watched + ' из ' + stats.total : ''));
            });
        }

                // Различаем старт, следующую серию и реальное продолжение с прогрессом.
        function resumePresentation(candidate, list) {
            if (!candidate) return null;
            var rawPercent = Math.max(0, Math.min(100, Number(candidate.percent) || 0));
            var percent = Math.round(rawPercent);
            var partial = rawPercent > 0 && rawPercent < threshold;
            var hasPreviousWatched = !partial && list.some(function (entry) {
                return entry.percent >= threshold && (
                    entry.season < candidate.season ||
                    (entry.season === candidate.season && entry.episode < candidate.episode)
                );
            });
            return {
                status: partial ? 'Продолжить просмотр' : hasPreviousWatched ? 'Следующая серия' : 'Начать просмотр',
                meta: 'С' + candidate.season + ' · Е' + candidate.episode,
                percent: partial ? percent : 0
            };
        }
        function updateContinueBanner(container) {
            container.find('.num2-resume').remove();
            if (!setting('resume')) return;
            var list = groups().filter(function (entry) {
                return activeSeason === 'all' || String(entry.season) === String(activeSeason);
            });
            var candidate = resumeCandidate(list);
            if (!candidate) return;
            var display = resumePresentation(candidate, list);
            var row = candidate.row;
            var title = row.item.find('.torrent-serial__title, .torrent-file__title').clone();
            title.find('.num-resume-badge').remove();
            var name = title.text().trim() || 'Серия ' + candidate.episode;
            var percent = display.percent;
            var banner = $('<div class="num2-resume selector" role="button" aria-label="' +
                escapeHtml(display.status + ', ' + display.meta + ', ' + name) + '">' +
                '<div class="num2-play" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M8 5.5c0-.8.9-1.2 1.6-.7l10 6.5a.9.9 0 0 1 0 1.4l-10 6.5c-.7.5-1.6.1-1.6-.7z"/></svg></div>' +
                '<div class="num2-resume-body">' +
                '<div class="num2-resume-top"><span class="num2-resume-status">' + escapeHtml(display.status) + '</span>' +
                '<span class="num2-resume-meta">' + escapeHtml(display.meta) + '</span></div>' +
                '<div class="num2-resume-title">' + escapeHtml(name) + '</div>' +
                (percent ? '<div class="num2-progress"><div style="width:' + percent + '%"></div></div>' : '') +
                '</div>' +
                (percent ? '<div class="num2-resume-percent">' + percent + '%</div>' : '') +
                '</div>');
            safeAction(banner, function () {
                if (String(activeSeason) !== String(candidate.season)) applySeasonFilter(container, String(candidate.season));
                row.item.trigger('hover:enter');
            });
            banner.on('hover:focus', function () { scrollHeaderIntoView(this); });
            container.find('.num2-bar').after(banner);
        }

                function applySeasonFilter(container, season, skipController) {
            activeSeason = String(season);
            container.find('.num2-tab').each(function () {
                var selected = $(this).attr('data-season') === activeSeason;
                $(this).toggleClass('active', selected).attr('aria-selected', selected ? 'true' : 'false');
            });
            container.find('.torrent-serial, .torrent-file').each(function () {
                var rowSeason = Number($(this).attr('data-num-season')) || 0;
                var visible = activeSeason === 'all' || (activeSeason === 'unknown' ? rowSeason === 0 : String(rowSeason) === activeSeason);
                $(this).toggleClass('num-hidden-item', !visible).toggleClass('selector', visible);
            });
            container.find('.torrnet-folder-name').each(function () {
                var visible = $(this).nextUntil('.torrnet-folder-name').filter(':not(.num-hidden-item)').length > 0;
                $(this).toggle(visible).toggleClass('selector', visible);
            });
            updateSeasonTabBadges(container);
            updateContinueBanner(container);
            // При Modal.update() штатный toggle() сам построит коллекцию и назначит фокус.
            // При ручном выборе сезона не теряем выделенную вкладку после перестройки списка.
            var controller = Lampa.Controller;
            var enabled = controller && controller.enabled && controller.enabled();
            if (!skipController && enabled && enabled.name === 'modal' &&
                controller.collectionSet && controller.collectionFocus) {
                var focus = container.find('.selector.focus').first();
                var target = focus.length && focus.is(':visible') ? focus[0] : container.find('.num2-tab.active').first()[0];
                var scrollRoot = Lampa.Modal && Lampa.Modal.scroll ? Lampa.Modal.scroll().render() : container;
                controller.collectionSet(scrollRoot, false, true);
                controller.collectionFocus(target || false, scrollRoot, true);
            }
        }

                // Массовая отметка затрагивает только выбранный сезон и сохраняет снимок для отмены.
        function setWatched(season, watched) {
            var targets = currentRows.filter(function (row) {
                return row.season > 0 && row.episode > 0 && row.element.timeline &&
                    (season === 'all' || String(row.season) === String(season));
            });
            if (!targets.length) return;
            var backup = [], marked = {};
            targets.forEach(function (row) {
                var timeline = row.element.timeline;
                backup.push({ row: row, percent: timeline.percent, time: timeline.time,
                    duration: timeline.duration, cloudWatched:effectivePercent(row)>=threshold });
                timeline.percent = watched ? 100 : 0;
                timeline.time = watched ? (Number(timeline.duration) || 0) : 0;
                if (Lampa.Timeline && Lampa.Timeline.update && timeline.hash) Lampa.Timeline.update(timeline);
                if (Lampa.Storage.field('torrserver_tracktimecode') && Lampa.Torserver &&
                    typeof Lampa.Torserver.viewedSet === 'function' &&
                    row.element.torrent_hash && row.element.id != null &&
                    (!watched || Number(timeline.duration) > 0)) {
                    Lampa.Torserver.viewedSet(row.element.torrent_hash, row.element.id, timeline.time);
                }
                setPercent(row, timeline.percent);
                reportMark(row,watched,marked);
            });
            lastBulk = backup;
            scheduleRefresh();
            if (Lampa.Noty) Lampa.Noty.show('Обновлено серий: ' + targets.length);
        }
        function undoBulk() {
            if (!lastBulk || !lastBulk.length) return;
            var snapshots = lastBulk;
            lastBulk = null;
            var marked={};
            snapshots.forEach(function (entry) {
                var row = entry.row, timeline = row.element.timeline;
                if (!timeline) return;
                timeline.percent = entry.percent;
                timeline.time = entry.time;
                timeline.duration = entry.duration;
                if (timeline.hash && Lampa.Timeline && Lampa.Timeline.update) Lampa.Timeline.update(timeline);
                if (Lampa.Storage.field('torrserver_tracktimecode') && Lampa.Torserver &&
                    Lampa.Torserver.viewedSet && row.element.torrent_hash && row.element.id != null &&
                    (!entry.percent || Number(entry.duration) > 0)) {
                    Lampa.Torserver.viewedSet(row.element.torrent_hash, row.element.id, Number(entry.time) || 0);
                }
                setPercent(row, timeline.percent);
                reportMark(row,entry.cloudWatched===true,marked);
            });
            scheduleRefresh();
            if (Lampa.Noty) Lampa.Noty.show('Предыдущий прогресс восстановлен');
        }
        function openSeasonActions(container) {
            if (!Lampa.Select || !Lampa.Select.show) return;
            var returnTo = Lampa.Controller && Lampa.Controller.enabled() && Lampa.Controller.enabled().name || 'modal';
            var selected = activeSeason === 'all' ? 'всех сезонов' : 'сезона ' + activeSeason;
            var choices = [
                { title: '✓ Отметить просмотренным: ' + selected, action: 'watched' },
                { title: '↺ Сбросить просмотр: ' + selected, action: 'clear' }
            ];
            if (lastBulk && lastBulk.length) choices.push({ title: 'Отменить последнее действие', action: 'undo' });
            Lampa.Select.show({
                title: 'Действия с сериями',
                items: choices,
                onBack: function () { if (Lampa.Controller) Lampa.Controller.toggle(returnTo); },
                onSelect: function (item) {
                    if (Lampa.Controller) Lampa.Controller.toggle(returnTo);
                    if (item.action === 'undo') return undoBulk();
                    var watched = item.action === 'watched';
                    if (!setting('confirm')) return setWatched(activeSeason, watched);
                    Lampa.Select.show({
                        title: 'Подтвердить изменение ' + selected + '?',
                        items: [
                            { title: 'Подтвердить', action: 'confirm' },
                            { title: 'Отмена', action: 'cancel' }
                        ],
                        onBack: function () { if (Lampa.Controller) Lampa.Controller.toggle(returnTo); },
                        onSelect: function (option) {
                            if (Lampa.Controller) Lampa.Controller.toggle(returnTo);
                            if (option.action === 'confirm') setWatched(activeSeason, watched);
                        }
                    });
                }
            });
        }

                function alignSeasonTab(track, tab, mobileScreen) {
            if (mobileScreen || !track || !tab || typeof track.scrollLeft !== 'number') return;
            var left = Number(tab.offsetLeft) || 0;
            var right = left + (Number(tab.offsetWidth) || 0);
            var visibleEnd = track.scrollLeft + (Number(track.clientWidth) || 0);
            if (left < track.scrollLeft) track.scrollLeft = Math.max(0, left - 8);
            else if (right > visibleEnd) track.scrollLeft = right - track.clientWidth + 8;
        }
        function checkAndInjectSeasonBar(targetContainer) {
            ensureCloudListener();
            var container = targetContainer || currentContainer;
            if (!container || !container.length || !currentRows.length) return;
            if (container.find('.num2-bar').length) return;
            currentContainer = container;
            var allGroups = groups();
            var seasons = [];
            var counts = {};
            allGroups.forEach(function (group) {
                counts[group.season] = (counts[group.season] || 0) + 1;
                if (seasons.indexOf(group.season) < 0) seasons.push(group.season);
            });
            seasons.sort(function (a,b) { return a-b; });
            if (!seasons.length) return; // Не подменяем штатный список при неопределённых сезонах.
            var bar = $('<div class="num2-bar"><div class="num2-tabs selector-box"></div></div>');
            var tabs = bar.find('.num2-tabs');
            function addTab(value, title) {
                var tab = $('<div class="num2-tab selector" role="tab" data-season="' + value + '">' +
                    '<span>' + escapeHtml(title) + '</span><span class="num2-count"></span></div>');
                safeAction(tab, function () { applySeasonFilter(container, String(value)); });
                tab.on('hover:focus', function () {
                    // Вертикальный скролл TV и горизонтальный скролл вкладок независимы.
                    scrollHeaderIntoView(this);
                    var mobileScreen = !!(Lampa.Platform && Lampa.Platform.screen &&
                        Lampa.Platform.screen('mobile'));
                    alignSeasonTab(tabs[0], this, mobileScreen);
                });
                tabs.append(tab);
            }
            addTab('all', 'Все');
            seasons.forEach(function (season) { addTab(String(season), 'Сезон ' + season); });
            if (currentRows.some(function (row) { return row.season === 0; })) addTab('unknown', 'Не определено');
            var action = $('<div class="num2-actions selector" role="button" aria-label="Действия с сериями" title="Действия с сериями">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.7"/>' +
                '<circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></div>');
            safeAction(action, function () { openSeasonActions(container); });
            action.on('hover:focus', function () { scrollHeaderIntoView(this); });
            bar.append(action);
            container.prepend(bar);
            var choice = setting('autoseason') && resumeCandidate(allGroups);
            applySeasonFilter(container, choice ? String(choice.season) : 'all', true);
        }
        function scheduleRefresh() {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(function () {
                refreshTimer = null;
                if (!currentContainer || !currentContainer.length) return;
                updateSeasonTabBadges(currentContainer);
                updateContinueBanner(currentContainer);
            }, 30);
        }
        function updateTimeline(event) {
            var entry = event && event.data;
            if (!entry || !entry.road) return;
            var changed = false;
            currentRows.forEach(function (row) {
                var timeline = row.element.timeline;
                if (!timeline || timeline.hash !== entry.hash) return;
                timeline.percent = entry.road.percent;
                timeline.time = entry.road.time;
                timeline.duration = entry.road.duration;
                timeline.updated = entry.road.updated;
                setPercent(row, timeline.percent);
                changed = true;
            });
            if (changed) scheduleRefresh();
        }
        function readTimeline() {
            if (!Lampa.Timeline || !Lampa.Timeline.view) return;
            currentRows.forEach(function (row) {
                var timeline = row.element.timeline;
                if (!timeline || !timeline.hash) return;
                var next = Lampa.Timeline.view(timeline.hash, timeline.card ? {
                    card: timeline.card, season: timeline.season, episode: timeline.episode
                } : null);
                if (!next) return;
                timeline.percent = next.percent;
                timeline.time = next.time;
                timeline.updated = next.updated;
                setPercent(row, timeline.percent);
            });
            scheduleRefresh();
        }
        follow(Lampa.Timeline && Lampa.Timeline.listener, 'update', updateTimeline);
        follow(Lampa.Timeline && Lampa.Timeline.listener, 'read', readTimeline);

        function registerSettings() {
            if (!Lampa.SettingsApi) return;
            Lampa.SettingsApi.addComponent({
                component: 'num_series_pro',
                name: 'NUM Series Pro',
                icon: '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m10 8 5 4-5 4z"/></svg>'
            });
            preferences.forEach(function (pref) {
                Lampa.SettingsApi.addParam({
                    component: 'num_series_pro',
                    param: {name: 'num2_' + pref.id, type: 'trigger', default: setting(pref.id)},
                    field: {name: pref.title},
                    onChange: function (value) {
                        Lampa.Storage.set('num2_' + pref.id, !!value);
                        if (currentContainer && currentContainer.length) {
                            currentContainer.find('.num2-bar,.num2-resume').remove();
                            checkAndInjectSeasonBar(currentContainer);
                        }
                    }
                });
            });
        }
        registerSettings();

                // Обработчик отрабатывает после штатного render и modal.update.
        follow(Lampa.Modal && Lampa.Modal.listener, 'update', function (event) {
            if (event && event.new_html && event.new_html.hasClass('torrent-files')) {
                // Делаем это синхронно до Modal.toggle(), чтобы навигатор TV
                // сразу увидел вкладки и баннер в итоговом списке .selector.
                checkAndInjectSeasonBar(event.new_html);
            }
        });
        follow(Lampa.Modal && Lampa.Modal.listener, 'close', function () {
            currentContainer = null;
            currentRows = [];
            currentCard = null;
        });
        window.plugin_num_series_destroy = function () {
            subscriptions.forEach(function (subscription) {
                if (subscription.listener.remove) subscription.listener.remove(subscription.type, subscription.handler);
            });
            if (refreshTimer) clearTimeout(refreshTimer);
            if (typeof syncUnsubscribe==='function')syncUnsubscribe();
            syncUnsubscribe=null;
            $('.num2-bar,.num2-resume').remove();
            $('#num-series-styles').remove();
            window.plugin_num_series_ready = false;
            if (window.__AlexgoodPluginRuntime)
                delete window.__AlexgoodPluginRuntime['alexgood321/lampa-plugins/num_series.js'];
            window.plugin_num_series_destroy = null;
        };


                window.__AlexgoodPluginRuntime = window.__AlexgoodPluginRuntime || {};
                window.__AlexgoodPluginRuntime['alexgood321/lampa-plugins/num_series.js'] = {
                    version:VERSION, ready:true, started_at:Date.now()
                };
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
