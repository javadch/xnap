// viewer/modal.js — Modal detail view

import { aiEnabled } from './state.js';
import { generateFilename } from './utils.js';
import { shareViaTelegram } from './share.js';

const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');

export function openModal(item) {
    const captureTimeUTC = item.capturedAtUTC || new Date(item.timestamp).toISOString();
    const tweetTimeUTC = item.tweetTime || 'N/A';
    const filename = generateFilename(item);

    const hashtagChips = item.hashtags && item.hashtags.length > 0
        ? item.hashtags.map(tag => `<span class="chip">${tag}</span>`).join('')
        : '<span class="no-data">No hashtags</span>';

    const keywordChips = aiEnabled && item.keywords && item.keywords.length > 0
        ? item.keywords.map(k => `<span class="chip keyword-chip">${k}</span>`).join('')
        : '';

    const fingerprintDisplay = item.fingerprint || 'N/A';

    const aiSummarySection = aiEnabled ? `
            <div class="modal-section">
                <div class="section-icon" title="AI Summary">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
                </div>
                <p class="section-content">${item.summary || '<span class="no-data">No summary</span>'}</p>
            </div>` : '';

    const aiKeywordsSection = aiEnabled && keywordChips ? `
            <div class="modal-section">
                <div class="section-icon" title="Categories">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/></svg>
                </div>
                <div class="section-content keyword-chips">${keywordChips}</div>
            </div>` : '';

    modalBody.innerHTML = `
        <div class="modal-top-row">
            <h2>${item.user}</h2>
        </div>
        <div class="modal-timestamps">
            <div class="timestamps-left">
                <span class="timestamp tweet-date" title="Tweet date">
                    <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    ${tweetTimeUTC}
                </span>
                <span class="timestamp capture-date" title="Captured date">
                    <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 10.8c-1.77 0-3.2 1.43-3.2 3.2s1.43 3.2 3.2 3.2 3.2-1.43 3.2-3.2-1.43-3.2-3.2-3.2zM18 4h-3.17L13 2H11L9.17 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-6 14c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
                    ${captureTimeUTC}
                </span>
            </div>
            <div class="modal-actions">
                <button class="modal-action-btn download-btn" data-image="${item.image}" data-filename="${filename}" title="Download image">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                </button>
                <a href="${item.url}" target="_blank" class="modal-action-btn" title="View original tweet">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <button class="modal-action-btn share-btn" data-id="${item.id}" title="Share via Telegram">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </button>
            </div>
        </div>
        <div class="modal-image-container">
            <img src="${item.image}" data-filename="${filename}">
        </div>
        <div class="modal-content-card">
            <div class="modal-section">
                <div class="section-icon copy-icon" title="Copy to Clipboard" data-copy="text">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </div>
                <p class="section-content">${item.text || '<span class="no-data">No text</span>'}</p>
            </div>
            <div class="modal-section">
                <div class="section-icon copy-icon" title="Copy to Clipboard" data-copy="hashtags">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M20 10V8h-4V4h-2v4h-4V4H8v4H4v2h4v4H4v2h4v4h2v-4h4v4h2v-4h4v-2h-4v-4h4zm-6 4h-4v-4h4v4z"/></svg>
                </div>
                <div class="section-content hashtag-chips">${hashtagChips}</div>
            </div>
            ${aiSummarySection}
            ${aiKeywordsSection}
        </div>
        <div class="modal-footer">
            <div class="modal-footer-row">
                <span class="xnap-copyright">Xnap</span>
                <a class="post-url" href="${item.url}" target="_blank" title="Open original tweet">${item.url || 'N/A'}</a>
            </div>
            <div class="modal-footer-row">
                <span class="fingerprint">SHA256: ${fingerprintDisplay}</span>
            </div>
        </div>
    `;

    // Convert data URL to File-backed blob URL so "Save As" shows the real filename
    const modalImg = modalBody.querySelector('.modal-image-container img');
    if (item.image && item.image.startsWith('data:')) {
        fetch(item.image)
            .then(res => res.blob())
            .then(blob => {
                const file = new File([blob], filename, { type: blob.type });
                modalImg.src = URL.createObjectURL(file);
            })
            .catch(() => {}); // keep data URL as fallback
    }

    // Download button
    const downloadBtn = modalBody.querySelector('.download-btn');
    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = downloadBtn.dataset.image;
        link.download = downloadBtn.dataset.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Share button
    const shareBtn = modalBody.querySelector('.share-btn');
    shareBtn.addEventListener('click', () => shareViaTelegram(item));

    // Copy-to-clipboard on section icons
    modalBody.querySelectorAll('.copy-icon').forEach(icon => {
        icon.addEventListener('click', async () => {
            const type = icon.dataset.copy;
            let text = '';
            if (type === 'text') {
                text = item.text || '';
            } else if (type === 'hashtags') {
                text = (item.hashtags && item.hashtags.length > 0) ? item.hashtags.join(' ') : '';
            }
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                icon.dataset.originalTitle = icon.title;
                icon.title = 'Copied!';
                icon.classList.add('copied');
                setTimeout(() => {
                    icon.title = 'Copy to Clipboard';
                    icon.classList.remove('copied');
                }, 1500);
            } catch (err) {
                console.error('Copy failed:', err);
            }
        });
    });

    modal.classList.remove('hidden');
}

export function initModal() {
    document.querySelector('.close-btn').onclick = () => modal.classList.add('hidden');

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    });
}
