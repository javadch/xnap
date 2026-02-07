// viewer/utils.js — Shared utility functions

/**
 * Extract @username from user string like "Display Name\n@username"
 */
export function extractUsername(userString) {
    const match = userString.match(/@[\w]+/);
    return match ? match[0] : userString;
}

/**
 * Generate a filename for a snapshot image
 */
export function generateFilename(item) {
    const capturedUTC = item.capturedAtUTC || new Date(item.timestamp).toISOString();
    const username = extractUsername(item.user);
    return `${username.replace('@', '')}-${capturedUTC.replace(/[:.]/g, '-')}.png`;
}
