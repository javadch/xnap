// viewer/batch.js — Batch capture handler with progress UI

import { saveAlbum, getAllAlbums } from './db.js';
import { setAllAlbums } from './state.js';
import { renderAlbumList } from './albums.js';

const snapAllBtn = document.getElementById('snapAllBtn');
const batchAccount = document.getElementById('batchAccount');
const batchDateFrom = document.getElementById('batchDateFrom');
const batchDateTo = document.getElementById('batchDateTo');

// Progress bar element (created on demand) — sits below the gallery header
let progressWrapper = null;
let progressBar = null;
let progressLabel = null;

function ensureProgressUI() {
    if (progressWrapper) return;
    const header = document.querySelector('.gallery header');
    if (!header) return;

    progressWrapper = document.createElement('div');
    progressWrapper.className = 'batch-progress-wrapper';
    progressWrapper.innerHTML = `
        <div class="batch-progress-bar-bg">
            <div class="batch-progress-bar"></div>
        </div>
        <span class="batch-progress-label"></span>
    `;
    header.parentElement.insertBefore(progressWrapper, header.nextSibling);
    progressBar = progressWrapper.querySelector('.batch-progress-bar');
    progressLabel = progressWrapper.querySelector('.batch-progress-label');
}

function showProgress(message, pct) {
    ensureProgressUI();
    progressWrapper.style.display = 'flex';
    progressLabel.textContent = message;
    progressBar.style.width = Math.min(100, Math.max(0, pct)) + '%';
}

function hideProgress() {
    if (progressWrapper) {
        progressWrapper.style.display = 'none';
    }
}

// Listen for batch progress messages from background (relayed from content script)
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'batch_progress') {
        const { phase, captured, total } = request.payload;
        let pct = 0;
        let label = '';
        if (phase === 'loading') {
            pct = 5;
            label = `Loading tweets…`;
        } else if (phase === 'capturing' && total > 0) {
            pct = 10 + (captured / total) * 85;
            label = `${captured} of ${total}`;
        } else if (phase === 'done') {
            pct = 100;
            label = `${captured} of ${total} done`;
        }
        showProgress(label, pct);
    }
});

let initFn = null;
export function setInitFn(fn) { initFn = fn; }

export async function handleBatchCapture() {
    const account = batchAccount.value.trim().replace('@', '');
    const fromDate = batchDateFrom.value;
    const toDate = batchDateTo.value;

    if (!account) { alert('Please enter an account username.'); return; }
    if (!fromDate || !toDate) { alert('Please select both start and end dates.'); return; }

    const albumName = `@${account} (${fromDate} to ${toDate})`;

    const proceed = confirm(
        `This will:\n` +
        `1. Open a search tab to find tweets from @${account} (${fromDate} to ${toDate})\n` +
        `2. Scroll to load all matching tweets\n` +
        `3. Capture each tweet individually in its own window\n\n` +
        `Tweets will be saved to album: "${albumName}"\n\n` +
        `This may take several minutes. Continue?`
    );
    if (!proceed) return;

    // Create album
    const albumId = await saveAlbum({
        name: albumName,
        account: account,
        dateFrom: fromDate,
        dateTo: toDate
    });

    const freshAlbums = await getAllAlbums();
    setAllAlbums(freshAlbums.sort((a, b) => b.createdAt - a.createdAt));
    renderAlbumList();

    // Disable button & show spinner
    snapAllBtn.disabled = true;
    const origHTML = snapAllBtn.innerHTML;
    snapAllBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" class="spin"><path fill="currentColor" d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg>
        Capturing...
    `;
    showProgress('Starting batch capture...', 5);

    // Send to background
    chrome.runtime.sendMessage({
        action: 'batch_capture',
        payload: { account, dateFrom: fromDate, dateTo: toDate, albumId }
    }, (response) => {
        snapAllBtn.disabled = false;
        snapAllBtn.innerHTML = origHTML;

        if (response && response.success) {
            showProgress(`Done! ${response.count} tweets captured.`, 100);
            setTimeout(hideProgress, 5000);
            alert(`Batch capture complete!\n${response.count} tweets captured to "${albumName}".`);
            if (initFn) initFn();
        } else if (response && response.error) {
            hideProgress();
            alert(`Batch capture failed: ${response.error}`);
        } else {
            hideProgress();
        }
    });
}
