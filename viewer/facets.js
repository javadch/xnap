// viewer/facets.js — Hashtag, account, and keyword cloud rendering

import { activeFilters, aiEnabled } from './state.js';
import { extractUsername } from './utils.js';

let applyFiltersFn = null;
export function setApplyFilters(fn) { applyFiltersFn = fn; }

/**
 * @param {object} facetItems - Per-facet cross-filtered item sets:
 *   { hashtagItems, accountItems, keywordItems }
 */
export function renderFacets({ hashtagItems, accountItems, keywordItems }) {
    const hashtagList = document.getElementById('hashtagList');
    const accountList = document.getElementById('accountList');
    const keywordCloud = document.getElementById('keywordCloud');

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
        const username = extractUsername(item.user);
        accountMap[username] = (accountMap[username] || 0) + 1;
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

    // ── Keywords Cloud ──
    if (!aiEnabled) {
        keywordCloud.innerHTML = '<span class="no-data">AI disabled</span>';
        activeFilters.keyword = null;
    } else {
        const keywordMap = {};
        keywordItems.forEach(item => {
            if (item.keywords) {
                item.keywords.forEach(keyword => { keywordMap[keyword] = (keywordMap[keyword] || 0) + 1; });
            }
        });
        const sortedKeywords = Object.entries(keywordMap).sort((a, b) => b[1] - a[1]);
        const maxCount = sortedKeywords.length > 0 ? sortedKeywords[0][1] : 1;
        const minCount = sortedKeywords.length > 0 ? sortedKeywords[sortedKeywords.length - 1][1] : 1;

        keywordCloud.innerHTML = sortedKeywords.map(([keyword, count]) => {
            const sizeRange = maxCount - minCount || 1;
            const size = 12 + ((count - minCount) / sizeRange) * 12;
            return `<span class="keyword-tag" data-keyword="${keyword}" style="font-size: ${size}px;">${keyword}</span>`;
        }).join('');

        if (activeFilters.keyword) {
            const el = document.querySelector(`.keyword-tag[data-keyword="${activeFilters.keyword}"]`);
            if (el) el.classList.add('active');
        }

        document.querySelectorAll('.keyword-tag').forEach(el => {
            el.addEventListener('click', () => {
                const keyword = el.getAttribute('data-keyword');
                const isActive = el.classList.contains('active');
                document.querySelectorAll('.keyword-tag').forEach(e => e.classList.remove('active'));
                activeFilters.keyword = isActive ? null : keyword;
                if (!isActive) el.classList.add('active');
                if (applyFiltersFn) applyFiltersFn();
            });
        });
    }
}
