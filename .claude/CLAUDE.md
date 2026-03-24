# CLAUDE.md

## 协作规则

- **回复语言**：始终用中文回复
- **代码风格**：保持与现有代码一致，不要自作主张重构未被要求的部分
- **提交代码**：除非我明确要求，否则不要执行 git commit / git push
- **确认再动**：删除文件、修改数据库结构、修改 docker-compose 等破坏性操作前，先和我确认
- **简洁回复**：不要重复我说过的话，直接给出结论或改动

---

## 项目概览

**BiliNote** — AI 视频笔记生成工具。输入视频链接（B站、YouTube、抖音、快手、本地文件），经过下载→转录→LLM 生成结构化 Markdown 笔记。

技术栈：FastAPI 后端 + React 19 前端 + 可选 Tauri 桌面端。

---

## 开发命令

### 后端（Python 3.12 + FastAPI）
```bash
cd backend
pip install -r requirements.txt
python main.py          # 启动在 0.0.0.0:8483
```

### 前端（React 19 + Vite + TypeScript）
```bash
cd BillNote_frontend    # 注意：目录名是 BillNote 不是 BiliNote
pnpm install
pnpm dev                # 开发服务器 port 3015，/api 代理到后端
pnpm build
pnpm lint
```

### Docker
```bash
docker-compose up                              # 完整栈（backend + frontend + nginx）
docker-compose -f docker-compose.gpu.yml up   # GPU 版本
```

---

## 架构速览

### 核心工作流
用户提交 URL → 任务入队 → 下载视频 → 提取音频（FFmpeg）→ 转录（Whisper/Groq 等）→ LLM 生成笔记 → 前端轮询结果 → 展示 Markdown + 思维导图

### 后端 `backend/`
| 路径 | 职责 |
|------|------|
| `main.py` | FastAPI 入口，端口 8483 |
| `app/routers/` | 路由：`note.py`（生成）、`provider.py`、`model.py`、`config.py`、`space.py`、`chat.py` |
| `app/services/note.py` | `NoteGenerator` 编排完整流水线 |
| `app/services/task_serial_executor.py` | 任务队列，默认 3 个 worker（`TASK_MAX_WORKERS` 环境变量控制） |
| `app/downloaders/` | 各平台下载适配器，共同继承 `base.py` |
| `app/transcriber/` | 转录引擎，`transcriber_provider.py` 工厂方法 |
| `app/gpt/` | LLM 集成，`gpt_factory.py` 工厂，`prompt_builder.py` 构建 prompt |
| `app/db/` | SQLite + SQLAlchemy，DAO 模式（`video_task_dao.py` 等） |
| `app/utils/response.py` | `ResponseWrapper` — 所有接口统一返回格式 |
| `events/` | Blinker 信号系统，用于转录后清理临时文件等后处理 |

### 前端 `BillNote_frontend/src/`
| 路径 | 职责 |
|------|------|
| `pages/HomePage/` | 主页：`NoteForm.tsx`（输入）、`MarkdownViewer.tsx`（预览）、`MarkmapComponent.tsx`（思维导图） |
| `pages/SpacePage/` | UP 主空间链接提取 + 批量生成 |
| `pages/SettingPage/` | LLM 提供商管理、转录配置、系统监控 |
| `store/taskStore/` | Zustand 持久化任务列表，任务状态：`PENDING → RUNNING → SUCCESS / FAILED` |
| `store/` | `modelStore`、`configStore`、`providerStore`、`spaceStore` |
| `services/` | Axios API 客户端，与后端路由一一对应 |
| `hooks/useTaskPolling.ts` | 每 3 秒轮询任务状态 |
| `components/ui/` | shadcn/ui（基于 Radix UI） |

路径别名：`@` → `./src`

---

## 关键配置

- **端口**：后端 8483，前端开发 3015，Docker 映射 3015→80
- **环境变量**：根目录 `.env`（从 `.env.example` 复制）。LLM API Key 通过 UI 配置，不走环境变量
- **数据库**：SQLite，路径 `backend/app/db/bili_note.db`，首次运行自动初始化
- **FFmpeg**：系统依赖，必须安装
- **Vite 代理**：`vite.config.ts` 里代理 `/api` 和 `/static` 到后端，env 从父目录读取

---

## 代码规范

### 前端
- ESLint + Prettier：2 空格缩进、单引号、100 字符行宽、Tailwind 插件
- TypeScript strict 模式
- 组件用函数式 + hooks，状态管理用 Zustand

### 后端
- Python type hints
- Pydantic models 做请求/响应校验
- 统一用 `ResponseWrapper` 包装返回值

---

## 常见坑

---

## TODO / 已知问题

<!-- 在这里记录当前正在做的事情或已知 bug，方便下次对话继续 -->
