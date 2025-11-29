## 目标与范围
- 使用 Tauri 构建 Windows 桌面应用，前端采用 React + TypeScript + TailwindCSS，输入 `token` 与爬取范围并导出 `.xlsx`。
- 复用并强化现有爬取逻辑（并发、分组、失败续跑、进度可视化），保证列结构与字段一致。

## 架构设计
- 前端：`Vite + React + TS + TailwindCSS`（包管理使用 `bun`）。以原子化类完成布局与主题，无内联样式。
- 后端：`Tauri (Rust)` 实现请求与 Excel 写出，事件驱动反馈进度。
- 事件通道：`crawl_progress`（进度与统计）、`crawl_done`（输出文件列表）、`crawl_error`（严重错误）。

## 界面与样式（Tailwind）
- 布局：
  - 顶部标题与状态条：`flex` + `gap-2`。
  - 表单栅格：两列自适应（`grid grid-cols-1 md:grid-cols-2 gap-4`）。
  - 按钮区：`flex gap-2`，主要按钮采用 `bg-blue-600 hover:bg-blue-700 text-white`，取消按钮 `bg-gray-600`。
  - 进度条：外层 `bg-gray-200 rounded`，内层动态宽度 `bg-green-500`。
  - 日志面板：`h-48 overflow-auto bg-neutral-50 border rounded`。
- 表单字段：
  - `token` 输入框，`start_id`、`end_id` 数字框；可选 `concurrency`、`chunk_size`、`delay_ms`。
  - 输出目录选择与显示当前目录。
- 主题：默认浅色，预留暗黑模式（`dark:` 前缀）。

## 后端命令（Tauri）
- `crawl_courses(token, start_id, end_id, concurrency, chunk_size, delay_ms, out_dir)`：
  - `reqwest::Client` 构造 UA/Accept 头；必要时 `danger_accept_invalid_certs(true)`。
  - 并发控制 `tokio::Semaphore`；按 `chunk_size` 分组导出多个文件；每组文件名 `start-end.xlsx`。
  - 请求与判定：先 `lecture/{id}/info`，若视频（`verify_type in [1,2]`）再拉取 `liverooms/{liveroomId}/lectures/{lectureId}`，字段映射与 TS 保持一致。
  - 进度上报：每条完成 emit 事件；失败写入占位并计数，不中断。
- `merge_excels(paths[], out_path)`（可选）：读取多文件、重排 `index` 并写出。
- `cancel_task()`：取消令牌，中止新请求与任务收尾。

## Excel 写出
- 使用 `umya-spreadsheet` 或 `xlsxwriter-rs`；统一列头/宽度与顺序（与现有 ExcelJS 版一致）。
- 路径选择：默认下载目录，可由前端参数指定；写出后返回文件路径列表。

## 参数持久化
- 采用 `tauri-plugin-store` 或 `app_data_dir` JSON 保存最近一次 `token` 与表单参数；应用启动时回填。

## 错误处理与重试
- 针对网络/结构异常做 `retry=2`（指数退避）；超时设置与全局错误提示；SSL 忽略仅在必要时开启并在 UI 显示风险提示。

## 取消/暂停
- 通过 `CancellationToken` 支持取消；前端按钮触发命令；进度条停止并记录中止状态。

## Tailwind 集成步骤（以 bun 为包管理）
- 安装：`tailwindcss postcss autoprefixer` 开发依赖。
- 初始化：生成 `tailwind.config.ts` 与 `postcss.config.js`，`content` 指向 `index.html、src/**/*.{ts,tsx}`。
- 入口样式：在 `src/index.css` 写入 `@tailwind base; @tailwind components; @tailwind utilities;` 并在 `main.tsx` 引入。
- 组件上按需添加类名，避免自定义 CSS 文件，保持原子化风格。

## 打包与运行（Windows）
- 初始化 Tauri（创建 `src-tauri` 与 `tauri.conf.json`，配置应用名/图标/权限）。
- 开发：前端 `bun` 依赖安装；后端 `cargo` 构建；运行开发模式。
- 打包：生成安装包（`setup.exe`），供用户安装运行。

## 验收标准
- UI 样式符合 Tailwind 原子化规范，响应式体验良好；输入参数后可完成爬取与导出；进度与日志同步更新；可取消；导出路径可打开目录。
- 可选功能：分组导出与合并工作正常。

## 交付物
- 前端页面（表单 + 进度 + 日志 + 结果），Tailwind 样式完成。
- 后端命令与 Excel 写出逻辑；参数持久化与取消机制。
- README（安装、开发、打包、注意事项）。