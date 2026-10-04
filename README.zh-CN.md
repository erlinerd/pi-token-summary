# pi-token-summary

[![CI](https://github.com/erlinerd/pi-token-summary/actions/workflows/ci.yml/badge.svg)](https://github.com/erlinerd/pi-token-summary/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [中文](README.zh-CN.md)

pi coding agent 的 **token 消耗内联显示**扩展。agent 回复后，会话流里直接追加一行暗色统计：

```text
↓1.2k ⟳ · Σ20.5k · ctx 63% · ⚡130.8 tok/s (4.9s · TTFT 6282ms) · $0.11 · glm-5.3-flash
```

- **↓⟳**：这条回复输出的 token
- **Σ**：本会话累计输出
- **ctx**：上下文占用百分比
- **$**：累计成本
- 模型名

统计行是自定义 session 条目（`appendEntry` + `registerEntryRenderer`），只进 TUI 渲染、不参与 LLM 上下文，resume 旧会话时历史统计行原样重现。

最近一轮的 TPS **常驻在 pi 的 footer**，以状态项形式追加（`ctx.ui.setStatus`）——不替换默认 footer。流式输出期间显示实时 TPS（`⚡12.3 tok/s (3.2s)`），本轮 usage 到位后换成准确值。每个数据块都直接重画，不节流不缓动，数字跟着流的节奏走。⚡ 图标与数字按速度着色，越慢越暗越红，越快越亮越绿并加粗：10 以下 `#A31010`、30 以下 `#E3170D`、60 以下 `#EF7C00`、90 以下 `#B8D430`、120 以下粗体 `#7CFC00`、120 及以上粗体 `#39FF8E`。footer 与内联模式无关：`off` 只隐藏会话流里的统计行，footer 照常刷新。

## 三档显示模式

```bash
/token-summary verbose   # 每条 assistant 消息后都显示（含工具调用中间消息）
/token-summary brief     # 只在每轮末尾显示一次（默认）
/token-summary off       # 不显示；累计值照常统计，报告不受影响
/token-summary           # 查看完整报告 + 当前模式
```

模式持久化在 `~/.pi/agent/pi-token-summary.json`，重启后保留。默认 **简略**。

说明：pi 的 `turn_end` 事件在**每条** assistant 消息后触发；带工具调用的一轮对话会有多条消息。"详细"逐条显示，"简略"只在 `stopReason` 非 `toolUse`（即整轮真正结束）时显示一次。

## 原理

pi 扩展 API 的 `turn_end` 事件带本轮 assistant 消息的 `usage`；`pi.appendEntry()` 把渲染好的统计行持久化到 session 文件，`pi.registerEntryRenderer()` 负责在对话流中以暗色主题渲染。
启动时从 session 文件播种累计值，resume 旧会话也能续上。纯本地读取，无网络请求。


## 安装

```bash
pi install github:erlinerd/pi-token-summary   # GitHub
pi install npm:@erlin-ai/pi-token-summary               # 发布后
```

新开会话即生效。

## 卸载

```bash
pi uninstall @erlin-ai/pi-token-summary
```

## 开发

```bash
npm install
npm test        # tsx --test
npx tsc --noEmit
```

## License

MIT
