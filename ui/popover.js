/**
 * popover.js — accessible teaching dialog with in-context glossary links.
 * Glossary links replace the current explanation in the same dialog; Back walks
 * the learner's trail without opening nested windows.
 */

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initTeachingPopover(doc, { getGlossary, getSteps }) {
  let dialog = null;
  let lastTrigger = null;
  let inertStates = [];
  let glossaryTrail = [];

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = doc.createElement('div');
    dialog.className = 'teaching-backdrop';
    dialog.hidden = true;
    dialog.setAttribute('data-teaching-backdrop', '');

    const panel = doc.createElement('section');
    panel.className = 'teaching-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'teaching-title');
    panel.setAttribute('tabindex', '-1');

    const header = doc.createElement('header');
    header.className = 'teaching-header';
    const back = doc.createElement('button');
    back.type = 'button';
    back.className = 'teaching-back';
    back.textContent = '← Back';
    back.hidden = true;
    back.setAttribute('aria-label', 'Back to previous definition');
    const title = doc.createElement('h2');
    title.className = 'teaching-title';
    title.id = 'teaching-title';
    title.setAttribute('tabindex', '-1');
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'teaching-close';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close explanation');
    close.addEventListener('click', closeDialog);
    back.addEventListener('click', goBack);
    header.append(back, title, close);

    const body = doc.createElement('div');
    body.className = 'teaching-body';
    panel.append(header, body);
    dialog.append(panel);
    (doc.body ?? doc.documentElement ?? doc).append(dialog);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog();
    });
    panel.addEventListener('click', (event) => event.stopPropagation());
    panel.addEventListener('click', (event) => {
      const link = topicLinkOf(event.target, panel);
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      renderTerm(link, link.getAttribute('data-topic-key'), { internal: true });
    });
    dialog._els = { panel, title, body, close, back };
    return dialog;
  }

  function closeDialog() {
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    glossaryTrail = [];
    for (const [node, wasInert] of inertStates) node.inert = wasInert;
    inertStates = [];
    if (lastTrigger) {
      lastTrigger.setAttribute?.('aria-expanded', 'false');
      if (lastTrigger.isConnected !== false) lastTrigger.focus?.();
    }
    lastTrigger = null;
  }

  function openDialog(trigger, titleText, renderBody, { internal = false } = {}) {
    const view = ensureDialog();
    const wasOpen = !view.hidden;
    if (wasOpen && !internal) {
      lastTrigger?.setAttribute?.('aria-expanded', 'false');
    }
    if (!internal) lastTrigger = trigger;
    const { title, body, close, back } = view._els;
    title.textContent = ''; // clear any previous topic before rich-append
    appendNotation(title, titleText);
    back.hidden = glossaryTrail.length < 2;
    body.replaceChildren();
    renderBody(body);
    view.hidden = false;
    if (!wasOpen) {
      const content = doc.getElementById?.('lab-content');
      const topbar = doc.querySelector?.('.topbar');
      const bodySiblings = [...(doc.body?.children ?? [])].filter((node) => node !== view);
      const background = [...new Set([content, topbar, ...bodySiblings].filter(Boolean))];
      inertStates = background.map((node) => [node, !!node.inert]);
      for (const [node] of inertStates) node.inert = true;
    }
    if (!internal) trigger?.setAttribute?.('aria-expanded', 'true');
    if (internal) {
      title.focus?.();
      view._els.body.scrollTop = 0;
    }
    else close.focus?.();
  }

  function appendGlossaryBody(container, entry) {
    const copy = doc.createElement('p');
    copy.className = 'teaching-copy';
    const inlineKeys = appendLinkedText(copy, entry.body);
    container.append(copy);

    const relatedKeys = [...new Set([...(entry.subs ?? []), ...(entry.seeAlso ?? [])])]
      .filter((key) => !inlineKeys.has(key));
    if (!relatedKeys.length) return;
    const related = doc.createElement('nav');
    related.className = 'teaching-related';
    related.setAttribute('aria-label', `More concepts related to ${entry.term}`);
    for (const key of relatedKeys) appendTopicLink(related, key);
    container.append(related);
  }

  function appendTopicLink(container, key, label) {
    const topic = getGlossary(key);
    if (!topic) return false;
    const link = doc.createElement('button');
    link.type = 'button';
    link.className = 'glossary-link';
    link.setAttribute('data-topic-key', key);
    link.setAttribute('aria-label', `Open definition: ${topic.term}`);
    link.textContent = label ?? topic.term;
    container.append(link);
    return true;
  }

  function appendLinkedText(container, text) {
    const pattern = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
    const linkedKeys = new Set();
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > cursor) appendNotation(container, text.slice(cursor, match.index));
      const key = match[1];
      if (appendTopicLink(container, key, match[2])) linkedKeys.add(key);
      else appendNotation(container, match[0]);
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) appendNotation(container, text.slice(cursor));
    return linkedKeys;
  }

  function renderTerm(trigger, key, { internal = false, back = false } = {}) {
    const entry = getGlossary(key);
    if (!entry) return;
    if (!internal) glossaryTrail = [key];
    else if (!back) glossaryTrail.push(key);
    openDialog(trigger, entry.term, (body) => appendGlossaryBody(body, entry), { internal });
  }

  function goBack() {
    if (glossaryTrail.length < 2) return;
    glossaryTrail.pop();
    renderTerm(lastTrigger, glossaryTrail.at(-1), { internal: true, back: true });
  }

  function topicLinkOf(target, panel) {
    for (let node = target; node && node !== panel; node = node.parentElement ?? node.parentNode ?? null) {
      if (node.getAttribute?.('data-topic-key')) return node;
    }
    return null;
  }

  /**
   * M12 Fix 7: rich-text notation. Semantic `_X` runs (V_A, ΣM_A, R_B)
   * render as true <sub> subscripts in the dialog; textContent still reads
   * as the plain semantic form, so text-based assertions hold.
   */
  function appendNotation(node, str) {
    const parts = String(str).split(/(_[A-Za-z][A-Za-z0-9]*)/g).filter((p) => p !== '');
    for (const part of parts) {
      if (part.startsWith('_')) {
        const sub = doc.createElement('sub');
        sub.textContent = part.slice(1);
        node.append(sub);
      } else {
        node.append(doc.createTextNode(part));
      }
    }
  }

  function formatValue(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
    const abs = Math.abs(value);
    if (abs !== 0 && (abs < 1e-6 || abs >= 1e7)) return value.toExponential(2);
    return String(Number(value.toPrecision(4)));
  }

  function renderSteps(trigger, label) {
    const group = getSteps(label);
    if (!group) return;
    glossaryTrail = [];
    openDialog(trigger, group.title, (body) => {
      const intro = doc.createElement('p');
      intro.className = 'teaching-copy teaching-intro';
      intro.textContent = group.intro || 'Follow the steps below. The final values match the displayed result.';
      body.append(intro);

      if (group.given?.length) {
        const given = doc.createElement('section');
        given.className = 'worked-given';
        const givenTitle = doc.createElement('h3');
        givenTitle.textContent = 'Given';
        const givenList = doc.createElement('ul');
        for (const datum of group.given) {
          const item = doc.createElement('li');
          item.textContent = datum;
          givenList.append(item);
        }
        given.append(givenTitle, givenList);
        body.append(given);
      }

      const list = doc.createElement('ol');
      list.className = 'worked-steps';
      for (const item of group.steps) {
        const row = doc.createElement('li');
        row.className = item.final ? 'worked-step worked-step-final' : 'worked-step';

        const heading = doc.createElement('h3');
        heading.className = 'worked-step-title';
        appendNotation(heading, item.title);
        row.append(heading);

        if (item.explanation) {
          const explanation = doc.createElement('p');
          explanation.className = 'worked-step-explanation';
          explanation.textContent = item.explanation;
          row.append(explanation);
        }
        if (item.equation) {
          const equation = doc.createElement('div');
          equation.className = 'worked-equation';
          equation.setAttribute('role', 'math');
          appendNotation(equation, item.equation);
          row.append(equation);
        }
        if (item.substitution) {
          const substitution = doc.createElement('p');
          substitution.className = 'worked-substitution';
          appendNotation(substitution, item.substitution);
          row.append(substitution);
        }
        if (item.value != null) {
          const value = doc.createElement('p');
          value.className = item.final ? 'worked-answer' : 'worked-value';
          value.textContent = `${item.final ? 'Result' : 'Value'}: ${formatValue(item.value)}${item.unit ? ` ${item.unit}` : ''}`;
          row.append(value);
        }
        list.append(row);
      }
      body.append(list);
    });
  }

  function triggerOf(target) {
    let node = target;
    while (node && node !== doc.body && node !== doc.documentElement) {
      if (node.getAttribute?.('data-term') || node.getAttribute?.('data-topic-key') || node.getAttribute?.('data-steps')) return node;
      node = node.parentElement ?? node.parentNode ?? null;
    }
    return null;
  }

  function activate(trigger) {
    const term = trigger.getAttribute('data-term');
    const topic = trigger.getAttribute('data-topic-key');
    const steps = trigger.getAttribute('data-steps');
    if (term) renderTerm(trigger, term);
    else if (topic) renderTerm(trigger, topic, { internal: !!dialog && !dialog.hidden && dialog.contains?.(trigger) });
    else if (steps) renderSteps(trigger, steps);
  }

  doc.addEventListener('click', (event) => {
    if (dialog && !dialog.hidden && dialog.contains?.(event.target)) return;
    const trigger = triggerOf(event.target);
    if (!trigger) return;
    event.preventDefault();
    activate(trigger);
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeDialog(); return; }
    const modalOpen = !!dialog && !dialog.hidden;
    if (modalOpen && event.key === 'Tab') {
      const nodes = [...(dialog.querySelectorAll?.(FOCUSABLE) ?? [])]
        .filter((node) => !node.hidden && node.getAttribute?.('aria-hidden') !== 'true');
      if (!nodes.length) { event.preventDefault(); dialog._els.panel.focus?.(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = doc.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains?.(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains?.(active))) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const trigger = triggerOf(event.target);
    if (modalOpen && (!trigger || !dialog.contains?.(trigger))) return;
    if (!trigger) return;
    event.preventDefault();
    activate(trigger);
  });

  return { close: closeDialog, isOpen: () => !!dialog && !dialog.hidden };
}
