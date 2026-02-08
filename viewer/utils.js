// viewer/utils.js — Shared utility functions

/**
 * Generate a filename for a snapshot image
 */
export function generateFilename(item) {
    const timeUTC = item.tweetTimeUTC || item.capturedAtUTC;
    const handle = (item.accountHandle || '').replace('@', '') || 'unknown';
    return `${handle}-${timeUTC.replace(/[:.]/g, '-')}.png`;
}
