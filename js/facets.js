// viewer/facets.js — Hashtag, account, and category facet rendering

import { activeFilters } from './state.js';

let applyFiltersFn = null;
export function setApplyFilters(fn) { applyFiltersFn = fn; }

/**
 * @param {object} facetItems - Per-facet cross-filtered item sets:
 *   { hashtagItems, accountItems, categoryItems }
 */
export function renderFacets({ hashtagItems, accountItems, categoryItems }) {
    const hashtagList = document.getElementById('hashtagList');
    const accountList = document.getElementById('accountList');
    const categoryList = document.getElementById('categoryList');

    // ── Hashtags ──
    const tagMap = {};
    hashtagItems.forEach(item => {
        if (item.hashtags) {
            item.hashtags.forEach(tag => { tagMap[tag] = (tagMap[tag] || 0) + 1; });
        }
    });
    const sortedTags = Object.entries(tagMap).sort((a, b) => b[1] - a[1]);

    hashtagList.innerHTML = sortedTags.map(([tag, count]) => `
        <div class="facet-item hashtag-facet" data-tag="${tag}">
            <span class="facet-content">
                <a href="https://x.com/search?q=${encodeURIComponent(tag)}" target="_blank" class="x-link" title="Search on X" onclick="event.stopPropagation();">
                    <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                ${tag}
            </span>
            <span class="count">${count}</span>
        </div>
    `).join('');

    // ── Accounts ──
    const accountMap = {};
    accountItems.forEach(item => {
        const handle = item.accountHandle || '';
        if (handle) accountMap[handle] = (accountMap[handle] || 0) + 1;
    });
    const sortedAccounts = Object.entries(accountMap).sort((a, b) => b[1] - a[1]);

    accountList.innerHTML = sortedAccounts.map(([account, count]) => `
        <div class="facet-item account-facet" data-account="${account}">
            <span class="facet-content">
                <a href="https://x.com/${account.replace('@', '')}" target="_blank" class="x-link" title="View on X" onclick="event.stopPropagation();">
                    <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                ${account}
            </span>
            <span class="count">${count}</span>
        </div>
    `).join('');

    // Apply active states
    if (activeFilters.hashtag) {
        const el = document.querySelector(`.hashtag-facet[data-tag="${activeFilters.hashtag}"]`);
        if (el) el.classList.add('active');
    }
    if (activeFilters.account) {
        const el = document.querySelector(`.account-facet[data-account="${activeFilters.account}"]`);
        if (el) el.classList.add('active');
    }

    // Hashtag click listeners
    document.querySelectorAll('.hashtag-facet').forEach(el => {
        el.addEventListener('click', () => {
            const tag = el.getAttribute('data-tag');
            const isActive = el.classList.contains('active');
            document.querySelectorAll('.hashtag-facet').forEach(e => e.classList.remove('active'));
            activeFilters.hashtag = isActive ? null : tag;
            if (!isActive) el.classList.add('active');
            if (applyFiltersFn) applyFiltersFn();
        });
    });

    // Account click listeners
    document.querySelectorAll('.account-facet').forEach(el => {
        el.addEventListener('click', () => {
            const account = el.getAttribute('data-account');
            const isActive = el.classList.contains('active');
            document.querySelectorAll('.account-facet').forEach(e => e.classList.remove('active'));
            activeFilters.account = isActive ? null : account;
            if (!isActive) el.classList.add('active');
            if (applyFiltersFn) applyFiltersFn();
        });
    });

    // ── Categories (hashtags from notes) ──
    const categoryMap = {};
    categoryItems.forEach(item => {
        if (item.categories) {
            item.categories.forEach(cat => { categoryMap[cat] = (categoryMap[cat] || 0) + 1; });
        }
    });
    const sortedCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);

    if (sortedCategories.length === 0) {
        categoryList.innerHTML = '<span class="no-data">Use #hashtags in notes to create categories</span>';
    } else {
        categoryList.innerHTML = sortedCategories.map(([cat, count]) => `
            <div class="facet-item category-facet" data-category="${cat}">
                <span class="facet-content">${cat}</span>
                <span class="count">${count}</span>
            </div>
        `).join('');

        if (activeFilters.category) {
            const el = document.querySelector(`.category-facet[data-category="${activeFilters.category}"]`);
            if (el) el.classList.add('active');
        }

        document.querySelectorAll('.category-facet').forEach(el => {
            el.addEventListener('click', () => {
                const cat = el.getAttribute('data-category');
                const isActive = el.classList.contains('active');
                document.querySelectorAll('.category-facet').forEach(e => e.classList.remove('active'));
                activeFilters.category = isActive ? null : cat;
                if (!isActive) el.classList.add('active');
                if (applyFiltersFn) applyFiltersFn();
            });
        });
    }
}
