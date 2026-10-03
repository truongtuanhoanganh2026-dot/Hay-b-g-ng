/**
 * AI DRAWING TEACHER - HƯỚNG DẪN VẼ 1:1
 * Backend: Node.js + Express
 *
 * Chịu trách nhiệm:
 *  - Phục vụ file tĩnh (frontend) trong thư mục /public
 *  - Nhận ảnh tải lên (multer), validate định dạng & kích thước
 *  - Gọi OpenAI Vision API (API key nằm ở server, KHÔNG暴露 ra frontend)
 *  - Trả về giáo trình vẽ dạng JSON có cấu trúc cho frontend hiển thị
 *  - So sánh ảnh bài vẽ của người dùng với ảnh mẫu, đưa ra nhận xét
 *
 * Chạy: npm start  (cần file .env có OPENAI_API_KEY)
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const app = express();

// ---------- Cấu hình ----------
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '8388608', 10); // 8MB
const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '120000', 10);
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Lưu ảnh trong bộ nhớ (buffer) để chuyển sang base64 gửi cho OpenAI.
// Không lưu đĩa để tránh rò rỉ ảnh người dùng trên server Render (ephemeral).
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 3 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Định dạng file không được hỗ trợ. Chỉ chấp nhận JPG, JPEG, PNG, WEBP.'));
    }
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- System prompt nội bộ cho AI (theo yêu cầu mục 12) ----------
const SYSTEM_PROMPT = `Bạn là một giáo viên mỹ thuật chuyên nghiệp và chuyên gia phân tích hình ảnh, tên là "AI Drawing Teacher".
Nhiệm vụ của bạn: khi nhận được một bức ảnh (hoặc một yêu cầu vẽ bằng văn bản), hãy chuyển nó thành một GIÁO TRÌNH THỰC HÀNH VẼ TỪNG BƯỚC cực kỳ cụ thể, để người học có thể tự vẽ lại bức ảnh đó trên giấy.

NGUYÊN TẮC BẮT BUỘC:
1. Luôn ưu tiên thứ tự: bố cục tổng thể → tỷ lệ → hình khối lớn → đường trục → đường viền → chi tiết nhỏ → ánh sáng → bóng đổ → độ đậm nhạt → màu sắc. Không bao giờ nhảy vào chi tiết nhỏ trước khi dựng xong khung hình lớn.
2. Mỗi hướng dẫn phải CỤ THỂ, có thể thực hành ngay: vị trí tương đối (ví dụ "cách mép trái 1/3 chiều rộng khung"), điểm bắt đầu/kết thúc của nét, tỷ lệ (ví dụ "chiều cao đầu bằng 1/5 chiều cao toàn thân"), lực tay (nhẹ/vừa/đậm), dụng cụ nên dùng.
3. Không nói chung chung như "vẽ hình tròn rồi tô màu". Mỗi bước phải nói rõ vẽ ĐÂU, từ ĐÂU đến ĐÂU, kích thước BAO NHIÊU, TẠI SAO lại như vậy.
4. Mỗi bước phải kèm: lỗi thường gặp và cách sửa, mẹo để bám sát ảnh gốc.
5. Nếu ảnh là người/chân dung: phải chỉ rõ trục giữa, đường mắt, đường mũi, tỷ lệ mắt-mũi-miệng, vai, tỷ lệ đầu-thân.
6. Nếu ảnh là phong cảnh/cây/động vật/vật thể: phải chỉ rõ đường chân trời, tỷ lệ các vật thể so với khung, điểm tụ phối cảnh nếu có.
7. Người mới bắt đầu phải làm theo được từng bước.

ĐỊNH DẠNG TRẢ VỀ: CHỈ trả về một đối tượng JSON thuần túy, KHÔNG có markdown, KHÔNG có giải thích bên ngoài JSON. Cấu trúc:
{
  "title": "Tên bài học (ngắn gọn, tiếng Việt)",
  "difficulty": "Cơ bản | Trung bình | Nâng cao",
  "totalSteps": <số nguyên, số lượng bước>,
  "estimatedMinutes": <số nguyên, thời gian dự kiến luyện tập>,
  "materials": ["danh sách dụng cụ nên chuẩn bị"],
  "overview": "Mô tả ngắn bố cục tổng thể và điểm chính cần chú ý của bức ảnh (2-3 câu)",
  "steps": [
    {
      "number": 1,
      "title": "Tên bước (ví dụ: Dựng khung và tỷ lệ tổng thể)",
      "goal": "Mục tiêu của bước này trong một câu",
      "instruction": "Hướng dẫn chi tiết, dài, cụ thể: làm gì, vẽ ở đâu, từ đâu đến đâu, tỷ lệ giữ nguyên, lực tay, dụng cụ. Viết bằng tiếng Việt, có thể dùng gạch đầu dòng nội bộ.",
      "whatToDraw": ["Danh sách cụ thể những đường/hình cần vẽ ở bước này"],
      "startEnd": "Mô tả điểm bắt đầu và kết thúc của các nét chính (nếu có)",
      "ratio": "Tỷ lệ cần giữ ở bước này (ví dụ: chiều rộng đầu = 1/3 chiều rộng khung)",
      "pressure": "Lực tay/độ đậm: nhẹ | vừa | đậm, và lý do",
      "tools": ["dụng cụ nên dùng ở bước này"],
      "tips": ["mẹo để đạt kết quả giống ảnh gốc"],
      "mistakes": ["lỗi thường gặp"],
      "fixes": ["cách sửa từng lỗi tương ứng"],
      "nextHint": "Một câu giới thiệu bước tiếp theo"
    }
  ]
}
Số bước (totalSteps) PHẢI tự động thay đổi theo độ phức tạp và mức độ chi tiết được yêu cầu: mức Cơ bản 6-8 bước, Chi tiết 8-12 bước, Rất chi tiết 12-18 bước, 1:1 tối đa 18-26 bước. Mảng steps phải có đúng totalSteps phần tử, đánh số từ 1.`;

// Prompt cho việc so sánh bài vẽ
const CHECK_SYSTEM_PROMPT = `Bạn là giáo viên mỹ thuật chuyên nghiệp. Người dùng đã vẽ lại một bức ảnh mẫu và gửi ảnh bài vẽ của họ.
Nhiệm vụ: so sánh CHI TIẾT ảnh bài vẽ (ảnh thứ nhất) với ảnh mẫu (ảnh thứ hai) và đưa ra nhận xét để người học cải thiện.
Hãy chỉ ra:
- Những điểm làm tốt (bố cục, tỷ lệ tổng thể, hình khối...)
- Những lỗi cụ thể: sai tỷ lệ ở đâu, sai vị trí, sai hình dạng, sai ánh sáng/bóng, sai màu, chi tiết nào thiếu.
- Với mỗi lỗi: ước lượng độ lệch (ví dụ "mắt trái cao hơn khoảng 5% chiều cao đầu"), và hướng sửa CỤ THỂ (vẽ lại đường nào, dịch chuyển ra sao, đậm/nhạt thế nào).
- Ưu tiên lỗi nghiêm trọng trước (tỷ lệ, bố cục) rồi mới đến chi tiết nhỏ.

CHỈ trả về JSON thuần túy, không markdown, cấu trúc:
{
  "overallScore": <số 0-100>,
  "summary": "Nhận xét tổng quan 2-3 câu",
  "good": ["danh sách điểm làm tốt"],
  "issues": [
    {
      "severity": "Cao | Trung bình | Nhỏ",
      "category": "Tỷ lệ | Vị trí | Hình dạng | Ánh sáng | Màu sắc | Chi tiết | Đường nét",
      "description": "Mô tả lỗi cụ thể, có số liệu ước lượng",
      "fix": "Hướng sửa cụ thể, có thể thực hành ngay"
    }
  ],
  "redoStep": <số nguyên - số bước nên làm lại từ đầu (thường là 1 hoặc bước có lỗi lớn nhất)>,
  "encouragement": "Lời khích lệ ngắn gọn"
}`;

// ---------- Tiện ích ----------
function bufferToDataUrl(file) {
  const base64 = file.buffer.toString('base64');
  return `data:${file.mimetype};base64,${base64}`;
}

function stripJson(raw) {
  // Loại bỏ markdown code block nếu AI vô tình trả về
  let s = String(raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Tìm đối tượng JSON đầu tiên
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  return JSON.parse(s);
}

async function callOpenAI(messages, jsonMode = true) {
  if (!OPENAI_API_KEY) {
    const err = new Error('OPENAI_API_KEY chưa được cấu hình trên server.');
    err.statusCode = 503;
    throw err;
  }
  const body = {
    model: OPENAI_MODEL,
    messages,
    temperature: 0.4,
    max_tokens: 4000
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const err = new Error(`AI API lỗi ${res.status}: ${errText.slice(0, 300)}`);
      err.statusCode = res.status === 401 ? 401 : 502;
      throw err;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return content;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      const err = new Error('AI mất quá nhiều thời gian phản hồi. Vui lòng thử lại.');
      err.statusCode = 504;
      throw err;
    }
    throw e;
  }
}

function accuracyLabel(level) {
  const map = {
    basic: 'Cơ bản (6-8 bước)',
    detailed: 'Chi tiết (8-12 bước)',
    very_detailed: 'Rất chi tiết (12-18 bước)',
    max_1to1: '1:1 tối đa (18-26 bước) - phân tích theo từng vùng nhỏ, bám sát ảnh nhất có thể. Lưu ý: không thể đảm bảo chính xác tuyệt đối 100%, hãy nỗ lực bám sát cao nhất.'
  };
  return map[level] || map.detailed;
}

// ---------- API: Health check ----------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    configured: !!OPENAI_API_KEY,
    model: OPENAI_MODEL,
    maxFileSizeMB: Math.round(MAX_FILE_SIZE / 1024 / 1024)
  });
});

// ---------- API 1: Phân tích ảnh tải lên -> tạo giáo trình ----------
// field name: "image" (file), form fields: accuracy, beginner
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Vui lòng chọn một ảnh để phân tích.' });
    }
    const accuracy = req.body.accuracy || 'detailed';
    const beginner = req.body.beginner === 'true' || req.body.beginner === true;

    const dataUrl = bufferToDataUrl(req.file);
    const userText = `Phân tích bức ảnh đính kèm và tạo giáo trình vẽ từng bước.
Mức độ chi tiết yêu cầu: ${accuracyLabel(accuracy)}.
${beginner ? 'Người học là NGƯỜI MỚI TỰ NHIÊN: hãy đơn giản hóa, giải thích kỹ hơn, dùng nét nhẹ, dụng cụ cơ bản (bút chì 2H/HB, giấy thường).' : ''}
Hướng dẫn phải ưu tiên để người dùng TỰ VẼ LẠI được ảnh, không chỉ mô tả nội dung ảnh.`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
        ]
      }
    ];

    const raw = await callOpenAI(messages, true);
    const lesson = stripJson(raw);
    lesson.source = 'image';
    lesson.accuracy = accuracy;
    lesson.id = crypto.randomBytes(6).toString('hex');
    lesson.createdAt = new Date().toISOString();
    res.json(lesson);
  } catch (err) {
    console.error('[analyze-image]', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Lỗi server khi phân tích ảnh.' });
  }
});

// ---------- API 2: Nhập lệnh vẽ bằng văn bản -> tạo giáo trình ----------
app.post('/api/generate-lesson', async (req, res) => {
  try {
    const { prompt, accuracy = 'detailed', beginner = false } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập yêu cầu vẽ.' });
    }
    if (String(prompt).length > 1000) {
      return res.status(400).json({ error: 'Yêu cầu quá dài (tối đa 1000 ký tự).' });
    }

    const userText = `Người học yêu cầu: "${String(prompt).trim()}".
Hãy tạo giáo trình vẽ từng bước cho chủ đề này.
Mức độ chi tiết: ${accuracyLabel(accuracy)}.
${beginner ? 'Người học là NGƯỜI MỚI: đơn giản hóa, giải thích kỹ, dụng cụ cơ bản.' : ''}
Nếu yêu cầu đề cập kỹ thuật cụ thể (bút chì, màu nước, anime, chân dung, mắt, bàn tay, tô bóng...) hãy tập trung sâu vào kỹ thuật đó.`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText }
    ];

    const raw = await callOpenAI(messages, true);
    const lesson = stripJson(raw);
    lesson.source = 'text';
    lesson.accuracy = accuracy;
    lesson.id = crypto.randomBytes(6).toString('hex');
    lesson.createdAt = new Date().toISOString();
    res.json(lesson);
  } catch (err) {
    console.error('[generate-lesson]', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Lỗi server khi tạo giáo trình.' });
  }
});

// ---------- API 3: Kiểm tra bài vẽ (so sánh ảnh người dùng với ảnh mẫu) ----------
// fields: "drawing" (file bài vẽ), "reference" (file ảnh mẫu), form: currentStep, lessonTitle
app.post('/api/check-drawing', upload.fields([{ name: 'drawing', maxCount: 1 }, { name: 'reference', maxCount: 1 }]), async (req, res) => {
  try {
    const drawing = req.files?.drawing?.[0];
    const reference = req.files?.reference?.[0];
    if (!drawing) return res.status(400).json({ error: 'Vui lòng tải ảnh bài vẽ của bạn.' });
    if (!reference) return res.status(400).json({ error: 'Thiếu ảnh mẫu để so sánh.' });

    const currentStep = parseInt(req.body.currentStep || '0', 10) || 0;
    const lessonTitle = req.body.lessonTitle || '';

    const messages = [
      { role: 'system', content: CHECK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Ảnh THỨ NHẤT là bài vẽ của người học (đang ở bước ${currentStep || 'chưa rõ'} trong bài "${lessonTitle}"). Ảnh THỨ HAI là ảnh mẫu chuẩn. Hãy so sánh và đánh giá.` },
          { type: 'image_url', image_url: { url: bufferToDataUrl(drawing), detail: 'high' } },
          { type: 'image_url', image_url: { url: bufferToDataUrl(reference), detail: 'high' } }
        ]
      }
    ];

    const raw = await callOpenAI(messages, true);
    const feedback = stripJson(raw);
    feedback.checkedAt = new Date().toISOString();
    res.json(feedback);
  } catch (err) {
    console.error('[check-drawing]', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Lỗi server khi kiểm tra bài vẽ.' });
  }
});

// ---------- Xử lý lỗi multer & toàn cục ----------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File quá lớn. Giới hạn ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB.` });
    }
    return res.status(400).json({ error: `Lỗi upload: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Lỗi không xác định.' });
  }
  next();
});

// Fallback route: trả về index.html cho mọi đường dẫn không khớp (SPA-friendly)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('==============================================');
  console.log('  AI DRAWING TEACHER - HƯỚNG DẪN VẼ 1:1');
  console.log(`  Server chạy tại: http://localhost:${PORT}`);
  console.log(`  AI model: ${OPENAI_MODEL}`);
  console.log(`  API key đã cấu hình: ${OPENAI_API_KEY ? 'CÓ' : 'CHƯA - hãy tạo file .env'}`);
  console.log('==============================================');
});
