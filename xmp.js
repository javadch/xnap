// xmp.js — Embed XMP + PNG text metadata into PNG images
//
// Injects both:
//   1. Standard PNG tEXt chunks (Title, Author, Description, etc.)
//      → visible in Windows Properties → Details, macOS Get Info
//   2. An XMP iTXt chunk with Dublin Core + custom xnap: namespace
//      → visible in Photoshop, GIMP, ExifTool, XnView

// ── CRC32 lookup table ───────────────────────────────────────────────────────

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
}

function crc32(buf, start, len) {
    let c = 0xFFFFFFFF;
    for (let i = start; i < start + len; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG binary helpers ───────────────────────────────────────────────────────

function readU32(a, o) {
    return ((a[o] << 24) | (a[o + 1] << 16) | (a[o + 2] << 8) | a[o + 3]) >>> 0;
}

function writeU32(a, o, v) {
    a[o]     = (v >>> 24) & 0xFF;
    a[o + 1] = (v >>> 16) & 0xFF;
    a[o + 2] = (v >>> 8)  & 0xFF;
    a[o + 3] =  v         & 0xFF;
}

/**
 * Build a raw PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC
 */
function buildChunk(type, data) {
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    writeU32(chunk, 0, data.length);
    for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
    chunk.set(data, 8);
    writeU32(chunk, 8 + data.length, crc32(chunk, 4, 4 + data.length));
    return chunk;
}

// ── Text chunk builders ──────────────────────────────────────────────────────

const enc = new TextEncoder();

/** PNG tEXt chunk (Latin-1 keyword + text) */
function tEXt(keyword, text) {
    const kw = enc.encode(keyword);
    const txt = enc.encode(text);
    const data = new Uint8Array(kw.length + 1 + txt.length);
    data.set(kw, 0);
    data[kw.length] = 0;
    data.set(txt, kw.length + 1);
    return buildChunk('tEXt', data);
}

/** PNG iTXt chunk (UTF-8 keyword + text, no compression) */
function iTXt(keyword, text) {
    const kw = enc.encode(keyword);
    const txt = enc.encode(text);
    const data = new Uint8Array(kw.length + 5 + txt.length);
    data.set(kw, 0);
    let p = kw.length;
    data[p++] = 0; // null after keyword
    data[p++] = 0; // compression flag (none)
    data[p++] = 0; // compression method
    data[p++] = 0; // language tag (empty, null-terminated)
    data[p++] = 0; // translated keyword (empty, null-terminated)
    data.set(txt, p);
    return buildChunk('iTXt', data);
}

// ── XMP XML ──────────────────────────────────────────────────────────────────

function x(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildXmpXml(m) {
    const subjects = (m.hashtags || [])
        .map(t => `            <rdf:li>${x(t)}</rdf:li>`)
        .join('\n');
    const subjectBag = subjects
        ? `\n        <dc:subject>\n          <rdf:Bag>\n${subjects}\n          </rdf:Bag>\n        </dc:subject>`
        : '';

    return [
        `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>`,
        `<x:xmpmeta xmlns:x="adobe:ns:meta/">`,
        `  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`,
        `    <rdf:Description`,
        `      xmlns:dc="http://purl.org/dc/elements/1.1/"`,
        `      xmlns:xmp="http://ns.adobe.com/xap/1.0/"`,
        `      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"`,
        `      xmlns:tiff="http://ns.adobe.com/tiff/1.0/"`,
        `      xmlns:xnap="http://xnap.app/ns/1.0/"`,
        `      xmp:CreatorTool="Xnap 0.1.0"`,
        `      xmp:CreateDate="${x(m.capturedAtUTC)}"`,
        `      photoshop:DateCreated="${x(m.capturedAtUTC)}"`,
        `      tiff:Software="Xnap"`,
        `      xnap:accountHandle="${x(m.accountHandle)}"`,
        `      xnap:accountName="${x(m.accountName)}"`,
        `      xnap:accountId="${x(m.accountId)}"`,
        `      xnap:tweetTimeUTC="${x(m.tweetTimeUTC)}"`,
        `      xnap:capturedAtUTC="${x(m.capturedAtUTC)}"`,
        `      xnap:fingerprint="${x(m.fingerprint)}"`,
        `      xnap:tweetUrl="${x(m.tweetUrl)}">`,
        `        <dc:title>`,
        `          <rdf:Alt><rdf:li xml:lang="x-default">${x(m.title)}</rdf:li></rdf:Alt>`,
        `        </dc:title>`,
        `        <dc:creator>`,
        `          <rdf:Seq><rdf:li>${x(m.creator)}</rdf:li></rdf:Seq>`,
        `        </dc:creator>`,
        `        <dc:description>`,
        `          <rdf:Alt><rdf:li xml:lang="x-default">${x(m.description)}</rdf:li></rdf:Alt>`,
        `        </dc:description>`,
        `        <dc:rights>`,
        `          <rdf:Alt><rdf:li xml:lang="x-default">${x(m.rights)}</rdf:li></rdf:Alt>`,
        `        </dc:rights>`,
        `        <dc:source>${x(m.tweetUrl)}</dc:source>`,
        `        <dc:date>`,
        `          <rdf:Seq>`,
        `            <rdf:li>${x(m.tweetTimeUTC)}</rdf:li>`,
        `            <rdf:li>${x(m.capturedAtUTC)}</rdf:li>`,
        `          </rdf:Seq>`,
        `        </dc:date>`,
        subjectBag,
        `    </rdf:Description>`,
        `  </rdf:RDF>`,
        `</x:xmpmeta>`,
        `<?xpacket end="w"?>`,
    ].join('\n');
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Embed XMP and standard PNG text metadata into a PNG data URL.
 *
 * @param {string} dataUrl  — data:image/png;base64,... screenshot
 * @param {object} record   — snapshot record (accountHandle, text, url, …)
 * @returns {string} New data URL with metadata embedded
 */
export function embedPngMetadata(dataUrl, record) {
    if (!dataUrl || !dataUrl.startsWith('data:image/png')) return dataUrl;

    // Decode base64 → binary
    const raw = atob(dataUrl.split(',')[1]);
    const png = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) png[i] = raw.charCodeAt(i);

    // Sanity: verify PNG signature
    if (png[0] !== 0x89 || png[1] !== 0x50) return dataUrl;

    // ── Prepare metadata fields ──────────────────────────────────────────

    const handle      = record.accountHandle || '';
    const name        = record.accountName || handle || 'Unknown';
    const tweetDate   = (record.tweetTimeUTC || '').split('T')[0] || 'undated';
    const title       = `${handle} \u2014 ${tweetDate}`;
    const creator     = name !== handle ? `${name} (${handle})` : handle;
    const description = record.text || '';
    const capturedAt  = record.capturedAtUTC || '';
    const sha         = record.fingerprint || 'N/A';
    const rights      = `Captured by Xnap | SHA256: ${sha}`;
    const tweetUrl    = record.url || '';

    const meta = {
        title, creator, description, rights, capturedAtUTC: capturedAt,
        accountHandle: handle, accountName: name,
        accountId: record.accountId || '',
        tweetTimeUTC: record.tweetTimeUTC || '',
        fingerprint: sha, tweetUrl,
        hashtags: record.hashtags || [],
    };

    // ── Build chunks to insert ───────────────────────────────────────────

    const tags = (record.hashtags || []).join('; ');

    const chunks = [
        // Standard PNG text keywords — OS file-property viewers read these
        tEXt('Title',         title),
        iTXt('Author',        creator),
        iTXt('Description',   description),
        tEXt('Copyright',     rights),
        tEXt('Creation Time', capturedAt),
        tEXt('Tweet Time',    record.tweetTimeUTC || ''),
        tEXt('Source',        tweetUrl),
        tEXt('Software',      'Xnap 0.1.0'),
        tEXt('Keywords',      tags),
        // Full XMP (Dublin Core + xnap namespace) for photo tools
        iTXt('XML:com.adobe.xmp', buildXmpXml(meta)),
    ];

    // ── Splice into PNG after IHDR ───────────────────────────────────────

    const ihdrDataLen = readU32(png, 8);
    const insertPos = 8 + 4 + 4 + ihdrDataLen + 4; // after IHDR chunk

    let extraLen = 0;
    for (const c of chunks) extraLen += c.length;

    const out = new Uint8Array(png.length + extraLen);
    out.set(png.subarray(0, insertPos), 0);
    let pos = insertPos;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    out.set(png.subarray(insertPos), pos);

    // ── Re-encode to base64 data URL ─────────────────────────────────────

    const CHUNK = 0x8000;
    let b64 = '';
    for (let i = 0; i < out.length; i += CHUNK) {
        b64 += String.fromCharCode.apply(null, out.subarray(i, Math.min(i + CHUNK, out.length)));
    }
    return 'data:image/png;base64,' + btoa(b64);
}
