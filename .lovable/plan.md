# แผนการแก้ไข 4 ประเด็น

## 1) ออกแบบตาราง Variables ใหม่ (2 บรรทัดต่อแถว)
แก้ `src/components/variable/VariablePanel.tsx`:
- เปลี่ยนจาก `<Table>` 4 คอลัมน์ → เป็น list ของ `Card` แบบเต็มความกว้าง 1 แถวต่อ variable
- โครงสร้างต่อแถว:
  - **บรรทัดที่ 1:** ชื่อ `variable` (ตัวหนา ขนาดใหญ่ ใช้พื้นที่เต็มบรรทัด) + ปุ่ม Edit/Delete (การตั้งค่า) ชิดขวา
  - **บรรทัดที่ 2:** `description` ทางซ้าย + `created_at` (รูปแบบ "x time ago") ชิดขวา ตัวสีจาง
- คง pagination, dialog เพิ่ม/แก้ไข, alert ลบไว้เหมือนเดิม
- responsive: บนมือถือ description กับวันที่ stack กันได้

## 2) อธิบายที่มาของ OCR
แก้ `src/components/ocr/OcrPanel.tsx`:
- เพิ่ม banner เล็ก ๆ ใต้หัวข้อ/ภายใน dropzone ระบุว่า  
  *"OCR powered by Lovable AI Gateway (Google Gemini 2.5 Flash vision). ไฟล์ถูกส่งไปยังบริการ AI ของ Lovable เพื่อสกัดข้อความ"*
- ใส่ไอคอน Info + tooltip รายละเอียดเพิ่มเติม (โมเดล, ผู้ให้บริการ, ไม่เก็บไฟล์ฝั่งผู้ให้บริการ)
- เพิ่มข้อความสั้นใต้แท็บ "Extracted text" ด้วย เพื่อความชัดเจน

## 3) PDF preview ถูก Chrome บล็อก
**สาเหตุ:** ใช้ `<iframe src={blob:URL}>` แสดง PDF ผ่าน Chrome built-in PDF viewer — Chrome เวอร์ชันใหม่บล็อก plugin/embed PDF ใน iframe จาก blob URL ในหลายบริบท (sandbox/COEP/iframe ภายใน preview ของ Lovable) ทำให้ขึ้นหน้าว่างหรือ "blocked".

**แก้ไข** ใน `OcrPanel.tsx` + `file-utils.ts`:
- หลังจาก `renderPdfPages()` แปลง PDF เป็น PNG อยู่แล้ว → เก็บ `dataUrls` ไว้ใน state แล้วใช้แสดงเป็น preview แทน iframe
- แสดง thumbnail หน้าแรก + ตัวเลื่อนดูหน้าอื่น (หรือ scroll list ของ canvas ทุกหน้า) ใน Card "Preview"
- ลบ iframe blob URL ออก → ไม่มี blocking อีก
- ภาพยังคงใช้ `<img>` ตามเดิม

## 4) UI list view โผล่ ๆ หาย ๆ ตอนสลับแท็บ
**สาเหตุ:** Radix `Tabs` unmount เนื้อหาของแท็บที่ไม่ active. ทุกครั้งที่กดสลับกลับมา:
- `HistoryPanel` mount ใหม่ → `useEffect` ยิง query Supabase ใหม่ → เห็น Skeleton แวบ → ข้อมูลกระพริบ
- `OcrPanel` mount ใหม่ → state file/preview หาย แต่ระหว่าง transition ของ Tabs ยังเห็น UI เก่าค้างชั่วคราว → ดูเหมือน "UI แปลกโผล่ ๆ"

**แก้ไข:**
- ติดตั้ง `@tanstack/react-query` (ถ้ายังไม่มี wiring ใน root) — *หรือ* ใช้วิธีเบากว่า: ใส่ `forceMount` ให้ `<TabsContent>` ทุกอันใน `src/routes/index.tsx` แล้วซ่อนด้วย CSS (`hidden` attribute Radix จัดการให้) เพื่อให้ state คงอยู่ และไม่ refetch ทุกครั้ง
- เพิ่ม cache module-level เล็ก ๆ ใน `HistoryPanel` (เก็บ `rows` ล่าสุดไว้นอก component) เพื่อให้รอบสองแสดงทันทีโดยไม่เห็น Skeleton กระพริบ; ยังคง revalidate เบื้องหลัง
- ตรวจสอบว่า `OcrPanel` ไม่ revoke `previewUrl` ตอน unmount โดยไม่จำเป็น (เพราะใช้ `forceMount` แล้ว state จะอยู่ครบ)

---

## ไฟล์ที่จะแก้
- `src/components/variable/VariablePanel.tsx` — เปลี่ยนเป็น card list 2 บรรทัด
- `src/components/ocr/OcrPanel.tsx` — เพิ่มคำอธิบาย OCR, ใช้ PNG ที่ render แล้วเป็น preview แทน iframe
- `src/components/history/HistoryPanel.tsx` — เพิ่ม module cache กัน flicker
- `src/routes/index.tsx` — `forceMount` บน `TabsContent` ทั้ง 3 แท็บ

ไม่มีการเปลี่ยน schema, RLS, หรือ server function — เป็นงานฝั่ง frontend ล้วน
