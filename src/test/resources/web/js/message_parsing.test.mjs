import { expect, test, beforeAll, beforeEach } from 'vitest';
import {
    MAX_CHAT_DEPTH,
    assertIsComponent,
    formatMessage,
} from '~/messages/message_parsing.mjs';
/**
 * @typedef {import('~/messages/message_parsing.mjs').Component} Component
 */

/**
 * Create a deeply nested component for testing.
 * @param {number} depth
 * @returns {Component}
 */
function nestedComponent(depth) {
    if (depth <= 1) {
        return { text: `level ${depth}` };
    }

    // Depth is measured by JSON path, so subtract 2 because the sub-path
    // we're adding is ["extra"][0]
    return { text: `level ${depth}`, extra: [nestedComponent(depth - 2)] };
}

// Save copy of the DOM before any tests run
/** @type {Document} */
let originalDocument;

beforeAll(() => {
    // Clone the document before any tests run
    originalDocument = /** @type {Document} */ (document.cloneNode(true));
});

/**
 * @type {readonly [string, unknown, string | undefined][]}
 */
const COMPONENT_VALIDATION_TESTS = [
    // Basic validation
    ['empty object is a valid component', {}, undefined],
    ['object with text is a component', { text: 'test' }, undefined],
    ['object with translate is a component', { translate: 'test' }, undefined],
    ['object with extra is a component', { extra: ['test'] }, undefined],

    // Text property validation
    ['text must be string', { text: 42 }, 'Component.text is not a string'],
    ['text can be empty string', { text: '' }, undefined],

    // Translate property validation
    [
        'translate must be string',
        { translate: 42 },
        'Component.translate is not a string',
    ],
    ['translate can be empty string', { translate: '' }, undefined],

    // Fallback property validation
    [
        'fallback must be a string or component',
        { translate: 'missing.key', fallback: 42 },
        'Component is not an object',
    ],
    [
        'fallback can be a component',
        { sprite: 'item/diamond', fallback: { text: 'gem', color: 'aqua' } },
        undefined,
    ],
    [
        'keybind must be a string',
        { keybind: 42 },
        'Component.keybind is not a string',
    ],
    [
        'sprite must be a string',
        { sprite: 42 },
        'Component.sprite is not a string',
    ],
    [
        'atlas must be a string',
        { sprite: 'item/diamond', atlas: 42 },
        'Component.atlas is not a string',
    ],
    [
        'fallback can be a string',
        { translate: 'missing.key', fallback: 'Fallback Text' },
        undefined,
    ],

    // Color validation
    [
        'color must be string',
        { text: 'test', color: 42 },
        'Component.color is not a string',
    ],
    [
        'color can be any string',
        { text: 'test', color: 'invalid_color' },
        undefined,
    ],

    // Boolean property validation
    [
        'bold must be boolean',
        { text: 'test', bold: 'true' },
        'Component.bold is not a boolean',
    ],
    [
        'italic must be boolean',
        { text: 'test', italic: 'true' },
        'Component.italic is not a boolean',
    ],
    [
        'underlined must be boolean',
        { text: 'test', underlined: 'true' },
        'Component.underlined is not a boolean',
    ],
    [
        'strikethrough must be boolean',
        { text: 'test', strikethrough: 'true' },
        'Component.strikethrough is not a boolean',
    ],
    [
        'obfuscated must be boolean',
        { text: 'test', obfuscated: 'true' },
        'Component.obfuscated is not a boolean',
    ],

    // Extra array validation
    [
        'extra must be array',
        { text: 'test', extra: 'not array' },
        'Component.extra is not an array',
    ],
    [
        'extra can contain strings',
        { text: 'test', extra: ['string'] },
        undefined,
    ],
    [
        'extra can contain valid components',
        { text: 'test', extra: [{ text: 'nested' }] },
        undefined,
    ],
    [
        'extra can contain objects without content properties',
        { text: 'test', extra: [{ invalid: true }] },
        undefined,
    ],
    ['extra can contain numbers', { text: 'test', extra: [42] }, undefined],

    // With array validation
    [
        'with must be array',
        { translate: 'test', with: 'not array' },
        'Component.with is not an array',
    ],
    [
        'with can contain strings',
        { translate: 'test', with: ['string'] },
        undefined,
    ],
    [
        'with can contain valid components',
        { translate: 'test', with: [{ text: 'param' }] },
        undefined,
    ],
    [
        'with can contain objects without content properties',
        { translate: 'test', with: [{ invalid: true }] },
        undefined,
    ],
    ['with can contain numbers', { translate: 'test', with: [42] }, undefined],

    // Hover event validation
    [
        'hover_event must be object',
        { text: 'test', hover_event: 'not object' },
        'HoverEvent is not an object',
    ],
    [
        'hover_event requires action',
        { text: 'test', hover_event: {} },
        'HoverEvent.action is not present',
    ],
    [
        'hover_event action must be string',
        { text: 'test', hover_event: { action: 42 } },
        'HoverEvent.action is not a string',
    ],
    [
        'hover_event action must be one of show_text, show_item, show_entity',
        { text: 'test', hover_event: { action: 'invalid' } },
        'HoverEvent.action is not a valid hover event: invalid',
    ],

    // show_text hover event validation
    [
        'show_text requires contents or value',
        { text: 'test', hover_event: { action: 'show_text' } },
        'HoverEvent does not have a contents or value property',
    ],
    [
        'show_text contents can be string',
        {
            text: 'test',
            hover_event: { action: 'show_text', contents: 'hover' },
        },
        undefined,
    ],
    [
        'show_text contents can be component',
        {
            text: 'test',
            hover_event: { action: 'show_text', contents: { text: 'hover' } },
        },
        undefined,
    ],
    [
        'show_text contents can be an array',
        {
            text: 'test',
            hover_event: { action: 'show_text', contents: ['hover', 'test'] },
        },
        undefined,
    ],
    [
        'show_text value can be a component',
        {
            text: 'test',
            hover_event: { action: 'show_text', value: { text: 'hover' } },
        },
        undefined,
    ],
    [
        'show_text value can be a string',
        { text: 'test', hover_event: { action: 'show_text', value: 'hover' } },
        undefined,
    ],
    [
        'show_text value can be an array',
        {
            text: 'test',
            hover_event: { action: 'show_text', value: ['hover', 'test'] },
        },
        undefined,
    ],
    [
        'show_text contents can be number',
        { text: 'test', hover_event: { action: 'show_text', contents: 42 } },
        undefined,
    ],
    [
        'show_text value can be number',
        { text: 'test', hover_event: { action: 'show_text', value: 42 } },
        undefined,
    ],

    // show_item hover event validation
    [
        'show_item contents requires id',
        { text: 'test', hover_event: { action: 'show_item' } },
        'HoverEvent.id is not present',
    ],
    [
        'show_item id must be string',
        {
            text: 'test',
            hover_event: { action: 'show_item', id: 42 },
        },
        'HoverEvent.id is not a string',
    ],

    // show_entity hover event validation
    [
        'show_entity id is required',
        {
            text: 'test',
            hover_event: { action: 'show_entity' },
        },
        'HoverEvent.id is not present',
    ],
    [
        'show_entity contents requires type',
        { text: 'test', hover_event: { action: 'show_entity' } },
        'HoverEvent.id is not present',
    ],
    [
        'show_entity id must be string',
        {
            text: 'test',
            hover_event: { action: 'show_entity', id: 23 },
        },
        'HoverEvent.id is not a string',
    ],
    [
        'show_entity value can be a string',
        {
            text: 'test',
            hover_event: {
                action: 'show_entity',
                id: 'minecraft:pig',
                value: 'hover',
            },
        },
        undefined,
    ],

    // shadow_color validation
    [
        'shadow_color can be positive integer',
        { text: 'test', shadow_color: 0x7f000000 },
        undefined,
    ],
    [
        'shadow_color can be negative integer (ARGB format)',
        { text: 'test', shadow_color: -16777216 },
        undefined,
    ],
    [
        'shadow_color can be RGBA array',
        { text: 'test', shadow_color: [1.0, 0.5, 0.0, 0.8] },
        undefined,
    ],
    [
        'shadow_color integer must be in 32bit range',
        { text: 'test', shadow_color: 2 ** 32 },
        'shadow_color is out of range',
    ],
    [
        'shadow_color integer must be an integer',
        { text: 'test', shadow_color: 1.5 },
        'shadow_color is not an integer',
    ],
    [
        'shadow_color array must have length 4',
        { text: 'test', shadow_color: [1.0, 0.5, 0.0] },
        'shadow_color must have length 4',
    ],
    [
        'shadow_color array values must be numbers',
        { text: 'test', shadow_color: [1.0, 'red', 0.0, 0.8] },
        'shadow_color values must be numbers',
    ],
    [
        'shadow_color array values must be in 0..1 range',
        { text: 'test', shadow_color: [1.0, 2.0, 0.0, 0.8] },
        'shadow_color values must be in range 0..1',
    ],
    [
        'shadow_color must be number or array',
        { text: 'test', shadow_color: 'red' },
        'shadow_color is not a number or array',
    ],

    // PlayerComponent validation
    [
        'player must be object',
        { text: 'test', player: 'not object' },
        'PlayerComponent is not an object',
    ],
    [
        "player can't be an empty object",
        { text: 'test', player: {} },
        'PlayerComponent does not have a name or id property',
    ],
    [
        'player.name must be string',
        { text: 'test', player: { name: 42 } },
        'PlayerComponent.name is not a string',
    ],
    [
        'player.id must be string',
        { text: 'test', player: { id: 42 } },
        'PlayerComponent.id is not a string',
    ],
    [
        'player can have name',
        { text: 'test', player: { name: 'Steve' } },
        undefined,
    ],
    [
        'player can have id',
        {
            text: 'test',
            player: { id: '12345678-1234-1234-1234-123456789abc' },
        },
        undefined,
    ],
    [
        'player can have both name and id',
        {
            text: 'test',
            player: {
                name: 'Steve',
                id: '12345678-1234-1234-1234-123456789abc',
            },
        },
        undefined,
    ],

    [
        'show_item custom_name can be a component',
        {
            text: 'test',
            hover_event: {
                action: 'show_item',
                id: 'minecraft:diamond_sword',
                components: {
                    'minecraft:custom_name': { text: 'Blade', color: 'red' },
                },
            },
        },
        undefined,
    ],
    [
        'show_item custom_name component is validated',
        {
            text: 'test',
            hover_event: {
                action: 'show_item',
                id: 'minecraft:diamond_sword',
                components: { 'minecraft:custom_name': 42 },
            },
        },
        'Component is not an object',
    ],

    // Component depth
    [
        'component is too deep',
        nestedComponent(MAX_CHAT_DEPTH + 2),
        'Maximum chat depth exceeded',
    ],
    [
        'component is deep but not too deep :D',
        nestedComponent(MAX_CHAT_DEPTH),
        undefined,
    ],
];

for (const [name, component, expectedError] of COMPONENT_VALIDATION_TESTS) {
    test(name, () => {
        if (expectedError) {
            expect(() => assertIsComponent(component)).toThrow(expectedError);
        } else {
            expect(() => assertIsComponent(component)).not.toThrow();
        }
    });
}

beforeEach(() => {
    // Restore the original document before each test
    // eslint-disable-next-line no-global-assign
    document = /** @type {Document} */ (originalDocument.cloneNode(true));
});

/**
 * @type {readonly [string, Component, Record<string, string>, string][]}
 */
const COMPONENT_FORMATTING_TESTS = [
    // Basic text formatting
    [
        'empty object component',
        {},
        {},
        '<span class="mc-red" aria-label="Unsupported component:\n {}">{...}</span>',
    ],
    ['empty text component', { text: '' }, {}, '<span></span>'],
    ['component with text', { text: 'test' }, {}, '<span>test</span>'],
    [
        'component with translation',
        { translate: 'argument.id.invalid' },
        { 'argument.id.invalid': 'Invalid ID' },
        '<span>Invalid ID</span>',
    ],

    // Color formatting
    [
        'named color',
        { text: 'colored', color: 'red' },
        {},
        '<span class="mc-red">colored</span>',
    ],
    [
        'hex color',
        { text: 'hex', color: '#ff0000' },
        {},
        '<span style="color: rgb(255, 0, 0);">hex</span>',
    ],
    [
        'invalid color is ignored',
        { text: 'bad', color: 'invalid' },
        {},
        '<span>bad</span>',
    ],

    // Text styling
    [
        'bold text',
        { text: 'bold', bold: true },
        {},
        '<span class="mc-bold">bold</span>',
    ],
    [
        'italic text',
        { text: 'italic', italic: true },
        {},
        '<span class="mc-italic">italic</span>',
    ],
    [
        'underlined text',
        { text: 'underline', underlined: true },
        {},
        '<span class="mc-underlined">underline</span>',
    ],
    [
        'strikethrough text',
        { text: 'strike', strikethrough: true },
        {},
        '<span class="mc-strikethrough">strike</span>',
    ],
    [
        'obfuscated text',
        { text: 'hidden', obfuscated: true },
        {},
        '<span class="mc-obfuscated">hidden</span>',
    ],

    // Multiple styles
    [
        'multiple styles',
        { text: 'multi', bold: true, italic: true, color: 'blue' },
        {},
        '<span class="mc-blue mc-bold mc-italic">multi</span>',
    ],

    // Text shadow
    [
        'shadow_color as negative integer (opaque black)',
        { text: 'shadowed', shadow_color: -16777216 },
        {},
        '<span style="text-shadow: 0.1rem 0.1rem 0 rgba(0,0,0,1);">shadowed</span>',
    ],
    [
        'shadow_color as RGBA array',
        { text: 'shadowed', shadow_color: [1.0, 0.5, 0.0, 0.5] },
        {},
        '<span style="text-shadow: 0.1rem 0.1rem 0 rgba(255,127.5,0,0.5);">shadowed</span>',
    ],
    [
        'shadow_color with other styles',
        { text: 'styled', color: 'gold', bold: true, shadow_color: -1 },
        {},
        '<span class="mc-gold mc-bold" style="text-shadow: 0.1rem 0.1rem 0 rgba(255,255,255,1);">styled</span>',
    ],

    // Extra components
    [
        'extra string',
        { text: 'main', extra: ['extra'] },
        {},
        '<span>mainextra</span>',
    ],
    [
        'extra component',
        { text: 'main', extra: [{ text: 'extra', bold: true }] },
        {},
        '<span>main<span class="mc-bold">extra</span></span>',
    ],
    [
        'multiple extra',
        {
            text: 'main',
            extra: [
                { text: '1', bold: true },
                { text: '2', italic: true },
            ],
        },
        {},
        '<span>main<span class="mc-bold">1</span><span class="mc-italic">2</span></span>',
    ],
    ['extra number', { text: 'main', extra: [42] }, {}, '<span>main42</span>'],

    // Translation fallback
    [
        'fallback used when translation key missing',
        { translate: 'missing.key', fallback: 'Fallback Text' },
        {},
        '<span>Fallback Text</span>',
    ],
    [
        'fallback not used when translation exists',
        { translate: 'existing.key', fallback: 'Fallback Text' },
        { 'existing.key': 'Existing Translation' },
        '<span>Existing Translation</span>',
    ],
    [
        'empty fallback used when translation key missing',
        { translate: 'missing.key', fallback: '' },
        {},
        '<span></span>',
    ],
    [
        'translation key used when no fallback and key missing',
        { translate: 'missing.key' },
        {},
        '<span>missing.key</span>',
    ],
    [
        'fallback with styling',
        {
            translate: 'missing.key',
            fallback: 'Styled Fallback',
            color: 'red',
            bold: true,
        },
        {},
        '<span class="mc-red mc-bold">Styled Fallback</span>',
    ],

    // Translation with parameters
    [
        'translation with string param',
        { translate: 'argument.id.unknown', with: ['test'] },
        { 'argument.id.unknown': 'Unknown ID: %s' },
        '<span>Unknown ID: test</span>',
    ],
    [
        'translation with component param',
        {
            translate: 'argument.id.unknown',
            with: [{ text: 'test', bold: true }],
        },
        { 'argument.id.unknown': 'Unknown ID: %s' },
        '<span>Unknown ID: <span class="mc-bold">test</span></span>',
    ],
    [
        'translation with number param',
        { translate: 'argument.id.unknown', with: [42] },
        { 'argument.id.unknown': 'Unknown ID: %s' },
        '<span>Unknown ID: 42</span>',
    ],

    // Hover events
    [
        'hover text',
        {
            text: 'hover',
            hover_event: { action: 'show_text', contents: 'tooltip' },
        },
        {},
        '<span aria-label="tooltip">hover</span>',
    ],
    [
        'hover item',
        {
            text: 'item',
            hover_event: {
                action: 'show_item',
                id: 'minecraft:diamond',
            },
        },
        {},
        '<span aria-label="minecraft:diamond">item</span>',
    ],
    [
        'hover item with count',
        {
            text: 'items',
            hover_event: {
                action: 'show_item',
                id: 'minecraft:diamond',
                count: 64,
            },
        },
        { 'item.minecraft.diamond': 'Diamond' },
        '<span aria-label="64x Diamond">items</span>',
    ],
    [
        'hover item with component custom name',
        {
            text: 'item',
            hover_event: {
                action: 'show_item',
                id: 'minecraft:diamond_sword',
                components: {
                    'minecraft:custom_name': {
                        translate: 'my.sword',
                        color: 'red',
                    },
                },
            },
        },
        { 'my.sword': 'Blade' },
        '<span aria-label="Blade\n">item</span>',
    ],
    [
        'hover entity',
        {
            text: 'entity',
            hover_event: {
                action: 'show_entity',
                id: 'minecraft:pig',
                name: 'Mr. Pig',
            },
        },
        {},
        '<span aria-label="Mr. Pig">entity</span>',
    ],
    [
        'hover text with number',
        { text: 'hover', hover_event: { action: 'show_text', contents: 42 } },
        {},
        '<span aria-label="42">hover</span>',
    ],

    // Complex nested components
    [
        'complex nested',
        {
            translate: 'argument.entity.selector.allPlayers',
            color: 'gold',
            extra: [
                { text: ' [', color: 'gray' },
                { text: '@a', color: 'aqua', bold: true },
                { text: ']', color: 'gray' },
            ],
        },
        { 'argument.entity.selector.allPlayers': 'All players' },
        '<span class="mc-gold">' +
            'All players' +
            '<span class="mc-gray"> [</span>' +
            '<span class="mc-aqua mc-bold">@a</span>' +
            '<span class="mc-gray">]</span>' +
            '</span>',
    ],
    [
        'deeply nested with multiple styles',
        {
            text: 'Level 1 ',
            color: 'gold',
            extra: [
                {
                    text: 'Level 2 ',
                    bold: true,
                    extra: [
                        {
                            text: 'Level 3',
                            color: 'aqua',
                            italic: true,
                            strikethrough: true,
                        },
                    ],
                },
            ],
        },
        {},
        '<span class="mc-gold">' +
            'Level 1 ' +
            '<span class="mc-bold">' +
            'Level 2 ' +
            '<span class="mc-aqua mc-italic mc-strikethrough">' +
            'Level 3' +
            '</span>' +
            '</span>' +
            '</span>',
    ],
    [
        'complex translation with nested components',
        {
            translate: 'argument.block.property.invalid',
            color: 'red',
            with: [
                { text: 'stone', color: 'gray', italic: true },
                { text: 'waterlogged', bold: true, underlined: true },
                { text: 'enabled', color: 'green' },
            ],
        },
        {
            'argument.block.property.invalid':
                'Block %s does not accept %s for %s property',
        },
        '<span class="mc-red">' +
            'Block ' +
            '<span class="mc-gray mc-italic">stone</span> ' +
            'does not accept ' +
            '<span class="mc-bold mc-underlined">waterlogged</span> ' +
            'for ' +
            '<span class="mc-green">enabled</span> ' +
            'property' +
            '</span>',
    ],
    [
        'mixed text and translation with hover',
        {
            text: 'Found item: ',
            color: 'yellow',
            extra: [
                {
                    translate: 'argument.item.id.invalid',
                    with: [
                        {
                            text: 'Diamond Pickaxe',
                            color: 'aqua',
                            hover_event: {
                                action: 'show_item',
                                id: 'minecraft:diamond_pickaxe',
                                count: 1,
                            },
                        },
                    ],
                    italic: true,
                },
            ],
        },
        {
            'argument.item.id.invalid': "Unknown item '%s'",
            'item.minecraft.diamond_pickaxe': 'Diamond Pickaxe',
        },
        '<span class="mc-yellow">' +
            'Found item: ' +
            '<span class="mc-italic">' +
            "Unknown item '" +
            '<span class="mc-aqua" aria-label="Diamond Pickaxe">' +
            'Diamond Pickaxe' +
            "</span>'" +
            '</span>' +
            '</span>',
    ],
    [
        'multiple nested translations',
        {
            translate: 'argument.entity.invalid',
            color: 'red',
            extra: [
                { text: ' - ', color: 'gray' },
                {
                    translate: 'argument.player.toomany',
                    color: 'yellow',
                    italic: true,
                },
            ],
        },
        {
            'argument.player.toomany':
                'Only one player is allowed, but the provided selector allows more than one',
            'argument.entity.invalid': 'Invalid name or UUID',
        },
        '<span class="mc-red">' +
            'Invalid name or UUID' +
            '<span class="mc-gray"> - </span>' +
            '<span class="mc-yellow mc-italic">' +
            'Only one player is allowed, but the provided selector allows more than one' +
            '</span>' +
            '</span>',
    ],

    // Legacy color codes
    [
        'legacy color code',
        { text: '§4test' },
        {},
        '<span><span class="mc-dark-red">test</span></span>',
    ],
    [
        'legacy color code with bold',
        { text: '§4§ltest' },
        {},
        '<span><span class="mc-bold mc-dark-red">test</span></span>',
    ],
    [
        'legacy color code with reset',
        { text: '§4§rtest' },
        {},
        '<span>test</span>',
    ],
    [
        'all color codes',
        { text: '§0§1§2§3§4§5§6§7§8§9§a§b§c§d§e§ftest' },
        {},
        '<span><span class="mc-white">test</span></span>',
    ],
    ['invalid color code', { text: '§xtest' }, {}, '<span>§xtest</span>'],
    [
        'legacy color code with bold and reset',
        { text: '§4§ltest§rtest' },
        {},
        '<span><span class="mc-bold mc-dark-red">test</span>test</span>',
    ],
    [
        'complex nested formatting',
        { text: '§4§l[§r§6Warning§4§l]§r: §7Message' },
        {},
        '<span>' +
            '<span class="mc-bold mc-dark-red">[</span>' +
            '<span class="mc-gold">Warning</span>' +
            '<span class="mc-bold mc-dark-red">]</span>' +
            ': <span class="mc-gray">Message</span>' +
            '</span>',
    ],
    [
        'formatting codes within a translation',
        {
            translate: 'argument.item.id.invalid',
            color: 'red',
            with: [{ text: '§4§ltest§r', color: 'blue' }],
        },
        { 'argument.item.id.invalid': "Unknown item '%s'" },
        '<span class="mc-red">Unknown item \'<span class="mc-blue"><span class="mc-bold mc-dark-red">test</span></span>\'</span>',
    ],

    // Keybind rendering
    [
        'keybind uses resolved key name',
        { keybind: 'key.jump' },
        { 'key.jump': 'Jump', 'keybind:key.jump': 'Space' },
        '<span>Space</span>',
    ],
    [
        'keybind falls back to its name',
        { keybind: 'key.jump' },
        {},
        '<span>key.jump</span>',
    ],

    // Sprite object rendering
    [
        'sprite in default atlas',
        { sprite: 'minecraft:item/diamond' },
        {},
        '<span>[item/diamond]</span>',
    ],
    [
        'sprite in explicit default atlas',
        { sprite: 'item/diamond', atlas: 'minecraft:blocks' },
        {},
        '<span>[item/diamond]</span>',
    ],
    [
        'sprite in other atlas',
        { sprite: 'minecraft:item/diamond', atlas: 'minecraft:items' },
        {},
        '<span>[item/diamond@items]</span>',
    ],
    [
        'sprite in modded atlas keeps namespace',
        { sprite: 'mymod:gem', atlas: 'mymod:gems' },
        {},
        '<span>[mymod:gem@mymod:gems]</span>',
    ],
    [
        'sprite with string fallback',
        { sprite: 'item/diamond', fallback: 'gem' },
        {},
        '<span>gem</span>',
    ],
    [
        'sprite with component fallback',
        { sprite: 'item/diamond', fallback: { text: 'gem', color: 'aqua' } },
        {},
        '<span><span class="mc-aqua">gem</span></span>',
    ],

    // Player component rendering
    [
        'player with name only',
        { player: { name: 'Steve' }, extra: ['test'] },
        {},
        '<span><div class="player-component-container" title="Steve\'s head"><img class="player-head" src="/img/steve.png"><img class="player-head-overlay" src="/img/steve.png"></div>test</span>',
    ],
    [
        'player with id only',
        {
            player: { id: '12345678-1234-1234-1234-123456789abc' },
            extra: ['test'],
        },
        {},
        '<span><div class="player-component-container" title="Unknown Player\'s head"><img class="player-head" src="/img/steve.png"><img class="player-head-overlay" src="/img/steve.png"></div>test</span>',
    ],
    [
        'player with name and id uses name for title',
        {
            player: {
                name: 'Steve',
                id: '12345678-1234-1234-1234-123456789abc',
            },
            extra: ['test'],
        },
        {},
        '<span><div class="player-component-container" title="Steve\'s head"><img class="player-head" src="/img/steve.png"><img class="player-head-overlay" src="/img/steve.png"></div>test</span>',
    ],
    [
        'player with other styles',
        {
            color: 'gold',
            bold: true,
            player: { name: 'Steve' },
            extra: ['test'],
        },
        {},
        '<span class="mc-gold mc-bold"><div class="player-component-container" title="Steve\'s head"><img class="player-head" src="/img/steve.png"><img class="player-head-overlay" src="/img/steve.png"></div>test</span>',
    ],
];

for (const [
    name,
    component,
    translations,
    expected,
] of COMPONENT_FORMATTING_TESTS) {
    test(name, () => {
        expect(() => assertIsComponent(component)).not.toThrow();

        const element = formatMessage(component, translations);
        if (element instanceof Text) {
            expect(element.textContent).toBe(expected);
        } else {
            expect(element.outerHTML).toBe(expected);
        }
    });
}
