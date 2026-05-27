## เป้าหมาย

ลบ engine **Lovable AI** (Gemini Flash vision OCR) ทั้งหมดออกจากแอป — เหลือเฉพาะ **Webhook** และ **Self-hosted (python-api)** ที่ใช้ flow validate

---

## รายการที่ลบ / แก้

### 1. `src/lib/ocr.functions.ts`
- ลบ `runOcr` server function ทั้งก้อน (รวม `InputSchema` ของมัน)
- ลบ import `z` ถ้าไม่มี schema อื่นใช้ (ยังใช้กับ `WebhookSchema` / `TestSchema` → คงไว้)
- คง `runWebhookOcr` และ `testWebhook` ไว้ตามเดิม

### 2. `src/components/ocr/OcrPanel.tsx`
- ลบ type member `"lovable"` จาก `type Engine`
- ลบ key `lovable` จาก `ENGINE_CATEGORY` และ `ENGINE_LABEL`
- ลบ import `runOcr` และ `useServerFn(runOcr)` (ตัวแปร `runOcrFn`)
- ลบ option "Lovable AI" จาก `EngineSelector` (grid เหลือ 2 ปุ่ม: Webhook, Self-hosted) — ปรับ `sm:grid-cols-3` → `sm:grid-cols-2`
- ลบ ฟังก์ชัน `runLovableExtract` ทั้งก้อน
- เปลี่ยน default `useState<Engine>("lovable")` → `useState<Engine>("webhook")`
- ใน `onDrop`: ลบสาย `if (engine === "lovable") runLovableExtract(...)` — เหลือเฉพาะ `loadFile(...)`
- ใน `needsVariable`: `engine !== "lovable"` ไม่จำเป็นแล้ว (engine ทั้งหมดต้อง variable) → `const needsVariable = true;`
- ลบเงื่อนไข `engine === "lovable"` / `engine !== "lovable"` ทุกจุดใน JSX:
  - tooltip ใน NoticeBanner (เหลือเฉพาะ webhook / selfhosted)
  - spinner message (ลบเคส lovable)
  - "Pre-validate state" — เดิม `engine !== "lovable"` → ลบเงื่อนไขนี้ (เป็น default)
  - "Validate again" button — เดิม `engine !== "lovable"` → ลบเงื่อนไขนี้
- ลบ import `Sparkles` ถ้าไม่ได้ใช้แล้ว (เช็คใน NoticeBanner ที่ใช้ icon เดียวกัน — เปลี่ยนเป็น `Webhook` หรือ `Server` ตาม engine ปัจจุบัน หรือคง Sparkles เป็น decoration ถ้ายังใช้)

### 3. ไม่แตะ
- `LOVABLE_API_KEY` secret — ปล่อยไว้ (อาจมีฟีเจอร์อื่นใช้ในอนาคต) ไม่ลบ secret อัตโนมัติ
- `docs/OCR_BACKEND_CONTRACT.md` — ไม่ได้กล่าวถึง Lovable AI
- `docs/python-api-container-process.md` — ไม่ได้กล่าวถึง Lovable AI
- ping string `"lovable-ocr-test"` — เป็นแค่ identifier, ไม่เกี่ยวกับ Lovable AI engine

---

## การตรวจสอบหลังลบ

หลังแก้แล้วจะรัน:
```
rg -n "lovable|runOcr|runLovableExtract|Lovable AI|gemini" src/
```
เพื่อยืนยันไม่มี reference หลงเหลือ (ยกเว้น `lovable.dev` ใน comments หรือ ping string ที่ไม่เกี่ยวกับ engine), แล้วรัน `bunx tsc --noEmit` ให้ผ่าน

---

## ไฟล์ที่แก้

| ไฟล์ | การเปลี่ยน |
|---|---|
| `src/lib/ocr.functions.ts` | ลบ `runOcr` + `InputSchema` |
| `src/components/ocr/OcrPanel.tsx` | ลบ engine `lovable` และทุก code path ที่เกี่ยวข้อง, default = `webhook` |
| `.lovable/plan.md` | log การลบ |

ไม่แก้ database, ไม่แก้ webhook/selfhosted logic
