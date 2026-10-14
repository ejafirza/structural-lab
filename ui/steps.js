// Guided steps: the page shows one task at a time (Beam → Loads → Results).
// Presentation only: the engine and renderers are unaffected. Which sections a
// step shows is declared in the markup via data-steps="beam loads results".

export const STEPS = ['beam', 'loads', 'results'];

export const STEP_LABELS = {
  beam: 'Beam',
  loads: 'Loads',
  results: 'Results',
};

// Pure: does a section's data-steps membership include this step?
export function isVisibleInStep(membership, step) {
  return String(membership ?? '').split(/\s+/).includes(step);
}

// Wires the step bar, Back/Next buttons and section visibility.
// Returns the controller, or null when the page has no step markup.
export function initSteps(doc, env = globalThis) {
  const sections = Array.from(doc.querySelectorAll('[data-steps]') ?? []);
  const buttons = Array.from(doc.querySelectorAll('[data-step-target]') ?? []);
  if (!sections.length || !buttons.length) return null;

  const prev = doc.getElementById('step-prev');
  const next = doc.getElementById('step-next');
  const position = doc.getElementById('step-position');
  let current = STEPS[0];

  function show(step) {
    if (!STEPS.includes(step)) return current;
    current = step;
    for (const el of sections) {
      el.hidden = !isVisibleInStep(el.getAttribute('data-steps'), step);
    }
    for (const button of buttons) {
      if (button.getAttribute('data-step-target') === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
    const index = STEPS.indexOf(step);
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === STEPS.length - 1;
    if (position) position.textContent = `Step ${index + 1} of ${STEPS.length}: ${STEP_LABELS[step]}`;
    env.scrollTo?.(0, 0);
    return current;
  }

  function move(delta) {
    const index = STEPS.indexOf(current) + delta;
    if (index < 0 || index >= STEPS.length) return current;
    return show(STEPS[index]);
  }

  for (const button of buttons) {
    button.addEventListener('click', () => show(button.getAttribute('data-step-target')));
  }
  prev?.addEventListener('click', () => move(-1));
  next?.addEventListener('click', () => move(1));

  show(current);
  return {
    show,
    move,
    get current() {
      return current;
    },
  };
}
