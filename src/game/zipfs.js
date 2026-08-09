// fflate-based replacement for the vendored zip.js/zip-fs.js/inflate.js/z-worker.js
// the game used via `new zip.fs.FS()`. Exposes the same surface the engine calls:
//   new FS(); fs.root.importBlob(blob, ok, err); fs.root.children; fs.root.getChildByName(name)
//   entry.name; entry.getText(cb); entry.getBlob(type, cb)
// Drops ~106 KB of vendored zip/inflate/z-worker scripts from the game page.
import { unzip } from "fflate";

function Entry(name, data) {
   this.name = name;
   this._data = data; // Uint8Array
}
Entry.prototype.getText = function (cb) {
   cb(new TextDecoder().decode(this._data));
};
Entry.prototype.getBlob = function (_type, cb) {
   cb(new Blob([this._data], {})); // type is informational; the engine reads via arrayBuffer/URL
};

function ZipDir() {
   this.children = [];
   this._map = {};
}
ZipDir.prototype.getChildByName = function (name) {
   return this._map[name] || null;
};
ZipDir.prototype.importBlob = function (blob, ok, err) {
   if (blob.size > 50 * 1024 * 1024) { if (err) err(new Error("osz too large")); return; }
   blob
      .arrayBuffer()
      .then((ab) => {
         if (ab.byteLength > 50 * 1024 * 1024) { if (err) err(new Error("osz too large")); return; }
         unzip(new Uint8Array(ab), (e, unzipped) => {
            if (e) { if (err) err(e); return; }
            if (!unzipped || Object.keys(unzipped).length > 300) { if (err) err(new Error("too many files")); return; }
            let total = 0;
            for (const n in unzipped) total += unzipped[n].length;
            if (total > 200 * 1024 * 1024) { if (err) err(new Error("unzipped too large")); return; }
            for (const name in unzipped) {
               const entry = new Entry(name, unzipped[name]);
               this.children.push(entry);
               this._map[name] = entry;
            }
            if (ok) ok();
         });
      })
      .catch((e) => { if (err) err(e); });
};

export function FS() {
   this.root = new ZipDir();
}
