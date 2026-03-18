// viewer/share.js — Share via Telegram Web / OS Share

function buildShareText(item) {
    const handle = item.accountHandle || 'unknown';
    const displayName = item.accountName || handle;
    const LIMIT = 1022;

    // Fixed parts — always included
    const urlLine = item.url ? `\n\u{1F517} ${item.url}` : '';
    const accountLine = `\u{1F464} ${displayName} (${handle})`;
    const capturedLine = `\u{1F4F8} ${item.capturedAtUTC}`;

    // Removable sections, ordered by removal priority (first out → last out)
    const sections = [];
    if (item.tweetTimeUTC)                     sections.push({ key: 'tweettime', text: `\u{1F550} ${item.tweetTimeUTC}`,       header: true });
    if (item.summary)                          sections.push({ key: 'summary',   text: `\u{1F916} ${item.summary}`,            header: false });
    if (item.hashtags && item.hashtags.length)  sections.push({ key: 'hashtags',  text: `\u{1F3F7}\uFE0F ${item.hashtags.join(' ')}`, header: false });
    if (item.text)                             sections.push({ key: 'text',      text: `\u{1F4DD} ${item.text}`,               header: false });

    const assemble = () => {
        const headerLines = [accountLine, capturedLine];
        const bodyLines = [];
        for (const s of sections) {
            if (!s.text) continue;
            if (s.header) headerLines.push(s.text);
            else bodyLines.push(s.text);
        }
        const parts = [headerLines.join('\n')];
        if (bodyLines.length) parts.push(bodyLines.join('\n\n'));
        return parts.join('\n\n') + urlLine;
    };

    if (assemble().length <= LIMIT) return assemble();

    // Reduce: walk removal order, truncate first, then drop entirely
    for (let i = 0; i < sections.length; i++) {
        if (!sections[i].text) continue;
        const excess = assemble().length - LIMIT;
        if (excess <= 0) break;

        // Try truncating this section's content
        const raw = sections[i].text;
        const spaceIdx = raw.indexOf(' ');
        if (spaceIdx !== -1) {
            const icon = raw.slice(0, spaceIdx + 1);
            const content = raw.slice(spaceIdx + 1);
            if (content.length > excess + 1) {
                sections[i].text = icon + content.slice(0, content.length - excess - 1).trimEnd() + '\u2026';
                if (assemble().length <= LIMIT) break;
            }
        }

        // Truncation wasn't enough — drop entirely
        sections[i].text = null;
        if (assemble().length <= LIMIT) break;
    }

    // Last resort: hard truncate (keeping URL at end)
    let result = assemble();
    if (result.length > LIMIT) {
        const budget = LIMIT - urlLine.length - 1;
        result = result.slice(0, budget).trimEnd() + '\u2026' + urlLine;
    }
    return result;
}

function buildFilename(item) {
    const handle = item.accountHandle || 'unknown';
    const timeForFilename = item.tweetTimeUTC || item.capturedAtUTC;
    return `${handle.replace('@', '')}-${timeForFilename.replace(/[:.]/g, '-')}.png`;
}

function downloadImage(item, filename) {
    const link = document.createElement('a');
    link.href = item.image;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/* ── Share status toast (success / error) ── */

function showShareStatus(message, isError) {
    const existing = document.getElementById('share-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'share-toast';
    toast.className = 'share-toast share-toast-brief';
    toast.textContent = message;
    if (isError) toast.classList.add('share-toast-error');

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, isError ? 5000 : 3000);
}

/* ── Telegram Web share: auto-drop image + caption into open chat ── */

export async function shareViaTelegram(item) {
    console.log('[Xnap Share] shareViaTelegram called, item keys:', Object.keys(item));
    const caption = buildShareText(item);
    const filename = buildFilename(item);
    console.log('[Xnap Share] caption length:', caption.length, 'filename:', filename);
    console.log('[Xnap Share] image data length:', item.image?.length, 'starts with:', item.image?.substring(0, 30));

    showShareStatus('Sharing to Telegram Web\u2026', false);

    try {
        const result = await chrome.runtime.sendMessage({
            action: 'share_to_telegram_web',
            payload: {
                imageDataUrl: item.image,
                filename,
                caption
            }
        });
        console.log('[Xnap Share] background response:', result);

        if (result && result.success) {
            showShareStatus('\u2705 Shared to Telegram Web! Review and click Send.', false);
        } else {
            const errMsg = result?.error || 'Share failed';
            showShareStatus('\u274C ' + errMsg, true);
        }
    } catch (err) {
        console.error('[Xnap] Telegram Web share error:', err);
        showShareStatus('\u274C Could not reach Telegram Web. Is the extension reloaded?', true);
    }
}

/* ── OS native share (Web Share API) ── */

export async function shareViaOS(item) {
    const shareText = buildShareText(item);
    const filename = buildFilename(item);

    const response = await fetch(item.image);
    const blob = await response.blob();
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.share && navigator.canShare) {
        try {
            const shareData = { files: [file], title: 'Tweet Snapshot', text: shareText };
            if (navigator.canShare(shareData)) {
                await navigator.share(shareData);
                return;
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }

    // Fallback if Web Share API unavailable
    try { await navigator.clipboard.writeText(shareText); } catch (e) {}
    downloadImage(item, filename);
    showShareStatus('\u2705 Image downloaded & caption copied to clipboard.', false);
}

/* ── Drag-drop support: drag image to Telegram, caption auto-copied ── */

export function setupImageDragShare(imgEl, item) {
    imgEl.setAttribute('draggable', 'true');
    imgEl.title = imgEl.title || 'Drag to Telegram chat to share';
    imgEl.addEventListener('dragstart', () => {
        const shareText = buildShareText(item);
        navigator.clipboard.writeText(shareText).catch(() => {});
    });
}

/* ── Dropdown management ── */

export function initShareDropdowns() {
    document.addEventListener('click', (e) => {
        // Close all open share dropdowns when clicking outside
        if (!e.target.closest('.share-dropdown')) {
            document.querySelectorAll('.share-dropdown.open').forEach(d => d.classList.remove('open'));
        }
    });
}
