/* ESM wrapper for JSZip UMD bundle – enables import from ES‑module service workers */
import './jszip.min.js';          // UMD detects `self` and sets self.JSZip
export default self.JSZip;
