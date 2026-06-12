# 社交平台发现页（全栈项目）

## 项目介绍
本项目是一个面向 PC 端的社交平台“发现”页产品化实现，包含完整的前后端与数据库能力。项目围绕“内容发现 + 社交互动闭环”建设，支持用户从注册登录到浏览、发布、互动、消息通知、设置管理、个人主页回看的一整套流程。

项目默认中文界面，采用三栏信息架构（左导航、中信息流、右侧推荐模块），兼顾响应式与主流浏览器（Chrome / Safari）兼容。

## 项目功能
- 账号体系：支持邮箱注册、登录、退出、刷新会话、获取当前用户信息，采用 `HttpOnly Cookie + Refresh Token` 会话管理。
- 发现页与内容流：三栏布局（左导航、中信息流、右侧模块），支持频道切换（热门/同城）、模式切换（推荐/热门榜/发现）、无限滚动与切换防闪屏。
- 动态发布与媒体：支持图文/视频发布，媒体上传到后端本地静态目录，包含上传前后校验与错误反馈。
- 社交互动闭环：支持点赞、评论、关注、转发，互动具备乐观更新与失败回滚。
- 转发能力：已实现微博式转发，可填写短评，转发后生成新动态并引用原动态。
- 搜索与话题：支持搜索建议、结果聚合（动态/用户/话题）与话题详情后端分页拉流。
- 个人中心：支持主页概览与内容分栏（动态 / 媒体 / 点赞），其中点赞分栏仅本人可见。
- 消息中心：支持互动通知（赞/评/转/关）、未读计数、单条已读、全部已读、分类筛选。
- 设置中心：支持资料编辑、密码修改、通知偏好、头像图片上传。
- 创作者中心：支持基础数据看板（发布、互动趋势、热门内容）。

## 技术细节
- 前端：`Vite + React 18 + TypeScript`，UI 使用 `TailwindCSS + shadcn/ui + Radix UI`，路由使用 `React Router`。
- 前端工程能力：`Axios` 拦截器处理 401 自动刷新 access token（单飞刷新队列），`React Hook Form + Zod` 负责表单校验与错误高亮，`Sonner` 实现顶部居中 Toast。
- 后端：`Express 5 + TypeScript + Prisma`，统一响应结构（成功 `{ code, message, data }`，失败 `{ code, message, details? }`），鉴权中间件支持 `optionalAuth` 与 `requireAuth`。
- 数据库：PostgreSQL，核心模型包括 `User`、`AuthSession`、`Post`、`PostMedia`、`Like`、`Comment`、`Repost`、`Follow`、`Topic`、`Notification`、`UserSettings`。
- 转发模型细节：`Post.repostOfId` 使用自关联，支持“转发动态引用原动态”。
- 容器与包管理：Monorepo 使用 `pnpm workspace`，容器编排使用 `docker-compose`，镜像源为 `https://registry.npmmirror.com`。

## 项目目录结构
```text
project/
├─ frontend/                  # 前端工程（Vite + React）
│  ├─ src/
│  │  ├─ api/                 # 前端接口层
│  │  ├─ components/          # UI 组件与业务组件
│  │  ├─ context/             # 全局上下文（如登录态）
│  │  ├─ hooks/               # 自定义 hooks（如无限滚动）
│  │  ├─ pages/               # 页面（index/login/register/...）
│  │  └─ types/               # 前端类型定义
│  └─ Dockerfile
├─ backend/                   # 后端工程（Express + Prisma）
│  ├─ prisma/
│  │  ├─ schema.prisma        # 数据模型
│  │  └─ seed.ts              # 种子数据
│  ├─ src/
│  │  ├─ config/              # 环境与数据库配置
│  │  ├─ middleware/          # 鉴权/异常处理中间件
│  │  ├─ modules/             # 业务模块（auth/discovery/posts/...）
│  │  └─ utils/               # 工具函数
│  ├─ uploads/                # 本地上传与种子静态资源
│  └─ Dockerfile
├─ docker-compose.yml         # 一键启动编排
├─ pnpm-workspace.yaml        # workspace 配置
└─ README.md
```

## 项目部署
### 1. 环境准备
- 安装 Docker 与 Docker Compose。
- 安装 Node.js 20+（本地非 Docker 开发时需要）。
- 安装 pnpm（建议最新版本）。

### 2. 一键启动（推荐）
在项目根目录执行：

```bash
docker compose up --build
```

启动后默认端口：
- 前端：`http://localhost:3000`
- 后端：`http://localhost:38771`
- 数据库：`localhost:38772`

### 3. 停止服务
```bash
docker compose down
```

### 4. 本地开发（可选）
```bash
pnpm install
pnpm -r build
pnpm -r --parallel dev
```

### 5. 数据库与种子说明
- 后端容器启动时会自动执行 `prisma generate`、`prisma db push`、`prisma db seed`。

### 6. 演示账号
- 邮箱：`demo@social.com`
- 密码：`123456`

### 7. 健康检查
- 后端健康接口：`GET /health`
- 示例：`http://localhost:38771/health`

## 补充说明
- 上传文件默认保存在 `backend/uploads`，用于开发环境。
- 本项目默认中文文案与橙色品牌视觉体系。
- 若用于生产环境，建议补充 HTTPS、日志审计、对象存储与更严格的安全策略。
