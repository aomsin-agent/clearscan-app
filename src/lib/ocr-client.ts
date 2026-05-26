/**
 * Browser-side OCR call for self-hosted endpoints (e.g. http://localhost:8000/ocr
 * running in a local Docker container that wraps a Python OCR pipeline).
 *
 * Runs from the browser so the request actually originates on the user's
 * machine and can reach `localhost`. The user's self-hosted server MUST send
 * permissive CORS headers (Access-Control-Allow-Origin: * or the Lovable
 * preview origin) for this to work.
 *
 * Wire contract with the Python backend:
 *   Request:  multipart/form-data, single field `file`
 *   Response: { "status": "success", "result_markdown": "..." }
 */
export async function runSelfHostedOcr(params: {
  /** BACKEND_API_URL pulled from the `variable` table row selected by the user. */
  url: string;
  /** Raw File from the dropzone — sent as-is, no base64 round-trip. */
  file: File;
}): Promise<{ text: string }> {
  // Intention: validate the endpoint up-front so we fail fast before
  // touching the network or locking the UI on a clearly-bad URL.
  if (!/^https?:\/\//i.test(params.url)) {
    throw new Error("BACKEND_API_URL must start with http(s)://");
  }

  // Intention: build a multipart/form-data payload so the Python container
  // can stream the file via standard form parsers (FastAPI UploadFile,
  // Flask `request.files`, etc.) instead of decoding base64 by hand.
  // We deliberately do NOT set the Content-Type header — the browser
  // appends the correct multipart boundary automatically when the body
  // is a FormData instance.
  const form = new FormData();
  form.append("file", params.file, params.file.name);

  // Intention: hold the HTTP connection open with `await` until the
  // Python container finishes its synchronous OCR pipeline and writes
  // back the JSON body. The UI lock around this call (see OcrPanel)
  // prevents the user from firing duplicate requests during the wait.
  let res: Response;
  try {
    res = await fetch(params.url, {
      method: "POST",
      body: form,
    });
  } catch {
    // Network-level failure (DNS, connection refused, CORS preflight, …).
    throw new Error(
      `Could not reach ${params.url}. Check that the container is running and CORS is enabled for this origin.`,
    );
  }

  if (!res.ok) {
    throw new Error(`Self-hosted endpoint returned ${res.status}`);
  }

  // Intention: documented contract with the Python backend is
  //   { status: "success", result_markdown: "..." }
  // Anything else is treated as a failure and surfaced to the user
  // rather than silently rendering garbage in the extracted-text panel.
  const json = (await res.json().catch(() => null)) as
    | { status?: string; result_markdown?: string; error?: string }
    | null;

  if (
    !json ||
    json.status !== "success" ||
    typeof json.result_markdown !== "string"
  ) {
    throw new Error(
      json?.error ??
        "Self-hosted backend did not return a successful result_markdown payload",
    );
  }

  return { text: json.result_markdown };
}
