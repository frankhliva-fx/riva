import type { BinaryOp, Expr } from './Ast.ts';

export function parseExpression(source: string): Expr {
    const parser = new ExpressionParser(source.trim());
    const expr = parser.parsePipe();
    parser.expectEnd();
    return expr;
}

export function compileExpression(expr: Expr, scopeVar = '__scope'): string {
    switch (expr.kind) {
        case 'number':
            return String(expr.value);
        case 'string':
            return JSON.stringify(expr.value);
        case 'boolean':
            return expr.value ? 'true' : 'false';
        case 'null':
            return 'null';
        case 'path': {
            const parts = JSON.stringify(expr.parts);
            const meta = expr.meta === undefined ? 'undefined' : JSON.stringify(expr.meta);
            return `__rt.resolve(${scopeVar}, ${parts}, ${meta})`;
        }
        case 'call': {
            const args = expr.args.map((item) => compileExpression(item, scopeVar)).join(', ');
            return `__rt.call(${JSON.stringify(expr.name)}, [${args}])`;
        }
        case 'unary':
            if (expr.op === '!') {
                return `(!__rt.isTruthy(${compileExpression(expr.argument, scopeVar)}))`;
            }
            return `(-Number(${compileExpression(expr.argument, scopeVar)}))`;
        case 'binary': {
            const left = compileExpression(expr.left, scopeVar);
            const right = compileExpression(expr.right, scopeVar);
            if (expr.op === '&&') {
                return `(__rt.isTruthy(${left}) ? ${right} : ${left})`;
            }
            if (expr.op === '||') {
                return `(__rt.isTruthy(${left}) ? ${left} : ${right})`;
            }
            if (expr.op === '+') {
                return `__rt.add(${left}, ${right})`;
            }
            return `(${left} ${expr.op} ${right})`;
        }
        case 'pipe': {
            const value = compileExpression(expr.value, scopeVar);
            const args = expr.args.map((item) => compileExpression(item, scopeVar)).join(', ');
            return `__rt.pipe(${value}, ${JSON.stringify(expr.name)}, [${args}])`;
        }
    }
}

class ExpressionParser {
    private index = 0;

    constructor(private readonly source: string) {}

    parsePipe(): Expr {
        let left = this.parseOr();
        while (this.match('|>')) {
            const name = this.readIdent();
            const args: Expr[] = [];
            if (this.peek() === '(') {
                this.index += 1;
                if (this.peek() !== ')') {
                    args.push(this.parsePipe());
                    while (this.match(',')) args.push(this.parsePipe());
                }
                this.expect(')');
            } else if (this.isPrimaryStart()) {
                args.push(this.parseUnary());
            }
            left = { kind: 'pipe', value: left, name, args };
        }
        return left;
    }

    private parseOr(): Expr {
        let left = this.parseAnd();
        while (this.match('||')) {
            left = { kind: 'binary', op: '||', left, right: this.parseAnd() };
        }
        return left;
    }

    private parseAnd(): Expr {
        let left = this.parseComparison();
        while (this.match('&&')) {
            left = { kind: 'binary', op: '&&', left, right: this.parseComparison() };
        }
        return left;
    }

    private parseComparison(): Expr {
        let left = this.parseAdd();
        while (true) {
            const op = this.matchOp(['==', '!=', '<>', '<=', '>=', '<', '>']);
            if (!op) break;
            const normalized = op === '<>' ? '!=' : op;
            left = { kind: 'binary', op: normalized as BinaryOp, left, right: this.parseAdd() };
        }
        return left;
    }

    private parseAdd(): Expr {
        let left = this.parseMul();
        while (true) {
            const op = this.matchOp(['+', '-']);
            if (!op) break;
            left = { kind: 'binary', op: op as BinaryOp, left, right: this.parseMul() };
        }
        return left;
    }

    private parseMul(): Expr {
        let left = this.parseUnary();
        while (true) {
            const op = this.matchOp(['*', '/', '%']);
            if (!op) break;
            left = { kind: 'binary', op: op as BinaryOp, left, right: this.parseUnary() };
        }
        return left;
    }

    private parseUnary(): Expr {
        if (this.match('!')) {
            return { kind: 'unary', op: '!', argument: this.parseUnary() };
        }
        if (this.match('-')) {
            return { kind: 'unary', op: '-', argument: this.parseUnary() };
        }
        return this.parsePrimary();
    }

    private parsePrimary(): Expr {
        this.skip();
        const char = this.peek();
        if (char === "'" || char === '"') {
            return { kind: 'string', value: this.readString() };
        }
        if (char >= '0' && char <= '9') {
            return { kind: 'number', value: this.readNumber() };
        }
        if (char === '$') {
            return this.readPath();
        }
        if (char === '(') {
            this.index += 1;
            const expr = this.parsePipe();
            this.expect(')');
            return expr;
        }
        const ident = this.readIdent();
        if (ident === 'true') return { kind: 'boolean', value: true };
        if (ident === 'false') return { kind: 'boolean', value: false };
        if (ident === 'nil' || ident === 'null') return { kind: 'null' };
        if (this.peek() === '(') {
            this.index += 1;
            const args: Expr[] = [];
            if (this.peek() !== ')') {
                args.push(this.parsePipe());
                while (this.match(',')) args.push(this.parsePipe());
            }
            this.expect(')');
            return { kind: 'call', name: ident, args };
        }
        throw this.error(`Unexpected "${ident}"`);
    }

    private readPath(): Expr {
        this.expect('$');
        const parts = [this.readIdent()];
        while (this.peek() === '.') {
            this.index += 1;
            parts.push(this.readIdent());
        }
        let meta: string | undefined;
        if (this.peek() === ':') {
            this.index += 1;
            meta = this.readIdent();
        }
        return { kind: 'path', parts, meta };
    }

    private isPrimaryStart(): boolean {
        this.skip();
        const char = this.peek();
        return char === "'" || char === '"' || char === '$' || char === '('
            || (char >= '0' && char <= '9')
            || isIdentStart(char);
    }

    private readIdent(): string {
        this.skip();
        if (isIdentStart(this.peek()) === false) {
            throw this.error('Expected identifier');
        }
        const start = this.index;
        this.index += 1;
        while (isIdentPart(this.peek())) this.index += 1;
        return this.source.slice(start, this.index);
    }

    private readString(): string {
        const quote = this.peek();
        this.index += 1;
        let value = '';
        while (this.index < this.source.length) {
            const char = this.source[this.index]!;
            if (char === quote) {
                this.index += 1;
                return value;
            }
            if (char === '\\') {
                this.index += 1;
                value += this.source[this.index] ?? '';
                this.index += 1;
                continue;
            }
            value += char;
            this.index += 1;
        }
        throw this.error('Unterminated string');
    }

    private readNumber(): number {
        const start = this.index;
        while (this.peek() >= '0' && this.peek() <= '9') this.index += 1;
        if (this.peek() === '.') {
            this.index += 1;
            while (this.peek() >= '0' && this.peek() <= '9') this.index += 1;
        }
        return Number(this.source.slice(start, this.index));
    }

    private match(token: string): boolean {
        this.skip();
        if (this.source.startsWith(token, this.index)) {
            this.index += token.length;
            return true;
        }
        return false;
    }

    private matchOp(ops: string[]): string | undefined {
        this.skip();
        for (const op of ops) {
            if (this.source.startsWith(op, this.index)) {
                this.index += op.length;
                return op;
            }
        }
        return undefined;
    }

    private expect(token: string): void {
        if (this.match(token) === false) {
            throw this.error(`Expected "${token}"`);
        }
    }

    expectEnd(): void {
        this.skip();
        if (this.index < this.source.length) {
            throw this.error(`Unexpected "${this.source.slice(this.index)}"`);
        }
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
        return new Error(`${message} at ${this.index} in expression "${this.source}"`);
    }
}

function isIdentStart(char: string): boolean {
    return (char >= 'A' && char <= 'Z')
        || (char >= 'a' && char <= 'z')
        || char === '_';
}

function isIdentPart(char: string): boolean {
    return isIdentStart(char) || (char >= '0' && char <= '9');
}
