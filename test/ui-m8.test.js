import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam, DEFAULT_EI } from '../src/analysis.js';
import { fmt, makeXMap } from '../ui/render.js';
import { makeDoc, bootApp } from './helpers/fake-dom.js';

globalThis.document = makeDoc().doc;
const { renderM3 } = await import('../ui/renderm3.js');
const pinRoller = { left: 'pin', right: 'roller' };

const supportControl = (beam, side) => beam.querySelectorAll('[data-role="support-toggle"]')
  .find((node) => node.getAttribute('data-support-side') === side);
const resultDeflection = (elements) => Number(elements['result-cards'].findAll((node) =>
  node.className === 'card-value' && node.textContent.endsWith('mm'))[0].textContent.replace(' mm', ''));
const openContextMenu = (beam, x, y = 880) => {
  const event = { type: 'contextmenu', clientX: x, clientY: y, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; } };
  beam.dispatchEvent(event);
  return event;
};

const stiffness = (elements) => elements['num-ei'].value;

test('deflection drawing is based on engine samples and reports the true deflection', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const { doc } = makeDoc();
  globalThis.document = doc;
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  const curve = doc.getElementById('defl-svg').findAll((node) => node.nodeName === 'polyline');
  assert.equal(curve.length, 1);
  assert.equal(curve[0].attrs.points.split(' ').length, result.deflection.v.length);
  const labels = doc.getElementById('defl-svg').findAll((node) => node.nodeName === 'text').map((node) => node.textContent);
  assert.ok(labels.some((text) => text.includes(`${fmt(result.deflection.max.value * 1000)} mm`) && text.includes('exaggerated')));
  assert.ok(labels.some((text) => text.startsWith('vₘₐₓ = ')));
  const moment = doc.getElementById('bmd-svg').findAll((node) => node.nodeName === 'text');
  assert.ok(moment.some((node) => node.textContent.startsWith('Mₘₐₓ = ') && node.textContent.includes('kN·m')));
});

test('E·I presets, logarithmic slider, deflection response, and visibility remain linked', async () => {
  const { elements } = await bootApp();
  const chip = (id) => elements['ei-chips'].children.find((button) => button.dataset.preset === id);
  assert.equal(elements['ctl-ei'].hidden, false);
  assert.equal(stiffness(elements), fmt(DEFAULT_EI));
  chip('steel').dispatchEvent({ type: 'click' });
  assert.equal(stiffness(elements), fmt(1.8e4));
  assert.equal(chip('steel').classList.contains('active'), true);
  elements['num-ei'].value = '12345';
  elements['num-ei'].dispatchEvent({ type: 'input' });
  assert.equal(chip('steel').classList.contains('active'), false);

  const slider = elements['slider-ei'];
  slider.value = '4';
  slider.dispatchEvent({ type: 'input', target: slider });
  assert.equal(stiffness(elements), fmt(1e4));
  const before = resultDeflection(elements);
  slider.value = String(Math.log10(5000));
  slider.dispatchEvent({ type: 'input', target: slider });
  assert.ok(resultDeflection(elements) > before, 'lower stiffness produces greater deflection');

  for (const [support, hidden] of [['pin', true], ['roller', false]]) {
    elements['sel-support-right'].value = support;
    elements['sel-support-right'].dispatchEvent({ type: 'change', target: elements['sel-support-right'] });
    assert.equal(elements['ctl-ei'].hidden, hidden);
  }
});

test('support controls cycle by click/keyboard and reflect selector changes', async () => {
  const { doc, elements } = await bootApp();
  const beam = elements['beam-svg'];
  for (const [side, key, expected] of [
    ['left', 'click', 'roller'], ['right', 'Enter', 'fixed'], ['right', ' ', 'free'], ['right', 'click', 'pin'],
  ]) {
    const control = supportControl(beam, side);
    assert.equal(control.getAttribute('role'), 'button');
    assert.equal(control.getAttribute('tabindex'), '0');
    control.dispatchEvent(key === 'click' ? { type: 'click' } : { type: 'keydown', key });
    const updated = supportControl(beam, side);
    assert.equal(elements[`sel-support-${side}`].value, expected);
    assert.ok(updated.getAttribute('aria-label').includes(`currently ${expected}`));
    if (key !== 'click') assert.equal(doc.activeElement, updated);
  }
  for (const [side, value] of [['left', 'fixed'], ['left', 'pin'], ['right', 'roller']]) {
    elements[`sel-support-${side}`].value = value;
    elements[`sel-support-${side}`].dispatchEvent({ type: 'change', target: elements[`sel-support-${side}`] });
    assert.ok(supportControl(beam, side).getAttribute('aria-label').includes(`currently ${value}`));
  }
});

test('dragging a beam load handle updates its position', async () => {
  const { elements } = await bootApp();
  const beam = elements['beam-svg'];
  const map = makeXMap({ span: 6 });
  const handle = beam.findAll((node) => node.getAttribute('data-role') === 'load-handle')[0];
  handle.dispatchEvent({ type: 'pointerdown', pointerId: 7, clientX: map.toPx(3), clientY: 40 });
  window.dispatchEvent({ type: 'pointermove', pointerId: 7, clientX: map.toPx(4.2), clientY: 40 });
  window.dispatchEvent({ type: 'pointerup', pointerId: 7 });
  assert.ok(Math.abs(Number(elements['num-pos'].value) - 4.2) < 0.02);
});

test('desktop context chooser stays in bounds and dismisses on Escape or outside click', async () => {
  const { doc, elements, setDesktop } = await bootApp({ desktop: false });
  const beam = elements['beam-svg'];
  const menu = elements['beam-context-menu'];
  const x = makeXMap({ span: 6 }).toPx(2.4);
  assert.equal(openContextMenu(beam, x).defaultPrevented, false, 'mobile keeps the browser menu');
  assert.equal(menu.hidden, true);

  setDesktop(true);
  openContextMenu(beam, x);
  assert.equal(menu.hidden, false);
  assert.equal(elements['beam-context-title'].textContent, `Add a load at x = ${fmt(2.4)} m`);
  openContextMenu(beam, 1279, 899);
  const { width, height } = menu.getBoundingClientRect();
  assert.ok(Number.parseFloat(menu.style.left) + width <= 1272);
  assert.ok(Number.parseFloat(menu.style.top) + height <= 892);
  const escape = { type: 'keydown', key: 'Escape', target: elements['beam-context-point'] };
  doc.dispatchEvent(escape);
  assert.equal(menu.hidden, true);
  assert.equal(doc.activeElement, beam);

  openContextMenu(beam, x);
  doc.dispatchEvent({ type: 'click', target: elements['num-span'] });
  assert.equal(menu.hidden, true);
});

test('context chooser adds point and distributed loads through the existing editor', async () => {
  const { elements } = await bootApp();
  const beam = elements['beam-svg'];
  const menu = elements['beam-context-menu'];
  const map = makeXMap({ span: 6 });
  openContextMenu(beam, map.toPx(2.4));
  elements['beam-context-point'].dispatchEvent({ type: 'click' });
  assert.equal(elements['load-count'].textContent, '2 loads');
  assert.equal(elements['model-panel'].open, true);
  assert.equal(Number(elements['num-pos'].value), Number(fmt(2.4)));
  assert.equal(menu.hidden, true);

  openContextMenu(beam, map.toPx(3));
  elements['beam-context-distributed'].dispatchEvent({ type: 'click' });
  assert.equal(elements['load-count'].textContent, '3 loads');
  assert.equal(elements['ctl-load'].hidden, true);
  assert.equal(menu.hidden, true);
});

test('span controls normalize, clamp, and recover blank input', async () => {
  const { elements } = await bootApp();
  const number = elements['num-span'];
  const slider = elements['slider-span'];
  assert.equal(number.value, '6');
  assert.equal(slider.value, '6');
  number.value = '8.05';
  number.dispatchEvent({ type: 'input' });
  assert.equal(number.value, '8.1');
  assert.equal(slider.value, '8.1');
  number.value = '';
  number.dispatchEvent({ type: 'blur' });
  assert.equal(number.value, '8.1');
  slider.value = '9.2';
  slider.dispatchEvent({ type: 'input' });
  assert.equal(number.value, '9.2');

  for (const [raw, expected] of [['0', '1'], ['20.05', '20']]) {
    number.value = raw;
    number.dispatchEvent({ type: 'input' });
    assert.equal(number.value, expected);
    assert.equal(slider.value, expected);
  }
});
