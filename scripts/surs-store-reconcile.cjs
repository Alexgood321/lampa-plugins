#!/usr/bin/env node
'use strict';

// Keep the SURS entry discoverable even when the central store's scheduled
// GitHub Actions have stopped. Never attest freshness without verifying ALL
// first-party plugin commit pins against their upstream main branches.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STORE_REPO = 'Alexgood321/store';
const STORE_PATH = 'live_catalog.json';
const SURS_NAME = 'SURS Pro';
const SURS_REPO = 'Alexgood321/lampa-plugins';
const SURS_PATH = 'surs.js';
const SHA = /^[a-f0-9]{40}$/;
const allowedRepos = new Set([
  'Alexgood321/lampa-plugins',
  'Alexgood321/lampa-hdrezka',
  'Alexgood321/lampa-sync-pro'
]);

function pluginVersion(source) {
  const match = source.slice(0, 3000).match(/\* Версия: (\d+\.\d+\.\d+)\b/);
  if (!match) throw new Error('SURS version header is missing');
  return match[1];
}

function isNewer(candidate, previous) {
  const a = candidate.split('.').map(Number);
  const b = previous.split('.').map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some(x => !Number.isSafeInteger(x)) ||
      b.some(x => !Number.isSafeInteger(x))) throw new Error('Invalid plugin version');
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function getOwnedEntries(catalog) {
  if (!catalog || !catalog.meta || !catalog.meta.tracked ||
      !Array.isArray(catalog.results)) throw new Error('Invalid My Store catalog');
  const entries = Object.entries(catalog.meta.tracked)
    .filter(([, info]) => info.owned);
  if (entries.length < 8 || !entries.some(([name]) => name === SURS_NAME)) {
    throw new Error('Not all first-party plugins are registered');
  }
  for (const [name, info] of entries) {
    if (!allowedRepos.has(info.repo) || !/^[\w./-]+\.js$/.test(info.path) ||
        info.path.includes('..') || !SHA.test(String(info.sha || ''))) {
      throw new Error('Invalid first-party source for ' + name);
    }
  }
  return entries;
}

function updateCatalog(catalog, observed, version, now) {
  const entries = getOwnedEntries(catalog);
  for (const [name, info] of entries) {
    const actual = observed[name];
    if (!actual || !SHA.test(String(actual.sha || ''))) {
      throw new Error('Unverified first-party plugin: ' + name);
    }
    if (name !== SURS_NAME && info.sha !== actual.sha) {
      throw new Error('Central catalog is behind upstream source: ' + name);
    }
  }
  const surs = catalog.meta.tracked[SURS_NAME];
  if (surs.repo !== SURS_REPO || surs.path !== SURS_PATH) {
    throw new Error('SURS source does not match the approved repository');
  }
  const current = observed[SURS_NAME];
  const changedPlugin = surs.sha !== current.sha;
  if (changedPlugin && !isNewer(version, surs.version)) {
    throw new Error('Refusing to overwrite SURS with a non-incremented version');
  }
  if (!changedPlugin && surs.version !== version) {
    throw new Error('SURS version differs from the pinned commit');
  }
  const staleMs = Date.parse(now) - Date.parse(catalog.meta.last_checked_at || '');
  const needsHeartbeat = !Number.isFinite(staleMs) || staleMs > 45 * 60 * 1000;
  if (!changedPlugin && !needsHeartbeat) return false;
  if (changedPlugin) {
    const url = 'https://cdn.jsdelivr.net/gh/' + SURS_REPO + '@' + current.sha + '/' + SURS_PATH;
    const published = current.published_at || now;
    Object.assign(surs, {sha: current.sha, version, link: url, published_at: published});
    let cards = 0;
    for (const group of catalog.results) {
      for (const card of group.results || []) {
        if (card.name !== SURS_NAME) continue;
        card.version = version;
        card.link = url;
        cards++;
      }
    }
    if (cards !== 2) throw new Error('Expected two SURS cards in My Store');
    const history = catalog.meta.history || (catalog.meta.history = {});
    history[SURS_NAME] = [...(history[SURS_NAME] || [])
      .filter(entry => entry.sha !== current.sha),
      {sha: current.sha, version, published_at: published}].slice(-12);
  }
  catalog.meta.last_checked_at = now;
  return true;
}

async function request(endpoint, token, options = {}) {
  const response = await fetch('https://api.github.com' + endpoint, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SURS-Store-Reconciler/1.0',
      'Cache-Control': 'no-cache',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(25000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error('GitHub ' + endpoint.split('?')[0] + ': HTTP ' + response.status);
  return text ? JSON.parse(text) : {};
}

async function latestSource(repo, file, token) {
  const commits = await request('/repos/' + repo + '/commits?sha=main&path=' +
    encodeURIComponent(file) + '&per_page=1', token);
  if (!Array.isArray(commits) || !commits.length || !SHA.test(String(commits[0].sha))) {
    throw new Error('No valid source commit for ' + repo + '/' + file);
  }
  return {
    sha: commits[0].sha,
    published_at: commits[0].commit?.committer?.date || ''
  };
}

async function reconcile(token) {
  if (!token) throw new Error('STORE_DISPATCH_TOKEN is missing');
  const release = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/surs-hot-release.json'), 'utf8'));
  const version = pluginVersion(fs.readFileSync(path.join(ROOT, 'surs.js'), 'utf8'));
  if (version !== release.version) throw new Error('SURS release manifest/version mismatch');
  const apiPath = '/repos/' + STORE_REPO + '/contents/' + STORE_PATH;
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await request(apiPath + '?ref=main', token);
    if (!SHA.test(String(file.sha)) || file.encoding !== 'base64') {
      throw new Error('Invalid My Store file response');
    }
    const catalog = JSON.parse(Buffer.from(file.content.replace(/\s+/g, ''), 'base64').toString('utf8'));
    const entries = getOwnedEntries(catalog);
    const observedPairs = await Promise.all(entries.map(async ([name, info]) =>
      [name, await latestSource(info.repo, info.path, token)]));
    const observed = Object.fromEntries(observedPairs);
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (!updateCatalog(catalog, observed, version, now)) {
      console.log('My Store is already verified and up to date: SURS ' + version);
      return;
    }
    try {
      await request(apiPath, token, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: 'chore(store): verify first-party pins and synchronize SURS Pro ' + version,
          branch: 'main',
          sha: file.sha,
          content: Buffer.from(JSON.stringify(catalog, null, 2) + '\n', 'utf8').toString('base64')
        })
      });
      console.log('Verified all ' + entries.length + ' first-party pins; My Store SURS ' + version + ' synchronized');
      return;
    } catch (error) {
      if (attempt === 2 || !/HTTP (409|422)$/.test(String(error.message))) throw error;
    }
  }
}

if (require.main === module) {
  reconcile(process.env.STORE_DISPATCH_TOKEN).catch(error => {
    console.error('SURS My Store reconciliation failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {pluginVersion, isNewer, getOwnedEntries, updateCatalog};
