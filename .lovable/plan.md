## สาเหตุ

ที่ `src/routes/index.tsx` ทั้งสาม `TabsContent` (OCR, History, Variable) ใช้ `forceMount` ทำให้ **mount พร้อมกันทั้งสาม panel ตั้งแต่หน้าโหลดครั้งแรก**:

- `OcrPanel` — import ก้อนใหญ่แบบ static (`react-markdown`, `remark-gfm`, `react-dropzone`, `PythonApiResultPanel`, `file-utils` ที่มี pdfjs) และยิง Supabase query โหลด variables ตอน mount
- `HistoryPanel` — ยิง Supabase query `ocr_history` ตอน mount
- `VariablePanel` — ยิง Supabase query `variable` ตอน mount (เป็นไฟล์ใหญ่ ~458 บรรทัด)

ผลคือเบราว์เซอร์ต้อง parse + render ทุก panel + รอ network 3 ก้อนพร้อมกันก่อนที่ main thread จะว่างพอให้ Radix Tabs ตอบสนองการคลิก ทำให้คลิกเปลี่ยน tab หรือกด explore ไฟล์ "ค้าง" ไปสองสามวินาทีหลังเปิดเว็บ

## แนวทางแก้

1. **ถอด `forceMount` ออก** — ให้แค่ tab ที่ active เท่านั้นที่ mount จริง การสลับ tab จะ unmount panel เก่า (state จะ reset แต่ปัจจุบัน OcrPanel ก็ไม่ persist อะไรข้าม tab อยู่แล้ว, HistoryPanel มี `historyCache` module-level cache ป้องกัน flicker อยู่แล้ว)
2. **`React.lazy` + `Suspense`** สำหรับ `HistoryPanel` และ `VariablePanel` เพื่อไม่ให้ JS ของสอง panel นี้ถูก parse จนกว่าผู้ใช้กดเข้า tab จริง ๆ
3. **เพิ่ม `historyCache`-style module cache** ให้ `VariablePanel` (ถ้าจำเป็น) เพื่อกัน flicker เวลาสลับ tab กลับมา — ตรวจดูก่อนว่ามีอยู่แล้วหรือไม่
4. **(เลือกได้) lazy-load `PythonApiResultPanel`** ภายใน `OcrPanel` ด้วย `React.lazy` เพื่อลดน้ำหนัก initial bundle ของ tab OCR

ไม่แตะ business logic / Supabase contract / UI ของแต่ละ panel

## ไฟล์ที่แก้

- `src/routes/index.tsx` — ลบ `forceMount`, ใช้ `React.lazy` + `Suspense` สำหรับ `HistoryPanel` / `VariablePanel`, ใส่ fallback เล็ก ๆ (skeleton หรือ spinner)
- `src/components/ocr/OcrPanel.tsx` — เปลี่ยน import `PythonApiResultPanel` เป็น `lazy()` และห่อด้วย `<Suspense>` ตรงจุดใช้งาน
- `src/components/variable/VariablePanel.tsx` — (เลือกได้) เพิ่ม module-level cache แบบเดียวกับ HistoryPanel

## ตรวจสอบหลังแก้

- เปิดหน้าเว็บใหม่ → คลิกสลับ tab OCR/History/Variable ได้ทันที
- กด "explore" (เปิด dropzone / file picker) ของ OCR ทำงานได้ทันทีไม่ต้องรอ
- เปิด Network ดู: Supabase query ของ History/Variable ต้องไม่ยิงจนกว่าจะกดเข้า tab นั้น
