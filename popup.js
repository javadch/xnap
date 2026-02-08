// Open viewer
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
        // Ask content script if there are tweets on the page
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

    chrome.runtime.sendMessage({
        action: 'batch_capture_page'
    }, (response) => {
        progressBar.style.display = 'none';
        if (response && response.success) {
            setStatus(`Done! ${response.count} tweet${response.count !== 1 ? 's' : ''} captured.`, 'success');
        } else {
            setStatus(response?.error || 'Batch capture failed.', 'error');
        }
        snapPageBtn.disabled = false;
    });
});

// Listen for batch progress updates
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

// Settings elements
const aiEnabledToggle = document.getElementById('aiEnabled');
const aiApiKeyInput = document.getElementById('aiApiKey');

// Load settings on popup open
chrome.storage.sync.get(['aiEnabled', 'aiApiKey'], (result) => {
    // Default to true if not set
    aiEnabledToggle.checked = result.aiEnabled !== false;
    aiApiKeyInput.value = result.aiApiKey || '';
});

// Save AI enabled setting
aiEnabledToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ aiEnabled: aiEnabledToggle.checked });
});

// Save API key on blur (when user leaves the input)
aiApiKeyInput.addEventListener('blur', () => {
    chrome.storage.sync.set({ aiApiKey: aiApiKeyInput.value.trim() });
});

// Also save API key on Enter
aiApiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        chrome.storage.sync.set({ aiApiKey: aiApiKeyInput.value.trim() });
        aiApiKeyInput.blur();
    }
});