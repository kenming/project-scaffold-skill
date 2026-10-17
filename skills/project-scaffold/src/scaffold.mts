import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export interface Plan {
  target: string;
  directories: string[];
  files: { path: string; content: string }[];
}

interface Entry {
  path: string;
  kind: 'directory' | 'file';
  status: 'create' | 'skip' | 'conflict' | 'pending' | 'created' | 'skipped' | 'failed';
  reason?: string;
}

export function record(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) {
    throw new Error(`物件格式或欄位無效；允許：${keys.join(', ')}`);
  }
}

export function portablePath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.split('/').some(part =>
    !part || part === '.' || part === '..' || /[<>:"\\|?*\x00-\x1f]/u.test(part)
    || /[. ]$/u.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    throw new Error(`無效的專案相對路徑：${String(value)}`);
  }
  return value;
}

export function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeAncestors(absolute: string): void {
  const { root } = path.parse(absolute);
  let current = root;
  for (const part of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    const alias = fs.readdirSync(current).find(name => name.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase() && name !== part);
    if (alias) throw new Error(`既有路徑大小寫或正規化不同：${path.join(current, alias)}`);
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`拒絕符號連結或 junction：${current}`);
    if (current !== absolute && !stat.isDirectory()) throw new Error(`父路徑不是目錄：${current}`);
  }
}

export function validatePlan(value: unknown): Plan {
  record(value, ['target', 'directories', 'files']);
  if (typeof value.target !== 'string' || value.target.includes('\0') || !path.isAbsolute(value.target)
    || !Array.isArray(value.directories) || !Array.isArray(value.files)) {
    throw new Error('清單需包含絕對 target、directories 陣列與 files 陣列');
  }
  const target = path.resolve(value.target);
  portablePath(path.relative(path.parse(target).root, target).split(path.sep).join('/'));
  const skillRoot = fileURLToPath(new URL('../', import.meta.url));
  if (target === path.parse(target).root || inside(skillRoot, target)) {
    throw new Error('目標不得為磁碟根目錄或 Skill 內部');
  }
  const names = new Map<string, string>();
  const addName = (relative: string) => {
    const segments = relative.split('/');
    for (let index = 1; index <= segments.length; index++) {
      const prefix = segments.slice(0, index).join('/');
      const canonical = prefix.normalize('NFC').toLowerCase();
      const previous = names.get(canonical);
      if (previous && previous !== prefix) throw new Error(`大小寫或正規化路徑碰撞：${previous} / ${prefix}`);
      names.set(canonical, prefix);
    }
  };
  const directories = value.directories.map(item => portablePath(item));
  const files = value.files.map(item => {
    record(item, ['path', 'content']);
    if (typeof item.content !== 'string') throw new Error('檔案 content 必須為文字');
    return { path: portablePath(item.path), content: item.content };
  });
  const explicit = [...directories, ...files.map(file => file.path)];
  if (new Set(explicit).size !== explicit.length) throw new Error('清單含重複路徑或檔案／目錄碰撞');
  explicit.forEach(addName);
  for (const file of files) {
    if (explicit.some(other => other.startsWith(`${file.path}/`))) {
      throw new Error(`檔案不能同時作為父目錄：${file.path}`);
    }
  }
  return { target, directories, files };
}

function entriesFor(plan: Plan): Entry[] {
  const directories = new Set(plan.directories);
  for (const relative of [...directories, ...plan.files.map(file => file.path)]) {
    let parent = path.posix.dirname(relative);
    while (parent !== '.') {
      directories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  return [
    { path: '.', kind: 'directory', status: 'create' },
    ...[...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
      .map(relative => ({ path: relative, kind: 'directory', status: 'create' } as Entry)),
    ...plan.files.map(file => ({ path: file.path, kind: 'file', status: 'create' } as Entry)),
  ];
}

function inspect(plan: Plan, entry: Entry): void {
  const absolute = path.resolve(plan.target, entry.path);
  safeAncestors(absolute);
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat) { entry.status = 'create'; return; }
  if (entry.kind === 'directory' ? !stat.isDirectory() : !stat.isFile()) {
    throw new Error('既有項目類型不同');
  }
  if (entry.kind === 'file') {
    const content = plan.files.find(file => file.path === entry.path)!.content;
    if (!fs.readFileSync(absolute).equals(Buffer.from(content, 'utf8'))) throw new Error('既有檔案內容不同，不覆寫');
  }
  entry.status = 'skip';
}

export function runPlan(input: unknown, apply = false) {
  const plan = validatePlan(input);
  safeAncestors(path.dirname(plan.target));
  if (!fs.statSync(path.dirname(plan.target), { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('目標的父目錄必須已存在');
  }
  const entries = entriesFor(plan);
  for (const entry of entries) {
    try { inspect(plan, entry); }
    catch (error) { entry.status = 'conflict'; entry.reason = String(error); }
  }
  const result = { mode: apply ? 'apply' : 'preview', target: plan.target,
    ok: !entries.some(entry => entry.status === 'conflict'), entries, error: undefined as string | undefined };
  if (!result.ok || !apply) return result;
  for (const entry of entries) entry.status = 'pending';
  for (const entry of entries) {
    try {
      inspect(plan, entry);
      if (entry.status === 'skip') { entry.status = 'skipped'; continue; }
      const absolute = path.resolve(plan.target, entry.path);
      if (entry.kind === 'directory') fs.mkdirSync(absolute);
      else fs.writeFileSync(absolute, plan.files.find(file => file.path === entry.path)!.content, { encoding: 'utf8', flag: 'wx' });
      entry.status = 'created';
    } catch (error) {
      entry.status = 'failed';
      entry.reason = String(error);
      result.ok = false;
      result.error = '執行中止；失敗項目可能已建立或部分寫入，請檢查，未自動回滾';
      break;
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values, positionals } = parseArgs({ options: { apply: { type: 'boolean', default: false } }, allowPositionals: true });
    if (positionals.length !== 1) throw new Error('用法：node scripts/scaffold.mjs <plan.json> [--apply]；預設只預覽');
    const result = runPlan(JSON.parse(fs.readFileSync(positionals[0], 'utf8').replace(/^\uFEFF/u, '')), values.apply);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: String(error) })}\n`);
    process.exitCode = 1;
  }
}
