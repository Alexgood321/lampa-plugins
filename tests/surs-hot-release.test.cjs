'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  fingerprint, readVersion, bumpSource
} = require('../scripts/auto-release-surs-hot.cjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'build/surs.source.txt'), 'utf8');

test('Hot release keeps a stable code fingerprint across feed refreshes', () => {
  const first = fingerprint();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, fingerprint());
});

test('Hot release bumps patch, boot message, editor URL and cache only', () => {
  const previous = readVersion(source).version;
  const result = bumpSource(source, 'hot-discovery-4.16');
  const expected = previous.replace(/\d+$/, x => String(Number(x) + 1));
  assert.equal(result.version, expected);
  assert.equal(readVersion(result.source).version, expected);
  assert.match(result.source, /Hot Discovery 4\.16 fresh data on upgrade/);
  assert.ok(result.source.includes('console.log(\'SURS Pro v' + expected +
    ' (Hot Discovery 4.16) успешно инициализирован.\');'));
  assert.ok(result.source.includes("version: '" + expected + "'"));
  assert.ok(result.source.includes('surs-editor.js?v=' + expected));
  assert.match(result.source, new RegExp("HOT_CACHE_KEY='surs_hot_json_v" + result.cacheVersion + "'"));
  assert.match(result.source, new RegExp("HOT_OLD_CACHE_KEY='surs_hot_json_v" + (result.cacheVersion - 1) + "'"));
  assert.doesNotMatch(result.source, /Lampa\.Storage\.clear/);
});

test('Hot release rejects an invalid algorithm marker', () => {
  assert.throws(() => bumpSource(source, 'hot-discovery-main'), /Invalid Hot Discovery algorithm/);
});
