import type { AstNode } from './Ast.js';
import { parseExpression } from './Expression.js';
import { parseFuncBody } from './Value.js';

export function parseTemplate(source: string): AstNode[] {
    return new TemplateParser(source).parseBlock();
}

class TemplateParser {
    private index = 0;

    constructor(private readonly source: string) {}

    parseBlock(stoppers: string[] = []): AstNode[] {
        const nodes: AstNode[] = [];
        while (this.index < this.source.length) {
            if (this.isMarkupStart()) {
                const tag = this.peekTag();
                if (tag && stoppers.some((item) => tagStartsWith(tag, item))) {
                    return nodes;
                }
                nodes.push(this.parseTag());
            } else {
                nodes.push(this.parseText(stoppers));
            }
        }
        if (stoppers.length > 0) {
            throw new Error(`Expected ${stoppers.join(' or ')}`);
        }
        return nodes;
    }

    private parseText(stoppers: string[]): AstNode {
        const start = this.index;
        while (this.index < this.source.length) {
            if (this.isMarkupStart()) {
                const tag = this.peekTag();
                if (tag && stoppers.some((item) => tagStartsWith(tag, item))) break;
                break;
            }
            this.index += 1;
        }
        return { kind: 'text', value: this.source.slice(start, this.index) };
    }

    private isMarkupStart(): boolean {
        if (this.source[this.index] !== '{') return false;
        if (this.source.startsWith('{$', this.index) || this.source.startsWith('{!', this.index)) {
            return true;
        }
        const tag = this.peekTag();
        if (!tag) return false;
        return isStatementTag(tag);
    }

    private parseTag(): AstNode {
        if (this.source.startsWith('{!', this.index)) {
            return this.parsePrint(true);
        }
        if (this.source.startsWith('{$', this.index)) {
            return this.parsePrint(false);
        }
        const tag = this.readTagContent();
        if (tag.startsWith('let ')) {
            return this.parseLet(tag.slice(4).trim());
        }
        if (tag.startsWith('for ')) {
            return this.parseFor(tag.slice(4).trim());
        }
        if (tag.startsWith('if ')) {
            return this.parseIf(tag.slice(3).trim());
        }
        if (tag.startsWith('match ')) {
            return this.parseMatch(tag.slice(6).trim());
        }
        if (tag.startsWith('func ')) {
            return this.parseFunc(tag);
        }
        if (tag.startsWith('sub ')) {
            return this.parseSub(tag.slice(4).trim());
        }
        if (isInvokeTag(tag)) {
            return this.parseInvoke(tag);
        }
        throw new Error(`Unknown tag "{${tag}}"`);
    }

    private parsePrint(raw: boolean): AstNode {
        const open = raw ? '{!' : '{$';
        this.index += open.length;
        const start = this.index;
        while (this.index < this.source.length && this.source[this.index] !== '}') {
            this.index += 1;
        }
        if (this.source[this.index] !== '}') {
            throw new Error('Unterminated print expression');
        }
        const body = this.source.slice(start, this.index).trim();
        this.index += 1;
        return {
            kind: 'print',
            raw,
            expression: parseExpression(raw ? body : rewritePrintBody(body)),
        };
    }

    private parseLet(body: string): AstNode {
        const match = body.match(/^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/);
        if (!match) {
            throw new Error(`Invalid let tag "{let ${body}}"`);
        }
        return {
            kind: 'let',
            name: match[1]!,
            expression: parseExpression(match[2]!),
        };
    }

    private parseFor(header: string): AstNode {
        const range = header.match(/^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)\s+(downto|to)\s+([\s\S]+)$/);
        const pair = header.match(/^\$([A-Za-z_][A-Za-z0-9_]*)\s*,\s*\$([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([\s\S]+)$/);
        const single = header.match(/^\$([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([\s\S]+)$/);
        const match = range ?? pair ?? single;
        if (!match) {
            throw new Error(`Invalid for tag "{for ${header}}"`);
        }
        const body = this.parseBlock(['/for']);
        this.expectTag('/for');
        if (range) {
            return {
                kind: 'forRange',
                name: range[1]!,
                from: parseExpression(range[2]!.trim()),
                to: parseExpression(range[4]!.trim()),
                down: range[3] === 'downto',
                body,
            };
        }
        if (pair) {
            return {
                kind: 'for',
                key: pair[1]!,
                name: pair[2]!,
                expression: parseExpression(pair[3]!),
                body,
            };
        }
        return {
            kind: 'for',
            name: match[1]!,
            expression: parseExpression(match[2]!),
            body,
        };
    }

    private parseIf(firstCondition: string): AstNode {
        const branches: { condition: ReturnType<typeof parseExpression> | null; body: AstNode[] }[] = [];
        let condition: string | null = firstCondition;
        while (true) {
            const body = this.parseBlock(['elif', 'else if', 'else', '/if']);
            branches.push({
                condition: condition === null ? null : parseExpression(condition),
                body,
            });
            const next = this.peekTag();
            if (next === 'else') {
                this.expectTag('else');
                condition = null;
                continue;
            }
            if (next?.startsWith('elif ')) {
                condition = this.readTagContent().slice(5).trim();
                continue;
            }
            if (next?.startsWith('else if ')) {
                condition = this.readTagContent().slice(8).trim();
                continue;
            }
            if (next === '/if') {
                this.expectTag('/if');
                break;
            }
            throw new Error('Expected elif, else or /if');
        }
        return { kind: 'if', branches };
    }

    private parseMatch(header: string): AstNode {
        const expression = parseExpression(header);
        const arms: { value: ReturnType<typeof parseExpression> | null; body: AstNode[] }[] = [];
        while (true) {
            this.skipWhitespaceText();
            const next = this.peekTag();
            if (next === '/match') {
                this.expectTag('/match');
                break;
            }
            if (next?.startsWith('with ')) {
                const pattern = this.readTagContent().slice(5).trim();
                const value = pattern === '_' ? null : parseExpression(pattern);
                const body = this.parseBlock(['/with']);
                this.expectTag('/with');
                arms.push({ value, body });
                continue;
            }
            throw new Error('Expected {with …} or {/match}');
        }
        return { kind: 'match', expression, arms };
    }

    private parseFunc(tag: string): AstNode {
        const match = tag.match(/^func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*?)\)\s*->\s*([\s\S]+)$/);
        if (!match) {
            throw new Error(`Invalid func tag "{${tag}}"`);
        }
        const parsed = parseFuncBody(match[3]!);
        return {
            kind: 'func',
            name: match[1]!,
            params: parseParamList(match[2]!),
            lets: parsed.lets,
            body: parsed.body,
        };
    }

    private parseSub(header: string): AstNode {
        const match = header.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/);
        if (!match) {
            throw new Error(`Invalid sub tag "{sub ${header}}"`);
        }
        const body = this.parseBlock(['/sub']);
        this.expectTag('/sub');
        return {
            kind: 'sub',
            name: match[1]!,
            params: parseParamList(match[2]!),
            body,
        };
    }

    private parseInvoke(tag: string): AstNode {
        const expression = parseExpression(tag);
        if (expression.kind !== 'call') {
            throw new Error(`Invalid call "{${tag}}"`);
        }
        return { kind: 'invoke', name: expression.name, args: expression.args };
    }

    private skipWhitespaceText(): void {
        while (this.index < this.source.length) {
            if (this.isMarkupStart()) return;
            if (/\s/.test(this.source[this.index] ?? '') === false) return;
            this.index += 1;
        }
    }

    private peekTag(): string | undefined {
        if (this.source[this.index] !== '{') return undefined;
        if (this.source.startsWith('{$', this.index) || this.source.startsWith('{!', this.index)) {
            return undefined;
        }
        const end = findClosingBrace(this.source, this.index + 1);
        if (end < 0) return undefined;
        return this.source.slice(this.index + 1, end).trim();
    }

    private readTagContent(): string {
        if (this.source[this.index] !== '{') {
            throw new Error('Expected "{"');
        }
        const end = findClosingBrace(this.source, this.index + 1);
        if (end < 0) {
            throw new Error('Unterminated tag');
        }
        const content = this.source.slice(this.index + 1, end).trim();
        this.index = end + 1;
        return content;
    }

    private expectTag(name: string): void {
        const content = this.readTagContent();
        if (content !== name) {
            throw new Error(`Expected "{${name}}" got "{${content}}"`);
        }
    }
}

function rewritePrintBody(body: string): string {
    const trimmed = body.trim();
    if (trimmed.startsWith('$')) return trimmed;
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(trimmed)) return trimmed;
    return `$${trimmed}`;
}

function parseParamList(source: string): string[] {
    const trimmed = source.trim();
    if (trimmed === '') return [];
    return trimmed.split(',').map((part) => {
        const match = part.trim().match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
        if (!match) {
            throw new Error(`Invalid parameter "${part.trim()}"`);
        }
        return match[1]!;
    });
}

function findClosingBrace(source: string, start: number): number {
    let depth = 1;
    let quote = '';
    for (let index = start; index < source.length; index += 1) {
        const char = source[index] ?? '';
        if (quote !== '') {
            if (char === '\\') {
                index += 1;
                continue;
            }
            if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '{') {
            depth += 1;
            continue;
        }
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return -1;
}

function isInvokeTag(tag: string): boolean {
    const match = tag.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!match) return false;
    const name = match[1]!;
    return name !== 'if'
        && name !== 'for'
        && name !== 'let'
        && name !== 'func'
        && name !== 'sub'
        && name !== 'match'
        && name !== 'with';
}

function isStatementTag(tag: string): boolean {
    return tag === 'else'
        || tag === '/for'
        || tag === '/if'
        || tag === '/with'
        || tag === '/match'
        || tag.startsWith('let ')
        || tag.startsWith('for ')
        || tag.startsWith('if ')
        || tag.startsWith('elif ')
        || tag.startsWith('else if ')
        || tag.startsWith('match ')
        || tag.startsWith('with ')
        || tag.startsWith('func ')
        || tag.startsWith('sub ')
        || tag === '/sub'
        || isInvokeTag(tag);
}

function tagStartsWith(tag: string, stopper: string): boolean {
    if (stopper === 'else') {
        return tag === 'else' || tag.startsWith('else if ');
    }
    if (tag === stopper) return true;
    return tag.startsWith(`${stopper} `) || tag.startsWith(`${stopper}`);
}
