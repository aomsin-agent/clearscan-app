import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  images: z.array(z.string().min(20)).min(1).max(20),
});

/**
 * Calls Lovable AI Gateway (Gemini Flash vision) to OCR one or more images.
 * Each image is a data URL like "data:image/png;base64,...."
 */
export const runOcr = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      {
        type: "text",
        text: "Extract ALL readable text from the following image(s) using OCR. Preserve line breaks and reading order. Return the result as clean Markdown (use headings, lists, and tables where appropriate). If a page has no text, output an empty line.",
      },
      ...data.images.map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      })),
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
      }),
    });

    if (res.status === 429) {
      throw new Error("Rate limit reached. Please wait a moment and try again.");
    }
    if (res.status === 402) {
      throw new Error("AI credits exhausted. Please top up your Lovable workspace.");
    }
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI gateway error", res.status, txt);
      throw new Error(`OCR failed (${res.status})`);
    }

    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    return { text };
  });

/**
 * Forwards a raw file to a user-supplied webhook URL using multipart/form-data
 * (NO base64). Runs server-side so the webhook host can be any URL without
 * worrying about browser CORS.
 *
 * Request contract  → multipart/form-data with fields:
 *   file       (binary) — the original file
 *   fileName   (string)
 *   fileType   (string, MIME)
 *   fileSize   (string, bytes)
 *
 * Response contract → JSON: { "status": "success", "markdown": "..." }
 * (Legacy fields `result_markdown`, `text`, `result`, `data`, and plain-text
 * bodies are still accepted — see extractMarkdown() below.)
 */
const WebhookSchema = z.object({
  url: z.string().url(),
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  // Server function RPC cannot transport File/Blob directly, so the browser
  // base64-encodes the file ONCE just to cross the RPC boundary. We decode
  // it server-side and forward the raw bytes as multipart — the webhook
  // never sees base64.
  fileBase64: z.string().min(20),
});

function base64ToBytes(dataUrlOrBase64: string): Uint8Array {
  const b64 = dataUrlOrBase64.includes(",")
    ? dataUrlOrBase64.split(",")[1]
    : dataUrlOrBase64;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Liberal extractor that turns whatever the user's backend returned into a
 * markdown string. Order of precedence matches the documented contract first,
 * then common variations from n8n / generic webhooks / older deployments.
 */
function extractMarkdown(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;

  // Unwrap n8n-style array responses: [{...}]
  if (Array.isArray(payload)) {
    if (payload.length === 0) return "";
    return extractMarkdown(payload[0]);
  }

  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    // Documented contract first
    if (typeof obj.markdown === "string") return obj.markdown;
    if (typeof obj.result_markdown === "string") return obj.result_markdown;
    // Common alternates
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.result === "string") return obj.result;
    if (typeof obj.data === "string") return obj.data;
    if (typeof obj.output === "string") return obj.output;
    // Nested wrappers (n8n {json: {...}}, {data: {markdown: ...}}, etc.)
    for (const key of ["data", "output", "json", "result"] as const) {
      const nested = obj[key];
      if (nested && typeof nested === "object") {
        const inner = extractMarkdown(nested);
        if (inner) return inner;
      }
    }
  }
  // Last resort — stringify so the user can at least see what came back.
  return JSON.stringify(payload, null, 2);
}

export const runWebhookOcr = createServerFn({ method: "POST" })
  .inputValidator((input) => WebhookSchema.parse(input))
  .handler(async ({ data }) => {
    if (!/^https?:\/\//i.test(data.url)) {
      throw new Error("Webhook URL must start with http(s)://");
    }

    const bytes = base64ToBytes(data.fileBase64);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: data.fileType || "application/octet-stream" });

    const form = new FormData();
    form.append("file", blob, data.fileName);
    form.append("fileName", data.fileName);
    form.append("fileType", data.fileType);
    form.append("fileSize", String(data.fileSize));

    const res = await fetch(data.url, { method: "POST", body: form });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Webhook error", res.status, txt);
      throw new Error(`Webhook returned ${res.status}`);
    }

    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const json = await res.json();
      // If response declares failure explicitly, surface it instead of
      // silently rendering the error object.
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
          "Webhook reported a non-success status";
        throw new Error(String(errMsg));
      }
      return { text: extractMarkdown(json) };
    }
    return { text: await res.text() };
  });

/**
 * Lightweight reachability test for a user-supplied webhook URL.
 * Sends a tiny JSON probe (no file, no OCR) and reports status + latency.
 * Runs server-side to bypass browser CORS.
 */
const TestSchema = z.object({
  url: z.string().url(),
});

export const testWebhook = createServerFn({ method: "POST" })
  .inputValidator((input) => TestSchema.parse(input))
  .handler(async ({ data }) => {
    if (!/^https?:\/\//i.test(data.url)) {
      return { ok: false, status: 0, latencyMs: 0, error: "URL must start with http(s)://" };
    }
    const started = Date.now();
    try {
      const res = await fetch(data.url, {
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
    } catch (e) {
      return {
        ok: false,
        status: 0,
        latencyMs: Date.now() - started,
        error: e instanceof Error ? e.message : "Network error",
      };
    }
  });
