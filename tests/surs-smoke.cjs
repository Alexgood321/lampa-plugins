'use strict';
// SURS Pro smoke/regression tests. Run: node tests/surs-smoke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'surs.js'), 'utf8');
new vm.Script(source, { filename: 'surs.js' });
let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    process.stdout.write('✓ ' + name + '\n');
}
function boot({ ready = true, saved = null, tv = false, coarse = false, touchPoints = 0 } = {}) {
    const stored = new Map();
    if (saved !== null) stored.set('surs_fixed_shelves_v2', saved);
    const timers = [];
    const warnings = [];
    let contentRowsCalls = 0;
    const added = [];
    const settings = [];
    const components = [];
    const navigations = [];
    const window = { appready: true, matchMedia: () => ({matches: coarse}), navigator: {maxTouchPoints: touchPoints} };
    const Lampa = {
        Reguest: function () {},
        Api: {
            sources: ready ? { tmdb: {
                get: (url, params, done) => done({ results: [{ id: 123, title: 'Тестовый фильм' }] })
            }} : {},
            partNext: (parts, limit, loaded, empty) => {
                const picked = parts.filter(x => typeof x === 'function').slice(0, limit);
                const output = [];
                picked.forEach(fn => fn(value => {
                    if (value && Array.isArray(value.results) && value.results.length) output.push(value);
                }));
                picked.forEach(fn => { const idx = parts.indexOf(fn); if (idx >= 0) parts[idx] = false; });
                if (output.length) loaded(output);
                else if (typeof empty === 'function') empty();
            }
        },
        ContentRows: {
            add: row => added.push(row),
            call: () => { contentRowsCalls++; }
        },
        Storage: {
            get: (key, fallback) => stored.has(key) ? stored.get(key) : fallback,
            field: key => stored.has(key) ? stored.get(key) : true,
            set: (key, value) => stored.set(key, value)
        },
        SettingsApi: {
            addComponent: component => components.push(component),
            addParam: param => settings.push(param)
        },
        Activity: { active: () => true, replace: value => navigations.push(value) },
        Listener: { follow: () => {} },
        Noty: { show: () => {} },
        Platform: { screen: type => type === 'tv' && tv },
        Favorite: { continues: () => [] },
        Maker: { make: (type, data, choose) => {
            if (typeof choose === 'function') return choose({only: (...selected) => selected});
            return { type, data };
        }}
    };
    const $ = target => {
        if (target && typeof target.addClass === 'function') {
            if (!target.css) target.css = (key, value) => { if (!target.styles) target.styles = {}; target.styles[key] = value; return target; };
            if (!target.attr) target.attr = (key, value) => { if (!target.attrs) target.attrs = {}; target.attrs[key] = value; return target; };
            return target;
        }
        return { length: 1, append: () => {} };
    };
    const ctx = {
        window, Lampa, $,
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
        clearTimeout: () => {},
        console: { log: () => {}, error: (...m) => warnings.push(m), warn: (...m) => warnings.push(m) }
    };
    vm.runInNewContext(source, ctx, { filename: 'surs.js' });
    const rows = () => window.LampaShelfManager.getSavedShelves();
    const getMain = (sourceId = 'SURS') => {
        let result;
        Lampa.Api.sources[sourceId].main({ source: sourceId }, x => { result = x; }, () => { result = []; });
        return result;
    };
    return { stored, timers, warnings, window, Lampa, added, settings, components, navigations, rows, getMain,
        contentRowsCalls: () => contentRowsCalls };
}

test('plugin syntax and version', () => {
    assert.match(source, /Версия: 3\.8\.6/);
});
test('factory default matches 11 visible shelves and keeps 12 disabled', () => {
    const app = boot();
    const rows = app.rows();
    const expected = [
        'nav_buttons', 'core_continue', 'new_movies', 'new_tv',
        'trend_movies', 'trend_tv', 'period_10s', 'period_00s',
        'genres_icons', 'streaming_global', 'streaming_russian'
    ];
    assert.equal(rows.length, 23);
    assert.deepEqual(Array.from(rows.slice(0, 11), x => x.id), expected);
    assert.equal(rows.filter(x => x.enabled).length, 11);
    assert.equal(rows.filter(x => !x.enabled).length, 12);
    assert.ok(rows.slice(11).every(x => !x.enabled));
});
test('custom saved shelf order and visibility survive the update', () => {
    const custom = [
        { id: 'stream_netflix', title: 'Netflix', enabled: true },
        { id: 'nav_buttons', title: 'Навигация', enabled: false },
        { id: 'core_continue', title: 'Продолжить просмотр', enabled: true }
    ];
    const app = boot({ saved: custom });
    assert.deepEqual(Array.from(app.rows(), x => x.id), custom.map(x => x.id));
    assert.deepEqual(Array.from(app.rows(), x => x.enabled), custom.map(x => x.enabled));
});
test('legacy factory 22-enabled configuration automatically migrates to 11 active', () => {
    const legacy = [
        'nav_buttons','core_continue','streaming_russian','streaming_global',
        'genres_icons','trend_movies','trend_tv','upcoming_episodes',
        'new_movies','new_tv','rus_movies','rus_tv',
        'stream_kinopoisk','stream_premier','stream_netflix','stream_apple',
        'turkish_tv','korean_tv','genre_comedy','genre_action',
        'genre_scifi','period_00s'
    ].map(id => ({ id, enabled: true }));
    const app = boot({ saved: legacy });
    assert.equal(app.rows().filter(x => x.enabled).length, 11);
    assert.equal(app.rows()[2].id, 'new_movies');
    assert.equal(app.stored.get('surs_fixed_shelves_v2').length, 23);
    assert.equal(app.stored.get('surs_fixed_shelves_v2')[2].id, 'new_movies');
});
test('the previous 3.8.2 factory profile migrates, but customized visibility does not', () => {
    const last = [
        'nav_buttons','core_continue','new_movies','new_tv',
        'trend_movies','trend_tv','upcoming_episodes','rus_movies',
        'rus_tv','genres_icons','streaming_russian','streaming_global',
        'stream_kinopoisk','stream_premier','stream_netflix','stream_apple',
        'turkish_tv','korean_tv','genre_comedy','genre_action',
        'genre_scifi','period_00s'
    ].map((id, i) => ({id, enabled: i < 12}));
    const app = boot({saved: last});
    assert.equal(app.rows().length, 23);
    assert.equal(app.rows().filter(x => x.enabled).length, 11);
    assert.equal(app.rows()[6].id, 'period_10s');

    last[12].enabled = true;
    const customized = boot({saved: last});
    assert.equal(customized.rows().length, 22);
    assert.equal(customized.rows()[6].id, 'upcoming_episodes');
    assert.equal(customized.rows().filter(x => x.enabled).length, 13);
});
test('custom rearrangement of legacy profile is not migrated', () => {
    const legacy = [
        'nav_buttons','core_continue','streaming_russian','streaming_global',
        'genres_icons','trend_movies','trend_tv','upcoming_episodes',
        'new_movies','new_tv','rus_movies','rus_tv',
        'stream_kinopoisk','stream_premier','stream_netflix','stream_apple',
        'turkish_tv','korean_tv','genre_comedy','genre_action',
        'genre_scifi','period_00s'
    ].map(id => ({ id, enabled: true }));
    const swapped = legacy.splice(3,1)[0];
    legacy.splice(2,0,swapped);
    const app = boot({ saved: legacy });
    assert.equal(app.rows()[2].id, 'streaming_global');
    assert.equal(app.rows().filter(x => x.enabled).length, 22);
});
test('reset immediately persists factory defaults and schedules screen refresh', () => {
    const app = boot({ saved: [
        { id: 'stream_netflix', enabled: true },
        { id: 'genre_action', enabled: true }
    ]});
    assert.equal(app.window.LampaShelfManager.version, '3.8.6');
    const defaults = app.window.LampaShelfManager.resetDefaults();
    assert.equal(defaults.length, 23);
    assert.equal(defaults.filter(x => x.enabled).length, 11);
    assert.equal(app.stored.get('surs_fixed_shelves_v2').length, 23);
    assert.equal(app.rows()[2].id, 'new_movies');
    const refresh = app.timers.find(t => t.ms === 80);
    assert.ok(refresh);
    refresh.fn();
    assert.equal(app.navigations[0].source, 'SURS');
});
test('continue watching cards load Release module and use first_air_date for TV', () => {
    const app = boot({ saved: [{ id: 'core_continue', enabled: true }] });
    const tv = { id: 10, title: 'Сериал', first_air_date: '2022-09-08' };
    const film = { id: 11, title: 'Фильм', release_date: '2023-05-20' };
    app.Lampa.Favorite.continues = type => type === 'tv' ? [tv] : [film];
    const rows = app.getMain();
    assert.equal(rows.length, 1);
    const cards = rows[0].results;
    assert.equal(cards.length, 2);
    assert.equal(cards[0].release_date, '2022-09-08');
    assert.deepEqual(Array.from(cards[0].params.createInstance(cards[0])), ['Card','Release','Callback']);
    assert.deepEqual(Array.from(cards[1].params.createInstance(cards[1])), ['Card','Release','Callback']);
});
test('default shelves are retained', () => {
    const app = boot();
    assert.ok(app.rows().length >= 20);
    assert.equal(app.Lampa.Api.sources.SURS !== undefined, true);
});
test('empty saved list retains navigation entry', () => {
    const app = boot({ saved: [] });
    assert.equal(app.rows().length, 1);
    assert.equal(app.rows()[0].id, 'nav_buttons');
});
test('disabled shelves are not discarded', () => {
    const saved = [
        { id: 'core_continue', enabled: false },
        { id: 'trend_movies', enabled: false }
    ];
    const app = boot({ saved });
    assert.equal(app.rows().length, 2);
    assert.equal(app.getMain()[0].title, 'Быстрый переход');
});
test('duplicate IDs and stale anonymous disabled rows are removed in view', () => {
    const app = boot({ saved: [
        { id: 'core_continue', enabled: true },
        { id: 'core_continue', enabled: false },
        { id: 'ext_row_abc123', enabled: false, title: 'Сторонняя полка' }
    ]});
    assert.equal(app.rows().length, 1);
});
test('anonymous ContentRows are not registered', () => {
    const app = boot();
    app.Lampa.ContentRows.add({ call: () => () => {} });
    assert.equal(app.window.LampaShelfManager.getAllShelves().some(x => x.id.startsWith('ext_row_')), false);
});
test('named rows have stable IDs', () => {
    const app = boot();
    const row = { name: 'example', title: 'Example', call: () => () => {} };
    app.Lampa.ContentRows.add(row);
    app.Lampa.ContentRows.add(row);
    assert.equal(app.window.LampaShelfManager.getAllShelves().filter(x => x.id === 'ext_example').length, 1);
});
test('ContentRows arrays of callbacks are flattened as cards', () => {
    const app = boot({ saved: [{ id: 'ext_example', title: 'Example', enabled: true, cat: 'plugin' }] });
    app.Lampa.ContentRows.add({
        name: 'example', title: 'Example',
        call: () => [
            cb => cb({ title: 'Example', results: [{ id: 1, title: 'A' }] }),
            cb => cb({ results: [{ id: 2, title: 'B' }] })
        ]
    });
    const data = app.getMain();
    assert.equal(data.length, 1);
    assert.equal(data[0].results.length, 2);
    assert.deepEqual(Array.from(data[0].results, x => x.id), [1,2]);
});
test('named plugin is not duplicated during discovery', () => {
    const app = boot();
    app.Lampa.ContentRows.add({ name: 'shots_main', title: 'Shots', call: () => null });
    const before = app.window.LampaShelfManager.getAllShelves().length;
    app.window.LampaShelfManager.rescan(false);
    assert.equal(app.window.LampaShelfManager.getAllShelves().length, before);
    assert.equal(app.contentRowsCalls(), 0);
});
test('Trakt cards use correct TMDB IDs', () => {
    const app = boot({ saved: [{ id: 'ext_TraktWatchlistRow', title: 'Trakt', enabled: true, cat: 'plugin' }] });
    app.Lampa.ContentRows.add({
        name: 'TraktWatchlistRow', title: 'Trakt Watchlist',
        call: () => cb => cb({ results: [{ movie: { title: 'Film', ids: { tmdb: 135, trakt: 12 }, year: 2024 } }] })
    });
    const data = app.getMain();
    assert.equal(data[0].results[0].id, 135);
    assert.equal(data[0].results[0].release_year, '2024');
});
test('early load retries without setting ready flag', () => {
    const app = boot({ ready: false });
    assert.equal(!!app.window.plugin_surs_fixed_ready, false);
    assert.ok(app.timers.some(x => x.ms === 1000));
    app.Lampa.Api.sources.tmdb = { get: (url, params, cb) => cb({ results: [] }) };
    app.timers.find(x => x.ms === 1000).fn();
    assert.equal(app.window.plugin_surs_fixed_ready, true);
});
test('small-screen, coarse-pointer and reduced-motion rules exist', () => {
    assert.match(source, /@media \(max-width: 680px\)/);
    assert.match(source, /@media \(pointer: coarse\)/);
    assert.match(source, /prefers-reduced-motion: reduce/);
    assert.match(source, /data-action="cancel"/);
    assert.match(source, /data-action="search"/);
});
test('navigation row carries a responsive line hook and exactly seven entries', () => {
    const app = boot({ saved: [{id:'nav_buttons',enabled:true}] });
    const result = app.getMain();
    assert.equal(result.length, 1);
    const row = result[0];
    assert.equal(row.results.length, 7);
    assert.equal(row.params.items.mapping, 'line');
    assert.equal(row.params.items.view, 7);
    assert.equal(row.params.items.align_left, true);
    assert.ok(typeof row.params.emit.onCreate === 'function');
});
test('TV keeps one horizontal DPAD-friendly line even if a coarse pointer is reported', () => {
    const app = boot({ saved: [{id:'nav_buttons',enabled:true}], tv: true, coarse: true });
    const row = app.getMain()[0];
    const classes = [];
    row.params.emit.onCreate.call({html:{addClass:name => classes.push(name)}});
    assert.deepEqual(classes,['surs-nav-line']);
});
test('iPhone/iPad use single-row navigation without altering regular content rows', () => {
    const app = boot({ saved: [{id:'nav_buttons',enabled:true}], coarse: true });
    const row = app.getMain()[0];
    const classes = [];
    row.params.emit.onCreate.call({html:{addClass:name => classes.push(name)}});
    assert.deepEqual(classes,['surs-nav-line','surs-nav-line--touch']);
    const desktop = boot({ saved: [{id:'nav_buttons',enabled:true}] });
    const unchanged = [];
    desktop.getMain()[0].params.emit.onCreate.call({html:{addClass:name => unchanged.push(name)}});
    assert.deepEqual(unchanged,['surs-nav-line']);
    assert.match(source,/\.surs-nav-line--touch \.scroll__body\.mapping--line\s*\{\s*grid-template-columns: repeat\(var\(--surs-nav-count, 7\), minmax\(0, 1fr\)\) !important/);
    assert.doesNotMatch(source,/\.surs-nav-line--touch \.scroll__body\.mapping--line\s*\{\s*grid-template-columns: repeat\([34],/);
});
test('iPad pointer fallback identifies touch input via maxTouchPoints', () => {
    const app = boot({ saved: [{id:'nav_buttons',enabled:true}], coarse:false, touchPoints:5 });
    const classes=[];
    app.getMain()[0].params.emit.onCreate.call({html:{addClass:name=>classes.push(name)}});
    assert.equal(classes.includes('surs-nav-line--touch'),true);
});
test('navigation CSS remains isolated and hides film badges on quick buttons', () => {
    assert.match(source,/\.surs-nav-line \.scroll__body\.mapping--line\s*\{\s*display: grid !important/);
    assert.match(source,/\.surs-nav-line \.card__type,/);
    assert.match(source,/\.surs-nav-line \.card__quality,/);
    assert.match(source,/\.surs-nav-line \.card--button-compact\s*\{/);
    assert.doesNotMatch(source,/\.items-line\s*\{\s*display:\s*grid/);
});
test('mobile navigation has short labels and accessible full names', () => {
    const labels = ['Главная', 'Мир', 'Россия', 'Полки', 'Избр.', 'История', 'Настр.'];
    const block = source.slice(source.indexOf('var mobileLabels = {'),source.indexOf('var results = baseButtons.map('));
    labels.forEach(label => assert.ok(block.includes("'" + label + "'")));
    assert.match(source, /\$h\.attr\('aria-label', b\.title\)/);
    assert.match(source, /\$h\.attr\('title', b\.title\)/);
    assert.match(source, /card__button-label--mobile/);
});
test('very narrow phones keep icon-only seven-column layout', () => {
    assert.match(source, /@media screen and \(max-width: 350px\)/);
    assert.match(source, /\.surs-nav-line--touch \.card__button-label--mobile\s*\{\s*display: none !important/);
    assert.match(source,/grid-template-columns: repeat\(var\(--surs-nav-count, 7\), minmax\(0, 1fr\)\) !important/);
});
test('compact rules apply only to navigation cards', () => {
    assert.match(source, /\.surs-nav-line--touch \.card--button-compact \{/);
    assert.match(source, /\.surs-nav-line--touch \.card__button-icon \{/);
    assert.doesNotMatch(source, /\n\s*\.card--button-compact\s*\{[^}]*height:\s*4\.5em/);
});
test('seven independent visibility triggers exist in SURS settings', () => {
    const app = boot();
    const triggers = app.settings.filter(item => item.param.type === 'trigger' &&
        item.param.name.startsWith('surs_nav_visible_'));
    const expected = ['surs_main', 'surs_new', 'surs_rus', 'surs_shelf_manager',
        'surs_bookmarks', 'surs_history', 'surs_settings'];
    assert.deepEqual(triggers.map(x => x.param.name),
        expected.map(id => 'surs_nav_visible_' + id));
    assert.ok(triggers.every(x => x.param.default === true && x.component === 'surs'));
    assert.ok(triggers.every(x => typeof x.onChange === 'function'));
    assert.ok(app.settings.some(x => x.param.name === 'surs_nav_refresh'));
});
test('hide Home and Settings: five icons remain, order and widths update', () => {
    const app = boot({saved:[{id:'nav_buttons',enabled:true}],coarse:true});
    app.stored.set('surs_nav_visible_surs_main',false);
    app.stored.set('surs_nav_visible_surs_settings',false);
    const rows = app.getMain();
    assert.equal(rows.length,1);
    const bar=rows[0];
    assert.equal(bar.results.length,5);
    assert.deepEqual(Array.from(bar.results,x=>x.title),[
        'Новинки Мир','Новинки Россия','Порядок полок','Закладки','История'
    ]);
    assert.equal(bar.params.items.view,5);
    const html = { addClass: () => {} };
    bar.params.emit.onCreate.call({html});
    assert.equal(html.styles['--surs-nav-count'],'5');
    assert.equal(html.attrs['data-surs-nav-count'],'5');
});
test('single remaining button is correctly count-limited and centered', () => {
    const app = boot({saved:[{id:'nav_buttons',enabled:true}],coarse:true});
    const all = ['surs_main','surs_new','surs_rus','surs_shelf_manager',
        'surs_bookmarks','surs_history','surs_settings'];
    all.forEach(id=>app.stored.set('surs_nav_visible_'+id,id==='surs_bookmarks'));
    const bar=app.getMain()[0];
    assert.equal(bar.results.length,1);
    assert.equal(bar.results[0].title,'Закладки');
    assert.equal(bar.params.items.view,1);
    assert.match(source,/\.surs-nav-line\[data-surs-nav-count="1"\] \.scroll__body\.mapping--line \{ max-width: 10em !important/);
});
test('hiding all nav buttons omits empty row; restored icon works', () => {
    const app = boot({saved:[{id:'nav_buttons',enabled:true},{id:'new_movies',enabled:true}]});
    const names=['surs_main','surs_new','surs_rus','surs_shelf_manager',
        'surs_bookmarks','surs_history','surs_settings'];
    names.forEach(id=>app.stored.set('surs_nav_visible_'+id,false));
    const hidden=app.getMain();
    assert.ok(hidden.every(x=>x.title!=='Быстрый переход'));
    app.stored.set('surs_nav_visible_surs_settings',true);
    const restored=app.getMain();
    assert.ok(restored.some(x=>x.title==='Быстрый переход'));
    assert.equal(restored.find(x=>x.title==='Быстрый переход').results.length,1);
});
test('navigation preferences are independent from factory shelf reset', () => {
    const app=boot({saved:[{id:'nav_buttons',enabled:true}]});
    app.stored.set('surs_nav_visible_surs_settings',false);
    app.window.LampaShelfManager.resetDefaults();
    assert.equal(app.stored.get('surs_nav_visible_surs_settings'),false);
    assert.equal(app.window.LampaShelfManager.getSavedShelves().length,23);
});
test('apply button refreshes home while individual toggles leave settings open', () => {
    const app=boot();
    const option=app.settings.find(x=>x.param.name==='surs_nav_visible_surs_main');
    option.onChange(false);
    assert.equal(app.navigations.length,0);
    const apply=app.settings.find(x=>x.param.name==='surs_nav_refresh');
    apply.onChange();
    const refresh=app.timers.find(x=>x.ms===80);
    assert.ok(refresh);
    refresh.fn();
    assert.equal(app.navigations[0].source,'SURS');
});
test('dynamic CSS columns and scoped fallback widths work across viewports', () => {
    assert.match(source,/grid-template-columns: repeat\(var\(--surs-nav-count, 7\), minmax\(0, 1fr\)\)/);
    for(let n=1;n<=6;n++){
        assert.ok(source.includes('.surs-nav-line[data-surs-nav-count="'+n+'"]'));
    }
    assert.doesNotMatch(source,/\.items-line\s*\{\s*grid-template-columns:/);
});
test('native main menu handlers are preserved', () => {
    assert.doesNotMatch(source, /mainButton\.off\('hover:enter click'\)/);
});
console.log('\nSURS smoke tests: ' + passed + ' passed.');
