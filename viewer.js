// viewer.js — Main entry point for the Xnap Gallery viewer
// Wires together all viewer modules.

import { getAllSnapshots, getAllAlbums, deleteSnapshot } from './db.js';
import {
    allData, activeFilters,
    setAllData, setAllAlbums, setAiEnabled,
    resetFilters, getFilteredItems, getAlbumScopedItems, getFilteredItemsExcluding
} from './viewer/state.js';
import { renderGrid, setApplyFilters as setGridApply } from './viewer/grid.js';
import { initModal } from './viewer/modal.js';
import { renderFacets, setApplyFilters as setFacetsApply } from './viewer/facets.js';
import { renderAlbumList, handleDeleteAlbum, setApplyFilters as setAlbumsApply } from './viewer/albums.js';
import { handleBatchCapture, setInitFn } from './viewer/batch.js';
import { handleExport } from './viewer/export.js';
import { initSidebar } from './viewer/sidebar.js';

// ─── DOM References ──────────────────────────────────────────────────────────

const searchInput = document.getElementById('searchInput');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const resetFiltersBtn = document.getElementById('resetFilters');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const snapAllBtn = document.getElementById('snapAllBtn');
const exportBtn = document.getElementById('exportBtn');
const deleteAlbumBtn = document.getElementById('deleteAlbumBtn');

// ─── Central applyFilters ────────────────────────────────────────────────────

function applyFilters() {
    const filtered = getFilteredItems();
    renderGrid(filtered);
    renderFacets({
        hashtagItems: getFilteredItemsExcluding('hashtag'),
        accountItems: getFilteredItemsExcluding('account'),
        keywordItems: getFilteredItemsExcluding('keyword')
    });
    renderAlbumList();
}

// Wire applyFilters into all modules that need it
setGridApply(applyFilters);
setFacetsApply(applyFilters);
setAlbumsApply(applyFilters);
setInitFn(init);

// ─── Initialize ──────────────────────────────────────────────────────────────

init();

async function init() {
    // Load settings
    const settings = await chrome.storage.sync.get(['aiEnabled']);
    setAiEnabled(settings.aiEnabled !== false);

    // Load data
    const snapshots = await getAllSnapshots();
    snapshots.sort((a, b) => b.timestamp - a.timestamp);
    setAllData(snapshots);

    const albums = await getAllAlbums();
    albums.sort((a, b) => b.createdAt - a.createdAt);
    setAllAlbums(albums);

    // Set date picker bounds
    if (allData.length > 0) {
        const dates = allData.map(item => new Date(item.timestamp));
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

// Batch capture
snapAllBtn.addEventListener('click', handleBatchCapture);

// Export
exportBtn.addEventListener('click', handleExport);

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
});

// Auto-refresh on tab visibility
let lastVisibleTime = Date.now();
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && Date.now() - lastVisibleTime > 1000) {
        const freshData = await getAllSnapshots();
        if (freshData.length !== allData.length) {
            freshData.sort((a, b) => b.timestamp - a.timestamp);
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