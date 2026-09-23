// @ts-check
'use strict';

import { formatComponentToString } from '../messages/message_parsing.mjs';
import { querySelectorWithAssertion } from '../utils.mjs';

/**
 * @typedef {import('../messages/message_types.mjs').PlayerInfo} PlayerInfo
 */

const tabListElement = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#tab-list')
);

const chatInputElement = /** @type {HTMLTextAreaElement} */ (
    querySelectorWithAssertion('#message-input')
);

class TabListManager {
    /** @type {number} */
    #selectedIndex;

    /** @type {PlayerInfo[]} */
    #players;

    constructor() {
        this.#selectedIndex = 0;
        this.#players = [];
    }

    /**
     * Opens the tab list.
     * @param {PlayerInfo[]} players
     */
    openTabList(players) {
        // Get word before the cursor in the input box
        const cursorPos = chatInputElement.selectionStart;
        const textBefore = chatInputElement.value.substring(0, cursorPos);
        const match = textBefore.match(/\b(\w+)$/);
        if (!match) {
            return;
        }

        const wordBefore = match[1]?.toLocaleLowerCase();
        if (!wordBefore) {
            return;
        }

        // Find players that start with the word before the cursor
        const matches = players.filter(
            (player) =>
                formatComponentToString(player.playerDisplayName)
                    .toLocaleLowerCase()
                    .startsWith(wordBefore) ||
                player.playerName.toLocaleLowerCase().startsWith(wordBefore),
        );
        if (matches.length === 0) {
            this.hide();
            return;
        }

        this.#populateList(matches);
        this.show();
    }

    /**
     * Handles the keydown event for the chat input when the tab list is visible.
     * @param {KeyboardEvent} e
     */
    handleInputKeydown(e) {
        if (!this.visible()) {
            return;
        }

        switch (e.key) {
            case 'Tab':
                e.preventDefault();

                if (this.#players.length === 1) {
                    this.#insertPlayerName();
                } else if (e.shiftKey) {
                    this.#selectPrev();
                } else {
                    this.#selectNext();
                }
                return;
            case 'ArrowDown':
                e.preventDefault();
                this.#selectNext();
                return;
            case 'ArrowUp':
                e.preventDefault();
                this.#selectPrev();
                return;
            case 'Enter':
                e.preventDefault();
                this.#insertPlayerName();
                return;
            case 'Shift':
            case 'Control':
            case 'Alt':
            case 'Meta':
                // Ignore modifier keys.
                return;
            default:
                // Hide the tab list for any other input.
                this.hide();
        }
    }

    /**
     * Positions and shows the tab list based on the chat input position.
     */
    show() {
        tabListElement.style.display = 'flex';

        // Position relative to the bottom of the window, above the input area.
        const inputAreaElement = querySelectorWithAssertion('#input-area');
        const inputRect = inputAreaElement.getBoundingClientRect();
        tabListElement.style.bottom = `${window.innerHeight - inputRect.bottom + inputRect.height + 5}px`;

        // Position horizontally in line with the text cursor.
        const paddingLeft =
            window.getComputedStyle(inputAreaElement).paddingLeft;
        tabListElement.style.left = `calc(${this.#getPixelsToCursor()}px + ${paddingLeft})`;
    }

    /**
     * Hides the tab list.
     */
    hide() {
        tabListElement.style.display = 'none';

        const ul = tabListElement.querySelector('ul');
        if (!ul) {
            return;
        }

        ul.replaceChildren();
        this.#players = [];
        this.#selectedIndex = 0;
    }

    /**
     * Returns true if the tab list is visible.
     * @returns {boolean}
     */
    visible() {
        return tabListElement.style.display !== 'none';
    }

    /**
     * Populates the tab list with matching items.
     * @param {PlayerInfo[]} matches
     */
    #populateList(matches) {
        // Keep only what is rendered so keyboard navigation cannot select
        // a player that is not shown.
        this.#players = matches
            // Show names in alphabetical order.
            .sort((a, b) =>
                formatComponentToString(a.playerDisplayName).localeCompare(
                    formatComponentToString(b.playerDisplayName),
                ),
            )
            // Show only first 5 matches.
            .slice(0, 5);

        const ul = tabListElement.querySelector('ul');
        if (!ul) {
            return;
        }

        ul.replaceChildren(
            ...this.#players.map((match, index) => {
                    const li = document.createElement('li');
                    // Using mousedown because clicking causes blur event on chat input hiding the selection.
                    li.addEventListener('mousedown', () => {
                        this.#insertPlayerName();
                    });
                    li.addEventListener('mouseenter', () => {
                        this.#updateSelection(index);
                    });

                    const displayName = formatComponentToString(
                        match.playerDisplayName,
                    );
                    const displayNameUnchanged =
                        displayName.toLocaleLowerCase() ===
                        match.playerName.toLocaleLowerCase();
                    li.textContent = displayNameUnchanged
                        ? displayName
                        : `${displayName} (${match.playerName})`;

                    return li;
                }),
        );

        this.#updateSelection(0);
    }

    /**
     * Updates the visual selection within the tab list.
     * @param {number} newIndex
     */
    #updateSelection(newIndex) {
        const ul = tabListElement.querySelector('ul');
        if (!ul) {
            return;
        }

        const items = ul.querySelectorAll('li');
        items.forEach((item, index) => {
            if (index === newIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        this.#selectedIndex = newIndex;
    }

    /**
     * Selects the next player in the list.
     */
    #selectNext() {
        const newIndex = (this.#selectedIndex + 1) % this.#players.length;
        this.#updateSelection(newIndex);
    }

    /**
     * Selects the previous player in the list.
     */
    #selectPrev() {
        const newIndex =
            (this.#selectedIndex - 1 + this.#players.length) %
            this.#players.length;
        this.#updateSelection(newIndex);
    }

    /**
     * Inserts the selected player name into the chat input.
     */
    #insertPlayerName() {
        const selectedPlayer = this.#players[this.#selectedIndex];
        if (!selectedPlayer) {
            return;
        }

        const cursorPos = chatInputElement.selectionStart;
        const value = chatInputElement.value;
        const beforeCursor = value.substring(0, cursorPos);
        const afterCursor = value.substring(cursorPos);

        // Use playerName instead of playerDisplayName for direct-message commands
        const playerNameToInsert = beforeCursor.match(/^\/(tell|msg|w)[ ]+\w+$/)
            ? selectedPlayer.playerName
            : formatComponentToString(selectedPlayer.playerDisplayName);

        // There is a partial player name before the cursor. Get everything
        // before it and add the full player name after.
        const prefix = beforeCursor.match(/(.*?)\b\w+$/);
        const newBeforeCursor = (prefix?.[1] ?? '') + playerNameToInsert;
        chatInputElement.value = newBeforeCursor + afterCursor;

        // Update the cursor position.
        chatInputElement.selectionStart = newBeforeCursor.length;
        chatInputElement.selectionEnd = newBeforeCursor.length;

        this.hide();
    }

    /**
     * Measures the rendered width of the text before the cursor in pixels.
     * @returns {number}
     */
    #getPixelsToCursor() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            return 0;
        }

        const style = window.getComputedStyle(chatInputElement);
        context.font =
            style.font ||
            [
                style.fontStyle,
                style.fontVariant,
                style.fontWeight,
                `${style.fontSize}/${style.lineHeight}`,
                style.fontFamily,
            ].join(' ');

        const beforeCursor = chatInputElement.value.substring(
            0,
            chatInputElement.selectionStart,
        );
        const currentLine = beforeCursor.split(/\r?\n/).pop() ?? '';

        return context.measureText(currentLine).width;
    }
}

export const tabListManager = new TabListManager();
