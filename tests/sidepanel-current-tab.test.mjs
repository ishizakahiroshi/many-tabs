import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../sidepanel.js');

function setupPanel(lang) {
  const events = new Map();
  const event = (key) => ({ addListener: (fn) => events.set(key, fn) });
  const timers = [];
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attributes = {};
      this.listeners = {};
      this.dataset = {};
      this.style = { setProperty() {} };
      this.value = '';
      this.hidden = true;
    }
    append(...nodes) { this.children.push(...nodes.flatMap(n => n.tag === 'fragment' ? n.children : [n])); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    querySelector(selector) {
      return this.children.find(child => selector.split('.').filter(Boolean)
        .every(cls => child.className?.split(' ').includes(cls))) ?? null;
    }
    scrollIntoView() {}
  }

  const ids = new Map();
  const document = {
    documentElement: new Element('html'),
    querySelectorAll: () => [],
    createElement: tag => new Element(tag),
    createDocumentFragment: () => new Element('fragment'),
    getElementById(id) {
      if (!ids.has(id)) ids.set(id, new Element('div'));
      return ids.get(id);
    },
    addEventListener() {}
  };
  const catalog = JSON.parse(read(`../_locales/${lang}/messages.json`));
  let activeId = 1;
  const template = [
    { id: 1, title: 'alpha', pinned: true, groupId: -1 },
    { id: 2, title: 'bravo', groupId: 22 },
    { id: 3, title: 'charlie', groupId: 22 },
  ];
  const updates = [];
  const chrome = {
    i18n: {
      getUILanguage: () => lang,
      getMessage: (key, subs) => catalog[key]?.message.replace(/\$TITLE\$/g, subs[0]),
    },
    windows: { getCurrent: async () => ({ id: 7 }) },
    runtime: {
      sendMessage() {},
      getManifest: () => ({ version: 'synthetic' }),
      onMessage: event('message'),
    },
    tabs: {
      query: async () => template.map((tab, index) => ({ ...tab, index, active: tab.id === activeId })),
      update: async (id, changes) => {
        updates.push([id, { ...changes }]);
        activeId = id;
        events.get('onActivated')({ windowId: 7 });
      },
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      query: async () => [{ id: 22, collapsed: false, title: 'group' }],
    },
  };
  for (const name of ['onCreated', 'onUpdated', 'onRemoved', 'onMoved']) {
    chrome.tabGroups[name] = event(`group:${name}`);
  }
  for (const name of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onAttached', 'onDetached', 'onActivated', 'onReplaced']) {
    chrome.tabs[name] = event(name);
  }
  const sandbox = {
    document,
    window: { addEventListener() {} },
    chrome,
    setTimeout: fn => timers.push(fn),
    clearTimeout() {},
  };
  for (const code of ['ja', 'en']) {
    runInNewContext(read(`../i18n/${code}.js`), sandbox);
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.MANY_TABS_MSGS[code])),
      JSON.parse(read(`../_locales/${code}/messages.json`)));
  }
  runInNewContext(source, sandbox, { filename: 'sidepanel.js' });

  // Let the real promise chain settle, then dispatch queued synthetic render
  // timers. No wall-clock sleeps or Chrome objects outside the mock.
  const flush = async () => {
    do {
      await new Promise(resolve => setImmediate(resolve));
      if (!timers.length) return;
      timers.splice(0).forEach(fn => fn());
    } while (true);
  };
  const rows = () => ids.get('tabList').children.filter(row => row.dataset.tabId);
  return { events, ids, updates, flush, rows };
}

for (const [lang, description, otherLang, otherDescription, label] of [
  ['en', 'Current tab', 'ja', '現在のタブ', 'Switch to tab: bravo'],
  ['ja', '現在のタブ', 'en', 'Current tab', 'タブに切り替え: bravo'],
]) {
  test(`only the current side-panel button describes the state (${lang})`, async () => {
    const panel = setupPanel(lang);
    const buttons = () => panel.rows().map(row => row.children[0]);
    const descriptions = () => buttons().map(button => button.attributes['aria-description']);
    await panel.flush();
    assert.deepEqual(descriptions(), [description, undefined, undefined]);
    assert.equal(buttons()[1].tag, 'button');
    assert.equal(buttons()[1].type, 'button');
    assert.equal(buttons()[1].attributes['aria-label'], label);

    buttons()[1].listeners.click();
    await panel.flush();
    assert.deepEqual(panel.updates, [[2, { active: true }]]);
    assert.deepEqual(descriptions(), [undefined, description, undefined]);
    assert.equal(buttons()[1].attributes['aria-label'], label);

    panel.events.get('message')({ type: 'rail-pref', lang: otherLang });
    assert.deepEqual(descriptions(), [undefined, otherDescription, undefined]);

    const search = panel.ids.get('tabSearch');
    search.value = 'alpha';
    search.listeners.input();
    assert.deepEqual(panel.rows().map(row => row.dataset.tabId), ['1']);
    assert.deepEqual(descriptions(), [undefined]);
  });
}
