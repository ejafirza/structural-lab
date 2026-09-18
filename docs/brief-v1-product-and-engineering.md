# Interactive Structural Analysis Laboratory

## Product & Engineering Brief v1

You are the primary software engineer responsible for implementing this project.

I am the project owner and a civil engineering graduate. I am not a professional software engineer, so you are responsible for making appropriate technical implementation decisions, but you must not independently redefine the product's purpose, engineering assumptions, or scope.

This project is being developed as both:

1. A genuinely useful educational software tool for civil/structural engineering students and learners.
2. A portfolio project demonstrating the intersection of civil engineering, computation, visualization, and AI.

The second objective is important, but the first objective takes priority.

Do not optimize the project merely to look impressive in a portfolio. Build something that is actually useful.

---

# 1. Product Concept

The product is an:

> **Interactive Structural Analysis Learning Laboratory**

The central educational loop is:

> **Experiment → Observe → Question → Understand**

A learner should be able to construct a simple beam/loading scenario, observe the resulting structural behavior, ask why the behavior occurs, and receive an explanation grounded in engineering mathematics and principles.

This is NOT intended to be a replacement for professional structural-analysis software such as commercial structural-analysis packages.

It is an educational environment designed to make structural mechanics more intuitive, interactive, and accessible.

---

# 2. Core Philosophy

## SLC — Simple, Lovable, Complete

### SIMPLE

The user should be able to create and modify a structural problem with minimal friction.

Avoid unnecessary:

* accounts
* authentication
* databases
* dashboards
* enterprise features
* complicated setup
* 3D modelling
* BIM
* unnecessary configuration
* excessive menus

Do not add features merely because they are technically impressive.

Every feature must justify itself by improving the educational experience.

### LOVABLE

The software should feel like an interactive engineering laboratory rather than a spreadsheet or generic calculator.

The user should be able to manipulate the structural model and immediately see the consequences.

For example:

* moving a load changes the reactions
* changing a load changes the diagrams
* changing the span changes the response
* selecting a region of a diagram can provide contextual explanation

The interface should prioritize visual understanding.

### COMPLETE

Version 1 does not need to support every possible structural configuration.

Instead, it must provide one complete and reliable educational experience from beginning to end.

A user should be able to:

1. Create a supported beam configuration.
2. Apply a supported load.
3. Observe the structural response.
4. Inspect the resulting diagrams.
5. Understand why the response occurs.
6. Modify the problem and experiment again.

A smaller complete product is preferable to a huge unfinished system.

---

# 3. Core Product Principle

The most important architectural and philosophical principle is:

> **The engineering engine calculates. AI explains.**

The deterministic engineering model must remain independent of the LLM.

The AI must NOT be responsible for determining fundamental engineering results such as:

* support reactions
* shear force
* bending moment
* deflection
* equilibrium

Those results must come from deterministic mathematics implemented in software.

The AI receives the resulting engineering state and helps the learner understand it.

Therefore:

**User input → deterministic engineering model → calculated results → visualization**

and separately:

**Engineering state → AI → educational explanation**

Do not reverse this relationship.

---

# 4. Educational Philosophy

The application should encourage students to learn through experimentation rather than merely receiving answers.

Traditional learning often looks like:

> Formula → Example → Answer

This project should encourage:

> Experiment → Observation → Question → Theory → Experiment again

The user should be encouraged to ask questions such as:

* Why is the reaction larger on this side?
* Why is the bending moment maximum here?
* Why does the shear diagram change at the point load?
* Why does a UDL create a different diagram shape?
* What happens if I double the load?
* What happens if I move the load?
* Why does increasing span affect the moment?
* What is the mathematical relationship between shear and moment?
* Where does this equation come from?
* How does this relate to engineering practice?

The application should make these questions natural.

---

# 5. AI Tutor Concept

AI is a major component of the educational experience, but it is NOT the source of truth for deterministic calculations.

The AI should eventually function as an engineering tutor.

For example, if a learner selects the maximum bending moment on the diagram and asks:

> "Why is the moment maximum here?"

The AI should be able to explain the concept using the actual current beam configuration.

A strong answer could connect:

1. Physical intuition
2. Shear-force behavior
3. Mathematical relationships
4. The current diagram
5. Relevant structural mechanics principles

For example, the AI may explain the relationship:

dM/dx = V

and explain that a change in the sign of shear corresponds to a local extremum of the bending moment diagram.

The AI should understand the actual state of the current engineering model rather than answering as a generic chatbot.

---

# 6. Standards / Engineering References

A future feature should allow the learner to ask questions such as:

> "Where is this concept covered in Eurocode?"

or:

> "What does the relevant standard say about this?"

However, engineering standards must be treated carefully.

Do NOT fabricate clauses, equations, section numbers, or standards references.

Where standards are eventually incorporated, the system should use authoritative/source-backed references.

The AI should distinguish between:

* fundamental structural mechanics
* educational explanation
* design-code requirements
* professional engineering judgment

The application must clearly communicate that it is an educational tool and not a professional design-verification system.

---

# 7. Version 1 Engineering Scope

Do NOT attempt to support every structural configuration immediately.

Version 1 should begin with a deliberately small deterministic engineering domain.

Initial supported model:

## Simply Supported Beam

A beam with:

* one pinned support
* one roller support
* configurable span
* one downward point load

The user should be able to modify:

* beam span
* point-load magnitude
* point-load position

The initial engineering engine should calculate:

* left reaction
* right reaction
* shear force
* bending moment
* maximum bending moment

The system should generate:

* beam visualization
* load visualization
* support reactions
* shear-force diagram
* bending-moment diagram

---

# 8. Initial Mathematical Model

For a simply supported beam with:

* span = L
* point load = P
* distance from left support to load = a
* distance from load to right support = b
* L = a + b

The support reactions are:

RA = P(b/L)

RB = P(a/L)

The bending moment immediately beneath the point load is:

Mmax = RA × a

or equivalently:

Mmax = RB × b

For the initial symmetric test case:

L = 6 m
P = 10 kN
a = 3 m
b = 3 m

Expected:

RA = 5 kN
RB = 5 kN
Mmax = 15 kNm

At the supports:

M = 0

At the point load:

M = 15 kNm

The implementation must be validated against known analytical cases.

Do not assume that a visually plausible diagram means the engineering engine is correct.

---

# 9. Future Engineering Expansion

These are possible future stages, NOT requirements for Version 1.

Potential expansion sequence:

### Stage 2

* uniformly distributed loads
* multiple point loads
* applied moments
* overhanging beams

### Stage 3

* cantilever beams
* fixed supports
* additional loading configurations

### Stage 4

* deflection
* elastic properties
* section properties

### Stage 5

* more advanced analytical methods
* potentially stiffness/matrix-based analysis
* more complex structural systems

Do not implement these unless explicitly instructed.

---

# 10. User Interaction Concept

The primary interaction should be visual.

The user should see something conceptually similar to:

```text
        ↓ P
────────────────────────
▲                      ○
A                      B

<--------- L ---------->
```

The user should be able to interact with the load position directly where practical.

Changing the load position should immediately update:

* reactions
* shear diagram
* moment diagram
* relevant numerical values

Changing load magnitude should produce the same immediate relationship.

The system should make cause and effect visually obvious.

---

# 11. AI Interaction Concept

Do NOT initially implement a generic chat window and call it the AI feature.

The AI should eventually be contextual.

Possible interactions include:

### Explain

User selects a diagram/result and asks for an explanation.

### Why?

The user asks why the current behavior occurs.

### Show the mathematics

The system explains the mathematical relationship behind the current result.

### Try an experiment

The AI suggests a controlled change to the model.

Example:

> "Try moving the load closer to the left support and observe what happens to the two reactions."

### Compare

The learner can compare two configurations and ask what changed and why.

These are design directions for the educational layer.

Do not implement all of them in Version 1 unless the implementation remains appropriately simple.

---

# 12. Technical Architecture Principle

Keep the architecture modular.

At minimum, conceptually separate:

### Engineering Core

Responsible for:

* beam model
* loads
* reactions
* shear
* moment
* validation

### Visualization Layer

Responsible for:

* beam rendering
* supports
* loads
* reactions
* SFD
* BMD

### Interaction Layer

Responsible for:

* user inputs
* dragging/manipulation
* state updates

### AI Layer

Responsible for:

* contextual explanations
* educational dialogue
* interpretation of calculated results

The AI layer must not become a dependency of the deterministic engineering calculations.

The application should still calculate correctly if the AI service is completely unavailable.

---

# 13. Testing Philosophy

This is engineering software, even though it is educational.

Every engineering calculation implemented must have automated tests.

Tests should include known analytical cases.

At minimum, test:

1. Symmetric central point load.
2. Point load closer to the left support.
3. Point load closer to the right support.
4. Different load magnitudes.
5. Different spans.
6. Appropriate boundary conditions.

For example:

Input:

L = 6 m
P = 10 kN
a = 3 m

Expected:

RA = 5 kN
RB = 5 kN
Mmax = 15 kNm

The software should also verify fundamental equilibrium relationships where appropriate.

Do not consider a feature complete until its engineering calculations are tested.

---

# 14. Important Constraint: Do Not Overbuild

This is a critical instruction.

Do NOT automatically introduce:

* user authentication
* databases
* cloud infrastructure
* payment systems
* analytics
* social features
* 3D graphics
* BIM
* CAD functionality
* complex backend services
* unnecessary microservices
* unnecessary state-management frameworks
* advanced AI agents
* complex design-code engines

unless they are specifically justified and requested.

Prefer the simplest architecture that can reliably support the product.

---

# 15. Product Positioning

Do not treat originality as the primary objective.

Interactive structural-analysis tools already exist.

That is acceptable.

This project is not attempting to claim that calculating beam diagrams is a novel invention.

The product's value should instead come from improving the existing concept through:

* accessibility
* interaction
* educational clarity
* contextual AI explanation
* experimentation
* openness/flexibility where practical
* low friction
* clean UX
* transparent calculations

The goal is:

> **Make learning structural analysis easier and more intuitive.**

Not:

> "Invent structural analysis software."

---

# 16. Portfolio Principle

The portfolio value should emerge naturally from building something useful.

Do not add artificial "AI features" merely to make the project appear more impressive.

A technically simple but well-designed engineering learning tool is preferable to an unnecessarily complicated AI application.

The project should demonstrate:

> Civil engineering understanding + computational thinking + software development + responsible AI integration.

---

# 17. Development Process

Do NOT immediately attempt to build the entire product.

First inspect the current workspace/environment.

Then propose a concise implementation plan for Version 1.

Before making substantial architectural decisions, explain:

1. Proposed technology stack.
2. Why it is appropriate.
3. Project structure.
4. How the deterministic engineering engine will be isolated.
5. How the visualization will work.
6. How automated testing will work.

Then implement incrementally.

After each major milestone:

1. Run the relevant tests.
2. Inspect the result.
3. Fix failures.
4. Verify that previous functionality remains intact.
5. Report what was changed.

Do not silently introduce large scope changes.

---

# 18. First Milestone

For the FIRST implementation milestone, do NOT build the complete application.

Build only:

> **A tested deterministic structural-analysis engine for a simply supported beam carrying one downward point load.**

It should accept:

* span L
* point-load magnitude P
* load position a

and return:

* RA
* RB
* shear-force representation
* bending-moment representation
* maximum bending moment

Create automated tests using known analytical cases.

Once the engineering core is verified, stop and report the result.

Do not proceed automatically into AI, authentication, deployment, advanced visualization, or additional structural cases.

---

# 19. Working Relationship

You are the implementation engineer.

The product direction is controlled by the project owner.

You have freedom to make reasonable technical implementation decisions, but you must not redefine the product's purpose.

When you encounter ambiguity:

* make the smallest reasonable assumption where possible;
* document the assumption;
* avoid expanding scope;
* ask for clarification when the ambiguity materially affects engineering correctness or product direction.

If you believe a proposed feature is unnecessary, say so.

If you believe a technical approach creates unnecessary complexity, recommend a simpler alternative.

If you discover a potential engineering error in the specification, flag it before implementing it.

Do not blindly follow instructions that would produce mathematically or physically incorrect engineering behavior.

---

# 20. Definition of Success

Version 1 is successful when a learner can open the application, create a simple beam problem, change its loading, observe the corresponding shear and bending-moment behavior, and understand the relationship between their input and the structural response.

The software does not need to be comprehensive.

It needs to be:

**correct, understandable, interactive, useful, and complete within its deliberately limited scope.**

Begin by inspecting the workspace and determining the simplest appropriate implementation strategy.

Do not begin by building features outside the first milestone.
