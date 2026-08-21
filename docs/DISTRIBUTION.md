# Distribution — `@nativescript/skills`

Goal: put the skills in front of every NativeScript developer's coding agent (Claude Code, Cursor, Codex, Copilot, Gemini CLI, …) with **one canonical source**, **vendored copies end users can refresh**, and **versioned releases** — without maintaining copies of anything.

## 1. One source tree, three doors

```
skills/<category>[/<sub>]/<name>/SKILL.md      ← Agent Skills spec; name == directory
skills/<category>[/<sub>]/<name>/{scripts,assets,references}/
skills/<category>/README.md                    ← category title + description (feeds the manifests)
```

Every door flattens this to `<skills-dir>/<name>/` — agents only ever see the skill name. The category is for maintainers, listing pages and the `--only <category>` filter.

| Door | What we ship | How users install | How users update | Where the files land |
|---|---|---|---|---|
| **A. GitHub → skills.sh CLI** (broadest reach: 15+ agents) | nothing extra — the CLI scans `skills/` up to three levels deep; `skills.sh.json` only groups the listing page by category | `npx skills add NativeScript/skills` (interactive agent picker) · `--copy` to vendor real files, `-g` global, `-a claude-code -s '*' -y` for CI | `npx skills update` (re-pulls `main`; no pin) | `.claude/skills/`, `.agents/skills/`, `.cursor/skills/` … in the project (or `~/…` with `-g`) |
| **B. Claude Code plugin marketplace** | `.claude-plugin/marketplace.json` + `plugin.json` — their `skills` arrays list every leaf category directory because Claude Code scans a listed directory **one level deep** | `/plugin marketplace add NativeScript/skills` then `/plugin install nativescript-skills@nativescript` | `/plugin update nativescript-skills@nativescript` (SHA-keyed: every commit is an update) | user-global plugin cache; skills appear as `nativescript-skills:ns-…`; a project can pre-register the marketplace in `.claude/settings.json` |
| **C. npm `@nativescript/skills`** | `package.json` with `files: ["skills", "lib", "bin", …]`, keyword `tanstack-intent`, zero-dep `bin/cli.mjs` | **C1 (TanStack Intent):** `npm i -D @nativescript/skills && npx @tanstack/intent@latest install` — skills read live from `node_modules` (Intent walks the nested tree) · **C2 (vendored + pinned):** `npx @nativescript/skills install --agent claude,agents [--only ios,frontend/angular]` copies skills flat and writes `.nativescript-skills.json` (package version + per-file hash) | C1: `npm update @nativescript/skills` · C2: `npx @nativescript/skills@latest update` (`check` lists stale / modified / missing; refuses to clobber local edits without `--force`) | C1: `node_modules/@nativescript/skills/skills/` · C2: `.claude/skills/`, `.agents/skills/` … + manifest at project root |

`scripts/sync.mjs` regenerates the door A and B manifests and the README table from the tree; CI fails if they drift (`npm run sync:check`).

### Which door to recommend

* **Individual developers, any agent** → A. Lowest friction; listing on skills.sh is automatic after the first installs.
* **Claude Code users / teams** → B. Namespaced, one-command update, project-level pre-registration.
* **Teams that want the files in their repo, pinned to a release, reviewable in PRs** → C2. Semver from npm, drift detection, `update` never silently overwrites local edits.
* **Projects already on TanStack Intent** → C1. Skills version with the dependency.

Do not recommend symlink installs for teams (they break for everyone else who clones), git submodules, or committing `node_modules`.

## 2. Naming is the API

Skill names are what agents match on and what users pin.

* Every name starts with `ns-`; under `ios/`, `android/`, `frontend/<flavor>/` and `plugins/` it continues with that prefix. Names are unique across the whole tree.
* **Moving a skill between categories is not a breaking change** — no door exposes the category. Renaming or removing one is a **major** bump; adding is **minor**; editing content is **patch**.
* Frontmatter carries `license: Apache-2.0` and `metadata.author/source` (spec-legal keys; Intent validates them).

## 3. Release process

`main` is what doors A and B serve, so `main` must always be releasable. Work on branches, squash-merge.

1. `npm run check` — spec lint, manifest sync, `@tanstack/intent validate`, `npm pack --dry-run`. CI runs the same on every push and PR.
2. `npm run eval:smoke` locally (uses your Claude Code login — see `evals/README.md`) when a skill's *content* changed. Full runs cost real tokens; they are opt-in.
3. Bump `package.json` version, add a `CHANGELOG.md` entry, tag `vX.Y.Z`, push the tag.
4. `.github/workflows/release.yml` publishes to npm with provenance via OIDC trusted publishing and creates the GitHub release. Doors A and B need nothing.

Per-skill version stamps were deliberately left out — the package version plus the manifest's per-file hashes are the version of record for door C, and doors A/B track `main`.

## 4. Discoverability

* skills.sh badge once listed: `[![skills.sh](https://skills.sh/b/NativeScript/skills)](https://skills.sh/NativeScript/skills)`.
* GitHub topics: `agent-skills`, `nativescript`, `claude-code`, `cursor`, `codex`.
* Link from the NativeScript docs' AI tooling page.
* Later: ship framework-level skills *inside* `@nativescript/core` / flavor packages under `skills/` so Intent users get them with the version they have installed; this repo stays the home for app-level recipes and fast-moving platform specifics.

## 5. Open items

* **npm trusted publishing** for `@nativescript/skills`: GitHub Actions · owner `NativeScript` · repo `skills` · workflow `release.yml` · environment `npm-publish`. Until configured, set repo variable `USE_NPM_TOKEN=true` and secret `NPM_PUBLISH_TOKEN`.
* Confirm **Apache-2.0** (matches the NativeScript org's core repos); change `LICENSE`, `package.json#license` and the template's `license:` line if not.
