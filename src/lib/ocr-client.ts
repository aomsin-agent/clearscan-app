/**
 * Browser-side OCR call for self-hosted endpoints (e.g. http://localhost:8000/ocr
 * running in a local Docker container). Runs from the browser so the request
 * actually originates on the user's machine and can reach localhost.
 *
 * The user's self-hosted server MUST send permissive CORS headers
 * (Access-Control-Allow-Origin: * or the Lovable preview origin) for this to work.
 */
export async function runSelfHostedOcr(params: {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileBase64: string;
  images: string[];
}): Promise<{ text: string }> {
  const { url, ...payload } = params;
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Endpoint URL must start with http(s)://");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new Error(
      `Could not reach ${url}. Check that the container is running and CORS is enabled.`,
    );
  }

  if (!res.ok) {
    throw new Error(`Self-hosted endpoint returned ${res.status}`);
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
}
