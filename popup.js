// Open viewer
document.getElementById('openAlbumBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'viewer.html' });
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