// @ts-check
'use strict';

/**
 * Manages the favicon state and updates including message count and ping status
 */
class FaviconManager {
    /**
     * @type {number}
     */
    #messageCount = 0;

    /**
     * @type {boolean}
     */
    #hasPing = false;

    /**
     * @type {'connected' | 'no-server' | 'disconnected' | 'error'}
     */
    #connectionState = 'disconnected';

    /**
     * Decoded favicon images, kept by src so they can be redrawn without
     * refetching.
     * @type {Map<string, HTMLImageElement>}
     */
    #imageCache = new Map();

    constructor() {
        // Preload every favicon image now, while the web server is reachable,
        // and keep the decoded Image objects in memory. The disconnected icon
        // is needed precisely when the server serving it is gone, so fetching
        // it on demand would fail; drawing a retained image always works.
        for (const size of [16, 32]) {
            for (const variant of [
                '',
                '_blank',
                '_ping',
                '_no_server',
                '_disconnected',
            ]) {
                this.#loadImage(`img/icon_${size}${variant}.png`);
            }
        }

        // Set up visibility change handler
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.clear();
            }
        });
    }

    /**
     * Return a cached favicon image, starting the load on first request.
     * @param {string} src
     * @returns {HTMLImageElement}
     */
    #loadImage(src) {
        let img = this.#imageCache.get(src);
        if (!img) {
            img = new Image();
            img.src = src;
            this.#imageCache.set(src, img);
        }
        return img;
    }

    /**
     * Clear the favicon state and update the display
     */
    clear() {
        this.#messageCount = 0;
        this.#hasPing = false;
        this.#updateFavicon();
    }

    /**
     * Increment the message count and update ping status if tab is not visible
     * @param {boolean} isPing - Whether this message is a ping
     */
    handleNewMessage(isPing) {
        if (document.visibilityState !== 'visible') {
            if (isPing) {
                this.#hasPing = true;
            }
            this.#messageCount++;
            this.#updateFavicon();
        }
    }

    /**
     * Get the current message count
     * @returns {number}
     */
    getMessageCount() {
        return this.#messageCount;
    }

    /**
     * Get the current ping status
     * @returns {boolean}
     */
    getHasPing() {
        return this.#hasPing;
    }

    /**
     * Update the Minecraft server connection state shown on the favicon.
     * Unlike the message count, this persists while the tab is visible so a
     * disconnect stays noticeable.
     * @param {'connected' | 'no-server' | 'disconnected' | 'error'} state
     */
    setConnectionState(state) {
        if (this.#connectionState === state) {
            return;
        }

        this.#connectionState = state;
        this.#updateFavicon();
    }

    /**
     * Get the current connection state
     * @returns {'connected' | 'no-server' | 'disconnected' | 'error'}
     */
    getConnectionState() {
        return this.#connectionState;
    }

    /**
     * Render a favicon with the current counter and ping indicator
     */
    #updateFavicon() {
        const sizes = [16, 32];

        sizes.forEach((size) => {
            /** @type {HTMLLinkElement | null} */
            const link = document.querySelector(
                `link[rel="icon"][sizes="${size}x${size}"]`,
            );

            if (!link) {
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                return;
            }

            let image;
            if (
                this.#connectionState === 'disconnected' ||
                this.#connectionState === 'error'
            ) {
                image = `icon_${size}_disconnected.png`;
            } else if (this.#connectionState === 'no-server') {
                image = `icon_${size}_no_server.png`;
            } else if (this.#hasPing && this.#messageCount > 0) {
                image = `icon_${size}_ping.png`;
            } else if (this.#messageCount > 0) {
                image = `icon_${size}_blank.png`;
            } else {
                // Default image, will restore the favicon
                image = `icon_${size}.png`;
            }

            const img = this.#loadImage(`img/${image}`);

            const draw = () => {
                ctx.drawImage(img, 0, 0, size, size);

                if (this.#messageCount > 0) {
                    const x = size / 2;
                    const y = size / 2 - size * 0.05; // The middle of the chat icon is not exactly in the center

                    ctx.font = `bold ${size * 0.5}px "Arial Black"`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#000000';
                    ctx.fillText(
                        this.#messageCount > 99
                            ? '99+'
                            : `${this.#messageCount}`,
                        x,
                        y,
                    );
                }

                link.href = canvas.toDataURL();
            };

            if (!img.complete) {
                img.addEventListener('load', draw, { once: true });
                return;
            }

            draw();
        });
    }
}

// Export a singleton instance since we only need one favicon manager
export const faviconManager = new FaviconManager();
