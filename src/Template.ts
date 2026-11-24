import type { TemplateMode } from './Ast.js';
import { parseTemplate } from './Parser.js';
import { createRuntime, type Runtime } from './Runtime.js';
import { compileNodes } from './TemplateCompiler.js';

export type TemplateOptions = {
    mode?: TemplateMode
    helpers?: Record<string, (...args: unknown[]) => unknown>
};

type RenderFn = (data: Record<string, unknown>, runtime: Runtime) => string;

const cache = new Map<string, RenderFn>();

export class Template {
    private readonly renderFn: RenderFn;
    private readonly runtime: Runtime;
    private readonly mode: TemplateMode;

    private constructor(renderFn: RenderFn, mode: TemplateMode, runtime: Runtime) {
        this.renderFn = renderFn;
        this.mode = mode;
        this.runtime = runtime;
    }

    static compile(source: string, options: TemplateOptions = {}): Template {
        const mode = options.mode ?? 'html';
        const key = `${mode}\n${source}`;
        let renderFn = cache.get(key);
        if (!renderFn) {
            const ast = parseTemplate(source);
            const code = compileNodes(ast, mode);
            renderFn = new Function('__data', '__rt', code) as RenderFn;
            cache.set(key, renderFn);
        }
        return new Template(renderFn, mode, createRuntime(options.helpers));
    }

    render(data: Record<string, unknown> = {}): string {
        return this.renderFn(data, this.runtime);
    }

    get sourceMode(): TemplateMode {
        return this.mode;
    }
}
