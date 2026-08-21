// Discovery of the nested skills tree. Shared by the lint, the eval build, the
// manifest sync and the vendoring CLI so every consumer agrees on what a skill
// is: a directory containing SKILL.md. Any other directory is a category and is
// searched recursively. Zero dependencies; Node ≥ 18.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const skillsRoot = path.join(root, 'skills');

// The skills.sh CLI (`npx skills add`) stops scanning three directories below skills/.
export const MAX_DEPTH = 3;

export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ignored = (name) => name.startsWith('.') || name.startsWith('_') || name === 'node_modules';

export function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: null, body: src };
  const fm = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv && !line.startsWith(' ')) { key = kv[1]; fm[key] = kv[2].replace(/^['"]|['"]$/g, ''); }
    else if (key && line.startsWith(' ')) fm[key] = (fm[key] ? fm[key] + '\n' : '') + line.trim();
  }
  return { fm, body: src.slice(m[0].length) };
}

// First heading + first paragraph of a category README.
function readCategoryDoc(dir) {
  const file = path.join(dir, 'README.md');
  if (!fs.existsSync(file)) return { title: null, description: null, hasReadme: false };
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let title = null, description = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!title) { const h = l.match(/^#\s+(.+)$/); if (h) title = h[1].trim(); continue; }
    if (l.trim()) {
      const para = [];
      for (let j = i; j < lines.length && lines[j].trim(); j++) para.push(lines[j].trim());
      description = para.join(' ');
      break;
    }
  }
  return { title, description, hasReadme: true };
}

/**
 * @returns {{ skills: Skill[], categories: Category[] }}
 * Skill:    { name, dir, rel, category, depth, skillMd }
 * Category: { rel, dir, depth, title, description, hasReadme, skills: string[], children: string[] }
 */
export function discover(rootDir = skillsRoot) {
  const skills = [], categories = [];
  const walk = (dir, rel, depth) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !ignored(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const d = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (fs.existsSync(path.join(d, 'SKILL.md'))) {
        skills.push({ name: e.name, dir: d, rel: r, category: rel, depth: depth + 1, skillMd: path.join(d, 'SKILL.md') });
      } else {
        const cat = { rel: r, dir: d, depth: depth + 1, ...readCategoryDoc(d), skills: [], children: [] };
        categories.push(cat);
        walk(d, r, depth + 1);
      }
    }
  };
  walk(rootDir, '', 0);
  const byRel = Object.fromEntries(categories.map((c) => [c.rel, c]));
  for (const s of skills) if (byRel[s.category]) byRel[s.category].skills.push(s.name);
  for (const c of categories) {
    const parent = c.rel.includes('/') ? byRel[c.rel.slice(0, c.rel.lastIndexOf('/'))] : null;
    if (parent) parent.children.push(c.rel);
  }
  return { skills, categories };
}

export const discoverSkills = (rootDir) => discover(rootDir).skills;

export function findSkill(name, rootDir) {
  return discoverSkills(rootDir).find((s) => s.name === name) || null;
}

export function readSkill(skill) {
  const src = fs.readFileSync(skill.skillMd, 'utf8');
  return { src, ...parseFrontmatter(src) };
}

export function* walkFiles(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const r = path.join(rel, e.name);
    if (e.isDirectory()) yield* walkFiles(path.join(dir, e.name), r); else yield r;
  }
}
