// Minimal browser shims so three.js' GLTFExporter runs under Node.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend && this.onloadend({ target: this }); this.onload && this.onload({ target: this }); }); }
    readAsDataURL(blob) { blob.arrayBuffer().then((buf) => { this.result = `data:${blob.type};base64,` + Buffer.from(buf).toString('base64'); this.onloadend && this.onloadend({ target: this }); this.onload && this.onload({ target: this }); }); }
  };
}
