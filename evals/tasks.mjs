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
//
// Example (uncomment and adapt — the skill it names must exist):
//
// const NS_APP = { src: 'evals/fixtures/ns-app-angular', dest: '.' };
//
// {
//   name: 'haptics-direct',
//   skill: 'ns-haptics-direct',
//   instruction: `Add tactile feedback to this NativeScript app without adding a plugin.
//
// Create \`src/app/haptics.ts\` exporting an object \`haptics\` with \`tick()\`, \`tap()\` and \`success()\`.
// Both iOS and Android must work; apply any Android manifest change needed in App_Resources.`,
//   workspace: [NS_APP],
//   checks: [
//     { name: 'iOS feedback generators', file: 'src/app/haptics.ts', match: /UIImpactFeedbackGenerator/ },
//     { name: 'Android VibrationEffect', file: 'src/app/haptics.ts', match: /VibrationEffect\.createOneShot/ },
//     { name: 'VIBRATE permission', file: 'App_Resources/Android/src/main/AndroidManifest.xml', match: /android\.permission\.VIBRATE/ },
//     { name: 'no haptics plugin', file: 'package.json', notMatch: /haptic|vibrat/i },
//   ],
//   rubric: `- Did the agent map tick→selection, tap→impact, success→notification on iOS?
// - Did it add the VIBRATE permission itself rather than only telling the user?`,
// },

export const tasks = [];
