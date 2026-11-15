#!/usr/bin/env node
'use strict';

// Release SURS only when the Hot Discovery implementation changes.
// Periodic refreshes of data/hot-discovery.json do not create plugin updates.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'data/surs-hot-release.json');
const sourcePath = path.join(root, 'build/surs.source.txt');
const pluginPath = path.join(root, 'surs.js');
const hotFeedPath = path.join(root, 'data/hot-discovery.json');
const trackedSources = [
  'scripts/hot-discovery.cjs',
  'scripts/kp-demand-history.cjs',
  'scripts/hot-ranking-4-7.cjs',
  'scripts/hot-source-budget.cjs',
  'scripts/hot-feed-integrity.cjs',
  'scripts/hot-evidence-gate.cjs',
  'scripts/hot-editorial-interest.cjs',
  'scripts/hot-recommendation-5-0.cjs'
];

function fingerprint(directory = root) {
  const hash = crypto.createHash('sha256');
  for (const filename of trackedSources) {
    hash.update(filename);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(directory, filename)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function replaceOnce(source, expression, replacement, label) {
  const matches = source.match(new RegExp(expression.source, expression.flags + (expression.global ? '' : 'g')));
  if (!matches || matches.length !== 1) {
    throw new Error('Unexpected SURS source structure at ' + label + ': ' + (matches ? matches.length : 0));
  }
  return source.replace(expression, replacement);
}

function readVersion(source) {
  const header = source.match(/\* Версия: (\d+)\.(\d+)\.(\d+) \(Hot Discovery [\d.]+ fresh data on upgrade\)/);
  if (!header) throw new Error('Cannot parse SURS version header');
  return {version: header.slice(1, 4).join('.'), parts: header.slice(1, 4).map(Number)};
}

function bumpSource(source, algorithm) {
  if (!/^hot-discovery-\d+\.\d+$/.test(algorithm)) throw new Error('Invalid Hot Discovery algorithm');
  const oldVersion = readVersion(source);
  const nextVersion = [oldVersion.parts[0], oldVersion.parts[1], oldVersion.parts[2] + 1].join('.');
  const hotLabel = algorithm.replace('hot-discovery-', '');
  const cacheMatch = source.match(/HOT_CACHE_KEY='surs_hot_json_v(\d+)'/);
  if (!cacheMatch) throw new Error('Cannot parse Hot Discovery cache key');
  const previousCache = Number(cacheMatch[1]);
  if (!Number.isSafeInteger(previousCache) || previousCache < 1 || previousCache > 10000) {
    throw new Error('Invalid Hot Discovery cache key');
  }
  let released = replaceOnce(source,
    /\* Версия: \d+\.\d+\.\d+ \(Hot Discovery [\d.]+ fresh data on upgrade\)/,
    '* Версия: ' + nextVersion + ' (Hot Discovery ' + hotLabel + ' fresh data on upgrade)',
    'version header');
  released = replaceOnce(released,
    /console\.log\('SURS Pro v[\d.]+ \(Hot Discovery [\d.]+\) успешно инициализирован\.'\);/,
    "console.log('SURS Pro v" + nextVersion + ' (Hot Discovery ' + hotLabel + ") успешно инициализирован.');",
    'boot message');
  released = replaceOnce(released,
    /version: '\d+\.\d+\.\d+'(?=\s*\n\s*\};)/,
    "version: '" + nextVersion + "'",
    'runtime version');
  released = replaceOnce(released,
    /surs-editor\.js\?v=\d+\.\d+\.\d+/,
    'surs-editor.js?v=' + nextVersion,
    'editor fallback URL');
  released = released.replace(/surs_hot_json_v(\d+)/g,
    (_, cacheVersion) => 'surs_hot_json_v' + (Number(cacheVersion) + 1));
  if (!released.includes("HOT_CACHE_KEY='surs_hot_json_v" + (previousCache + 1) + "'")) {
    throw new Error('Hot Discovery cache rotation failed');
  }
  released = released.replace(/Invalidate only the Hot Discovery data cache on the [\d.]+ upgrade\./,
    'Invalidate only the Hot Discovery data cache on algorithm upgrades.');
  return {source: released, version: nextVersion, cacheVersion: previousCache + 1};
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const currentFingerprint = fingerprint();
  const feed = JSON.parse(fs.readFileSync(hotFeedPath, 'utf8'));
  const currentSource = fs.readFileSync(sourcePath, 'utf8');
  const oldManifest = fs.existsSync(manifestPath) ?
    JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  const currentVersion = readVersion(currentSource).version;
  if (oldManifest && oldManifest.version !== currentVersion) {
    throw new Error('SURS version drift: manifest ' + oldManifest.version + ', source ' + currentVersion);
  }
  if (oldManifest && oldManifest.source_sha256 === currentFingerprint) {
    if (oldManifest.algorithm !== feed.algorithm) {
      throw new Error('Algorithm changed without source changes: check feed provenance');
    }
    const existingPlugin = fs.readFileSync(pluginPath, 'utf8');
    if (!existingPlugin.includes('version: \'' + currentVersion + '\'')) {
      throw new Error('SURS compiled plugin version differs from source');
    }
    console.log('SURS Hot release already current: ' + currentVersion + ', ' + feed.algorithm);
    return;
  }
  if (checkOnly) {
    throw new Error('SURS Hot release is pending for changed algorithm implementation');
  }
  const release = bumpSource(currentSource, feed.algorithm);
  fs.writeFileSync(sourcePath, release.source);
  const build = spawnSync(process.execPath, [path.join(root, 'scripts/build-surs.cjs')], {
    cwd: root, encoding: 'utf8'
  });
  if (build.status !== 0) {
    throw new Error('SURS build failed: ' + (build.stderr || build.stdout));
  }
  const manifest = {
    schema: 1,
    version: release.version,
    algorithm: feed.algorithm,
    cache_version: release.cacheVersion,
    source_sha256: currentFingerprint
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('SURS Hot ' + release.version + ' released for ' + feed.algorithm +
    ' (cache v' + release.cacheVersion + ')');
}

if (require.main === module) main();
module.exports = {fingerprint, readVersion, bumpSource, trackedSources};
