## เป้าหมาย

ปรับ layout ของหน้าเว็บให้ดู clean ขึ้น โดย:
1. ย้าย tab bar (OCR/History/Variable) ไปอยู่บนขวาในรูป **dropdown menu** เดียว
2. ลบ NoticeBanner ("OCR engine: Webhook URL ⓘ") ที่อยู่ตรงกลางก่อน container OCR engine
3. ยุบ container "Endpoint settings" ใหญ่ ๆ ให้กลายเป็น **modal (Dialog)** ที่กลางจอ เปิดด้วยปุ่ม icon ⚙️ ข้าง ๆ ปุ่ม engine tab
4. ถ้ายังไม่ได้เลือก endpoint (variable) → กดเลือก/ลากไฟล์ไม่ได้ (lock dropzone + แสดงข้อความบอกให้ตั้งค่าก่อน)

ไม่แตะ business logic, server function, Supabase contract — เป็นงาน UI/presentation ล้วน ๆ

## ไฟล์ที่แก้

### 1. `src/routes/index.tsx`
- ลบ `<TabsList>` ที่อยู่ใต้ header
- ย้ายตัว tab switcher ขึ้นไปอยู่ใน `<header>` ด้านขวา ในรูป **`DropdownMenu`** (จาก `@/components/ui/dropdown-menu`):
  - ปุ่ม trigger: ปุ่ม outline แสดง icon + ชื่อ tab ปัจจุบัน + chevron-down
  - items: 3 รายการ (OCR / History / Variable) แต่ละอันมี icon ของตัวเอง คลิกแล้ว `setTab(...)`
- คง `<Tabs value={tab}>` + `<TabsContent>` 3 ตัวเหมือนเดิม (เพราะ Radix Tabs ยังทำงานได้แม้ไม่มี TabsList)
- ลบ component `TabTrigger` ที่ไม่ใช้แล้ว

### 2. `src/components/ocr/OcrPanel.tsx`
- **ลบ NoticeBanner ออกทั้งหมด** (constant + การเรียกใช้ทั้งสองที่: บรรทัด 587 และ 639)
- เปลี่ยน engine selector จาก grid 2 card → แถวเล็ก ๆ ที่ด้านบน: ปุ่ม segment "Webhook | Self-hosted" + ปุ่ม icon ⚙️ **Endpoint settings** อยู่ขวาสุดแถวเดียวกัน (ปุ่ม icon เปิด modal)
- ย้าย UI ภายใน `Collapsible` (variable dropdown + refresh + test + status + current value + footer hint) เข้าไปอยู่ใน `<Dialog>` (จาก `@/components/ui/dialog`):
  - `open` state ใหม่: `endpointDialogOpen`
  - Trigger คือปุ่ม icon ⚙️; กดแล้วเปิด dialog กลางจอ
  - DialogContent มี title "Endpoint settings" + badge category, เนื้อหาเดิม (Select variable, Refresh, Test, status, current URL, hint)
  - มีปุ่ม "Done" / X ปิด dialog
- ลบ `Collapsible` / `settingsOpen` / auto-collapse useEffect ออก (ไม่ต้องใช้แล้ว)
- **lock dropzone จนกว่า endpoint จะถูกเลือก**:
  - `canRun` (= มี `selectedVar.description`) ยังเป็นเงื่อนไขเดิมที่ disable dropzone อยู่แล้ว → ดี
  - เพิ่ม empty state ที่ชัดขึ้นในกล่อง dropzone: ถ้า `!canRun` แสดงไอคอน lock + ข้อความ "เลือก endpoint ก่อนเริ่มอัปโหลด" + ปุ่ม **"Open endpoint settings"** ที่เปิด modal เดียวกัน (แทนปุ่ม "Browse files")
  - ปุ่ม "Browse files" จะโผล่ก็ต่อเมื่อ `canRun` แล้วเท่านั้น

### 3. ไม่ต้องแตะ
- `HistoryPanel`, `VariablePanel`, `PythonApiResultPanel`
- `src/lib/ocr.functions.ts`, `ocr-client.ts`
- Supabase schema / docs

## รายละเอียดเทคนิค

- `DropdownMenu` มีอยู่แล้วใน `src/components/ui/dropdown-menu.tsx`
- `Dialog` มีอยู่แล้วใน `src/components/ui/dialog.tsx`
- เก็บ behavior เดิมไว้: auto-close dialog หลัง test ผ่าน (success) เพื่อให้ flow ลื่นเหมือนเดิม (port logic จาก `setSettingsOpen(false)` เป็น `setEndpointDialogOpen(false)`)
- เมื่อเปลี่ยน engine → reset `selectedVarId` และเปิด dialog อัตโนมัติ (เหมือนเดิม)
- ทุก state, callback, server-fn ทำงานเหมือนเดิมหมด

## โครงหน้า OCR ใหม่ (ASCII)

```text
┌──────────────────────────────── header ────────────────────────────────┐
│  [logo] OCR Studio                            [▾ OCR ]   ← dropdown   │
└────────────────────────────────────────────────────────────────────────┘

   ┌── Engine ──────────────────────────────────────────────────┐
   │  ( Webhook )  ( Self-hosted )                       [⚙️]   │  ← เปิด modal
   └────────────────────────────────────────────────────────────┘

   ┌── Dropzone ────────────────────────────────────────────────┐
   │       [⬆️]  Drop a file or click to upload                 │
   │              (ถ้ายังไม่เลือก endpoint → [🔒] + ปุ่มเปิด modal) │
   └────────────────────────────────────────────────────────────┘
```

Modal (เปิดเมื่อกด ⚙️):
```text
   ┌─ Endpoint settings  [webhook] ──────────────────[X]─┐
   │  [ Select variable… ▾ ]  [⟳]  [ Test ]  status      │
   │  [ 🔗 https://your-endpoint  ●green ]               │
   │  ⓘ Manage variables in the Variables tab            │
   └─────────────────────────────────────────────────────┘
```

## ตรวจสอบหลังแก้

- กดเปลี่ยน tab ผ่าน dropdown ขวาบน → เปลี่ยนเนื้อหาได้ถูกต้อง
- ไม่มี NoticeBanner กลางจออีก
- กด ⚙️ → modal เปิดกลางจอ, ทำงาน select/test ได้
- ก่อนเลือก endpoint → dropzone ถูก lock, ไม่สามารถเปิด file picker ได้, ปุ่มที่เห็นคือ "Open endpoint settings"
- หลังเลือก endpoint → ปุ่ม "Browse files" กลับมา, ลาก/อัปไฟล์ได้ปกติ
