
## Overview

A single-page React app with a top tab bar (OCR / History / Variable). Light gray/white surfaces, deep vibrant red (`hsl(0 78% 50%)`) accent for primary buttons, active tabs, focus rings, and headers. Tailwind + shadcn components, semantic tokens in `index.css` and `tailwind.config.ts` (no hard-coded colors in components).

## Tab 1 — OCR

- Large dropzone (drag-and-drop + click to browse) using `react-dropzone`. Accepts `image/*` and `application/pdf`.
- On drop: show animated red spinner, read file metadata:
  - Images: name, size, MIME, resolution (via `Image` natural width/height)
  - PDFs: name, size, page count (via `pdfjs-dist`)
- Call edge function `ocr-extract` with the file (base64). The function uses Lovable AI Gateway (`google/gemini-2.5-flash`) vision to return extracted plain text. For PDFs, the function renders pages to images server-side is heavy — instead we render PDF pages to PNG in the browser with `pdfjs-dist` and send page images to the function.
- Result view: split layout — left = file preview (image tag or PDF page canvas with pager), right = extracted text in a `<Textarea>` with a "Copy to clipboard" button (red, with check animation).
- On success, insert a row into `ocr_history`.

## Tab 2 — History

- Query `ocr_history` ordered by `created_at desc`.
- Card/list rows: thumbnail (if image), file name, snippet of text, timestamp ("2 min ago" via `date-fns`).
- Click row → opens a dialog showing the full extracted text with copy button.
- Empty state with red CTA linking back to OCR tab.

## Tab 3 — Variable

- Fetch `variable` table, render as shadcn `Table` with columns: Variable, Description, Created At, Actions.
- Pagination component (10 rows/page) using shadcn `Pagination`.
- "Add New Variable" button (red) opens a dialog with `variable` + `description` inputs → inserts row.
- Per-row Edit (dialog) and Delete (confirm dialog) actions.
- Toast feedback on every mutation via `sonner`.

## Backend

New table `ocr_history` (user-scoped if auth exists, otherwise public-readable to keep the app usable without login since no auth is in scope):
- `id uuid pk`, `file_name text`, `file_type text`, `file_size bigint`, `extracted_text text`, `preview_url text null`, `created_at timestamptz default now()`

RLS: public read/insert/delete (no auth in scope per the brief). I'll flag this clearly.

`variable` table already exists with no RLS policies — I'll add public read/insert/update/delete policies so the CRUD works from the client (again, no auth requested).

Edge function `ocr-extract`:
- Input: `{ images: string[] }` (data URLs)
- Calls Lovable AI Gateway chat completions with vision messages, returns `{ text }`.
- Handles 429/402 with friendly error.

## Decisions made (since clarifying questions were skipped)

- OCR engine: **Lovable AI Gateway (Gemini Flash vision)** — higher accuracy, no extra setup.
- PDFs: **supported**, rendered to images in-browser via `pdfjs-dist`, then OCR'd page by page.
- History: **persisted in Supabase** (`ocr_history` table) so it survives reloads.

## Files

```text
src/
  pages/Index.tsx                  # tab shell
  components/ocr/Dropzone.tsx
  components/ocr/FileMeta.tsx
  components/ocr/ResultSplit.tsx
  components/ocr/Spinner.tsx
  components/history/HistoryList.tsx
  components/history/HistoryDetailDialog.tsx
  components/variable/VariableTable.tsx
  components/variable/VariableDialog.tsx
  lib/pdf.ts                       # pdfjs page→png helper
  lib/ocr.ts                       # invokes edge function
  index.css / tailwind.config.ts   # red accent tokens
supabase/functions/ocr-extract/index.ts
```

## Technical notes

- Design tokens: `--primary: 0 78% 50%` (deep red), `--primary-foreground: 0 0% 100%`, soft `--background: 0 0% 98%`, `--muted: 0 0% 96%`. Update both `index.css` and `tailwind.config.ts`.
- Spinner: tailwind `animate-spin` ring with red gradient border, plus a subtle pulsing dot.
- `pdfjs-dist` worker loaded from CDN matching installed version.
- Copy uses `navigator.clipboard.writeText`, fallback `document.execCommand`.
- All Supabase calls via `@/integrations/supabase/client`.
- SEO: set `<title>OCR Studio – Extract text from images & PDFs</title>`, meta description, single H1 on OCR tab.

## Caveats to flag after build

- No auth → `variable` and `ocr_history` policies are public. If multi-user is needed, add auth and switch policies to `auth.uid()`-scoped.
- Lovable AI Gateway is free through Oct 13, 2025, then metered.
