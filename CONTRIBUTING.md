# Contributing a skill

A skill here is a folder with a `SKILL.md` that an AI coding agent loads when its `description` matches what the developer asked for. The bar is: **code that has run**, the exact error strings and API names an agent will see, and a behavioural eval that proves an agent finds the skill and produces the outcome it teaches.

## Where does a skill go?

Pick the deepest category whose README says it belongs there (`skills/<category>/README.md`). Rough guide:

| If the skill is about… | Category | Name |
|---|---|---|
| `@nativescript/core` itself — views, Properties, layouts, lifecycle, runtime quirks that hit both platforms | `core/` | `ns-<topic>` |
| an Apple framework and how the iOS runtime exposes it | `ios/` | `ns-ios-<topic>` |
| an `android.*` API, Canvas, Java interop rules | `android/` | `ns-android-<topic>` |
| one frontend flavor's wiring (DI, components, bundler config for that flavor) | `frontend/<flavor>/` | `ns-<flavor>-<topic>` |
| a visual/motion pattern with a renderer for each platform | `ui/` | `ns-<pattern>` |
| a device capability (location, haptics, sensors…) with both platform paths, no plugin | `device/` | `ns-<capability>` |
| proving an app works: tests, simulator/emulator automation, log triage | `testing/` | `ns-<topic>` |
| the project around the code: CLI, bundlers, assets, CI, release | `tooling/` | `ns-<topic>` |
| writing/packaging a NativeScript plugin | `plugins/` | `ns-plugin-<topic>` |

If nothing fits, add a category: `mkdir skills/<name>`, write `skills/<name>/README.md` whose first heading is the human title and first paragraph the one-line description (both feed `skills.sh.json` and the root README), then `npm run sync`. Keep skills at most three directories below `skills/` — `skills/<cat>/<sub>/<skill>/` is the limit the skills.sh CLI scans.

Names are global: installs flatten the tree to `.claude/skills/<name>/`, so a name must be unique across every category and start with `ns-`. Renaming or removing a skill is a breaking change for people who pinned it (see [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md#naming-is-the-api)).

## Steps

1. `npm run new <category> <ns-name>` — scaffolds `SKILL.md` from [docs/SKILL-TEMPLATE.md](docs/SKILL-TEMPLATE.md) and prints the eval task stub.
2. Write the skill (rules below). Supporting files go in `scripts/`, `assets/` or `references/` inside the skill folder — never another `SKILL.md`.
3. Add one task to `evals/tasks.mjs` and, if the task needs a starting project, a fixture under `evals/fixtures/` ([conventions](evals/fixtures/README.md)).
4. `npm run sync` (regenerates `skills.sh.json`, the Claude plugin manifests and the README table) and `npm run check` (lint + manifests + Intent validate + pack dry-run).
5. Verify the grader both ways: it passes on a hand-written solution and fails on the untouched fixture. Then run the task for real: `evals/run.sh --eval=<task> --trials=1` (needs a logged-in `claude` CLI and `npm i -g skillgrade`).
6. Open the PR with the eval output in the description.

## What a good SKILL.md looks like

* **Frontmatter:** `name` (== folder), `description` that starts with "Use when …" and is dense with the literal error strings / API names an agent will be matching on, `license: Apache-2.0`, `metadata.author` + `metadata.source`. Nothing else at the top level (custom keys go under `metadata`).
* **Rules first.** If the runtime enforces something (`@NativeClass` at module scope, `Array.create` for Java arrays, no `Intl` on iOS), list it under the title before any code. Agents read top-down and stop early.
* **Code that ran.** Complete enough to paste; no `…` elisions inside code blocks. Large helpers go in `scripts/` or `assets/`, and the text says so.
* **Pitfalls with their exact error text.** "Cannot marshal JavaScript argument at index 3 to Java type" is searchable; "marshalling issues" is not.
* **Provenance.** End with `Verified <YYYY-MM>: <macOS/Xcode/simulator/emulator/NativeScript versions>`. Mark anything you did not run as *untested*.
* **Size.** Under ~150 lines and ~2 000 tokens is the sweet spot; the lint errors above 500 lines.
* **Cross-reference** sibling skills by name in backticks (`` `ns-ios-framework-typings` ``); the lint checks they exist.

## What a good eval task looks like

* The **instruction never names the skill** — discovery is 25 % of the reward. Write what a developer would actually type, and name the output files so checks are unambiguous.
* **Checks grade outcomes**, not steps: APIs the skill teaches are present, forbidden ones absent, files exist, versions pinned. Where the skill's output can run headless (pure functions, scripts), **execute it** with `runTs`/`sh` against reference values — that is the strongest signal.
* Five to ten checks, weighted so the one that matters most dominates; plus a short `rubric` for the LLM grader.
* Run the baseline too (`evals/run.sh --baseline --eval=<task>`): a task the agent already aces without the skill is a sign the checks are too loose or the skill is not earning its keep.

## House rules

* Don't commit `evals/results/` or the flattened `evals/suite/skills/` — both are generated.
* `evals/suite/eval.yaml` and `evals/baseline/eval.yaml` are generated from `tasks.mjs`; commit them after `node evals/build.mjs` so they stay readable on GitHub, but never hand-edit.
* Commit messages: plain imperative, no tool attribution trailers.
