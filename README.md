# pi-exit-summary

pi coding agent 的**每轮 token 消耗显示**扩展。每轮 agent 回复结束后，footer 状态栏实时更新：

```
↓1.2k 本轮 · Σ↓20.5k tok · ctx 63% · $0.11 · glm-5.3-flash
```

- **↓本轮**：这一轮回复输出的 token
- **Σ↓**：本会话累计输出
- **ctx**：上下文占用百分比
- **$**：累计成本
- 模型名

另附 `/exit-summary` 命令：会话中随时查看完整总结（直接解析 session 文件，resume 后也准确）。

## 原理

pi 扩展 API 的 `turn_end` 事件带本轮 assistant 消息的 `usage`；`ctx.ui.setStatus()` 写 footer。
启动时从 session 文件播种累计值，resume 旧会话也能续上。纯本地读取，无网络请求。

## 安装

```bash
pi install /path/to/pi-exit-summary        # 本地路径
pi install npm:pi-exit-summary             # 发布后
```

新开会话即生效。

## 卸载

```bash
pi uninstall pi-exit-summary
```

## 开发

```bash
npm install
npm test        # node --test
npx tsc --noEmit
```

## License

MIT
