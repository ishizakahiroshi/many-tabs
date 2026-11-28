'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel.js'), 'utf8');

// Run the panel's real script using synthetic DOM and Chrome tabs.
async function panel() {
  class Element {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.handlers = {};
      this.dataset = {};
      this.style = {};
      this.value = '';
    }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    emit(name, event = {}) { this.handlers[name]?.(event); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) {
      if (this.children.some(child => child.contains(document.activeElement))) document.activeElement = document.body;
      this.children = children.flatMap(child => child.tagName === '#fragment' ? child.children : [child]);
    }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    querySelector(selector) { return selector === 'button' ? this.children.find(child => child.tagName === 'button') : null; }
    getBoundingClientRect() { return { width: 0, height: 0, left: 0, right: 0, bottom: 0 }; }
    setAttribute() {}
    focus() { document.activeElement = this; }
    blur() { if (document.activeElement === this) document.activeElement = document.body; }
  }
  class Input extends Element {}
  const ids = Object.fromEntries([
    'tabList', 'tabCount', 'menu', 'toast', 'appVersion', 'langButton', 'newTabButton', 'refreshButton'
  ].map(id => [id, new Element('div')]));
  ids.tabSearch = new Input('input');
  ids.menu.hidden = true;
  const document = Object.assign(new Element('#document'), {
    body: new Element('body'),
    documentElement: {},
    createElement: tag => new Element(tag),
    createDocumentFragment: () => new Element('#fragment'),
    getElementById: id => ids[id],
    querySelectorAll: () => []
  });
  const event = { addListener() {} };
  const chrome = {
    i18n: { getMessage: key => key, getUILanguage: () => 'ja' },
    runtime: { getManifest: () => ({ version: '0.0.0' }), onMessage: event, sendMessage() {} },
    windows: { getCurrent: async () => ({ id: 1 }) },
    tabs: { query: async () => ['Alpha', 'Beta', 'Gamma'].map((title, index) => ({
      id: index + 1, index, title, groupId: -1
    })) },
    tabGroups: { TAB_GROUP_ID_NONE: -1, query: async () => [] }
  };
  for (const name of ['Created', 'Removed', 'Updated', 'Moved', 'Attached', 'Detached', 'Activated', 'Replaced']) {
    chrome.tabs['on' + name] = event;
    chrome.tabGroups['on' + name] = event;
  }
  vm.runInNewContext(source, {
    document, chrome, HTMLInputElement: Input, HTMLTextAreaElement: class extends Element {},
    window: { addEventListener() {}, innerWidth: 800, innerHeight: 600 }, console
  });
  await new Promise(resolve => setImmediate(resolve));
  const rows = () => ids.tabList.children.filter(node => node.className?.startsWith('tab-row')).length;
  assert.equal(rows(), 3, 'the panel rendered its three tabs');
  ids.tabSearch.focus();
  ids.tabSearch.value = 'zyx-no-match';
  ids.tabSearch.emit('input');
  assert.equal(rows(), 0);
  const escape = () => {
    let prevented = false;
    document.emit('keydown', {
      key: 'Escape', target: document.activeElement, preventDefault() { prevented = true; }
    });
    return prevented;
  };
  return { ids, document, rows, escape };
}

test('Escape restores all tabs when the New Tab button has focus', async () => {
  const { ids, document, rows, escape } = await panel();
  ids.newTabButton.focus();
  escape();
  assert.equal(ids.tabSearch.value, '');
  assert.equal(rows(), 3);
  assert.equal(document.activeElement, ids.newTabButton);
});

test('Escape closes an open menu without clearing the search', async () => {
  const { ids, rows, escape } = await panel();
  ids.langButton.emit('click', { stopPropagation() {} });
  assert.equal(ids.menu.hidden, false);
  escape();
  assert.equal(ids.menu.hidden, true);
  assert.equal(ids.tabSearch.value, 'zyx-no-match');
  assert.equal(rows(), 0);
  ids.newTabButton.focus();
  escape();
  assert.equal(rows(), 3);
});

test('Escape in the search input still clears it and releases focus', async () => {
  const { ids, document, rows, escape } = await panel();
  escape();
  assert.equal(ids.tabSearch.value, '');
  assert.equal(rows(), 3);
  assert.equal(document.activeElement, document.body);
});

test('Escape on the New Tab button is not consumed without a filter or menu', async () => {
  const { ids, rows, escape } = await panel();
  ids.tabSearch.value = '';
  ids.tabSearch.emit('input');
  ids.newTabButton.focus();
  assert.equal(escape(), false);
  assert.equal(rows(), 3);
});
