// viewer/state.js — Shared application state and filter logic

// ─── State ───────────────────────────────────────────────────────────────────

export let allData = [];
export let allAlbums = [];
export let aiEnabled = true;

export const activeFilters = {
    search: '',
    dateFrom: null,
    dateTo: null,
    account: null,
    hashtag: null,
    category: null,
    albumIds: new Set(['individual'])  // multi-select: Set of album IDs
};

// ─── State Mutators ──────────────────────────────────────────────────────────

export function setAllData(data) {
    allData = data.map(normalizeItem);
}

/**
 * Normalize a snapshot item — ensures new account fields exist.
 * Migrates old records that only had a combined `user` field.
 */
function normalizeItem(item) {
    if (!item.accountHandle && item.user) {
        const match = item.user.match(/@([\w]+)/);
        item.accountHandle = match ? match[0] : item.user;
        item.accountName = item.user.split('\n')[0]?.trim() || item.accountHandle;
    }
    if (!item.accountHandle) item.accountHandle = '';
    if (!item.accountName) item.accountName = item.accountHandle || 'Unknown';
    if (item.accountId === undefined) item.accountId = null;
    return item;
}

export function setAllAlbums(albums) {
    allAlbums = albums;
}

export function setAiEnabled(value) {
    aiEnabled = value;
}

export function resetFilters() {
    activeFilters.search = '';
    activeFilters.dateFrom = null;
    activeFilters.dateTo = null;
    activeFilters.account = null;
    activeFilters.hashtag = null;
    activeFilters.category = null;
    activeFilters.albumIds = new Set(['individual']);
}

export function removeDataItem(id) {
    allData = allData.filter(i => i.id !== id);
}

export function updateDataItem(item) {
    const idx = allData.findIndex(i => i.id === item.id);
    if (idx !== -1) allData[idx] = item;
}

export function removeAlbumData(albumId) {
    allData = allData.filter(i => i.albumId !== albumId);
    allAlbums = allAlbums.filter(a => a.id !== albumId);
}

// ─── Filtering ───────────────────────────────────────────────────────────────

/**
 * A snapshot is "effectively individual" if it has no albumId or its album
 * no longer exists (orphaned after album deletion).
 */
function isEffectivelyIndividual(item) {
    if (!item.albumId) return true;
    return !allAlbums.some(a => a.id === item.albumId);
}

function matchesAlbumFilter(item, ids) {
    if (ids.has('individual') && isEffectivelyIndividual(item)) return true;
    if (item.albumId && ids.has(item.albumId)) return true;
    return false;
}

/**
 * Return items scoped to the currently selected album (before any other filters).
 * Used by facets so they reflect only the album's content.
 */
export function getAlbumScopedItems() {
    const ids = activeFilters.albumIds;
    if (ids.size === 0) return allData;
    return allData.filter(item => matchesAlbumFilter(item, ids));
}

export function getFilteredItems() {
    let filtered = allData;

    // Album filter
    const ids = activeFilters.albumIds;
    if (ids.size > 0) {
        filtered = filtered.filter(item => matchesAlbumFilter(item, ids));
    }

    // Text search
    if (activeFilters.search) {
        const query = activeFilters.search;
        filtered = filtered.filter(item => {
            const text = (item.text || '').toLowerCase();
            const summary = (item.summary || '').toLowerCase();
            const handle = (item.accountHandle || '').toLowerCase();
            const name = (item.accountName || '').toLowerCase();
            const hashtagMatch = item.hashtags && item.hashtags.some(t => t.toLowerCase().includes(query));
            const categoryMatch = item.categories && item.categories.some(c => c.toLowerCase().includes(query));
            const url = (item.url || '').toLowerCase();
            const tweetTime = (item.tweetTimeUTC || '').toLowerCase();
            const capturedAt = (item.capturedAtUTC || '').toLowerCase();
            const fingerprint = (item.fingerprint || '').toLowerCase();

            return text.includes(query) || summary.includes(query) ||
                   handle.includes(query) || name.includes(query) ||
                   hashtagMatch || categoryMatch || url.includes(query) ||
                   tweetTime.includes(query) || capturedAt.includes(query) || fingerprint.includes(query);
        });
    }

    // Date range
    if (activeFilters.dateFrom) {
        filtered = filtered.filter(item => new Date(item.capturedAtUTC) >= activeFilters.dateFrom);
    }
    if (activeFilters.dateTo) {
        filtered = filtered.filter(item => new Date(item.capturedAtUTC) <= activeFilters.dateTo);
    }

    // Account
    if (activeFilters.account) {
        filtered = filtered.filter(item => item.accountHandle === activeFilters.account);
    }

    // Hashtag
    if (activeFilters.hashtag) {
        filtered = filtered.filter(item => item.hashtags && item.hashtags.includes(activeFilters.hashtag));
    }

    // Category
    if (activeFilters.category) {
        filtered = filtered.filter(item => item.categories && item.categories.includes(activeFilters.category));
    }

    return filtered;
}

/**
 * Return items filtered by all active filters EXCEPT the specified facet.
 * Used for cross-filtering: each facet sees items constrained by all other facets,
 * so its options reflect only what's available given the other selections.
 * @param {'account'|'hashtag'|'category'} excludeFacet
 */
export function getFilteredItemsExcluding(excludeFacet) {
    let filtered = getAlbumScopedItems();

    // Text search
    if (activeFilters.search) {
        const query = activeFilters.search;
        filtered = filtered.filter(item => {
            const text = (item.text || '').toLowerCase();
            const summary = (item.summary || '').toLowerCase();
            const handle = (item.accountHandle || '').toLowerCase();
            const name = (item.accountName || '').toLowerCase();
            const hashtagMatch = item.hashtags && item.hashtags.some(t => t.toLowerCase().includes(query));
            const categoryMatch = item.categories && item.categories.some(c => c.toLowerCase().includes(query));
            const url = (item.url || '').toLowerCase();
            const tweetTime = (item.tweetTimeUTC || '').toLowerCase();
            const capturedAt = (item.capturedAtUTC || '').toLowerCase();
            const fingerprint = (item.fingerprint || '').toLowerCase();

            return text.includes(query) || summary.includes(query) ||
                   handle.includes(query) || name.includes(query) ||
                   hashtagMatch || categoryMatch || url.includes(query) ||
                   tweetTime.includes(query) || capturedAt.includes(query) || fingerprint.includes(query);
        });
    }

    // Date range
    if (activeFilters.dateFrom) {
        filtered = filtered.filter(item => new Date(item.capturedAtUTC) >= activeFilters.dateFrom);
    }
    if (activeFilters.dateTo) {
        filtered = filtered.filter(item => new Date(item.capturedAtUTC) <= activeFilters.dateTo);
    }

    // Account (skip if excluded)
    if (excludeFacet !== 'account' && activeFilters.account) {
        filtered = filtered.filter(item => item.accountHandle === activeFilters.account);
    }

    // Hashtag (skip if excluded)
    if (excludeFacet !== 'hashtag' && activeFilters.hashtag) {
        filtered = filtered.filter(item => item.hashtags && item.hashtags.includes(activeFilters.hashtag));
    }

    // Category (skip if excluded)
    if (excludeFacet !== 'category' && activeFilters.category) {
        filtered = filtered.filter(item => item.categories && item.categories.includes(activeFilters.category));
    }

    return filtered;
}
