import { saveSnapshot, saveAlbum, getAllSnapshots, getAllAlbums } from './db.js';
import { embedPngMetadata } from './xmp.js';
import JSZip from '../lib/jszip.esm.js';

let batchCancelled = false;

// ─── Extension Icon Click ────────────────────────────────────────────────────

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: 'viewer.html' });
});

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
    if (request.action === "batch_capture") {
        handleBatchCapture(request.payload, sendResponse);
        return true;
    }
    if (request.action === "batch_capture_page") {
        handleBatchCapturePage(sendResponse, request.tabId, request.maxTweets);
        return true;
    }
    if (request.action === "batch_cancel") {
        batchCancelled = true;
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
    if (request.action === "backup_database") {
        handleBackup(sendResponse);
        return true;
    }
    if (request.action === "restore_database") {
        handleRestore(request.dataUrl, request.overwrite, sendResponse);
        return true;
    }
    if (request.action === "share_to_telegram_web") {
        handleShareToTelegramWeb(request.payload, sendResponse);
        return true;
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
            savedAt: new Date().toISOString()
        };

        // Embed XMP + PNG text metadata into the screenshot
        if (record.image) {
            const { copyrightText } = await chrome.storage.sync.get('copyrightText');
            record.image = embedPngMetadata(record.image, record, { copyrightText });
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

// ─── Batch Capture Page ──────────────────────────────────────────────────────
// Captures all tweets on the user's current X.com tab. The user has already
// filtered/searched on X, so we just scroll to collect URLs and capture.

async function handleBatchCapturePage(sendResponse, requestedTabId, maxTweets) {
    let captureWindowId = null;
    let captureTabId = null;
    let keepAlive = null;
    batchCancelled = false;

    try {
        // Use provided tabId or fall back to active tab
        let activeTab;
        if (requestedTabId) {
            activeTab = await chrome.tabs.get(requestedTabId);
        } else {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            activeTab = tab;
        }
        if (!activeTab) {
            sendResponse({ success: false, error: 'No active tab found.' });
            return;
        }

        const tabUrl = activeTab.url || '';
        if (!/^https:\/\/(x|twitter)\.com\//.test(tabUrl)) {
            sendResponse({ success: false, error: 'Active tab is not X.com.' });
            return;
        }

        // Derive album name from the page context (created lazily on first capture)
        let albumName;
        try {
            const urlObj = new URL(tabUrl);
            const searchQuery = urlObj.searchParams.get('q');
            if (searchQuery) {
                albumName = searchQuery;
            } else {
                albumName = `Page: ${urlObj.pathname}`;
            }
        } catch {
            albumName = `Batch ${new Date().toISOString().split('T')[0]}`;
        }

        let albumId = null;

        console.log('[Xnap] Batch capture page:', tabUrl);

        // Ensure content script is injected (handles reloads, pre-existing tabs, etc.)
        try {
            const [probe] = await chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: () => typeof window.__xnap_loaded !== 'undefined'
            });
            if (!probe.result) {
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    files: ['lib/html2canvas.min.js', 'content.js']
                });
            }
        } catch (injectErr) {
            console.warn('[Xnap] Content script inject:', injectErr.message);
        }

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

        // Apply max tweets limit
        const limit = (maxTweets && maxTweets > 0) ? maxTweets : urls.length;
        const captureUrls = urls.slice(0, limit);

        // Keep the MV3 service worker alive
        keepAlive = setInterval(() => {
            chrome.runtime.getPlatformInfo(() => {});
        }, 25000);

        // Create ONE reusable popup window
        const win = await chrome.windows.create({
            url: captureUrls[0],
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
        let cancelled = false;

        const sendProgress = (phase, capturedCount, total) => {
            chrome.runtime.sendMessage({
                action: 'batch_progress',
                payload: { phase, message: '', captured: capturedCount, total }
            }).catch(() => {});
        };

        sendProgress('capturing', 0, captureUrls.length);

        for (let i = 0; i < captureUrls.length; i++) {
            if (batchCancelled) {
                cancelled = true;
                console.log('[Xnap] Batch capture cancelled by user.');
                break;
            }
            try {
                if (i > 0) {
                    await chrome.tabs.update(captureTabId, { url: captureUrls[i] });
                }
                // Create album lazily on first capture attempt
                if (!albumId) {
                    albumId = await saveAlbum({ name: albumName });
                    await chrome.storage.session.set({ activeBatchAlbumId: albumId });
                    chrome.runtime.sendMessage({ action: 'album_created', albumId, albumName }).catch(() => {});
                }
                const result = await waitAndCapture(captureTabId, captureWindowId, albumId);
                if (result && result.success) {
                    captured++;
                } else {
                    failed++;
                    console.warn(`[Xnap] Batch page: failed ${captureUrls[i]}:`, result?.error);
                }
            } catch (err) {
                failed++;
                console.warn(`[Xnap] Batch page: error ${captureUrls[i]}:`, err.message);
            }
            sendProgress('capturing', captured, captureUrls.length);
        }

        await chrome.windows.remove(captureWindowId).catch(() => {});
        captureWindowId = null;

        sendProgress('done', captured, captureUrls.length);
        // Clear active batch album (only set if album was created)
        if (albumId) await chrome.storage.session.remove('activeBatchAlbumId');
        // Notify viewer to do a full refresh (new album + snapshots)
        if (albumId) chrome.runtime.sendMessage({ action: 'batch_complete' }).catch(() => {});
        console.log(`[Xnap] Batch page complete: ${captured} captured, ${failed} failed${cancelled ? ', user cancelled' : ''}`);
        clearInterval(keepAlive);
        sendResponse({ success: true, count: captured, cancelled });

    } catch (error) {
        console.error('[Xnap] Batch page capture failed:', error);
        if (captureWindowId) await chrome.windows.remove(captureWindowId).catch(() => {});
        if (keepAlive) clearInterval(keepAlive);
        await chrome.storage.session.remove('activeBatchAlbumId').catch(() => {});
        sendResponse({ success: false, error: error.message });
    }
}

// ─── Backup & Restore ────────────────────────────────────────────────────────

async function handleBackup(sendResponse) {
    try {
        const [snapshots, albums] = await Promise.all([getAllSnapshots(), getAllAlbums()]);
        const version = chrome.runtime.getManifest().version;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `Xnap-backup-${version}-${ts}.zip`;

        const zip = new JSZip();
        const imgFolder = zip.folder('images');

        // Strip image data from JSON, store as separate PNGs
        // Filename matches export convention: handle-tweetTimeUTC.png
        const metadata = snapshots.map(snap => {
            const { image, ...rest } = snap;
            const timeUTC = snap.tweetTimeUTC || snap.capturedAtUTC;
            const handle = (snap.accountHandle || '').replace('@', '') || 'unknown';
            const imgFilename = `${handle}-${timeUTC.replace(/[:.]/g, '-')}.png`;
            if (image) {
                const base64 = image.split(',')[1];
                if (base64) {
                    imgFolder.file(imgFilename, base64, { base64: true });
                }
            }
            return { ...rest, filename: imgFilename };
        });

        zip.file('snapshots.json', JSON.stringify(metadata, null, 2));
        zip.file('albums.json', JSON.stringify(albums, null, 2));
        zip.file('backup-info.json', JSON.stringify({
            xnapVersion: version,
            exportedAt: new Date().toISOString(),
            snapshotCount: snapshots.length,
            albumCount: albums.length
        }, null, 2));

        const blob = await zip.generateAsync({
            type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }
        });
        const reader = new FileReader();
        reader.onload = () => {
            sendResponse({
                success: true,
                dataUrl: reader.result,
                filename,
                snapshotCount: snapshots.length,
                albumCount: albums.length
            });
        };
        reader.onerror = () => sendResponse({ success: false, error: 'Failed to encode zip.' });
        reader.readAsDataURL(blob);
    } catch (error) {
        console.error('[Xnap] Backup failed:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleRestore(dataUrl, overwrite, sendResponse) {
    try {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const zip = await JSZip.loadAsync(bytes.buffer);

        const snapshotsFile = zip.file('snapshots.json') || zip.file('metadata.json');
        const albumsFile = zip.file('albums.json');
        if (!snapshotsFile) throw new Error('Invalid archive: missing snapshots.json or metadata.json');

        const snapshots = JSON.parse(await snapshotsFile.async('string'));
        const albums = albumsFile ? JSON.parse(await albumsFile.async('string')) : [];

        // Reassemble image data URLs from images/ folder
        for (const snap of snapshots) {
            if (!snap.image) {
                const imgFile = snap.filename
                    ? zip.file(`images/${snap.filename}`)
                    : zip.file(`images/${snap.id}.png`);   // fallback for older backups
                if (imgFile) {
                    const imgBase64 = await imgFile.async('base64');
                    snap.image = `data:image/png;base64,${imgBase64}`;
                }
            }
            delete snap.filename;  // don't persist the transient filename field
        }

        const existing = await getAllSnapshots();
        const existingIds = new Set(existing.map(s => s.id));

        let added = 0, skipped = 0, overwritten = 0;

        for (const album of albums) {
            try { await saveAlbum(album); } catch (e) { /* ignore dupes */ }
        }

        for (const snap of snapshots) {
            if (existingIds.has(snap.id)) {
                if (overwrite) {
                    await saveSnapshot(snap);
                    overwritten++;
                } else {
                    skipped++;
                }
            } else {
                await saveSnapshot(snap);
                added++;
            }
        }

        chrome.runtime.sendMessage({ action: 'restore_complete' }).catch(() => {});
        sendResponse({ success: true, added, skipped, overwritten, albumsRestored: albums.length });
    } catch (error) {
        console.error('[Xnap] Restore failed:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// ─── Share to Telegram Web ───────────────────────────────────────────────────
// Finds or opens a Telegram Web tab, then injects a script that pastes the
// snapshot image + caption into the currently open chat.

const TG_WEB_PATTERNS = [
    'https://web.telegram.org/a/*',
    'https://web.telegram.org/k/*',
    'https://web.telegram.org/*'
];

async function findTelegramWebTab() {
    for (const pattern of TG_WEB_PATTERNS) {
        const tabs = await chrome.tabs.query({ url: pattern });
        if (tabs.length > 0) return tabs[0];
    }
    return null;
}

async function handleShareToTelegramWeb(payload, sendResponse) {
    const { imageDataUrl, filename, caption } = payload;
    console.log('[Xnap BG] handleShareToTelegramWeb called, caption length:', caption?.length, 'image length:', imageDataUrl?.length);

    try {
        // 1. Find an existing Telegram Web tab or open one
        let tab = await findTelegramWebTab();
        let needsLoad = false;

        if (!tab) {
            tab = await chrome.tabs.create({ url: 'https://web.telegram.org/a/', active: true });
            needsLoad = true;
        } else {
            await chrome.tabs.update(tab.id, { active: true });
            await chrome.windows.update(tab.windowId, { focused: true });
        }

        // 2. Wait for the tab to finish loading if we just created it
        if (needsLoad) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(listener);
                    reject(new Error('Telegram Web load timeout'));
                }, 30000);
                const listener = (id, info) => {
                    if (id === tab.id && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        clearTimeout(timeout);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
            // Extra wait for Telegram Web SPA to initialize
            await new Promise(r => setTimeout(r, 4000));
        } else {
            await new Promise(r => setTimeout(r, 500));
        }

        // 3. Inject the paste script
        console.log('[Xnap BG] Injecting into tab', tab.id, tab.url);
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [imageDataUrl, filename, caption],
            func: injectShareIntoTelegramWeb
        });
        console.log('[Xnap BG] Injection results:', JSON.stringify(results));

        const result = results?.[0]?.result;
        if (result && result.success) {
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: result?.error || 'Injection failed' });
        }
    } catch (err) {
        console.error('[Xnap] Share to Telegram Web failed:', err);
        sendResponse({ success: false, error: err.message });
    }
}

/**
 * Injected into the Telegram Web tab.
 * Converts the data URL to a File, then uses a synthetic paste event
 * to inject the image into the chat. Fills caption after the send dialog opens.
 *
 * Strategy order:
 *   1. ClipboardEvent paste on the message input (works in Chrome)
 *   2. File input manipulation (fallback)
 */
function injectShareIntoTelegramWeb(imageDataUrl, filename, caption) {
    try {
        // ── Convert data URL to File ──
        const parts = imageDataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const binary = atob(parts[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        const file = new File([blob], filename, { type: mime });

        // ── Detect Telegram Web variant ──
        // Web A: #editable-message-text, #MiddleColumn, #column-center
        // Web K: .input-message-input, #column-center
        const isWebA = !!document.querySelector('#editable-message-text, #MiddleColumn');

        // ── Find the message input (proves a chat is open) ──
        const messageInput =
            document.querySelector('#editable-message-text') ||         // Web A
            document.querySelector('.input-message-input') ||           // Web K
            document.querySelector('[contenteditable="true"]');          // Generic

        if (!messageInput) {
            return { success: false, error: 'No chat is open in Telegram Web. Please open a chat first.' };
        }

        // ── Strategy 1: Synthetic paste event ──
        // Chrome allows ClipboardEvent constructor with custom clipboardData.
        // Telegram Web listens for paste events on the document/input.
        const dt = new DataTransfer();
        dt.items.add(file);

        const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
        });

        messageInput.focus();
        // Telegram Web A listens on document; Web K on the input
        const pasteTarget = isWebA ? document : messageInput;
        const dispatched = pasteTarget.dispatchEvent(pasteEvent);

        // ── Strategy 2 (fallback): Find and populate a file input ──
        if (dispatched) {
            // Paste was not preventDefault'd by any handler — check if it worked
            // by waiting briefly for the send dialog to appear.
            // If it doesn't appear, try the file input approach.
        }

        // ── Fill caption when the send dialog appears ──
        let captionFilled = false;
        const fillCaption = () => {
            // Broad selector list covering Web A and Web K send-photo dialogs
            const captionInputs = document.querySelectorAll(
                // Web K selectors
                '.popup-send-photo .input-message-input, ' +
                '.popup-send-photo [contenteditable="true"], ' +
                // Web A selectors
                '[class*="SendMedia"] [contenteditable="true"], ' +
                '.modal-dialog [contenteditable="true"], ' +
                '.Modal [contenteditable="true"], ' +
                // Generic: any new contenteditable in a modal/popup that isn't the main input
                '.popup [contenteditable="true"]'
            );

            for (const input of captionInputs) {
                // Skip the main message input — we want the caption field in the dialog
                if (input === messageInput) continue;

                input.focus();
                // Clear existing content
                input.textContent = '';
                // Use execCommand for framework compatibility (React/Solid state sync)
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, caption);
                // Also fire input event for frameworks that rely on it
                input.dispatchEvent(new InputEvent('input', { bubbles: true, data: caption }));
                captionFilled = true;
                break;
            }
            return captionFilled;
        };

        // Try immediately, then watch for the dialog to appear
        if (!fillCaption()) {
            const observer = new MutationObserver(() => {
                if (fillCaption()) {
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            // Give up after 8 seconds
            setTimeout(() => observer.disconnect(), 8000);
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}