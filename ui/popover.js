/**
 * popover.js — the M9 teaching popover (one window per page, zero deps).
 * -------------------------------------------------------------
 * Opens on click / Enter / Space of any element carrying `data-term` (a
 * glossary entry) or `data-steps` (a worked derivation, by card label).
 * Inside a window, sub-concepts are chips that replace the window content —
 * a breadcrumb tracks the trail, so the whole dictionary is reachable while
 * only ONE window ever exists.
 *
 * Accessibility contract: triggers keep focus; the window is a non-modal
 * `role="dialog"` labelled by its title; Escape and click-outside close it;
 * focus returns to the trigger on close; `aria-expanded` tracks the trigger.
 * All content is built with createElement/textContent — never innerHTML.
 *
 * initTeachingPopover(doc, { getGlossary, getSteps }) — app.js supplies the
 * two content providers (glossary.js and explain.js stay decoupled here).
 */

const EDGE = 8;   // viewport margin the window must respect
const WIDTH = 360; // popover width in px (kept in sync with style.css)

export function initTeachingPopover(doc, { getGlossary, getSteps }) {
  let win = null;          // the singleton window element
  let lastTrigger = null;  // element to restore focus to on close
  let trail = [];          // breadcrumb of glossary keys, e.g. ['pin-support','vertical-reaction']

  function ensureWindow() {
    if (win) return win;
    win = doc.createElement('div');
    win.className = 'popover';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'false');
    win.hidden = true;

    const bar = doc.createElement('div');
    bar.className = 'popover-bar';

    const back = doc.createElement('button');
    back.type = 'button';
    back.className = 'popover-back';
    back.hidden = true;
    back.textContent = '‹ back';
    back.setAttribute('aria-label', 'Back to the previous term');
    back.addEventListener('click', (evt) => {
      evt.stopPropagation(); // the delegated document handler must not re-judge this click
      trail.pop(); // the current entry
      const prev = trail[trail.length - 1];
      if (prev) showTerm(prev, trail.slice());
      else renderHome(lastTrigger?.getAttribute('data-steps') ?? '');
    });

    const path = doc.createElement('span');
    path.className = 'popover-path';

    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'popover-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close the explanation');
    close.addEventListener('click', (evt) => {
      evt.stopPropagation();
      closeWindow();
    });

    bar.append(back, path, close);
    const title = doc.createElement('h3');
    title.className = 'popover-title';
    const body = doc.createElement('div');
    body.className = 'popover-body';
    const chips = doc.createElement('div');
    chips.className = 'popover-chips';
    const stepsBox = doc.createElement('div');
    stepsBox.className = 'popover-steps';
    win.append(bar, title, body, stepsBox, chips);
    (doc.body ?? doc.documentElement ?? doc).append(win);
    win._els = { back, path, title, body, stepsBox, chips };
    return win;
  }

  function chip(labelText, key, className) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `popover-chip ${className}`;
    b.textContent = labelText;
    b.addEventListener('click', (evt) => {
      // stopPropagation is load-bearing: showTerm re-renders the window and
      // detaches THIS chip, so the bubbled document-level handler can no
      // longer recognise the click as "inside the window" and would close
      // it and wipe the breadcrumb trail. (Found by the CDP harness — a
      // fake-DOM test cannot see it: shims keep parentElement alive after
      // replaceChildren, a real DOM does not.)
      evt.stopPropagation();
      showTerm(key, trail.concat(key));
    });
    return b;
  }

  /** Render a glossary entry (by key) into the window. */
  function showTerm(key, nextTrail) {
    const entry = getGlossary(key);
    if (!entry) return;
    trail = nextTrail ?? [key];
    const { back, path, title, body, stepsBox, chips } = ensureWindow()._els;

    title.textContent = entry.term;
    body.textContent = entry.body;
    stepsBox.replaceChildren();
    stepsBox.hidden = true;
    chips.replaceChildren();

    for (const sub of entry.subs ?? []) {
      const subEntry = getGlossary(sub);
      if (subEntry) chips.append(chip(subEntry.term, sub, 'is-sub'));
    }
    for (const also of entry.seeAlso ?? []) {
      const alsoEntry = getGlossary(also);
      if (alsoEntry) chips.append(chip(alsoEntry.term, also, 'is-seealso'));
    }

    back.hidden = trail.length < 2;
    const names = trail.map((k) => getGlossary(k)?.term ?? k);
    path.textContent = names.join(' › ');
    title.id = 'popover-title';
    win.setAttribute('aria-labelledby', 'popover-title');
    open();
  }

  /** Render a derivation (by results-card label) into the window. */
  function showSteps(label) {
    const groups = getSteps(label);
    if (!groups || !groups.length) return;
    trail = [];
    const { back, path, title, body, stepsBox, chips } = ensureWindow()._els;
    back.hidden = true;
    path.textContent = 'Worked derivation';
    title.textContent = groups[0].title;
    body.replaceChildren();
    chips.replaceChildren();

    // One block per group; each step is one readable line:
    //   formula — substitution — value unit
    for (const g of groups) {
      const gt = doc.createElement('div');
      gt.className = 'steps-group-title';
      gt.textContent = groups.length > 1 ? g.title : '';
      const list = doc.createElement('div');
      list.className = 'steps-list';
      for (const s of g.steps) {
        const row = doc.createElement('div');
        row.className = 'steps-row';
        const f = doc.createElement('span');
        f.className = 'steps-formula';
        f.textContent = s.formula || s.substitution || '—';
        const v = doc.createElement('span');
        v.className = 'steps-value';
        v.textContent = s.value == null ? '—' : `${formatValue(s.value)}${s.unit ? ' ' + s.unit : ''}`;
        row.append(f, v);
        if (s.formula && s.substitution) {
          const sub = doc.createElement('div');
          sub.className = 'steps-sub';
          sub.textContent = s.substitution;
          row.append(sub);
        }
        list.append(row);
      }
      const block = doc.createElement('div');
      block.className = 'steps-group';
      block.append(gt, list);
      body.append(block);
    }
    stepsBox.hidden = true;
    title.id = 'popover-title';
    win.setAttribute('aria-labelledby', 'popover-title');
    open();
  }

  function renderHome(stepsLabel) {
    if (stepsLabel) showSteps(stepsLabel);
    else if (lastTrigger?.getAttribute('data-term')) showTerm(lastTrigger.getAttribute('data-term'), [lastTrigger.getAttribute('data-term')]);
    else closeWindow();
  }

  function formatValue(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
    const abs = Math.abs(v);
    if (abs !== 0 && (abs < 1e-6 || abs >= 1e7)) return v.toExponential(1);
    return String(Number(v.toPrecision(4)));
  }

  function open() {
    win.hidden = false;
    win.classList.add('open');
    position();
    if (lastTrigger) lastTrigger.setAttribute('aria-expanded', 'true');
  }

  function position() {
    // Fixed positioning near the trigger, flipping at the viewport edge.
    // In fake-DOM test environments the trigger has no geometry — skip.
    if (!lastTrigger || typeof lastTrigger.getBoundingClientRect !== 'function') return;
    const t = lastTrigger.getBoundingClientRect();
    const vw = Number(doc.documentElement?.clientWidth) || (typeof window !== 'undefined' ? Number(window.innerWidth) : 0) || 1200;
    const vh = Number(doc.documentElement?.clientHeight) || (typeof window !== 'undefined' ? Number(window.innerHeight) : 0) || 900;
    let left = t.left + t.width / 2 - WIDTH / 2;
    left = Math.max(EDGE, Math.min(left, vw - WIDTH - EDGE));
    const above = t.bottom + 8 + 300 > vh && t.top - 8 - 300 > 0;
    win.style.left = `${Math.round(left)}px`;
    win.style.top = above ? `${Math.round(t.top - 8)}px` : `${Math.round(t.bottom + 8)}px`;
    win.classList.toggle('is-above', above);
    if (typeof win.getBoundingClientRect === 'function') {
      const r = win.getBoundingClientRect();
      if (r.bottom > vh - EDGE) win.style.maxHeight = `${Math.round(vh - t.bottom - 2 * EDGE)}px`;
    }
  }

  function closeWindow() {
    if (!win || win.hidden) return;
    win.hidden = true;
    win.classList.remove('open');
    if (lastTrigger) {
      lastTrigger.setAttribute('aria-expanded', 'false');
      if (typeof lastTrigger.focus === 'function') lastTrigger.focus();
    }
    lastTrigger = null;
    trail = [];
  }

  function triggerOf(target) {
    let n = target;
    while (n && n !== doc.body && n !== doc.documentElement) {
      if (n.getAttribute && (n.getAttribute('data-term') || n.getAttribute('data-steps'))) return n;
      n = n.parentElement ?? n.parentNode ?? null;
    }
    return null;
  }

  // Delegated events — one listener set for the whole page.
  doc.addEventListener('click', (evt) => {
    const trigger = triggerOf(evt.target);
    if (trigger) {
      evt.preventDefault();
      const already = trigger === lastTrigger && win && !win.hidden;
      if (already) { closeWindow(); return; }
      lastTrigger = trigger;
      const key = trigger.getAttribute('data-term');
      const label = trigger.getAttribute('data-steps');
      if (key) showTerm(key, [key]);
      else if (label) showSteps(label);
      return;
    }
    // Clicked elsewhere: close unless the click was inside the window.
    let n = evt.target;
    while (n) { if (n === win) return; n = n.parentElement ?? n.parentNode ?? null; }
    closeWindow();
  });

  doc.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') { closeWindow(); return; }
    if (evt.key !== 'Enter' && evt.key !== ' ') return;
    const trigger = triggerOf(evt.target);
    if (!trigger) return;
    evt.preventDefault();
    lastTrigger = trigger;
    const key = trigger.getAttribute('data-term');
    const label = trigger.getAttribute('data-steps');
    if (key) showTerm(key, [key]);
    else if (label) showSteps(label);
  });

  return { close: closeWindow, isOpen: () => !!win && !win.hidden };
}
