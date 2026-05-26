# Self-hosted OCR: multipart upload + sync wait + result_markdown

Scope: only the **Self-hosted (Docker)** engine path. Lovable AI and Webhook engines stay as-is.

## 1. `src/lib/ocr-client.ts` — rewrite `runSelfHostedOcr`

Replace the current JSON/base64 body with a real `multipart/form-data` upload, and parse the documented response shape.

```ts
export async function runSelfHostedOcr(params: {
  url: string;          // BACKEND_API_URL from `variable` table
  file: File;           // raw File, NOT base64
}): Promise<{ text: string }> {
  // Intention: validate the endpoint up-front so we fail fast before
  // touching the network or locking the UI.
  if (!/^https?:\/\//i.test(params.url)) {
    throw new Error("BACKEND_API_URL must start with http(s)://");
  }

  // Intention: build a multipart payload so the Python container can
  // stream the file via standard form parsers (FastAPI UploadFile, Flask
  // request.files, etc.) instead of decoding base64 manually.
  const form = new FormData();
  form.append("file", params.file, params.file.name);

  // Intention: hold the connection open with `await` until the container
  // finishes its synchronous OCR pipeline and writes back the JSON body.
  // We deliberately do NOT set Content-Type — the browser appends the
  // correct multipart boundary automatically.
  let res: Response;
  try {
    res = await fetch(params.url, { method: "POST", body: form });
  } catch {
    throw new Error(
      `Could not reach ${params.url}. Check the container is running and CORS allows this origin.`,
    );
  }

  if (!res.ok) {
    throw new Error(`Self-hosted endpoint returned ${res.status}`);
  }

  // Intention: contract with the Python backend is
  //   { status: "success", result_markdown: "..." }
  // Anything else is treated as a failure surfaced to the user.
  const json = await res.json().catch(() => null) as
    | { status?: string; result_markdown?: string; error?: string }
    | null;

  if (!json || json.status !== "success" || typeof json.result_markdown !== "string") {
    throw new Error(json?.error ?? "Self-hosted backend did not return a successful result_markdown payload");
  }

  return { text: json.result_markdown };
}
```

## 2. `src/components/ocr/OcrPanel.tsx` — wire the new contract + UI lock

Targeted edits only — no redesign of the EngineSelector card built last turn.

- Pass the raw `File` to `runSelfHostedOcr` (skip the base64 conversion when engine === "selfhosted" to avoid wasted work on large files).
- Add a `submitting` boolean state. Set it `true` at the start of `handleFile` and `false` in a `finally` block.
- Disable while `submitting`:
  - Dropzone (`disabled: !canRun || submitting` in `useDropzone`)
  - Engine selector buttons
  - Endpoint variable `<Select>` and refresh button
  - Browse files / Clear buttons
- Show "Uploading to self-hosted container…" copy in the existing processing spinner when `engine === "selfhosted"`.
- Keep the existing `status === "processing"` flow; `submitting` is the hard input lock on top of it.

## 3. `BACKEND_API_URL` lookup

The user's spec references `variable.BACKEND_API_URL`. The dropdown already lets the user pick which row to use, and its `description` column stores the URL — that's the existing accessible field. Plan:

- Keep the dropdown as the source of truth (it already filters out rows with no URL).
- When the user picks a row whose `variable` name is `BACKEND_API_URL`, that's the documented happy path. No schema change.
- Add a tiny helper comment in `OcrPanel.tsx` noting that the selected row's `description` is treated as `BACKEND_API_URL`.

## 4. Out of scope

- No DB migration. The `variable` table already exposes `variable` + `description`.
- No changes to the Lovable AI or Webhook engines.
- No changes to history insert (still records `[Self-hosted (Docker)]` prefix + extracted text).

## 5. Verification

After implementation:
- `bun run build` (auto by harness) must pass.
- Manual smoke: pick a self-hosted variable, drop an image, confirm the UI locks during the request and the textarea renders `result_markdown` on success.
