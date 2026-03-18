// viewer.js — Main entry point for the Xnap Gallery viewer
// Wires together all viewer modules.

import { getAllSnapshots, getAllAlbums, deleteSnapshot } from './db.js';
import {
    allData, activeFilters,
    setAllData, setAllAlbums, setAiEnabled,
    resetFilters, getFilteredItems, getAlbumScopedItems, getFilteredItemsExcluding
} from './state.js';
import { renderGrid, setApplyFilters as setGridApply } from './grid.js';
import { initModal } from './modal.js';
import { renderFacets, setApplyFilters as setFacetsApply } from './facets.js';
import { renderAlbumList, handleDeleteAlbum, setApplyFilters as setAlbumsApply } from './albums.js';
import { handleExport } from './export.js';
import { initSidebar } from './sidebar.js';
import { initShareDropdowns } from './share.js';
import { initToolbar } from './toolbar.js';

// ─── DOM References ──────────────────────────────────────────────────────────

const searchInput = document.getElementById('searchInput');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const resetFiltersBtn = document.getElementById('resetFilters');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const exportBtn = document.getElementById('exportBtn');
const deleteAlbumBtn = document.getElementById('deleteAlbumBtn');
const importBtn = document.getElementById('importBtn');

// Import dialog elements
const importPickBtn = document.getElementById('importPickBtn');
const importFileName = document.getElementById('importFileName');
const importFileInput = document.getElementById('importFileInput');
const importOverwrite = document.getElementById('importOverwrite');
const importStartBtn = document.getElementById('importStartBtn');
const importProgress = document.getElementById('importProgress');
const importProgressFill = importProgress.querySelector('.snap-progress-fill');
const importProgressText = importProgress.querySelector('.snap-progress-text');
const importResult = document.getElementById('importResult');

// ─── Central applyFilters ────────────────────────────────────────────────────

function applyFilters() {
    const filtered = getFilteredItems();
    renderGrid(filtered);
    renderFacets({
        hashtagItems: getFilteredItemsExcluding('hashtag'),
        accountItems: getFilteredItemsExcluding('account'),
        categoryItems: getFilteredItemsExcluding('category')
    });
    renderAlbumList();
}

// Wire applyFilters into all modules that need it
setGridApply(applyFilters);
setFacetsApply(applyFilters);
setAlbumsApply(applyFilters);

// Refresh grid when a snapshot is deleted or updated from the modal
document.addEventListener('snapshot-deleted', () => applyFilters());
document.addEventListener('snapshot-updated', () => applyFilters());

// ─── Initialize ──────────────────────────────────────────────────────────────

init();

async function init() {
    // Load settings
    const settings = await chrome.storage.sync.get(['aiEnabled']);
    setAiEnabled(settings.aiEnabled !== false);

    // Check if a batch capture is in progress and focus that album
    // Only override album filter if it's still at the default
    const session = await chrome.storage.session.get('activeBatchAlbumId');
    if (session.activeBatchAlbumId && activeFilters.albumIds.has('individual') && activeFilters.albumIds.size === 1) {
        activeFilters.albumIds = new Set([session.activeBatchAlbumId]);
    }

    // Load data
    const snapshots = await getAllSnapshots();
    snapshots.sort((a, b) => new Date(b.capturedAtUTC) - new Date(a.capturedAtUTC));
    setAllData(snapshots);

    const albums = await getAllAlbums();
    albums.sort((a, b) => b.createdAt - a.createdAt);
    setAllAlbums(albums);

    // Set date picker bounds
    if (allData.length > 0) {
        const dates = allData.map(item => new Date(item.capturedAtUTC));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        dateFrom.min = minDate.toISOString().split('T')[0];
        dateFrom.max = maxDate.toISOString().split('T')[0];
        dateTo.min = minDate.toISOString().split('T')[0];
        dateTo.max = maxDate.toISOString().split('T')[0];
    }

    applyFilters();
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

// Search
searchInput.addEventListener('input', (e) => {
    activeFilters.search = e.target.value.toLowerCase();
    applyFilters();
});

// Date range
dateFrom.addEventListener('change', () => {
    activeFilters.dateFrom = dateFrom.value ? new Date(dateFrom.value) : null;
    applyFilters();
});
dateTo.addEventListener('change', () => {
    activeFilters.dateTo = dateTo.value ? new Date(dateTo.value + 'T23:59:59') : null;
    applyFilters();
});

// Reset filters
resetFiltersBtn.addEventListener('click', () => {
    resetFilters();
    searchInput.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    applyFilters();
});

// Export
exportBtn.addEventListener('click', handleExport);

// Import
importBtn.addEventListener('click', () => {
    document.getElementById('importDialog').classList.remove('hidden');
    importStartBtn.disabled = true;
    importFileInput.value = '';
    importFileName.textContent = 'No file selected';
    importProgress.classList.add('hidden');
    importResult.classList.add('hidden');
});

importPickBtn.addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', () => {
    const file = importFileInput.files[0];
    if (file) {
        importFileName.textContent = file.name;
        importStartBtn.disabled = false;
    } else {
        importFileName.textContent = 'No file selected';
        importStartBtn.disabled = true;
    }
});

importStartBtn.addEventListener('click', () => {
    const file = importFileInput.files[0];
    if (!file) return;

    importStartBtn.disabled = true;
    importStartBtn.textContent = 'Importing…';
    importProgress.classList.remove('hidden');
    importResult.classList.add('hidden');
    importProgressFill.style.width = '20%';
    importProgressText.textContent = 'Reading ZIP file…';

    const reader = new FileReader();
    reader.onload = () => {
        importProgressFill.style.width = '50%';
        importProgressText.textContent = 'Importing snapshots…';

        chrome.runtime.sendMessage({
            action: 'restore_database',
            dataUrl: reader.result,
            overwrite: importOverwrite.checked
        }, (response) => {
            importProgress.classList.add('hidden');
            importResult.classList.remove('hidden');

            if (response && response.success) {
                const albumLine = response.albumsRestored
                    ? `<li>${response.albumsRestored} album${response.albumsRestored !== 1 ? 's' : ''} restored</li>` : '';
                importResult.className = 'dialog-result success';
                importResult.innerHTML = `
                    <strong>Import complete</strong>
                    <ul>
                        ${albumLine}
                        <li>${response.added} snapshot${response.added !== 1 ? 's' : ''} added</li>
                        <li>${response.skipped} skipped (already exist)</li>
                        <li>${response.overwritten} overwritten</li>
                    </ul>
                `;
                // Data reload + filter reset handled by restore_complete listener
            } else {
                importResult.className = 'dialog-result error';
                importResult.textContent = response?.error || 'Import failed.';
            }
            importStartBtn.textContent = 'Import';
            importStartBtn.disabled = false;
        });
    };
    reader.onerror = () => {
        importProgress.classList.add('hidden');
        importResult.classList.remove('hidden');
        importResult.className = 'dialog-result error';
        importResult.textContent = 'Failed to read file.';
        importStartBtn.textContent = 'Import';
        importStartBtn.disabled = false;
    };
    reader.readAsDataURL(file);
});

// Delete album
deleteAlbumBtn.addEventListener('click', handleDeleteAlbum);

// Delete displayed snapshots
deleteAllBtn.addEventListener('click', async () => {
    const displayedItems = getFilteredItems();
    const count = displayedItems.length;
    if (count === 0) { alert('No snapshots to delete.'); return; }

    const isFiltered = count < allData.length;
    const message = isFiltered
        ? `Delete ${count} displayed snapshots?\n\nThis will only delete the currently filtered results.`
        : `Delete all ${count} snapshots?\n\nThis action cannot be undone!`;

    if (confirm(message)) {
        try {
            for (const item of displayedItems) {
                await deleteSnapshot(item.id);
            }
            const deletedIds = new Set(displayedItems.map(i => i.id));
            setAllData(allData.filter(i => !deletedIds.has(i.id)));
            // Clear facet filters so the remaining album content is fully visible
            activeFilters.account = null;
            activeFilters.hashtag = null;
            activeFilters.category = null;
            applyFilters();
            alert(`${count} snapshot${count !== 1 ? 's' : ''} deleted.`);
        } catch (err) {
            console.error('Delete failed:', err);
            alert('Failed to delete snapshots.');
        }
    }
});

// ─── Background Listeners ────────────────────────────────────────────────────

// Listen for new snapshots from background
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "snapshot_saved") {
        const data = [...allData];
        data.unshift(request.snapshot);
        setAllData(data);
        applyFilters();
    }
    if (request.action === "album_created") {
        // Focus the new album so incoming snapshots are visible immediately
        if (request.albumId) {
            activeFilters.albumIds = new Set([request.albumId]);
        }
        init();
    }
    if (request.action === "batch_complete") {
        // Full reload so new albums and snapshots appear
        init();
    }
    if (request.action === "restore_complete") {
        // Reset album filter so restored/imported snapshots are visible
        resetFilters();
        searchInput.value = '';
        dateFrom.value = '';
        dateTo.value = '';
        init();
    }
});

// Auto-refresh on tab visibility
let lastVisibleTime = Date.now();
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && Date.now() - lastVisibleTime > 1000) {
        const freshData = await getAllSnapshots();
        if (freshData.length !== allData.length) {
            freshData.sort((a, b) => new Date(b.capturedAtUTC) - new Date(a.capturedAtUTC));
            setAllData(freshData);
            applyFilters();
        }
        lastVisibleTime = Date.now();
    }
});

// Listen for AI toggle changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.aiEnabled) {
        setAiEnabled(changes.aiEnabled.newValue !== false);
        applyFilters();
    }
});

// ─── Init UI Components ──────────────────────────────────────────────────────

initModal();
initSidebar();
initShareDropdowns();
initToolbar();