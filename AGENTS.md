# Riva

Template language compiler. The public API is `Template` from `src/index.ts`. A template is parsed into an AST, compiled to JavaScript, and `render` returns a `string`.

## Language

Loop meta variables are `$item:index`, `$item:key`, `$item:isFirst`, `$item:isLast`, `$item:isOdd`, and `$item:isEven`. `isOdd` and `isEven` are based on the 0-based index.

Built-in helpers live in `builtinFilters` in `Runtime.ts`. In a template they work as a call (`isArray($item)`) and as a pipe (`$item |> isArray`). A pipe passes the left-hand value as the last argument, as in F#.

`{func name($a) -> ...}` returns a value. Its body has no curly braces: `let`, `if ... then ... else`, `match` / `with` / `with _`, and `for`. `{sub name($a)}...{/sub}` renders template text with the normal tags. Template `{match}` uses `{with …}` and `{with _}` for the default arm.

## Indentation

`.ts` and `.js` files use 4 spaces. Do not use tabs or 2-space indentation.

## File names

`.ts` and `.js` files use PascalCase, for example `Parser.ts`, `Runtime.ts`.

Keep a name when a tool requires it:

- `index.ts`
- `*.test.ts`, with a PascalCase stem, for example `Template.test.ts`

## Variable names

A variable name should be a noun (`slug`, `value`, `node`). An adjective alone is not enough. An adjective may modify a noun (`rawValue`, `sourceText`).

## Method and function prefixes

Use prefixes such as `to`, `get`, `has`, and `is` when they make the name easier to read (`toSlug`, `isNil`, `isArray`).

When a method name starts with `get`, consider a JS getter instead, especially for a derived value with no parameters and no side effects. Keep a `get` method or function when it needs arguments, is async, or when a getter would be less clear.

## Identifier clarity

Prefer method and function names that start with a verb (`parse*`, `compile*`, `resolve*`, `create*`) when that makes them easier to read.

One-word names are fine when they are clear (`print`, `render`, `slug`, `scope`).

Avoid ambiguous one-word names (`run`, `make`, `do`) unless the context makes the meaning obvious.

Someone who did not write the code should understand the name immediately. The name should reflect intent, not the implementation.

## Strings

Check whether a string is empty with `''`, not with `.length` (`value === ''` / `value !== ''`).

## Imports

Import project files with a relative path and a `.js` extension (`./Parser.js`). The build leaves that extension in place, and both Node and TypeScript resolve it to the `.ts` source.

The public surface of the package is the explicit export in `src/index.ts`.

## Branching

A short ternary may stay on one line. If it does not fit, break both branches onto their own lines after `?` and `:` (`?` and `:` each on their own line).

Do not nest ternaries. For more than two branches, use `if / else if / else`.

Use a ternary for a short value choice. Use `if / else` for side effects, `throw`, and branches with more than one step.

Prefer a positive condition. Avoid `!`, because it is harder to read (`Array.isArray(value) === false` instead of `!Array.isArray(value)`).
