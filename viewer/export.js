// viewer/export.js — ZIP export

import { getFilteredItems, allAlbums, activeFilters } from './state.js';

export async function handleExport() {
    const displayedItems = getFilteredItems();
    const count = displayedItems.length;

    if (count === 0) { alert('No snapshots to export.'); return; }
    if (!confirm(`Export ${count} snapshot${count !== 1 ? 's' : ''} as ZIP file?`)) return;

    const exportBtn = document.getElementById('exportBtn');
    exportBtn.disabled = true;
    const originalHTML = exportBtn.innerHTML;
    exportBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" class="spin"><path fill="currentColor" d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg>
        Exporting...
    `;

    try {
        const zip = new JSZip();
        const imagesFolder = zip.folder('images');
        const metadata = [];

        const manifest = {
            exportDate: new Date().toISOString(),
            snapshotCount: displayedItems.length,
            album: null,
            filters: {}
        };

        if (activeFilters.albumIds.size === 1 && activeFilters.albumIds.has('individual')) {
            manifest.album = { id: 'individual', name: 'Default' };
        } else {
            const albumNames = [...activeFilters.albumIds]
                .filter(id => id !== 'individual')
                .map(id => {
                    const album = allAlbums.find(a => a.id === id);
                    return album ? { id: album.id, name: album.name } : null;
                })
                .filter(Boolean);
            if (albumNames.length > 0) manifest.album = albumNames.length === 1 ? albumNames[0] : albumNames;
        }

        if (activeFilters.search) manifest.filters.search = activeFilters.search;
        if (activeFilters.account) manifest.filters.account = activeFilters.account;
        if (activeFilters.hashtag) manifest.filters.hashtag = activeFilters.hashtag;
        if (activeFilters.keyword) manifest.filters.keyword = activeFilters.keyword;
        if (activeFilters.dateFrom) manifest.filters.dateFrom = activeFilters.dateFrom.toISOString().split('T')[0];
        if (activeFilters.dateTo) manifest.filters.dateTo = activeFilters.dateTo.toISOString().split('T')[0];

        for (const item of displayedItems) {
            const timeUTC = item.tweetTimeUTC || item.capturedAtUTC;
            const handle = (item.accountHandle || '').replace('@', '') || 'unknown';
            const filename = `${handle}-${timeUTC.replace(/[:.]/g, '-')}.png`;
            const base64Data = item.image.split(',')[1];
            imagesFolder.file(filename, base64Data, { base64: true });

            const entry = {
                id: item.id, filename, url: item.url,
                accountHandle: item.accountHandle,
                accountName: item.accountName,
                accountId: item.accountId || null,
                text: item.text, summary: item.summary,
                hashtags: item.hashtags, keywords: item.keywords,
                tweetTimeUTC: item.tweetTimeUTC, capturedAtUTC: item.capturedAtUTC,
                fingerprint: item.fingerprint,
                albumId: item.albumId || null
            };
            if (item.note) entry.note = item.note;
            metadata.push(entry);
        }

        // Include album records referenced by exported snapshots
        const albumIds = new Set(displayedItems.map(i => i.albumId).filter(Boolean));
        const albums = allAlbums.filter(a => albumIds.has(a.id));
        if (albums.length > 0) {
            zip.file('albums.json', JSON.stringify(albums, null, 2));
        }

        zip.file('manifest.json', JSON.stringify(manifest, null, 2));
        zip.file('metadata.json', JSON.stringify(metadata, null, 2));

        const blob = await zip.generateAsync({
            type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const zipFilename = `xnap-export-${timestamp}.zip`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = zipFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        alert(`Successfully exported ${count} snapshot${count !== 1 ? 's' : ''} to ${zipFilename}`);
    } catch (err) {
        console.error('Export failed:', err);
        alert('Failed to export snapshots: ' + err.message);
    } finally {
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalHTML;
    }
}
