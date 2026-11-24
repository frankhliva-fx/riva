import type { AstNode } from './Ast.ts';
import { parseExpression } from './Expression.ts';

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
        const arms: { value: ReturnType<typeof parseExpression>; body: AstNode[] }[] = [];
        while (true) {
            this.skipWhitespaceText();
            const next = this.peekTag();
            if (next === '/match') {
                this.expectTag('/match');
                break;
            }
            if (next?.startsWith('with ')) {
                const value = parseExpression(this.readTagContent().slice(5).trim());
                const body = this.parseBlock(['/with']);
                this.expectTag('/with');
                arms.push({ value, body });
                continue;
            }
            throw new Error('Expected {with …} or {/match}');
        }
        return { kind: 'match', expression, arms };
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
        const start = this.index + 1;
        let end = start;
        while (end < this.source.length && this.source[end] !== '}') end += 1;
        if (end >= this.source.length) return undefined;
        return this.source.slice(start, end).trim();
    }

    private readTagContent(): string {
        if (this.source[this.index] !== '{') {
            throw new Error('Expected "{"');
        }
        this.index += 1;
        const start = this.index;
        while (this.index < this.source.length && this.source[this.index] !== '}') {
            this.index += 1;
        }
        if (this.source[this.index] !== '}') {
            throw new Error('Unterminated tag');
        }
        const content = this.source.slice(start, this.index).trim();
        this.index += 1;
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
    return `$${trimmed}`;
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
        || tag.startsWith('with ');
}

function tagStartsWith(tag: string, stopper: string): boolean {
    if (stopper === 'else') {
        return tag === 'else' || tag.startsWith('else if ');
    }
    if (tag === stopper) return true;
    return tag.startsWith(`${stopper} `) || tag.startsWith(`${stopper}`);
}
