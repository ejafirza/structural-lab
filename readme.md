# Structural Lab

[![CI](https://github.com/ejafirza/structural-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/ejafirza/structural-lab/actions/workflows/ci.yml)

**An interactive beam lab for learning structural analysis.** Change the loads or supports and see the beam’s reactions, shear force, bending moment, and deflected shape respond.

> **Hosted demo setup is pending.** This repository has a GitHub Pages workflow; follow the setup steps below before sharing an online demo link.

## Try the lab

Once published, the browser demo opens with a 6 m span and a 10 kN load in the middle. It needs no account, download, or setup.

1. Drag the load arrow along the beam and watch the results and diagrams change.
2. Click a support to try a different support type.
3. Open **Model** to add a point or distributed load. Try a **Snow drift** preset.
4. Choose **How?** on a result to see its worked calculation. Select **Reset** to start over.

| Point load | Distributed load | Triangular load |
|---|---|---|
| ![Beam with a movable point load and analysis diagrams](docs/screenshot-point.png) | ![Beam with a distributed load and analysis diagrams](docs/screenshot-udl.png) | ![Beam with a triangular load and analysis diagrams](docs/screenshot-triangular.png) |

## Run it on your computer (optional)

You only need this if you want to run or change the project yourself.

1. Install [Node.js 18 or newer](https://nodejs.org/).
2. Clone the project and start the app:

```bash
git clone https://github.com/ejafirza/structural-lab.git
cd structural-lab
npm start
```

The app opens at <http://127.0.0.1:8000>. Stop it by pressing **Ctrl+C** in the terminal. There are no third-party packages to install; `npm install` is not needed.

To run the automated checks, use `npm test`.

## Educational use only

Structural Lab is for learning and exploration. It is **not** a professional structural design or safety-verification tool. Always have real structures checked by a qualified professional.

## License

[MIT](LICENSE)
