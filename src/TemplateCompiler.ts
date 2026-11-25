import type { AstNode, Expr, ForNode, ForRangeNode, FuncNode, IfNode, InvokeNode, LetNode, MatchNode, SubNode, TemplateMode } from './Ast.js';
import { compileExpression, type CompileEnv } from './Expression.js';

const emptyEnv: CompileEnv = { funcs: new Set(), subs: new Set() };

export function compileNodes(nodes: AstNode[], mode: TemplateMode): string {
    const funcs = nodes.filter((node) => node.kind === 'func');
    const subs = nodes.filter((node) => node.kind === 'sub');
    const body = nodes.filter((node) => node.kind !== 'func' && node.kind !== 'sub');
    const env: CompileEnv = {
        funcs: new Set(funcs.map((node) => node.name)),
        subs: new Set(subs.map((node) => node.name)),
    };
    assertUniqueNames([...funcs, ...subs]);
    const definitions = [
        ...funcs.map((node) => compileFunc(node, env)),
        ...subs.map((node) => compileSub(node, mode, env)),
    ].join('\n  ');
    return `"use strict";
return (() => {
  const __scope = Object.assign(Object.create(null), __data);
  const __funcs = Object.create(null);
  ${definitions}
  return ${compileBlock(body, mode, '__scope', env)};
})();`;
}

function compileBlock(nodes: AstNode[], mode: TemplateMode, scopeVar: string, env: CompileEnv = emptyEnv): string {
    if (nodes.length === 0) return '""';
    const letIndex = nodes.findIndex((node) => node.kind === 'let');
    if (letIndex < 0) {
        return joinOutputs(nodes, mode, scopeVar, env);
    }
    const before = nodes.slice(0, letIndex);
    const letNode = nodes[letIndex] as LetNode;
    const after = nodes.slice(letIndex + 1);
    const nextScope = `${scopeVar}_`;
    const value = compileExpression(letNode.expression, scopeVar, env);
    const inner = `(() => {
  const ${nextScope} = Object.assign(Object.create(null), ${scopeVar}, { ${JSON.stringify(letNode.name)}: ${value} });
  return ${compileBlock(after, mode, nextScope, env)};
})()`;
    if (before.length === 0) {
        return inner;
    }
    return `((${joinOutputs(before, mode, scopeVar, env)}) + (${inner}))`;
}

function joinOutputs(nodes: AstNode[], mode: TemplateMode, scopeVar: string, env: CompileEnv): string {
    if (nodes.length === 0) return '""';
    return nodes.map((node) => compileOutput(node, mode, scopeVar, env)).join(' + ');
}

function compileOutput(node: AstNode, mode: TemplateMode, scopeVar: string, env: CompileEnv): string {
    switch (node.kind) {
        case 'text':
            return JSON.stringify(node.value);
        case 'print':
            return `__rt.print(${compileExpression(node.expression, scopeVar, env)}, ${node.raw ? 'true' : 'false'}, ${JSON.stringify(mode)})`;
        case 'if':
            return compileIf(node, mode, scopeVar, env);
        case 'for':
            return compileFor(node, mode, scopeVar, env);
        case 'forRange':
            return compileForRange(node, mode, scopeVar, env);
        case 'match':
            return compileMatch(node, mode, scopeVar, env);
        case 'invoke':
            return compileInvoke(node, mode, scopeVar, env);
        case 'let':
            throw new Error('let must be handled by compileBlock');
        case 'func':
        case 'sub':
            throw new Error(`${node.kind} must be at the top level`);
    }
}

function compileIf(node: IfNode, mode: TemplateMode, scopeVar: string, env: CompileEnv): string {
    let expression = '""';
    for (let index = node.branches.length - 1; index >= 0; index -= 1) {
        const branch = node.branches[index]!;
        const body = compileBlock(branch.body, mode, scopeVar, env);
        if (branch.condition === null) {
            expression = `(${body})`;
        } else {
            const condition = `__rt.isTruthy(${compileExpression(branch.condition, scopeVar, env)})`;
            expression = `(${condition} ? (${body}) : ${expression})`;
        }
    }
    return expression;
}

function compileFor(node: ForNode, mode: TemplateMode, scopeVar: string, env: CompileEnv): string {
    const body = compileBlock(node.body, mode, scopeVar, env);
    const key = node.key === undefined ? 'undefined' : JSON.stringify(node.key);
    const list = compileExpression(node.expression, scopeVar, env);
    return `__rt.map(${list}, ${JSON.stringify(node.name)}, ${scopeVar}, (${scopeVar}) => (${body}), ${key})`;
}

function compileForRange(node: ForRangeNode, mode: TemplateMode, scopeVar: string, env: CompileEnv): string {
    const body = compileBlock(node.body, mode, scopeVar, env);
    const from = compileExpression(node.from, scopeVar, env);
    const to = compileExpression(node.to, scopeVar, env);
    return `__rt.range(${from}, ${to}, ${node.down ? 'true' : 'false'}, ${JSON.stringify(node.name)}, ${scopeVar}, (${scopeVar}) => (${body}))`;
}

function compileMatch(node: MatchNode, mode: TemplateMode, scopeVar: string, env: CompileEnv): string {
    let expression = '""';
    for (let index = node.arms.length - 1; index >= 0; index -= 1) {
        const arm = node.arms[index]!;
        const body = compileBlock(arm.body, mode, scopeVar, env);
        if (arm.value === null) {
            expression = `(${body})`;
        } else {
            expression = `(__match == ${compileExpression(arm.value, scopeVar, env)} ? (${body}) : ${expression})`;
        }
    }
    return `(() => {
  const __match = ${compileExpression(node.expression, scopeVar, env)};
  return ${expression};
})()`;
}

function compileInvoke(node: InvokeNode, mode: TemplateMode, scopeVar: string, env: CompileEnv): string {
    const call = compileCall(node.name, node.args, scopeVar, env);
    if (env.subs.has(node.name)) return call;
    return `__rt.print(${call}, false, ${JSON.stringify(mode)})`;
}

function compileFunc(node: FuncNode, env: CompileEnv): string {
    return compileDefinition(node.name, node.params, (scope) => {
        let current = scope;
        const lines: string[] = [];
        for (const binding of node.lets) {
            const next = `${current}_`;
            const value = compileExpression(binding.expression, current, env);
            lines.push(`const ${next} = Object.assign(Object.create(null), ${current}, { ${JSON.stringify(binding.name)}: ${value} });`);
            current = next;
        }
        lines.push(`return ${compileExpression(node.body, current, env)};`);
        return lines;
    });
}

function compileSub(node: SubNode, mode: TemplateMode, env: CompileEnv): string {
    return compileDefinition(node.name, node.params, (scope) => {
        return [`return ${compileBlock(node.body, mode, scope, env)};`];
    });
}

function compileDefinition(name: string, params: string[], build: (scope: string) => string[]): string {
    const args = params.map((_, index) => `__p${index}`);
    let scope = '__scope';
    const lines: string[] = [];
    if (params.length > 0) {
        const fields = params.map((param, index) => `${JSON.stringify(param)}: __p${index}`).join(', ');
        lines.push(`const __scope_ = Object.assign(Object.create(null), __scope, { ${fields} });`);
        scope = '__scope_';
    }
    lines.push(...build(scope));
    const header = [...args, '__scope'].join(', ');
    return `__funcs[${JSON.stringify(name)}] = function(${header}) {\n    ${lines.join('\n    ')}\n  };`;
}

function compileCall(name: string, args: Expr[], scopeVar: string, env: CompileEnv): string {
    if (env.funcs.has(name) === false && env.subs.has(name) === false) {
        throw new Error(`Unknown call "{${name}(...)}"`);
    }
    const values = args.map((arg) => compileExpression(arg, scopeVar, env)).join(', ');
    return `__funcs[${JSON.stringify(name)}](${values}, ${scopeVar})`;
}

function assertUniqueNames(nodes: { name: string }[]): void {
    const names = new Set<string>();
    for (const node of nodes) {
        if (names.has(node.name)) {
            throw new Error(`Duplicate definition "${node.name}"`);
        }
        names.add(node.name);
    }
}
