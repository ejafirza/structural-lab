/**
 * popover.js — focused, one-topic teaching dialog (zero dependencies).
 * A learner opens one explanation at a time, only by activating a marked term
 * or result. There are no related-topic chips, breadcrumbs, or auto-advance.
 */

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initTeachingPopover(doc, { getGlossary, getSteps }) {
  let dialog = null;
  let lastTrigger = null;
  let inertStates = [];

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
    const title = doc.createElement('h2');
    title.className = 'teaching-title';
    title.id = 'teaching-title';
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'teaching-close';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close explanation');
    close.addEventListener('click', closeDialog);
    header.append(title, close);

    const body = doc.createElement('div');
    body.className = 'teaching-body';
    panel.append(header, body);
    dialog.append(panel);
    (doc.body ?? doc.documentElement ?? doc).append(dialog);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog();
    });
    panel.addEventListener('click', (event) => event.stopPropagation());
    dialog._els = { panel, title, body, close };
    return dialog;
  }

  function closeDialog() {
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    for (const [node, wasInert] of inertStates) node.inert = wasInert;
    inertStates = [];
    if (lastTrigger) {
      lastTrigger.setAttribute?.('aria-expanded', 'false');
      if (lastTrigger.isConnected !== false) lastTrigger.focus?.();
    }
    lastTrigger = null;
  }

  function openDialog(trigger, titleText, renderBody) {
    const view = ensureDialog();
    const wasOpen = !view.hidden;
    if (wasOpen) {
      const oldTrigger = lastTrigger;
      oldTrigger?.setAttribute?.('aria-expanded', 'false');
      if (oldTrigger?.isConnected === false) oldTrigger.setAttribute?.('aria-expanded', 'false');
    }
    lastTrigger = trigger;
    const { title, body, close } = view._els;
    title.textContent = titleText;
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
    trigger?.setAttribute?.('aria-expanded', 'true');
    close.focus?.();
  }

  function renderTerm(trigger, key) {
    const entry = getGlossary(key);
    if (!entry) return;
    openDialog(trigger, entry.term, (body) => {
      const text = doc.createElement('p');
      text.className = 'teaching-copy';
      text.textContent = entry.body;
      body.append(text);
    });
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
        heading.textContent = item.title;
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
          equation.textContent = item.equation;
          row.append(equation);
        }
        if (item.substitution) {
          const substitution = doc.createElement('p');
          substitution.className = 'worked-substitution';
          substitution.textContent = item.substitution;
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
      if (node.getAttribute?.('data-term') || node.getAttribute?.('data-steps')) return node;
      node = node.parentElement ?? node.parentNode ?? null;
    }
    return null;
  }

  function activate(trigger) {
    const term = trigger.getAttribute('data-term');
    const steps = trigger.getAttribute('data-steps');
    if (term) renderTerm(trigger, term);
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
