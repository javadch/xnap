// viewer/toolbar.js — Gear menu + action dialogs (Snap, Backup, Restore, Settings)

import { getAllSnapshots, getAllAlbums } from '../db.js';

// ─── Gear Menu ───────────────────────────────────────────────────────────────

const gearBtn = document.getElementById('gearBtn');
const gearMenu = document.getElementById('gearMenu');

gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    gearMenu.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!gearMenu.contains(e.target) && e.target !== gearBtn) {
        gearMenu.classList.add('hidden');
    }
});

gearMenu.querySelectorAll('.gear-menu-item').forEach(item => {
    item.addEventListener('click', () => {
        gearMenu.classList.add('hidden');
        const action = item.dataset.action;
        if (action === 'snap')     openSnapDialog();
        if (action === 'backup')   openBackupDialog();
        if (action === 'restore')  openRestoreDialog();
        if (action === 'settings') openSettingsDialog();
    });
});

// ─── Dialog Helpers ──────────────────────────────────────────────────────────

function openDialog(id) {
    document.getElementById(id).classList.remove('hidden');
}

// Close buttons
document.querySelectorAll('.action-dialog-close').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.action-dialog').classList.add('hidden');
    });
});

// Click backdrop to close
document.querySelectorAll('.action-dialog').forEach(dialog => {
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.classList.add('hidden');
    });
});

// ─── 1. Snap Page Dialog ─────────────────────────────────────────────────────

const snapTabList = document.getElementById('snapTabList');
const snapStartBtn = document.getElementById('snapStartBtn');
const snapProgress = document.getElementById('snapProgress');
const snapProgressFill = snapProgress.querySelector('.snap-progress-fill');
const snapProgressText = snapProgress.querySelector('.snap-progress-text');
const snapCancelBtn = document.getElementById('snapCancelBtn');
let selectedSnapTabId = null;
let snapCapturing = false;

async function openSnapDialog() {
    openDialog('snapDialog');
    snapStartBtn.disabled = true;
    snapProgress.classList.add('hidden');
    selectedSnapTabId = null;
    snapTabList.innerHTML = '<div class="dialog-loading">Scanning for X.com tabs…</div>';

    try {
        const tabs = await chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] });

        if (tabs.length === 0) {
            snapTabList.innerHTML = `
                <div class="dialog-empty">
                    <p>No X.com tabs found.</p>
                    <p class="setting-hint">Open X.com in a tab, then come back here to capture tweets.</p>
                </div>`;
            return;
        }

        // Sort by last accessed (most recent first)
        tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

        snapTabList.innerHTML = '';
        tabs.forEach((tab, i) => {
            const item = document.createElement('label');
            item.className = 'snap-tab-item' + (i === 0 ? ' selected' : '');
            item.innerHTML = `
                <input type="radio" name="snapTab" value="${tab.id}" ${i === 0 ? 'checked' : ''}>
                <div class="snap-tab-info">
                    <div class="snap-tab-title">${escapeHtml(tab.title || 'X.com')}</div>
                    <div class="snap-tab-url">${escapeHtml(tab.url)}</div>
                </div>
            `;
            item.querySelector('input').addEventListener('change', (e) => {
                snapTabList.querySelectorAll('.snap-tab-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedSnapTabId = parseInt(e.target.value);
            });
            snapTabList.appendChild(item);
        });

        // Auto-select most recent
        selectedSnapTabId = tabs[0].id;
        snapStartBtn.disabled = false;
    } catch (err) {
        snapTabList.innerHTML = `<div class="dialog-empty"><p>Failed to scan tabs: ${escapeHtml(err.message)}</p></div>`;
    }
}

snapStartBtn.addEventListener('click', async () => {
    if (!selectedSnapTabId) return;
    snapStartBtn.disabled = true;
    snapStartBtn.textContent = 'Capturing…';
    snapCancelBtn.classList.remove('hidden');
    snapCapturing = true;
    snapProgress.classList.remove('hidden');
    snapProgressFill.style.width = '5%';
    snapProgressText.textContent = 'Collecting tweet URLs…';
    snapProgressText.classList.remove('success', 'error');

    const settings = await chrome.storage.sync.get(['maxTweetsPerPage']);
    const maxTweets = settings.maxTweetsPerPage || 0;

    chrome.runtime.sendMessage({
        action: 'batch_capture_page',
        tabId: selectedSnapTabId,
        maxTweets
    }, (response) => {
        snapCapturing = false;
        snapCancelBtn.classList.add('hidden');
        if (response && response.success) {
            snapProgressFill.style.width = '100%';
            const label = response.cancelled ? 'Cancelled' : 'Done!';
            snapProgressText.textContent = `${label} ${response.count} tweet${response.count !== 1 ? 's' : ''} captured.`;
            snapProgressText.classList.add('success');
        } else {
            snapProgressText.textContent = response?.error || 'Capture failed.';
            snapProgressText.classList.add('error');
        }
        snapStartBtn.textContent = 'Snap Selected Tab';
        snapStartBtn.disabled = false;
    });
});

snapCancelBtn.addEventListener('click', () => {
    if (!snapCapturing) return;
    snapCancelBtn.disabled = true;
    snapCancelBtn.textContent = 'Cancelling…';
    chrome.runtime.sendMessage({ action: 'batch_cancel' });
});

// Listen for batch progress
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'batch_progress') {
        const { phase, captured, total } = request.payload;
        if (phase === 'capturing' && total > 0) {
            const pct = 10 + (captured / total) * 85;
            snapProgressFill.style.width = pct + '%';
            snapProgressText.textContent = `Capturing… ${captured} of ${total}`;
            snapProgressText.classList.remove('success', 'error');
        } else if (phase === 'done') {
            snapProgressFill.style.width = '100%';
            snapCancelBtn.classList.add('hidden');
            snapCancelBtn.disabled = false;
            snapCancelBtn.textContent = 'Cancel';
        }
    }
});

// ─── 2. Backup Dialog ────────────────────────────────────────────────────────

const backupStats = document.getElementById('backupStats');
const backupStartBtn = document.getElementById('backupStartBtn');
const backupProgress = document.getElementById('backupProgress');
const backupProgressFill = backupProgress.querySelector('.snap-progress-fill');
const backupProgressText = backupProgress.querySelector('.snap-progress-text');

async function openBackupDialog() {
    openDialog('backupDialog');
    backupStartBtn.disabled = true;
    backupProgress.classList.add('hidden');
    backupStats.innerHTML = '<div class="dialog-loading">Loading database info…</div>';

    try {
        const [snapshots, albums] = await Promise.all([getAllSnapshots(), getAllAlbums()]);

        if (snapshots.length === 0) {
            backupStats.innerHTML = '<div class="dialog-empty"><p>Nothing to back up — your database is empty.</p></div>';
            return;
        }

        // Calculate stats
        const accounts = new Set(snapshots.map(s => s.accountHandle).filter(Boolean));
        const dates = snapshots.map(s => new Date(s.capturedAtUTC || s.tweetTimeUTC));
        const earliest = new Date(Math.min(...dates)).toLocaleDateString();
        const latest = new Date(Math.max(...dates)).toLocaleDateString();

        backupStats.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${snapshots.length}</div>
                    <div class="stat-label">Snapshots</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${albums.length}</div>
                    <div class="stat-label">Albums</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${accounts.size}</div>
                    <div class="stat-label">Accounts</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${earliest} – ${latest}</div>
                    <div class="stat-label">Date Range</div>
                </div>
            </div>
        `;
        backupStartBtn.disabled = false;
    } catch (err) {
        backupStats.innerHTML = `<div class="dialog-empty"><p>Failed to load database: ${escapeHtml(err.message)}</p></div>`;
    }
}

backupStartBtn.addEventListener('click', () => {
    backupStartBtn.disabled = true;
    backupStartBtn.textContent = 'Creating…';
    backupProgress.classList.remove('hidden');
    backupProgressFill.style.width = '30%';
    backupProgressText.textContent = 'Building ZIP archive…';

    chrome.runtime.sendMessage({ action: 'backup_database' }, (response) => {
        if (response && response.success) {
            backupProgressFill.style.width = '100%';
            backupProgressText.textContent = `Backup ready: ${response.snapshotCount} snapshots, ${response.albumCount} albums.`;
            backupProgressText.classList.add('success');

            const a = document.createElement('a');
            a.href = response.dataUrl;
            a.download = response.filename;
            a.click();
        } else {
            backupProgressText.textContent = response?.error || 'Backup failed.';
            backupProgressText.classList.add('error');
        }
        backupStartBtn.textContent = 'Download Backup';
        backupStartBtn.disabled = false;
    });
});

// ─── 3. Restore Dialog ───────────────────────────────────────────────────────

const restorePickBtn = document.getElementById('restorePickBtn');
const restoreFileName = document.getElementById('restoreFileName');
const restoreFileInput = document.getElementById('restoreFileInput');
const restoreOverwrite = document.getElementById('restoreOverwrite');
const restoreStartBtn = document.getElementById('restoreStartBtn');
const restoreProgress = document.getElementById('restoreProgress');
const restoreProgressFill = restoreProgress.querySelector('.snap-progress-fill');
const restoreProgressText = restoreProgress.querySelector('.snap-progress-text');
const restoreResult = document.getElementById('restoreResult');

function openRestoreDialog() {
    openDialog('restoreDialog');
    restoreStartBtn.disabled = true;
    restoreFileInput.value = '';
    restoreFileName.textContent = 'No file selected';
    restoreProgress.classList.add('hidden');
    restoreResult.classList.add('hidden');
    restoreProgressText.classList.remove('success', 'error');
}

restorePickBtn.addEventListener('click', () => restoreFileInput.click());

restoreFileInput.addEventListener('change', () => {
    const file = restoreFileInput.files[0];
    if (file) {
        restoreFileName.textContent = file.name;
        restoreStartBtn.disabled = false;
    } else {
        restoreFileName.textContent = 'No file selected';
        restoreStartBtn.disabled = true;
    }
});

restoreStartBtn.addEventListener('click', () => {
    const file = restoreFileInput.files[0];
    if (!file) return;

    restoreStartBtn.disabled = true;
    restoreStartBtn.textContent = 'Restoring…';
    restoreProgress.classList.remove('hidden');
    restoreResult.classList.add('hidden');
    restoreProgressFill.style.width = '20%';
    restoreProgressText.textContent = 'Reading ZIP file…';

    const reader = new FileReader();
    reader.onload = () => {
        restoreProgressFill.style.width = '50%';
        restoreProgressText.textContent = 'Importing snapshots…';

        chrome.runtime.sendMessage({
            action: 'restore_database',
            dataUrl: reader.result,
            overwrite: restoreOverwrite.checked
        }, (response) => {
            restoreProgress.classList.add('hidden');
            restoreResult.classList.remove('hidden');

            if (response && response.success) {
                restoreResult.className = 'dialog-result success';
                restoreResult.innerHTML = `
                    <strong>Restore complete</strong>
                    <ul>
                        <li>${response.added} snapshot${response.added !== 1 ? 's' : ''} added</li>
                        <li>${response.skipped} skipped (already exist)</li>
                        <li>${response.overwritten} overwritten</li>
                    </ul>
                `;
            } else {
                restoreResult.className = 'dialog-result error';
                restoreResult.textContent = response?.error || 'Restore failed.';
            }
            restoreStartBtn.textContent = 'Restore';
            restoreStartBtn.disabled = false;
        });
    };
    reader.onerror = () => {
        restoreProgress.classList.add('hidden');
        restoreResult.classList.remove('hidden');
        restoreResult.className = 'dialog-result error';
        restoreResult.textContent = 'Failed to read file.';
        restoreStartBtn.textContent = 'Restore';
        restoreStartBtn.disabled = false;
    };
    reader.readAsDataURL(file);
});

// ─── 4. Settings Dialog ──────────────────────────────────────────────────────

const settingsAiEnabled = document.getElementById('settingsAiEnabled');
const settingsAiApiKey = document.getElementById('settingsAiApiKey');
const settingsCopyright = document.getElementById('settingsCopyright');
const settingsMaxTweets = document.getElementById('settingsMaxTweets');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const settingsSaved = document.getElementById('settingsSaved');

async function openSettingsDialog() {
    openDialog('settingsDialog');
    settingsSaved.classList.add('hidden');

    const settings = await chrome.storage.sync.get(['aiEnabled', 'aiApiKey', 'copyrightText', 'maxTweetsPerPage']);
    settingsAiEnabled.checked = settings.aiEnabled !== false;
    settingsAiApiKey.value = settings.aiApiKey || '';
    settingsCopyright.value = settings.copyrightText || '';
    settingsMaxTweets.value = settings.maxTweetsPerPage || 0;
}

settingsSaveBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set({
        aiEnabled: settingsAiEnabled.checked,
        aiApiKey: settingsAiApiKey.value.trim(),
        copyrightText: settingsCopyright.value.trim(),
        maxTweetsPerPage: parseInt(settingsMaxTweets.value) || 0
    });
    settingsSaved.classList.remove('hidden');
    setTimeout(() => settingsSaved.classList.add('hidden'), 2000);
});

// ─── Utils ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function initToolbar() {
    // Initialization is done at import time via event listeners above.
    // This export exists so viewer.js can import the module.
}
