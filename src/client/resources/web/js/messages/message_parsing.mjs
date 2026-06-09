// @ts-check
'use strict';

import { playerList } from '../managers/player_list.mjs';
import { directMessageManager } from '../managers/direct_message.mjs';
import { modalManager } from '../managers/modal_manager.mjs';
import { querySelectorWithAssertion } from '../utils.mjs';

// Minecraft JSON message parsing to HTML.
// A lot of the code below has been inspired (though not directly copied) by prismarine-chat: https://github.com/PrismarineJS/prismarine-chat

// These limits prevent DoS attacks and stack overflow issues from maliciously crafted messages
export const MAX_CHAT_LENGTH = 4096;
// Maximum length of a JSON path in a chat component object
export const MAX_CHAT_DEPTH = 32;

// Minecraft's standard color palette - used for legacy color code compatibility
/** @type {Record<string, string>} */
const COLOR_CODES = {
    0: 'black',
    1: 'dark_blue',
    2: 'dark_green',
    3: 'dark_aqua',
    4: 'dark_red',
    5: 'dark_purple',
    6: 'gold',
    7: 'gray',
    8: 'dark_gray',
    9: 'blue',
    a: 'green',
    b: 'aqua',
    c: 'red',
    d: 'light_purple',
    e: 'yellow',
    f: 'white',
};

/** @type {Record<string, string>} */
const FORMATTING_CODES = {
    r: 'reset',
    k: 'obfuscated',
    l: 'bold',
    m: 'strikethrough',
    n: 'underlined',
    o: 'italic',
};

/** @type {Record<string, string>} */
const TEXT_CODES = { ...COLOR_CODES, ...FORMATTING_CODES };
const CODE_SENTINEL = '§';
export const TEXT_CODES_PATTERN = `${CODE_SENTINEL}([${Object.keys(TEXT_CODES).join('')}])`;

/**
 * Arabic to Romain numeral map. Minecraft does not display "I" so it is blank.
 * @type {string[]}
 */
const ROMAN_NUMERALS = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const VALID_HOVER_EVENTS = ['show_text', 'show_item', 'show_entity'];
const VALID_CLICK_EVENTS = [
    'open_url',
    'open_file',
    'run_command',
    'suggest_command',
    'change_page',
    'copy_to_clipboard',
    'show_dialog',
    'custom',
];

/** @type {(keyof Component)[]} */
const CONTENT_ATTRIBUTES = ['text', 'translate', 'extra', 'player'];

/**
 * @typedef {Object} Component
 * @property {string} [text] - Text content
 * @property {string} [translate] - Translation key
 * @property {string} [fallback] - Fallback value for translation.
 * @property {(number | string | Component)[]} [with] - Translation parameters
 * @property {(number | string | Component)[]} [extra] - Additional components to append
 * @property {string} [color] - Text color - can be a named color or hex value
 * @property {number | [number, number, number, number]} [shadow_color] - Either a signed 32bit integer or four numbers in 0-1 range as [R, G, B, A]
 * @property {boolean} [bold] - Whether text should be bold
 * @property {boolean} [italic] - Whether text should be italic
 * @property {boolean} [underlined] - Whether text should be underlined
 * @property {boolean} [strikethrough] - Whether text should be struck through
 * @property {boolean} [obfuscated] - Whether text should be obfuscated (randomly changing characters)
 * @property {string} [insertion] - String to insert when the component is shift-clicked
 * @property {PlayerComponent} [player] - User data for displaying a player head
 * @property {boolean} [hat] - Whether to show a player hat for a player head.
 * @property {HoverEvent} [hover_event] - Hover event
 * @property {ClickEvent} [click_event] - Click event
 */

/**
 * @typedef {Object} PlayerComponent
 * @property {string} [name] Player username
 * @property {string} [id] Player UUID
 */

/**
 * @typedef {
     | ShowTextHoverEvent
     | ShowItemHoverEvent
     | ShowEntityHoverEvent
   } HoverEvent
 */

/**
 * @typedef {Object} ShowTextHoverEvent
 * @property {'show_text'} action - Displays a text tooltip
 * @property {number | string | Component | (number | string | Component)[]} [contents] - The text content to show in the tooltip
 * @property {number | string | Component | (number | string | Component)[]} [value] - Deprecated: The text content to show in the tooltip
 */

/**
 * @typedef {Object} ShowItemHoverEvent
 * @property {'show_item'} action - Displays an item's tooltip
 * @property {string} id - The item ID
 * @property {number} [count] - The number of items to show
 * @property {string} [tag] - The tag of the item to show
 * @property {Partial<ItemComponents>} [components] Extra metadata
 */

/**
 * @typedef {CustomNameItemComponent & EnchantmentsItemComponent} ItemComponents
 */

/**
 * @typedef {{ "minecraft:custom_name": string; }} CustomNameItemComponent
 */

/**
 * @typedef {{ "minecraft:enchantments": Record<string, number>; }} EnchantmentsItemComponent
 */

/**
 * @typedef {Object} ShowEntityHoverEvent
 * @property {'show_entity'} action - Displays entity information
 * @property {string} id - The entity ID
 * @property {string | Component} [name] - The name of the entity to show
 */

/**
 * @typedef {
     | OpenUrlClickEvent
     | OpenFileClickEvent
     | RunCommandClickEvent
     | SuggestCommandClickEvent
     | ChangePageClickEvent
     | CopyToClipboardClickEvent
     | ShowDialogClickEvent
     | CustomClickEvent
   } ClickEvent
 */

/**
 * @typedef {Object} OpenUrlClickEvent
 * @property {'open_url'} action - Opens a URL
 * @property {string} url - The URL to open
 */

/**
 * @typedef {Object} OpenFileClickEvent
 * @property {'open_file'} action - Opens a file
 * @property {string} path - The file to open
 */

/**
 * @typedef {Object} RunCommandClickEvent
 * @property {'run_command'} action - Runs a command
 * @property {string} command - The command to run
 */

/**
 * @typedef {Object} SuggestCommandClickEvent
 * @property {'suggest_command'} action - Suggests a command
 * @property {string} command - The command to suggest
 */

/**
 * @typedef {Object} ChangePageClickEvent
 * @property {'change_page'} action - Changes the page
 * @property {number} page - The page to change to
 */

/**
 * @typedef {Object} CopyToClipboardClickEvent
 * @property {'copy_to_clipboard'} action - Copies text to clipboard
 * @property {string} value - The text to copy
 */

/**
 * @typedef {Object} ShowDialogClickEvent
 * @property {'show_dialog'} action - Shows a dialog
 * @property {unknown} dialog - The dialog to show
 */

/**
 * @typedef {Object} CustomClickEvent
 * @property {'custom'} action - Performs a custom action
 * @property {string} id - The id of the custom action
 * @property {unknown} [payload] - Optional payload
 */

/**
 * Error class for component validation errors.
 * @class
 * @extends {Error}
 */
export class ComponentError extends Error {
    /**
     * @param {string} message
     * @param {string[]} path
     */
    constructor(message, path) {
        super(message);
        this.path = path;
    }

    /**
     * @override
     * @returns {string}
     */
    toString() {
        return `${this.message} at .${this.path.join('.')}`;
    }
}

/**
 * Whether a value is a non-array, non-null `object`.
 * @param {unknown} obj
 * @returns {obj is object}
 */
function isObject(obj) {
    return typeof obj === 'object' && !Array.isArray(obj) && obj !== null;
}

/**
 * Whether a component contains a content attribute.
 * @param {Component} component
 * @returns {boolean}
 */
function hasContent(component) {
    return CONTENT_ATTRIBUTES.some((attribute) => attribute in component);
}

/**
 * Type guard to check if a value is a valid Component object.
 * @param {unknown} component - The value to check
 * @param {string[]} path - The current path into the component
 * @returns {asserts component is Component}
 */
export function assertIsComponent(component, path = []) {
    // Depth tracking prevents stack overflow from circular references in malicious messages
    if (path.length > MAX_CHAT_DEPTH) {
        throw new ComponentError('Maximum chat depth exceeded', path);
    }

    if (!isObject(component)) {
        throw new ComponentError('Component is not an object', path);
    }

    /**
     * Checks if a value is a valid HoverEvent object.
     * @param {unknown} hoverEvent
     * @param {string[]} path
     * @returns {asserts hoverEvent is HoverEvent}
     */
    function assertIsHoverEvent(hoverEvent, path) {
        if (!isObject(hoverEvent)) {
            throw new ComponentError('HoverEvent is not an object', path);
        }

        if (!('action' in hoverEvent)) {
            throw new ComponentError('HoverEvent.action is not present', path);
        }

        if (typeof hoverEvent.action !== 'string') {
            throw new ComponentError('HoverEvent.action is not a string', [
                ...path,
                'action',
            ]);
        }

        if (!VALID_HOVER_EVENTS.includes(hoverEvent.action)) {
            throw new ComponentError(
                `HoverEvent.action is not a valid hover event: ${hoverEvent.action}`,
                [...path, 'action'],
            );
        }

        switch (hoverEvent.action) {
            case 'show_text':
                assertIsShowTextHoverEvent(hoverEvent, path);
                break;
            case 'show_item':
                assertIsShowItemHoverEvent(hoverEvent, path);
                break;
            case 'show_entity':
                assertIsShowEntityHoverEvent(hoverEvent, path);
                break;
        }
    }

    /**
     * Checks if a value is a valid show_text hover event.
     * @param {object} hoverEvent
     * @param {string[]} path
     * @returns {asserts hoverEvent is ShowTextHoverEvent}
     */
    function assertIsShowTextHoverEvent(hoverEvent, path) {
        if (!('contents' in hoverEvent) && !('value' in hoverEvent)) {
            throw new ComponentError(
                'HoverEvent does not have a contents or value property',
                path,
            );
        }

        const contents =
            'contents' in hoverEvent ? hoverEvent.contents : hoverEvent.value;
        if (typeof contents === 'string') {
            return;
        }
        if (typeof contents === 'number') {
            return;
        }

        if (Array.isArray(contents)) {
            contents.forEach((component, index) => {
                if (typeof component === 'string') {
                    return;
                }
                if (typeof component === 'number') {
                    return;
                }

                assertIsComponent(component, [
                    ...path,
                    'contents',
                    index.toString(),
                ]);
            });
        } else {
            assertIsComponent(contents, [...path, 'contents']);
        }
    }

    /**
     * Checks if a value is a valid show_item hover event.
     * @param {object} hoverEvent
     * @param {string[]} path
     * @returns {asserts hoverEvent is ShowItemHoverEvent}
     */
    function assertIsShowItemHoverEvent(hoverEvent, path) {
        if (!('id' in hoverEvent)) {
            throw new ComponentError('HoverEvent.id is not present', [
                ...path,
                'id',
            ]);
        }

        if (typeof hoverEvent.id !== 'string') {
            throw new ComponentError('HoverEvent.id is not a string', [
                ...path,
                'id',
            ]);
        }

        if ('count' in hoverEvent && typeof hoverEvent.count !== 'number') {
            throw new ComponentError('HoverEvent.count is not a number', [
                ...path,
                'count',
            ]);
        }

        if ('tag' in hoverEvent && typeof hoverEvent.tag !== 'string') {
            throw new ComponentError('HoverEvent.tag is not a string', [
                ...path,
                'tag',
            ]);
        }

        if ('components' in hoverEvent) {
            assertIsItemComponents(hoverEvent['components'], [
                ...path,
                'components',
            ]);
        }
    }

    /**
     * Checks if a value is a valid item components object.
     * @param {unknown} components
     * @param {string[]} path
     * @returns {asserts components is ItemComponents}
     */
    function assertIsItemComponents(components, path) {
        if (!isObject(components)) {
            throw new ComponentError('ItemComponents is not an object', [
                ...path,
            ]);
        }

        if (
            'minecraft:custom_name' in components &&
            typeof components['minecraft:custom_name'] !== 'string'
        ) {
            throw new ComponentError(
                'ItemComponents.minecraft:custom_name is not a string',
                [...path, 'minecraft:custom_name'],
            );
        }

        if ('minecraft:enchantments' in components) {
            const enchantments = components['minecraft:enchantments'];
            if (!isObject(enchantments)) {
                throw new ComponentError(
                    'ItemComponents.minecraft:enchantments is not an object',
                    [...path, 'minecraft:enchantments'],
                );
            }

            for (const [enchantment_id, level] of Object.entries(
                enchantments,
            )) {
                if (typeof level !== 'number') {
                    throw new ComponentError(
                        'Enchantment level is not a number',
                        [...path, 'minecraft:enchantments', enchantment_id],
                    );
                }
            }
        }
    }

    /**
     * Checks if a value is a valid show_entity hover event.
     * @param {object} hoverEvent
     * @param {string[]} path
     * @returns {asserts hoverEvent is ShowEntityHoverEvent}
     */
    function assertIsShowEntityHoverEvent(hoverEvent, path) {
        if (!('id' in hoverEvent)) {
            throw new ComponentError('HoverEvent.id is not present', [
                ...path,
                'id',
            ]);
        }

        if (typeof hoverEvent.id !== 'string') {
            throw new ComponentError('HoverEvent.id is not a string', [
                ...path,
                'id',
            ]);
        }

        if ('name' in hoverEvent && hoverEvent.name !== null) {
            if (typeof hoverEvent.name === 'string') {
                return;
            }

            if (!isObject(hoverEvent.name)) {
                throw new ComponentError(
                    'HoverEvent.name is not a string or valid component',
                    [...path, 'name'],
                );
            }

            assertIsComponent(hoverEvent.name, [...path, 'name']);
        }
    }

    /**
     * Checks if a value is a valid click event.
     * @param {unknown} clickEvent
     * @param {string[]} path
     * @returns {asserts clickEvent is ClickEvent}
     */
    function assertIsClickEvent(clickEvent, path) {
        if (!isObject(clickEvent)) {
            throw new ComponentError('ClickEvent is not an object', path);
        }

        if (!('action' in clickEvent)) {
            throw new ComponentError(
                'ClickEvent does not have an action property',
                path,
            );
        }

        if (typeof clickEvent.action !== 'string') {
            throw new ComponentError('ClickEvent.action is not a string', [
                ...path,
                'action',
            ]);
        }

        if (!VALID_CLICK_EVENTS.includes(clickEvent.action)) {
            throw new ComponentError(
                `ClickEvent.action is not a valid click event: ${clickEvent.action}`,
                [...path, 'action'],
            );
        }

        switch (clickEvent.action) {
            case 'open_url':
                if (!('url' in clickEvent)) {
                    throw new ComponentError('ClickEvent.url is not present', [
                        ...path,
                        'url',
                    ]);
                }

                if (typeof clickEvent.url !== 'string') {
                    throw new ComponentError('ClickEvent.url is not a string', [
                        ...path,
                        'url',
                    ]);
                }
                break;
            case 'open_file':
                if (!('path' in clickEvent)) {
                    throw new ComponentError('ClickEvent.path is not present', [
                        ...path,
                        'path',
                    ]);
                }

                if (typeof clickEvent.path !== 'string') {
                    throw new ComponentError(
                        'ClickEvent.path is not a string',
                        [...path, 'path'],
                    );
                }
                break;
            case 'run_command':
                if (!('command' in clickEvent)) {
                    throw new ComponentError(
                        'ClickEvent.command is not present',
                        [...path, 'command'],
                    );
                }

                if (typeof clickEvent.command !== 'string') {
                    throw new ComponentError(
                        'ClickEvent.command is not a string',
                        [...path, 'command'],
                    );
                }
                break;
            case 'suggest_command':
                if (!('command' in clickEvent)) {
                    throw new ComponentError(
                        'ClickEvent.command is not present',
                        [...path, 'command'],
                    );
                }

                if (typeof clickEvent.command !== 'string') {
                    throw new ComponentError(
                        'ClickEvent.command is not a string',
                        [...path, 'command'],
                    );
                }
                break;
            case 'change_page':
                if (!('page' in clickEvent)) {
                    throw new ComponentError('ClickEvent.page is not present', [
                        ...path,
                        'page',
                    ]);
                }

                if (typeof clickEvent.page !== 'number') {
                    throw new ComponentError(
                        'ClickEvent.page is not a number',
                        [...path, 'page'],
                    );
                }
                break;
            case 'copy_to_clipboard':
                if (!('value' in clickEvent)) {
                    throw new ComponentError(
                        'ClickEvent.value is not present',
                        [...path, 'value'],
                    );
                }

                if (typeof clickEvent.value !== 'string') {
                    throw new ComponentError(
                        'ClickEvent.value is not a string',
                        [...path, 'value'],
                    );
                }
                break;
            case 'show_dialog':
                if (!('dialog' in clickEvent)) {
                    throw new ComponentError(
                        'ClickEvent.dialog is not present',
                        [...path, 'dialog'],
                    );
                }
                break;
            case 'custom':
                if (!('id' in clickEvent)) {
                    throw new ComponentError('ClickEvent.id is not present', [
                        ...path,
                        'id',
                    ]);
                }

                if (typeof clickEvent.id !== 'string') {
                    throw new ComponentError('ClickEvent.id is not a string', [
                        ...path,
                        'id',
                    ]);
                }
                break;
            default:
                throw new ComponentError(
                    `ClickEvent.action is not valid: ${clickEvent.action}`,
                    [...path, 'action'],
                );
        }
    }

    /**
     * Checks if a value is a valid `shadow_color`
     * @param {unknown} shadow_color
     * @param {string[]} path
     * @returns {asserts shadow_color is Component["shadow_color"]}
     */
    function assertIsShadowColor(shadow_color, path) {
        if (typeof shadow_color === 'number') {
            if (!Number.isInteger(shadow_color)) {
                throw new ComponentError('shadow_color is not an integer', [
                    ...path,
                ]);
            }

            if (shadow_color < -(2 ** 31) || shadow_color > 2 ** 31 - 1) {
                throw new ComponentError('shadow_color is out of range', [
                    ...path,
                ]);
            }

            return;
        }

        if (Array.isArray(shadow_color)) {
            if (shadow_color.length !== 4) {
                throw new ComponentError('shadow_color must have length 4', [
                    ...path,
                ]);
            }

            shadow_color.forEach((value, index) => {
                if (typeof value !== 'number') {
                    throw new ComponentError(
                        'shadow_color values must be numbers',
                        [...path, index.toString()],
                    );
                }

                if (value < 0 || value > 1) {
                    throw new ComponentError(
                        'shadow_color values must be in range 0..1',
                        [...path, index.toString()],
                    );
                }
            });

            return;
        }

        throw new ComponentError('shadow_color is not a number or array', [
            ...path,
        ]);
    }

    /**
     * Checks if a value is a valid PlayerComponent object.
     * @param {unknown} player
     * @param {string[]} path
     * @returns {asserts player is PlayerComponent}
     */
    function assertIsPlayerComponent(player, path) {
        if (!isObject(player)) {
            throw new ComponentError('PlayerComponent is not an object', path);
        }

        if (!('name' in player) && !('id' in player)) {
            throw new ComponentError(
                'PlayerComponent does not have a name or id property',
                path,
            );
        }

        if ('name' in player && typeof player.name !== 'string') {
            throw new ComponentError('PlayerComponent.name is not a string', [
                ...path,
                'name',
            ]);
        }

        if ('id' in player && typeof player.id !== 'string') {
            throw new ComponentError('PlayerComponent.id is not a string', [
                ...path,
                'id',
            ]);
        }
    }

    if ('text' in component && typeof component.text !== 'string') {
        throw new ComponentError('Component.text is not a string', [
            ...path,
            'text',
        ]);
    }

    if ('translate' in component && typeof component.translate !== 'string') {
        throw new ComponentError('Component.translate is not a string', [
            ...path,
            'translate',
        ]);
    }

    if ('fallback' in component && typeof component.fallback !== 'string') {
        throw new ComponentError('Component.fallback is not a string', [
            ...path,
            'fallback',
        ]);
    }

    if ('color' in component && typeof component.color !== 'string') {
        throw new ComponentError('Component.color is not a string', [
            ...path,
            'color',
        ]);
    }

    if ('shadow_color' in component) {
        assertIsShadowColor(component.shadow_color, [...path, 'shadow_color']);
    }

    if ('bold' in component && typeof component.bold !== 'boolean') {
        throw new ComponentError('Component.bold is not a boolean', [
            ...path,
            'bold',
        ]);
    }

    if ('italic' in component && typeof component.italic !== 'boolean') {
        throw new ComponentError('Component.italic is not a boolean', [
            ...path,
            'italic',
        ]);
    }

    if (
        'underlined' in component &&
        typeof component.underlined !== 'boolean'
    ) {
        throw new ComponentError('Component.underlined is not a boolean', [
            ...path,
            'underlined',
        ]);
    }

    if (
        'strikethrough' in component &&
        typeof component.strikethrough !== 'boolean'
    ) {
        throw new ComponentError('Component.strikethrough is not a boolean', [
            ...path,
            'strikethrough',
        ]);
    }

    if (
        'obfuscated' in component &&
        typeof component.obfuscated !== 'boolean'
    ) {
        throw new ComponentError('Component.obfuscated is not a boolean', [
            ...path,
            'obfuscated',
        ]);
    }

    if ('extra' in component) {
        if (!Array.isArray(component.extra)) {
            throw new ComponentError('Component.extra is not an array', [
                ...path,
                'extra',
            ]);
        }

        component.extra.forEach((component, index) => {
            if (typeof component === 'string') {
                return;
            }
            if (typeof component === 'number') {
                return;
            }

            assertIsComponent(component, [...path, 'extra', index.toString()]);
        });
    }

    if ('with' in component) {
        if (!Array.isArray(component.with)) {
            throw new ComponentError('Component.with is not an array', [
                ...path,
                'with',
            ]);
        }

        component.with.forEach((component, index) => {
            if (typeof component === 'string') {
                return;
            }
            if (typeof component === 'number') {
                return;
            }

            assertIsComponent(component, [...path, 'with', index.toString()]);
        });
    }

    if ('player' in component) {
        assertIsPlayerComponent(component.player, [...path, 'player']);
    }
    if ('hat' in component && typeof component.hat !== 'boolean') {
        throw new ComponentError('Component.hat must be a boolean', [
            ...path,
            'hat',
        ]);
    }

    if ('hover_event' in component) {
        assertIsHoverEvent(component.hover_event, [...path, 'hover_event']);
    }

    if ('click_event' in component) {
        assertIsClickEvent(component.click_event, [...path, 'click_event']);
    }

    if ('insertion' in component) {
        if (typeof component.insertion !== 'string') {
            throw new ComponentError('Component.insertion is not a string', [
                ...path,
                'insertion',
            ]);
        }
    }
}

/**
 * Map strings from `minecraft:stone` format to `item.minecraft.stone` format.
 * @param {string} registry_id
 * @param {Record<string, string>} translations
 */
function idToTranslationKey(registry_id, translations) {
    const [namespace, id] = /** @type {[string, string | undefined]} */ (
        registry_id.split(':', 2)
    );
    if (!id) {
        // Malformed registry_id
        return registry_id;
    }

    const types = ['item', 'block', 'enchantment', 'entity', 'effect'];
    for (const type of types) {
        const key = `${type}.${namespace}.${id}`;
        if (key in translations) {
            return key;
        }
    }

    return registry_id;
}

/**
 * Supports both legacy named colors and modern hex colors while preventing XSS via color values.
 * @param {string} color
 * @returns {boolean}
 */
function isValidColor(color) {
    if (!color) {
        return false;
    }

    color = color.toLowerCase();
    if (Object.values(COLOR_CODES).includes(color)) {
        return true;
    }

    return /^#[0-9a-fA-F]{6}$/.test(color); // Allow valid hex colors (e.g., #FF0000)
}

/**
 * Convert wire-format text shadow color to an `rgba(...)` formatted string.
 * @param {number | [number, number, number, number]} shadow_color
 * @returns {string}
 */
function shadowColorToCSSColor(shadow_color) {
    /**
     * Converts a signed 32bit integer in 0xAARRGGBB format into an RGBA array.
     * @param {number} n
     * @returns {[number, number, number, number]}
     */
    function intToRGBA(n) {
        const hex = (n >>> 0).toString(16).padStart(8, '0');
        return /** @type {[number, number, number, number]} */ (
            [
                hex.slice(2, 4),
                hex.slice(4, 6),
                hex.slice(6, 8),
                hex.slice(0, 2),
            ].map((value) => parseInt(value, 16) / 255)
        );
    }

    const [r, g, b, a] =
        typeof shadow_color === 'number'
            ? intToRGBA(shadow_color)
            : shadow_color;

    return `rgba(${r * 255},${g * 255},${b * 255},${a})`;
}

// Imitates Minecraft's obfuscated text.
export function initializeObfuscation() {
    const chars = `
        ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789
        ¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿
        ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ
        ☠☮☯☪☭☢☣☤☥☦☧☨☩☪☫☬☭
        ☰☱☲☳☴☵☶☷
        ☸☹☺☻☼☽☾☿
        ✈✉✎✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝✞✟
        ℃℉℗℘ℙℚℛℜℝ℞℟
        ™Ⓡ©
    `.replace(/[\n\s]/g, ''); // Remove unnecessary whitespace and newlines so we can have a nicely formatted template literal.
    const charsLength = chars.length;
    const maxElements = 100; // Limit number of obfuscated elements

    /** @type {number | null} */
    let animationFrameId = null;
    let lastUpdate = 0;

    const updateInterval = 50; // Rate limiting updates to 50ms intervals to balance animation smoothness with performance

    /**
     * @param {number} timestamp
     */
    function updateObfuscatedText(timestamp) {
        // Uses requestAnimationFrame with timestamp checking for efficient rate limiting
        // that automatically pauses when tab is inactive
        if (timestamp - lastUpdate >= updateInterval) {
            const elements = document.getElementsByClassName('mc-obfuscated');
            const elementsToProcess = Math.min(elements.length, maxElements);

            for (let i = 0; i < elementsToProcess; i++) {
                const element = elements[i];
                if (!element) continue;

                const length = element.textContent
                    ? element.textContent.length
                    : 0;
                let result = '';

                for (let j = 0; j < length; j++) {
                    result += chars.charAt(
                        Math.floor(Math.random() * charsLength),
                    );
                }

                element.textContent = result;
            }

            lastUpdate = timestamp;
        }

        animationFrameId = requestAnimationFrame(updateObfuscatedText);
    }

    animationFrameId = requestAnimationFrame(updateObfuscatedText);

    return () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
    };
}

/**
 * Gets the class name for a § code.
 * @param {string} textCode
 * @returns {string}
 */
function className(textCode) {
    if (COLOR_CODES[textCode]) {
        return `mc-${COLOR_CODES[textCode].replace(/_/g, '-')}`;
    }

    if (FORMATTING_CODES[textCode]) {
        return `mc-${FORMATTING_CODES[textCode]}`;
    }

    return '';
}

/**
 * Creates a formatted element using § codes.
 * @param {string} text
 * @param {string[]} codes
 * @returns {Element | Text}
 */
function createFormattedElement(text, codes) {
    if (codes.length === 0) {
        return document.createTextNode(text);
    }

    const span = document.createElement('span');
    span.classList.add(...codes.map(className));
    span.textContent = text;
    return span;
}

/**
 * Colorizes text with Minecraft's § codes.
 * @param {string} text
 * @returns {(Element | Text)[]}
 */
function colorizeText(text) {
    const result = [];
    const regex = new RegExp(TEXT_CODES_PATTERN, 'g');
    let lastIndex = 0;
    let match = regex.exec(text);

    /** @type {string | null} */
    let colorCode = null;
    const formatCodes = /** @type {Set<string>} */ (new Set());
    /**
     * List of codes to apply to the text.
     * @param {Set<string>} formatCodes
     * @param {string | null} colorCode
     * @returns {string[]}
     */
    function codes(formatCodes, colorCode) {
        return Array.from(formatCodes).concat(colorCode ? [colorCode] : []);
    }

    while (match !== null) {
        if (lastIndex < match.index) {
            result.push(
                createFormattedElement(
                    text.slice(lastIndex, match.index),
                    codes(formatCodes, colorCode),
                ),
            );
        }

        const code = match[1];
        switch (code) {
            case undefined:
                throw new Error('Unreachable!');
            case 'r':
                colorCode = null;
                formatCodes.clear();
                break;
            default:
                if (code in COLOR_CODES) {
                    colorCode = code;
                } else {
                    formatCodes.add(code);
                }
        }

        lastIndex = regex.lastIndex;
        match = regex.exec(text);
    }

    if (lastIndex < text.length) {
        result.push(
            createFormattedElement(
                text.slice(lastIndex),
                codes(formatCodes, colorCode),
            ),
        );
    }

    return result;
}

/**
 * Handles numbered substitution (%1$s, %2$s, etc.)
 * @param {string} template
 * @param {(number | string | Component)[]} args
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function numberedSubstitution(template, args, translations) {
    /** @type {(Element | Text)[]} */
    const result = [];
    const regex = /%(\d+)\$s/g;
    let lastIndex = 0;
    let match = regex.exec(template);

    while (match !== null) {
        // Add text before the placeholder
        if (lastIndex < match.index) {
            result.push(
                document.createTextNode(template.slice(lastIndex, match.index)),
            );
        }

        const index = parseInt(/** @type {string} */ (match[1])) - 1;
        const value = args[index];
        if (!value) {
            console.warn(
                `Missing argument ${index} for template "${template}"`,
            );
            result.push(document.createTextNode(match[0]));
        } else if (typeof value === 'string') {
            result.push(document.createTextNode(value));
        } else if (typeof value === 'number') {
            result.push(document.createTextNode(String(value)));
        } else {
            result.push(formatComponent(value, translations));
        }

        lastIndex = regex.lastIndex;
        match = regex.exec(template);
    }

    // Add remaining text
    if (lastIndex < template.length) {
        result.push(document.createTextNode(template.slice(lastIndex)));
    }

    return result;
}

/**
 * Handles simple %s placeholders.
 * @param {string} template
 * @param {(number | string | Component)[]} args
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function simpleSubstitution(template, args, translations) {
    /** @type {(Element | Text)[]} */
    const result = [];
    const regex = /%s/g;
    /** Index into template */
    let lastIndex = 0;

    let match = regex.exec(template);

    /** Index into args */
    let index = 0;
    while (match !== null) {
        // Add text before the placeholder
        if (lastIndex < match.index) {
            result.push(
                document.createTextNode(template.slice(lastIndex, match.index)),
            );
        }

        const value = args[index++];
        if (!value) {
            console.warn(
                `Missing argument ${index} for template "${template}"`,
            );
            result.push(document.createTextNode('%s'));
        } else if (typeof value === 'string') {
            result.push(document.createTextNode(value));
        } else if (typeof value === 'number') {
            result.push(document.createTextNode(String(value)));
        } else {
            result.push(formatComponent(value, translations));
        }

        lastIndex = regex.lastIndex;
        match = regex.exec(template);
    }

    // Add remaining text
    if (lastIndex < template.length) {
        result.push(document.createTextNode(template.slice(lastIndex)));
    }

    return result;
}

/**
 * Supports both numbered (%1$s) and sequential (%s) placeholder formats.
 * @param {string} key
 * @param {(number | string | Component)[]} args
 * @param {Record<string, string>} translations
 * @param {string} [fallback]
 * @returns {(Element | Text)[]}
 */
function formatTranslation(key, args, translations, fallback) {
    if (!key) {
        console.warn('Translation key is missing');
        return [document.createTextNode(key)];
    }

    // Handle placeholder keys like "%s" directly
    if (key === '%s') {
        if (args.length === 0) {
            console.warn(`Missing arguments for placeholder key: ${key}`);
            return [document.createTextNode(key)];
        }

        return args.map((value) => {
            if (typeof value === 'string') {
                return document.createTextNode(value);
            }
            if (typeof value === 'number') {
                return document.createTextNode(String(value));
            }

            return formatComponent(value, translations);
        });
    }

    const template = translations[key];
    if (!template) {
        console.warn(`Missing translation for key: ${key}`);
        return [document.createTextNode(fallback ?? key)];
    }

    try {
        if (template.includes('$s')) {
            return numberedSubstitution(template, args, translations);
        }

        return simpleSubstitution(template, args, translations);
    } catch (error) {
        console.error(`Error formatting translation for key: ${key}`, error);
        return [document.createTextNode(key)];
    }
}

/**
 * Formats a "show_text" hover event into an array of DOM nodes.
 * @param {ShowTextHoverEvent} hoverEvent
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function formatShowTextHoverEvent(hoverEvent, translations) {
    const contents = hoverEvent.contents ?? hoverEvent.value;
    if (typeof contents === 'undefined') {
        console.warn('HoverEvent.contents is undefined');
        return [];
    }

    if (typeof contents === 'string') {
        return [document.createTextNode(contents)];
    }
    if (typeof contents === 'number') {
        return [document.createTextNode(String(contents))];
    }

    if (Array.isArray(contents)) {
        return contents.map((component) => {
            if (typeof component === 'string') {
                return document.createTextNode(component);
            }
            if (typeof component === 'number') {
                return document.createTextNode(String(component));
            }

            return formatComponent(component, translations);
        });
    }

    return [formatComponent(contents, translations)];
}

/**
 * Formats a "show_item" hover event into an array of DOM nodes.
 * @param {ShowItemHoverEvent} hoverEvent
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function formatShowItemHoverEvent(hoverEvent, translations) {
    /** @type {(Text | Element)[]} */
    const contents = [];

    const count = hoverEvent.count ?? 1;
    if (count > 1) {
        contents.push(document.createTextNode(`${count}x`));
    }

    const customName = hoverEvent.components?.['minecraft:custom_name'];
    if (customName) {
        // Minecraft always shows custom names as aqua and italic in hover text
        contents.push(
            formatComponent({
                text: `${customName}\n`,
                color: 'aqua',
                italic: true,
            }),
        );
    } else {
        contents.push(
            formatComponent(
                { translate: idToTranslationKey(hoverEvent.id, translations) },
                translations,
            ),
        );
    }

    const enchantments = hoverEvent.components?.['minecraft:enchantments'];
    if (enchantments) {
        for (const [enchantment_id, level] of Object.entries(enchantments)) {
            contents.push(
                formatComponent(
                    {
                        translate: idToTranslationKey(
                            enchantment_id,
                            translations,
                        ),
                        color: 'gray',
                    },
                    translations,
                ),
            );

            const numeral = ROMAN_NUMERALS[level] ?? '';
            const numeralText = `${numeral ? ` ${numeral}` : ''}\n`;
            contents.push(
                formatComponent({ text: numeralText, color: 'gray' }),
            );
        }
    }

    return contents;
}

/**
 * Formats a "show_entity" hover event into an array of DOM nodes.
 * @param {ShowEntityHoverEvent} hoverEvent
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function formatShowEntityHoverEvent(hoverEvent, translations) {
    switch (typeof hoverEvent.name) {
        case 'object':
            return [formatComponent(hoverEvent.name, translations)];
        case 'string':
            return [document.createTextNode(hoverEvent.name)];
        case 'undefined':
            return [document.createTextNode('Unnamed Entity')];
    }
}

/**
 * Formats a hover event into an array of DOM nodes.
 * @param {HoverEvent} hoverEvent
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function formatHoverEvent(hoverEvent, translations) {
    switch (hoverEvent.action) {
        case 'show_text':
            return formatShowTextHoverEvent(hoverEvent, translations);
        case 'show_item':
            return formatShowItemHoverEvent(hoverEvent, translations);
        case 'show_entity':
            return formatShowEntityHoverEvent(hoverEvent, translations);
    }
}

/**
 * Handle an `open_url` click event.
 * @param {MouseEvent} event - The click event
 * @param {string} url - The URL to open
 */
function handleOpenUrl(event, url) {
    if (event.shiftKey) {
        event.preventDefault();
        return;
    }

    const target = event.target;
    if (!(target instanceof HTMLAnchorElement)) {
        return;
    }

    if (target.textContent === url) {
        // Perform default behavior (open in new tab)
        return;
    }

    event.preventDefault();
    modalManager.open(buildOpenUrlModalContents(url));
}

/**
 * Builds the confirmation shown before opening a (potentially untrusted) link.
 * @param {string} url - The URL to open.
 * @returns {HTMLDivElement}
 */
function buildOpenUrlModalContents(url) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-open-url';

    const intro = document.createElement('p');
    intro.textContent = 'Are you sure you want to open the following website?';

    const urlParagraph = document.createElement('p');
    urlParagraph.className = 'modal-url';
    urlParagraph.textContent = url;

    const warning = document.createElement('p');
    warning.textContent = "Never open links from people you don't trust!";

    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';

    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Yes';
    confirmButton.addEventListener('click', () => {
        window.open(url, '_blank', 'noopener,noreferrer');
        modalManager.close();
    });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'No';
    cancelButton.addEventListener('click', () => modalManager.close());

    buttons.append(confirmButton, cancelButton);

    wrapper.append(intro, urlParagraph, warning, buttons);
    return wrapper;
}

/**
 * Handle a `suggest_command` click event.
 * @param {MouseEvent} event - The click event
 * @param {string} command - The command to suggest
 */
function handleSuggestCommand(event, command) {
    if (event.shiftKey) {
        return;
    }

    const chatInputElement = /** @type {HTMLTextAreaElement} */ (
        querySelectorWithAssertion('#message-input')
    );

    const regex = /^\/(w|msg|tell) ([^\s]+)/;
    const match = command.match(regex);
    if (match) {
        const playerName = /** @type {string} */ (match[2]);
        const player = playerList.getPlayerByName(playerName);
        const messagingPlayer = directMessageManager.getPlayer();

        if (player && playerName !== messagingPlayer?.playerName) {
            const playerChatButton = /** @type {HTMLImageElement} */ (
                querySelectorWithAssertion(
                    `[data-player-id="${player.playerId}"] .player-chat-icon`,
                )
            );
            playerChatButton.click();
        }
    } else {
        chatInputElement.value = command;
    }

    chatInputElement.focus();
}

/**
 * Handle a `copy_to_clipboard` click event.
 * @param {MouseEvent} event - The click event
 * @param {string} text - The text to copy
 */
function handleCopyToClipboard(event, text) {
    if (event.shiftKey) {
        return;
    }

    navigator.clipboard.writeText(text);
}

/**
 * Handle a `run_command` click event.
 * @param {MouseEvent} event - The click event
 * @param {string} command - The command to run
 */
function handleRunCommand(event, command) {
    if (event.shiftKey) {
        return;
    }

    const chatInputElement = /** @type {HTMLTextAreaElement} */ (
        querySelectorWithAssertion('#message-input')
    );

    chatInputElement.value = command;
    chatInputElement.focus();

    chatInputElement.dispatchEvent(
        new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Enter',
            code: 'Enter',
        }),
    );
}

/**
 * Builds a click handler for a click event.
 * @param {ClickEvent} clickEvent
 * @returns {((event: MouseEvent) => void) | null}
 */
function buildClickHandler(clickEvent) {
    switch (clickEvent.action) {
        case 'open_url':
            return (event) => handleOpenUrl(event, clickEvent.url);
        case 'suggest_command':
            return (event) => handleSuggestCommand(event, clickEvent.command);
        case 'copy_to_clipboard':
            return (event) => handleCopyToClipboard(event, clickEvent.value);
        case 'run_command':
            return (event) => handleRunCommand(event, clickEvent.command);
        case 'open_file':
        case 'change_page':
        case 'show_dialog':
        case 'custom':
            return null;
    }
}

/**
 * Transforms component structure into HTML.
 * @param {Component} component
 * @param {Record<string, string>} [translations]
 * @returns {Element}
 */
function formatComponent(component, translations = {}) {
    if (!hasContent(component)) {
        return formatComponent({
            text: '{...}',
            color: 'red',
            hover_event: {
                action: 'show_text',
                contents: [
                    'Unsupported component:\n',
                    {
                        // Excape CODE_SENTINELs in the JSON content
                        text: JSON.stringify(component, null, 2).replace(
                            new RegExp(CODE_SENTINEL, 'g'),
                            '&',
                        ),
                        color: 'red',
                    },
                ],
            },
        });
    }

    const result =
        component.click_event?.action === 'open_url'
            ? document.createElement('a')
            : document.createElement('span');

    // Using CSS classes for standard colors for consistency with Minecrafts palette
    // Direct style attributes only used for hex colors
    if (component.color) {
        if (!isValidColor(component.color)) {
            console.warn('Invalid color format:', component.color);
        } else if (component.color.startsWith('#')) {
            result.style.color = component.color;
        } else {
            result.classList.add(`mc-${component.color.replace(/_/g, '-')}`);
        }
    }

    if (component.shadow_color) {
        result.style.textShadow = `0.1rem 0.1rem 0 ${shadowColorToCSSColor(component.shadow_color)}`;
    }

    if (component.bold) {
        result.classList.add('mc-bold');
    }
    if (component.italic) {
        result.classList.add('mc-italic');
    }
    if (component.underlined) {
        result.classList.add('mc-underlined');
    }
    if (component.strikethrough) {
        result.classList.add('mc-strikethrough');
    }
    if (component.obfuscated) {
        result.classList.add('mc-obfuscated');
    }

    if (component.insertion) {
        const insertion = component.insertion;

        result.addEventListener('click', (event) => {
            if (!event.shiftKey) {
                return;
            }

            const chatInputElement = /** @type {HTMLTextAreaElement} */ (
                querySelectorWithAssertion('#message-input')
            );

            chatInputElement.setRangeText(
                insertion,
                chatInputElement.selectionStart,
                chatInputElement.selectionEnd,
                'end',
            );
            chatInputElement.focus();
        });
    }

    if (component.click_event) {
        const clickHandler = buildClickHandler(component.click_event);

        if (clickHandler) {
            result.addEventListener('click', clickHandler);
            result.style.cursor = 'pointer';

            if (component.click_event.action === 'open_url') {
                result.setAttribute('href', component.click_event.url);
                result.setAttribute('target', '_blank');
                result.setAttribute('rel', 'noopener noreferrer');
            }
        }
    }

    if (component.hover_event) {
        const hoverContents = formatHoverEvent(
            component.hover_event,
            translations,
        );

        if (hoverContents.length > 0) {
            const hoverContainer = /** @type {HTMLDivElement} */ (
                querySelectorWithAssertion('#hover-container')
            );

            result.ariaLabel = hoverContents
                .map((component) => component.textContent)
                .join(' ');

            result.onmouseenter = (event) => {
                hoverContainer.replaceChildren(...hoverContents);
                formatPlainText(hoverContainer);
                if (result.textContent === hoverContainer.textContent) {
                    // Don't show hover container if it shows the same text as
                    // the element that is hovered.
                    return;
                }

                hoverContainer.style.left = `${event.clientX}px`;
                hoverContainer.style.top = `${event.clientY}px`;
                hoverContainer.style.display = 'block';
            };
            result.onmousemove = (event) => {
                hoverContainer.style.left = `${event.clientX}px`;
                hoverContainer.style.top = `${event.clientY}px`;
            };
            result.onmouseleave = () => {
                hoverContainer.style.display = 'none';
                hoverContainer.replaceChildren();
            };
        }
    }

    if (component.text) {
        result.appendChild(document.createTextNode(component.text));
    } else if (component.translate) {
        result.append(
            ...formatTranslation(
                component.translate,
                component.with ?? [],
                translations,
                component.fallback,
            ),
        );
    } else if (component.player) {
        // For now, we just render a Steve head.
        const name = component.player.name || 'Unknown Player';
        const headContainer = document.createElement('div');
        headContainer.className = 'player-component-container';
        headContainer.title = `${name}'s head`;

        // Create and configure the player's head image.
        const headImg = document.createElement('img');
        headImg.className = 'player-head';
        headImg.src = '/img/steve.png';
        headContainer.appendChild(headImg);

        if (component.hat ?? true) {
            const headOverlay = document.createElement('img');
            headOverlay.className = 'player-head-overlay';
            headOverlay.src = '/img/steve.png';
            headContainer.appendChild(headOverlay);
        }

        result.appendChild(headContainer);
    }

    if (component.extra) {
        result.append(
            ...component.extra.map((component) => {
                if (typeof component === 'string') {
                    return document.createTextNode(component);
                }
                if (typeof component === 'number') {
                    return document.createTextNode(String(component));
                }

                return formatComponent(component, translations);
            }),
        );
    }

    if (result.textContent && result.textContent.length > MAX_CHAT_LENGTH) {
        console.warn('Chat message exceeded maximum length, truncating');
        result.textContent = result.textContent.slice(0, MAX_CHAT_LENGTH);
    }

    return result;
}

/**
 * Transforms text content into HTML using § codes.
 * @param {Element} element
 */
export function formatPlainText(element) {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
    );

    /** @type {Text[]} */
    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(/** @type {Text} */ (walker.currentNode));
    }

    for (const textNode of textNodes) {
        const parent = textNode.parentNode;
        if (!parent) continue;

        const replacement = document.createDocumentFragment();
        replacement.append(...colorizeText(textNode.textContent ?? ''));

        parent.replaceChild(replacement, textNode);
    }
}

/**
 * Transforms a Minecraft component into plain text.
 * @param {Component} component
 * @returns {string}
 */
export function formatComponentToString(component) {
    const element = formatComponent(component);
    formatPlainText(element);
    return element.textContent ?? '';
}

/**
 * Transforms a Minecraft component into HTML.
 * @param {Component} component
 * @param {Record<string, string>} translations Translation key-value pairs
 * @returns {Element | Text}
 */
export function formatMessage(component, translations) {
    /** @type {Element} */
    let element;
    try {
        // First pass: create an HTML element from the component structure
        element = formatComponent(component, translations);
    } catch (error) {
        console.error('Error formatting component:', error);
        return document.createTextNode(
            String(component.text ?? '').slice(0, MAX_CHAT_LENGTH),
        );
    }

    // Second pass: transform the text content of the element and its children
    formatPlainText(element);

    return element;
}
