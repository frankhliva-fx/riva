# RivaJS template language

RivaJS (`riva`) compiles templates to JavaScript functions that render a **string**. It is for control flow, expressions, and pipes.

## Mental model

| Form | Kind | Output |
| --- | --- | --- |
| `{$expr}` | expression | appends value to the result string |
| `{!$expr}` | expression (raw) | appends value without HTML escape |
| `{let $name = expr}` | statement (`const`) | no output; immutable binding in a nested scope |
| `{if}…{/if}` | statement | no output by itself |
| `{for}…{/for}` | statement | no output by itself |
| `{match}…{/match}` | statement | no output by itself |

Compiled output is expression-oriented (`return` + `+` / ternaries / `map`), not a mutable string buffer.

## Syntax

### Text

Everything outside markup tags is literal text and is copied to the output as-is.

Plain braces (for example CSS `body { color: red }`) stay literal. Only `{…}` forms listed below are markup.

### Print

```
{$name}
{$product.name}
{$Shop.Company}
{$name |> trim |> toUpper}
{$name |> sprintf "[%s]"}
{!$html}
```

- `{$…}` in `html` mode HTML-escapes the final value (unless piped through `noescape` or written as `{!…}`).
- `text` mode never escapes.
- Dotted paths resolve the longest matching data key first (`Shop.Company`), then walk properties.

### Let

```
{let $name = 5}
{let $age = $name + 10}
```

Does not print. Compiles like `const` — binding is visible in the rest of the current block and does not reassign an outer binding.

### For

```
{for $product in $products}
  <div>{$product:index}. {$product:key}: {$product.name}</div>
{/for}
```

```
{for $myKey, $product in $products}
  <div>{$product:index}. {$myKey}: {$product.name}</div>
{/for}
```

- Iterates arrays and plain objects.
- `$item:index` — 0-based index
- `$item:key` — array index or object key
- `$item:first` / `$item:last` / `$item:odd` / `$item:even` — booleans
- `{for $key, $item in $items}` binds that same key to `$key`

Counted loop, both ends inclusive. `to` steps up by 1. `downto` steps down by 1. A range that runs the wrong way produces nothing.

```
{for $i = 1 to 3}
  {$i}
{/for}
```

```
{for $i = $from downto 1}
  {$i}
{/for}
```

### If

```
{if isArray($item)}
  …
{elif $item <> nil}
  …
{else}
  …
{/if}
```

`else if` is an alias of `elif`.

### Match

Simple switch (no fall-through). Values may be strings or any expression; comparison uses `==`.

```
{match $aaa}
{with "abc"}A{/with}
{with "efg"}B{/with}
{/match}
```

If nothing matches, the result is an empty string.

### Comparisons

| Op | Meaning |
| --- | --- |
| `==` | equal |
| `<>` / `!=` | not equal |
| `<` `<=` `>` `>=` | numeric / relational |

Literals: `true`, `false`, `nil` (alias `null`). `isNil($x)` is true for `null` and `undefined`.

### Pipe

```
{$value |> filter}
{$value |> filter arg}
{$value |> filter "arg"}
```

Left value is passed as the **first** argument of the filter. Extra args follow. Pipe works in any expression (`print`, `let`, `if`, `for`).

## Built-in filters / helpers

| Name | Role |
| --- | --- |
| `escape` | HTML-escape |
| `noescape` | mark value as raw (skip auto-escape) |
| `trim` | trim string |
| `toUpper` | `toLocaleUpperCase` (optional locale arg) |
| `toLower` | `toLocaleLowerCase` (optional locale arg) |
| `sprintf` | pipe form `$v |> sprintf "[%s]"` → format with value first; supports `%s`, `%d` |
| `length` | string/array/object length |
| `isArray` | `Array.isArray` |
| `isObject` | plain object check |
| `isNil` | `null` or `undefined` |

Custom helpers: `Template.compile(source, { helpers: { money: (v) => … } })`.

## Compile API

```ts
import { Template } from 'riva'

const view = Template.compile(source, { mode: 'html' })
const html: string = view.render({ products, Shop: { Company: 'Acme' } })
```

`render` always returns `string`.

## Security

Expressions are parsed into an AST and compiled by Riva. Template authors cannot inject arbitrary JavaScript; only the supported expression language runs.
