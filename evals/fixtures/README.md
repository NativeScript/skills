# Fixtures

Starting workspaces that tasks in `../tasks.mjs` copy into each trial (`workspace: [{ src: 'evals/fixtures/<name>', dest: '.' }]`, `src` relative to the repo root).

Conventions:

* **One stock app per flavor**, named `ns-app-<flavor>` (`ns-app-angular`, `ns-app-vue`, …): the files `ns create --<flavor>` produces, minus `node_modules`, `platforms` and lockfiles. Most tasks start from one of these. Keep them at the template version the skills were verified against and note it in the fixture's own README.
* **Per-task fixtures** (a bug to fix, a component to extend) get their own directory named after the task and are layered on top of a stock app: `workspace: [NS_APP, { src: 'evals/fixtures/<task>', dest: '.' }]`.
* No secrets, no binaries beyond what the template ships (launch images, icons), and nothing the grader needs — graders live in `evals/graders/` and read expectations from `tasks.mjs`, which the agent never sees.
