# Evals

Three layers, the first two runnable from a clone with no API key:

| Layer | Command | Needs | What it proves |
|---|---|---|---|
| Static spec + tree lint | `npm run lint` (`evals/lint-skills.mjs`) | Node | frontmatter (`name` == dir, `ns-` prefix, ≤64 chars, description ≤1024, spec-only keys), depth ≤ 3, unique names, category READMEs, body < 500 lines, sibling cross-refs resolve, provenance line, no elided code, bundled files exist, one task per skill |
| Intent validate + manifest sync | `npm run validate`, `npm run sync:check` | Node (+ network for Intent) | TanStack Intent's packaging rules pass; `skills.sh.json`, the Claude plugin manifests and the README table match the tree |
| Behavioural (skillgrade) | `npm run eval:smoke` … | Node, `skillgrade` (`npm i -g skillgrade`), a logged-in `claude` CLI, macOS for simulator-dependent checks | an agent given a realistic prompt **finds** the right skill among all of them and **produces** the outcome the skill teaches |

## How the skillgrade suite is built

* `evals/tasks.mjs` — the single source of truth: one task per skill. Each has a realistic instruction that **never names the skill**, fixture files, deterministic `checks`, and an `llm_rubric`.
* `evals/build.mjs` — flattens the nested `skills/` tree into `evals/suite/skills/<name>/` (skillgrade 0.2.x only detects `skills/<name>/SKILL.md` one level deep) and renders `evals/suite/eval.yaml` (skills on) and `evals/baseline/eval.yaml` (identical tasks, no skills). The YAML files are generated — edit `tasks.mjs`.
* `evals/run.sh` — builds, then runs `skillgrade` from `evals/suite` (or `evals/baseline` with `--baseline`) with the local provider and `--output=evals/results`.
* `evals/agent/claude-cli.sh` — a skillgrade `command` agent that runs `claude -p --output-format stream-json` and keeps the tool transcript in `.agent-log/`, so the grader can see whether the `Skill` tool was invoked (the built-in `claude` adapter only keeps the final answer).
* `evals/graders/check.mjs <task>` — generic grader: runs the task's checks + an automatic **skill-loaded** check. Reward = 0.25 × loaded + 0.75 × weighted outcome checks. `SKILLGRADE_BASELINE=1` drops the loaded check.
* `evals/fixtures/` — starting workspaces, one stock app per flavor plus per-task overlays ([conventions](fixtures/README.md)).

Design constraints worth knowing (skillgrade 0.2.2): one deterministic grader per task; grader scripts are staged into the agent-visible workspace (ours is a one-liner that shells out to the repo, so the agent cannot read the expectations); `llm_rubric` graders need `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`OPENAI_API_KEY` — pass `--grader=deterministic` without one; `provider: docker` needs Docker (we use `local`).

## Running

```bash
npm i -g skillgrade                                  # once
evals/run.sh --trials=1 --parallel=4 --grader=deterministic        # smoke, all tasks
evals/run.sh --eval=<task>,<task> --trials=3                       # a few tasks
evals/run.sh --baseline --trials=1 --parallel=4 --grader=deterministic   # same tasks, no skills
SKILLGRADE_CLAUDE_MODEL=opus evals/run.sh --smoke                    # different agent model
npm run eval:report                                  # docs/EVALUATION.md + docs/report.html (adds Δ vs baseline when both exist)
npm run eval:preview                                 # skillgrade's web UI
```

Results land in `evals/results/{suite,baseline}/results/*.json` (git-ignored); every trial's workspace + Claude transcript is kept under `evals/results/workspaces/<skills|baseline>/<task>/` for inspection. Trials run against the **live** `skills/` tree (re-flattened on every run), so edit-and-rerun is immediate.

If you tighten or relax a check afterwards, `node evals/regrade.mjs [--baseline] [task…]` re-scores the saved workspaces with the current graders and rewrites the rewards in the latest result files — no new agent run needed.

## Adding a task for a new skill

1. Add an entry to `evals/tasks.mjs` (`npm run new` prints the stub): `name`, `skill`, an instruction a real developer would type (name the output files so checks are unambiguous), `workspace` fixtures, 5–10 `checks` that grade *outcomes* (APIs the skill teaches, files, pinned versions — not steps), and a short `rubric`.
2. Validate the grader against a hand-written reference solution and against the untouched fixture (it should fail), e.g. `cd <ws> && SKILLGRADE_BASELINE=1 node evals/graders/check.mjs <task>`.
3. `evals/run.sh --eval=<task> --trials=1`.
