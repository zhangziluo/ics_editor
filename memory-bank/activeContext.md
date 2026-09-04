# 当前进度（Active Context）

## 最近一轮改动（2026-09-03，均已通过验证）

### 1. 时钟支持 13:00+（修复「时间只能调到上午」）
- `ics_editor.html` 时钟组件新增 **上午/下午** 切换按钮（`clk-ampm-am` / `clk-ampm-pm`）。
- `clkHour` 恒存 0~23；表盘仍是 12 小时制：
  - `clkSetAmPm(isPM)`：上午↔下午 ±12 平移。
  - `clkClick`（时模式）：`h12 = round(normalized/30)%12`，再按当前上午/下午映射成 0~23（下午：12点方向=12，1~11 点=13~23）。
  - `updateClockDisplay`：24 小时制显示、同步上午/下午高亮、时针角度用 `clkHour%12`。

### 2. 多模式切换（通用 / 体育赛事 / 课程表）
- 页面新增 `#mode-switch` 三个按钮：`📅 通用(general, 默认)` / `🏀 体育赛事(sports)` / `🎓 课程表(course)`。
- 全局变量 `recMode`；`setRecMode()` 负责按钮高亮、placeholder 提示、状态栏文案。
- **文字粘贴解析**按模式走：
  - `parseLine(text, mode)` → `parseSportsLine(text, loose)` / `parseGenericLine(text)`。
  - 修复：`高等数学 8:00-9:40 工科楼A201` 曾被 `-` 误判成「高等数学 vs 9:40」。
    - 文本含完整时间段（`8:00-9:40`）时 `parseSportsLine` 直接返回 null（属于课表/通用格式）。
    - sports 模式（loose=true）才允许 `对 / -` 作对阵分隔符；general 只认 `vs / 对阵` 强信号。
  - 通用解析标题清理增强：去除残留单个时间；地点支持 `工科楼A201`、`文科楼B栋`、`地点：理科楼C305` 完整提取。
- **AI 截图识别**：`recognizeImage` 请求体带 `mode: recMode`。

### 3. 后端多模式提示词（server.js）
- 原写死的体育 `SYSTEM_PROMPT` → `MODE_PROMPTS`（sports / course / general 三套）。
- `/api/vision-extract` 读取并校验 `mode`（非法或缺省回落 `general`）。
- `normalizeEvents(list, defaultEndMinutes)`：sports 缺结束时间默认 +120 分钟，course/general 默认 +60。
- 提示词统一要求返回 `{"events":[...]}`，兼容 `response_format: json_object`。

### 4. 修复「编辑事件日历数字空白」
- **根因**：事件时间以 ICS 紧凑格式存储（`20260903T123000Z`，无 `-`/`:`），`new Date(e.start)` 解析为 Invalid Date → `calYear/calMonth = NaN` → 日历循环不生成数字。与「缺少万年历数据」无关（公历由浏览器 Date 计算）。
- 新增工具：`parseCompactDT(str)`（兼容 `…T…Z` / 无 Z / 标准 ISO）、`icsStamp(s)`（保证单个 Z）。
- `openForm`（编辑）与 `renderEvents`（列表）改用 `parseCompactDT`；编辑时**自动选中事件所在日期**。
- **导出双 Z 修复**：`exportICS` 的 `DTSTART/DTEND/DTSTAMP` 曾输出 `…ZZ`，统一改用 `icsStamp()`。

## 验证记录
- `node --check server.js` ✅；抽取 `<script>` 后 `node --check` ✅。
- 解析单测（Node）：课表文本正确解析、体育 `vs/对/-` 正确解析、`parseCompactDT` 三种格式均返回有效 Date、`icsStamp` 均输出单个 Z ✅。
- 冒烟测试：`PORT=3999/3998 node server.js` 正常启动、页面含新标记、接口对缺图返回 400 ✅。

## 最近一次操作人/时间
- 2026-09-03 23:57（ics_editor.html 最后修改），server.js 9660B。
