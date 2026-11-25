export type TemplateMode = 'html' | 'text';

export type AstNode =
    | TextNode
    | PrintNode
    | LetNode
    | IfNode
    | ForNode
    | ForRangeNode
    | MatchNode
    | FuncNode
    | SubNode
    | InvokeNode;

export type TextNode = {
    kind: 'text'
    value: string
};

export type PrintNode = {
    kind: 'print'
    expression: Expr
    raw: boolean
};

export type LetNode = {
    kind: 'let'
    name: string
    expression: Expr
};

export type IfNode = {
    kind: 'if'
    branches: { condition: Expr | null; body: AstNode[] }[]
};

export type ForNode = {
    kind: 'for'
    name: string
    key?: string
    expression: Expr
    body: AstNode[]
};

export type ForRangeNode = {
    kind: 'forRange'
    name: string
    from: Expr
    to: Expr
    down: boolean
    body: AstNode[]
};

export type MatchArm = {
    value: Expr | null
    body: AstNode[]
};

export type MatchNode = {
    kind: 'match'
    expression: Expr
    arms: MatchArm[]
};

export type FuncLet = {
    name: string
    expression: Expr
};

export type FuncNode = {
    kind: 'func'
    name: string
    params: string[]
    lets: FuncLet[]
    body: Expr
};

export type SubNode = {
    kind: 'sub'
    name: string
    params: string[]
    body: AstNode[]
};

export type InvokeNode = {
    kind: 'invoke'
    name: string
    args: Expr[]
};

export type Expr =
    | { kind: 'number'; value: number }
    | { kind: 'string'; value: string }
    | { kind: 'boolean'; value: boolean }
    | { kind: 'null' }
    | { kind: 'path'; parts: string[]; meta?: string }
    | { kind: 'call'; name: string; args: Expr[] }
    | { kind: 'unary'; op: '!' | '-'; argument: Expr }
    | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
    | { kind: 'pipe'; value: Expr; name: string; args: Expr[] }
    | { kind: 'ifValue'; condition: Expr; then: Expr; else: Expr }
    | { kind: 'matchValue'; expression: Expr; arms: ValueArm[] }
    | { kind: 'forValue'; name: string; expression: Expr; body: Expr; start?: Expr; acc?: string }
    | { kind: 'rangeValue'; name: string; from: Expr; to: Expr; down: boolean; body: Expr; start?: Expr; acc?: string };

export type ValueArm = {
    pattern: Expr | null
    body: Expr
};

export type BinaryOp =
    | '+'
    | '-'
    | '*'
    | '/'
    | '%'
    | '=='
    | '!='
    | '<'
    | '<='
    | '>'
    | '>='
    | '&&'
    | '||';
