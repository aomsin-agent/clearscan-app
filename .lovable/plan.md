## เป้าหมาย

จัด layout ส่วน **Endpoint Variable** (เฉพาะเมื่อเลือก engine เป็น Webhook หรือ Self-hosted) ใน `src/components/ocr/OcrPanel.tsx` ใหม่ ให้:
- ซ่อนอยู่ภายใต้ปุ่ม **Settings** (ไอคอน ⚙️) ที่พับเก็บ/กางออกได้
- จัดเรียง element ในบรรทัดเดียวกันเท่าที่หน้าจอเอื้อ
- ลำดับการมองเห็น (UX flow): **Dropdown เลือกตัวแปร → ปุ่ม Refresh → ปุ่ม Test → แสดงผล Test/Current Value**

---

## โครงสร้างใหม่ของบล็อก `needsVariable`

แทนที่กล่อง `<div className="overflow-hidden rounded-xl border bg-card">` เดิม (บรรทัด ~372-498) ด้วย collapsible panel:

```text
┌─────────────────────────────────────────────────────────────┐
│ ⚙️  Endpoint settings · [category badge]    [▼ พับ/กาง]      │  ← Header (คลิกเพื่อ toggle)
├─────────────────────────────────────────────────────────────┤
│ [Select variable ▼ ────────] [⟳] [🔌 Test]   ● status chip   │  ← แถวเดียว (sm+)
│ ┌───────────────────────────────────────────────────────┐   │
│ │ 🔗  https://endpoint.example.com/...        ● online  │   │  ← Current value (compact)
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

พฤติกรรม:
- ค่าเริ่มต้น **กางอยู่** เมื่อยังไม่ได้เลือกตัวแปร (เพื่อให้ผู้ใช้เห็นว่าต้องเลือกก่อน)
- เมื่อเลือกตัวแปรแล้ว และ Test ผ่าน → auto-collapse เหลือเฉพาะ header สรุป (เช่น `⚙️ Endpoint: VAR_NAME ● online`)
- คลิก header เพื่อ toggle เอง
- ตอนพับอยู่ header จะสรุปสถานะให้เห็นทันที (variable name + status dot) ผู้ใช้ไม่ต้องกางก็รู้สถานะ

---

## รายละเอียดการเปลี่ยนแปลง

### 1. State ใหม่
- เพิ่ม `const [settingsOpen, setSettingsOpen] = useState(true)`
- เมื่อ `testResult?.ok === true` → setSettingsOpen(false) อัตโนมัติ (ใน effect)
- เมื่อเปลี่ยน engine หรือยังไม่เลือก variable → setSettingsOpen(true)

### 2. Import เพิ่ม
- `Settings, ChevronDown` จาก lucide-react
- ใช้ `Collapsible, CollapsibleContent, CollapsibleTrigger` จาก `@/components/ui/collapsible` (shadcn มีอยู่แล้ว)

### 3. Header (trigger)
- แสดง icon ⚙️, label `Endpoint settings`, category badge เล็กๆ
- ขวามือ: chevron หมุนตาม open state
- เมื่อ collapsed: แสดง summary inline `VAR_NAME` + status dot (เขียว/เทา/แดง)

### 4. แถว Action เดียว (เมื่อกางอยู่)
ใช้ `flex flex-wrap items-center gap-2`:
- `<Select>` `flex-1 min-w-[200px]`
- ปุ่ม Refresh `size="icon"` `h-10 w-10 shrink-0`
- ปุ่ม Test `h-10 shrink-0` (ย้ายมาอยู่บรรทัดเดียว แทนที่จะอยู่ใต้)
- Status chip (testResult) `shrink-0` — แสดง latency/error สั้นๆ

บน mobile (`<sm`) ปุ่ม Test จะ wrap ลงบรรทัดถัดไปอัตโนมัติ

### 5. Current Value (compact)
- ลดขนาด padding (`p-2.5` แทน `p-3`)
- รวม URL + status dot ในบรรทัดเดียว แบบ inline
- ตัด label "CURRENT VALUE" ออก (ใช้แค่ไอคอน 🔗 นำหน้า) เพื่อความกระชับ

### 6. ไม่แตะส่วนอื่น
- EngineSelector (เลือก Lovable/Webhook/Self-hosted) คงเดิม
- Dropzone, preview, result panel คงเดิม
- ไม่แตะ `runConnectionTest`, `testWebhook`, `testSelfHostedEndpoint` (logic ทำงานเหมือนเดิม)

---

## ไฟล์ที่จะแก้

- `src/components/ocr/OcrPanel.tsx` — ปรับเฉพาะ JSX block `needsVariable` ภายใน `EngineSelector` + เพิ่ม state/imports

ไม่มีไฟล์ใหม่ ไม่มีการเปลี่ยน backend / business logic
