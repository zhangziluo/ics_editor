# Roadmap / 待办 / 已知问题

## 需求澄清记录（历史）
- **万年历数据下载请求**：用户在「编辑事件日历空白」时猜测需下载万年历数据。已澄清：日历空白是 `new Date(紧凑时间)` 解析失败导致，**与日历数据无关**；公历日号由浏览器 `Date` 自动计算，无需联网数据。该问题已修复（见 activeContext）。
  - 若将来要做 **农历 / 节气 / 节假日显示**：需内置离线农历转换库，属于新增强功能，尚未排期。
- **「.env 藏在后端导致工具无法使用」**：已实现 **纯前端直连 DeepSeek Vision（方案 A）**——页面新增「⚙️ API Key 设置 + 大白话申请教程」，Key 存 localStorage、浏览器直连（实测 DeepSeek 支持 CORS）；`server.js` 降级为可选后端；提示词抽成共享 `prompts.js`。详见 activeContext。
- **`tmp_helpers_test.js` 修复请求**：用户最初请求修复该文件，但内容与「Problems」均为空、文件不存在；用户选择「下条消息粘贴代码」，之后实际转入了其他需求（时间/模式切换）。**该任务仍未交付**——若用户重新提供文件与问题清单再处理。

## 待办 / 可能方向
- [ ] v1.1：录音/语音转写 → 批量事件（Readme 已列）。
- [ ] v1.2：webcal:// 订阅链接支持。
- [ ] 编辑/新建流程 UX 复核：新建事件是否应默认选中「今天」。
- [ ] 可选增强：AI 截图识别加「识别模式记忆」（localStorage 记住 recMode）。

## 已知问题（未修）
1. **每周重复未真正生效**：粘贴带「周几」的课表后，确认卡显示 🔁 周X，但 `confirmAddAll` 只生成单次事件（`dow` 未展开成每周多次，也未写 RRULE）。课程表/每周重复需后续实现。
2. **自然语言时间解析有限**：支持 `8:00-9:40`、`周X`、`日期`、`地点`、常见老师；`下午2点到3点半` 这类中文口语时间暂不支持。
3. **ICS 字段未转义**：标题/描述含 `,`、`;`、换行时导出未做 RFC 5545 转义与折行。
4. **重复规则表单为空实现**：表单里 `updateRRule()` 仅为占位（「联动 UI，实际拼装在导出时处理」），导出无 RRULE。
5. **时区边界**：跨午夜的结束时间（如 23:30 次日 00:30）在 `confirmAddAll`/列表显示中按同一天处理，未跨天。
6. AI 识别现为「纯前端直连 DeepSeek（用户自带 Key）」：若浏览器直连被网络/扩展/代理拦截，需改用可选后端 `server.js`；遇到 401（Key 无效）、402（余额不足）、429（限流）有文案提示但无自动重试/降级。

## 验证方式速查
- 语法：`node --check server.js`
- 前端内联 JS：`awk '/<script>/{f=1;next}/<\/script>/{f=0}f' ics_editor.html > /tmp/x.js && node --check /tmp/x.js`
- 解析逻辑单测：从 html 抽取 `function parseLine` 到 `function showConfirmCards` 前的内容 `eval` 后调用各 parse 函数（见 activeContext 中的用例）。
- 冒烟：`PORT=3999 node server.js` → curl 页面与 `/api/vision-extract`。
