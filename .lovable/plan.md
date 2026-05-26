## Plan

### 1. Add "Test connection" button next to the endpoint dropdown

In `src/components/ocr/OcrPanel.tsx`, inside the `needsVariable` block (engine = `webhook` or `self-hosted`), when a variable is selected and `selectedVar.description` (the URL) is valid, render a new **Test** button below the "Current Value" panel.

Behavior:
- Disabled until a variable with a URL is selected, and while a test or OCR submit is in flight.
- On click, sends a lightweight POST to the URL — **no file, no OCR** — just a probe payload like:
  ```json
  { "ping": "lovable-ocr-test", "timestamp": "<ISO>" }
  ```
- Shows inline status (idle / testing / success / failed) with latency in ms and the HTTP status code. Also surfaces a toast.
- Treats any 2xx as success. Non-2xx and network/CORS errors are shown as failure with the error message.

### 2. Where the test call runs

- **Webhook**: call via a new server function `testWebhook` in `src/lib/ocr.functions.ts` (avoids browser CORS, same as `runWebhookOcr`).
- **Self-hosted (python-api)**: call from the browser via a new helper `testSelfHostedOcr` in `src/lib/ocr-client.ts` (must run client-side to reach `localhost`, same as `runSelfHostedOcr`). Network/CORS failures are reported as "Could not reach …".

Neither path performs OCR or uploads any file — they only verify reachability.

### 3. UI details

- Small inline result row under the "Current Value" card: colored dot + status text + latency, mirroring the existing visual language.
- Button uses `variant="outline"` with a `Plug`/`Activity` lucide icon and shows a spinner while testing.
- No changes to variable management, engine selector, or OCR flow.

---

## Answer: เครดิต Lovable AI สำหรับ OCR

โหมด **Lovable AI** ในหน้านี้เรียก Lovable AI Gateway (`google/gemini-2.5-flash`) ผ่าน `runOcr` ใน `src/lib/ocr.functions.ts` โดยใช้ `LOVABLE_API_KEY`

เครดิตที่หักคือ **AI credits** (ไม่ใช่ message credits ของแชต Lovable) คิดตาม **usage ของ Gemini Flash** ที่ Gateway เรียกให้:
- input tokens = prompt + รูปภาพที่ส่งไป (ทุกหน้าที่ render เป็น data URL)
- output tokens = ข้อความที่โมเดลส่งกลับ

ดังนั้นไฟล์ยิ่งหลายหน้า/รูปยิ่งใหญ่ → token รูปยิ่งเยอะ → ยิ่งกินเครดิต ส่วนโหมด Webhook และ Self-hosted **ไม่หัก** AI credits เพราะไม่ผ่าน Gateway

ยอด AI balance ดูได้ที่ Settings → Cloud & AI balance (ทุก workspace มี $1 ฟรีต่อเดือนจนถึงต้นปี 2026)
