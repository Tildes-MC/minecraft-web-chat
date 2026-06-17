// @ts-check
'use strict';

import { querySelectorWithAssertion } from '../utils.mjs';

/**
 * Manages the single application modal. Only one modal can be shown at a time;
 * opening a new modal replaces whatever was previously shown.
 *
 * Each caller supplies its own contents element via {@link ModalManager#open},
 * keeping call sites free of any modal plumbing. The manager handles showing,
 * hiding, focus, the close button, backdrop clicks and the Escape key.
 */
class ModalManager {
    /** @type {HTMLDivElement} */
    #container;

    /** @type {HTMLDivElement} */
    #body;

    /** @type {HTMLButtonElement} */
    #closeButton;

    #isOpen = false;

    /**
     * @param {HTMLDivElement} container - Full-screen backdrop element.
     * @param {HTMLDivElement} content - Centered box that holds the contents.
     * @param {HTMLButtonElement} closeButton - The "X" button in the top right.
     * @param {HTMLDivElement} body - Element the caller's contents are placed in.
     */
    constructor(container, content, closeButton, body) {
        this.#container = container;
        this.#body = body;
        this.#closeButton = closeButton;

        // Close on the "X", a backdrop click, or Escape. Clicks inside the
        // content box must not bubble up to the backdrop and close the modal.
        closeButton.addEventListener('click', () => this.close());
        this.#container.addEventListener('click', () => this.close());
        content.addEventListener('click', (event) => event.stopPropagation());
        document.addEventListener('keydown', (event) => {
            if (this.#isOpen && event.key === 'Escape') {
                this.close();
            }
        });
    }

    /**
     * Shows the modal with the given contents, replacing any open modal.
     * @param {Node} contents - The element to display inside the modal.
     */
    open(contents) {
        this.#body.replaceChildren(contents);
        this.#container.style.display = 'block';
        this.#container.ariaHidden = 'false';
        this.#isOpen = true;

        this.#closeButton.focus();
    }

    /**
     * Hides the modal and clears its contents.
     */
    close() {
        this.#container.style.display = 'none';
        this.#container.ariaHidden = 'true';
        this.#body.replaceChildren();
        this.#isOpen = false;
    }
}

const container = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#modal-container')
);
const content = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#modal-content')
);
const closeButton = /** @type {HTMLButtonElement} */ (
    querySelectorWithAssertion('#modal-close')
);
const body = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#modal-body')
);

// Export a singleton instance since only one modal can be shown at a time.
export const modalManager = new ModalManager(
    container,
    content,
    closeButton,
    body,
);
