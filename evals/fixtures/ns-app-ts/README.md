# ns-app-ts

Stock `ns create ns-app-ts --ts` output (NativeScript CLI 9.1.0-rc.0, 2026-08), minus `node_modules` and `package-lock.json`, with two deliberate edits:

* `@nativescript/core` pinned to `9.1.0-rc.3` — the version line the current skills are verified against (several teach 9.1-only APIs such as `androidOverflowEdge`).
* `@nativescript/tailwind` + `tailwindcss` added as devDependencies so styling tasks can assume a Tailwind-capable app (the stock template does not ship them).
