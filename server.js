/**
 * ICS 日历编辑器 — 本地代理服务
 *
 * 作用：
 *  1. 托管静态页面（访问 http://localhost:3000/ics_editor.html）
 *  2. 提供 POST /api/vision-extract：把前端上传的截图(base64)转给
 *     DeepSeek Vision API（OpenAI 兼容格式）识别，返回结构化日程 JSON。
 *     body 可带 mode：sports=体育赛事 / course=课程表 / general=通用（默认）。
 *
 * 启动：
 *   npm install
 *   npm start
 *
 * 环境变量见 .env（复制 .env.example 并填入 DEEPSEEK_API_KEY）。
 */
require('dotenv').config();

const path = require('path');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash-vision-exp';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

// 允许较大的 base64 图片 JSON
app.use(express.json({ limit: '25mb' }));
// 托管当前目录下的静态页面
app.use(express.static(path.join(__dirname)));

// ---------- 提示词（按识别模式区分） ----------
// 前端可传 mode：sports=体育赛事 / course=课程表 / general=通用（默认）
const MODE_PROMPTS = {
  sports: {
    system: [
      '你是一个体育赛程解析助手。用户会发来一张体育赛程截图。',
      '请提取截图中所有比赛/赛事。',
      '返回 JSON 对象：{"events": [ {事件对象}, ... ]}',
      '每个事件对象字段：',
      '{',
      '  "title": "对阵双方，如 湖人 vs 勇士",',
      '  "start": "ISO 8601 格式，如 2026-09-05T19:35:00",',
      '  "end": "ISO 8601 格式，无结束时间则默认 +2 小时",',
      '  "location": "比赛地点，无则空字符串",',
      '  "description": "赛事名称，如 NBA常规赛，无则空字符串",',
      '  "reminder_minutes_before": 15',
      '}',
      '所有时间按北京时间（Asia/Shanghai）处理。',
      '只返回 JSON，不要有其他文字。'
    ].join('\n'),
    user: '请识别这张图片中的所有比赛/赛事。'
  },
  course: {
    system: [
      '你是一个课程表解析助手。用户会发来一张课程表/课表截图。',
      '请提取截图中所有课程安排。',
      '返回 JSON 对象：{"events": [ {事件对象}, ... ]}',
      '每个事件对象字段：',
      '{',
      '  "title": "课程名称，如 高等数学",',
      '  "start": "ISO 8601 格式，按截图中的星期和节次推算到最近一周的具体日期",',
      '  "end": "ISO 8601 格式，按节次时长推算结束时间",',
      '  "location": "上课地点，如 工科楼A201，无则空字符串",',
      '  "description": "任课老师或备注，无则空字符串",',
      '  "reminder_minutes_before": 15',
      '}',
      '所有时间按北京时间（Asia/Shanghai）处理。若只有星期几没有具体日期，使用最近一周内的对应日期补齐。',
      '只返回 JSON，不要有其他文字。'
    ].join('\n'),
    user: '请识别这张图片中的所有课程安排。'
  },
  general: {
    system: [
      '你是一个日程解析助手。用户会发来一张日程/安排截图。',
      '请提取截图中所有日程事件。',
      '返回 JSON 对象：{"events": [ {事件对象}, ... ]}',
      '每个事件对象字段：',
      '{',
      '  "title": "事件标题，如 项目评审会",',
      '  "start": "ISO 8601 格式，如 2026-09-05T14:00:00",',
      '  "end": "ISO 8601 格式，无结束时间则默认 +1 小时",',
      '  "location": "地点，无则空字符串",',
      '  "description": "备注，无则空字符串",',
      '  "reminder_minutes_before": 15',
      '}',
      '所有时间按北京时间（Asia/Shanghai）处理。',
      '只返回 JSON，不要有其他文字。'
    ].join('\n'),
    user: '请识别这张图片中的所有日程事件。'
  }
};

// ---------- 工具函数 ----------

/**
 * 把可能不带时区的 "2026-09-05T19:35:00" 按北京时间(+08:00)解释，
 * 统一转为带 Z 的绝对时间，避免浏览器端时区偏差。
 */
function toUTCString(value) {
  if (!value) return null;
  let s = String(value).trim().replace(/^["']|["']$/g, '');
  if (s.includes(' ')) s = s.replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s + '+08:00'); // 无时区标记则视为北京时间
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * 从模型返回的内容里提取 JSON 数组。
 * 兼容：裸数组、{"events":[...]} 之类的包装、markdown ``` 围栏。
 */
function pickEventArray(content) {
  let text = String(content || '').trim();
  text = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  const unwrap = (raw) => {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) return parsed[key]; // {"events": [...]} 包装
      }
      return [parsed]; // 单个对象也包一层
    }
    return null;
  };

  try {
    const r = unwrap(text);
    if (r) return r;
  } catch (err) { /* 继续尝试抠数组片段 */ }

  const m = text.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const r = unwrap(m[0]);
      if (r) return r;
    } catch (err) { /* 忽略 */ }
  }
  return null;
}

// ---------- 调用 DeepSeek Vision ----------
async function askDeepSeek(imageDataUri, mode) {
  const cfg = MODE_PROMPTS[mode] || MODE_PROMPTS.general;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  };
  const payload = {
    model: MODEL,
    max_tokens: 2048, // 防止截断
    response_format: { type: 'json_object' }, // 要求 JSON 输出
    messages: [
      { role: 'system', content: cfg.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: cfg.user },
          { type: 'image_url', image_url: { url: imageDataUri } }
        ]
      }
    ]
  };

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) { // 空内容最多重试 3 次
    try {
      const resp = await axios.post(DEEPSEEK_URL, payload, { headers, timeout: 120000 });
      const msg = resp.data && resp.data.choices && resp.data.choices[0]
        ? resp.data.choices[0].message : null;
      const content = msg ? msg.content : '';
      if (content && String(content).trim()) {
        const events = pickEventArray(content);
        if (events && events.length) return events;
      }
      lastError = new Error('识别结果为空');
    } catch (err) {
      lastError = err;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt));
  }
  throw lastError || new Error('DeepSeek Vision 调用失败');
}

// 清洗并规范模型返回的字段
// defaultEndMinutes：模型没给结束时间时的兜底时长（sports=120，其余=60）
function normalizeEvents(list, defaultEndMinutes) {
  const defMs = (Number(defaultEndMinutes) > 0 ? defaultEndMinutes : 120) * 60000;
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const title = String(raw.title || '').trim();
    if (!title) continue;
    const start = toUTCString(raw.start);
    if (!start) continue; // 没有有效开始时间则跳过
    let end = toUTCString(raw.end);
    if (!end) end = new Date(new Date(start).getTime() + defMs).toISOString(); // 兜底时长
    const remind = Number(raw.reminder_minutes_before);
    out.push({
      title,
      start,
      end,
      location: String(raw.location || '').trim(),
      description: String(raw.description || '').trim(),
      reminder_minutes_before: Number.isFinite(remind) ? remind : 15
    });
  }
  return out;
}

// ---------- API 路由 ----------
app.post('/api/vision-extract', async (req, res) => {
  try {
    if (!API_KEY || API_KEY === 'your_key_here') {
      return res.status(500).json({ error: '识别失败，请重试' });
    }
    let image = req.body && (req.body.image || req.body.base64 || req.body.file);
    if (!image || typeof image !== 'string' || !image.trim()) {
      return res.status(400).json({ error: '未收到有效图片' });
    }
    image = image.trim();
    // 兼容纯 base64（无 data:image 前缀）与完整 data URI
    if (!/^data:image\//.test(image)) image = 'data:image/png;base64,' + image;

    // 识别模式：仅接受 sports / course / general，非法或缺省则用 general
    const rawMode = String((req.body && req.body.mode) || 'general');
    const mode = MODE_PROMPTS[rawMode] ? rawMode : 'general';

    const list = await askDeepSeek(image, mode);
    const events = normalizeEvents(list, mode === 'sports' ? 120 : 60);
    if (!events.length) return res.status(422).json({ error: '识别失败，请重试' });
    return res.json({ events });
  } catch (err) {
    console.error('[vision-extract]', err && err.message);
    return res.status(500).json({ error: '识别失败，请重试' });
  }
});

// ---------- 启动 ----------
app.listen(PORT, () => {
  console.log(`🚀 ICS 服务器已启动：http://localhost:${PORT}/ics_editor.html`);
  if (!API_KEY || API_KEY === 'your_key_here') {
    console.warn('⚠️  请先编辑 .env 文件，填入 DEEPSEEK_API_KEY 后再使用 AI 截图识别。');
  }
});
