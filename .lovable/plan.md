## เป้าหมาย

1. **เลิกใช้ base64** — webhook payload ปัจจุบันส่ง `fileBase64` + array ของ data URLs ทำให้ payload บวม 33% เปลี่ยนเป็น `multipart/form-data` ทั้ง webhook และ python-api (เหมือนกัน)
2. **Unified response contract** — webhook กับ python-api ใช้ response shape เดียวกัน รองรับ markdown สำหรับแสดงผลบนเว็บ
3. **Render markdown บนหน้าเว็บ** — แทนที่ `<Textarea>` ใน