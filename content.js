// content.js — Xnap Content Script
// Injected on X.com/Twitter.com pages

console.log('Xnap v4.0 loaded!');

// ─── Utilities ───────────────────────────────────────────────────────────────

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Generate SHA-256 fingerprint of snapshot data
async function generateFingerprint(data) {
    const content = JSON.stringify({
        text: data.text,
        user: data.user,
        hashtags: data.hashtags,
        url: data.url,
        tweetTime: data.tweetTime,
        capturedAtUTC: data.capturedAtUTC
    });
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check if extension context is still valid
function isExtensionContextValid() {
    try {
        return chrome.runtime && chrome.runtime.id;
    } catch (e) {
        return false;
    }
}

// Extract tweet data from an article element.
// Carefully scoped to the MAIN tweet, ignoring any nested quoted-tweet card
// (which has its own User-Name, tweetText, and status link).
function extractTweetData(tweetEl) {
    // Helper: find the first match that is NOT inside a quoted tweet card.
    // Quoted tweets are wrapped in [data-testid="card.wrapper"] on X.
    // We intentionally do NOT check div[role="link"] because the main
    // tweet's own content area uses that role too.
    const queryMain = (selector) => {
        const candidates = tweetEl.querySelectorAll(selector);
        for (const el of candidates) {
            const cardWrapper = el.closest('[data-testid="card.wrapper"]');
            // Skip if inside a card.wrapper that's inside this article
            if (cardWrapper && tweetEl.contains(cardWrapper)) continue;
            return el;
        }
        return null;
    };

    const textEl = queryMain('[data-testid="tweetText"]');
    const text = textEl?.innerText || "";
    const userEl = queryMain('[data-testid="User-Name"]');
    const user = userEl?.innerText || "Unknown";
    const hashtags = text.match(/#[\p{L}\p{N}_]+/gu) || [];

    let timeEl = queryMain('a[href*="/status/"] time');
    if (!timeEl) timeEl = queryMain('time[datetime]');
    const timeLink = timeEl?.closest('a');
    const tweetUrl = timeLink ? 'https://x.com' + timeLink.getAttribute('href') : window.location.href;
    const tweetTime = timeEl?.getAttribute('datetime') || null;

    return { text, user, hashtags, tweetUrl, tweetTime };
}

// Expand "Show more" in a tweet (language-independent).
// Only targets the main tweet's text, not any embedded quoted tweet card
// (clicking a quoted tweet's "Show more" navigates away from the page).
async function expandShowMore(tweetEl) {
    const mainTweetText = tweetEl.querySelector('[data-testid="tweetText"]');
    if (!mainTweetText) return;

    // The show-more link is a sibling of tweetText inside the same container
    const container = mainTweetText.parentElement;
    if (!container) return;

    const showMoreBtn = container.querySelector('[data-testid="tweet-text-show-more-link"]');
    if (showMoreBtn) {
        showMoreBtn.click();
        await wait(500);
    }
}

// Capture screenshot of a tweet element via background script.
// Accepts an explicit rect to use for cropping (already clamped to viewport).
async function captureScreenshot(cropRect) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "capture_screenshot",
            payload: {
                rect: { x: cropRect.x, y: cropRect.y, width: cropRect.width, height: cropRect.height },
                devicePixelRatio: window.devicePixelRatio || 1
            }
        }, (response) => {
            if (response && response.image) resolve(response.image);
            else reject(new Error(response?.error || 'Screenshot failed'));
        });
    });
}

// Inject styles into the page for the Xnap button
const styleEl = document.createElement('style');
styleEl.textContent = `
    .xnap-btn {
        all: unset !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
    }
    .xnap-btn:hover .xnap-icon-wrap {
        background-color: rgba(29, 155, 240, 0.1) !important;
    }
    .xnap-btn:hover svg {
        color: rgb(29, 155, 240) !important;
    }
    .xnap-icon-wrap {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 34.75px !important;
        height: 34.75px !important;
        border-radius: 9999px !important;
        transition: background-color 0.2s !important;
    }
    .xnap-btn svg {
        width: 18.75px !important;
        height: 18.75px !important;
        color: rgb(113, 118, 123) !important;
        fill: currentColor !important;
    }
`;
document.head.appendChild(styleEl);

// ─── Clip Button (per-tweet snapshot) ─────────────────────────────────────────

function createClipButton() {
    const btn = document.createElement("button");
    btn.className = "xnap-btn";
    btn.innerHTML = `
        <div class="xnap-icon-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <g><path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v13c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-13c0-.276-.224-.5-.5-.5h-13zM12 8.5c-1.933 0-3.5 1.567-3.5 3.5s1.567 3.5 3.5 3.5 3.5-1.567 3.5-3.5-1.567-3.5-3.5-3.5zM7 12c0-2.761 2.239-5 5-5s5 2.239 5 5-2.239 5-5 5-5-2.239-5-5z"></path></g>
            </svg>
        </div>
    `;
    btn.title = "Snapshot";
    btn.onclick = handleClipClick;
    return btn;
}

// Observer to inject clip buttons on tweets as they appear
let debounceTimer = null;
const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]:not(.has-clip-btn)');
        tweets.forEach(tweet => {
            tweet.classList.add('has-clip-btn');
            const actionRow = tweet.querySelector('[role="group"]');
            if (actionRow && !actionRow.querySelector('.xnap-btn')) {
                actionRow.appendChild(createClipButton());
            }
        });
    }, 100);
});
observer.observe(document.body, { childList: true, subtree: true });

// ─── Utilities: URL detection ─────────────────────────────────────────────────

/**
 * Check if the current page is a specific tweet's status page.
 */
function isOnStatusPage() {
    return /^\/[\w]+\/status\/\d+/.test(window.location.pathname);
}

/**
 * Check if a tweet URL matches the current page (i.e. this tweet is the focal tweet).
 */
function isFocalTweet(tweetUrl) {
    if (!tweetUrl || !isOnStatusPage()) return false;
    try {
        const tweetPath = new URL(tweetUrl).pathname;
        return window.location.pathname === tweetPath;
    } catch { return false; }
}

// ─── Single Tweet Capture ─────────────────────────────────────────────────────

/**
 * Capture the focal tweet on a status page (already visible, no scrolling needed).
 * Used when the user is already viewing the tweet on its dedicated page, or
 * when the background script opens the tweet in a new tab.
 * @param {HTMLElement} tweetEl - The article element
 * @param {object} [opts] - Optional overrides: { albumId }
 * @returns {Promise<boolean>} true on success
 */
async function captureFocalTweet(tweetEl, opts = {}) {
    await expandShowMore(tweetEl);

    const { text, user, hashtags, tweetUrl, tweetTime } = extractTweetData(tweetEl);

    // Small wait for any expand animation to settle
    await wait(400);

    // Hide clip button before screenshot
    const clipBtn = tweetEl.querySelector('.xnap-btn');
    if (clipBtn) clipBtn.style.visibility = 'hidden';

    let imageDataUrl;
    try {
        // Scroll the tweet into view — account for X's sticky header bar
        // which would otherwise cover the top of the tweet (username area).
        const stickyHeader = document.querySelector('div[data-testid="TopNavBar"]')
            || document.querySelector('header[role="banner"]');
        const headerHeight = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0;

        tweetEl.scrollIntoView({ behavior: 'instant', block: 'start' });
        // Nudge scroll so the tweet starts below the sticky header
        if (headerHeight > 0) {
            window.scrollBy(0, -(headerHeight + 4));
        }
        await wait(300);

        // Re-read rect after scroll and clamp to viewport
        let rect = tweetEl.getBoundingClientRect();
        const clampedRect = {
            x: Math.max(0, rect.left),
            y: Math.max(0, rect.top),
            width: Math.min(rect.right, window.innerWidth) - Math.max(0, rect.left),
            height: Math.min(rect.bottom, window.innerHeight) - Math.max(0, rect.top)
        };
        if (clampedRect.width <= 10 || clampedRect.height <= 30) {
            console.warn('[Xnap] Focal tweet not visible enough:', JSON.stringify(clampedRect));
            return false;
        }
        imageDataUrl = await captureScreenshot(clampedRect);
    } finally {
        if (clipBtn) clipBtn.style.visibility = 'visible';
    }

    // Timestamps & fingerprint
    const capturedAtUTC = new Date().toISOString();
    const capturedAtLocalISO = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
    const fingerprint = await generateFingerprint({
        text, user, hashtags, url: tweetUrl, tweetTime, capturedAtUTC
    });

    chrome.runtime.sendMessage({
        action: "process_tweet",
        payload: {
            text, user, hashtags,
            image: imageDataUrl,
            url: tweetUrl, tweetTime,
            capturedAtUTC,
            capturedAtLocal: capturedAtLocalISO,
            fingerprint,
            albumId: opts.albumId || undefined
        }
    });

    return true;
}

// Handle per-tweet clip button click — smart routing
async function handleClipClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!isExtensionContextValid()) {
        alert('Extension was updated. Please refresh the page (F5) to continue clipping.');
        return;
    }

    const tweetEl = e.target.closest('article');
    const clipBtn = e.target.closest('.xnap-btn');
    if (!clipBtn || !tweetEl) return;
    if (clipBtn.dataset.processing === 'true') return;
    clipBtn.dataset.processing = 'true';

    const originalHTML = clipBtn.innerHTML;
    try {
        clipBtn.innerHTML = `<span style="font-size: 16px;">📸</span>`;

        const { tweetUrl } = extractTweetData(tweetEl);

        if (isFocalTweet(tweetUrl)) {
            // Already on this tweet's status page — capture directly
            await captureFocalTweet(tweetEl);
        } else {
            // In a feed/search — delegate to background to open in a new tab
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'capture_in_new_tab',
                    payload: { tweetUrl }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        resolve();
                    } else {
                        reject(new Error(response?.error || 'Capture failed'));
                    }
                });
            });
        }

        clipBtn.innerHTML = `<span style="font-size: 16px;">✅</span>`;
    } catch (err) {
        console.error("[Xnap] Clipping error:", err);
        clipBtn.innerHTML = `<span style="font-size: 16px;">❌</span>`;
        if (err.message?.includes('Extension context invalidated')) {
            alert('Extension was updated. Please refresh the page (F5) to continue clipping.');
        }
    } finally {
        setTimeout(() => {
            clipBtn.innerHTML = originalHTML;
            clipBtn.dataset.processing = 'false';
        }, 2000);
    }
}

// ─── Batch: URL Collection (triggered by background script) ──────────────────
// Scrolls the search/profile page to load all tweets, extracts their URLs
// (applying account & date filters), and returns the list. The background
// script then opens each URL in a popup window for reliable capture.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'collect_tweet_urls') {
        const opts = request.payload || {};
        collectTweetUrls(opts)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    // Capture the focal (main) tweet on a status page — used by popup window capture.
    // When viewing a reply, X shows the parent tweet above it as conversation
    // context. We must find the article whose status link matches the page URL,
    // not just the first article on the page.
    if (request.action === 'capture_focal_tweet') {
        (async () => {
            try {
                // Extract the status ID from the current page URL
                const pagePathMatch = window.location.pathname.match(/\/status\/(\d+)/);
                const pageStatusId = pagePathMatch ? pagePathMatch[1] : null;

                // Poll for the correct focal tweet article to appear in the DOM
                let focalTweet = null;
                const maxPollMs = 15000;
                const pollInterval = 300;
                const pollStart = Date.now();
                while (Date.now() - pollStart < maxPollMs) {
                    const articles = document.querySelectorAll('article[data-testid="tweet"]');
                    for (const article of articles) {
                        if (pageStatusId) {
                            // Find the article whose status link contains this ID
                            const statusLink = article.querySelector(`a[href*="/status/${pageStatusId}"] time`);
                            if (statusLink) {
                                focalTweet = article;
                                break;
                            }
                        } else {
                            // Fallback: just use the first article
                            focalTweet = article;
                            break;
                        }
                    }
                    if (focalTweet) break;
                    await wait(pollInterval);
                }
                if (!focalTweet) {
                    sendResponse({ success: false, error: 'No tweet found on page' });
                    return;
                }

                // Wait for images inside the tweet to finish loading
                const images = focalTweet.querySelectorAll('img');
                if (images.length > 0) {
                    await Promise.all(Array.from(images).map(img => {
                        if (img.complete) return Promise.resolve();
                        return new Promise(resolve => {
                            img.addEventListener('load', resolve, { once: true });
                            img.addEventListener('error', resolve, { once: true });
                            // Safety timeout per image
                            setTimeout(resolve, 5000);
                        });
                    }));
                }

                // Scale settle time by content size:
                //   - Base 500ms for short tweets
                //   - +200ms per 500 chars of text
                //   - +300ms per embedded image
                //   - +500ms if there's a quoted tweet card
                const textLen = (focalTweet.innerText || '').length;
                const imgCount = images.length;
                const hasQuote = !!focalTweet.querySelector('[data-testid="card.wrapper"], [role="link"][href*="/status/"]');
                const settleTime = 500
                    + Math.floor(textLen / 500) * 200
                    + imgCount * 300
                    + (hasQuote ? 500 : 0);
                await wait(Math.min(settleTime, 4000)); // cap at 4s

                const ok = await captureFocalTweet(focalTweet, request.payload || {});
                sendResponse({ success: ok });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }
});

/**
 * Scroll the current page (search results / profile) to load all tweets,
 * collecting their URLs incrementally (since X virtualizes the DOM and removes
 * off-screen articles). Returns unique status URLs after applying optional filters.
 */
async function collectTweetUrls({ expectedAccount, dateFrom, dateTo }) {
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;

    const sendProgress = (phase, message, captured = 0, total = 0) => {
        try {
            chrome.runtime.sendMessage({
                action: 'batch_progress',
                payload: { phase, message, captured, total }
            });
        } catch (e) { /* viewer may be closed */ }
    };

    // We must collect URLs AS we scroll because X's virtualized list removes
    // off-screen articles from the DOM. If we wait until the end, only the
    // last ~15 tweets will still be in the DOM.
    const seen = new Set();
    const urls = [];

    const harvestCurrentTweets = () => {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        for (const tweet of tweets) {
            const { tweetUrl, tweetTime, user } = extractTweetData(tweet);
            if (!tweetUrl || seen.has(tweetUrl)) continue;
            seen.add(tweetUrl);

            // Filter by account
            if (expectedAccount) {
                const match = user.match(/@[\w]+/);
                const username = match ? match[0].replace('@', '').toLowerCase() : '';
                if (username !== expectedAccount.toLowerCase()) continue;
            }

            // Filter by date range
            if (tweetTime) {
                const tweetDate = new Date(tweetTime);
                if (fromDate && tweetDate < fromDate) continue;
                if (toDate && tweetDate > toDate) continue;
            }

            urls.push(tweetUrl);
        }
    };

    // Scroll down to load all tweets, harvesting URLs at each step
    sendProgress('loading', 'Scrolling to load all tweets...');
    let scrollsWithoutNew = 0;
    const maxScrollsWithoutNew = 10;

    // Harvest whatever is on screen before scrolling
    harvestCurrentTweets();

    while (scrollsWithoutNew < maxScrollsWithoutNew) {
        const prevCount = urls.length;

        window.scrollBy(0, window.innerHeight * 0.7);
        await wait(1500);

        harvestCurrentTweets();
        sendProgress('loading', `Loading tweets... (${urls.length} found)`, 0, urls.length);

        if (urls.length > prevCount) {
            scrollsWithoutNew = 0;
        } else {
            scrollsWithoutNew++;
            // Slower scroll on stalled loads — give X time to fetch
            await wait(1000);
        }

        if (urls.length > 500) {
            sendProgress('loading', 'Reached 500 tweet limit.');
            break;
        }
    }

    // One final harvest after scrolling stops
    harvestCurrentTweets();

    sendProgress('loading', `Found ${urls.length} tweets to capture.`, 0, urls.length);
    return { success: true, urls };
}
