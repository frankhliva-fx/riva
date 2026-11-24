import type { AstNode, ForNode, ForRangeNode, IfNode, LetNode, MatchNode, TemplateMode } from './Ast.ts';
import { compileExpression } from './Expression.ts';

export function compileNodes(nodes: AstNode[], mode: TemplateMode): string {
    return `"use strict";
return (() => {
  const __scope = Object.assign(Object.create(null), __data);
  return ${compileBlock(nodes, mode, '__scope')};
})();`;
}

function compileBlock(nodes: AstNode[], mode: TemplateMode, scopeVar: string): string {
    if (nodes.length === 0) return '""';
    const letIndex = nodes.findIndex((node) => node.kind === 'let');
    if (letIndex < 0) {
        return joinOutputs(nodes, mode, scopeVar);
    }
    const before = nodes.slice(0, letIndex);
    const letNode = nodes[letIndex] as LetNode;
    const after = nodes.slice(letIndex + 1);
    const nextScope = `${scopeVar}_`;
    const inner = `(() => {
  const ${nextScope} = Object.assign(Object.create(null), ${scopeVar}, { ${JSON.stringify(letNode.name)}: ${compileExpression(letNode.expression, scopeVar)} });
  return ${compileBlock(after, mode, nextScope)};
})()`;
    if (before.length === 0) {
        return inner;
    }
    return `((${joinOutputs(before, mode, scopeVar)}) + (${inner}))`;
}

function joinOutputs(nodes: AstNode[], mode: TemplateMode, scopeVar: string): string {
    if (nodes.length === 0) return '""';
    return nodes.map((node) => compileOutput(node, mode, scopeVar)).join(' + ');
}

function compileOutput(node: AstNode, mode: TemplateMode, scopeVar: string): string {
    switch (node.kind) {
        case 'text':
            return JSON.stringify(node.value);
        case 'print':
            return `__rt.print(${compileExpression(node.expression, scopeVar)}, ${node.raw ? 'true' : 'false'}, ${JSON.stringify(mode)})`;
        case 'if':
            return compileIf(node, mode, scopeVar);
        case 'for':
            return compileFor(node, mode, scopeVar);
        case 'forRange':
            return compileForRange(node, mode, scopeVar);
        case 'match':
            return compileMatch(node, mode, scopeVar);
        case 'let':
            throw new Error('let must be handled by compileBlock');
    }
}

function compileIf(node: IfNode, mode: TemplateMode, scopeVar: string): string {
    let expression = '""';
    for (let index = node.branches.length - 1; index >= 0; index -= 1) {
        const branch = node.branches[index]!;
        const body = compileBlock(branch.body, mode, scopeVar);
        if (branch.condition === null) {
            expression = `(${body})`;
        } else {
            const condition = `__rt.isTruthy(${compileExpression(branch.condition, scopeVar)})`;
            expression = `(${condition} ? (${body}) : ${expression})`;
        }
    }
    return expression;
}

function compileFor(node: ForNode, mode: TemplateMode, scopeVar: string): string {
    const body = compileBlock(node.body, mode, scopeVar);
    const key = node.key === undefined ? 'undefined' : JSON.stringify(node.key);
    return `__rt.map(${compileExpression(node.expression, scopeVar)}, ${JSON.stringify(node.name)}, ${scopeVar}, (${scopeVar}) => (${body}), ${key})`;
}

function compileForRange(node: ForRangeNode, mode: TemplateMode, scopeVar: string): string {
    const body = compileBlock(node.body, mode, scopeVar);
    const from = compileExpression(node.from, scopeVar);
    const to = compileExpression(node.to, scopeVar);
    return `__rt.range(${from}, ${to}, ${node.down ? 'true' : 'false'}, ${JSON.stringify(node.name)}, ${scopeVar}, (${scopeVar}) => (${body}))`;
}

function compileMatch(node: MatchNode, mode: TemplateMode, scopeVar: string): string {
    let expression = '""';
    for (let index = node.arms.length - 1; index >= 0; index -= 1) {
        const arm = node.arms[index]!;
        const body = compileBlock(arm.body, mode, scopeVar);
        expression = `(__match == ${compileExpression(arm.value, scopeVar)} ? (${body}) : ${expression})`;
    }
    return `(() => {
  const __match = ${compileExpression(node.expression, scopeVar)};
  return ${expression};
})()`;
}
