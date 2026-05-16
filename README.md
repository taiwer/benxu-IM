# 企微客服通知系统 (Enterprise WeChat Chat System)

这是一个高效的客服聊天系统，支持访客在网页端直接发起咨询，系统会通过企业微信应用消息推送给客服。客服点击消息链接即可以 H5 页面形式实时回复访客。

## 核心功能

- **访客端**: 浮动聊天窗口、自动生成访客 ID（持久化）、WebSocket 实时通信、历史记录拉取。
- **客服端**: 企微图文消息推送、JWT 鉴权免登 H5 回复页、历史记录查看、实时消息推送。
- **后端**: 使用 FastAPI 风格的 Express (Node.js) 架构、SQLite 存储、WebSocket 服务。

---

## 配置指南

在启动项目之前，你需要配置环境变量。请在根目录创建 `.env` 文件（或修改 `.env.example`）：

### 1. 企业微信自建应用配置
1. 登录 [企业微信管理后台](https://work.weixin.qq.com/)。
2. **应用管理** -> **自建** -> **创建应用**（获取 `AgentID` 和 `Secret`）。
3. **我的企业** -> 最下方获取 `CorpID`。
4. **可信域名设置**: 在应用详情页设置“网页授权及 JS-SDK”中的“可信域名”为你的预览域名（如 `ais-dev-xxx.run.app`）。

### 2. 环境变量 (`.env`)
```env
# 企业微信配置
WECHAT_CORP_ID="你的CorpID"
WECHAT_CORP_SECRET="你的应用Secret"
WECHAT_AGENT_ID="你的应用AgentID"

# 系统配置
JWT_SECRET="自定义一个随机字符串用于鉴权"
APP_URL="你的预览域名地址 (如 https://xxx.run.app)"
```

---

## 安装与开发

### 1. 安装依赖
```bash
npm install
```

### 2. 启动开发服务器
开发模式下支持热更新（HMR）。
```bash
npm run dev
```
服务默认运行在 `http://localhost:3000`。

---

## 编译与部署

如果你准备将系统部署到生产环境，请执行以下步骤：

### 1. 编译项目
该命令会同时执行前端 Vite 构建和后端 esbuild 打包。
```bash
npm run build
```
编译产物将存放在 `dist/` 目录下。

### 2. 启动生产服务
```bash
npm run start
```

---

## 技术架构说明

- **前端**: React 19 + Tailwind CSS + Lucide Icons + Framer Motion.
- **后端**: Node.js + Express + WebSocket (ws).
- **数据库**: Better-SQLite3 (持久化存储会话和消息).
- **认证**: JWT (JsonWebToken) 用于客服回复链接的单次/限时授权。

## 配置“可信域名”特别说明
1. **企业微信限制**: 企微要求推送的链接必须在可信域名下，否则客服点击后可能会报“非可信域名”错误或无法获取用户信息。
2. **AI Studio 预览**: 请确保将 `APP_URL` 设置为当前的预览域名，并将其填入企微后台对应的“可信域名”输入框中。
