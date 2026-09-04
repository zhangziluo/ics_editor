# 架构与关键实现（Architecture）

## 页面结构
- `index.html` — 模板导航页（「精选模板」卡片 → `localStorage.useTemplate` → 跳转编辑器）。分类过滤：study/health/work/life/family。
- `ics_editor.html` — 单页编辑器（核心），内含所有 CSS/JS：
  - 页面 Tab（`.page`）：editor / help 等，`switchPage()`。
  - 左侧表单：日历选日期（自绘 7 列网格）+ 模拟时钟 + 标题/地点/描述/提醒 + 保存。
  - 事件列表：每条含 编辑/删除，点编辑调用 `openForm(i)` 回填同一表单。
  - 智能粘贴 / AI 截图识别：`parsePastedText` → 确认弹层 `confirm-overlay`（自动事件可改名后一键加入）。
  - 模板应用：`applyTemplateFromStorage` → `TEMPLATES`（`templates` 数组内联），加入横幅 `template-banner`。
  - 导出/导入 ICS、帮助页教程。
- `guide.html` — 新手指南 / 各平台导入教程。
- `prompts.js` — 共享提示词（UMD：前端 `window.DEEPSEEK_PROMPTS` / Node `require('./prompts.js')`），改提示词只改这一份。
- `server.js` — **可选** 本地 Node 代理（静态托管 + `POST /api/vision-extract`），前端默认已不再调用它。

## 关键全局 / 函数（ics_editor.html）
- 全局：`events[]`、`editIndex`、`pendingConfirms[]`、`templateApplied`、`calYear/calMonth`、`clkMode/clkHour/clkMin`、`recMode`。
- 日历：`initCal()` / `renderCal()`（网格 = 7 表头 + 42 格，`day-cell.empty` 隐藏）/ `calPrevMonth/calNextMonth`。
- 时钟：`clkSetMode` / `clkSetAmPm` / `clkClick` / `updateClockDisplay` / `initClock`（IIFE）。
- 表单：`openForm(idx=-1)` / `cancelEdit` / `saveEvent`。
- 解析：`parseLine(text, mode)` / `parseSportsLine(text, loose)` / `parseGenericLine(text)` / `parsePastedText` / `showConfirmCards` / `confirmAddAll`。
- AI 截图：`recognizeImage(dataUri)`（**纯前端直连** `https://api.deepseek.com/chat/completions`，Key 取自 `localStorage['deepseek_api_key']`）、`extractEventsFromContent`（解析模型返回）、`visionEventToConfirm`、`ocrFromFile`、摄像头截图（`canvas`→dataURL）、`setPasteStatus`。
- API Key 设置：`getApiKey/updateKeyState/toggleKeyPanel/saveApiKey/clearApiKey`；页面内有「申请 API Key 大白话教程」。
- 工具：`parseCompactDT(str)`、`icsStamp(s)`。
- ICS：`exportICS()`、`importICS`/`parseICS`、`fmtDT`（若有）、`getStartOfWeek`。

## 数据格式注意（易踩坑）
1. **事件时间存储 = ICS 紧凑格式**：`toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')`
   → `20260903T123000Z`（末尾带 Z）。
   - ⚠️ 直接用 `new Date()` 解析为 Invalid Date（NaN），必须用 `parseCompactDT()`。
   - ⚠️ 由 `parseICS` 导入的事件会去掉 Z（`20260903T123000`），显示按本地时间解释。
2. **导出 ICS**：`DTSTART/DTEND/DTSTAMP` 用 `icsStamp()` 确保单个 Z（曾出现双 Z `…ZZ`）。
3. 事件标题/描述含用户文本，导出为 SUMMARY/LOCATION/DESCRIPTION 未做转义处理（已知限制）。
4. 提醒默认 `PT15M`；`VALARM` 用 `TRIGGER:-PT15M` 形式。

## AI 识别与 server.js 要点
- **默认纯前端直连**：`recognizeImage` 直接 `fetch('https://api.deepseek.com/chat/completions')`，`Authorization: Bearer <localStorage['deepseek_api_key']>`；实测 DeepSeek 允许浏览器 CORS。
- 提示词来自共享文件 `prompts.js`（sports/course/general 三套）；`extractEventsFromContent` 兼容 `{"events":[...]}` / 裸数组 / markdown 围栏。
- 无时区时间按北京时间 `+08:00` 解释（`visionEventToConfirm` 内 `norm()`）；sports 兜底 +2h，其余 +1h。
- server.js 可选后端（前端默认不调用）：`MODE_PROMPTS = require('./prompts.js')`，`askDeepSeek(imageDataUri, mode)`、`normalizeEvents(list, defaultEndMinutes)`、`pickEventArray`、`toUTCString`。
- `.env` 现有真实 `DEEPSEEK_API_KEY`；模型 `deepseek-v4-flash-vision-exp`（DeepSeek 兼容端点）。

## 技术栈 / 运行
- 纯 HTML+CSS+JS 前端；Node express + axios + dotenv。
- 启动：`npm start`（PORT 默认 3000，可用 `PORT=xxx` 覆盖）。
- 无 git 仓库（根目录无 `.git`）；含 `.gitignore`。
