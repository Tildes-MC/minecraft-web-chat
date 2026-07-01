// @ts-check
'use strict';

import { querySelectorWithAssertion, formatTimestamp } from '../utils.mjs';
import {
    assertIsComponent,
    ComponentError,
    formatMessage,
} from '../messages/message_parsing.mjs';

/**
 * @typedef {import('../messages/message_types.mjs').ChatMessage} ChatMessage
 * @typedef {import('../messages/message_types.mjs').HistoryMetaData} HistoryMetaData
 */

/**
 * Sends a history request to the server.
 * @callback RequestHistoryFromServer
 * @param {number} limit - Number of messages to fetch.
 * @param {number} [before] - Fetch messages older than this timestamp.
 * @returns {boolean} Whether the request was actually sent (false when there is
 *     no server to request from).
 */

// Number of messages fetched per history request.
const HISTORY_LIMIT = 50;

// How close (in pixels) to the bottom counts as "at the bottom" for the purpose
// of auto scrolling when a new message arrives.
const BOTTOM_THRESHOLD = 35;

// How far (in pixels) the user must scroll up before the skip-to-present button
// appears.
const SKIP_BUTTON_THRESHOLD = 200;

// How close (in pixels) to the top triggers loading more history.
const HISTORY_LOAD_THRESHOLD = 300;

/**
 * Owns the chat message list: rendering messages, managing scroll position, and
 * paging older history in as the user scrolls up. The actual history request is
 * delegated to a callback so this stays free of any websocket/server concern.
 */
class MessageList {
    /** @type {HTMLElement} */
    #messagesElement;
    /** @type {HTMLDivElement} */
    #historyLoaderElement;
    /** @type {HTMLButtonElement} */
    #skipToPresentButton;

    // Tracks messages already shown, to prevent duplication on server join.
    /** @type {Set<string>} */
    #displayedIds = new Set();

    #isLoadingHistory = false;

    // When loading the most recent history (no `before` cursor) we want to end
    // up pinned to the newest message. When loading older history triggered by
    // scrolling up we instead keep the viewport stable.
    #pinToBottomOnHistory = false;

    /** @type {RequestHistoryFromServer | null} */
    #requestHistoryFromServer = null;

    /** @type {number | null} */
    #scrollDebounceTimer = null;

    /**
     * @param {HTMLElement} messagesElement
     * @param {HTMLDivElement} historyLoaderElement
     * @param {HTMLButtonElement} skipToPresentButton
     */
    constructor(messagesElement, historyLoaderElement, skipToPresentButton) {
        this.#messagesElement = messagesElement;
        this.#historyLoaderElement = historyLoaderElement;
        this.#skipToPresentButton = skipToPresentButton;

        this.#messagesElement.addEventListener('scroll', () =>
            this.#handleScroll(),
        );
        this.#skipToPresentButton.addEventListener('click', () =>
            this.#scrollToBottom(),
        );
    }

    /**
     * Wire up how history requests are sent to the server. Must be called once
     * during setup before any history can be loaded.
     * @param {RequestHistoryFromServer} requestHistoryFromServer
     */
    init(requestHistoryFromServer) {
        this.#requestHistoryFromServer = requestHistoryFromServer;
    }

    /**
     * Load the most recent history and land on the newest message. Used when
     * (re)joining a server.
     */
    requestRecentHistory() {
        this.#requestHistory(undefined);
    }

    /**
     * Display a chat message, ignoring duplicates and the web chat's own URL
     * announcement.
     * @param {ChatMessage} message
     * @returns {boolean} Whether the message was newly displayed (false if it
     *     was a duplicate).
     */
    addMessage(message) {
        if (this.#displayedIds.has(message.payload.uuid)) {
            return false;
        }
        this.#displayedIds.add(message.payload.uuid);

        requestAnimationFrame(() => {
            const messageElement = this.#buildMessageElement(message);
            if (messageElement === null) {
                return;
            }

            if (message.payload.history) {
                this.#insertHistoryMessage(messageElement);
            } else {
                this.#insertLiveMessage(messageElement);
            }
        });

        return true;
    }

    /**
     * Update the history loading state from server metadata. Stores the cursor
     * for the next "load older" request, or clears it when no more remains.
     * @param {HistoryMetaData} message
     */
    handleHistoryMetaData(message) {
        this.#isLoadingHistory = false;
        this.#historyLoaderElement.style.display = 'none';
        this.#historyLoaderElement.dataset['oldestMessageTimestamp'] = message
            .payload.moreHistoryAvailable
            ? message.payload.oldestMessageTimestamp.toString()
            : '';
    }

    /**
     * Remove all displayed messages, leaving the history loader in place and
     * resetting the loading state. Used when switching servers.
     */
    clear() {
        console.log('clearing history.');
        this.#displayedIds.clear();
        this.#historyLoaderElement.style.display = 'none';
        this.#historyLoaderElement.dataset['oldestMessageTimestamp'] = '';

        this.#messagesElement
            .querySelectorAll('.message')
            .forEach((element) => element.remove());
    }

    /**
     * Request a page of history. Without a `before` cursor this fetches the
     * newest messages and pins to the bottom; with one it loads older messages
     * while keeping the viewport stable.
     * @param {number} [before]
     */
    #requestHistory(before) {
        if (this.#isLoadingHistory) {
            console.log('Already loading history, skipping request.');
            return;
        }

        // The send (serverId lookup + websocket) lives with the owner. It
        // returns false when there is no server, in which case we stay idle.
        const sent =
            this.#requestHistoryFromServer?.(HISTORY_LIMIT, before) ?? false;
        if (!sent) {
            return;
        }

        this.#pinToBottomOnHistory = before === undefined;
        this.#isLoadingHistory = true;
        this.#historyLoaderElement.style.display = 'flex';
    }

    #handleScroll() {
        this.#skipToPresentButton.style.display =
            this.#distanceFromBottom() > SKIP_BUTTON_THRESHOLD
                ? 'block'
                : 'none';

        if (this.#scrollDebounceTimer) {
            clearTimeout(this.#scrollDebounceTimer);
        }
        this.#scrollDebounceTimer = setTimeout(
            () => this.#checkScrollAndLoadHistory(),
            100,
        );
    }

    /**
     * Load more history if the user has scrolled near the top and more remains.
     */
    #checkScrollAndLoadHistory() {
        if (this.#isLoadingHistory) {
            return;
        }

        const maybeTimestamp = Number(
            this.#historyLoaderElement.dataset['oldestMessageTimestamp'] ?? '',
        );
        if (!isFinite(maybeTimestamp)) {
            return;
        }

        if (this.#messagesElement.scrollTop <= HISTORY_LOAD_THRESHOLD) {
            this.#requestHistory(maybeTimestamp);
        }
    }

    /**
     * Distance in pixels between the current scroll position and the bottom of
     * the list. Zero means scrolled all the way down to the newest message.
     * @returns {number}
     */
    #distanceFromBottom() {
        return (
            this.#messagesElement.scrollHeight -
            this.#messagesElement.clientHeight -
            this.#messagesElement.scrollTop
        );
    }

    /**
     * @returns {boolean} Whether the user is at (or very close to) the newest
     *     message.
     */
    #isPinnedToBottom() {
        return this.#distanceFromBottom() <= BOTTOM_THRESHOLD;
    }

    #scrollToBottom() {
        this.#messagesElement.scrollTop = this.#messagesElement.scrollHeight;
    }

    /**
     * Build the <time> element shown alongside a message.
     * @param {number} timestamp
     * @returns {HTMLTimeElement}
     */
    #buildTimestampElement(timestamp) {
        const { timeString, fullDateTime } = formatTimestamp(timestamp);
        const timeElement = document.createElement('time');
        timeElement.dateTime = new Date(timestamp).toISOString();
        timeElement.textContent = timeString;
        timeElement.title = fullDateTime;
        timeElement.className = 'message-time';
        return timeElement;
    }

    /**
     * Format a message payload into a content node, falling back to a visible
     * error node when the payload can't be parsed.
     * @param {ChatMessage} message
     * @returns {Element | Text}
     */
    #buildMessageContent(message) {
        try {
            assertIsComponent(message.payload.component);
            return formatMessage(
                message.payload.component,
                message.payload.translations,
            );
        } catch (e) {
            console.error(message);
            if (e instanceof ComponentError) {
                console.error('Invalid component:', e.toString());
                return formatMessage(
                    {
                        text: 'Invalid message received from server',
                        color: 'red',
                    },
                    {},
                );
            }

            console.error('Error parsing message:', e);
            return formatMessage(
                { text: 'Error parsing message', color: 'red' },
                {},
            );
        }
    }

    /**
     * Build the <article> element for a chat message, or null when the message
     * should be ignored (the web chat announcing its own URL in chat).
     * @param {ChatMessage} message
     * @returns {HTMLElement | null}
     */
    #buildMessageElement(message) {
        const content = this.#buildMessageContent(message);
        if (content.textContent?.startsWith('Web chat: http://')) {
            return null;
        }

        const messageElement = document.createElement('article');
        messageElement.classList.add('message');
        if (message.payload.isPing) {
            messageElement.classList.add('ping');
        }
        messageElement.appendChild(
            this.#buildTimestampElement(message.timestamp),
        );
        messageElement.appendChild(content);
        return messageElement;
    }

    /**
     * Insert an older (history) message at the top, just after the loader.
     * History arrives newest-first, so prepending each one leaves the batch
     * oldest-at-top, newest-at-bottom. Adding content above the viewport would
     * push everything down, so we restore the user's position unless this is
     * the initial load.
     * @param {HTMLElement} messageElement
     */
    #insertHistoryMessage(messageElement) {
        const previousScrollHeight = this.#messagesElement.scrollHeight;
        const previousScrollTop = this.#messagesElement.scrollTop;

        this.#historyLoaderElement.after(messageElement);

        if (this.#pinToBottomOnHistory) {
            this.#scrollToBottom();
        } else {
            this.#messagesElement.scrollTop =
                previousScrollTop +
                (this.#messagesElement.scrollHeight - previousScrollHeight);
        }
    }

    /**
     * Append a new live message to the bottom, following it only when the user
     * is already there so that reading history isn't interrupted.
     * @param {HTMLElement} messageElement
     */
    #insertLiveMessage(messageElement) {
        const wasPinnedToBottom = this.#isPinnedToBottom();
        this.#messagesElement.appendChild(messageElement);
        if (wasPinnedToBottom) {
            this.#scrollToBottom();
        }
    }
}

// Create and export a singleton instance.
const messagesElement = /** @type {HTMLElement} */ (
    querySelectorWithAssertion('#messages')
);
const historyLoaderElement = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#history-loader')
);
const skipToPresentButton = /** @type {HTMLButtonElement} */ (
    querySelectorWithAssertion('#skip-to-present')
);

export const messageList = new MessageList(
    messagesElement,
    historyLoaderElement,
    skipToPresentButton,
);
