/**
 * theme.test.js — presentation-only appearance preference behavior.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initTheme, THEME_STORAGE_KEY } from '../ui/theme.js';

class FakeNode {
  constructor() { this.attrs = {}; this.listeners = {}; this.textContent = ''; this.title = ''; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key]; }
  click() { for (const fn of this.listeners.click ?? []) fn({ target: this }); }
}

function setup({ saved = null, dark = false, storageThrows = false } = {}) {
  const button = new FakeNode();
  const root = { attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; } };
  const values = new Map(saved ? [[THEME_STORAGE_KEY, saved]] : []);
  const storage = storageThrows ? {
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('storage blocked'); },
    removeItem() { throw new Error('storage blocked'); },
  } : {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const media = {
    matches: dark,
    listeners: [],
    addEventListener(type, fn) { if (type === 'change') this.listeners.push(fn); },
    removeEventListener(type, fn) { this.listeners = this.listeners.filter((f) => f !== fn); },
    change(matches) { this.matches = matches; for (const fn of this.listeners) fn({ matches }); },
  };
  const env = { localStorage: storage, matchMedia: () => media };
  const doc = { documentElement: root, getElementById: (id) => id === 'theme-toggle' ? button : null };
  return { button, root, values, media, controller: initTheme(doc, env) };
}

test('defaults to the operating-system appearance and follows changes in System mode', () => {
  const { button, root, media, controller } = setup({ dark: false });
  assert.equal(controller.getMode(), 'system');
  assert.equal(controller.getActualTheme(), 'light');
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(root.style.colorScheme, 'light');
  assert.equal(button.textContent, 'Theme: System (light)');
  media.change(true);
  assert.equal(controller.getActualTheme(), 'dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
});

test('cycles System → Light → Dark → System and persists only explicit choices', () => {
  const { button, root, values, media, controller } = setup({ dark: true });
  button.click();
  assert.equal(controller.getMode(), 'light');
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(values.get(THEME_STORAGE_KEY), 'light');
  media.change(false);
  assert.equal(root.getAttribute('data-theme'), 'light', 'OS change cannot override an explicit selection');
  button.click();
  assert.equal(controller.getMode(), 'dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(values.get(THEME_STORAGE_KEY), 'dark');
  button.click();
  assert.equal(controller.getMode(), 'system');
  assert.equal(values.has(THEME_STORAGE_KEY), false, 'System removes the saved override');
  assert.equal(root.getAttribute('data-theme'), 'light', 'System resumes current OS mode');
});

test('restores a valid saved choice and ignores unknown stored values', () => {
  const saved = setup({ saved: 'dark' });
  assert.equal(saved.controller.getMode(), 'dark');
  assert.equal(saved.root.getAttribute('data-theme'), 'dark');
  assert.equal(saved.button.getAttribute('aria-label').includes('Dark'), true);
  const invalid = setup({ saved: 'purple', dark: false });
  assert.equal(invalid.controller.getMode(), 'system');
  assert.equal(invalid.root.getAttribute('data-theme'), 'light');
});

test('storage failures do not stop the control or system appearance from working', () => {
  const { button, root, controller } = setup({ storageThrows: true, dark: false });
  assert.equal(controller.getMode(), 'system');
  button.click();
  assert.equal(controller.getMode(), 'light');
  assert.equal(root.getAttribute('data-theme'), 'light');
  button.click();
  assert.equal(controller.getMode(), 'dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
});

test('can run without matchMedia, storage, or a theme button', () => {
  const button = new FakeNode();
  const root = { attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = String(v); } };
  const controller = initTheme({ documentElement: root, getElementById: () => button }, {});
  assert.equal(controller.getActualTheme(), 'light');
  assert.equal(root.attrs['data-theme'], 'light');
  assert.equal(initTheme({ documentElement: root, getElementById: () => null }, {}), null);
});

test('invalid programmatic mode changes are rejected without changing appearance', () => {
  const { controller, root } = setup({ dark: true });
  assert.equal(controller.setMode('sepia'), false);
  assert.equal(controller.getMode(), 'system');
  assert.equal(root.getAttribute('data-theme'), 'dark');
});
