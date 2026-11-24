# RivaJS (`riva`)

Lightweight, expression-oriented template engine that compiles templates into clean JavaScript functions returning a `string`. 

---

## Quick Start

```ts
import { Template } from 'riva'

const view = Template.compile('<h1>Hello {$name |> trim |> toUpper}!</h1>', {
  mode: 'html' // 'html' (default, auto-escapes) or 'text'
})

const html = view.render({ name: '  Frank  ' })
// => "<h1>Hello FRANK!</h1>"
```

---

## Syntax Overview

Everything outside `{...}` tags is treated as plain text and copied as-is. Standard curly braces (like CSS `body { color: red }`) are ignored and stay untouched.

### Printing & Escaping

```latte
{$name}                     <!-- Auto-escaped in 'html' mode -->
{!$rawHtml}                 <!-- Raw output (no HTML escaping) -->
{$product.name}             <!-- Property access -->
{$Shop.Company}             <!-- Resolves longest matching key first, then walks properties -->
```

* **`html` mode (default):** Escapes output automatically unless you use `{!...}` or pipe through `noescape`.
* **`text` mode:** Never escapes anything.

### Variables (`let`)

```latte
{let $tax = 0.2} {let$total = $price * (1 +$tax)}
```

Bindings behave like `const` — they are block-scoped, immutable, and don't produce any output on their own.

### Loops (`for`)

Iterates over both arrays and plain objects:

```latte
{for $product in$products}
  <div>{$product:index}. {$product.name}</div>
{/for}

<!-- With explicit key -->
{for $key, $product in$products}
  <div>{$key}: {$product.name}</div>
{/for}
```

**Loop metadata variables:**
* `$item:index` — 0-based iteration index
* `$item:key` — array index or object key
* `$item:first` / `$item:last` / `$item:odd` / `$item:even` — booleans

**Numeric ranges (both ends inclusive):**

```latte
{for $i = 1 to 3} {$i}
{/for}

{for $i = $start downto 1} {$i}
{/for}
```
*(If a range runs the wrong way, e.g., `5 to 1`, it simply renders nothing.)*

### Conditions (`if` / `match`)

```latte
{if isArray($item)}
  ...
{elif $item <> nil}
  ...
{else}
  ...
{/if}
```
*(Note: `else if` works as an alias for `elif`.)*

**Pattern matching (`match`):**
Simple switch without fall-through using `==` comparison. Renders an empty string if nothing matches.

```latte
{match $status}
  {with "active"}Online{/with}
  {with "banned"}Blocked{/with}
{/match}
```

### Operators & Literals

* **Equality:** `==`, `<>` or `!=`
* **Relational:** `<`, `<=`, `>`, `>=`
* **Literals:** `true`, `false`, `nil` (alias `null`)

---

## Pipes & Filters

Pass values through filters using `|>`. The left-hand value is always passed as the **first** argument to the filter. Pipes work inside any expression (`print`, `let`, `if`, `for`).

```latte
{$name |> trim |> toUpper}
{$count |> sprintf "[%d items]"}
```

### Built-in Helpers

| Helper | Description |
| --- | --- |
| `escape` / `noescape` | Force or skip HTML escaping |
| `trim` | Trims whitespace |
| `toUpper` / `toLower` | Case conversion (accepts optional locale argument) |
| `sprintf` | Formats value (`%s`, `%d`), e.g. `$v |> sprintf "[%s]"` |
| `length` | Returns length of string, array, or object keys |
| `isArray` / `isObject` | Type checks (`Array.isArray` / plain object) |
| `isNil` | True for `null` or `undefined` |

### Custom Helpers

Register your own functions during compilation:

```ts
const view = Template.compile('{$price |> money "EUR"}', {
  helpers: {
    money: (val, currency) => `${val.toFixed(2)} ${currency}`
  }
})
```

---

## Security

Templates are parsed into an AST and compiled strictly from the supported expression subset — template authors cannot inject or execute arbitrary JavaScript.