# Python API Container — Integration Prompt (for AI Agent)

> **Role**: You are an AI agent tasked with building / modifying a Python OCR
> container so it integrates with the Lovable web app via the **`python-api`**
> engine (Self-hosted, Docker). Read this entire document before touching code.
> The HTTP contract below is non-negotiable — the web UI parses these exact
> fields. See also `docs/OCR_BACKEND_CONTRACT.md` for the shared base contract.

---

## 1. High-level Flow (what the user sees)

```
1. User selects engine = "Self-hosted" and picks a variable holding your endpoint URL
2. User drops a file in the explorer → left pane shows local preview
3. Right pane shows "Awaiting validation" + [Validate] button
4. User clicks Validate → browser POSTs the file directly to your container
   (browser-origin call — your container MUST enable CORS)
5. Container runs the Python OCR pipeline SYNCHRONOUSLY and returns one JSON body
6. The "Awaiting validation" card is replaced by a large 4-tab container:
     ┌──────────────────────────────────────────────────┐
     │ [HTML] [Markdown] [Files] [Stdout]              │
     │ ...content of the selected tab...                │
     └──────────────────────────────────────────────────┘
```

The 4 tabs map 1:1 to 4 fields in your JSON response. If a field is missing
the tab renders an empty state — other tabs still work.

---

## 2. HTTP Contract

### Request (sent by the browser)

```
POST  <your-endpoint>
Content-Type: multipart/form-data
```

| Field      | Type   | Description                                |
| ---------- | ------ | ------------------------------------------ |
| `file`     | binary | The uploaded file (image or PDF) — raw     |
| `fileName` | string | Original filename                          |
| `fileType` | string | MIME type                                  |
| `fileSize` | string | Size in bytes (as string)                  |

### Response (what the web app expects)

**Single JSON body, returned only after the OCR pipeline has finished.** No
202 / job-id / polling. The whole request is one synchronous round trip.

```json
{
  "status": "success",
  "markdown": "# Invoice 0007\n\n| Qty | Price |\n|---:|---:|\n| 1 | $211.85 |\n",
  "html": "<!doctype html><html>...full HTML produced by your pipeline...</html>",
  "files": [
    { "name": "page_1.png",  "url": "https://your-host/outputs/abc123/page_1.png",  "mime": "image/png",        "size": 184211 },
    { "name": "result.json", "url": "https://your-host/outputs/abc123/result.json", "mime": "application/json", "size": 1042   },
    { "name": "ocr.md",      "url": "https://your-host/outputs/abc123/ocr.md",      "mime": "text/markdown",    "size": 5320   }
  ],
  "stdout": "[2026-05-27 10:00:01] Loaded model...\n[2026-05-27 10:00:14] Done in 13.2s\n"
}
```

| Field      | Type     | Required | Maps to tab | Notes |
| ---------- | -------- | -------- | ----------- | ----- |
| `status`   | string   | yes      | —           | `"success"` or `"error"` |
| `markdown` | string   | yes      | **Markdown**| Rendered with react-markdown + GFM. Has a Copy button. |
| `html`     | string   | yes      | **HTML**    | Rendered inside a sandboxed `<iframe srcDoc>`. Must be a complete HTML document. |
| `files`    | array    | yes      | **Files**   | Each item is clickable; images preview inline, text/json/md loads via fetch, others get a Download button. URLs MUST be reachable from the user's browser. |
| `stdout`   | string   | yes      | **Stdout**  | Plain text. Rendered in a terminal-styled `<pre>`. |

`files[].url` must be **absolute** and reachable from the browser (CORS-enabled
for `GET` on the static route too). Relative paths will not resolve.

### Error response

```json
{
  "status": "error",
  "error": "Pipeline failed: page 3 could not be decoded",
  "stdout": "...captured stdout up to the failure (helps debugging)..."
}
```

The UI shows the error message and switches to Raw view — but if you still
include `stdout`, future versions may surface it in the Stdout tab.

---

## 3. Container Responsibilities

Per request, your container must:

1. Accept `multipart/form-data` on a `POST` route (e.g. `/ocr`).
2. Persist the upload to a **unique output directory** per request
   (e.g. `outputs/{uuid}/input.pdf`).
3. Run the OCR pipeline **synchronously** (block until done) — capture its
   `stdout` (and ideally `stderr`) to a buffer.
4. The pipeline is expected to write at least:
   - one `.html` file (rendered report)
   - one `.md` file (markdown text)
   - any intermediate `.png` / `.json` files
5. After the pipeline returns:
   - Read the `.html` → `response.html` (string)
   - Read the `.md` → `response.markdown` (string)
   - `glob` every file under the output dir → build `response.files[]` with
     **absolute public URLs** served by a static route
     (e.g. `/outputs/{uuid}/...`)
   - Put the captured pipeline stdout into `response.stdout`
6. Return one JSON response with the shape in §2. Then return — do not spawn
   background work that mutates the output dir after the response is sent
   (the browser already cached `files[]` URLs at that moment).

### Cleanup

Output dirs should be retained at least long enough for the user to browse the
Files tab. A TTL cleanup job (e.g. delete dirs older than 1 hour) is fine.

---

## 4. Response Timing (CRITICAL)

The web app calls your endpoint with `await fetch(...)` and blocks until you
respond. The whole pipeline must complete inside the HTTP timeout:

| Caller                | Timeout       |
| --------------------- | ------------- |
| Browser (this app)    | Browser default — typically no hard limit; user can wait |
| Reverse proxy / nginx | Whatever you configure (default 60s — raise it) |
| Cloudflare / CDN      | Often 100s — bypass with a direct origin URL if needed |

If your pipeline can exceed ~5 minutes, you must either:
- Stream a faster partial result, or
- Switch to a queue + polling architecture (this contract does **not** support it; the web UI would need to be updated).

---

## 5. CORS (required — browser calls directly)

The browser hits your container directly (so it can reach `localhost` or LAN
hosts). Your server **must** send these headers on `OPTIONS` and `POST`:

```
Access-Control-Allow-Origin:  *                  # or the Lovable origin
Access-Control-Allow-Methods: POST, OPTIONS, GET
Access-Control-Allow-Headers: Content-Type
```

The same CORS rules apply to your **static file route** (the URLs in
`files[]`), or the Files tab will fail to preview text files.

---

## 6. Connection Test (`/test` probe)

When the user clicks **Test connection**, the app sends:

```
POST <your-endpoint>
Content-Type: application/json

{ "ping": "lovable-ocr-test", "timestamp": "2026-05-27T00:00:00.000Z" }
```

Detect the `ping` field and short-circuit with any 2xx — do NOT run OCR.

---

## 7. Reference Implementation (FastAPI skeleton)

```python
import io, os, sys, uuid, glob, mimetypes, contextlib
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

OUTPUT_ROOT = Path("/data/outputs")
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
PUBLIC_BASE = os.environ["PUBLIC_BASE_URL"]   # e.g. https://ocr.example.com

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.mount("/outputs", StaticFiles(directory=OUTPUT_ROOT), name="outputs")


@app.post("/ocr")
async def ocr(request: Request, file: UploadFile | None = File(None)):
    # Connection-test probe
    if file is None:
        body = await request.body()
        if b'"ping"' in body and b'"lovable-ocr-test"' in body:
            return {"status": "ok"}
        return JSONResponse({"status": "error", "error": "No file"}, status_code=400)

    job_id = uuid.uuid4().hex
    job_dir = OUTPUT_ROOT / job_id
    job_dir.mkdir(parents=True)

    input_path = job_dir / file.filename
    input_path.write_bytes(await file.read())

    # Capture stdout from the pipeline
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            run_my_ocr_pipeline(str(input_path), str(job_dir))   # writes .html, .md, .png, .json
    except Exception as e:
        return {
            "status": "error",
            "error": f"Pipeline failed: {e}",
            "stdout": buf.getvalue(),
        }

    # Read primary outputs
    html_files = sorted(job_dir.glob("*.html"))
    md_files   = sorted(job_dir.glob("*.md"))
    html = html_files[0].read_text(encoding="utf-8") if html_files else ""
    markdown = md_files[0].read_text(encoding="utf-8") if md_files else ""

    # Enumerate every output file (with absolute URLs)
    files = []
    for p in sorted(job_dir.rglob("*")):
        if p.is_file():
            rel = p.relative_to(OUTPUT_ROOT).as_posix()
            files.append({
                "name": p.name,
                "url":  f"{PUBLIC_BASE}/outputs/{rel}",
                "mime": mimetypes.guess_type(p.name)[0] or "application/octet-stream",
                "size": p.stat().st_size,
            })

    return {
        "status":   "success",
        "markdown": markdown,
        "html":     html,
        "files":    files,
        "stdout":   buf.getvalue(),
    }
```

Run: `uvicorn main:app --host 0.0.0.0 --port 8000`

Docker Compose excerpt:

```yaml
services:
  ocr:
    build: .
    ports: ["8000:8000"]
    environment:
      PUBLIC_BASE_URL: "http://localhost:8000"   # must match what the browser will hit
    volumes:
      - ./data:/data
```

---

## 8. Testing Checklist (run before handing off)

- [ ] `POST /ocr` with `{"ping":"lovable-ocr-test",...}` returns 2xx in <1s
- [ ] `OPTIONS /ocr` returns CORS headers (preflight passes from a browser)
- [ ] `POST /ocr` with a sample image returns valid JSON with all 4 fields populated
- [ ] `POST /ocr` with a sample PDF returns valid JSON
- [ ] `GET` on every URL in `files[]` returns 200 with correct `Content-Type` and CORS
- [ ] Markdown tab renders tables / headings correctly (use GFM)
- [ ] HTML tab renders inside an iframe (no top-level scripts needed since `sandbox=""`)
- [ ] Error path: force a pipeline failure → response is `{status:"error", error, stdout}`
- [ ] Pipeline + response time ≤ proxy timeout (raise nginx `proxy_read_timeout` if needed)

---

## 9. Out of Scope (do NOT do these)

- Do **not** return `202 Accepted` with a job ID — the UI does not poll.
- Do **not** stream chunked responses — the UI parses one JSON body.
- Do **not** use relative `files[].url` — they will not resolve in the browser.
- Do **not** spawn background work that mutates the output dir after responding.
- Do **not** require auth headers — the UI sends none. Use network-level controls
  (VPN / IP allow-list) or extend the UI separately.
