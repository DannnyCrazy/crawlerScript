# Excel 爬取工具（Tauri + React + Tailwind）

- 依赖安装：在 `desktop-app` 下执行 `bun install`。
- 运行开发：`bun run dev`。
- 打包安装：`bun run build`，输出 Windows 安装包。
- 参数说明：输入 `token`、`开始ID` 与 `结束ID`，可选 `并发数`、`分组大小`、`请求延迟(ms)` 与输出目录。
- 功能：爬取并导出 `.xlsx`，实时进度与日志，支持取消与合并 Excel。

注意：后端请求在必要时允许忽略证书校验以兼容远端服务，请在可信网络环境中使用并自行评估风险。
