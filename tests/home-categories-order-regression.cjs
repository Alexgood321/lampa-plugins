'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../home_categories.js'), 'utf8');
function segment(start, stop) {
  const i = source.indexOf(start);
  const j = source.indexOf(stop, i);
  assert.ok(i >= 0 && j > i, 'audit function must be present');
  return source.slice(i, j);
}
const extracted = segment('    function updateDOM() {', '    /**\n     * Синхронизация пульта') +
  segment('    var controllerItemsState', '    /**\n     * Интерактивный модальный');

function makeRow(title) {
  const attrs = {};
  return {
    title, parentNode: null,
    style: {display: '', setProperty(prop, value) { this[prop] = value; }},
    querySelector() {return {textContent: title};},
    getAttribute(name) {return attrs[name] || null;},
    setAttribute(name, value) {attrs[name] = value;},
    removeAttribute(name) {delete attrs[name];}
  };
}
let writes = 0;
function makeParent(rows) {
  const parent = {
    children: rows.slice(),
    insertBefore(node, ref) {
      assert.equal(node.parentNode, this, 'must never steal another parent\'s row');
      const from = this.children.indexOf(node);
      assert.ok(from >= 0);
      this.children.splice(from, 1);
      const before = this.children.indexOf(ref);
      assert.ok(before >= 0);
      this.children.splice(before, 0, node);
      writes++;
    }
  };
  rows.forEach(row => {row.parentNode = parent;});
  return parent;
}
const first = makeParent([makeRow('a'), makeRow('b')]);
const second = makeParent([makeRow('b'), makeRow('a')]);
const hidden = new Set();
const observer = { disconnected: 0, observed: 0,
  disconnect() {this.disconnected++;},
  observe() {this.observed++;}
};
let component = {items: []};
const context = {
  document: {body: {}, querySelectorAll() {return first.children.concat(second.children);}},
  HC_PERF: {scans: 0, total_ms: 0, max_ms: 0},
  domObserver: observer,
  getSavedOrder() {return ['b', 'a'];},
  identifyCategory(item) {return item.title || item.cat;},
  isCategoryHidden(cat) {return hidden.has(cat);},
  getCategoryRank(cat) {return cat === 'b' ? 0 : 1;},
  Lampa: {Activity: {active() {return {activity: component};}}},
  console, Date, WeakMap
};
vm.createContext(context);
vm.runInContext(extracted + '\nthis.updateDOM = updateDOM; this.syncControllerItems = syncControllerItems;', context);
context.updateDOM();
assert.deepEqual(first.children.map(row => row.title), ['b','a']);
assert.deepEqual(second.children.map(row => row.title), ['b','a']);
assert.equal(writes, 1, 'only the misplaced row should move');
context.updateDOM();
assert.equal(writes, 1, 'already sorted rows must not be moved again');
assert.equal(observer.observed, 2);
assert.equal(observer.disconnected, 2);
const a = {cat: 'a'}, b = {cat: 'b'};
component = {items: [a, b], active: 0};
hidden.add('b');
context.syncControllerItems();
assert.equal(component.items.length, 1);
assert.equal(component.items[0], a);
hidden.clear();
context.syncControllerItems();
assert.equal(component.items.length, 2);
assert.equal(component.items[0], b);
assert.equal(component.items[1], a);
console.log('PASS Home Categories: per-parent stable order, idempotence, observer isolation, D-pad restore');
