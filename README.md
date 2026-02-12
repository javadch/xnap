# Xnap

A Chrome extension for capturing, archiving, and organizing tweets (posts) from X.com (formerly Twitter). Xnap adds a snapshot button to every tweet, letting you save a pixel-perfect screenshot along with its metadata — text, author handle, display name, hashtags, timestamps, and more — into a local, searchable gallery.

## Features

- **One-click capture** — A camera button is injected into every tweet's action bar. Click it to snapshot the tweet instantly.
- **Batch capture** — Navigate to any X.com page with tweets (profile, search results, timeline), then click **Snap this page** in the extension popup to capture every visible tweet automatically.
- **Local storage** — All data is stored in the browser's IndexedDB. Nothing leaves your machine unless you export it.
- **Gallery viewer** — A built-in viewer with grid layout, full-size modal preview, and sidebar filters.
- **Search & filter** — Filter snapshots by text, account, hashtag, keyword, date range, or album. Facets are cross-filtered — selecting one facet updates the options shown in the others.
- **Albums** — Organize snapshots into albums. Batch captures automatically create an album.
- **ZIP export** — Export filtered snapshots as a `.zip` file containing PNG images, a metadata JSON, and a manifest.
- **Share** — Share any snapshot via Telegram (Web Share API with clipboard + file fallback).
- **JSON metadata copy** — Copy a snapshot's full metadata as JSON to the clipboard from the modal or grid card.
- **AI enrichment** *(optional)* — Enable AI-powered summaries and keyword extraction via an API key (configured in the popup).
- **Duplicate detection** — Each snapshot is fingerprinted (SHA-256) for authenticity and duplicate checks.
- **Embedded provenance** — Every screenshot is stamped with XMP and PNG text metadata (author, tweet text, capture time, SHA-256 fingerprint, source URL). Metadata is visible in Windows Properties → Details, macOS Get Info, and any tool that reads XMP (Photoshop, GIMP, ExifTool).

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

### Extension popup

Click the **Xnap** toolbar icon to open the popup. It provides:

- **Open** — Launch the gallery viewer in a new tab.
- **Snap this page** — Batch-capture every tweet visible on the current X.com page. The button is only enabled when you're on X.com and tweets are detected. A progress bar and status message show capture progress.
- **Settings** — Toggle AI enrichment on/off and enter your AI API key.

### Capturing a single tweet

1. Navigate to [x.com](https://x.com).
2. Find any tweet in your feed, a profile, or search results.
3. Click the **camera icon** (📷) that appears in the tweet's action bar (next to like, retweet, etc.).
4. The icon briefly shows 📸 while capturing and ✅ when done.

> If the tweet is in a feed (not on its own page), Xnap opens it in a temporary popup window to get a clean screenshot, then closes the window automatically.

### Batch capturing tweets

1. Navigate to any X.com page that shows tweets — a user's profile, search results, your timeline, etc.
2. **Scroll down** to load all the tweets you want to capture — X uses infinite scrolling and only renders tweets that have been scrolled into view. Any tweets not yet loaded in the DOM won't be detected.
3. Click the **Xnap** toolbar icon to open the popup. The popup detects tweets on the current page and shows a count.
4. Click **Snap this page**.
5. Xnap collects all visible tweet URLs, then opens each in a temporary window, captures a screenshot, and saves it. Progress is shown in the popup.
5. All captured tweets are saved into a new album. The viewer automatically focuses on the batch album if it's open.

### Browsing & filtering

- **Search** — Type in the search box to find tweets by text, account, URL, timestamp, or fingerprint.
- **Facets** — Click an account handle, hashtag, or keyword in the sidebar to filter. Facets cross-filter: selecting an account updates the hashtag and keyword lists to show only what's relevant.
- **Date range** — Use the date pickers in the sidebar to narrow by capture date.
- **Albums** — Click an album in the sidebar to view only its snapshots. Use Ctrl+Click to select multiple albums.
- **Reset** — Click the refresh button next to "Xnap" in the sidebar to clear all filters.

### Viewing a snapshot

Click any snapshot card in the grid to open a full-size modal showing the screenshot and all associated metadata (display name, @handle, text, hashtags, keywords, timestamps, URL, SHA-256 fingerprint).

**Action buttons** (available on both the modal and grid cards):

| Button | Action |
|--------|--------|
| ⬇ Download | Save the screenshot as a PNG file |
| { } JSON | Copy full metadata as JSON to the clipboard |
| ✈ Telegram | Share the snapshot via Telegram |
| 𝕏 Original | Open the original tweet on X.com |
| 🗑 Delete | Delete the snapshot |

### Exporting

1. Apply any filters to select the snapshots you want to export.
2. Click the **Export** button in the header.
3. A `.zip` file is downloaded containing:
   - `images/` — PNG screenshots named by `handle-tweettime.png`
   - `metadata.json` — Full metadata for each snapshot
   - `manifest.json` — Export info including applied filters and album context

### Deleting

- **Delete Album** — Deletes the currently selected album and all its snapshots.
- **Delete** — Deletes all currently visible (filtered) snapshots.

## Data model

Each snapshot stores:

| Field | Description |
|-------|-------------|
| `accountHandle` | The @handle (e.g. `@elonmusk`) |
| `accountName` | The display name (e.g. `Elon Musk`) |
| `accountId` | X's internal numeric user ID (best-effort, may be `null`) |
| `text` | Full tweet text |
| `hashtags` | Array of hashtags found in the text |
| `url` | Permalink to the original tweet |
| `tweetTimeUTC` | Original tweet timestamp (ISO 8601) |
| `capturedAtUTC` | When the snapshot was taken (ISO 8601) |
| `fingerprint` | SHA-256 hash of the tweet content for integrity/dedup |
| `summary` | AI-generated summary (if enabled) |
| `keywords` | AI-generated keywords (if enabled) |
| `albumId` | Album this snapshot belongs to (if any) |
| `image` | Screenshot as a data URL |

## Embedded Metadata (XMP + PNG tEXt)

Every saved screenshot has provenance metadata baked into the PNG file itself, so it travels with the image when downloaded or exported.

### Standard PNG tEXt chunks (visible in OS file properties)

| Keyword | Content |
|---------|---------|
| Title | `@handle — tweet-date` |
| Author | `Display Name (@handle)` |
| Description | Tweet text (first 1 000 chars) |
| Copyright | `Captured by Xnap \| SHA256: <fingerprint>` |
| Creation Time | `capturedAtUTC` (ISO 8601) |
| Source | Original tweet URL |
| Software | `Xnap` |
| Comment | Combined capture time + SHA-256 + URL |

### XMP (Dublin Core + custom `xnap:` namespace)

Readable by Photoshop, GIMP, ExifTool, XnView, and any XMP-aware tool.

| XMP Property | Maps to |
|-------------|---------|
| `dc:title` | `@handle — tweet-date` |
| `dc:creator` | `Display Name (@handle)` |
| `dc:description` | Tweet text |
| `dc:rights` | `Captured by Xnap \| SHA256: <fingerprint>` |
| `dc:source` | Original tweet URL |
| `dc:subject` | Hashtags (rdf:Bag) |
| `xmp:CreateDate` | `capturedAtUTC` |
| `xmp:CreatorTool` | `Xnap` |
| `xnap:accountHandle` | @handle |
| `xnap:accountName` | Display name |
| `xnap:accountId` | X internal numeric user ID |
| `xnap:tweetTimeUTC` | Original tweet timestamp |
| `xnap:capturedAtUTC` | Capture timestamp |
| `xnap:fingerprint` | SHA-256 hash |
| `xnap:tweetUrl` | Permalink |

## Project Structure

```
xnap/
├── manifest.json        # Chrome extension manifest (MV3)
├── background.js        # Service worker: screenshot capture, batch orchestration
├── content.js           # Content script injected on X.com: clip buttons, tweet extraction
├── db.js                # IndexedDB wrapper (snapshots & albums)
├── xmp.js               # PNG metadata embedding (XMP + tEXt chunks)
├── popup.html / .js     # Toolbar popup: viewer launch, batch capture trigger, settings
├── viewer.html / .js    # Gallery viewer entry point
├── styles.css           # Viewer styles
├── lib/
│   ├── html2canvas.min.js   # Screenshot rendering library
│   └── jszip.min.js         # ZIP generation library
└── viewer/
    ├── state.js         # Shared state, filter logic, data normalization
    ├── grid.js          # Grid card rendering with action buttons
    ├── modal.js         # Full-size snapshot modal with action buttons
    ├── facets.js        # Sidebar facets (accounts, hashtags, keywords) with cross-filtering
    ├── albums.js        # Album management
    ├── export.js        # ZIP export
    ├── sidebar.js       # Sidebar resize & toggle
    ├── share.js         # Telegram sharing
    └── utils.js         # Filename generation
```

## Requirements

- Google Chrome (or any Chromium-based browser that supports Manifest V3)
- An active X.com / Twitter account to browse tweets

## License

This project is provided as-is for personal use.
