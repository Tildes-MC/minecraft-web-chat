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
     * @param {HTMLButtonElement} closeButton - The "X" button in the top right.
     * @param {HTMLDivElement} body - Element the caller's contents are placed in.
     */
    constructor(container, closeButton, body) {
        this.#container = container;
        this.#body = body;
        this.#closeButton = closeButton;

        // Close on the "X", a backdrop click, or Escape. Only a click that
        // targets the backdrop itself counts: a drag that starts inside the
        // content box (e.g. selecting text) and ends over the backdrop
        // dispatches its click on the container, and must not close it.
        closeButton.addEventListener('click', () => this.close());
        this.#container.addEventListener('click', (event) => {
            if (event.target === this.#container) {
                this.close();
            }
        });
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
const closeButton = /** @type {HTMLButtonElement} */ (
    querySelectorWithAssertion('#modal-close')
);
const body = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#modal-body')
);

// Export a singleton instance since only one modal can be shown at a time.
export const modalManager = new ModalManager(container, closeButton, body);
