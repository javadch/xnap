// viewer/grid.js — Card grid rendering

import { allData, aiEnabled, getAlbumScopedItems } from './state.js';
import { generateFilename } from './utils.js';
import { openModal } from './modal.js';
import { shareViaTelegram } from './share.js';
import { deleteSnapshot } from './db.js';
import { removeDataItem } from './state.js';

let applyFiltersFn = null;
export function setApplyFilters(fn) { applyFiltersFn = fn; }

export function renderGrid(items) {
    const grid = document.getElementById('grid');
    const snapshotCount = document.getElementById('snapshotCount');
    grid.innerHTML = '';

    const total = getAlbumScopedItems().length;
    const filtered = items.length;
    snapshotCount.textContent = filtered < total
        ? `${filtered} of ${total} snapshots`
        : `${total} snapshots`;

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';

        const capturedUTC = item.capturedAtUTC;
        const tweetTimeUTC = item.tweetTimeUTC || 'N/A';
        const filename = generateFilename(item);

        const summaryHtml = aiEnabled && item.summary
            ? `<p class="summary">${item.summary}</p>` : '';

        card.innerHTML = `
            <div class="card-img" style="background-image: url('${item.image}')"></div>
            <div class="card-body">
                <div class="card-dates">
                    <span class="date tweet-date" title="Tweet date">
                        <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        ${tweetTimeUTC}
                    </span>
                    <span class="date capture-date" title="Captured date">
                        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 10.8c-1.77 0-3.2 1.43-3.2 3.2s1.43 3.2 3.2 3.2 3.2-1.43 3.2-3.2-1.43-3.2-3.2-3.2zM18 4h-3.17L13 2H11L9.17 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-6 14c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
                        ${capturedUTC}
                    </span>
                </div>
                ${summaryHtml}
                <div class="card-actions">
                    <button class="card-btn download-btn" title="Download image" data-image="${item.image}" data-filename="${filename}">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </button>
                    <button class="card-btn json-btn" title="Copy JSON metadata">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M5 3h2v2H5v5a2 2 0 01-2 2 2 2 0 012 2v5h2v2H5c-1.07-.27-2-.9-2-2v-4a2 2 0 00-2-2H0v-2h1a2 2 0 002-2V5a2 2 0 012-2m14 0a2 2 0 012 2v4a2 2 0 002 2h1v2h-1a2 2 0 00-2 2v4a2 2 0 01-2 2h-2v-2h2v-5a2 2 0 012-2 2 2 0 01-2-2V5h-2V3h2z"/></svg>
                    </button>
                    <button class="card-btn share-btn" title="Share via Telegram">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    </button>
                    <a href="${item.url}" target="_blank" class="card-btn" title="View original tweet">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    </a>
                    <button class="card-btn delete-btn" title="Delete snapshot">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </div>
        `;

        // Card click opens modal
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.card-btn')) openModal(item);
        });

        // Share
        card.querySelector('.share-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            shareViaTelegram(item);
        });

        // JSON copy
        const jsonBtn = card.querySelector('.json-btn');
        jsonBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const record = {
                id: item.id, filename, url: item.url,
                accountHandle: item.accountHandle,
                accountName: item.accountName,
                accountId: item.accountId || null,
                text: item.text, summary: item.summary,
                hashtags: item.hashtags,
                tweetTimeUTC: item.tweetTimeUTC, capturedAtUTC: item.capturedAtUTC,
                fingerprint: item.fingerprint,
                albumId: item.albumId || null
            };
            navigator.clipboard.writeText(JSON.stringify(record, null, 2)).then(() => {
                jsonBtn.title = 'Copied!';
                jsonBtn.classList.add('copied');
                setTimeout(() => {
                    jsonBtn.title = 'Copy JSON metadata';
                    jsonBtn.classList.remove('copied');
                }, 1500);
            }).catch(err => console.error('Copy JSON failed:', err));
        });

        // X-link: stop propagation so card click doesn't also fire
        card.querySelector('a.card-btn').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Download
        card.querySelector('.download-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const link = document.createElement('a');
            link.href = btn.dataset.image;
            link.download = btn.dataset.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        // Delete
        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleDelete(item);
        });

        grid.appendChild(card);
    });
}

async function handleDelete(item) {
    if (confirm('Are you sure you want to delete this snapshot?')) {
        try {
            await deleteSnapshot(item.id);
            removeDataItem(item.id);
            if (applyFiltersFn) applyFiltersFn();
        } catch (err) {
            console.error('Delete failed:', err);
            alert('Failed to delete snapshot');
        }
    }
}
