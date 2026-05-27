## ปัญหา

กดปุ่ม Browse แล้วต้องรอสักครู่ก่อน native file picker จะเด้งขึ้น เกิดจาก main thread ของ React ถูกบล็อกด้วยงาน sync ที่เกิดขึ้นรอบ ๆ การ click

## สาเหตุ (จากการอ่านโค้ด `src/components/ocr/OcrPanel.tsx`)

1. **`react-markdown` + `remark-gfm` ถูก import ที่ top-level** ของ `OcrPanel.tsx` (บรรทัด 30–31) ทั้งที่ใช้แสดงผลเฉพาะ "หลังจาก OCR สำเร็จ" เท่านั้น → bundle ของ tab OCR หนักขึ้นมาก, parse/eval ตอน mount นาน
2. **`EngineSelector` / dropzone props ถูกสร้างใหม่ทุก render** — ทุกครั้งที่ state เปลี่ยน (รวม `varsLoading`, `testResult`, ฯลฯ) `useDropzone` จะ recompute และ rebind handlers
3. **`loadVariables` ยิงซ้ำตอน mount** (React StrictMode dev → ดูจาก network logs มี 2 calls /webhook ติด ๆ กัน) ทำให้ตอนผู้ใช้กดครั้งแรก main thread ยัง busy รอ promise/setState ของ Supabase
4. **`PythonApiResultPanel` lazy แล้ว** แต่ panel หลักยังตึงเพราะ react-markdown bundle ใหญ่กว่า

## แนวทางแก้

### 1. Lazy-load `react-markdown` (ผลกระทบสูงสุด)
สร้าง wrapper component `MarkdownView.tsx` ที่ import `react-markdown` + `remark-gfm` ข้างใน แล้วใน `OcrPanel.tsx` ใช้ `lazy(() => import("./MarkdownView"))` + `<Suspense>` เฉพาะตอน `status === "done"` และ `viewMode === "preview"` — ตัด ~100KB ออกจาก initial chunk ของหน้า OCR

### 2. Memoize handlers / selector
- ห่อ `EngineSelector` ด้วย `useMemo` หรือแยกเป็น component ลูกที่รับ props
- ย้าย dropzone options ไป constant นอก component, ทำให้ `useDropzone` ไม่ rebind ทุก render

### 3. ลด re-render rounds รอบ ๆ การกดปุ่ม
- รวม state ที่เปลี่ยนพร้อมกัน (เช่น preview-related) ด้วย `useReducer` หรือ batch ผ่าน single setter object — ลด commit time ใน React 19

### 4. (ทางเลือก) Preload pdfjs worker
ถ้าผู้ใช้แตะไฟล์ PDF บ่อย เพิ่ม `<link rel="modulepreload">` ผ่าน route `head().links` ในหน้า `/` เพื่อให้ดาวน์โหลดล่วงหน้า (ไม่บังคับ — pdfjs lazy อยู่แล้ว และไม่กระทบเวลาเปิด file picker)

## ไฟล์ที่จะแก้

- `src/components/ocr/MarkdownView.tsx` (สร้างใหม่)
- `src/components/ocr/OcrPanel.tsx` (เปลี่ยน import เป็น lazy + memoize)

## วิธีตรวจสอบหลังแก้

1. รัน `browser--performance_profile` / `start_profiling` ระหว่างคลิก Browse → ดู long task ลดลง
2. เช็ค initial JS chunk ของ route `/` มีขนาดลดลง (react-markdown ออกจาก main chunk)
3. กด Browse ทดสอบ — file picker ต้องเด้งขึ้นทันที