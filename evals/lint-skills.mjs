#!/usr/bin/env node
// Static checks for every skills/**/SKILL.md against the Agent Skills spec
// (agentskills.io/specification) plus this repo's house rules for the nested
// category tree. No LLM, runs anywhere.
//   node evals/lint-skills.mjs            → human report, exit 1 on errors
//   node evals/lint-skills.mjs --json     → machine-readable
import fs from 'node:fs';
import path from 'node:path';
import { discover, readSkill, skillsRoot, walkFiles, MAX_DEPTH, NAME_RE } from '../lib/skills.mjs';
import { tasks } from './tasks.mjs';

const { skills, categories } = discover();
const names = new Set(skills.map((s) => s.name));
const taskBySkill = new Map(tasks.map((t) => [t.skill, t]));
const report = [];
const treeErrors = [];

// Installs flatten the tree to .claude/skills/<name>/, so names must be unique globally.
const seen = new Map();
for (const s of skills) {
  if (seen.has(s.name)) treeErrors.push(`duplicate skill name "${s.name}" in ${seen.get(s.name)} and ${s.rel}`);
  seen.set(s.name, s.rel);
}
for (const t of tasks) if (!names.has(t.skill)) treeErrors.push(`evals/tasks.mjs task "${t.name}" targets unknown skill "${t.skill}"`);
for (const c of categories) {
  if (!c.hasReadme) treeErrors.push(`category ${c.rel}/ has no README.md (its first heading + paragraph name the group)`);
  else if (!c.title) treeErrors.push(`category ${c.rel}/README.md has no "# Title" heading`);
}

// Name prefix expected under a category (closest match wins).
function expectedPrefix(category) {
  const parts = category.split('/');
  if (parts[0] === 'ios') return 'ns-ios-';
  if (parts[0] === 'android') return 'ns-android-';
  if (parts[0] === 'frontend' && parts[1]) return `ns-${parts[1]}-`;
  if (parts[0] === 'plugins') return 'ns-plugin-';
  return 'ns-';
}

for (const s of skills) {
  const errors = [], warnings = [], info = { category: s.category, depth: s.depth };
  const { src, fm, body } = readSkill(s);
  if (!fm) errors.push('missing YAML frontmatter');
  const name = fm?.name, desc = fm?.description;
  if (!name) errors.push('frontmatter: name missing');
  else {
    if (name !== s.name) errors.push(`name "${name}" ≠ directory "${s.name}"`);
    if (!NAME_RE.test(name)) errors.push('name must be lowercase alphanumerics + single hyphens');
    if (name.length > 64) errors.push(`name ${name.length} chars > 64`);
    if (!name.startsWith('ns-')) errors.push('name must start with "ns-" (skills are installed flat next to other packs)');
    const prefix = expectedPrefix(s.category);
    if (prefix !== 'ns-' && !name.startsWith(prefix)) warnings.push(`skills under ${s.category}/ are expected to be named ${prefix}…`);
  }
  if (s.depth > MAX_DEPTH) errors.push(`nested ${s.depth} levels below skills/ — the skills.sh CLI only scans ${MAX_DEPTH}`);
  if (!desc) errors.push('frontmatter: description missing');
  else {
    if (desc.length > 1024) errors.push(`description ${desc.length} chars > 1024`);
    if (desc.length < 60) warnings.push(`description short (${desc.length} chars) — say what AND when`);
    if (!/^Use when/i.test(desc) && !/\bwhen\b/i.test(desc)) warnings.push('description does not state when to use it');
  }
  const allowed = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
  for (const k of Object.keys(fm || {})) if (!allowed.has(k)) warnings.push(`frontmatter key "${k}" is not in the spec (put custom keys under metadata)`);
  if (fm && !fm.license) info.license = 'none (add license: for distribution)';

  const lines = body.split('\n').length;
  const tokens = Math.round(src.length / 4);
  info.lines = lines; info.bytes = src.length; info.approxTokens = tokens;
  if (lines > 500) errors.push(`body ${lines} lines > 500`);
  if (tokens > 5000) warnings.push(`~${tokens} tokens > 5000 guidance`);

  // Cross references to other skills. Element selectors like `ns-panel` are not
  // skill refs — real names have ≥2 hyphens.
  const refs = [...body.matchAll(/`(ns-[a-z0-9-]+)`/g)].map((m) => m[1]).filter((r) => r !== name);
  const unresolved = [...new Set(refs)].filter((r) => !names.has(r) && (r.match(/-/g) || []).length >= 2);
  info.crossRefs = [...new Set(refs)];
  if (unresolved.length) errors.push(`references unknown skills: ${unresolved.join(', ')}`);

  info.verified = /verified/i.test(body);
  if (!info.verified && !/sanity checks? that passed|cross-check|matched/i.test(body)) warnings.push('no "Verified …" / provenance line');
  info.untestedMarks = (body.match(/untested/gi) || []).length;

  info.codeBlocks = (body.match(/^```/gm) || []).length / 2;
  if (info.codeBlocks === 0) warnings.push('no code blocks (skills here are code-first)');
  if (/\t/.test(body)) warnings.push('contains tab characters');
  if (/^\s*#?\s*…\s*$|\/\* … \*\/|# .*… *$/m.test(body)) warnings.push('code block contains an elided "…" section');

  const extFiles = [...body.matchAll(/(?:assets\/)?(?:patches|scripts|references)\/[^\s`)]+/g)].map((m) => m[0]);
  for (const f of new Set(extFiles)) if (!fs.existsSync(path.join(s.dir, f))) warnings.push(`mentions "${f}" which is not bundled with the skill`);
  const supporting = [...walkFiles(s.dir)].filter((f) => f !== 'SKILL.md');
  info.supportingFiles = supporting;
  const nested = supporting.filter((f) => path.basename(f) === 'SKILL.md');
  if (nested.length) errors.push(`contains nested SKILL.md (${nested.join(', ')}) — supporting files go in scripts/, assets/ or references/`);

  const task = taskBySkill.get(s.name);
  if (!task) errors.push('no task in evals/tasks.mjs');
  else info.task = task.name;

  report.push({ skill: s.name, category: s.category, errors, warnings, info });
}

const totalErr = report.reduce((n, r) => n + r.errors.length, 0) + treeErrors.length;
const totalWarn = report.reduce((n, r) => n + r.warnings.length, 0);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ skills: report, tree: treeErrors, categories: categories.map(({ rel, title, skills: s }) => ({ rel, title, skills: s })), errors: totalErr, warnings: totalWarn }, null, 2));
} else {
  for (const e of treeErrors) console.log(`✗ tree: ${e}`);
  let lastCat = null;
  for (const r of report) {
    if (r.category !== lastCat) { console.log(`\n${r.category}/`); lastCat = r.category; }
    const status = r.errors.length ? '✗' : r.warnings.length ? '△' : '✓';
    console.log(`  ${status} ${r.skill}  (${r.info.lines} lines, ~${r.info.approxTokens} tok${r.info.verified ? ', verified' : ''}${r.info.untestedMarks ? `, ${r.info.untestedMarks} untested marks` : ''})`);
    for (const e of r.errors) console.log(`      error: ${e}`);
    for (const w of r.warnings) console.log(`      warn:  ${w}`);
  }
  const empty = categories.filter((c) => !c.skills.length && !c.children.length).map((c) => c.rel);
  console.log(`\n${report.length} skills in ${categories.filter((c) => c.skills.length).length} categories, ${totalErr} errors, ${totalWarn} warnings${empty.length ? ` · empty categories: ${empty.join(', ')}` : ''}`);
}
process.exitCode = totalErr ? 1 : 0;
