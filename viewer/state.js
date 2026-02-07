// viewer/state.js — Shared application state and filter logic

import { extractUsername } from './utils.js';

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
    keyword: null,
    albumIds: new Set(['individual'])  // multi-select: Set of album IDs
};

// ─── State Mutators ──────────────────────────────────────────────────────────

export function setAllData(data) {
    allData = data;
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
    activeFilters.keyword = null;
    activeFilters.albumIds = new Set(['individual']);
}

export function removeDataItem(id) {
    allData = allData.filter(i => i.id !== id);
}

export function removeAlbumData(albumId) {
    allData = allData.filter(i => i.albumId !== albumId);
    allAlbums = allAlbums.filter(a => a.id !== albumId);
}

// ─── Filtering ───────────────────────────────────────────────────────────────

/**
 * Return items scoped to the currently selected album (before any other filters).
 * Used by facets so they reflect only the album's content.
 */
export function getAlbumScopedItems() {
    const ids = activeFilters.albumIds;
    if (ids.size === 0) return allData;
    return allData.filter(item => {
        if (ids.has('individual') && !item.albumId) return true;
        if (item.albumId && ids.has(item.albumId)) return true;
        return false;
    });
}

export function getFilteredItems() {
    let filtered = allData;

    // Album filter
    const ids = activeFilters.albumIds;
    if (ids.size > 0) {
        filtered = filtered.filter(item => {
            if (ids.has('individual') && !item.albumId) return true;
            if (item.albumId && ids.has(item.albumId)) return true;
            return false;
        });
    }

    // Text search
    if (activeFilters.search) {
        const query = activeFilters.search;
        filtered = filtered.filter(item => {
            const text = (item.text || '').toLowerCase();
            const summary = (item.summary || '').toLowerCase();
            const user = (item.user || '').toLowerCase();
            const hashtagMatch = item.hashtags && item.hashtags.some(t => t.toLowerCase().includes(query));
            const keywordMatch = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));
            const url = (item.url || '').toLowerCase();
            const tweetTime = (item.tweetTime || '').toLowerCase();
            const capturedAt = (item.capturedAtUTC || '').toLowerCase();
            const fingerprint = (item.fingerprint || '').toLowerCase();

            return text.includes(query) || summary.includes(query) || user.includes(query) ||
                   hashtagMatch || keywordMatch || url.includes(query) ||
                   tweetTime.includes(query) || capturedAt.includes(query) || fingerprint.includes(query);
        });
    }

    // Date range
    if (activeFilters.dateFrom) {
        filtered = filtered.filter(item => new Date(item.timestamp) >= activeFilters.dateFrom);
    }
    if (activeFilters.dateTo) {
        filtered = filtered.filter(item => new Date(item.timestamp) <= activeFilters.dateTo);
    }

    // Account
    if (activeFilters.account) {
        filtered = filtered.filter(item => extractUsername(item.user) === activeFilters.account);
    }

    // Hashtag
    if (activeFilters.hashtag) {
        filtered = filtered.filter(item => item.hashtags && item.hashtags.includes(activeFilters.hashtag));
    }

    // Keyword
    if (activeFilters.keyword) {
        filtered = filtered.filter(item => item.keywords && item.keywords.includes(activeFilters.keyword));
    }

    return filtered;
}

/**
 * Return items filtered by all active filters EXCEPT the specified facet.
 * Used for cross-filtering: each facet sees items constrained by all other facets,
 * so its options reflect only what's available given the other selections.
 * @param {'account'|'hashtag'|'keyword'} excludeFacet
 */
export function getFilteredItemsExcluding(excludeFacet) {
    let filtered = getAlbumScopedItems();

    // Text search
    if (activeFilters.search) {
        const query = activeFilters.search;
        filtered = filtered.filter(item => {
            const text = (item.text || '').toLowerCase();
            const summary = (item.summary || '').toLowerCase();
            const user = (item.user || '').toLowerCase();
            const hashtagMatch = item.hashtags && item.hashtags.some(t => t.toLowerCase().includes(query));
            const keywordMatch = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));
            const url = (item.url || '').toLowerCase();
            const tweetTime = (item.tweetTime || '').toLowerCase();
            const capturedAt = (item.capturedAtUTC || '').toLowerCase();
            const fingerprint = (item.fingerprint || '').toLowerCase();

            return text.includes(query) || summary.includes(query) || user.includes(query) ||
                   hashtagMatch || keywordMatch || url.includes(query) ||
                   tweetTime.includes(query) || capturedAt.includes(query) || fingerprint.includes(query);
        });
    }

    // Date range
    if (activeFilters.dateFrom) {
        filtered = filtered.filter(item => new Date(item.timestamp) >= activeFilters.dateFrom);
    }
    if (activeFilters.dateTo) {
        filtered = filtered.filter(item => new Date(item.timestamp) <= activeFilters.dateTo);
    }

    // Account (skip if excluded)
    if (excludeFacet !== 'account' && activeFilters.account) {
        filtered = filtered.filter(item => extractUsername(item.user) === activeFilters.account);
    }

    // Hashtag (skip if excluded)
    if (excludeFacet !== 'hashtag' && activeFilters.hashtag) {
        filtered = filtered.filter(item => item.hashtags && item.hashtags.includes(activeFilters.hashtag));
    }

    // Keyword (skip if excluded)
    if (excludeFacet !== 'keyword' && activeFilters.keyword) {
        filtered = filtered.filter(item => item.keywords && item.keywords.includes(activeFilters.keyword));
    }

    return filtered;
}
