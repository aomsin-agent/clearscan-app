/**
 * Browser-side OCR call for self-hosted endpoints (e.g. http://localhost:8000/ocr
 * running in a local Docker container that wraps a Python OCR pipeline).
 *
 * Runs from the browser so the request actually originates on the user's
 * machine and can reach `localhost`. The user's self-hosted server MUST send
 * permissive CORS headers (Access-Control-Allow-Origin: * or the Lovable
 * preview origin) for this to work.
 *
 * Wire contract:
 *   Request  → multipart/form-data, field `file` (binary), plus `fileName`,
 *              `fileType`, `fileSize` for convenience
 *   Response → JSON: { "status": "success", "markdown": "..." }
 *              (Legacy `result_markdown` and other shapes are also accepted —
 *              see extractMarkdown() below.)
 */
function extractMarkdown(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    if (payload.length === 0) return "";
    return extractMarkdown(payload[0]);
  }
  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.markdown === "string") return obj.markdown;
    if (typeof obj.result_markdown === "string") return obj.result_markdown;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.result === "string") return obj.result;
    if (typeof obj.data === "string") return obj.data;
    if (typeof obj.output === "string") return obj.output;
    for (const key of ["data", "output", "json", "result"] as const) {
      const nested = obj[key];
      if (nested && typeof nested === "object") {
        const inner = extractMarkdown(nested);
        if (inner) return inner;
      }
    }
  }
  return JSON.stringify(payload, null, 2);
}

export async function runSelfHostedOcr(params: {
  url: string;
  file: File;
}): Promise<{ text: string }> {
  if (!/^https?:\/\//i.test(params.url)) {
    throw new Error("BACKEND_API_URL must start with http(s)://");
  }

  const form = new FormData();
  form.append("file", params.file, params.file.name);
  form.append("fileName", params.file.name);
  form.append("fileType", params.file.type || "application/octet-stream");
  form.append("fileSize", String(params.file.size));

  let res: Response;
  try {
    res = await fetch(params.url, { method: "POST", body: form });
  } catch {
    throw new Error(
      `Could not reach ${params.url}. Check that the container is running and CORS is enabled for this origin.`,
    );
  }

  if (!res.ok) {
    throw new Error(`Self-hosted endpoint returned ${res.status}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return { text: await res.text() };
  }

  const json = (await res.json().catch(() => null)) as unknown;

  // Honor explicit non-success status
  if (
    json &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    typeof (json as Record<string, unknown>).status === "string" &&
    (json as Record<string, unknown>).status !== "success"
  ) {
    const errMsg =
      (json as Record<string, unknown>).error ??
      (json as Record<string, unknown>).message ??
      "Backend reported a non-success status";
    throw new Error(String(errMsg));
  }

  const text = extractMarkdown(json);
  if (!text) throw new Error("Backend response did not include a markdown field");
  return { text };
}

/**
 * Lightweight reachability test for a self-hosted endpoint. Sends a tiny
 * JSON probe (no file, no OCR) from the browser so it can reach localhost.
 * Returns ok/status/latency — never throws.
 */
export async function testSelfHostedEndpoint(params: {
  url: string;
}): Promise<{ ok: boolean; status: number; latencyMs: number; error: string | null }> {
  if (!/^https?:\/\//i.test(params.url)) {
    return { ok: false, status: 0, latencyMs: 0, error: "URL must start with http(s)://" };
  }
  const started = Date.now();
  try {
    const res = await fetch(params.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ping: "lovable-ocr-test",
        timestamp: new Date().toISOString(),
      }),
    });
    const latencyMs = Date.now() - started;
    return {
      ok: res.ok,
      status: res.status,
      latencyMs,
      error: res.ok ? null : `Endpoint returned ${res.status}`,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: `Could not reach ${params.url}. Check the container is running and CORS is enabled.`,
    };
  }
}
