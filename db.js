// db.js
const DB_NAME = 'XnapDB';
const DB_VERSION = 2;
const STORE_NAME = 'snapshots';
const ALBUMS_STORE = 'albums';

export const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Snapshots store
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('hashtags', 'hashtags', { unique: false, multiEntry: true });
                store.createIndex('albumId', 'albumId', { unique: false });
            } else if (event.oldVersion < 2) {
                // Add albumId index to existing store
                const tx = event.target.transaction;
                const store = tx.objectStore(STORE_NAME);
                if (!store.indexNames.contains('albumId')) {
                    store.createIndex('albumId', 'albumId', { unique: false });
                }
            }
            
            // Albums store
            if (!db.objectStoreNames.contains(ALBUMS_STORE)) {
                const albumStore = db.createObjectStore(ALBUMS_STORE, { keyPath: 'id' });
                albumStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
};

export const saveSnapshot = async (data) => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Add unique ID based on timestamp if not present
    data.id = data.id || `tweet-${Date.now()}`;
    
    return new Promise((resolve, reject) => {
        const request = store.put(data);
        request.onsuccess = () => resolve(data.id);
        request.onerror = () => reject(request.error);
    });
};

export const getAllSnapshots = async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteSnapshot = async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
};

export const deleteAllSnapshots = async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
};

// Album functions
export const saveAlbum = async (album) => {
    const db = await openDB();
    const tx = db.transaction(ALBUMS_STORE, 'readwrite');
    const store = tx.objectStore(ALBUMS_STORE);
    
    album.id = album.id || `album-${Date.now()}`;
    album.createdAt = album.createdAt || Date.now();
    return new Promise((resolve, reject) => {
        const request = store.put(album);
        request.onsuccess = () => resolve(album.id);
        request.onerror = () => reject(request.error);
    });
};

export const getAllAlbums = async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ALBUMS_STORE, 'readonly');
        const store = tx.objectStore(ALBUMS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteAlbum = async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ALBUMS_STORE, 'readwrite');
        const store = tx.objectStore(ALBUMS_STORE);
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
};

export const getSnapshotsByAlbum = async (albumId) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('albumId');
        const request = index.getAll(albumId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};