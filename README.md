# Xnap

A Chrome extension for capturing, archiving, and organizing tweets (posts) from X.com (formerly Twitter). Xnap adds a snapshot button to every tweet, letting you save a pixel-perfect screenshot along with its metadata — text, author, hashtags, timestamps, and more — into a local, searchable gallery.

## Features

- **One-click capture** — A camera button is injected into every tweet's action bar. Click it to snapshot the tweet instantly.
- **Batch capture** — Archive an entire account's tweets within a date range. Xnap scrolls the search results, collects URLs, and captures each tweet automatically.
- **Local storage** — All data is stored in the browser's IndexedDB. Nothing leaves your machine unless you export it.
- **Gallery viewer** — A built-in viewer with grid layout, full-size modal preview, and sidebar filters.
- **Search & filter** — Filter snapshots by text, account, hashtag, keyword, date range, or album.
- **Albums** — Organize snapshots into albums. Batch captures automatically create an album.
- **ZIP export** — Export filtered snapshots as a `.zip` file containing PNG images, a metadata JSON, and a manifest.
- **AI enrichment** *(optional)* — Enable AI-powered summaries and keyword extraction via an API key (configured in the popup).
- **Duplicate detection** — Each snapshot is fingerprinted (SHA-256) for authenticity and duplicate checks.

## Installation

Xnap is not published on the Chrome Web Store. Install it as an unpacked extension:

1. **Clone or download** this repository:
   ```
   git clone https://github.com/dfdnet/xnap.git
   ```
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `xnap` folder.
5. The Xnap icon will appear in the Chrome toolbar. Pin it for easy access.

## Usage

### Capturing a single tweet

1. Navigate to [x.com](https://x.com).
2. Find any tweet in your feed, a profile, or search results.
3. Click the **camera icon** (📷) that appears in the tweet's action bar (next to like, retweet, etc.).
4. The icon briefly shows 📸 while capturing and ✅ when done.

> If the tweet is in a feed (not on its own page), Xnap opens it in a temporary popup window to get a clean screenshot, then closes the window automatically.

### Batch capturing tweets

1. Click the **Xnap** toolbar icon and then **Open** to launch the gallery viewer.
2. In the header bar, enter a **@username**, pick a **date range**, and click **Snap**.
3. Xnap opens an X.com search page, scrolls to collect all matching tweet URLs, then captures each one sequentially. A progress bar under the search section in the gallery view shows status.
4. Captured tweets are saved into a new album named after the account and date range.

### Browsing & filtering

- **Search** — Type in the search box to find tweets by text content or tags.
- **Facets** — Click an account name, hashtag, or keyword in the sidebar to filter.
- **Date range** — Use the date pickers in the sidebar to narrow by date.
- **Albums** — Click an album in the sidebar to view only its snapshots. Use Ctrl+Click to select multiple albums.
- **Reset** — Click the refresh button next to "Xnap" in the sidebar to clear all filters.

### Viewing a snapshot

Click any snapshot card in the grid to open a full-size modal showing the screenshot and all associated metadata (author, text, hashtags, keywords, timestamps, URL).

### Exporting

1. Apply any filters to select the snapshots you want to export.
2. Click the **Export** button in the header.
3. A `.zip` file is downloaded containing:
   - `images/` — PNG screenshots named by `username-tweettime.png`
   - `metadata.json` — Full metadata for each snapshot
   - `manifest.json` — Export info including applied filters and album context

### Deleting

- **Delete Album** — Deletes the currently selected album and all its snapshots.
- **Delete** — Deletes all currently visible (filtered) snapshots.

### Settings

Click the Xnap toolbar icon to open the popup:

- **Enable AI** — Toggle AI-powered summary and keyword extraction on or off.
- **AI API Key** — Enter your API key for the AI service.

## Project Structure

```
xnap/
├── manifest.json        # Chrome extension manifest (MV3)
├── background.js        # Service worker: screenshot capture, batch orchestration
├── content.js           # Content script injected on X.com: clip buttons, tweet extraction
├── db.js                # IndexedDB wrapper (snapshots & albums)
├── popup.html / .js     # Toolbar popup: settings & viewer launch
├── viewer.html / .js    # Gallery viewer entry point
├── styles.css           # Viewer styles
├── lib/
│   ├── html2canvas.min.js   # Screenshot rendering library
│   └── jszip.min.js         # ZIP generation library
└── viewer/
    ├── state.js         # Shared state & filter logic
    ├── grid.js          # Grid rendering
    ├── modal.js         # Full-size snapshot modal
    ├── facets.js        # Sidebar facets (accounts, hashtags, keywords)
    ├── albums.js        # Album management
    ├── batch.js         # Batch capture UI & progress
    ├── export.js        # ZIP export
    ├── sidebar.js       # Sidebar resize & toggle
    ├── share.js         # Sharing utilities
    └── utils.js         # Common helpers
```

## Requirements

- Google Chrome (or any Chromium-based browser that supports Manifest V3)
- An active X.com / Twitter account to browse tweets

## License

This project is provided as-is for personal use.
