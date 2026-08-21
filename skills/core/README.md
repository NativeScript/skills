# Core runtime & views

`@nativescript/core` fundamentals that apply to every flavor: custom views and the common/ios/android file split, `Property` and CSS plumbing, layouts, lifecycle, and JavaScript-runtime quirks (no `Intl` on iOS, marshalling rules that cut across platforms).

**Belongs here:** anything a plain-TypeScript NativeScript app needs that is not specific to one platform's frameworks or one frontend flavor.

**Doesn't:** UIKit/SceneKit/Java specifics (→ `ios/`, `android/`), framework wiring (→ `frontend/<flavor>/`), visual patterns (→ `ui/`).

**Naming:** `ns-<topic>`.
