// Single source of truth for the skillgrade suite. `node evals/build.mjs`
// renders this into evals/suite/eval.yaml (skills on) and
// evals/baseline/eval.yaml (skills off); evals/graders/check.mjs runs the
// `checks` of one task. Every skill needs exactly one task here (lint enforces it).
//
// Rules for a task:
//  * `skill` is the skill's name (directory basename). The category path is
//    resolved by lib/skills.mjs, so moving a skill between categories needs no
//    change here.
//  * `instruction` never names the skill — discovery is part of what is graded.
//    Write what a real developer would type, and name the output files so the
//    checks are unambiguous.
//  * `workspace` lists fixtures to copy in, with `src` relative to the repo root
//    (see evals/fixtures/README.md).
//  * `checks` grade OUTCOMES in the workspace — APIs the skill teaches, files,
//    pinned versions — never steps. Each check is one of:
//      { name, weight?, file,  match?, notMatch? }   regex against one file
//      { name, weight?, files }                       all paths exist
//      { name, weight?, dir,   match? | notMatch? }   any file under dir matches
//      { name, weight?, custom: async ({ ws, read, sh, runTs, grepDir, fixtureFile }) => ({ passed, message }) }
//    `runTs(code)` executes a TypeScript snippet inside the workspace (Node ≥ 22.7)
//    and returns the JSON its last line prints — use it to run the agent's code
//    against reference values when the skill's output can run headless.
//  * `rubric` feeds an llm_rubric grader (needs ANTHROPIC/GEMINI/OPENAI key).

const NS_APP = { src: 'evals/fixtures/ns-app-ts', dest: '.' };
const fx = (name) => ({ src: `evals/fixtures/${name}`, dest: '.' });

// Extract the body of a top-level `export function <name>` from source text.
function fnBody(src, name) {
  const m = src?.match(new RegExp(`function ${name}[^{]*{([\\s\\S]*?)\\n}`));
  return m ? m[1] : null;
}

export const tasks = [
  {
    name: 'android-edge-to-edge',
    skill: 'ns-android-edge-to-edge',
    instruction: `On Android 15 (API 35) this app's bottom TabView strip looks wrong: the bar's surface colour stops at a hard line and the page canvas colour fills the gesture-nav strip below it. Separately, compose-page's docked bottom bar (the "Attach / Send" row) sits underneath the gesture pill.

Fix both without adding any plugin:
1. Make the tab bar's colour run seamlessly to the physical bottom edge (app/app-root.xml and app/shell-page.xml). Headers must stay clear of the status bar.
2. Implement onRootLoaded in app/compose-page.ts so the docked bottom bar clears the gesture-nav area (adjust app/compose-page.xml if needed).`,
    workspace: [NS_APP, fx('edge-to-edge')],
    checks: [
      { name: 'root skips bottom inset only', weight: 3, file: 'app/app-root.xml', match: /androidOverflowEdge="bottom"/, notMatch: /all-but-bottom/ },
      { name: 'shell wrapper passes bottom inset through', weight: 2, file: 'app/shell-page.xml', match: /androidOverflowEdge="bottom"/ },
      { name: 'compose page reads the nav inset from the window', weight: 3, file: 'app/compose-page.ts', match: /navigationBars\(\)|getSystemWindowInsetBottom\(\)/ },
      { name: 'device px converted to dip', weight: 2, file: 'app/compose-page.ts', match: /toDeviceIndependentPixels/ },
      { name: 'no deprecated nav-bar scrim colouring', weight: 1, dir: 'app', notMatch: /setNavigationBarColor/ },
    ],
    rubric: `- Did the agent put androidOverflowEdge="bottom" (skip-bottom semantics) on the ROOT and the shell wrapper, rather than inverted values like all-but-bottom or none?
- Did compose-page read insets directly off the window (WindowMetrics or getRootWindowInsets) instead of waiting for an androidOverflowInset event that never fires on page layouts?
- Is only the stable navigation inset padded (not the IME inset)?`,
  },

  {
    name: 'android-modal-insets',
    skill: 'ns-android-window-insets',
    instruction: `The settings modal (app/settings-modal.xml, opened from main-page with fullscreen: true) renders horribly on Android only: every Label's box is ~50dp taller than its text, there are big phantom gaps between stacked labels, the emoji glyphs get pushed out of view, and content collides with the status bar. The identical markup is perfect on iOS and in the main window.

Fix it properly: create app/modal-insets.ts exporting a reusable helper that configures the modal correctly from its loaded event, wire it up in app/settings-modal.ts, and add any attribute needed in app/settings-modal.xml. The modal's own padding already keeps content away from the screen edges, so nothing inside needs edge-anchoring.`,
    workspace: [NS_APP, fx('window-insets')],
    checks: [
      { name: 'helper walks up to the dialog-fragment owner', weight: 3, file: 'app/modal-insets.ts', match: /_dialogFragment/ },
      { name: 'modal root set to dont-apply', weight: 2, dir: 'app', match: /androidOverflowEdge\s*=?\s*['"]?dont-apply/ },
      { name: 'insets zeroed', weight: 2, dir: 'app', match: /inset\.top\s*=\s*0/ },
      { name: 'insets marked consumed', weight: 3, dir: 'app', match: /topConsumed\s*=\s*true/ },
      { name: 'wired from settings-modal', weight: 2, file: 'app/settings-modal.ts', match: /modal-insets/ },
      { name: 'android-guarded', weight: 1, file: 'app/modal-insets.ts', match: /__ANDROID__/ },
    ],
    rubric: `- Did the agent identify that the dialog window is edge-to-edge with no inset consumer, so every Label pads itself?
- Does the helper find the true modal root (the view owning _dialogFragment/_bottomSheetFragment) rather than assuming the template root is it?
- Are both the edge values zeroed AND the consumed flags set?`,
  },

  {
    name: 'ios-scroll-under-bars',
    skill: 'ns-ios-scroll-under-bars',
    instruction: `On iOS this app's feed (app/main-page.xml) stops at a hard horizontal line above the floating tab bar / home indicator instead of flowing underneath it — the list looks boxed-in and never reaches the bottom of the screen.

Fix app/main-page.xml (XML-only change) so the content scrolls beneath the floating chrome to the physical bottom edge, while the "Last item" row can still be scrolled fully clear of the bar.`,
    workspace: [NS_APP, fx('scroll-under-bars')],
    checks: [
      {
        name: 'scroll viewport allowed to overflow the safe area', weight: 4,
        custom: async ({ read }) => {
          const s = read('app/main-page.xml') || '';
          const tag = s.match(/<ScrollView[^>]*>/)?.[0] || '';
          const passed = !!tag && !/iosOverflowSafeArea="false"/.test(tag);
          return { passed, message: passed ? 'viewport overflows' : 'ScrollView still clipped (or missing)' };
        },
      },
      {
        name: 'clearance padding inside the scroll content', weight: 3,
        custom: async ({ read }) => {
          const s = read('app/main-page.xml') || '';
          const pad = s.match(/paddingBottom="(\d+)"/);
          const cls = s.match(/class="[^"]*pb-(\d+)/);
          const passed = (pad && Number(pad[1]) >= 60) || (cls && Number(cls[1]) >= 16);
          return { passed, message: passed ? 'content has bottom clearance' : 'no meaningful bottom padding inside content' };
        },
      },
      { name: 'content intact', weight: 1, file: 'app/main-page.xml', match: /Last item/ },
      { name: 'no margin hacks on the viewport', weight: 1, file: 'app/main-page.xml', notMatch: /<ScrollView[^>]*margin/ },
    ],
    rubric: `- Did the agent remove iosOverflowSafeArea="false" from the ScrollView (accepting the default overflow) instead of trying padding/margin/background tricks on the viewport?
- Did it add generous bottom padding INSIDE the scroll content so the last item can rest above the floating bar?`,
  },

  {
    name: 'ios-safe-area-smudge',
    skill: 'ns-ios-safe-area-smudge',
    instruction: `Two iOS-only rendering bugs on the agenda page (app/main-page.xml):
1. While scrolling, a status dot occasionally smears into a tall coloured pill and a 1px divider inflates into a full-width gray band near the bottom of the screen; scrolling on fixes it.
2. With short content, the "Library" card at the bottom renders with a long empty band below its last row at load.

Fix app/main-page.xml. Constraints: don't restructure the layout, and the feed must still scroll under the floating chrome — do not clip the scroll viewport itself.`,
    workspace: [NS_APP, fx('safe-area-smudge')],
    checks: [
      { name: 'card container: expansion disabled for the subtree', weight: 3, file: 'app/main-page.xml', match: /iosOverflowSafeAreaEnabled="false"/ },
      {
        name: 'decorative leaves opted out', weight: 3,
        custom: async ({ read }) => {
          const s = read('app/main-page.xml') || '';
          const n = (s.match(/iosOverflowSafeArea="false"/g) || []).length;
          return { passed: n >= 3, message: `${n} views opted out (need the standalone dots/dividers/rows)` };
        },
      },
      {
        name: 'scroll viewport NOT clipped', weight: 3,
        custom: async ({ read }) => {
          const s = read('app/main-page.xml') || '';
          const tag = s.match(/<ScrollView[^>]*>/)?.[0] || '';
          const passed = !!tag && !/iosOverflowSafeArea(Enabled)?="false"/.test(tag);
          return { passed, message: passed ? 'viewport still overflows' : 'viewport was clipped — trades the smudge for a hard cut' };
        },
      },
      { name: 'no scroll-offset margin hacks', weight: 1, file: 'app/main-page.xml', notMatch: /<ScrollView[^>]*margin/ },
    ],
    rubric: `- Did the agent recognise the safe-area expansion mechanism (edge lands on the boundary → view stretched to the physical edge) rather than calling it a paint glitch?
- iosOverflowSafeAreaEnabled="false" on the card container (load-time variant) AND iosOverflowSafeArea="false" on the standalone small views?
- Crucially: nothing disabled on the ScrollView itself.`,
  },

  {
    name: 'navigation-transitions',
    skill: 'ns-navigation-transitions',
    instruction: `Review app/navigation.ts. Complaints: pushes look web-like and flat; the iOS edge-swipe back gesture stutters and looks detached from the nav bar; Android's predictive back preview looks wrong; and after logout the user can still navigate back into the app.

Fix all three functions so navigation looks and behaves fully native on both platforms. Keep the exported function signatures.`,
    workspace: [NS_APP, fx('navigation-transitions')],
    checks: [
      {
        name: 'user-initiated push uses the platform default transition', weight: 3,
        custom: async ({ read }) => {
          const body = fnBody(read('app/navigation.ts'), 'openDetail');
          const passed = body != null && !/transition\s*:/.test(body) && !/animated\s*:\s*false/.test(body);
          return { passed, message: passed ? 'no transition override' : 'openDetail still overrides the platform transition (or suppresses animation)' };
        },
      },
      { name: 'no canned name transitions anywhere', weight: 2, file: 'app/navigation.ts', notMatch: /slideLeft|flipRight|slideRight|slideTop|slideBottom/ },
      {
        name: 'startup navigation not animated', weight: 2,
        custom: async ({ read }) => {
          const body = fnBody(read('app/navigation.ts'), 'bootstrapFeed');
          const passed = body != null && /animated\s*:\s*false/.test(body) && !/transition\s*:/.test(body);
          return { passed, message: passed ? 'silent bootstrap' : 'bootstrapFeed should navigate with animated: false and no transition' };
        },
      },
      { name: 'logout clears history', weight: 2, file: 'app/navigation.ts', match: /clearHistory\s*:\s*true/ },
      {
        name: 'logout not animated', weight: 1,
        custom: async ({ read }) => {
          const body = fnBody(read('app/navigation.ts'), 'logout');
          const passed = body != null && /animated\s*:\s*false/.test(body);
          return { passed, message: passed ? 'world-switch is silent' : 'logout should use animated: false' };
        },
      },
    ],
    rubric: `- Did the agent DELETE the transition overrides on the ordinary push (rather than picking a "better" custom transition)?
- Are explicit options used only to suppress animation on the navigations the user never performs (bootstrap, logout reset)?`,
  },

  {
    name: 'ios-corespotlight',
    skill: 'ns-ios-corespotlight',
    instruction: `Add Spotlight search indexing to this iOS app. Create app/spotlight.ts exporting:
- reindex(items: Array<{ id: string; kind: string; title: string; description: string; keywords: string[] }>): rebuilds the on-device index — removes everything previously indexed, then indexes the given items. Indexed items must not silently disappear after 30 days.
- spotlightDeepLink(uniqueIdentifier: string): string — maps an indexed item's identifier back to a myapp:// URL for tap-through routing.

reindex will be called with a few thousand items right after the data feed loads. The app must never freeze or become unresponsive during or after indexing. iOS only (no-op on Android). No plugins.`,
    workspace: [NS_APP],
    checks: [
      { name: 'collections materialized as real NSArrays', weight: 4, file: 'app/spotlight.ts', match: /NSMutableArray|NSArray\.arrayWithArray/ },
      { name: 'completion handlers hop to the main thread', weight: 3, file: 'app/spotlight.ts', match: /dispatchToMainThread/ },
      { name: 'rebuild flow (delete all, then index)', weight: 2, file: 'app/spotlight.ts', match: /deleteAllSearchableItems/ },
      { name: 'no 30-day expiry', weight: 2, file: 'app/spotlight.ts', match: /distantFuture/ },
      { name: 'keywords materialized too', weight: 2, file: 'app/spotlight.ts', match: /arrayWithArray/ },
      { name: 'deep-link mapping present', weight: 1, file: 'app/spotlight.ts', match: /myapp:\/\// },
      { name: 'platform-guarded', weight: 1, file: 'app/spotlight.ts', match: /__APPLE__|__IOS__|isIOS|__ANDROID__/ },
    ],
    rubric: `- Does the code avoid handing live JS arrays to indexSearchableItems (ArrayAdapter + dispatch_apply = V8 isolate deadlock)? Materializing into NSMutableArray/NSArray on the JS thread is the required move, including the nested keywords array on the attribute set.
- Are further native calls inside CoreSpotlight completion handlers deferred via Utils.dispatchToMainThread?
- Is expirationDate set to NSDate.distantFuture?`,
  },

  {
    name: 'ios-widgets-live-activity',
    skill: 'ns-ios-widgets',
    instruction: `Our Live Activity / Dynamic Island renders completely empty on device. System logs show:
  WidgetRenderer: Archive was nil. LiveActivity will be empty
and earlier:
  SwiftUI: No image named 'logo' found in asset catalog for .../SharedWidget_SharedWidget.bundle

The brand image lives at Shared_Resources/iOS/SharedWidget/Sources/SharedWidget/Resources/logo.png (a 1024×1024 master asset) and is declared via resources: [.process("Resources")] in Package.swift.

Fix Shared_Resources/iOS/SharedWidget/Sources/SharedWidget/WidgetAssets.swift so BrandLogo renders reliably inside the widget extension and can never blank the whole activity again, and add a short comment in the file stating what must happen to the 1024px asset itself.`,
    workspace: [NS_APP, fx('widgets-live-activity')],
    checks: [
      { name: 'image loaded by file path/bytes (not named lookup)', weight: 3, file: 'Shared_Resources/iOS/SharedWidget/Sources/SharedWidget/WidgetAssets.swift', match: /UIImage\(contentsOfFile|CGImageSourceCreateWith(URL|Data)/ },
      { name: 'resource path resolved from the bundle', weight: 2, file: 'Shared_Resources/iOS/SharedWidget/Sources/SharedWidget/WidgetAssets.swift', match: /path\(forResource|url\(forResource/ },
      { name: 'no named asset-catalog lookup', weight: 2, file: 'Shared_Resources/iOS/SharedWidget/Sources/SharedWidget/WidgetAssets.swift', notMatch: /Image\(\s*"logo"\s*,\s*bundle/ },
      { name: 'no fatalError-prone Bundle.module', weight: 2, custom: async ({ read }) => {
        const s = read('Shared_Resources/iOS/SharedWidget/Sources/SharedWidget/WidgetAssets.swift') || '';
        const code = s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        const used = /Bundle\.module/.test(code);
        return { passed: !used, message: used ? 'Bundle.module in code can fatalError the extension process' : 'clean (comments ignored)' };
      } },
      { name: 'graceful fallback instead of an empty slot', weight: 2, file: 'Shared_Resources/iOS/SharedWidget/Sources/SharedWidget/WidgetAssets.swift', match: /Text\(/ },
      { name: 'UIKit import guarded for macOS type-checking', weight: 1, file: 'Shared_Resources/iOS/SharedWidget/Sources/SharedWidget/WidgetAssets.swift', match: /#if canImport\(UIKit\)/ },
      { name: 'asset must be pre-resized (archive size limit)', weight: 2, file: 'Shared_Resources/iOS/SharedWidget/Sources/SharedWidget/WidgetAssets.swift', match: /sips|resiz|downsiz|96|scale.*3x|3x.*size/i },
    ],
    rubric: `- Does the fix load the PNG bytes directly (bundle path → UIImage(contentsOfFile:) → Image(uiImage:)) instead of any named lookup, which only consults compiled asset catalogs that SPM .process() never produces?
- Is the SPM resource bundle located by candidate URLs with a nil fallback (never Bundle.module, which fatalErrors)?
- Does the comment explain the ActivityKit archive size limit — the 1024px master must be pre-resized (~3× its largest display size, e.g. sips -Z 96) because .resizable().frame() does not shrink what gets archived?`,
  },

  {
    name: 'unit-testing-setup',
    skill: 'ns-unit-testing',
    instruction: `Set up on-device unit tests for this app using the current NativeScript test runner (Karma is deprecated — do not add any karma packages). Configure the project so \`ns test ios\` / \`ns test android\` work:
- add the runner's config file(s) at the project root,
- update package.json with the packages the runner needs, each in the correct dependency section,
- write app/tests/date-utils.spec.ts covering minutesBetween, isSameDay and formatDuration from app/date-utils.ts — include formatDuration's 0-hour, exact-hour and hours+minutes cases.`,
    workspace: [NS_APP, fx('unit-testing')],
    checks: [
      { name: 'vitest config with the NativeScript pool plugin', weight: 3, file: 'vitest.config.mts', match: /nativeScript\s*\(/ },
      { name: 'plugin imported from the runner package', weight: 2, file: 'vitest.config.mts', match: /@nativescript\/unit-test-runner/ },
      { name: 'platform taken from NS_PLATFORM', weight: 1, file: 'vitest.config.mts', match: /NS_PLATFORM/ },
      { name: 'runner v5 in devDependencies', weight: 2, custom: async ({ read }) => {
        const pkg = JSON.parse(read('package.json') || '{}');
        const v = pkg.devDependencies?.['@nativescript/unit-test-runner'];
        return { passed: /5|\^5|~5/.test(v || ''), message: v ? `devDep ${v}` : 'missing from devDependencies' };
      } },
      { name: 'vitest 4 in devDependencies', weight: 1, custom: async ({ read }) => {
        const pkg = JSON.parse(read('package.json') || '{}');
        const v = pkg.devDependencies?.vitest;
        return { passed: !!v, message: v ? `vitest ${v}` : 'vitest missing from devDependencies' };
      } },
      { name: 'websockets bridge is a REGULAR dependency (ships native code)', weight: 2, custom: async ({ read }) => {
        const pkg = JSON.parse(read('package.json') || '{}');
        const v = pkg.dependencies?.['@valor/nativescript-websockets'];
        return { passed: !!v, message: v ? `dependency ${v}` : 'missing from dependencies (devDependencies does not get native code wired)' };
      } },
      { name: 'no karma anywhere', weight: 1, file: 'package.json', notMatch: /karma/ },
      { name: 'spec imports from vitest', weight: 2, file: 'app/tests/date-utils.spec.ts', match: /from ['"]vitest['"]/ },
      { name: 'spec covers formatDuration cases', weight: 1, file: 'app/tests/date-utils.spec.ts', match: /formatDuration/ },
    ],
    rubric: `- Did the agent set up the Vitest-based v5 runner (vitest.config.mts with nativeScript() plugin) rather than the deprecated Karma flow?
- Is @valor/nativescript-websockets a regular dependency (native code) while the runner/vitest are devDependencies?
- Do the specs use plain vitest imports (describe/it/expect)?`,
  },

  {
    name: 'snippets-search-tool',
    skill: 'ns-snippets',
    instruction: `There's a public catalog of NativeScript code snippets with a JSON API. Create scripts/snippets.mjs (plain Node, no dependencies) with two subcommands:
- search <term> [--category <token>] — prints each matching snippet's title, slug and public page URL, following pagination until the catalog is exhausted;
- show <slug> — fetches that one snippet and prints its title and code.
Exit non-zero with a clear message when nothing matches.`,
    workspace: [NS_APP],
    checks: [
      { name: 'correct API base', weight: 3, custom: async ({ read }) => {
        const s = read('scripts/snippets.mjs') || '';
        const ok = /snippets\.nativescript\.org/.test(s) && /\/api\/snippets/.test(s);
        return { passed: ok, message: ok ? 'hits the snippets API' : 'must call https://snippets.nativescript.org/api/snippets' };
      } },
      { name: 'cursor pagination followed', weight: 3, file: 'scripts/snippets.mjs', match: /nextCursor/ },
      { name: 'cursor passed back as query param', weight: 1, file: 'scripts/snippets.mjs', match: /cursor=|searchParams\.(set|append)\(\s*['"]cursor/ },
      { name: 'category filter supported', weight: 1, file: 'scripts/snippets.mjs', match: /category=|searchParams\.(set|append)\(\s*['"]category/ },
      { name: 'single-snippet endpoint used for show', weight: 2, file: 'scripts/snippets.mjs', match: /api\/snippets\/\$\{|api\/snippets\/'\s*\+|api\/snippets\/"\s*\+/ },
      { name: 'no dependencies', weight: 1, file: 'scripts/snippets.mjs', notMatch: /axios|node-fetch|undici/ },
    ],
    rubric: `- Does the script hit https://snippets.nativescript.org/api/snippets with search/category params and follow nextCursor pagination?
- Does show use GET /api/snippets/{slug} and print the code field?
- Native fetch only, no installed packages.`,
  },

  {
    name: 'code-built-toast',
    skill: 'ns-code-built-view-styling',
    instruction: `Create app/toast.ts exporting showToast(message: string): builds a small rounded toast card entirely in code (new StackLayout / new Label — no XML template) and presents it via the app's root layout, auto-dismissing after 2.5 seconds.

This app uses Tailwind (palette in tailwind.config.js). The toast must render correctly in BOTH light and dark mode, and must be reliable in release builds. No new dependencies.`,
    workspace: [NS_APP, fx('code-built-toast')],
    checks: [
      { name: 'presented via the root layout', weight: 2, file: 'app/toast.ts', match: /getRootLayout\(\)/ },
      { name: 'views built in code', weight: 1, file: 'app/toast.ts', match: /new (StackLayout|GridLayout|Label)\(/ },
      { name: 'inline colors from the palette', weight: 2, file: 'app/toast.ts', match: /new Color\(|backgroundColor\s*=\s*['"]#/ },
      { name: 'dark mode handled explicitly', weight: 3, file: 'app/toast.ts', match: /systemAppearance/ },
      {
        name: 'no purgeable utility classes from code', weight: 2,
        custom: async ({ read }) => {
          const s = read('app/toast.ts') || '';
          const bad = /className\s*[=+]\s*[^;\n]*(bg-|rounded-|text-|p-\d|m-\d)/.test(s);
          return { passed: !bad, message: bad ? 'Tailwind utilities referenced only from code can be purged from the emitted CSS' : 'clean' };
        },
      },
    ],
    rubric: `- Did the agent style the code-built view with inline properties (hex from the palette) instead of Tailwind utility class names that the compiler may purge when they appear only in code?
- Is the palette chosen at SHOW time via Application.systemAppearance() (not at module load)?`,
  },

  {
    name: 'composer-over-sheet',
    skill: 'ns-input-accessory-dialogs',
    instruction: `Bug on the chat page (app/chat-page.ts): when the filters page-sheet opens on iOS, the keyboard-docked composer bar stays visible floating ON TOP of the sheet; and after swipe-down dismissing the sheet, the bar sometimes never comes back.

Fix it centrally in app/dialogs.ts and app/chat-page.ts so every current and future sheet behaves: the bar must slide away as any sheet opens and return when it closes (including swipe-down dismissal, where no button code runs). Do not hide the composer view and do not fight first-responder from page code. The installed @nativescript/input-accessory exposes suspend() and restore() on InputAccessoryManager.`,
    workspace: [NS_APP, fx('input-accessory-dialogs')],
    checks: [
      { name: 'accessory suspended around sheets', weight: 3, dir: 'app', match: /\.suspend\(\)/ },
      { name: 'accessory restored on close', weight: 3, dir: 'app', match: /\.restore\(\)/ },
      { name: 'restore wired to the close path (covers swipe dismiss)', weight: 2, file: 'app/dialogs.ts', match: /closeCallback/ },
      { name: 'no first-responder fighting', weight: 2, dir: 'app', notMatch: /resignFirstResponder/ },
      { name: 'no visibility hacks on the composer', weight: 1, dir: 'app', notMatch: /visibility\s*=\s*['"](collapse|hidden)/ },
    ],
    rubric: `- Is the suspend/restore pair routed through the central dialog service (every sheet), not sprinkled at one call site?
- Does restore fire from the modal's closeCallback so swipe-down dismissal also restores the bar?
- Nothing tries resignFirstResponder or hiding the composer view — both lose to the plugin's auto-restore.`,
  },

  {
    name: 'chat-composer',
    skill: 'ns-keyboard-input',
    instruction: `Build a chat screen for this app: app/chat-page.xml + app/chat-page.ts (module style, like main-page). Requirements:
- a single message input docked to the keyboard iMessage-style: it docks directly above the keyboard when open, rests at the bottom edge when closed, follows the interactive swipe-to-dismiss, and grows as the user types multiple lines;
- a scrolling message list above it and a circular send button next to the input;
- pressing return inserts a newline — only the send button submits;
- add whatever package the implementation needs to package.json;
- this screen will be routed OUTSIDE the app's tab shell — state why in a one-line comment in chat-page.ts.`,
    workspace: [NS_APP],
    checks: [
      { name: 'input-accessory dependency added', weight: 2, file: 'package.json', match: /@nativescript\/input-accessory/ },
      { name: 'composer input is a TextView (auto-grow needs it)', weight: 2, file: 'app/chat-page.xml', match: /<TextView/, notMatch: /<TextField/ },
      { name: 'accessory manager set up with all four views', weight: 3, file: 'app/chat-page.ts', match: /InputAccessoryManager[\s\S]*setup\s*\([\s\S]*inputContainer/ },
      { name: 'return key does not submit', weight: 2, file: 'app/chat-page.xml', notMatch: /returnKeyType="send"|returnPress/ },
      { name: 'single-line minHeight set', weight: 1, file: 'app/chat-page.xml', match: /minHeight/ },
      { name: 'height re-measured on text change and send', weight: 1, file: 'app/chat-page.ts', match: /updateAccessoryHeight/ },
      { name: 'cleanup on teardown', weight: 1, file: 'app/chat-page.ts', match: /cleanup\(\)/ },
      { name: 'tab-bar exclusion reason documented', weight: 1, file: 'app/chat-page.ts', match: /tab/i },
    ],
    rubric: `- Did the agent pick @nativescript/input-accessory (composer shape) rather than iqkeyboardmanager (form shape)?
- TextView (not TextField), minHeight on it, no returnKeyType="send"/returnPress wiring, updateAccessoryHeight on text change and after send, cleanup on unload?
- Does the comment explain that a docked composer must own the bottom edge, so the screen cannot show a tab bar?`,
  },

  {
    name: 'wrapped-label-gaps',
    skill: 'ns-line-height',
    instruction: `On both platforms, the wrapped Labels on app/main-page.xml (classes text-2xl / text-base / text-sm) render with huge vertical gaps between the wrapped lines of a single label — paragraph-like air inside one label. Single-line labels look fine. This app uses @nativescript/tailwind.

Fix the ROOT CAUSE so every current and future text-* label renders with normal native line rhythm — not by patching individual labels.`,
    workspace: [NS_APP, fx('line-height')],
    checks: [
      { name: 'fontSize scale replaced with plain sizes', weight: 4, file: 'tailwind.config.js', match: /fontSize\s*:\s*\{[^}]*base/s },
      { name: 'no lineHeight tuples remain', weight: 2, file: 'tailwind.config.js', notMatch: /lineHeight/ },
      {
        name: 'scale replaces (theme.fontSize), not merges (extend.fontSize)', weight: 2,
        custom: async ({ read }) => {
          const s = read('tailwind.config.js') || '';
          const extendBlock = s.match(/extend\s*:\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || s.match(/extend\s*:\s*\{[\s\S]*\}/)?.[0] || '';
          const inExtend = /fontSize/.test(extendBlock);
          const anywhere = /fontSize/.test(s);
          return { passed: anywhere && !inExtend, message: inExtend ? 'fontSize under extend merges and keeps the default tuples' : anywhere ? 'replaced at theme root' : 'no fontSize override' };
        },
      },
      { name: 'labels not patched individually', weight: 2, file: 'app/main-page.xml', notMatch: /leading-|line-height/ },
      { name: 'text-base utility still in use', weight: 1, file: 'app/main-page.xml', match: /text-base/ },
    ],
    rubric: `- Did the agent identify that NativeScript line-height is ADDITIVE spacing (not the web line box), so Tailwind's default fontSize tuples inject ~24dp of air into wrapped text?
- Is the fix a theme.fontSize replacement (plain dp strings) rather than sprinkling leading-* utilities per label?`,
  },

  {
    name: 'native-top-bar',
    skill: 'ns-top-nav',
    instruction: `Replace the hand-rolled header row on app/detail-page.xml with the platform's native top bar:
- system back behavior on both platforms — iOS keeps its native chevron and edge-swipe pop; Android shows a properly-sized (~24dp) back glyph that pops on tap;
- title "Checklist" (native truncation for long values);
- a right-side "Share" action;
- main-page stays headerless (it's a branded tab root).
Use app/app.css for any styling the bar items need.`,
    workspace: [NS_APP, fx('top-nav')],
    checks: [
      { name: 'native ActionBar declared', weight: 3, file: 'app/detail-page.xml', match: /<ActionBar/ },
      { name: 'NavigationButton for back', weight: 2, file: 'app/detail-page.xml', match: /<NavigationButton/ },
      { name: 'fake back row removed', weight: 2, file: 'app/detail-page.xml', notMatch: /‹ Back/ },
      {
        name: 'Android glyph sized like a toolbar icon', weight: 2,
        custom: async ({ read }) => {
          const css = read('app/app.css') || '';
          const xml = read('app/detail-page.xml') || '';
          const passed = /font-size:\s*24/.test(css) || /fontSize="24"/.test(xml) || /res:\/\//.test(xml);
          return { passed, message: passed ? 'explicit icon sizing' : 'font:// icons rasterize at CSS font-size — unset gives a ~12px speck' };
        },
      },
      { name: 'share action present', weight: 1, file: 'app/detail-page.xml', match: /<ActionItem[\s\S]*Share/ },
      { name: 'main page still headerless', weight: 1, file: 'app/main-page.xml', match: /actionBarHidden="true"/ },
    ],
    rubric: `- Native <ActionBar> as a top-level Page child (not inside the layout), with NavigationButton for back?
- Android: icon set (font:// or res://) with tap handler AND explicit sizing; iOS: icon left null so the system chevron survives, knowing iOS never fires the tap?
- No attempt to re-create the header synthetically.`,
  },

  {
    name: 'press-feedback',
    skill: 'ns-touch-animations',
    instruction: `Add consistent press feedback to this app: every tappable view should subtly scale (~0.97) on press with a platform-appropriate animation, configured ONCE for the whole app — not per view. Two exceptions on app/main-page.xml: the plain list rows must NOT animate at all, and the hero card should press more strongly (scale ~0.9). Files: app/app.ts, app/main-page.xml (+ app/main-page.ts if needed). Do not add touch event handlers for this.`,
    workspace: [NS_APP, fx('touch-animations')],
    checks: [
      { name: 'global tap animations enabled at bootstrap', weight: 3, file: 'app/app.ts', match: /enableGlobalTapAnimations\s*=\s*true/ },
      { name: 'global down/up animations configured', weight: 2, file: 'app/app.ts', match: /TouchManager\.animations\s*=/ },
      { name: 'rows opted out (singular property)', weight: 2, file: 'app/main-page.xml', match: /ignoreTouchAnimation="true"/, notMatch: /ignoreTouchAnimations/ },
      { name: 'hero uses a per-view override', weight: 2, dir: 'app', match: /touchAnimation/ },
      { name: 'no hand-rolled press animations', weight: 2, custom: async ({ read }) => {
        const xml = read('app/main-page.xml') || '';
        const ts = (read('app/main-page.ts') || '') + (read('app/app.ts') || '');
        const bad = /touch="/.test(xml) || /animate\s*\(\s*\{\s*scale/.test(ts);
        return { passed: !bad, message: bad ? 'manual touch handler / scale animation found — fights the global transform cache' : 'clean' };
      } },
    ],
    rubric: `- TouchManager.enableGlobalTapAnimations + TouchManager.animations set once in app.ts BEFORE Application.run?
- Rows opted out with the singular ignoreTouchAnimation (the plural silently no-ops)?
- Hero override via the touchAnimation property, not a touch handler?`,
  },

  {
    name: 'feed-store-events',
    skill: 'ns-observable-array-change-events',
    instruction: `Create app/feed-store.ts exporting a FeedStore class for a list screen, backed by the data structure NativeScript list controls bind to incrementally. API:
- items — the bindable collection
- add(item), removeAt(i), replaceAt(i, item)
- resort(compareFn) — MUST leave a bound ListView showing the new order (a plain in-place sort does not)
- clear() — one change notification, not N
- subscribe(cb) — cb receives { kind: 'reset' | 'patch', index, count, removed } for EVERY mutation above, including truncation via a length assignment from outside.
Copy any values you need out of the underlying change event — do not retain the event object.`,
    workspace: [NS_APP],
    checks: [
      { name: 'ObservableArray used', weight: 2, file: 'app/feed-store.ts', match: /ObservableArray/ },
      { name: 'splice action handled (covers length=)', weight: 3, file: 'app/feed-store.ts', match: /['"]splice['"]/ },
      { name: 'resort notifies (splice-replace or refresh, not bare sort)', weight: 3, custom: async ({ read }) => {
        const s = read('app/feed-store.ts') || '';
        const notifies = /splice\(\s*0\s*,/.test(s);
        const bareSort = /\.sort\(([^)]*)\)\s*;?\s*$/m.test(s) && !notifies;
        return { passed: notifies && !bareSort, message: notifies ? 'resort re-emits via splice' : 'ObservableArray.sort()/reverse() emit no change event' };
      } },
      { name: 'replaceAt uses setItem', weight: 1, file: 'app/feed-store.ts', match: /setItem\(/ },
      { name: 'clear via length or single splice', weight: 1, file: 'app/feed-store.ts', match: /length\s*=\s*0|splice\(\s*0\s*,/ },
      { name: 'event args copied, not retained', weight: 1, file: 'app/feed-store.ts', notMatch: /push\(\s*args\s*\)|=\s*args\s*;/ },
    ],
    rubric: `- Does subscribe() treat 'splice' as the action for length assignments (and map push/pop/setItem correctly with index/addedCount/removed)?
- Does resort avoid ObservableArray.sort()/reverse() (which emit nothing) — using a copy-sort + splice(0, length, ...sorted) or an explicit refresh strategy?
- Are fields copied out of the change args (the framework reuses the args object)?`,
  },

  {
    name: 'profile-vm-bugs',
    skill: 'ns-observable-set-semantics',
    instruction: `Three bugs on the profile page, reproduced in app/profile-vm.ts and app/main-page.ts (symptoms described in the comments):
1. After addTag() runs, the Label bound to {{ tags }} never updates.
2. Code reading vm.displayName always gets null, while vm.get('displayName') works.
3. The celebrate label's confetti should run only on the FIRST tap but runs on every tap.
Fix all three with minimal changes.`,
    workspace: [NS_APP, fx('observable-set')],
    checks: [
      { name: 'tags change actually notifies', weight: 3, file: 'app/profile-vm.ts', match: /WrappedValue\.wrap|\[\.\.\.|\.concat\(|ObservableArray/ },
      { name: 'displayName declared at creation', weight: 3, file: 'app/profile-vm.ts', match: /fromObject\(\s*\{[^}]*displayName/s },
      { name: 'gesture once() replaced', weight: 2, file: 'app/main-page.ts', notMatch: /\.once\(\s*['"]tap/ },
      { name: 'first-tap still one-shot', weight: 2, file: 'app/main-page.ts', match: /\.off\(\s*['"]tap|celebrated|hasRun|fired/i },
    ],
    rubric: `- Bug 1: did the agent recognize set(sameRef) as a reference-equality no-op and fix via WrappedValue.wrap, a new array, or ObservableArray?
- Bug 2: displayName must be a creation-time key of fromObject (dot accessors are only installed for initial keys)?
- Bug 3: did they know view.once() does not work for gesture names and switch to on + explicit off (or a guard)?`,
  },

  {
    name: 'detail-page-lifecycle',
    skill: 'ns-page-navigation-lifecycle',
    instruction: `Add a detail page to this app: app/detail-page.xml + app/detail-page.ts (module style), navigated to from main-page with a context object { id }. Requirements:
- the view model is built exactly once per forward visit — NOT rebuilt when the user comes back from a deeper page;
- copy what you need from the navigation context onto the view model (it is not available later);
- a 1s "elapsed" ticker starts only once the page is fully current and is reliably stopped when the page's native views detach;
- wire the navigation from main-page (add a button).`,
    workspace: [NS_APP],
    checks: [
      { name: 'back-navigation guard on setup', weight: 3, file: 'app/detail-page.ts', match: /isBackNavigation/ },
      { name: 'context read in navigatingTo', weight: 2, file: 'app/detail-page.ts', match: /navigatingTo[\s\S]*context/ },
      { name: 'ticker starts on navigatedTo', weight: 2, file: 'app/detail-page.ts', match: /navigatedTo[\s\S]*setInterval|setInterval[\s\S]*navigatedTo/ },
      { name: 'ticker stopped on unloaded', weight: 2, file: 'app/detail-page.ts', match: /unloaded[\s\S]*clearInterval|clearInterval[\s\S]*unloaded/ },
      { name: 'navigation wired with context', weight: 1, file: 'app/main-page.ts', match: /navigate\(\s*\{[\s\S]*context/ },
    ],
    rubric: `- Setup in navigatingTo guarded by args.isBackNavigation; context copied there (page.navigationContext is cleared on back)?
- Timer lifecycle on navigatedTo/unloaded (not loaded/navigatedFrom — unloaded fires BEFORE navigatedFrom)?`,
  },

  {
    name: 'theme-color-utils',
    skill: 'ns-color-formats',
    instruction: `Create app/color-utils.ts with small helpers our theming code needs, using @nativescript/core's Color correctly:
- withAlpha(hex6: string, alpha: number): Color — '#3366FF' + 0..255 alpha
- fromPackedInt(argb: number): Color — accepts values like 0xff3366ff; document (in a comment) why 0x3366ff would be invisible
- toCssHex(c: Color): string — always returns an 8-digit '#RRGGBBAA' string even for opaque colors
- parseUserColor(input: string, fallback: string): Color — never throws on garbage input.`,
    workspace: [NS_APP],
    checks: [
      { name: 'validity guard for user input', weight: 3, file: 'app/color-utils.ts', match: /Color\.isValid/ },
      { name: 'alpha handled as 0-255', weight: 2, file: 'app/color-utils.ts', match: /255/ },
      { name: 'opaque hex re-expanded to 8 digits', weight: 3, custom: async ({ read }) => {
        const s = read('app/color-utils.ts') || '';
        const handles = /\.hex/.test(s) && (/length/.test(s) || /padEnd|FF['"`]|slice|substring/i.test(s) || /\.a\b/.test(s));
        return { passed: handles, message: handles ? 'accounts for .hex dropping alpha when opaque' : '.hex returns 6 digits for opaque colors — must be handled' };
      } },
      { name: 'invisible-int trap documented', weight: 2, file: 'app/color-utils.ts', match: /alpha byte|0xff|invisible|transparent/i },
      { name: 'no argb-through-hex round trip', weight: 1, file: 'app/color-utils.ts', notMatch: /['"`]#['"`]\s*\+\s*[a-zA-Z_$][\w$]*\.argb/ },
    ],
    rubric: `- Does the code respect the two orderings (hex strings RRGGBBAA alpha-last; ints/argb 0xAARRGGBB alpha-first)?
- toCssHex must handle .hex returning 6 digits for opaque colors; fromPackedInt's comment must explain the missing-alpha-byte invisibility trap.`,
  },

  {
    name: 'tablet-layout-variant',
    skill: 'ns-file-qualifiers',
    instruction: `Our player screen has a tablet layout at app/views/player/player-page.tablet.xml but tablets keep getting the phone layout — the file is completely ignored. Fix the variant file naming so tablet-class devices (min 600 dip) load the two-column layout, and add a phone-landscape variant app/views/player/player-page.land.xml (copy the phone layout with the title saying "landscape"). Leave the base file for phones in portrait.`,
    workspace: [NS_APP, fx('file-qualifiers')],
    checks: [
      { name: 'minWH600 variant exists', weight: 4, files: ['app/views/player/player-page.minWH600.xml'] },
      { name: 'bogus .tablet file removed', weight: 3, custom: async ({ read }) => {
        const gone = read('app/views/player/player-page.tablet.xml') == null;
        return { passed: gone, message: gone ? 'removed' : '.tablet is not a supported qualifier and silently never loads — file should be renamed away' };
      } },
      { name: 'landscape variant added', weight: 2, files: ['app/views/player/player-page.land.xml'] },
      { name: 'tablet layout content preserved', weight: 1, file: 'app/views/player/player-page.minWH600.xml', match: /tablet layout|columns="\*, \*"/ },
    ],
    rubric: `- Did the agent know .tablet/.phone are not qualifiers (no deviceType matcher exists) and that minWH600 is the tablet convention?
- Did it keep the base file as the phone-portrait default?`,
  },

  {
    name: 'listview-jank',
    skill: 'ns-listview-recycling',
    instruction: `Two bugs on the feed list (app/main-page.ts + app/main-page.xml):
1. Scrolling janks badly on older devices, and the analytics "impression" event fires far more often than items are first shown.
2. The featured template (every 10th row) never applies — all rows render with the default template.
Fix both. Impressions should fire at most once per item index.`,
    workspace: [NS_APP, fx('listview')],
    checks: [
      { name: 'recycling contract honored', weight: 4, file: 'app/main-page.ts', match: /if\s*\(\s*!\s*(loadArgs|args)\.view\s*\)/ },
      { name: 'selector key matches a declared template', weight: 3, file: 'app/main-page.ts', match: /['"]featured['"]/, notMatch: /['"]hero['"]/ },
      { name: 'impressions deduplicated', weight: 2, file: 'app/main-page.ts', match: /Set\(|seen|logged|impressed/i },
      { name: 'templates unchanged in XML', weight: 1, file: 'app/main-page.xml', match: /key="featured"/ },
    ],
    rubric: `- Does itemLoading only create a view when args.view is absent, and reconfigure it otherwise (recycling contract)?
- Did the agent spot that the selector returned 'hero' while the template key is 'featured' — and that unknown keys silently fall back to the default template?
- Are analytics side effects deduplicated (itemLoading re-fires on recycle and refresh)?`,
  },

  {
    name: 'tab-fetch-android',
    skill: 'ns-tabview-lazy-loading',
    instruction: `Android-only problem (see the comment in app/main-page.ts): the analytics dashboard shows feed fetches for tabs the user never opened — sometimes twice — and first paint is slow because the Library tab's fetch runs at startup. iOS behaves as expected. Make both platforms load tabs lazily and make each tab's fetch run at most once, without restructuring the screen.`,
    workspace: [NS_APP, fx('tabview-lazy')],
    checks: [
      { name: 'offscreen preloading disabled', weight: 4, dir: 'app', match: /androidOffscreenTabLimit\s*=?\s*["']?0/ },
      { name: 'fetches made idempotent', weight: 3, file: 'app/main-page.ts', match: /Set\(|fetched|initialized|loaded[A-Z]|has\(/ },
      { name: 'tabs and handlers intact', weight: 1, file: 'app/main-page.xml', match: /TabViewItem[\s\S]*TabViewItem[\s\S]*TabViewItem/ },
    ],
    rubric: `- Did the agent identify Android's default one-tab-to-each-side preload as the cause and set androidOffscreenTabLimit="0"?
- Is per-tab work guarded so repeated loaded events (tab re-entry, page re-navigation) don't refetch?`,
  },

  {
    name: 'binding-fixes',
    skill: 'ns-binding-expressions',
    instruction: `Two broken bindings on app/main-page.xml (see the comments):
1. The done-count Label crashes the page with "Invalid expression syntax".
2. Editing the full-name TextField corrupts BOTH firstName and firstNameSuffix in the model.
Fix both (app/main-page.xml + app/main-page.ts). The done count must still update when items change; the TextField should display the combined name without corrupting the model.`,
    workspace: [NS_APP, fx('binding-expr')],
    checks: [
      { name: 'no function literals in bindings', weight: 3, file: 'app/main-page.xml', notMatch: /=>/ },
      { name: 'computed value moved to the view model', weight: 2, file: 'app/main-page.ts', match: /done/i },
      { name: 'two-way write-back defused', weight: 4, custom: async ({ read }) => {
        const xml = read('app/main-page.xml') || '';
        const expr = xml.match(/\{\{[^}]*firstName[^}]*\}\}/g) || [];
        // only combining expressions are hazardous; plain {{ firstNameSuffix }} is fine
        const combinedTwoWay = expr.some((e) => /firstNameSuffix/.test(e) && /\+/.test(e) && !/,\s*false\s*\}\}/.test(e));
        return { passed: !combinedTwoWay, message: combinedTwoWay ? 'a two-way binding still combines firstName and firstNameSuffix — write-back string substitution corrupts both' : 'defused (one-way opt-out or single computed property)' };
      } },
      { name: 'model fields preserved', weight: 1, file: 'app/main-page.ts', match: /firstNameSuffix/ },
    ],
    rubric: `- Arrow functions are not in the binding expression allow-list — was the count computed in the view model (and kept updating)?
- XML bindings are two-way by default and write-back does global string substitution of the source property name — did the agent either opt out ({{ expr, expr, false }}), bind a single computed property, or rename to avoid the prefix collision, and explain which?`,
  },

  {
    name: 'grid-spec-fix',
    skill: 'ns-gridlayout-spec-strings',
    instruction: `The grid on app/main-page.xml is broken: the first column crashes some builds, and two columns render as hairlines (see the comment — intended: icon column sized to content, two equal flexible columns, a fixed 48dp trailing column). Fix the spec.`,
    workspace: [NS_APP, fx('gridlayout')],
    checks: [
      { name: 'no web units or bad casing in specs', weight: 4, custom: async ({ read }) => {
        const s = read('app/main-page.xml') || '';
        const spec = s.match(/columns="([^"]*)"/)?.[1] || '';
        const bad = /fr|%|Auto/.test(spec);
        return { passed: !!spec && !bad, message: bad ? `spec still contains web units / capitalized Auto: "${spec}"` : `spec: "${spec}"` };
      } },
      { name: 'equal flexible columns via stars', weight: 3, custom: async ({ read }) => {
        const s = read('app/main-page.xml') || '';
        const spec = s.match(/columns="([^"]*)"/)?.[1] || '';
        const stars = (spec.match(/\*/g) || []).length;
        return { passed: stars >= 2, message: `${stars} star columns` };
      } },
      { name: 'auto + fixed columns kept', weight: 2, custom: async ({ read }) => {
        const spec = (read('app/main-page.xml') || '').match(/columns="([^"]*)"/)?.[1] || '';
        const ok = /auto/.test(spec) && /48/.test(spec);
        return { passed: ok, message: `spec: "${spec}"` };
      } },
    ],
    rubric: `- Did the agent know 'Auto' is case-sensitive (throws) and that 1fr/50% parseInt into 1dp/50dp silently?
- Is the final spec "auto, *, *, 48" (or equivalent star ratio)?`,
  },

  {
    name: 'animation-helpers',
    skill: 'ns-view-animations',
    instruction: `Create app/animation-utils.ts exporting:
- slideInFromLeft(view): the view starts 300dp off-screen left and animates to its resting position (calling it twice must not move the view twice);
- startPulse(view) / stopPulse(view): a repeating subtle scale pulse that can be stopped at any time — stopping must never leave a promise hanging forever or make the next startPulse throw "Animation is already playing.";
- every rejection handled, including the two different rejection shapes NativeScript animations produce.`,
    workspace: [NS_APP],
    checks: [
      { name: 'start state set directly, then animate to rest', weight: 3, file: 'app/animation-utils.ts', match: /translateX\s*=\s*-/ },
      { name: 'cancellable animation object retained', weight: 2, file: 'app/animation-utils.ts', match: /createAnimation|\.cancel\(\)/ },
      { name: 'replay guarded', weight: 2, file: 'app/animation-utils.ts', match: /isPlaying/ },
      { name: 'both rejection shapes handled', weight: 3, custom: async ({ read }) => {
        const s = read('app/animation-utils.ts') || '';
        const stringShape = /typeof\s+\w+\s*===\s*['"]string['"]|already playing/i.test(s);
        const errorShape = /cancelled|catch/i.test(s);
        return { passed: stringShape && errorShape, message: stringShape && errorShape ? 'handles string + Error rejections' : 'must handle the bare-string "Animation is already playing." AND the Error "Animation cancelled." shapes' };
      } },
      { name: 'no await on cancellable play', weight: 1, file: 'app/animation-utils.ts', notMatch: /await\s+[\w.]*pulse[\w.]*\.play\(\)/i },
    ],
    rubric: `- slideIn sets translateX directly then animates translate to 0 (transforms are absolute destinations, not deltas)?
- Pulse never awaits a cancellable play (iOS leaves cancelled promises pending), guards with isPlaying, and catches both rejection shapes?`,
  },

  {
    name: 'card-entrance-css',
    skill: 'ns-css-keyframes',
    instruction: `The card entrance animation in app/app.css is broken (symptoms in the comment): the title never tints, the card snaps back to its start position when the animation ends, and animation-direction/animation-play-state appear ignored. Fix the CSS so the card slides up, fades in, and STAYS at its final position — and handle the tint some way that actually works in NativeScript.`,
    workspace: [NS_APP, fx('css-keyframes')],
    checks: [
      { name: 'fill-mode keeps the end state', weight: 4, file: 'app/app.css', match: /animation-fill-mode:\s*(forwards|both)/ },
      { name: 'non-animatable color removed from keyframes', weight: 3, custom: async ({ read }) => {
        const s = read('app/app.css') || '';
        const kf = s.match(/@keyframes[\s\S]*?\n\}/g)?.join('\n') || '';
        const hasColor = /[^-]color:/.test(kf);
        return { passed: !hasColor, message: hasColor ? 'color inside @keyframes is silently dropped — not animatable' : 'keyframes use only animatable properties' };
      } },
      { name: 'unsupported direction removed', weight: 2, file: 'app/app.css', notMatch: /animation-direction:\s*alternate/ },
      { name: 'play-state not relied on', weight: 1, file: 'app/app.css', notMatch: /animation-play-state/ },
      { name: 'transform/opacity animation kept', weight: 1, file: 'app/app.css', match: /translate|transform/ },
    ],
    rubric: `- animation-fill-mode: forwards (or both) added to stop the snap-back?
- Did the agent know only 12 properties (+transform) animate — color silently dropped — and that alternate/play-state are unimplemented?`,
  },

  {
    name: 'cancellable-fetch',
    skill: 'ns-web-globals',
    instruction: `Create app/api.ts exporting fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> for this NativeScript app: performs a GET with fetch, aborts cleanly after the timeout, always clears the timer, and throws a distinguishable TimeoutError on abort. It must run inside the NativeScript runtime as-is (mind which web globals actually exist there).`,
    workspace: [NS_APP],
    checks: [
      { name: 'AbortController imported (not assumed global)', weight: 4, file: 'app/api.ts', match: /import\s+AbortController\s+from\s+['"]@nativescript\/core\/abortcontroller['"]/ },
      { name: 'signal passed to fetch', weight: 2, file: 'app/api.ts', match: /signal/ },
      { name: 'timer cleared', weight: 2, file: 'app/api.ts', match: /clearTimeout/ },
      { name: 'abort wired to timeout', weight: 1, file: 'app/api.ts', match: /\.abort\(\)/ },
      { name: 'timeout distinguishable', weight: 1, file: 'app/api.ts', match: /TimeoutError|timed out|timeout/i },
    ],
    rubric: `- Did the agent know AbortController is NOT a NativeScript global (throws "AbortController is not defined") and import it from '@nativescript/core/abortcontroller', while fetch itself IS global and honors signal?`,
  },

  {
    name: 'status-aware-http',
    skill: 'ns-http-gotchas',
    instruction: `Our API layer treats backend error pages as data: a 500 with a JSON error body "succeeds", and a 404 HTML page surfaces as a confusing JSON parse error. Create app/http-client.ts exporting getJson<T>(url): Promise<T> and postJson<T>(url, body): Promise<T> using @nativescript/core's Http so that any non-2xx response throws an Error containing the status code and the first part of the body. Explain in a one-line comment why the convenience helpers can't be used directly.`,
    workspace: [NS_APP],
    checks: [
      { name: 'status code checked', weight: 4, file: 'app/http-client.ts', match: /statusCode/ },
      { name: 'request() used, not the blind helpers', weight: 3, file: 'app/http-client.ts', match: /request\s*\(/, notMatch: /getJSON\s*\(/ },
      { name: 'body converted after the status gate', weight: 1, file: 'app/http-client.ts', match: /toJSON\(\)/ },
      { name: 'status in the thrown error', weight: 1, file: 'app/http-client.ts', match: /throw[\s\S]{0,120}statusCode|statusCode[\s\S]{0,120}throw/ },
      { name: 'reason documented', weight: 1, file: 'app/http-client.ts', match: /status/i },
    ],
    rubric: `- Does the wrapper route through Http.request and gate on res.statusCode before content conversion (the helpers never check status)?
- Does the error message carry status + a body excerpt for debuggability?`,
  },

  {
    name: 'css-selector-fixes',
    skill: 'ns-css-selectors',
    instruction: `Three rules in app/app.css silently never apply (symptoms in the comments): the primary-button highlight, the flower-tag tint (tags is set to values like "my-flower" and "flower fresh" from code — only the EXACT token "flower" should match), and the ActionBar item styling. Fix the stylesheet (and app/main-page.xml where the bar items need it) so all three work.`,
    workspace: [NS_APP, fx('css-selectors')],
    checks: [
      { name: 'attribute selector gets a type/class prefix', weight: 3, custom: async ({ read }) => {
        const s = read('app/app.css') || '';
        const bare = /^\s*\[[^\]]+\]\s*\{/m.test(s);
        return { passed: !bare, message: bare ? 'bare [attr] selectors match nothing in NativeScript' : 'prefixed' };
      } },
      { name: 'token-match operator kept for exact tag', weight: 2, file: 'app/app.css', match: /~=/ },
      { name: 'bar items styled via classes', weight: 3, custom: async ({ read }) => {
        const css = read('app/app.css') || '';
        const typeSelectors = /(^|\n)\s*(NavigationButton|ActionItem)\s*\{/.test(css);
        const classes = /\.(nav-back|bar-item)/.test(css);
        return { passed: !typeSelectors && classes, message: typeSelectors ? 'NavigationButton/ActionItem type selectors silently match nothing' : classes ? 'class-based' : 'bar item styling missing' };
      } },
      { name: 'primary highlight reachable', weight: 2, file: 'app/app.css', match: /button\[kind|Button\[kind|\.?[a-z-]*\[kind\*=/i },
    ],
    rubric: `- [kind*='primary'] prefixed with a type (button[kind*='primary'])?
- Did the agent keep ~= for the exact-token requirement (knowing "my-flower" must NOT match) rather than switching to *=?
- Bar items styled through their classes since NavigationButton/ActionItem register no CSS type?`,
  },

  {
    name: 'css-vars-calc-fixes',
    skill: 'ns-css-variables-calc',
    instruction: `Two silent styling failures in app/app.css (see comments): CTA labels lose their colour entirely on screens where --accent isn't defined instead of falling back to the brand blue, and the banner's calc() width never applies at all. Fix the stylesheet.`,
    workspace: [NS_APP, fx('css-vars')],
    checks: [
      { name: 'var() fallback added', weight: 4, file: 'app/app.css', match: /var\(--accent\s*,/ },
      { name: 'mixed-unit calc removed', weight: 4, custom: async ({ read }) => {
        const s = read('app/app.css') || '';
        const mixed = /calc\([^)]*px[^)]*%[^)]*\)|calc\([^)]*%[^)]*px[^)]*\)/.test(s);
        return { passed: !mixed, message: mixed ? 'calc() mixing px and % is left unevaluated in NativeScript — the declaration never applies' : 'single-unit (or margin-based) solution' };
      } },
      { name: 'gutter intent preserved', weight: 1, file: 'app/app.css', match: /margin|16|32/ },
    ],
    rubric: `- var(--accent, var(--brand)) style fallback (an undefined var with no fallback silently unsets the property)?
- The 100%-minus-gutter effect rebuilt without mixing px and % in one calc (e.g. width 100% + horizontal margin)?`,
  },

  {
    name: 'conditional-theming-css',
    skill: 'ns-root-css-classes',
    instruction: `Theme this app in app/app.css with NO TypeScript branching — pure CSS:
- a .toolbar class: light surface on Android light, dark surface on Android dark; untouched on iOS;
- a .card class with a light default and a dark-mode override that works even on OS versions where no light class exists;
- 32dp content padding for .content on tablets only;
- a shorter .hero (height 140) in landscape only.
Add the classes to app/main-page.xml elements so they're exercised.`,
    workspace: [NS_APP],
    checks: [
      { name: 'platform scoping', weight: 2, file: 'app/app.css', match: /\.ns-android/ },
      { name: 'dark mode scoping', weight: 2, file: 'app/app.css', match: /\.ns-dark/ },
      { name: 'tablet scoping', weight: 2, file: 'app/app.css', match: /\.ns-tablet/ },
      { name: 'orientation scoping', weight: 2, file: 'app/app.css', match: /\.ns-landscape/ },
      { name: 'light default on bare selector, not .ns-light', weight: 2, custom: async ({ read }) => {
        const s = read('app/app.css') || '';
        const usesLight = /\.ns-light/.test(s);
        const bareCard = /(^|\n)\s*\.card\s*\{/.test(s);
        return { passed: !usesLight && bareCard, message: usesLight ? '.ns-light is absent on iOS <= 12 — defaults belong on bare selectors' : 'defaults are unscoped' };
      } },
      { name: 'no TS branching added', weight: 1, file: 'app/main-page.ts', notMatch: /isAndroid|isIOS|systemAppearance/ },
    ],
    rubric: `- All four conditions expressed via the framework root classes (.ns-android/.ns-dark/.ns-tablet/.ns-landscape)?
- Light defaults written on bare selectors with .ns-dark overrides (never keyed on .ns-light)?`,
  },

  {
    name: 'rating-component',
    skill: 'ns-xml-custom-components',
    instruction: `Create a reusable star-rating component for this XML app: app/components/rating.ts exporting a Rating view class (a GridLayout subclass rendering N tappable star Labels, with a "value" property), and use it on app/main-page.xml via an XML namespace. No Angular/Vue — plain NativeScript XML wiring.`,
    workspace: [NS_APP],
    checks: [
      { name: 'component class exported', weight: 3, file: 'app/components/rating.ts', match: /export\s+class\s+Rating\s+extends/ },
      { name: 'xmlns points at the module path', weight: 3, file: 'app/main-page.xml', match: /xmlns:[a-zA-Z]+="components\/rating"/ },
      { name: 'component used as prefixed tag', weight: 2, file: 'app/main-page.xml', match: /<[a-zA-Z]+:Rating/ },
      { name: 'value flows through', weight: 1, file: 'app/main-page.xml', match: /value="/ },
    ],
    rubric: `- xmlns prefix mapped to the module path (relative to app/) with the exported class name as the tag?
- Does the component render stars and react to taps / value changes?`,
  },

  {
    name: 'sheet-overlay',
    skill: 'ns-root-layout-overlays',
    instruction: `Add a lightweight in-app bottom sheet to this app WITHOUT native modals: change the app root so overlays can float over the current page, then create app/sheet.ts exporting openSheet(view: View): Promise<void> and closeSheet(): Promise<void> with: a tap-to-close dimmed shade behind the sheet, slide-up enter and slide-down exit animations, and no unhandled promise rejections even if openSheet is called twice with the same view.`,
    workspace: [NS_APP],
    checks: [
      { name: 'app root is a RootLayout', weight: 3, file: 'app/app-root.xml', match: /<RootLayout/ },
      { name: 'shade cover configured', weight: 2, file: 'app/sheet.ts', match: /shadeCover/ },
      { name: 'enter/exit animations', weight: 2, file: 'app/sheet.ts', match: /enterFrom[\s\S]*exitTo|exitTo[\s\S]*enterFrom/ },
      { name: 'rejections handled', weight: 2, file: 'app/sheet.ts', match: /catch/ },
      { name: 'double-open guarded', weight: 1, file: 'app/sheet.ts', match: /already|isOpen|opened|openView|currentView|topmost\(\)/i },
    ],
    rubric: `- RootLayout at the app root + getRootLayout().open with shadeCover and enterFrom/exitTo TransitionAnimations?
- Every open/close promise caught (they reject with reasons like "View ... has already been added to the root layout")?`,
  },

  {
    name: 'second-window',
    skill: 'ns-multi-window',
    instruction: `Prepare this app for the NativeScript 9.1 window model:
1. Create app/windows.ts that provides window content the 9.1 way (no deprecated launch event): the primary window shows 'app-root'; any additional window shows the module 'aux-root' and receives the data passed when it was opened. Export openAuxWindow(data) guarded so unsupported devices don't crash.
2. Fix whatever else in the project would prevent a second window from actually opening on Android.`,
    workspace: [NS_APP],
    checks: [
      { name: 'content resolver installed', weight: 4, file: 'app/windows.ts', match: /setWindowContentResolver/ },
      { name: 'primary vs secondary branch', weight: 2, file: 'app/windows.ts', match: /isPrimary/ },
      { name: 'no deprecated launch event', weight: 1, file: 'app/windows.ts', notMatch: /launchEvent|on\(\s*['"]launch['"]/ },
      { name: 'openWindow used with data', weight: 1, file: 'app/windows.ts', match: /openWindow\s*\(/ },
      { name: 'Android launchMode fixed', weight: 4, file: 'App_Resources/Android/src/main/AndroidManifest.xml', match: /launchMode="(singleInstancePerTask|standard)"/, notMatch: /launchMode="singleTask"/ },
    ],
    rubric: `- Application.setWindowContentResolver branching on request.isPrimary, with app init on the ready event (launch is deprecated and never fires for additional windows)?
- Did the agent know the stock template's launchMode="singleTask" makes Android hand the intent to the existing activity — switching to singleInstancePerTask (API 31+) or standard?`,
  },

  {
    name: 'crash-policy-config',
    skill: 'ns-uncaught-error-policy',
    instruction: `Since upgrading to NativeScript 9.1 our production app no longer crashes on uncaught JS errors — it logs and limps along — and our native crash reporter has gone completely silent. We WANT real crashes so the reporter catches them. Fix nativescript.config.ts, and add an app/error-reporting.ts that additionally forwards uncaught errors to console before the crash.`,
    workspace: [NS_APP, fx('uncaught-error')],
    checks: [
      { name: 'throw policy at the TOP level', weight: 4, custom: async ({ read }) => {
        const s = read('nativescript.config.ts') || '';
        const nested = /(ios|android)\s*:\s*\{[^}]*uncaughtErrorPolicy/s.test(s);
        const withoutPlatformBlocks = s.replace(/(ios|android)\s*:\s*\{[^}]*\}/gs, '');
        const top = /uncaughtErrorPolicy\s*:\s*['"]throw['"]/.test(withoutPlatformBlocks);
        return { passed: top && !nested, message: nested ? 'the key is read ONLY from the config top level — nested under ios/android it silently does nothing' : top ? 'top-level throw' : 'policy missing' };
      } },
      { name: 'legacy discard flag removed', weight: 4, file: 'nativescript.config.ts', notMatch: /discardUncaughtJsExceptions/ },
      { name: 'uncaughtError listener wired', weight: 2, file: 'app/error-reporting.ts', match: /uncaughtErrorEvent|['"]uncaughtError['"]/ },
    ],
    rubric: `- uncaughtErrorPolicy: 'throw' moved to the config top level (nested placements are silently ignored)?
- discardUncaughtJsExceptions removed entirely (true suppresses 'throw'; false is ignored)?`,
  },

  {
    name: 'trace-bootstrap',
    skill: 'ns-trace-debugging',
    instruction: `We're chasing silent binding failures and an accessibility issue. Create app/debug-trace.ts exporting enableFrameworkDiagnostics(): turns on @nativescript/core's internal diagnostics for binding problems (including binding ERRORS), layout, navigation AND accessibility; installs a custom writer that prefixes lines with '[diag]' WITHOUT duplicating every line; and makes Trace.error() log instead of crashing the app. Note any category quirks you relied on in comments.`,
    workspace: [NS_APP],
    checks: [
      { name: 'enable + categories', weight: 2, file: 'app/debug-trace.ts', match: /Trace\.enable\(\)/ },
      { name: 'BindingError explicitly included', weight: 3, file: 'app/debug-trace.ts', match: /BindingError/ },
      { name: 'Accessibility included (string form works around the typings gap)', weight: 2, file: 'app/debug-trace.ts', match: /Accessibility/ },
      { name: 'writers cleared before adding', weight: 2, file: 'app/debug-trace.ts', match: /clearWriters/ },
      { name: 'error handler with the real method name', weight: 3, file: 'app/debug-trace.ts', match: /handlerError/ },
    ],
    rubric: `- Did the agent know Trace.categories.All omits BindingError and Accessibility, and that Trace.enable() alone prints nothing?
- clearWriters before addWriter (default ConsoleWriter would duplicate)? setErrorHandler with the (sic) handlerError method so Trace.error doesn't rethrow?`,
  },

  {
    name: 'formatted-status-fix',
    skill: 'ns-formatted-string-spans',
    instruction: `Two bugs in app/status-card.ts (see comments): the count's blue colour never applies, and after showPlain() runs the label still shows the old formatted text. Fix both with minimal changes.`,
    workspace: [NS_APP, fx('formatted-string')],
    checks: [
      { name: 'span coloured via color', weight: 4, file: 'app/status-card.ts', match: /countSpan\.color|\.color\s*=/, notMatch: /foregroundColor/ },
      { name: 'formattedText cleared before plain text', weight: 4, file: 'app/status-card.ts', match: /formattedText\s*=\s*(null|undefined)[\s\S]{0,120}\.text\s*=/ },
      { name: 'formatted rendering preserved', weight: 1, file: 'app/status-card.ts', match: /FormattedString[\s\S]*spans\.push/ },
    ],
    rubric: `- Span colour set via the color property (there is no functioning foregroundColor)?
- showPlain clears formattedText (setting .text while formattedText is set is a silent no-op) before assigning text?`,
  },
];
