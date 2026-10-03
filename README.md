# 🎨 AI DRAWING TEACHER — Hướng dẫn vẽ 1:1

Ứng dụng web/mobile: **tải ảnh lên → AI phân tích → hướng dẫn vẽ từng bước bám sát ảnh gốc**.
Hoặc **nhập yêu cầu vẽ** ("dạy tôi vẽ chân dung", "hướng dẫn vẽ anime"...) → AI tự tạo giáo trình.
Kèm **kiểm tra bài vẽ**: tải tranh của bạn lên, AI so sánh với ảnh mẫu và chỉ lỗi cụ thể + cách sửa.

AI Vision API (OpenAI `gpt-4o`) được gọi **từ backend Node.js/Express** — API key **không bao giờ** nằm trong frontend.

---

## 📁 Cấu trúc thư mục

```
ai-drawing-teacher/
├── package.json          # Khai báo thư viện (express, multer, dotenv)
├── server.js             # Backend: upload ảnh, gọi AI, 3 endpoint API
├── .env.example          # Mẫu biến môi trường (copy thành .env)
├── .gitignore
├── README.md
└── public/
    ├── index.html        # Giao diện (mobile-first)
    ├── style.css         # Dark/Light mode, responsive
    └── app.js            # Logic: bước vẽ, overlay, grid, zoom, TTS, timer, lưu bài
```

---

## 🚀 Cài đặt & chạy local

### Yêu cầu
- Node.js **>= 18** (đã có sẵn `fetch` để gọi OpenAI API)
- Một **OpenAI API key** có quyền dùng model vision (`gpt-4o` hoặc `gpt-4o-mini`) — lấy tại https://platform.openai.com/api-keys

### Các bước

```bash
# 1. Vào thư mục project
cd ai-drawing-teacher

# 2. Cài thư viện
npm install

# 3. Tạo file .env từ mẫu
cp .env.example .env

# 4. Mở .env và dán API key thật vào dòng OPENAI_API_KEY=...
#    (có thể đổi OPENAI_MODEL thành gpt-4o-mini để rẻ hơn)

# 5. Chạy
npm start
```

Mở trình duyệt (kể cả trên điện thoại cùng mạng): **http://localhost:3000**

> Nếu chạy trên máy tính và muốn mở trên điện thoại: tìm IP LAN của máy (vd `192.168.1.5`), mở `http://192.168.1.5:3000` trên điện thoại.

---

## 🔑 Thêm API key (bắt buộc)

File `.env` (**không được commit lên GitHub**):

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o
PORT=3000
MAX_FILE_SIZE=8388608
AI_TIMEOUT_MS=120000
```

- `gpt-4o`: chất lượng cao, phân tích ảnh tốt (khuyến nghị).
- `gpt-4o-mini`: rẻ hơn ~10×, vẫn hỗ trợ vision, phù hợp test.

**Không bao giờ** đặt key trực tiếp trong `index.html` / `app.js` — frontend chỉ gọi `/api/...` của server, server mới giữ key.

---

## 🌐 Deploy lên Render

### Cách 1: Connect GitHub (khuyến nghị)

1. Đẩy project lên GitHub (private repo cũng được). **Đảm bảo `.env` nằm trong `.gitignore`** — không đẩy key lên.
2. Vào https://render.com → **New +** → **Web Service**.
3. Connect repo của bạn.
4. Cấu hình:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (hoặc Starter nếu cần ổn định)
5. Mục **Environment Variables** → thêm:
   - `OPENAI_API_KEY` = `sk-...` (dán key thật)
   - `OPENAI_MODEL` = `gpt-4o` (tùy chọn)
   - (Không cần đặt `PORT` — Render tự cấp)
6. Nhấn **Create Web Service**. Đợi ~1–2 phút build xong, Render sẽ cho bạn URL dạng `https://ai-drawing-teacher.onrender.com`.
7. Mở URL đó trên điện thoại → dùng ngay.

> Lưu ý gói Free của Render: service sẽ **ngủ** sau 15 phút không có truy cập, lần mở đầu có thể chậm ~30–60 giây. Nâng lên gói trả phí để luôn sẵn sàng.

### Cách 2: Deploy bằng Docker/CLI

Render cũng hỗ trợ `render.yaml` và CLI. Với project này, cách connect GitHub ở trên là đơn giản nhất.

---

## 🧠 Cách hoạt động (luồng dữ liệu)

### A. Tải ảnh → hướng dẫn vẽ
1. Người dùng chọn ảnh (JPG/JPEG/PNG/WEBP, ≤8MB) → preview.
2. Nhấn **BẮT ĐẦU HỌC** → frontend gửi `multipart/form-data` lên `POST /api/analyze-image`.
3. Backend (`multer`) nhận ảnh trong bộ nhớ, validate định dạng/kích thước.
4. Backend gọi OpenAI Vision API kèm **system prompt giáo viên mỹ thuật** (trong `server.js`), yêu cầu trả về **JSON có cấu trúc**.
5. Backend trả JSON giáo trình về frontend.
6. Frontend hiển thị từng bước: tiêu đề, hướng dẫn chi tiết, tỷ lệ, điểm đầu→cuối nét, lực tay, dụng cụ, mẹo, lỗi thường gặp + cách sửa.
7. Nút **← QUAY LẠI / TIẾP THEO →** chuyển bước; thanh tiến trình `Bước X / N — %`.

### B. Nhập lệnh vẽ
- Gửi `POST /api/generate-lesson` với `{prompt, accuracy, beginner}`.
- AI tự hiểu "tôi là người mới" → đơn giản hóa; "vẽ cực kỳ chi tiết" → nhiều bước hơn.

### C. Kiểm tra bài vẽ
- Gửi cả **ảnh bài vẽ** và **ảnh mẫu** lên `POST /api/check-drawing`.
- AI so sánh, trả về điểm số, danh sách điểm tốt, lỗi cụ thể (có ước lượng độ lệch) + cách sửa, và gợi ý bước nên làm lại.
- Nút **🛠 SỬA BƯỚC NÀY** tự động quay về bước AI gợi ý.

---

## 🎯 Các endpoint API

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/health` | Kiểm tra server + xem API key đã cấu hình chưa |
| POST | `/api/analyze-image` | FormData: `image` (file), `accuracy`, `beginner` → giáo trình JSON |
| POST | `/api/generate-lesson` | JSON: `{prompt, accuracy, beginner}` → giáo trình JSON |
| POST | `/api/check-drawing` | FormData: `drawing` (file), `reference` (file), `currentStep`, `lessonTitle` → feedback JSON |

**Cấu trúc JSON giáo trình** (xem chi tiết trong system prompt ở `server.js`):
```json
{
  "title": "...", "difficulty": "...", "totalSteps": 12,
  "estimatedMinutes": 45, "materials": [...], "overview": "...",
  "steps": [{
    "number": 1, "title": "...", "goal": "...", "instruction": "...",
    "whatToDraw": [...], "startEnd": "...", "ratio": "...", "pressure": "...",
    "tools": [...], "tips": [...], "mistakes": [...], "fixes": [...], "nextHint": "..."
  }]
}
```

---

## ✨ Tính năng đã có

- 📷 Chụp ảnh / 📁 chọn ảnh / ✏️ nhập yêu cầu vẽ
- 🎯 4 mức độ chính xác: Cơ bản → Chi tiết → Rất chi tiết → **1:1 tối đa** (số bước tự động điều chỉnh 6→26)
- 👁 Overlay ảnh mẫu với **độ trong suốt** 0–100%
- 📐 Lưới **3×3 / 4×4 / 8×8 / 16×16** để căn tỷ lệ
- 🔍 **Zoom** (100–400%) + **kéo** ảnh khi đã zoom
- 🔊 **Đọc hướng dẫn** bằng giọng nói (Web Speech API, tiếng Việt)
- ⏱ **Bộ đếm thời gian** luyện tập
- ⭐ Đánh dấu bước yêu thích · 💾 Lưu bài học (localStorage) · 📚 Bài học gần đây
- 🔄 Làm lại bước · 📸 Kiểm tra bài vẽ với AI · 🛠 Sửa bước theo gợi ý AI
- 🌓 **Dark/Light mode** · 🏆 Màn hình hoàn thành · 📊 Theo dõi số bài đã hoàn thành
- Giao diện **mobile-first**, tối ưu màn hình điện thoại

---

## ⚠️ Lưu ý kỹ thuật

- Chế độ **1:1 tối đa** cố gắng bám sát ảnh nhất có thể, nhưng **không đảm bảo chính xác tuyệt đối 100%** — AI ước lượng tỷ lệ tương đối, kết quả phụ thuộc chất lượng ảnh và độ phức tạp.
- Ảnh được xử lý **trong bộ nhớ tạm** trên server, không lưu đĩa (Render có đĩa ephemeral). Ảnh mẫu được lưu ở trình duyệt người dùng khi nhấn 💾 Lưu.
- Dùng `gpt-4o-mini` để giảm chi phí khi test. Mỗi lần phân tích ảnh tiêu tốn một số token nhỏ.
- Nếu gặp lỗi `401`: kiểm tra lại `OPENAI_API_KEY` trong `.env` (local) hoặc Environment Variables (Render).
- Nếu gặp lỗi `413` / file quá lớn: giảm `MAX_FILE_SIZE` hoặc nén ảnh trước.

---

## 🛠 Tùy chỉnh nhanh

- **Đổi model AI**: sửa `OPENAI_MODEL` trong `.env` (hỗ trợ mọi model OpenAI có vision).
- **Đổi số bước theo mức độ**: sửa hàm `accuracyLabel()` trong `server.js`.
- **Đổi giọng đọc**: sửa `u.lang = 'vi-VN'` và `u.rate` trong `public/app.js` (hàm `btnSpeak`).
- **Đổi màu chủ đạo**: sửa biến `--primary` trong `public/style.css`.

Chúc bạn vẽ thật tốt! 🖌
