// viewer/share.js — Share via Telegram

import { extractUsername } from './utils.js';

export async function shareViaTelegram(item) {
    const captureTimeUTC = item.capturedAtUTC || new Date(item.timestamp).toISOString();
    const tweetTimeUTC = item.tweetTime || 'N/A';
    const username = extractUsername(item.user);
    const timeForFilename = item.tweetTime || captureTimeUTC;
    const filename = `${username.replace('@', '')}-${timeForFilename.replace(/[:.]/g, '-')}.png`;

    const lines = [
        '\u{1F4CC} TWEET SNAPSHOT', '',
        `\u{1F464} Account: ${username}`,
        `\u{1F550} Tweet Time: ${tweetTimeUTC}`,
        `\u{1F4F8} Captured: ${captureTimeUTC}`, ''
    ];

    if (item.text) { lines.push('\u{1F4DD} Tweet Text:', item.text, ''); }
    if (item.hashtags && item.hashtags.length > 0) { lines.push('\u{1F3F7}\uFE0F Hashtags:', item.hashtags.join(' '), ''); }
    if (item.summary) { lines.push('\u{1F916} AI Summary:', item.summary, ''); }
    if (item.keywords && item.keywords.length > 0) { lines.push('\u{1F511} Keywords:', item.keywords.join(', '), ''); }
    if (item.url) { lines.push('\u{1F517} Original:', item.url); }

    const shareText = lines.join('\n');

    const response = await fetch(item.image);
    const blob = await response.blob();
    const file = new File([blob], filename, { type: 'image/png' });

    // Try Web Share API
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

    // Fallback: download + clipboard + Telegram
    try { await navigator.clipboard.writeText(shareText); } catch (e) {}

    const link = document.createElement('a');
    link.href = item.image;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(
        `\u2705 Image saved as: ${filename}\n` +
        `\u2705 Text copied to clipboard!\n\n` +
        `Telegram will now open. To share:\n` +
        `1. Select a chat or contact\n` +
        `2. Drag & drop the downloaded image OR click \u{1F4CE} to attach\n` +
        `3. Paste the caption with Ctrl+V\n` +
        `4. Send!`
    );

    window.location.href = 'tg://';
}
