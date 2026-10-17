import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { preparePlan } from './prepare-plan.mjs';
import { runPlan, type Plan } from './scaffold.mjs';

const skill = fileURLToPath(new URL('../', import.meta.url));
const sample = () => JSON.parse(fs.readFileSync(path.join(skill, 'assets/example-options.json'), 'utf8'));

function workspace(t: { after: (callback: () => void) => void }) {
  const sandbox = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'scaffold-test-'));
  t.after(() => {
    assert.ok(path.dirname(sandbox) === fs.realpathSync(os.tmpdir()));
    fs.rmSync(sandbox, { recursive: true, force: true });
  });
  return { sandbox, target: path.join(sandbox, '目標 project') };
}

function checkLinks(plan: Plan) {
  for (const file of plan.files) {
    assert.ok(!/\{\{(?:RULE_INDEX|MAIN_LINK|TREE|DESCRIPTION)\}\}/u.test(file.content));
    for (const match of file.content.matchAll(/\]\(([^)]+)\)/gu)) {
      if (match[1].startsWith('https://')) continue;
      assert.ok(fs.existsSync(path.resolve(plan.target, path.dirname(file.path), decodeURIComponent(match[1]))), `${file.path}: ${match[1]}`);
    }
  }
}

test('預覽不寫入；只生成待填規範與空目錄，重複執行全部略過', t => {
  const { target } = workspace(t);
  const { plan, tree } = preparePlan(target, sample());
  assert.equal(runPlan(plan).ok, true);
  assert.equal(fs.existsSync(target), false);
  assert.equal(runPlan(plan, true).ok, true);
  assert.equal(plan.files.length, 5);
  assert.match(fs.readFileSync(path.join(target, '.agent-rules/tech-stack.md'), 'utf8'), /待專案確認/u);
  assert.deepEqual(fs.readdirSync(path.join(target, 'docs/tracking/devlog')), []);
  assert.deepEqual(fs.readdirSync(path.join(target, 'docs/tracking/handoff')), []);
  assert.ok(!fs.existsSync(path.join(target, 'docs/tracking/worklog')));
  assert.ok(!fs.existsSync(path.join(target, '.agents')));
  assert.ok(!fs.existsSync(path.join(target, '.git')));
  assert.match(tree, /專案追蹤主目錄（日誌、交接）/u);
  assert.ok(runPlan(plan, true).entries.every(entry => entry.status === 'skipped'));
  checkLinks(plan);
});

test('主規範、兩區位置與子目錄可改名，自訂用途與關聯保持一致', t => {
  const { target } = workspace(t);
  const choices = sample();
  choices.main.name = 'CLAUDE.md';
  choices.rulesRoot = 'settings/rules';
  choices.docsRoot = 'documents';
  choices.rules = choices.rules.filter((rule: { name: string }) => rule.name !== 'verification.md');
  choices.rules[1].name = 'structure.md';
  choices.rules.push({ name: 'security [access].md', description: '機密 | 權限',
    content: '# 安全規範\n\n[主規範]({{MAIN_LINK}})\n\n{{DESCRIPTION}}\n\n## 待補規則\n\n待確認。\n' });
  choices.directories = [
    { path: 'progress', description: '專案追蹤主目錄（日誌）' },
    { path: 'progress/journal', description: '開發日誌' },
    { path: '會議 紀錄', description: '會議紀錄與決議' },
  ];
  const { plan, tree } = preparePlan(target, choices);
  assert.equal(runPlan(plan, true).ok, true);
  assert.ok(fs.existsSync(path.join(target, 'CLAUDE.md')));
  assert.ok(!fs.existsSync(path.join(target, 'AGENTS.md')));
  assert.ok(!fs.existsSync(path.join(target, '.agent-rules')));
  assert.ok(!fs.existsSync(path.join(target, 'docs')));
  assert.ok(fs.existsSync(path.join(target, 'documents/progress/journal')));
  assert.ok(!fs.existsSync(path.join(target, 'documents/progress/handoff')));
  assert.match(tree, /會議 紀錄\/  # 會議紀錄與決議/u);
  const master = fs.readFileSync(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.ok(master.includes('機密 \\| 權限'));
  assert.ok(!master.includes('verification.md'));
  checkLinks(plan);
});

test('全部細則及目錄略過時只建立單一主規範，規範與目錄不強制綁定', t => {
  const { target, sandbox } = workspace(t);
  const choices = sample();
  choices.rules = [];
  choices.directories = [];
  const { plan, tree } = preparePlan(target, choices);
  assert.equal(plan.files.length, 1);
  assert.deepEqual(plan.directories, []);
  assert.equal(runPlan(plan, true).ok, true);
  assert.deepEqual(fs.readdirSync(target), ['AGENTS.md']);
  assert.ok(!tree.includes('.agent-rules'));
  assert.ok(!tree.includes('docs'));
  checkLinks(plan);
  choices.rules = [sample().rules.find((rule: { name: string }) => rule.name === 'tracking.md')];
  const other = preparePlan(path.join(sandbox, 'rules-only'), choices).plan;
  assert.equal(runPlan(other, true).ok, true);
  assert.ok(!fs.existsSync(path.join(other.target, 'docs')));
  checkLinks(other);
});

test('保留 Agent 提供的英文與描述，不套用中文內容或要求語言設定', t => {
  const { target } = workspace(t);
  const main = fs.readFileSync(path.join(skill, 'assets/project-template/AGENTS.md'), 'utf8');
  const rule = fs.readFileSync(path.join(skill, 'assets/rule-template.md'), 'utf8');
  const choices = {
    main: { name: 'INSTRUCTIONS.md', description: 'Project instructions', content: main },
    rulesRoot: 'rules', docsRoot: 'documentation',
    rules: [{ name: 'règles.md', description: 'Security and access requirements', content: rule }],
    directories: [{ path: 'research', description: 'Research and evidence' }],
  };
  const { plan, tree } = preparePlan(target, choices);
  assert.equal(runPlan(plan, true).ok, true);
  assert.ok(plan.files.every(file => !/[\u4e00-\u9fff]/u.test(file.content)));
  assert.match(tree, /Research and evidence/u);
  assert.ok(plan.files[1].content.includes('Security and access requirements'));
  checkLinks(plan);
});

test('整份清單預檢衝突；既有內容不變，也不先寫入其他新檔', t => {
  const { target } = workspace(t);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'AGENTS.md'), 'existing');
  const { plan } = preparePlan(target, sample());
  assert.equal(runPlan(plan, true).ok, false);
  assert.equal(fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8'), 'existing');
  assert.deepEqual(fs.readdirSync(target), ['AGENTS.md']);
});

test('拒絕無效名稱、空白用途、重複項目、缺少關聯與舊版欄位', t => {
  const { target } = workspace(t);
  const bad = [
    { ...sample(), rulesRoot: '../outside' },
    { ...sample(), main: { ...sample().main, name: 'nested/AGENTS.md' } },
    { ...sample(), main: { ...sample().main, content: '# Missing index' } },
    { ...sample(), rules: [{ ...sample().rules[0], name: 'not-markdown.txt' }] },
    { ...sample(), rules: [{ ...sample().rules[0], description: ' ' }] },
    { ...sample(), rules: [{ ...sample().rules[0], description: 'line\nbreak' }] },
    { ...sample(), rules: [{ ...sample().rules[0], content: '# Missing master link' }] },
    { ...sample(), rules: [sample().rules[0], sample().rules[0]] },
    { ...sample(), directories: [{ path: 'other', description: '' }] },
    { ...sample(), directories: [{ path: 'Other', description: 'one' }, { path: 'other', description: 'two' }] },
    { ...sample(), tracking: true }, { ...sample(), git: 'push' },
  ];
  for (const input of bad) assert.throws(() => preparePlan(target, input));
  assert.equal(fs.existsSync(target), false);
});

test('路徑逸出、重複／正規化碰撞、檔案作父目錄與不明欄位均拒絕', t => {
  const { target } = workspace(t);
  for (const bad of ['../outside', '/absolute', 'C:/escape', 'a\\b', 'NUL.txt', 'a.', 'a ', 'a//b', 'a/./b', 'a\0b']) {
    assert.throws(() => runPlan({ target, directories: [bad], files: [] }), Error, bad);
  }
  for (const directories of [['a', 'a'], ['A', 'a'], ['Café', 'Cafe\u0301']]) {
    assert.throws(() => runPlan({ target, directories, files: [] }));
  }
  assert.throws(() => runPlan({ target, directories: ['a/b'], files: [{ path: 'a', content: '' }] }));
  assert.throws(() => runPlan({ target, directories: ['a'], files: [{ path: 'a', content: '' }] }));
  assert.throws(() => runPlan({ target, directories: [], files: [], shell: 'anything' }));
  assert.equal(fs.existsSync(target), false);
});

test('生成器仍支援明確指定的零位元組檔案', t => {
  const { target } = workspace(t);
  assert.equal(runPlan({ target, directories: [], files: [{ path: 'empty.md', content: '' }] }, true).ok, true);
  assert.equal(fs.statSync(path.join(target, 'empty.md')).size, 0);
});

test('拒絕目標、父路徑及子路徑的符號連結／junction', t => {
  const { sandbox, target } = workspace(t);
  const outside = path.join(sandbox, 'outside');
  const linked = path.join(sandbox, 'linked');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(runPlan({ target: linked, directories: [], files: [] }, true).ok, false);
  assert.throws(() => runPlan({ target: path.join(linked, 'child'), directories: [], files: [] }, true));
  fs.mkdirSync(target);
  fs.symlinkSync(outside, path.join(target, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(runPlan({ target, directories: ['escape'], files: [{ path: 'escape/file.txt', content: 'no' }] }, true).ok, false);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('既有大小寫別名與檔案／目錄類型衝突不會新增資料', t => {
  const { target } = workspace(t);
  fs.mkdirSync(target);
  fs.mkdirSync(path.join(target, 'Existing'));
  assert.equal(runPlan({ target, directories: ['existing'], files: [] }, true).ok, false);
  fs.writeFileSync(path.join(target, 'blocked'), 'keep');
  assert.equal(runPlan({ target, directories: ['blocked/child'], files: [] }, true).ok, false);
  assert.equal(fs.readFileSync(path.join(target, 'blocked'), 'utf8'), 'keep');
});

test('模擬中途失敗時保留成果，區分 failed 與 pending', t => {
  const { target } = workspace(t);
  const originalWrite = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (...args: Parameters<typeof fs.writeFileSync>) => {
    if (String(args[0]).endsWith('two.txt')) throw new Error('simulated I/O failure');
    return originalWrite(...args);
  });
  const result = runPlan({ target, directories: [], files: [
    { path: 'one.txt', content: 'kept' }, { path: 'two.txt', content: 'fail' }, { path: 'three.txt', content: 'pending' },
  ] }, true);
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(path.join(target, 'one.txt'), 'utf8'), 'kept');
  assert.equal(result.entries.find(entry => entry.path === 'two.txt')!.status, 'failed');
  assert.equal(result.entries.find(entry => entry.path === 'three.txt')!.status, 'pending');
});

test('獨立發布目錄執行 CLI，正式生成重新檢查；選項與清單不被覆寫', t => {
  const { sandbox, target } = workspace(t);
  const isolated = path.join(sandbox, 'isolated-skill');
  fs.cpSync(skill, isolated, { recursive: true, filter: source => !source.split(path.sep).includes('node_modules') });
  const options = path.join(isolated, 'assets/example-options.json');
  const planFile = path.join(sandbox, 'plan.json');
  const invoke = (script: string, args: string[]) => spawnSync(process.execPath,
    [path.join(isolated, 'scripts', script), ...args], { cwd: sandbox, encoding: 'utf8' });
  const args = ['--target', target, '--out', planFile, '--options', options];
  const prepared = invoke('prepare-plan.mjs', args);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.ok(JSON.parse(prepared.stdout).tree.includes('devlog'));
  assert.equal(fs.existsSync(target), false);
  assert.equal(invoke('prepare-plan.mjs', args).status, 0);
  assert.equal(invoke('scaffold.mjs', [planFile]).status, 0);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'AGENTS.md'), 'changed after preview');
  assert.equal(invoke('scaffold.mjs', [planFile, '--apply']).status, 1);
  assert.deepEqual(fs.readdirSync(target), ['AGENTS.md']);
  const valid = path.join(sandbox, 'valid.json');
  assert.equal(invoke('prepare-plan.mjs', ['--target', path.join(sandbox, 'valid-project'), '--out', valid, '--options', options]).status, 0);
  assert.equal(invoke('scaffold.mjs', [valid, '--apply']).status, 0);
  assert.equal(invoke('scaffold.mjs', [valid, '--force']).status, 1);
  fs.writeFileSync(planFile, 'keep existing plan');
  assert.equal(invoke('prepare-plan.mjs', args).status, 1);
  assert.equal(fs.readFileSync(planFile, 'utf8'), 'keep existing plan');
  assert.equal(invoke('prepare-plan.mjs', ['--target', target, '--out', path.join(target, 'bad.json'), '--options', options]).status, 1);
});
