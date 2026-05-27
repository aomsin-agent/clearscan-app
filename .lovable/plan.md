## เป้าหมาย

ออกแบบ flow ใหม่สำหรับ engine **Self-hosted (python-api)** ใน `OcrPanel.tsx` — แทนที่ container "Extract text" เดิม ด้วย container ใหญ่ที่มี **4 tabs** หลังกด Validate และเขียน `docs/python-api-container-process.md` เป็น **AI Agent Prompt** สำหรับ Agent อีกตัวเชื่อมต่อ container จริง

ขอบเขตนี้กระทบเฉพาะ **selfhosted engine** (`python-api`) — webhook และ lovable AI ไม่เปลี่ยน

---

## Flow ใหม่ (เฉพาะ python-api)

```
1. เลือก engine = "Self-hosted"  →  เลือก variable (endpoint URL)
2. Drop ไฟล์ลง explorer  →  preview ฝั่งซ้าย
3. Pane ขวา: container "Awaiting validation" + ปุ่ม [Validate]
4. กด Validate  →  spinner + POST ไฟล์ไป endpoint
5. Response กลับมา  →  container เดิมหาย, container ใหญ่ปรากฏด้านล่าง
   มี 4 tabs:
   ├─ HTML        — render html string จาก response (iframe sandbox)
   ├─ Markdown    — react-markdown + ปุ่ม Copy ด้านบนขวา
   ├─ Files       — list ไฟล์ output (รูป/json/md) กดเข้าดู preview ในตัว tab
   └─ Stdout      — <pre> แสดง stdout จากการรัน python
```

ถ้า response format ผิด → tab Markdown แสดง error message, tab อื่นแสดง empty state พร้อม raw JSON ใน Stdout

---

## รายละเอียดการแก้

### `src/components/ocr/OcrPanel.tsx`

- เพิ่ม state ใหม่สำหรับ python-api response:
  ```ts
  type PythonApiResult = {
    html: string;          // tab 1
    markdown: string;      // tab 2
    files: Array<{ name: string; url: string; mime: string; size?: number }>;  // tab 3
    stdout: string;        // tab 4
  };
  const [pyResult, setPyResult] = useState<PythonApiResult | null>(null);
  const [activeTab, setActiveTab] = useState<"html"|"markdown"|"files"|"stdout">("markdown");
  ```
- ใน `runValidate()` เมื่อ `engine === "selfhosted"` และได้ JSON สำเร็จ → parse เป็น `PythonApiResult` (มี fallback ถ้า field ขาด)
- เพิ่ม component ใหม่ `<PythonApiResultPanel>` ใช้ `Tabs` จาก shadcn (`@/components/ui/tabs`):
  - **HTML tab**: `<iframe srcDoc={pyResult.html} sandbox="" />` ขนาด ~600px
  - **Markdown tab**: ปุ่ม Copy ขวาบน + `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
  - **Files tab**: grid ของ card ไฟล์ (icon ตาม mime) + click → modal/inline preview (รูป: `<img>`, json/md: `<pre>`)
  - **Stdout tab**: `<pre className="font-mono text-xs">{pyResult.stdout}</pre>` พร้อม scroll
- เงื่อนไข render: เมื่อ `engine === "selfhosted" && status === "done" && pyResult` → แสดง `<PythonApiResultPanel>` แทน "Extract text" container เดิม
- engine อื่น (lovable / webhook) ใช้ container เดิมไม่เปลี่ยน

### `src/lib/ocr-client.ts`

ขยาย `SelfHostedResult` ให้รวม `pythonApi?: PythonApiResult` — parse field เพิ่มจาก response JSON:
```ts
{
  status: "success",
  markdown: "...",   // คงเดิม (backward-compat)
  html: "...",       // ใหม่
  files: [{name, url, mime, size}],
  stdout: "..."
}
```
ถ้า field ใหม่ขาด → ใช้ค่า empty string / array — ไม่ถือเป็น bad-format

### `docs/python-api-container-process.md` (ไฟล์ใหม่)

เขียนเป็น **AI Agent Prompt** ภาษาอังกฤษ มีโครงสร้าง:

1. **Role & Goal** — "You are an agent tasked with implementing a Python OCR container that integrates with this Lovable web app via the python-api engine."
2. **High-level flow** — diagram ASCII แบบด้านบน
3. **HTTP contract** —
   - Request: `POST multipart/form-data` field `file` (อ้างถึง `OCR_BACKEND_CONTRACT.md` ส่วนที่ตรงกัน)
   - Response JSON schema ใหม่:
     ```json
     {
       "status": "success",
       "markdown": "...",
       "html": "<full html string read from generated .html file>",
       "files": [
         { "name": "page_1.png", "url": "https://.../outputs/abc/page_1.png", "mime": "image/png", "size": 12345 },
         { "name": "result.json", "url": "...", "mime": "application/json" }
       ],
       "stdout": "captured stdout from the python process"
     }
     ```
4. **Container responsibilities** —
   - รับไฟล์ → run OCR pipeline → สร้างโฟลเดอร์ output unique ต่อ request
   - อ่าน `.html` ที่ pipeline สร้าง → ส่งเป็น `html` string
   - อ่าน `.md` → ส่งเป็น `markdown`
   - list ไฟล์ทั้งหมดใน output dir + serve ผ่าน static route → URL ใน `files[]`
   - capture stdout ของ subprocess → ใส่ `stdout`
5. **Response timing** — synchronous (ดู `OCR_BACKEND_CONTRACT.md` §2.1); ต้องรอ pipeline เสร็จก่อน return
6. **CORS** — ต้องเปิดเพราะ browser เรียกตรง (ไม่ผ่าน server)
7. **Error handling** — `{status:"error", error:"...", stdout:"..."}` (stdout ยังส่งได้เพื่อ debug)
8. **Implementation reference** — FastAPI skeleton ตัวอย่างที่ทำตาม contract นี้ (multipart, run pipeline, glob output, jsonify)
9. **Testing checklist** — endpoint reachable, CORS preflight ok, ส่งรูปทดสอบได้ทั้ง 4 tabs

---

## ไฟล์ที่กระทบ

| ไฟล์ | การเปลี่ยน |
|---|---|
| `src/components/ocr/OcrPanel.tsx` | เพิ่ม state + `<PythonApiResultPanel>` (4 tabs) สำหรับ selfhosted |
| `src/lib/ocr-client.ts` | ขยาย `SelfHostedResult` รับ field `html/files/stdout` |
| `docs/python-api-container-process.md` | สร้างใหม่ — AI Agent Prompt |
| `.lovable/plan.md` | อัปเดต log |

ไม่แก้ webhook / lovable / database / server functions
