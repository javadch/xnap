// viewer/albums.js — Album list rendering and management

import { allData, allAlbums, activeFilters, removeAlbumData } from './state.js';
import { deleteSnapshot, deleteAlbum } from '../db.js';

let applyFiltersFn = null;
export function setApplyFilters(fn) { applyFiltersFn = fn; }

export function renderAlbumList() {
    const albumList = document.getElementById('albumList');

    // Count snapshots per album
    const albumCounts = {};
    allData.forEach(item => {
        if (item.albumId) {
            albumCounts[item.albumId] = (albumCounts[item.albumId] || 0) + 1;
        }
    });
    const individualCount = allData.filter(item => !item.albumId).length;

    let html = `
        <div class="facet-item album-facet ${activeFilters.albumIds.has('individual') ? 'active' : ''}" data-album="individual">
            <span class="facet-content">Default</span>
            <span class="count">${individualCount}</span>
        </div>
    `;

    allAlbums.forEach(album => {
        const count = albumCounts[album.id] || 0;
        const isActive = activeFilters.albumIds.has(album.id);
        html += `
            <div class="facet-item album-facet ${isActive ? 'active' : ''}" data-album="${album.id}">
                <span class="facet-content">${album.name}</span>
                <span class="count">${count}</span>
            </div>
        `;
    });

    albumList.innerHTML = html;

    // Click listeners — Ctrl+click for multi-select
    document.querySelectorAll('.album-facet').forEach(el => {
        el.addEventListener('click', (e) => {
            const albumIdAttr = el.getAttribute('data-album');
            const isActive = el.classList.contains('active');
            const isMulti = e.ctrlKey || e.metaKey;

            if (isMulti) {
                // Toggle this album in the set
                if (isActive) {
                    activeFilters.albumIds.delete(albumIdAttr);
                    // If nothing selected, fall back to individual
                    if (activeFilters.albumIds.size === 0) {
                        activeFilters.albumIds.add('individual');
                    }
                } else {
                    activeFilters.albumIds.add(albumIdAttr);
                }
            } else {
                // Single click — exclusive selection (toggle off → individual)
                if (isActive && albumIdAttr !== 'individual') {
                    activeFilters.albumIds = new Set(['individual']);
                } else {
                    activeFilters.albumIds = new Set([albumIdAttr]);
                }
            }
            if (applyFiltersFn) applyFiltersFn();
        });
    });
}

export async function handleDeleteAlbum() {
    // Only allow delete when exactly one non-default album is selected
    const selectedAlbums = [...activeFilters.albumIds].filter(id => id !== 'individual');
    if (selectedAlbums.length === 0) {
        alert('No album selected (Default cannot be deleted).');
        return;
    }
    if (selectedAlbums.length > 1) {
        alert('Please select a single album to delete.');
        return;
    }

    const albumId = selectedAlbums[0];
    const album = allAlbums.find(a => a.id === albumId);
    if (!album) {
        alert('No album selected.');
        return;
    }

    const albumSnapshots = allData.filter(item => item.albumId === album.id);
    const count = albumSnapshots.length;

    const message = count > 0
        ? `Delete album "${album.name}" and all ${count} snapshot${count !== 1 ? 's' : ''} in it?\n\nThis action cannot be undone!`
        : `Delete empty album "${album.name}"?`;

    if (!confirm(message)) return;

    try {
        for (const item of albumSnapshots) {
            await deleteSnapshot(item.id);
        }
        await deleteAlbum(album.id);
        removeAlbumData(album.id);
        activeFilters.albumIds = new Set(['individual']);
        if (applyFiltersFn) applyFiltersFn();
        alert(`Album "${album.name}" and ${count} snapshot${count !== 1 ? 's' : ''} deleted.`);
    } catch (err) {
        console.error('Delete album failed:', err);
        alert('Failed to delete album: ' + err.message);
    }
}
