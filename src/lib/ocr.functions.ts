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
        text: "Extract ALL readable text from the following image(s) using OCR. Preserve line breaks and reading order. Return ONLY the raw extracted text, with no extra commentary, no markdown fences, no headers. If a page has no text, output an empty line.",
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
 * Sends file payload to a user-supplied webhook URL and waits for `{ text }`
 * (or plain text body) response. Runs server-side to avoid browser CORS limits.
 */
const WebhookSchema = z.object({
  url: z.string().url(),
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  fileBase64: z.string().min(20),
  images: z.array(z.string().min(20)).min(1).max(20),
});

export const runWebhookOcr = createServerFn({ method: "POST" })
  .inputValidator((input) => WebhookSchema.parse(input))
  .handler(async ({ data }) => {
    if (!/^https?:\/\//i.test(data.url)) {
      throw new Error("Webhook URL must start with http(s)://");
    }

    const res = await fetch(data.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        fileBase64: data.fileBase64,
        images: data.images,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Webhook error", res.status, txt);
      throw new Error(`Webhook returned ${res.status}`);
    }

    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const json = await res.json();
      const text: string =
        typeof json === "string"
          ? json
          : (json?.text ?? json?.result ?? json?.data ?? JSON.stringify(json));
      return { text };
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
