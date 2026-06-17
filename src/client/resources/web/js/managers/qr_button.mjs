// @ts-check
'use strict';

import { querySelectorWithAssertion } from '../utils.mjs';
import { modalManager } from './modal_manager.mjs';
import QRCode from '../vendor/qrcode-svg.mjs';

const qrButtonElement = /** @type {HTMLButtonElement} */ (
    querySelectorWithAssertion('#qr-button')
);

/**
 * Whether a URL points at this machine's loopback interface, in which case it
 * is useless as something to scan from another device.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isLoopbackUrl(url) {
    try {
        const host = new URL(url).hostname;
        return (
            host === 'localhost' ||
            host === '::1' ||
            host === '[::1]' ||
            host.startsWith('127.')
        );
    } catch {
        return false;
    }
}

/**
 * Asks the backend for the URL other devices on the local network can use to
 * reach this machine.
 *
 * @returns {Promise<string | null>} The LAN URL, or null when there is no
 *     usable one (e.g. LAN access is disabled or the resolver fell back to
 *     localhost).
 */
async function fetchLanUrl() {
    let networkInfo = null;
    try {
        const response = await fetch('/api/network-info');
        if (response.ok) {
            networkInfo = await response.json();
        }
    } catch {
        return null;
    }

    if (
        !networkInfo ||
        !networkInfo.lanEnabled ||
        !networkInfo.url ||
        isLoopbackUrl(networkInfo.url)
    ) {
        return null;
    }

    return networkInfo.url;
}

/**
 * Build the modal contents showing a scannable QR code for the given URL.
 * @param {string} lanUrl
 * @returns {HTMLDivElement}
 */
function buildQrModal(lanUrl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-qr';

    const code = document.createElement('div');
    code.className = 'modal-qr-code';
    code.innerHTML = new QRCode({
        content: lanUrl,
        width: 256,
        height: 256,
        padding: 1,
        color: 'black',
        background: 'white',
        ecl: 'L',
    }).svg();

    const caption = document.createElement('p');
    caption.className = 'modal-qr-caption';
    caption.append(
        'Scan to open on your phone',
        document.createElement('br'),
        '(local network only)',
    );

    wrapper.append(code, caption);
    return wrapper;
}

/**
 * The page is always served over localhost, so to point a phone at this
 * machine we ask the backend for the LAN address. When the chat isn't open to
 * the local network there is nothing to scan, so the QR button is hidden.
 */
export async function setupQrButton() {
    if ((await fetchLanUrl()) === null) {
        qrButtonElement.style.display = 'none';
        return;
    }

    qrButtonElement.addEventListener('click', async () => {
        // The LAN address can change while the page is open, so fetch a fresh
        // one for every QR code shown.
        const lanUrl = await fetchLanUrl();
        if (lanUrl === null) {
            qrButtonElement.style.display = 'none';
            return;
        }

        modalManager.open(buildQrModal(lanUrl));
    });
}
