/**
 * Browser-only helpers for reading file metadata and rendering PDFs to images.
 * pdfjs-dist is dynamically imported so this module is safe to ship in SSR bundles
 * (it just won't execute server-side).
 */

export interface ImageMeta {
  kind: "image";
  width: number;
  height: number;
}

export interface PdfMeta {
  kind: "pdf";
  pageCount: number;
}

export type FileMeta = ImageMeta | PdfMeta | null;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function readImageMeta(file: File): Promise<ImageMeta> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    return { kind: "image", width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then(async (mod) => {
      const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      mod.GlobalWorkerOptions.workerSrc = workerSrc;
      return mod;
    });
  }
  return pdfjsPromise;
}

export async function renderPdfPages(
  file: File,
  scale = 1.5,
): Promise<{ dataUrls: string[]; pageCount: number }> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const dataUrls: string[] = [];
  const maxPages = Math.min(doc.numPages, 10); // cap to keep OCR cost sane
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    dataUrls.push(canvas.toDataURL("image/png"));
  }
  return { dataUrls, pageCount: doc.numPages };
}
