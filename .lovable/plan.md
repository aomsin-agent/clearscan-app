## เป้าหมาย

แยกขั้นตอน **อัปโหลดไฟล์** ออกจาก **ส่งไปยัง endpoint** สำหรับ engine `webhook` และ `selfhosted` (python-api) — ผู้ใช้ต้องกดปุ่ม **Validate** เพื่อสั่งส่งเอง พร้อมจัดการการแสดงผล response ให้ครอบคลุมทุกกรณี (success, format ไม่ตรง, error)

> Engine `lovable` (AI Gateway) คงพฤติกรรมเดิม — อัปแล้วประมวลผลทันที

---

## พฤติกรรมใหม่

### 1. ขั้นตอนการอัปไฟล์ (webhook / python-api)

ปัจจุบัน: drop ไฟล์ → ส่ง webhook ทันที
ใหม่:
1. drop ไฟล์ → แสดง preview (รูป/PDF) ใน card ซ้าย, card ขวาแสดงสถานะ **"Ready to validate"** + ปุ่ม **Validate** (primary)
2. ผู้ใช้กด **Validate** → เริ่มส่งไป endpoint, ปุ่มเปลี่ยนเป็น `Validating…` + spinner, lock UI
3. ได้ response → แสดงผลตามกรณี (ด้านล่าง)
4. ปุ่ม **Validate again** (secondary) ให้กดซ้ำได้โดยไม่ต้องอัปไฟล์ใหม่

### 2. การแสดงผล response (สามกรณี)

แยก state ใหม่: `responseRaw` (string ดิบของ response เสมอ) + `responseKind` = `success | bad-format | error`

| กรณี | Preview (markdown) | Raw |
|---|---|---|
| **success** — มี `{status:"success", markdown:"..."}` | render markdown ตามปกติ | response เต็ม (JSON.stringify pretty) |
| **bad-format** — endpoint ตอบกลับ 2xx แต่ไม่ตรง contract (ไม่มี markdown / status ไม่ใช่ success / parse JSON ไม่ได้) | กล่อง warning: *"Webhook received, but response format is invalid. Expected `{ status: \"success\", markdown: \"…\" }`."* + ลิงก์ไปที่ docs | response ดิบทั้งหมดที่ได้กลับมา (text/JSON) — ไม่ตัดทอน |
| **error** — network fail / non-2xx / fetch throw | กล่อง error สีแดง: *"{error message}"* (เช่น `Webhook returned 500`, `Could not reach <url>`) | response body ถ้ามี (เช่น HTML error page), หรือข้อความ error ถ้าไม่มี body |

### 3. การเปลี่ยนแปลงด้าน server/client

แก้ `runWebhookOcr` (server fn) และ `runSelfHostedOcr` (browser) ให้คืน shape เดียวกัน:

```ts
{
  kind: "success" | "bad-format" | "error",
  markdown: string,   // ใช้กับ kind=success เท่านั้น
  raw: string,        // response body ทุกกรณี (อาจว่างเมื่อ network fail)
  message: string,    // ใช้กับ bad-format / error สำหรับแสดงใน Preview
  httpStatus: number, // 0 = network fail
}
```

- ห้าม `throw` ภายในเมื่อ format ไม่ตรง — ส่ง `kind:"bad-format"` พร้อม `raw` กลับมาเสมอ
- ยังคงเก็บ `extractMarkdown()` เดิมไว้ใช้กับ legacy field (`result_markdown`, `text`, n8n array, ฯลฯ) — ถ้าเจอ legacy ที่ตีความได้ ถือเป็น `success`
- ถ้า `status` มีค่าและไม่เท่ากับ `"success"` → `kind:"error"` พร้อม `message` จาก field `error`/`message`

### 4. การเปลี่ยนแปลง UI (OcrPanel.tsx)

- เพิ่ม state: `validated: boolean`, `responseRaw: string`, `responseKind`, `responseMessage`
- แยก `handleSubmit` → `loadFile(f)` (แค่ preview + meta) และ `runValidate()` (ส่ง endpoint จริง)
- `onDrop` สำหรับ engine non-lovable: เรียก `loadFile` เท่านั้น
- `onDrop` สำหรับ engine lovable: คงเดิม (auto extract)
- ช่อง "Extracted text" ปรับเป็น:
  - **ก่อน validate**: ปุ่ม `Validate` ใหญ่กลาง card + คำอธิบายสั้น
  - **กำลังส่ง**: spinner เดิม
  - **success**: Preview/Raw toggle เดิม
  - **bad-format**: Preview แสดง warning card, Raw แสดง body
  - **error**: Preview แสดง error card สีแดง, Raw แสดง body/ข้อความ
- ปุ่ม `Validate again` ปรากฏใต้ผลลัพธ์เมื่อ validate แล้ว (ทุก kind)
- บันทึก history เฉพาะกรณี `success`

---

## ไฟล์ที่แก้

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/ocr.functions.ts` | `runWebhookOcr` คืน shape ใหม่ `{kind, markdown, raw, message, httpStatus}`; ไม่ throw บน bad-format/non-2xx |
| `src/lib/ocr-client.ts` | `runSelfHostedOcr` คืน shape เดียวกัน |
| `src/components/ocr/OcrPanel.tsx` | แยก load/validate, state ใหม่, UI สำหรับ Validate button + 3 กรณี response |

ไม่แก้: docs, schema, variable panel, lovable engine path

---

## ตัวอย่าง flow (webhook)

```text
[Drop file]
   ↓
[Preview]                [Extract text]
 invoice.pdf              ┌───────────────────┐
 page 1/2                 │  Ready to send    │
                          │  ┌─────────────┐  │
                          │  │  Validate   │  │
                          │  └─────────────┘  │
                          └───────────────────┘
   ↓ click Validate
[Preview]                [Extract text]
 invoice.pdf              ⠋ Sending to webhook…
   ↓ response
[Preview]                [Extract text]   [Preview|Raw]
 invoice.pdf              # Invoice
                          | Qty | Price |
                          [ Validate again ]
```
