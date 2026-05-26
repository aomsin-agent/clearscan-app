## เป้าหมาย

เพิ่ม section อธิบายความแตกต่างระหว่าง **"acknowledgment" (200 OK ทันที)** กับ **"response" (ผลลัพธ์หลังประมวลผล OCR เสร็จ)** ลงใน `docs/OCR_BACKEND_CONTRACT.md` เพื่อให้นักพัฒนา backend เข้าใจว่า endpoint ต้องรอจนกว่าการประมวลผลจะเสร็จสิ้น แล้วค่อยส่ง JSON response ตาม contract กลับมา

---

## รายละเอียดที่เพิ่ม

### Section ใหม่: "Response vs. Acknowledgment" (หลัง section 2. Response)

อธิบายว่า:
- 200 OK ที่ส่งกลับทันทีหลังรับ request เป็นแค่ acknowledgment — ระบบจะถือว่าเป็น `bad-format` เพราะไม่มี `markdown`
- "Response" ที่ app ต้องการ = JSON ที่ส่งกลับ **หลังจาก** OCR pipeline ประมวลผลเสร็จแล้ว
- สำหรับ n8n: ต้องใช้ "Respond to Webhook" node หรือ "When Last Node Finishes" เพื่อให้ response body เป็น `{status, markdown}` ไม่ใช่ `{"message":"Workflow was started"}`
- สำหรับ Python/FastAPI/Flask: ต้อง `return` หลังจาก `run_my_ocr_pipeline()` เสร็จ (synchronous) — ห้าม return 202 Accepted แล้วประมวลผล background

### Section ใหม่: "n8n Setup Guide" (ย่อยใน Implementation examples)

ขยายตัวอย่าง n8n ให้มีรายละเอียด:
- ตั้งค่า Webhook node → Response Mode: `Using 'Respond to Webhook' Node` หรือ `When Last Node Finishes`
- ต่อ Respond to Webhook node หลัง OCR step เสร็จ
- Body ของ Respond to Webhook:
  ```json
  {
    "status": "success",
    "markdown": "={{ $json.extractedText }}"
  }
  ```
- หากใช้ `Immediately` จะได้ `{"message":"Workflow was started"}` → app แจ้ง bad-format
- ระบุว่า HTTP timeout ของ n8n cloud ~5 นาที และ Cloudflare Worker ~same — pipeline ต้องเสร็จภายในเวลานี้

---

## ไฟล์ที่แก้

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `docs/OCR_BACKEND_CONTRACT.md` | เพิ่ม 2 sections ใหม่ + ขยายตัวอย่าง n8n |

ไม่แก้ไฟล์อื่น ไม่แก้ code ไม่แก้ logic ใดๆ