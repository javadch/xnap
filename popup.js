// ─── Tab switching ───────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

// ─── Open viewer ─────────────────────────────────────────────────────────────

document.getElementById('openAlbumBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'viewer.html' });
});

// ─── Batch Capture: "Snap this page" ─────────────────────────────────────────

const snapPageBtn = document.getElementById('snapPageBtn');
const batchStatus = document.getElementById('batchStatus');
const progressFill = document.querySelector('.batch-progress-mini .fill');
const progressBar = document.querySelector('.batch-progress-mini');

function setStatus(msg, type = '') {
    batchStatus.textContent = msg;
    batchStatus.className = 'batch-status' + (type ? ' ' + type : '');
}

// Check the active tab on popup open
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    const url = tab.url || '';
    const isX = /^https:\/\/(x|twitter)\.com\//.test(url);
    if (isX) {
        chrome.tabs.sendMessage(tab.id, { action: 'check_page_tweets' }, (response) => {
            if (chrome.runtime.lastError || !response) {
                setStatus('No tweets detected on this page.');
                return;
            }
            if (response.count > 0) {
                snapPageBtn.disabled = false;
                setStatus(`${response.count} tweet${response.count !== 1 ? 's' : ''} visible on page.`);
            } else {
                setStatus('No tweets detected on this page.');
            }
        });
    } else {
        setStatus('Navigate to X.com to batch capture.');
    }
});

snapPageBtn.addEventListener('click', async () => {
    snapPageBtn.disabled = true;
    setStatus('Starting batch capture…');
    progressBar.style.display = 'block';
    progressFill.style.width = '5%';

    chrome.runtime.sendMessage({ action: 'batch_capture_page' }, (response) => {
        progressBar.style.display = 'none';
        if (response && response.success) {
            setStatus(`Done! ${response.count} tweet${response.count !== 1 ? 's' : ''} captured.`, 'success');
        } else {
            setStatus(response?.error || 'Batch capture failed.', 'error');
        }
        snapPageBtn.disabled = false;
    });
});

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'batch_progress') {
        const { phase, captured, total } = request.payload;
        if (phase === 'capturing' && total > 0) {
            const pct = 10 + (captured / total) * 85;
            progressFill.style.width = pct + '%';
            setStatus(`Capturing… ${captured} of ${total}`);
        } else if (phase === 'done') {
            progressFill.style.width = '100%';
        }
    }
});

// ─── Backup & Restore ────────────────────────────────────────────────────────

const backupBtn = document.getElementById('backupBtn');
const restoreBtn = document.getElementById('restoreBtn');
const restoreFile = document.getElementById('restoreFile');
const overwriteCheck = document.getElementById('overwriteCheck');
const backupStatus = document.getElementById('backupStatus');

function setBackupStatus(msg, type = '') {
    backupStatus.textContent = msg;
    backupStatus.className = 'backup-status' + (type ? ' ' + type : '');
}

backupBtn.addEventListener('click', () => {
    backupBtn.disabled = true;
    setBackupStatus('Creating backup…');
    chrome.runtime.sendMessage({ action: 'backup_database' }, (response) => {
        backupBtn.disabled = false;
        if (response && response.success) {
            // response.dataUrl is the zip as a data URL
            const a = document.createElement('a');
            a.href = response.dataUrl;
            a.download = response.filename;
            a.click();
            setBackupStatus(`Backup saved: ${response.snapshotCount} snapshots, ${response.albumCount} albums.`, 'success');
        } else {
            setBackupStatus(response?.error || 'Backup failed.', 'error');
        }
    });
});

restoreBtn.addEventListener('click', () => restoreFile.click());

restoreFile.addEventListener('change', async () => {
    const file = restoreFile.files[0];
    if (!file) return;
    restoreBtn.disabled = true;
    setBackupStatus('Restoring…');

    const reader = new FileReader();
    reader.onload = () => {
        chrome.runtime.sendMessage({
            action: 'restore_database',
            dataUrl: reader.result,
            overwrite: overwriteCheck.checked
        }, (response) => {
            restoreBtn.disabled = false;
            restoreFile.value = '';
            if (response && response.success) {
                setBackupStatus(
                    `Restored ${response.added} added, ${response.skipped} skipped, ${response.overwritten} overwritten.`,
                    'success'
                );
            } else {
                setBackupStatus(response?.error || 'Restore failed.', 'error');
            }
        });
    };
    reader.onerror = () => {
        restoreBtn.disabled = false;
        setBackupStatus('Failed to read file.', 'error');
    };
    reader.readAsDataURL(file);
});

// ─── Settings ────────────────────────────────────────────────────────────────

const aiEnabledToggle = document.getElementById('aiEnabled');
const aiApiKeyInput = document.getElementById('aiApiKey');
const copyrightInput = document.getElementById('copyrightText');

// Load settings on popup open
chrome.storage.sync.get(['aiEnabled', 'aiApiKey', 'copyrightText'], (result) => {
    aiEnabledToggle.checked = result.aiEnabled !== false;
    aiApiKeyInput.value = result.aiApiKey || '';
    copyrightInput.value = result.copyrightText || '';
});

aiEnabledToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ aiEnabled: aiEnabledToggle.checked });
});

aiApiKeyInput.addEventListener('blur', () => {
    chrome.storage.sync.set({ aiApiKey: aiApiKeyInput.value.trim() });
});
aiApiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        chrome.storage.sync.set({ aiApiKey: aiApiKeyInput.value.trim() });
        aiApiKeyInput.blur();
    }
});

copyrightInput.addEventListener('blur', () => {
    chrome.storage.sync.set({ copyrightText: copyrightInput.value.trim() });
});
copyrightInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        chrome.storage.sync.set({ copyrightText: copyrightInput.value.trim() });
        copyrightInput.blur();
    }
});