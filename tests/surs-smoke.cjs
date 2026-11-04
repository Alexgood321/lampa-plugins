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
function boot({ ready = true, saved = null } = {}) {
    const stored = new Map();
    if (saved !== null) stored.set('surs_fixed_shelves_v2', saved);
    const timers = [];
    const warnings = [];
    let contentRowsCalls = 0;
    const added = [];
    const window = { appready: true };
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
            set: (key, value) => stored.set(key, value)
        },
        Activity: { active: () => true },
        Listener: { follow: () => {} },
        Noty: { show: () => {} },
        Favorite: { continues: () => [] }
    };
    const $ = () => ({ length: 1, append: () => {} });
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
    return { stored, timers, warnings, window, Lampa, added, rows, getMain,
        contentRowsCalls: () => contentRowsCalls };
}

test('plugin syntax and version', () => {
    assert.match(source, /Версия: 3\.8\.0/);
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
    assert.deepEqual(data[0].results.map(x => x.id), [1,2]);
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
test('native main menu handlers are preserved', () => {
    assert.doesNotMatch(source, /mainButton\.off\('hover:enter click'\)/);
});
console.log('\nSURS smoke tests: ' + passed + ' passed.');
