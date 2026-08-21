# Skills

Every skill is a directory with a `SKILL.md` (Agent Skills spec, [agentskills.io](https://agentskills.io)). Directories without a `SKILL.md` are **categories**; each carries a `README.md` whose first heading and paragraph describe the category (that text also feeds `skills.sh.json` and the root README, via `npm run sync`).

```
skills/
├── core/        @nativescript/core fundamentals, runtime quirks, custom views
├── ios/         Apple frameworks from TypeScript
├── android/     android.* from TypeScript, Java interop
├── frontend/    one subdirectory per flavor: angular/ vue/ react/ svelte/ solid/
├── ui/          cross-platform UI & motion patterns
├── device/      device capabilities without plugins
├── testing/     tests, simulator/emulator automation, verification
├── tooling/     CLI, bundlers, assets, CI, release
└── plugins/     authoring and packaging NativeScript plugins
```

Rules that tooling enforces (`npm run lint`):

* A skill may sit at most **three** directories below `skills/` (`skills/<cat>/<sub>/<skill>/`) — the skills.sh CLI stops scanning there.
* Skill directory name == frontmatter `name`, starts with `ns-`, and is unique across the whole tree (installs are flattened to `.claude/skills/<name>/`).
* Under `ios/`, `android/` and `frontend/<flavor>/` the name continues with that prefix (`ns-ios-…`, `ns-android-…`, `ns-angular-…`).
* Supporting files live in `scripts/`, `assets/` or `references/` inside the skill — never another `SKILL.md`.
* Every skill has a task in `evals/tasks.mjs`.

Not sure where something goes? See [CONTRIBUTING.md](../CONTRIBUTING.md#where-does-a-skill-go).
