export type RawValue = { __rivaRaw: true; value: unknown };

export type Runtime = {
    esc: (value: unknown) => string
    print: (value: unknown, raw: boolean, mode: 'html' | 'text') => string
    resolve: (scope: Record<string, unknown>, parts: string[], meta?: string) => unknown
    map: (
        value: unknown,
        bind: string,
        scope: Record<string, unknown>,
        body: (scope: Record<string, unknown>) => string,
        keyBind?: string,
    ) => string
    range: (
        from: unknown,
        to: unknown,
        down: boolean,
        bind: string,
        scope: Record<string, unknown>,
        body: (scope: Record<string, unknown>) => string,
    ) => string
    call: (name: string, args: unknown[]) => unknown
    pipe: (value: unknown, name: string, args: unknown[]) => unknown
    add: (left: unknown, right: unknown) => unknown
    isTruthy: (value: unknown) => boolean
};

export function createRuntime(helpers: Record<string, (...args: unknown[]) => unknown> = {}): Runtime {
    const filters: Record<string, (...args: unknown[]) => unknown> = {
        ...builtinFilters,
        ...helpers,
    };

    return {
        esc: escapeHtml,
        print(value, raw, mode) {
            if (isRaw(value)) {
                return stringify(value.value);
            }
            if (raw || mode === 'text') {
                return stringify(value);
            }
            return escapeHtml(stringify(value));
        },
        resolve(scope, parts, meta) {
            const value = resolvePath(scope, parts);
            if (meta === undefined) {
                return value;
            }
            const bag = scope.__rivaMeta as Record<string, IteratorMeta> | undefined;
            const name = parts[0];
            const entry = name ? bag?.[name] : undefined;
            if (!entry) return undefined;
            return entry[meta as keyof IteratorMeta];
        },
        map(value, bind, scope, body, keyBind) {
            const parts: string[] = [];
            if (Array.isArray(value)) {
                const total = value.length;
                for (let index = 0; index < total; index += 1) {
                    parts.push(body(childScope(scope, bind, value[index], {
                        index,
                        key: index,
                        first: index === 0,
                        last: index === total - 1,
                        odd: index % 2 === 1,
                        even: index % 2 === 0,
                    }, keyBind)));
                }
            } else if (isPlainObject(value)) {
                const keys = Object.keys(value);
                const total = keys.length;
                for (let index = 0; index < total; index += 1) {
                    const key = keys[index]!;
                    parts.push(body(childScope(scope, bind, value[key], {
                        index,
                        key,
                        first: index === 0,
                        last: index === total - 1,
                        odd: index % 2 === 1,
                        even: index % 2 === 0,
                    }, keyBind)));
                }
            }
            return parts.join('');
        },
        range(from, to, down, bind, scope, body) {
            const start = toInt(from);
            const end = toInt(to);
            const parts: string[] = [];
            if (down) {
                for (let value = start; value >= end; value -= 1) {
                    parts.push(body(bindValue(scope, bind, value)));
                }
            } else {
                for (let value = start; value <= end; value += 1) {
                    parts.push(body(bindValue(scope, bind, value)));
                }
            }
            return parts.join('');
        },
        call(name, args) {
            const fn = filters[name];
            if (!fn) throw new Error(`Unknown helper "${name}"`);
            return fn(...args);
        },
        pipe(value, name, args) {
            return this.call(name, [value, ...args]);
        },
        add(left, right) {
            if (typeof left === 'number' && typeof right === 'number') {
                return left + right;
            }
            return stringify(left) + stringify(right);
        },
        isTruthy(value) {
            if (isRaw(value)) return this.isTruthy(value.value);
            if (Array.isArray(value)) return value.length > 0;
            return Boolean(value);
        },
    };
}

type IteratorMeta = {
    index: number
    key: string | number
    first: boolean
    last: boolean
    odd: boolean
    even: boolean
};

const builtinFilters: Record<string, (...args: unknown[]) => unknown> = {
    escape: (value) => escapeHtml(stringify(value)),
    noescape: (value) => raw(value),
    trim: (value) => stringify(value).trim(),
    toUpper: (value, locale) => localeString(value).toLocaleUpperCase(localeArg(locale)),
    toLower: (value, locale) => localeString(value).toLocaleLowerCase(localeArg(locale)),
    toSlug: (value) => slugify(value),
    length: (value) => {
        if (typeof value === 'string' || Array.isArray(value)) return value.length;
        if (isPlainObject(value)) return Object.keys(value).length;
        return 0;
    },
    isArray: (value) => Array.isArray(value),
    isObject: (value) => isPlainObject(value),
    isNil: (value) => value === null || value === undefined,
    sprintf: (value, format = '%s', ...rest) => sprintf(stringify(format), [value, ...rest]),
};

function bindValue(scope: Record<string, unknown>, name: string, value: unknown): Record<string, unknown> {
    return Object.assign(Object.create(null), scope, { [name]: value });
}

function toInt(value: unknown): number {
    const number = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(number) === false) return 0;
    return Math.trunc(number);
}

function childScope(
    scope: Record<string, unknown>,
    bind: string,
    value: unknown,
    meta: IteratorMeta,
    keyBind?: string,
): Record<string, unknown> {
    const parentMeta = (scope.__rivaMeta as Record<string, IteratorMeta> | undefined) ?? {};
    const bindings: Record<string, unknown> = {
        [bind]: value,
        __rivaMeta: { ...parentMeta, [bind]: meta },
    };
    if (keyBind !== undefined && keyBind !== bind) {
        bindings[keyBind] = meta.key;
    }
    return Object.assign(Object.create(null), scope, bindings);
}

function slugify(value: unknown): string {
    const folded = stringify(value)
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/đ/g, 'd')
        .replace(/ł/g, 'l')
        .replace(/ø/g, 'o')
        .replace(/æ/g, 'ae')
        .replace(/œ/g, 'oe')
        .replace(/ß/g, 'ss');
    return folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function localeString(value: unknown): string {
    return stringify(value);
}

function localeArg(locale: unknown): string | string[] | undefined {
    if (typeof locale === 'string' && locale !== '') return locale;
    if (Array.isArray(locale)) return locale.filter((item) => typeof item === 'string') as string[];
    return undefined;
}

export function raw(value: unknown): RawValue {
    return { __rivaRaw: true, value };
}

export function isRaw(value: unknown): value is RawValue {
    return typeof value === 'object' && value !== null && (value as RawValue).__rivaRaw === true;
}

export function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

export function stringify(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    if (isRaw(value)) return stringify(value.value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function resolvePath(scope: Record<string, unknown>, parts: string[]): unknown {
    if (parts.length === 0) return undefined;
    for (let length = parts.length; length >= 1; length -= 1) {
        const key = parts.slice(0, length).join('.');
        if (Object.prototype.hasOwnProperty.call(scope, key) || key in scope) {
            let current: unknown = scope[key];
            for (let index = length; index < parts.length; index += 1) {
                if (current === null || current === undefined || typeof current !== 'object') {
                    return undefined;
                }
                current = (current as Record<string, unknown>)[parts[index]!];
            }
            return current;
        }
    }
    return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && Array.isArray(value) === false;
}

function sprintf(format: string, values: unknown[]): string {
    let index = 0;
    return format.replace(/%[sd%]/g, (token) => {
        if (token === '%%') return '%';
        const value = values[index];
        index += 1;
        if (token === '%d') return String(Number(value ?? 0));
        return stringify(value);
    });
}
