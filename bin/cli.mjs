#!/usr/bin/env node
// @nativescript/skills — vendor the skills into a project (or globally) and
// keep the copies updatable.
//
//   npx @nativescript/skills install [--agent claude,agents,cursor,…] [--global] [--only a,b] [--dir path]
//   npx @nativescript/skills update  [--force]
//   npx @nativescript/skills check
//   npx @nativescript/skills list
//
// The repo keeps skills in categories (skills/<category>/<name>/); installs are
// FLAT — every agent expects <skills-dir>/<name>/SKILL.md — so the category is
// dropped on copy and names must be unique (the lint enforces that).
// Copies (never symlinks) and writes a manifest (.nativescript-skills.json)
// with the package version and a content hash per file. `update` re-copies
// from the currently resolved package version and refuses to overwrite files
// you edited locally unless --force is given. Zero dependencies; Node ≥ 18.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { root as pkgRoot, discover, readSkill, walkFiles } from '../lib/skills.mjs';

const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
const MANIFEST = '.nativescript-skills.json';

// Where each agent looks for skills, relative to the project root (or $HOME with --global).
// `agents` is the cross-agent convention (.agents/skills) read by Cursor, Codex, Copilot,
// Gemini CLI, OpenCode, Amp and others; use it when you are unsure.
const AGENT_DIRS = {
  claude: '.claude/skills',
  agents: '.agents/skills',
  cursor: '.cursor/skills',
  codex: '.codex/skills',
  copilot: '.github/skills',
  gemini: '.gemini/skills',
  windsurf: '.windsurf/skills',
  opencode: '.opencode/skills',
};

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('-')) || 'help';
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => { const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`)); if (i < 0) return null; const a = argv[i]; return a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1]; };
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

const root = flag('global') ? os.homedir() : process.cwd();
const manifestPath = path.join(root, MANIFEST);
const readManifest = () => (fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

const { skills: allSkills } = discover();
const byName = Object.fromEntries(allSkills.map((s) => [s.name, s]));

// `--only` accepts skill names and category paths (e.g. `ios`, `frontend/angular`).
function select(only) {
  if (!only.length) return allSkills.map((s) => s.name);
  const out = new Set();
  for (const tok of only) {
    if (byName[tok]) { out.add(tok); continue; }
    const inCat = allSkills.filter((s) => s.category === tok || s.category.startsWith(tok + '/'));
    if (!inCat.length) { console.error(`no such skill or category: ${tok}`); process.exit(2); }
    for (const s of inCat) out.add(s.name);
  }
  return [...out];
}

function targetsFor(agents, dir) {
  if (dir) return [{ agent: 'custom', dir: path.resolve(root, dir) }];
  return agents.map((a) => {
    if (!AGENT_DIRS[a]) { console.error(`unknown agent "${a}" — known: ${Object.keys(AGENT_DIRS).join(', ')} (or --dir <path>)`); process.exit(2); }
    return { agent: a, dir: path.join(root, AGENT_DIRS[a]) };
  });
}

function copySkill(name, destRoot, files) {
  const src = byName[name].dir, dest = path.join(destRoot, name);
  fs.mkdirSync(dest, { recursive: true });
  for (const rel of walkFiles(src)) {
    const buf = fs.readFileSync(path.join(src, rel));
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.writeFileSync(path.join(dest, rel), buf);
    files[path.join(name, rel)] = sha(buf);
  }
}

function install({ agents, only, dir, quiet }) {
  const names = select(only);
  const targets = targetsFor(agents, dir);
  const manifest = { package: pkg.name, version: pkg.version, installedAt: new Date().toISOString(), targets: [] };
  for (const t of targets) {
    const files = {};
    fs.mkdirSync(t.dir, { recursive: true });
    for (const n of names) copySkill(n, t.dir, files);
    manifest.targets.push({ agent: t.agent, dir: path.relative(root, t.dir) || '.', skills: names, files });
    if (!quiet) console.log(`✓ ${names.length} skills → ${path.relative(process.cwd(), t.dir) || t.dir}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  if (!quiet) console.log(`  manifest: ${path.relative(process.cwd(), manifestPath)} (v${pkg.version})`);
}

function drift(m) {
  // returns [{target, file, state: 'modified'|'missing'|'stale'|'new'|'removed-upstream'}]
  const out = [];
  for (const t of m.targets) {
    const base = path.join(root, t.dir);
    for (const [rel, hash] of Object.entries(t.files)) {
      const p = path.join(base, rel);
      if (!fs.existsSync(p)) { out.push({ target: t.dir, file: rel, state: 'missing' }); continue; }
      const cur = sha(fs.readFileSync(p));
      const [name, ...rest] = rel.split(path.sep);
      const srcP = byName[name] ? path.join(byName[name].dir, ...rest) : null;
      const upstream = srcP && fs.existsSync(srcP) ? sha(fs.readFileSync(srcP)) : null;
      if (cur !== hash) out.push({ target: t.dir, file: rel, state: 'modified' });
      else if (upstream && upstream !== hash) out.push({ target: t.dir, file: rel, state: 'stale' });
      else if (!upstream) out.push({ target: t.dir, file: rel, state: 'removed-upstream' });
    }
    for (const n of t.skills) {
      if (!byName[n]) continue;
      for (const rel of walkFiles(byName[n].dir)) {
        const key = path.join(n, rel);
        if (!(key in t.files)) out.push({ target: t.dir, file: key, state: 'new' });
      }
    }
  }
  return out;
}

function check() {
  const m = readManifest();
  if (!m) { console.log(`no ${MANIFEST} in ${root} — run \`install\` first`); process.exit(1); }
  const d = drift(m);
  console.log(`installed v${m.version}, package v${pkg.version}${m.version !== pkg.version ? '  ← update available' : ''}`);
  if (!d.length) { console.log('✓ vendored copies match the installed package'); return 0; }
  for (const x of d) console.log(`  ${x.state.padEnd(16)} ${x.target}/${x.file}`);
  const modified = d.filter((x) => x.state === 'modified').length;
  console.log(`\n${d.length} difference(s)${modified ? `, ${modified} locally modified (update needs --force to overwrite them)` : ''}`);
  return d.length ? 1 : 0;
}

function update({ force }) {
  const m = readManifest();
  if (!m) { console.log(`no ${MANIFEST} in ${root} — run \`install\` first`); process.exit(1); }
  const modified = drift(m).filter((x) => x.state === 'modified');
  if (modified.length && !force) {
    console.error(`refusing to overwrite ${modified.length} locally modified file(s); re-run with --force or revert them:`);
    for (const x of modified) console.error(`  ${x.target}/${x.file}`);
    process.exit(1);
  }
  const targets = m.targets.map((t) => ({ agent: t.agent, dir: path.join(root, t.dir), skills: t.skills }));
  const manifest = { package: pkg.name, version: pkg.version, installedAt: new Date().toISOString(), targets: [] };
  for (const t of targets) {
    const files = {};
    const names = t.skills.filter((n) => byName[n]);
    const gone = t.skills.filter((n) => !names.includes(n));
    for (const n of names) copySkill(n, t.dir, files);
    // remove files that no longer exist upstream for skills we manage
    for (const rel of Object.keys(t.files || {})) {
      const [name] = rel.split(path.sep);
      if (names.includes(name) && !(rel in files)) { try { fs.unlinkSync(path.join(t.dir, rel)); } catch {} }
    }
    manifest.targets.push({ agent: t.agent, dir: path.relative(root, t.dir) || '.', skills: names, files });
    console.log(`✓ ${names.length} skills refreshed → ${path.relative(process.cwd(), t.dir) || t.dir}${gone.length ? `  (no longer upstream: ${gone.join(', ')} — left in place)` : ''}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`  ${m.version} → ${pkg.version}`);
}

switch (cmd) {
  case 'install': case 'add':
    install({ agents: list(opt('agent')).length ? list(opt('agent')) : ['claude'], only: list(opt('only')), dir: opt('dir'), quiet: flag('quiet') });
    break;
  case 'update': case 'sync':
    update({ force: flag('force') });
    break;
  case 'check': case 'status':
    process.exit(check());
  case 'list': case 'ls': {
    let last = null;
    for (const s of allSkills) {
      if (s.category !== last) { console.log(`${last === null ? '' : '\n'}${s.category}/`); last = s.category; }
      console.log(`  ${s.name.padEnd(42)} ${(readSkill(s).fm?.description || '').trim()}`);
    }
    if (!allSkills.length) console.log('(no skills)');
    break;
  }
  default:
    console.log(`${pkg.name} v${pkg.version}

  install [--agent claude,agents,cursor,codex,copilot,gemini,windsurf,opencode] [--global] [--only <skill|category>,…] [--dir path]
          copy the skills into each agent's skills directory (default: claude → .claude/skills)
  update  [--force]   re-copy from the installed package version; keeps your local edits unless --force
  check               show which vendored files are stale / modified / missing
  list                list skills by category with their descriptions

  Prefer skills.sh?  npx skills add NativeScript/skills
  Claude Code plugin? /plugin marketplace add NativeScript/skills`);
}
