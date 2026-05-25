# แผน: เพิ่มตัวเลือกเครื่องมือ OCR 3 แบบ

## 1) UI: ตัวเลือก OCR Engine ในแท็บ OCR
แก้ `src/components/ocr/OcrPanel.tsx`:
- เพิ่มแถบเลือก engine (Tabs/SegmentedControl หรือ RadioGroup) เหนือ dropzone:
  1. **Lovable AI Gateway** (Gemini Flash) — ค่าเริ่มต้น
  2. **Webhook URL** — ส่งไฟล์ผ่าน webhook ภายนอก
  3. **Self-hosted (Docker)** — ส่งไป HTTP endpoint ภายใน (เช่น `http://localhost:8000`)
- เมื่อเลือก #2 หรือ #3 → แสดง `<Select>` dropdown แสดงรายการจากตาราง `variable` (key = `variable`, value = `description` ที่จะใช้เป็น URL)
  - โหลด list ครั้งแรกตอน mount ผ่าน `supabase.from("variable").select(...)` (ใช้ module cache ร่วมกับ VariablePanel)
  - มีปุ่ม Refresh เล็ก ๆ และลิงก์ "Manage variables" ที่นำไปแท็บ Variables
  - แสดง helper text อธิบายว่าใช้ `description` ของตัวแปรเป็น URL ปลายทาง
- ปุ่ม Browse/Drop จะ disabled จนกว่าจะเลือก variable (สำหรับ #2/#3)

## 2) Flow การประมวลผลแยกตาม engine
แก้/เพิ่มใน `src/lib/ocr.functions.ts`:
- คง `runOcr` สำหรับ Lovable Gateway เดิม
- เพิ่ม `runWebhookOcr({ url, fileName, fileType, fileSize, fileBase64 })`:
  - server function (`createServerFn`, POST) — รับ URL + ไฟล์ base64
  - validate URL (ต้องเป็น http/https)
  - `fetch(url, { method: "POST", body: JSON.stringify({...}) })` แล้วรอ response
  - คาดหวัง response รูปแบบ `{ text: string }` (ถ้าเป็น plain text ก็ใช้เลย)
  - return `{ text }`
- เพิ่ม `runSelfHostedOcr({ url, ... })`:
  - ทำงานเหมือน webhook แต่ความหมายคือ endpoint ภายใน (เช่น `http://localhost:8000/ocr`)
  - หมายเหตุสำคัญ: server function รันบน Cloudflare Worker — `http://localhost` จาก server จะเข้าถึงเครื่องผู้ใช้ไม่ได้  
    → จึงให้ option นี้ยิงจาก **ฝั่ง client** โดยตรงผ่าน `fetch()` ในเบราว์เซอร์ (ผู้ใช้ต้องรัน docker บนเครื่องตัวเองและเปิด CORS)
  - ใส่ helper `runSelfHostedOcrClient()` ใน `src/lib/ocr-client.ts` ที่ทำหน้านี้ใน browser
- ใน `OcrPanel.handleFile()`:
  - แตก switch ตาม engine ที่เลือก เรียกฟังก์ชันที่ถูกต้อง
  - แสดง spinner เดิมระหว่างรอ; แสดง error ที่ชัดเจน (network/CORS/timeout)
  - บันทึก `ocr_history` เหมือนเดิม พร้อมเพิ่ม note ของ engine ใน `extracted_text` (หรือใช้ field ที่มีอยู่)

## 3) ความเข้ากันได้กับโครงสร้างข้อมูล
- ใช้ตาราง `variable` ที่มีอยู่: `variable` = ชื่อ label, `description` = ค่าจริง (URL endpoint)
- เพิ่ม mock 2 แถวผ่าน migration เพื่อให้มีตัวอย่างทดสอบทันที:
  1. `WEBHOOK_TEST` — `https://webhook.site/your-test-id` (placeholder ให้ผู้ใช้แก้เองได้ภายหลัง)
  2. `LOCAL_DOCKER` — `http://localhost:8000/ocr`

## 4) ผลลัพธ์ที่คาดหวังจาก endpoint ภายนอก
ทั้ง webhook และ self-hosted คาดหวัง JSON response:
```json
{ "text": "extracted text here" }
```
ถ้า response เป็น plain text ก็จะนำมาแสดงตรง ๆ (พยายาม parse JSON ก่อน, ตกลง fallback เป็น text)

---

## ไฟล์ที่จะแก้/เพิ่ม
- `src/components/ocr/OcrPanel.tsx` — UI เลือก engine + variable dropdown + dispatch ตาม engine
- `src/components/ocr/EngineSelector.tsx` *(ใหม่)* — ส่วนเลือก engine + variable
- `src/lib/ocr.functions.ts` — เพิ่ม `runWebhookOcr` (server-side fetch)
- `src/lib/ocr-client.ts` *(ใหม่)* — `runSelfHostedOcrClient` (browser-side fetch ไปยัง localhost)
- migration เพิ่ม mock 2 rows ใน `variable`

ไม่ต้องเปลี่ยน schema, RLS, หรือ secret — endpoint URL เก็บอยู่ใน `description` ของตัวแปร
