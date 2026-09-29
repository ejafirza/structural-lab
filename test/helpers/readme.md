# test/helpers

Shared test fixtures. Import from a test file like:

```js
import { FakeNode, FakeText, makeDoc, bootApp } from './helpers/fake-dom.js';
```

- `FakeNode` — minimal DOM node: attributes, classList, dataset, event
  bubbling to the owner document, focus tracking, `closest`/`querySelectorAll`
  for the attribute selectors the UI uses, and `findAll` for assertions.
- `FakeText` — text-only node for `createTextNode`.
- `makeDoc()` — document with every id the app references, body/topbar
  structure for teaching-layer code, beam context menu preassembled.
  Returns `{ doc, elements }`.
- `bootApp()` — `makeDoc` plus a fresh `ui/app.js` import (unique query string
  per boot defeats the module singleton) and a `window` shim with `matchMedia`.
  Returns `{ doc, elements, setDesktop }`.

The per-test copies this module replaces were diverging: ui-m8's node had
event bubbling and dataset; ui-m3's had neither; ui-m9 needed `body` and
`createTextNode`. One superset now serves all of them.
