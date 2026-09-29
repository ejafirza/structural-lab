/**
 * teaching.js — M9 teaching layer bootstrap (glossary dialog + derivations).
 * ---------------------------------------------------------------------------
 * One delegated popover for the whole page (ui/popover.js), fed by the two
 * pure content modules: the hand-written glossary and the derivation
 * formatter over the FINISHED result. Bound only when the host environment
 * provides document-level events — the fake-DOM test shims (the ui-m7/m8
 * pattern) have no addEventListener, and the teaching layer must stay as
 * invisible to them as the deflection panel is to pre-M8 fixtures (the
 * optional-DOM contract renderM3 already applies).
 *
 * The last-solved engine result comes from ui/state.js: the derivation doors
 * read THAT object, they never re-solve.
 */
import { getTerm } from '../src/glossary.js';
import { groupForCard } from '../src/explain.js';
import { getLastResult } from './state.js';
import { initTeachingPopover } from './popover.js';

export function initTeaching() {
  if (typeof document.addEventListener !== 'function') return;
  initTeachingPopover(document, {
    getGlossary: (key) => getTerm(key),
    getSteps: (label) => {
      if (!getLastResult() || getLastResult().classification.status !== 'determinate') return [];
      const g = groupForCard(getLastResult(), label);
      return g ?? null;
    },
  });
}
