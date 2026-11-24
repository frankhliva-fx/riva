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

    it('supports raw print and noescape', () => {
        const raw = Template.compile('{!$html}', { mode: 'html' });
        assert.equal(raw.render({ html: '<b>x</b>' }), '<b>x</b>');
        const pipe = Template.compile('{$html |> noescape}', { mode: 'html' });
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

    it('supports match with string arms', () => {
        const view = Template.compile(
            '{match $aaa}{with "abc"}A{/with}{with "efg"}B{/with}{/match}',
            { mode: 'text' },
        );
        assert.equal(view.render({ aaa: 'abc' }), 'A');
        assert.equal(view.render({ aaa: 'efg' }), 'B');
        assert.equal(view.render({ aaa: 'zzz' }), '');
    });
});
