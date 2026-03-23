# 合同智读 WebApp

一个基于 Node.js 的本地 WebApp，只审核以中国现行法律法规为基础的房屋租赁合同。系统只允许上传 `.docx` 文件，若上传其他合同类型或其他文件格式，会直接退回。

## 功能范围

- 仅支持中国房屋租赁合同审核
- 仅支持上传 `.docx` 文件
- 输出合同基本信息：合同主体、租赁期限、地点、租金
- 输出关键风险提示：优先承租权、租金押付条款、违约责任、违约金设置、出租权属
- 支持条款证据定位：点击风险点可跳转到解析出的合同原文段落
- 输出建议动作：`可以签`、`不可以签`、`咨询专业人士`
- 提供错误处理与健康检查接口 `/healthz`
- 支持环境变量配置，可部署到 Render

## 技术栈

- Node.js 20+
- Express
- Multer
- Mammoth
- 原生 HTML / CSS / JavaScript

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

复制 `.env.example` 为 `.env`，按需调整：

```env
PORT=3000
MAX_FILE_SIZE_MB=10
UPLOAD_DIR=uploads
```

3. 启动服务

```bash
npm start
```

开发模式：

```bash
npm run dev
```

4. 打开浏览器

访问 `http://localhost:3000`

## 健康检查

```bash
GET /healthz
```

返回示例：

```json
{
  "status": "ok",
  "service": "contract-intel-reader",
  "timestamp": "2026-03-23T00:00:00.000Z"
}
```

## 接口说明

### 上传审核

```bash
POST /api/review
Content-Type: multipart/form-data
field: contract
```

限制：

- 仅允许 `.docx`
- 超过 `MAX_FILE_SIZE_MB` 会返回错误
- 非房屋租赁合同会返回 `unsupported_contract_type`

## 风险判定说明

当前版本是规则型审核，不是法律意见系统。重点检查：

- 是否可识别为房屋租赁合同
- 是否提取到核心合同信息
- 是否存在优先承租权缺失或放弃表述
- 是否存在押金、租金支付周期不清或负担过重
- 是否缺少违约责任或责任明显偏向单方
- 是否存在明显偏高的违约金设置
- 是否缺少出租权属或有权出租说明

## Render 部署

仓库中已提供 `render.yaml`，也可以手动配置：

- Build Command: `npm install`
- Start Command: `npm start`
- Node version: `20`

推荐环境变量：

- `MAX_FILE_SIZE_MB=10`
- `UPLOAD_DIR=uploads`

## 项目结构

```text
contract/
├─ public/
│  ├─ app.js
│  ├─ index.html
│  └─ styles.css
├─ src/
│  ├─ lib/
│  │  ├─ analyzer.js
│  │  └─ docx.js
│  └─ server.js
├─ .env.example
├─ .gitignore
├─ package.json
├─ README.md
└─ render.yaml
```

## 说明

- 合同原文定位基于 DOCX 提取后的段落文本，不保留原始版式
- 审核结果用于合同初筛，不替代律师或专业法律意见
