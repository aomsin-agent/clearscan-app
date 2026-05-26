# OCR Backend Contract

This document describes the **HTTP contract** that any custom OCR backend
(Webhook or self-hosted Python API) must implement to integrate with this app.

The contract is identical for both engines — only the call origin differs:

| Engine          | Who calls your endpoint?           | CORS required? |
| --------------- | ---------------------------------- | -------------- |
| **Webhook**     | The app's server (TanStack Start)  | ❌ No          |
| **Self-hosted** | The user's browser directly        | ✅ Yes         |

---

## 1. Request

```
POST <your-endpoint>
Content-Type: multipart/form-data
```

| Field      | Type   | Description                                     |
| ---------- | ------ | ----------------------------------------------- |
| `file`     | binary | The original file (image or PDF). **No base64.** |
| `fileName` | string | Original filename, e.g. `invoice.pdf`           |
| `fileType` | string | MIME type, e.g. `application/pdf`               |
| `fileSize` | string | Size in bytes, e.g. `39945`                     |

The body is **standard multipart/form-data** — same as an HTML `<form enctype="multipart/form-data">` upload. Every web framework parses it natively.

---

## 2. Response

Return **JSON** with this shape:

```json
{
  "status": "success",
  "markdown": "# Invoice\n\nInvoice number **Q0MAKVCZ-0007**\n\n| Qty | Unit price | Amount |\n|----:|-----------:|-------:|\n| 1   | $211.85    | $211.85 |\n"
}
```

| Field       | Type   | Required | Notes                                                |
| ----------- | ------ | -------- | ---------------------------------------------------- |
| `status`    | string | yes      | `"success"` on success. Anything else = treated as error. |
| `markdown`  | string | yes      | The extracted text as **Markdown**. Rendered directly on the page. |
| `error`     | string | on error | Human-readable error message (used when `status != "success"`). |

### Why Markdown?

The result is rendered with `react-markdown` + `remark-gfm`, so you can return:

- **Headings** (`#`, `##`)
- **Bold/italic** (`**bold**`, `*italic*`)
- **Lists** (`- item`, `1. item`)
- **Tables** (GitHub-flavored)
- **Code blocks** (` ``` `)
- **Links** (`[text](url)`)
- Plain text also works — it just renders as a paragraph.

### Error response

If OCR fails on your side, respond with HTTP 200 + this body so the user sees a clean error:

```json
{
  "status": "error",
  "error": "Could not parse PDF: file is encrypted"
}
```

Returning a non-2xx HTTP status also works — the app will show `Webhook returned <code>`.

### Legacy / alternate fields (accepted but discouraged)

For backward compatibility, the app also unwraps these:

- `result_markdown` (legacy Python API field)
- `text`, `result`, `data`, `output` (string)
- `[{...}]` (n8n-style array — first element is unwrapped)
- Nested wrappers: `{ "data": { "markdown": "..." } }`, `{ "json": {...} }`
- Plain text body (when `Content-Type` is not JSON)

**New backends should always return `{ "status": "success", "markdown": "..." }`.**

---

## 3. Implementation examples

### Python — FastAPI

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Required only for self-hosted mode (browser calls directly)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    raw_bytes = await file.read()
    try:
        markdown = run_my_ocr_pipeline(raw_bytes, file.filename)
        return {"status": "success", "markdown": markdown}
    except Exception as e:
        return {"status": "error", "error": str(e)}
```

Run with: `uvicorn main:app --host 0.0.0.0 --port 8000`

### Python — Flask

```python
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # only needed for self-hosted

@app.post("/ocr")
def ocr():
    f = request.files["file"]
    try:
        markdown = run_my_ocr_pipeline(f.read(), f.filename)
        return jsonify(status="success", markdown=markdown)
    except Exception as e:
        return jsonify(status="error", error=str(e))
```

### Node.js — Express + Multer

```js
import express from "express";
import multer from "multer";
const app = express();
const upload = multer();

app.post("/ocr", upload.single("file"), async (req, res) => {
  try {
    const markdown = await runMyOcrPipeline(req.file.buffer, req.file.originalname);
    res.json({ status: "success", markdown });
  } catch (e) {
    res.json({ status: "error", error: e.message });
  }
});

app.listen(8000);
```

### n8n (Webhook node)

1. **Webhook node** — Method: `POST`, Response Mode: `When Last Node Finishes`
2. Process `{{ $binary.file }}` through your OCR step
3. **Respond to Webhook** node — body:
   ```json
   {
     "status": "success",
     "markdown": "={{ $json.extractedText }}"
   }
   ```

---

## 4. Connection test (`/test`)

When the user clicks **Test connection**, the app sends a tiny probe:

```
POST <your-endpoint>
Content-Type: application/json

{ "ping": "lovable-ocr-test", "timestamp": "2026-01-01T00:00:00.000Z" }
```

Your backend should respond with any 2xx status. The test does **not** trigger OCR — it just confirms the endpoint is reachable.

Most backends pass automatically because their OCR route handles `POST`. If you want to be explicit, detect the `ping` field and short-circuit:

```python
@app.post("/ocr")
async def ocr(request: Request, file: UploadFile = File(None)):
    if file is None:
        return {"status": "ok"}  # ping response
    # ... normal OCR flow
```

---

## 5. CORS (self-hosted only)

When the engine is **self-hosted**, the user's browser calls your endpoint directly (so it can reach `localhost`). Your server **must** allow:

- Origin: the Lovable preview/production origin (or `*`)
- Methods: `POST`, `OPTIONS`
- Headers: `Content-Type`

Without CORS, the test will fail with `Could not reach <url>`.

---

## 6. Quick checklist

- [ ] Endpoint accepts `POST multipart/form-data`
- [ ] Reads `file` field as raw bytes (no base64 decode needed)
- [ ] Returns `{ "status": "success", "markdown": "..." }` on success
- [ ] Returns `{ "status": "error", "error": "..." }` on failure
- [ ] (Self-hosted only) CORS is enabled
- [ ] Endpoint URL is saved as a `variable` row in the app with the matching `category` (`webhook` or `python-api`)
