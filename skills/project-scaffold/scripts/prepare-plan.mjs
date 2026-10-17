import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { inside, portablePath, record, validatePlan } from './scaffold.mjs';
function text(value, label) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(`${label} must be non-empty text`);
    return value;
}
function description(value) {
    const result = text(value, 'description');
    if (/[\r\n\x00-\x1f]/u.test(result))
        throw new Error('description must be a single line');
    return result;
}
function filename(value) {
    const result = portablePath(value);
    if (result.includes('/') || !result.toLowerCase().endsWith('.md'))
        throw new Error('Use a Markdown filename without directories');
    return result;
}
function markdown(value) {
    return value.replace(/[\\|[\]`*_<>]/gu, '\\$&');
}
function link(value) {
    return value.split('/').map(part => encodeURIComponent(part)
        .replace(/[!'()*]/gu, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}
function tree(plan, descriptions) {
    const nodes = new Map([['', new Set()]]);
    const directories = new Set(plan.directories);
    for (const relative of [...plan.directories, ...plan.files.map(file => file.path)]) {
        let parent = '';
        for (const part of relative.split('/')) {
            const current = parent ? `${parent}/${part}` : part;
            if (!nodes.has(parent))
                nodes.set(parent, new Set());
            nodes.get(parent).add(current);
            parent = current;
        }
    }
    const visit = (parent, prefix) => {
        const children = [...(nodes.get(parent) ?? [])].sort((a, b) => Number(directories.has(b) || nodes.has(b)) - Number(directories.has(a) || nodes.has(a)) || a.localeCompare(b));
        return children.flatMap((child, index) => {
            const last = index === children.length - 1;
            const purpose = descriptions.get(child);
            return [`${prefix}${last ? '└── ' : '├── '}${path.posix.basename(child)}${directories.has(child) || nodes.has(child) ? '/' : ''}${purpose ? `  # ${purpose}` : ''}`,
                ...visit(child, `${prefix}${last ? '    ' : '│   '}`)];
        });
    };
    return ['./', ...visit('', '')].join('\n');
}
export function preparePlan(target, input) {
    record(input, ['main', 'rulesRoot', 'docsRoot', 'rules', 'directories']);
    record(input.main, ['name', 'description', 'content']);
    const main = {
        name: filename(input.main.name),
        description: description(input.main.description),
        content: text(input.main.content, 'main.content'),
    };
    const rulesRoot = portablePath(input.rulesRoot);
    const docsRoot = portablePath(input.docsRoot);
    if (!Array.isArray(input.rules) || !Array.isArray(input.directories))
        throw new Error('rules and directories must be arrays');
    const rules = input.rules.map(item => {
        record(item, ['name', 'description', 'content']);
        const rule = { name: filename(item.name), description: description(item.description), content: text(item.content, 'rule.content') };
        if (!rule.content.includes('{{MAIN_LINK}}'))
            throw new Error(`Missing {{MAIN_LINK}} in ${rule.name}`);
        return rule;
    });
    const directories = input.directories.map(item => {
        record(item, ['path', 'description']);
        return { path: portablePath(item.path), description: description(item.description) };
    });
    if (rules.length && !main.content.includes('{{RULE_INDEX}}'))
        throw new Error('main.content must include {{RULE_INDEX}}');
    const plan = {
        target: path.resolve(target),
        directories: directories.map(item => `${docsRoot}/${item.path}`),
        files: [{ path: main.name, content: '' }, ...rules.map(rule => ({ path: `${rulesRoot}/${rule.name}`, content: '' }))],
    };
    validatePlan(plan);
    const descriptions = new Map([
        [main.name, main.description],
        ...rules.map(rule => [`${rulesRoot}/${rule.name}`, rule.description]),
        ...directories.map(item => [`${docsRoot}/${item.path}`, item.description]),
    ]);
    const renderedTree = tree(plan, descriptions);
    const index = rules.map(rule => `| [${markdown(rule.name)}](${link(`${rulesRoot}/${rule.name}`)}) | ${markdown(rule.description)} |`).join('\n');
    const expand = (content, mainLink, purpose) => {
        const values = { RULE_INDEX: index, MAIN_LINK: link(mainLink), TREE: renderedTree, DESCRIPTION: purpose };
        return content.replace(/\{\{(RULE_INDEX|MAIN_LINK|TREE|DESCRIPTION)\}\}/gu, (_, key) => values[key]);
    };
    plan.files[0].content = expand(main.content, main.name, main.description);
    for (const [index, rule] of rules.entries()) {
        const relativeMain = path.posix.relative(rulesRoot, main.name);
        plan.files[index + 1].content = expand(rule.content, relativeMain, rule.description);
    }
    return { plan: validatePlan(plan), tree: renderedTree };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        const { values } = parseArgs({ options: { target: { type: 'string' }, out: { type: 'string' }, options: { type: 'string' } } });
        if (!values.target || !values.out || !values.options)
            throw new Error('Usage: prepare-plan.mjs --target <project> --out <plan.json> --options <choices.json>');
        const choices = JSON.parse(fs.readFileSync(values.options, 'utf8').replace(/^\uFEFF/u, ''));
        const { plan, tree } = preparePlan(values.target, choices);
        const output = path.resolve(values.out);
        if (inside(plan.target, output))
            throw new Error('Store the plan outside the target project');
        const content = `${JSON.stringify(plan, null, 2)}\n`;
        if (fs.existsSync(output)) {
            if (fs.readFileSync(output, 'utf8') !== content)
                throw new Error('Plan already exists with different content; choose a new filename');
        }
        else
            fs.writeFileSync(output, content, { encoding: 'utf8', flag: 'wx' });
        process.stdout.write(`${JSON.stringify({ plan: output, target: plan.target, tree, files: plan.files.map(file => file.path) }, null, 2)}\n`);
    }
    catch (error) {
        process.stderr.write(`${JSON.stringify({ ok: false, error: String(error) })}\n`);
        process.exitCode = 1;
    }
}
