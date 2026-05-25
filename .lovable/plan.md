## เป้าหมาย

ปรับช่อง "Endpoint variable" ใน `src/components/ocr/OcrPanel.tsx` ให้ใช้ดีไซน์ **Modern integrated dropdown** ที่ผู้ใช้เลือก โดยคงพฤติกรรมเดิม (โหลดจากตาราง `variable`, refresh, ใช้ `description` เป็น URL)

## ขอบเขตการเปลี่ยนแปลง

แก้ไขเฉพาะบล็อก `{needsVariable && (...)}` ภายใน `EngineSelector` (บรรทัด ~288–334) ไม่แตะ logic / state / ฟังก์ชัน OCR

## โครงสร้างใหม่ (อิงต้นแบบที่เลือก)

```text
┌─ Card (เดิม) ─────────────────────────────────────┐
│ OCR Engine selector (เดิม ไม่แก้)                  │
│                                                   │
│ Endpoint Variable                       ← label หนา
│ Select a variable containing your URL.  ← helper
│                                                   │
│ [ Select ▼              ]  [ ⟳ ]   ← select + ปุ่ม refresh แยกเป็นกล่อง
│                                                   │
│ ┌─ Preview block (bg-muted/40, rounded) ────────┐│
│ │ CURRENT VALUE              ● (เขียว/เทา)       ││
│ │ [🔗] https://endpoint...   ← mono, primary    ││
│ └────────────────────────────────────────────────┘│
│                                                   │
│ ⓘ Manage variables in the Variables tab          │ ← footer แบ่งเส้น
└───────────────────────────────────────────────────┘
```

### รายละเอียดการ map ไปยัง design tokens

- พื้น Card คงเดิม (`bg-card`)
- Helper text: `text-xs text-muted-foreground`
- Label: `text-sm font-semibold text-foreground`
- Select + ปุ่ม refresh: วางคู่กันด้วย `flex gap-2`; ปุ่ม refresh เป็น `variant="outline" size="icon"` (ไอคอน `RefreshCw` หมุน 180° บน hover ด้วย `transition-transform duration-500 group-hover:rotate-180`)
- Preview block:
  - `rounded-lg border bg-muted/40 p-3`
  - Header แถวเล็ก: `CURRENT VALUE` (`text-[10px] font-bold uppercase tracking-wider text-muted-foreground`) + จุดสถานะ `h-2 w-2 rounded-full` (เขียว `bg-emerald-500` เมื่อมี URL, เทา `bg-muted-foreground/40` เมื่อยังไม่เลือก)
  - บรรทัด URL: ไอคอน `Link2` ในกรอบเล็ก `p-1.5 bg-background border rounded` + `<code>` ฟอนต์ mono `text-xs text-primary break-all`
  - ถ้ายังไม่ได้เลือก variable แสดงข้อความ placeholder จาง ๆ ("No variable selected")
- Footer: แยกด้วย `border-t` พื้น `bg-muted/30`, `px-4 py-2.5`, ไอคอน Info เล็ก + ข้อความ "Manage variables in the Variables tab"

### พฤติกรรมที่คงไว้ (ไม่แตะ)

- `loadVariables`, `selectedVarId`, `selectedVar`, `varsLoading`
- Select ยังใช้ shadcn `<Select>` component (เพื่อ keyboard/accessibility) แต่ปรับ trigger ให้ดูสะอาดตามต้นแบบ
- รายการตัวเลือกใน `SelectItem` ยังโชว์ชื่อ variable + URL ตัด truncate เหมือนเดิม
- ปุ่ม Refresh ยังเรียก `loadVariables`, ไอคอนหมุนตอน `varsLoading`

## ไม่เปลี่ยน

- ไม่แตะ Engine selector ด้านบน
- ไม่แตะ NoticeBanner
- ไม่แตะ dropzone / preview / extracted text
- ไม่แก้ไฟล์อื่นนอกจาก `OcrPanel.tsx`
