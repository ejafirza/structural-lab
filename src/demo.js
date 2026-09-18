/**
 * Text demo: default case from the brief (L=6, P=10, a=3).
 * Run: npm run demo
 */
import { solveSimplySupportedPointLoad } from './engine.js';

const r = solveSimplySupportedPointLoad({ span: 6, load: 10, position: 3 });

console.log('Simply supported beam — one downward point load');
console.log('──────────────────────────────────────────────');
console.log(`Span L = ${r.input.span} m, P = ${r.input.load} kN at a = ${r.input.position} m (b = ${r.input.b} m)`);
console.log(`Reactions: RA = ${r.reactions.RA.toFixed(3)} kN, RB = ${r.reactions.RB.toFixed(3)} kN`);
console.log(`Max bending moment: ${r.maxMoment.value.toFixed(3)} kNm at x = ${r.maxMoment.position} m`);
console.log(`Equilibrium: ΣFy = ${r.equilibrium.sumFy.toExponential(2)}, ΣM_A = ${r.equilibrium.sumMomentsAboutA.toExponential(2)} → satisfied: ${r.equilibrium.satisfied}`);
console.log('');
console.log('ASCII bending-moment diagram (sagging positive, drawn upward):');
console.log('');

// Simple ASCII plot of the moment diagram.
const width = 60;
const height = 12;
const xs = r.diagrams.moment;
const maxM = Math.max(...xs.map((p) => p.M));
const minM = Math.min(...xs.map((p) => p.M));
const rows = [];
for (let row = 0; row < height; row++) rows.push(' '.repeat(width + 2));
for (const p of xs) {
  const col = Math.round((p.x / r.input.span) * width);
  // normalise M into [0, height-1] (all sagging positive in this case)
  const norm = maxM === minM ? 0.5 : (p.M - minM) / (maxM - minM);
  const row = Math.round((height - 1) * norm);
  if (row >= 0 && row < height && col >= 0 && col <= width) {
    rows[row] = rows[row].substring(0, col) + '*' + rows[row].substring(col + 1);
  }
}
// axis labels
const mid = Math.floor(width / 2);
rows[height - 1] = `${rows[height - 1].trimEnd()}   ← M(x), peak ${maxM.toFixed(2)} kNm at x=3 m`;
for (let row = height - 1; row >= 0; row--) console.log(rows[row]);
console.log('A' + ' '.repeat(width - 1) + 'B');
console.log(`0${' '.repeat(width - 2)}${r.input.span} m`);
