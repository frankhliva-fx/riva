import type { Expr, FuncLet } from './Ast.js';
import { parseExpression } from './Expression.js';

const STOP_WORDS = ['downto', 'then', 'else', 'with', 'start', 'match', 'let', 'for', 'if', 'to'];

export function parseFuncBody(source: string): { lets: FuncLet[]; body: Expr } {
    return new ValueParser(source).parseBody();
}

class ValueParser {
    private index = 0;

    constructor(private readonly source: string) {}

    parseBody(): { lets: FuncLet[]; body: Expr } {
        const lets: FuncLet[] = [];
        while (this.peekKeyword('let')) {
            this.expectKeyword('let');
            const name = this.parseDollarName();
            this.expect('=');
            lets.push({ name, expression: this.parseValue() });
        }
        const body = this.parseValue();
        this.expectEnd();
        return { lets, body };
    }

    parseValue(): Expr {
        this.skip();
        if (this.peekKeyword('if')) return this.parseIf();
        if (this.peekKeyword('match')) return this.parseMatch();
        if (this.peekKeyword('for')) return this.parseFor();
        return this.parsePlain();
    }

    expectEnd(): void {
        this.skip();
        if (this.index < this.source.length) {
            throw this.error(`Unexpected "${this.source.slice(this.index)}"`);
        }
    }

    peekKeyword(word: string): boolean {
        this.skip();
        return isKeyword(this.source, this.index, word);
    }

    expectKeyword(word: string): void {
        if (this.peekKeyword(word) === false) {
            throw this.error(`Expected "${word}"`);
        }
        this.index += word.length;
    }

    parseDollarName(): string {
        this.skip();
        if (this.peek() !== '$') {
            throw this.error('Expected $name');
        }
        this.index += 1;
        const name = this.readIdent();
        return name;
    }

    private parseIf(): Expr {
        this.expectKeyword('if');
        const condition = this.parsePlain();
        this.expectKeyword('then');
        const thenExpr = this.parseValue();
        this.expectKeyword('else');
        const elseExpr = this.parseValue();
        return { kind: 'ifValue', condition, then: thenExpr, else: elseExpr };
    }

    private parseMatch(): Expr {
        this.expectKeyword('match');
        const expression = this.parsePlain();
        const arms: { pattern: Expr | null; body: Expr }[] = [];
        if (this.peekKeyword('with') === false) {
            throw this.error('Expected "with"');
        }
        while (this.peekKeyword('with')) {
            this.expectKeyword('with');
            const pattern = this.peekKeyword('_') ? this.parseWildcard() : this.parsePlain();
            this.expectArrow();
            arms.push({ pattern, body: this.parseValue() });
        }
        return { kind: 'matchValue', expression, arms };
    }

    private parseWildcard(): null {
        this.expectKeyword('_');
        return null;
    }

    private parseFor(): Expr {
        this.expectKeyword('for');
        const name = this.parseDollarName();
        if (this.peekKeyword('in')) {
            this.expectKeyword('in');
            const expression = this.parsePlain();
            const loop = this.parseLoopTail();
            return { kind: 'forValue', name, expression, ...loop };
        }
        this.expect('=');
        const from = this.parsePlain();
        const down = this.peekKeyword('downto');
        if (down) {
            this.expectKeyword('downto');
        } else {
            this.expectKeyword('to');
        }
        const to = this.parsePlain();
        const loop = this.parseLoopTail();
        return { kind: 'rangeValue', name, from, to, down, ...loop };
    }

    private parseLoopTail(): { body: Expr; start?: Expr; acc?: string } {
        if (this.peekKeyword('with')) {
            throw this.error('Expected "start" before "with"');
        }
        if (this.peekKeyword('start') === false) {
            this.expectArrow();
            return { body: this.parseValue() };
        }
        this.expectKeyword('start');
        const start = this.parsePlain();
        this.expectKeyword('with');
        const acc = this.parseDollarName();
        this.expectArrow();
        return { body: this.parseValue(), start, acc };
    }

    private parsePlain(): Expr {
        this.skip();
        const start = this.index;
        const end = scanPlainEnd(this.source, start);
        const slice = this.source.slice(start, end).trim();
        if (slice === '') {
            throw this.error('Expected expression');
        }
        this.index = end;
        return parseExpression(slice);
    }

    private expectArrow(): void {
        this.skip();
        if (this.source.startsWith('->', this.index) === false) {
            throw this.error('Expected "->"');
        }
        this.index += 2;
    }

    private expect(token: string): void {
        this.skip();
        if (this.source.startsWith(token, this.index) === false) {
            throw this.error(`Expected "${token}"`);
        }
        this.index += token.length;
    }

    private readIdent(): string {
        const start = this.index;
        const first = this.peek();
        if (isIdentStart(first) === false) {
            throw this.error('Expected name');
        }
        this.index += 1;
        while (isIdentPart(this.peek())) this.index += 1;
        return this.source.slice(start, this.index);
    }

    private peek(): string {
        return this.source[this.index] ?? '';
    }

    private skip(): void {
        while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\n' || this.peek() === '\r') {
            this.index += 1;
        }
    }

    private error(message: string): Error {
        return new Error(`${message} at ${this.index} in func body "${this.source}"`);
    }
}

function scanPlainEnd(source: string, start: number): number {
    let index = start;
    let depth = 0;
    let quote = '';
    while (index < source.length) {
        const char = source[index] ?? '';
        if (quote !== '') {
            if (char === '\\') {
                index += 2;
                continue;
            }
            if (char === quote) quote = '';
            index += 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            index += 1;
            continue;
        }
        if (char === '(') {
            depth += 1;
            index += 1;
            continue;
        }
        if (char === ')') {
            if (depth > 0) depth -= 1;
            index += 1;
            continue;
        }
        if (depth === 0 && source.startsWith('->', index)) return index;
        if (depth === 0 && isStopWord(source, index)) return index;
        index += 1;
    }
    return source.length;
}

function isStopWord(source: string, index: number): boolean {
    const before = source[index - 1] ?? '';
    if (before === '$' || before === '.') return false;
    for (const word of STOP_WORDS) {
        if (isKeyword(source, index, word)) return true;
    }
    return false;
}

function isKeyword(source: string, index: number, word: string): boolean {
    if (source.startsWith(word, index) === false) return false;
    const before = source[index - 1] ?? '';
    const after = source[index + word.length] ?? '';
    if (isIdentPart(before)) return false;
    if (isIdentPart(after)) return false;
    return true;
}

function isIdentStart(char: string): boolean {
    return (char >= 'A' && char <= 'Z')
        || (char >= 'a' && char <= 'z')
        || char === '_';
}

function isIdentPart(char: string): boolean {
    return isIdentStart(char) || (char >= '0' && char <= '9');
}
