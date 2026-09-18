# Milestone 2 — Interactive Structural Analysis Laboratory

Milestone 1 is complete and verified.

The deterministic engineering engine and its automated tests must now be treated as the stable foundation. **Do not rewrite or replace the engineering engine unless a genuine engineering defect is discovered.**

## Objective

Build the first visual/interactive layer around the existing deterministic engine.

The goal is to transform the invisible calculation engine into an educational interactive laboratory.

The user should be able to:

> **Build → Manipulate → Observe**

For this milestone, do NOT implement the AI tutor yet.

---

## Core Experience

The screen should present a simply supported beam with:

* pinned support
* roller support
* one downward point load
* beam span
* load position
* load magnitude

The user should be able to change:

* beam span
* load magnitude
* load position

The engineering results should update immediately.

Display:

* left reaction
* right reaction
* shear-force diagram
* bending-moment diagram
* maximum bending moment
* relevant numerical values

---

## Most Important UX Principle

This should NOT feel like:

> Enter numbers → press Calculate → receive graphs.

It should feel like an interactive engineering experiment.

Ideally, the user can manipulate the load visually.

For example:

> Drag the point load along the beam.

As the load moves:

* reactions change
* SFD changes
* BMD changes
* numerical results change

The cause-and-effect relationship should be visually obvious.

---

## Engineering Integrity

The UI must consume the existing deterministic engine.

Do NOT duplicate engineering calculations inside UI components.

There should remain one source of truth:

> **Engineering engine → results → visualization**

The visualization should not independently calculate reactions, shear, or moment.

Preserve the existing automated tests and run them after integration.

---

## Scope

For this milestone, support ONLY the existing Milestone 1 structural case:

> Simply supported beam + one downward point load.

Do NOT add:

* UDL
* multiple point loads
* cantilevers
* fixed beams
* deflection
* 3D
* BIM
* AI
* authentication
* databases
* accounts
* deployment infrastructure
* other structural cases

Those are future possibilities.

---

## Visual Design Intent

Prioritize engineering clarity over decorative design.

The user should immediately understand:

1. What the beam is.
2. Where the supports are.
3. Where the load is.
4. What the load magnitude is.
5. What the reactions are.
6. How the shear diagram relates to the beam.
7. How the moment diagram relates to the beam.

The beam, SFD, and BMD should feel like one connected system rather than three unrelated charts.

The exact frontend framework and visualization implementation are your technical decision.

Choose the simplest appropriate technology that works well in the existing project.

Do not introduce unnecessary dependencies.

---

## Important: Plan Before Coding

Before implementing Milestone 2:

1. Inspect the existing Milestone 1 project.
2. Propose the UI architecture.
3. Propose the component structure.
4. Explain how the existing engine will be connected to the UI.
5. Explain how the interactive load position will work.
6. Explain how the SFD/BMD will be rendered.
7. Explain how engineering-unit handling will work.
8. Identify any technical risks.

Then STOP and present the plan.

Do not begin implementation until the plan has been reviewed.

---

## Acceptance Criteria

Milestone 2 will be considered complete when:

* The application launches successfully.
* A simply supported beam is visible.
* The point load is visible.
* Supports are visible.
* Beam dimensions are understandable.
* The user can modify span, load magnitude, and load position.
* Results update immediately.
* Reactions are displayed.
* SFD is displayed.
* BMD is displayed.
* The diagrams respond correctly to changes.
* Existing Milestone 1 tests continue to pass.
* No engineering calculations have been duplicated in the UI.
* No AI functionality has been added yet.

The application should already feel like the beginning of an educational structural-analysis laboratory, not merely a calculator.

**Plan first. Do not code yet.**
