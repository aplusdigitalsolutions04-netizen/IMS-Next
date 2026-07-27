// pdfjs-dist's legacy build (used internally by pdf-parse) references
// DOMMatrix/ImageData/Path2D at MODULE-LOAD time, not just when rendering —
// see node_modules/pdfjs-dist/legacy/build/pdf.mjs's
// `const SCALE_MATRIX = new DOMMatrix();`. It normally gets these from the
// optional native package @napi-rs/canvas, but that's a prebuilt binary that
// doesn't reliably install on every host (confirmed failing silently on
// Hostinger shared hosting), which crashes every pdf-parse import with
// "ReferenceError: DOMMatrix is not defined" — before our own code even runs.
// We only ever call pdf-parse's plain getText(), never canvas rendering, so
// a non-functional stub is enough to satisfy the module-level instantiation.
// Guarded so a real @napi-rs/canvas (when it IS available) still wins.
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    }
  };
}
if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageData {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}
if (typeof globalThis.Path2D === "undefined") {
  globalThis.Path2D = class Path2D {};
}
