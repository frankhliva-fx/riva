import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Template } from './Template.js';

describe('Template', () => {
    it('prints variables and leaves let silent', () => {
        const view = Template.compile('{let $age = 5}{$age}', { mode: 'text' });
        assert.equal(view.render(), '5');
    });

    it('supports dotted flat keys like Shop.Company', () => {
        const view = Template.compile('{$Shop.Company}', { mode: 'text' });
        assert.equal(view.render({ 'Shop.Company': 'Acme' }), 'Acme');
    });

    it('escapes html by default', () => {
        const view = Template.compile('{$name}', { mode: 'html' });
        assert.equal(view.render({ name: '<b>' }), '&lt;b&gt;');
    });

    it('supports raw print and noEscape', () => {
        const raw = Template.compile('{!$html}', { mode: 'html' });
        assert.equal(raw.render({ html: '<b>x</b>' }), '<b>x</b>');
        const pipe = Template.compile('{$html |> noEscape}', { mode: 'html' });
        assert.equal(pipe.render({ html: '<i>' }), '<i>');
    });

    it('runs for loops with index and key', () => {
        const view = Template.compile(
            '{for $product in $products}{$product:index}:{$product:key}:{$product.name};{/for}',
            { mode: 'text' },
        );
        assert.equal(
            view.render({ products: [{ name: 'A' }, { name: 'B' }] }),
            '0:0:A;1:1:B;',
        );
    });

    it('binds an explicit for key and keeps item meta', () => {
        const view = Template.compile(
            '{for $mojkluc, $product in $products}{$product:index}:{$mojkluc}:{$product.name};{/for}',
            { mode: 'text' },
        );
        assert.equal(
            view.render({ products: { a: { name: 'A' }, b: { name: 'B' } } }),
            '0:a:A;1:b:B;',
        );
    });

    it('exposes isFirst, isLast, isOdd and isEven', () => {
        const view = Template.compile(
            '{for $item in $items}{$item:isFirst}{$item:isLast}{$item:isOdd}{$item:isEven};{/for}',
            { mode: 'text' },
        );
        assert.equal(view.render({ items: ['a', 'b'] }), 'truefalsefalsetrue;falsetruetruefalse;');
    });

    it('counts inclusive ranges with to and downto', () => {
        const up = Template.compile('{for $i = 1 to 3}{$i}{/for}', { mode: 'text' });
        assert.equal(up.render(), '123');
        const down = Template.compile('{for $i = 3 downto 1}{$i}{/for}', { mode: 'text' });
        assert.equal(down.render(), '321');
        const same = Template.compile('{for $i = 2 to 2}{$i}{/for}', { mode: 'text' });
        assert.equal(same.render(), '2');
        const empty = Template.compile('{for $i = 5 to 3}x{/for}', { mode: 'text' });
        assert.equal(empty.render(), '');
        const expr = Template.compile('{for $i = $from to $to}{$i},{/for}', { mode: 'text' });
        assert.equal(expr.render({ from: 2, to: 4 }), '2,3,4,');
    });

    it('runs if elif else', () => {
        const view = Template.compile(
            '{if $n == 1}one{elif $n == 2}two{else}other{/if}',
            { mode: 'text' },
        );
        assert.equal(view.render({ n: 1 }), 'one');
        assert.equal(view.render({ n: 2 }), 'two');
        assert.equal(view.render({ n: 3 }), 'other');
    });

    it('supports nested if with isArray and for', () => {
        const view = Template.compile(
            '{if isArray($item)}{for $i in $item}[{$i}]{/for}{else}{$item}{/if}',
            { mode: 'text' },
        );
        assert.equal(view.render({ item: ['a', 'b'] }), '[a][b]');
        assert.equal(view.render({ item: 'solo' }), 'solo');
    });

    it('supports isNil, nil, != and <>', () => {
        const view = Template.compile(
            '{if isNil($value)}nil{elif $value <> 1}other{else}one{/if}',
            { mode: 'text' },
        );
        assert.equal(view.render({ value: null }), 'nil');
        assert.equal(view.render({}), 'nil');
        assert.equal(view.render({ value: 2 }), 'other');
        assert.equal(view.render({ value: 1 }), 'one');
        const ne = Template.compile('{if $value != 1}x{else}y{/if}', { mode: 'text' });
        assert.equal(ne.render({ value: 2 }), 'x');
        const literal = Template.compile('{if $value == nil}yes{else}no{/if}', { mode: 'text' });
        assert.equal(literal.render({ value: null }), 'yes');
    });

    it('supports let expressions and pipes', () => {
        const view = Template.compile(
            '{let $name = 5}{let $age = $name + 10}{$age} {$abc |> toUpper |> sprintf "[%s]"}',
            { mode: 'text' },
        );
        assert.equal(view.render({ abc: 'hi' }), '15 [HI]');
    });

    it('uses locale case helpers', () => {
        assert.equal(Template.compile('{$name |> toLower}', { mode: 'text' }).render({ name: 'ABC' }), 'abc');
        assert.equal(Template.compile('{$name |> toUpper}', { mode: 'text' }).render({ name: 'abc' }), 'ABC');
        assert.equal(Template.compile('{$name |> toUpper "tr"}', { mode: 'text' }).render({ name: 'i' }), 'İ');
    });

    it('builds a slug with toSlug', () => {
        const view = Template.compile('{$title |> toSlug}', { mode: 'text' });
        assert.equal(view.render({ title: '  Žltý kôň! ' }), 'zlty-kon');
        assert.equal(view.render({ title: 'Hello, World' }), 'hello-world');
        assert.equal(view.render({ title: 'Foo / Bar' }), 'foo-bar');
    });

    it('keeps plain braces in css text', () => {
        const view = Template.compile('body { color: red } Hello {$name}', { mode: 'text' });
        assert.equal(view.render({ name: 'X' }), 'body { color: red } Hello X');
    });

    it('calls a func with lets, if, match and for', () => {
        const math = Template.compile(
            '{func total($price, $qty) -> $price * $qty}{$total($price, $qty)}',
            { mode: 'text' },
        );
        assert.equal(math.render({ price: 4, qty: 3 }), '12');
        const piped = Template.compile(
            '{func total($qty, $price) -> $price * 10 + $qty}{$price |> total $qty}',
            { mode: 'text' },
        );
        assert.equal(piped.render({ price: 4, qty: 3 }), '43');
        const label = Template.compile(
            `{func label($price, $qty) ->
                let $x = $qty * $qty
                if $x > 10 then $price * $x else $price
            }{label($price, $qty)}`,
            { mode: 'text' },
        );
        assert.equal(label.render({ price: 3, qty: 4 }), '48');
        assert.equal(label.render({ price: 3, qty: 2 }), '3');
        const status = Template.compile(
            `{func name($status) ->
                match $status
                with "active" -> "Online"
                with "banned" -> "Blocked"
                with _ -> "off"
            }{name($status)}`,
            { mode: 'text' },
        );
        assert.equal(status.render({ status: 'active' }), 'Online');
        assert.equal(status.render({ status: 'nope' }), 'off');
        const sum = Template.compile(
            `{func total($items) ->
                for $item in $items start 0 with $sum -> $sum + $item.price
            }{total($items)}`,
            { mode: 'text' },
        );
        assert.equal(sum.render({ items: [{ price: 2 }, { price: 5 }] }), '7');
        const names = Template.compile(
            `{func names($items) -> for $item in $items -> $item.name}{names($items)}`,
            { mode: 'text' },
        );
        assert.equal(names.render({ items: [{ name: 'A' }, { name: 'B' }] }), '["A","B"]');
    });

    it('renders a sub with the template language', () => {
        const view = Template.compile(
            '{sub card($title)}<b>{$title}</b>{/sub}{card($title)}',
            { mode: 'html' },
        );
        assert.equal(view.render({ title: '<i>' }), '<b>&lt;i&gt;</b>');
        const pick = Template.compile(
            '{sub pick($n)}{if $n > 1}many{else}one{/if}{/sub}{pick($n)}',
            { mode: 'text' },
        );
        assert.equal(pick.render({ n: 2 }), 'many');
        assert.equal(pick.render({ n: 1 }), 'one');
    });

    it('supports match with string arms', () => {
        const view = Template.compile(
            '{match $aaa}{with "abc"}A{/with}{with "efg"}B{/with}{/match}',
            { mode: 'text' },
        );
        assert.equal(view.render({ aaa: 'abc' }), 'A');
        assert.equal(view.render({ aaa: 'efg' }), 'B');
        assert.equal(view.render({ aaa: 'zzz' }), '');
        const fallback = Template.compile(
            '{match $aaa}{with "abc"}A{/with}{with _}Other{/with}{/match}',
            { mode: 'text' },
        );
        assert.equal(fallback.render({ aaa: 'abc' }), 'A');
        assert.equal(fallback.render({ aaa: 'zzz' }), 'Other');
    });
});
