import { saveSnapshot, saveAlbum } from './db.js';
import { embedPngMetadata } from './xmp.js';

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "capture_screenshot") {
        handleScreenshotCapture(sender.tab.id, request.payload, sendResponse);
        return true;
    }
    if (request.action === "process_tweet") {
        handleTweetProcessing(request.payload);
        sendResponse({ status: "processing" });
    }
    if (request.action === "open_viewer") {
        chrome.tabs.create({ url: 'viewer.html' });
    }
    if (request.action === "batch_capture") {
        handleBatchCapture(request.payload, sendResponse);
        return true;
    }
    if (request.action === "batch_capture_page") {
        handleBatchCapturePage(sendResponse);
        return true;
    }
    // Capture a single tweet by opening its status page in a background tab
    if (request.action === "capture_in_new_tab") {
        handleCaptureInNewTab(request.payload, sendResponse);
        return true;
    }
    // Relay batch progress from content script to viewer
    if (request.action === "batch_progress") {
        chrome.runtime.sendMessage(request).catch(() => {});
    }
    return true;
});

// ─── Single-Tweet Popup Window Capture ───────────────────────────────────────
// Opens the tweet's URL in a small popup window, waits for it to load,
// asks the content script to capture the focal tweet, then closes the window.
// Captures are queued so only one popup window runs at a time (prevents
// black screenshots from concurrent windows competing for rendering).

// ── Capture Queue ──
// Ensures only one popup-window capture runs at a time.
const captureQueue = [];
let captureRunning = false;

function enqueueCaptureInNewTab(payload) {
    return new Promise((resolve, reject) => {
        captureQueue.push({ payload, resolve, reject });
        processQueue();
    });
}

async function processQueue() {
    if (captureRunning || captureQueue.length === 0) return;
    captureRunning = true;

    const { payload, resolve, reject } = captureQueue.shift();
    try {
        const result = await doCaptureInNewTab(payload);
        resolve(result);
    } catch (err) {
        reject(err);
    } finally {
        captureRunning = false;
        // Small delay between captures to let Chrome settle between window cycles
        setTimeout(() => processQueue(), 600);
    }
}

function handleCaptureInNewTab(payload, sendResponse) {
    enqueueCaptureInNewTab(payload)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
}

async function doCaptureInNewTab(payload) {
    const { tweetUrl, albumId } = payload;
    let windowId = null;

    // Remember the user's current window so we can refocus it after
    let originalWindowId = null;
    try {
        const currentWin = await chrome.windows.getCurrent();
        originalWindowId = currentWin.id;
    } catch (e) { /* ignore */ }

    try {
        // Open tweet in a popup window — must be focused so Chrome paints it
        const win = await chrome.windows.create({
            url: tweetUrl,
            type: 'popup',
            focused: true,
            width: 800,
            height: 900,
            top: 0,
            left: 0
        });
        windowId = win.id;
        const tabId = win.tabs[0].id;

        const result = await waitAndCapture(tabId, windowId, albumId);

        // Close the popup window
        await chrome.windows.remove(windowId).catch(() => {});
        windowId = null;

        // Refocus the user's original window
        if (originalWindowId) {
            await chrome.windows.update(originalWindowId, { focused: true }).catch(() => {});
        }

        return result;
    } catch (error) {
        console.error('[Xnap] Popup window capture failed:', error);
        if (windowId) await chrome.windows.remove(windowId).catch(() => {});
        if (originalWindowId) {
            await chrome.windows.update(originalWindowId, { focused: true }).catch(() => {});
        }
        throw error;
    }
}

/**
 * Wait for a tab to finish loading, then ask the content script to capture
 * the focal tweet. Retries the capture message up to 2 times on failure.
 */
async function waitAndCapture(tabId, windowId, albumId) {
    // Wait for the tab to finish loading
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Tab load timeout'));
        }, 30000);

        const listener = (id, info) => {
            if (id === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                clearTimeout(timeout);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });

    // Wait for page to settle
    await new Promise(r => setTimeout(r, 1500));

    // Ensure the popup window is focused so Chrome paints it fully
    await chrome.windows.update(windowId, { focused: true }).catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    // Ask the content script to capture — retry up to 2 times
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const result = await chrome.tabs.sendMessage(tabId, {
                action: 'capture_focal_tweet',
                payload: { albumId }
            });

            if (result && result.success) {
                return { success: true };
            }

            // If it failed but not on last attempt, wait and retry
            if (attempt < maxAttempts - 1) {
                console.warn(`[Xnap] Capture attempt ${attempt + 1} failed: ${result?.error}, retrying...`);
                await new Promise(r => setTimeout(r, 2000));
                await chrome.windows.update(windowId, { focused: true }).catch(() => {});
                await new Promise(r => setTimeout(r, 500));
                continue;
            }

            return { success: false, error: result?.error || 'Capture failed' };
        } catch (err) {
            if (attempt < maxAttempts - 1) {
                console.warn(`[Xnap] Capture message failed (attempt ${attempt + 1}): ${err.message}, retrying...`);
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            throw err;
        }
    }
}

// ─── Screenshot Capture ──────────────────────────────────────────────────────

// Rate limiter: Chrome allows max ~2 captureVisibleTab calls per second.
// We enforce a minimum gap between calls and retry with exponential backoff.
let lastCaptureTime = 0;
const MIN_CAPTURE_GAP_MS = 750; // ~1.3 calls/sec, safely under the limit

async function throttledCaptureVisibleTab(windowId, options) {
    const now = Date.now();
    const elapsed = now - lastCaptureTime;
    if (elapsed < MIN_CAPTURE_GAP_MS) {
        await new Promise(r => setTimeout(r, MIN_CAPTURE_GAP_MS - elapsed));
    }

    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            lastCaptureTime = Date.now();
            return await chrome.tabs.captureVisibleTab(windowId, options);
        } catch (err) {
            if (err.message?.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND') && attempt < maxRetries - 1) {
                // Exponential backoff: 1s, 2s, 4s, 8s
                const backoff = 1000 * Math.pow(2, attempt);
                console.warn(`[Xnap] Capture rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
            throw err;
        }
    }
}

async function handleScreenshotCapture(tabId, payload, sendResponse) {
    try {
        const { rect, devicePixelRatio } = payload;
        // Get the window ID of the requesting tab so captureVisibleTab
        // targets the correct window (important for popup window captures)
        const tab = await chrome.tabs.get(tabId);
        const dataUrl = await throttledCaptureVisibleTab(tab.windowId, { format: 'png' });
        const croppedImage = await cropImage(dataUrl, rect, devicePixelRatio);
        sendResponse({ image: croppedImage });
    } catch (error) {
        console.error('Screenshot capture failed:', error.message);
        sendResponse({ error: error.message });
    }
}

async function cropImage(dataUrl, rect, devicePixelRatio) {
    const width = Math.round(rect.width * devicePixelRatio);
    const height = Math.round(rect.height * devicePixelRatio);
    if (width <= 0 || height <= 0) {
        throw new Error(`Invalid dimensions: ${width}x${height}`);
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const srcX = Math.round(rect.x * devicePixelRatio);
    const srcY = Math.round(rect.y * devicePixelRatio);

    ctx.drawImage(bitmap, srcX, srcY, width, height, 0, 0, width, height);

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(croppedBlob);
    });
}

// ─── Tweet Processing & Storage ──────────────────────────────────────────────

async function handleTweetProcessing(data) {
    try {
        const record = {
            ...data,
            summary: data.summary || '',
            keywords: data.keywords || [],
            savedAt: new Date().toISOString()
        };

        // Embed XMP + PNG text metadata into the screenshot
        if (record.image) {
            record.image = embedPngMetadata(record.image, record);
        }

        await saveSnapshot(record);
        console.log("Tweet saved:", record.url);

        // Notify viewer about the new snapshot
        chrome.runtime.sendMessage({ action: "snapshot_saved", snapshot: record }).catch(() => {});
    } catch (error) {
        console.error("Save failed:", error);
    }
}

// ─── Batch Capture Handler ───────────────────────────────────────────────────
// Opens an X.com search tab to collect tweet URLs, then captures each tweet
// by navigating a single reusable popup window (avoids create/destroy overhead
// that causes black screenshots and failures).

async function handleBatchCapture(payload, sendResponse) {
    const { account, dateFrom, dateTo, albumId } = payload;
    let captureWindowId = null;
    let captureTabId = null;
    let keepAlive = null;

    try {
        // Build X.com search URL
        const untilDate = new Date(dateTo);
        untilDate.setDate(untilDate.getDate() + 1);
        const untilStr = untilDate.toISOString().split('T')[0];

        const searchQuery = `from:${account} since:${dateFrom} until:${untilStr}`;
        const searchUrl = `https://x.com/search?q=${encodeURIComponent(searchQuery)}&src=typed_query`;

        console.log('[Xnap] Opening search tab for batch capture:', searchUrl);

        // Open search tab
        const searchTab = await chrome.tabs.create({ url: searchUrl, active: true });

        // Wait for tab to finish loading
        await new Promise((resolve) => {
            const listener = (tabId, info) => {
                if (tabId === searchTab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });

        // Wait for dynamic content to render
        await new Promise(r => setTimeout(r, 4000));

        // Ask content script to scroll the page and collect tweet URLs
        const collectResult = await chrome.tabs.sendMessage(searchTab.id, {
            action: 'collect_tweet_urls',
            payload: {
                expectedAccount: account,
                dateFrom,
                dateTo
            }
        });

        // Keep search tab open so the user can cross-check results

        if (!collectResult || !collectResult.success || !collectResult.urls?.length) {
            const msg = collectResult?.urls?.length === 0
                ? 'No tweets found matching the criteria.'
                : (collectResult?.error || 'Failed to collect tweet URLs.');
            console.log('[Xnap] Batch: no URLs collected —', msg);
            sendResponse({ success: true, count: 0 });
            return;
        }

        const urls = collectResult.urls;
        console.log(`[Xnap] Collected ${urls.length} tweet URLs, starting capture...`);

        // Keep the MV3 service worker alive during long batch captures
        keepAlive = setInterval(() => {
            chrome.runtime.getPlatformInfo(() => {});
        }, 25000);

        // Create ONE reusable popup window for all captures.
        // Navigating a single window avoids create/destroy timing issues
        // that cause black screenshots and sendMessage failures.
        const win = await chrome.windows.create({
            url: urls[0],
            type: 'popup',
            focused: true,
            width: 800,
            height: 900,
            top: 0,
            left: 0
        });
        captureWindowId = win.id;
        captureTabId = win.tabs[0].id;

        let captured = 0;
        let failed = 0;

        const sendProgress = (phase, capturedCount, total) => {
            chrome.runtime.sendMessage({
                action: 'batch_progress',
                payload: { phase, message: '', captured: capturedCount, total }
            }).catch(() => {});
        };

        sendProgress('capturing', 0, urls.length);

        for (let i = 0; i < urls.length; i++) {
            try {
                // For the first URL the window already navigated to it;
                // for subsequent URLs, navigate the existing tab.
                if (i > 0) {
                    await chrome.tabs.update(captureTabId, { url: urls[i] });
                }

                const result = await waitAndCapture(captureTabId, captureWindowId, albumId);

                if (result && result.success) {
                    captured++;
                } else {
                    failed++;
                    console.warn(`[Xnap] Batch: failed to capture ${urls[i]}:`, result?.error);
                }
            } catch (err) {
                failed++;
                console.warn(`[Xnap] Batch: error capturing ${urls[i]}:`, err.message);
            }

            sendProgress('capturing', captured, urls.length);
        }

        // Close the capture window
        await chrome.windows.remove(captureWindowId).catch(() => {});
        captureWindowId = null;

        // Done
        chrome.runtime.sendMessage({
            action: 'batch_progress',
            payload: {
                phase: 'done',
                message: '',
                captured,
                total: urls.length
            }
        }).catch(() => {});

        console.log(`[Xnap] Batch capture complete: ${captured} captured, ${failed} failed`);
        clearInterval(keepAlive);
        sendResponse({ success: true, count: captured });

    } catch (error) {
        console.error('[Xnap] Batch capture failed:', error);
        if (captureWindowId) await chrome.windows.remove(captureWindowId).catch(() => {});
        if (keepAlive) clearInterval(keepAlive);
        sendResponse({ success: false, error: error.message });
    }
}

// ─── Batch Capture Page (Option B) ─────────────────────────────────────────
// Captures all tweets on the user's current X.com tab. The user has already
// filtered/searched on X, so we just scroll to collect URLs and capture.

async function handleBatchCapturePage(sendResponse) {
    let captureWindowId = null;
    let captureTabId = null;
    let keepAlive = null;

    try {
        // Get the active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) {
            sendResponse({ success: false, error: 'No active tab found.' });
            return;
        }

        const tabUrl = activeTab.url || '';
        if (!/^https:\/\/(x|twitter)\.com\//.test(tabUrl)) {
            sendResponse({ success: false, error: 'Active tab is not X.com.' });
            return;
        }

        // Create album named after the page context
        let albumName;
        try {
            const urlObj = new URL(tabUrl);
            const searchQuery = urlObj.searchParams.get('q');
            if (searchQuery) {
                albumName = searchQuery;
            } else {
                // Profile or other page — use path
                albumName = `Page: ${urlObj.pathname}`;
            }
        } catch {
            albumName = `Batch ${new Date().toISOString().split('T')[0]}`;
        }

        const albumId = await saveAlbum({ name: albumName });

        // Persist active batch album so the viewer can pick it up even if opened later
        await chrome.storage.session.set({ activeBatchAlbumId: albumId });

        // Notify viewer about the new album
        chrome.runtime.sendMessage({ action: 'album_created', albumId, albumName }).catch(() => {});

        console.log('[Xnap] Batch capture page:', tabUrl);

        // Ask content script to scroll and collect tweet URLs (no account/date filters)
        const collectResult = await chrome.tabs.sendMessage(activeTab.id, {
            action: 'collect_tweet_urls',
            payload: {}
        });

        if (!collectResult || !collectResult.success || !collectResult.urls?.length) {
            const msg = collectResult?.urls?.length === 0
                ? 'No tweets found on this page.'
                : (collectResult?.error || 'Failed to collect tweet URLs.');
            sendResponse({ success: false, error: msg });
            return;
        }

        const urls = collectResult.urls;
        console.log(`[Xnap] Collected ${urls.length} tweet URLs from page, starting capture...`);

        // Keep the MV3 service worker alive
        keepAlive = setInterval(() => {
            chrome.runtime.getPlatformInfo(() => {});
        }, 25000);

        // Create ONE reusable popup window
        const win = await chrome.windows.create({
            url: urls[0],
            type: 'popup',
            focused: true,
            width: 800,
            height: 900,
            top: 0,
            left: 0
        });
        captureWindowId = win.id;
        captureTabId = win.tabs[0].id;

        let captured = 0;
        let failed = 0;

        const sendProgress = (phase, capturedCount, total) => {
            chrome.runtime.sendMessage({
                action: 'batch_progress',
                payload: { phase, message: '', captured: capturedCount, total }
            }).catch(() => {});
        };

        sendProgress('capturing', 0, urls.length);

        for (let i = 0; i < urls.length; i++) {
            try {
                if (i > 0) {
                    await chrome.tabs.update(captureTabId, { url: urls[i] });
                }
                const result = await waitAndCapture(captureTabId, captureWindowId, albumId);
                if (result && result.success) {
                    captured++;
                } else {
                    failed++;
                    console.warn(`[Xnap] Batch page: failed ${urls[i]}:`, result?.error);
                }
            } catch (err) {
                failed++;
                console.warn(`[Xnap] Batch page: error ${urls[i]}:`, err.message);
            }
            sendProgress('capturing', captured, urls.length);
        }

        await chrome.windows.remove(captureWindowId).catch(() => {});
        captureWindowId = null;

        sendProgress('done', captured, urls.length);
        // Clear active batch album
        await chrome.storage.session.remove('activeBatchAlbumId');
        // Notify viewer to do a full refresh (new album + snapshots)
        chrome.runtime.sendMessage({ action: 'batch_complete' }).catch(() => {});
        console.log(`[Xnap] Batch page complete: ${captured} captured, ${failed} failed`);
        clearInterval(keepAlive);
        sendResponse({ success: true, count: captured });

    } catch (error) {
        console.error('[Xnap] Batch page capture failed:', error);
        if (captureWindowId) await chrome.windows.remove(captureWindowId).catch(() => {});
        if (keepAlive) clearInterval(keepAlive);
        await chrome.storage.session.remove('activeBatchAlbumId').catch(() => {});
        sendResponse({ success: false, error: error.message });
    }
}