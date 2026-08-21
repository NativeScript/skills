#!/usr/bin/env node
// Scaffold a skill in a category and print the eval task stub to add.
//   node scripts/new-skill.mjs <category> <ns-name> [--title "…"]
//   e.g. node scripts/new-skill.mjs frontend/angular ns-angular-signal-forms
import fs from 'node:fs';
import path from 'node:path';
import { root, skillsRoot, discover, NAME_RE, MAX_DEPTH } from '../lib/skills.mjs';

const [category, name] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const titleIdx = process.argv.indexOf('--title');
const title = titleIdx > 0 ? process.argv[titleIdx + 1] : null;
const die = (m) => { console.error(m); process.exit(2); };
if (!category || !name) die('usage: node scripts/new-skill.mjs <category> <ns-name> [--title "…"]');

const { skills, categories } = discover();
const cat = categories.find((c) => c.rel === category.replace(/\/+$/, ''));
if (!cat) die(`unknown category "${category}" — one of: ${categories.map((c) => c.rel).join(', ')}\n(new category: mkdir skills/<name> and add a README.md whose first heading names it)`);
if (!NAME_RE.test(name) || !name.startsWith('ns-')) die(`name must be lowercase, hyphenated and start with "ns-" (got "${name}")`);
if (skills.some((s) => s.name === name)) die(`a skill named ${name} already exists at skills/${skills.find((s) => s.name === name).rel}`);
if (cat.depth + 1 > MAX_DEPTH) die(`skills under ${cat.rel}/ would be ${cat.depth + 1} levels deep; the skills.sh CLI scans ${MAX_DEPTH}`);

const dir = path.join(skillsRoot, cat.rel, name);
fs.mkdirSync(dir, { recursive: true });
const tpl = fs.readFileSync(path.join(root, 'docs/SKILL-TEMPLATE.md'), 'utf8')
  .replace('ns-{{name}}', name)
  .replace('{{Title — what you get}}', title || name.replace(/^ns-/, '').replace(/-/g, ' '));
fs.writeFileSync(path.join(dir, 'SKILL.md'), tpl);

const task = name.replace(/^ns-/, '');
console.log(`created skills/${cat.rel}/${name}/SKILL.md

Next:
 1. Fill in SKILL.md (every {{…}} placeholder; lint flags the rest).
 2. Add a task to evals/tasks.mjs — it must never name the skill:

  {
    name: '${task}',
    skill: '${name}',
    instruction: \`…what a developer would type, naming the output files…\`,
    workspace: [{ src: 'evals/fixtures/ns-app-<flavor>', dest: '.' }],
    checks: [
      { name: '…', file: '…', match: /…/ },
    ],
    rubric: \`- …\`,
  },

 3. npm run sync && npm run check
 4. Verify the grader: against a hand-written solution and against the untouched fixture (should fail), then evals/run.sh --eval=${task} --trials=1`);
