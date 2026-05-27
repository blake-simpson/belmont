// File-extension entry-point for pi --extension loading.
//
// Pi 0.75.5's `loadExtensionFromFactory` accepts an `extensionPath`
// parameter (the 5th arg) but the public `pi.main({ extensionFactories
// })` shape hard-codes that path to `<inline:${index + 1}>` (see
// `dist/core/resource-loader.js:607`). That display string surfaces
// in pi's `[Extensions]` startup banner AND in every Extension-
// shortcut-conflict diagnostic — a recognisable `<inline:1>` flood
// that Blake hit during the M11 §18 dogfood.
//
// Fix (M11 §18): instead of passing the factory in-process, write a
// tiny re-export file alongside the rest of the dist tree and have
// the launcher hand pi `--extension <path-to-this-file>`. Pi's
// `loadExtension(extensionPath, …)` then sets `extension.path` to
// the resolved file path; the basename (`belmont.js`) flows through
// pi's source-label rendering. The banner reads `belmont.js` (or the
// compacted form via `formatExtensionDisplayPath`) instead of
// `<inline:1>`.
//
// `loadExtensionModule()` calls `jiti.import(path, { default: true
// })`, so the default export MUST be the factory function. The
// re-export below satisfies that contract while keeping the actual
// factory body in `extension.ts` (where the M3 → M10 wiring lives).
//
// Why a separate file rather than renaming `extension.ts` →
// `belmont.ts`: keeping the factory definition under the
// long-standing `extension.ts` name preserves every test import
// (`import { belmontExtension } from "./extension"`) and the
// M3 → M10 commit history. `belmont.ts` is a thin entry point that
// exists ONLY to give pi a friendlier filename to display.

export { belmontExtension as default } from "./extension.js";
