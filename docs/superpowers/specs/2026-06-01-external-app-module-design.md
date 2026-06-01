# BitFun ExternalApp 模块技术规格

> 基于 PRD: `docs/features/external-app-module-design.md`
> 设计日期: 2026-06-01

---

## 1. 概述

本规格定义 BitFun 外部应用（ExternalApp）模块的技术实现方案。外部应用允许通过 HTTP URL 直接嵌入独立部署的 Web 应用，无需经过 BitFun 的编译管线，与现有 MiniApp 形成平行补充。

### 1.1 核心设计决策

| 决策项 | 选择 | 说明 |
|---|---|---|
| 桥接注入方式 | 外部应用引入 SDK | 通过私有 npm 包 `@bitfun/sdk` 或 `<script>` 标签引入，由应用主动初始化桥接 |
| 画廊场景 | 独立场景 | `ExternalAppGalleryScene` 与 `MiniAppGalleryScene` 完全独立，不合并展示 |
| 元数据存储 | 后端 Rust 持久化 | 通过新增 Tauri 命令管理，非前端 IndexedDB |
| 网络访问限制 | 不限制 | 浏览器同源策略已提供足够隔离；BitFun 安全边界在桥接白名单而非网络层 |
| 第三方域名披露 | `bitfun.manifest.json` 可选 `businessDomains` | 仅作透明度展示，无技术强制执行 |

---

## 2. 架构总览

### 2.1 系统边界

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              BitFun 宿主                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌──────────────┐ │
│  │  ExternalAppScene   │    │ ExternalAppGallery  │    │  NavPanel    │ │
│  │  (iframe wrapper)   │    │   (卡片 + 添加面板)   │    │ (独立入口)    │ │
│  └──────────┬──────────┘    └─────────────────────┘    └──────────────┘ │
│             │                                                            │
│  ┌──────────▼──────────┐    ┌─────────────────────┐                     │
│  │ useExternalAppBridge│    │ externalAppStore    │                     │
│  │ (postMessage JSON-RPC)│   │ (Zustand, 元数据)   │                     │
│  └──────────┬──────────┘    └─────────────────────┘                     │
│             │ postMessage                                                 │
└─────────────┼────────────────────────────────────────────────────────────┘
              │ 跨域 iframe
┌─────────────▼────────────────────────────────────────────────────────────┐
│                         外部应用 (独立部署)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  npm install @bitfun/sdk                                           │ │
│  │  window.bitfun.ready(() => { ... })                                │ │
│  │  window.bitfun.on('command', (cmd) => { ... })                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                          /.well-known/bitfun.manifest.json               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

**前端**

```
src/web-ui/src/app/scenes/externalapps/
├── ExternalAppScene.tsx          # 场景外壳（Header + Runner）
├── ExternalAppGalleryScene.tsx   # 画廊场景
├── ExternalAppRunner.tsx         # iframe 渲染器
├── hooks/
│   └── useExternalAppBridge.ts   # postMessage 桥接
├── components/
│   ├── ExternalAppCard.tsx       # 应用卡片
│   ├── AddExternalAppDialog.tsx  # 添加应用弹窗
│   └── PermissionGrantPanel.tsx  # 首次授权面板
├── stores/
│   └── externalAppStore.ts       # Zustand store（元数据 + 授权记录）
└── types/
    └── externalApp.ts            # TypeScript 类型定义
```

**后端**

```
src/crates/core/src/service/external_app/     # 新增模块
├── mod.rs
├── models.rs           # ExternalAppMeta, ExternalAppPermissions
├── storage.rs          # 隔离存储（前缀 externalapp:{id}:）
├── manifest.rs         # bitfun.manifest.json 拉取与解析
└── commands.rs         # Tauri 命令实现

src/crates/core/src/agentic/tools/implementations/
└── control_external_app_tool.rs   # ControlExternalApp Tool
```

### 2.3 基座修改点

| 文件 | 修改 | 说明 |
|---|---|---|
| `SceneViewport.tsx` | `renderScene` 增加 `externalapp:` 分支 | 路由到 `ExternalAppScene` |
| `app/components/SceneBar/types.ts` | `SceneTabId` 增加 `` `externalapp:${string}` `` | 类型定义 |
| `app/scenes/registry.ts` | 新增 `getExternalAppSceneDef(appId, appName)` | 动态场景定义 |
| `app/stores/sceneStore.ts` | `getSceneDefOrMiniapp` 增加 `externalapp:` 分支 | tab 生命周期支持 |
| `app/components/NavPanel/MainNav.tsx` | 新增"外部应用"导航项 | 打开 `externalapps` 画廊场景 |

---

## 3. 前端设计

### 3.1 SceneViewport 路由

```tsx
default:
  if (typeof id === 'string' && id.startsWith('miniapp:')) {
    return <MiniAppScene appId={id.slice('miniapp:'.length)} />;
  }
  if (typeof id === 'string' && id.startsWith('externalapp:')) {
    return <ExternalAppScene appId={id.slice('externalapp:'.length)} />;
  }
  return null;
```

### 3.2 ExternalAppScene

组件职责：
1. 从后端加载应用元数据
2. 创建 iframe，src={appMeta.url}
3. iframe 加载后拉取 `/.well-known/bitfun.manifest.json`
4. 对比已授权权限，若存在未授权则弹出 `PermissionGrantPanel`
5. 用户确认后建立桥接，未授权能力不注入 `window.app`

与 `MiniAppScene` 的差异：
- 无 Worker 生命周期管理
- 无编译/草稿/预览逻辑
- 无重新编译按钮
- 增加授权面板状态机

### 3.3 ExternalAppRunner

```tsx
<iframe
  ref={iframeRef}
  src={url}
  data-app-id={appId}
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  style={{ width: '100%', height: '100%', border: 'none' }}
/>
```

sandbox 说明：
- `allow-same-origin`：外部应用需要与自身域名通信（API、WebSocket、Storage）
- `fs/shell/net/os` 不通过 sandbox 控制，而是通过桥接白名单控制

### 3.4 useExternalAppBridge

与 `useMiniAppBridge` 采用相同的 `postMessage` JSON-RPC 2.0 协议，但方法白名单不同：

| 方法 | ExternalApp | 说明 |
|---|---|---|
| `worker.call` | **不存在** | 外部应用无 Worker |
| `fs.*` / `shell.*` / `net.*` / `os.*` | **不存在** | 高敏感权限禁止 |
| `storage.get/set` | 支持 | 前缀隔离：`externalapp:{id}:{key}` |
| `ai.complete/chat/cancel/getModels` | 支持（可选） | 复用现有 MiniApp AI API |
| `dialog.open/save/message` | 支持 | 直接调用 Tauri dialog |
| `clipboard.writeText/readText` | 支持 | 直接调用 `navigator.clipboard` |
| `bitfun/request-theme` | 支持 | 推送主题变量 |
| `bitfun/request-locale` | 支持 | 推送语言变更 |

---

## 4. 桥接协议与 SDK

### 4.1 SDK 接口

```ts
interface BitFunSDK {
  ready: (callback: () => void) => void;

  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  ai: {
    complete: (prompt: string, options?: AiOptions) => Promise<AiResult>;
    chat: (messages: Message[], streamId: string, options?: AiOptions) => Promise<void>;
    cancel: (streamId: string) => Promise<void>;
    getModels: () => Promise<ModelInfo[]>;
  };
  dialog: {
    open: (options: OpenDialogOptions) => Promise<string | null>;
    save: (options: SaveDialogOptions) => Promise<string | null>;
    message: (options: MessageOptions) => Promise<boolean>;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
    readText: () => Promise<string>;
  };

  on: (event: 'themeChange' | 'localeChange' | 'command', handler: Function) => void;
  off: (event: string, handler: Function) => void;
  reportState: (state: Record<string, unknown>) => void;  // P1
}
```

### 4.2 postMessage 协议

```ts
// JSON-RPC 请求（外部应用 → 宿主）
{ jsonrpc: '2.0', id: 1, method: 'ai.complete', params: { prompt: 'Hello' } }

// JSON-RPC 响应（宿主 → 外部应用）
{ jsonrpc: '2.0', id: 1, result: { text: 'Hi there' } }

// 事件推送（宿主 → 外部应用）
{ type: 'bitfun:event', event: 'themeChange', payload: { ... } }
{ type: 'bitfun:event', event: 'command', payload: { action: 'setFilter', params: { ... } } }
{ type: 'bitfun:event', event: 'ai:stream', payload: { streamId, type, data } }
```

### 4.3 SDK 分发

- **私有 npm 包**：`@bitfun/sdk`（由 BitFun 团队维护私有仓库）
- **版本策略**：semver，v1 为初始稳定版
- **TypeScript 支持**：包含完整类型定义

---

## 5. 后端设计

### 5.1 Rust 元数据模型

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalAppMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub url: String,
    pub business_domains: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalAppPermissions {
    pub ai: ExternalAppAiPermission,
    pub storage: ExternalAppStoragePermission,
    pub dialog: bool,
    pub clipboard: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalAppAiPermission {
    pub enabled: bool,
    pub allowed_models: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalAppStoragePermission {
    pub enabled: bool,
}
```

### 5.2 Tauri 命令

| 命令 | 请求 | 响应 |
|---|---|---|
| `list_external_apps` | `{}` | `Vec<ExternalAppMeta>` |
| `get_external_app` | `{ appId }` | `ExternalAppMeta` |
| `create_external_app` | `{ name, url, icon?, description? }` | `ExternalAppMeta` |
| `update_external_app` | `{ appId, name?, url?, icon?, description? }` | `ExternalAppMeta` |
| `delete_external_app` | `{ appId }` | `()` |
| `get_external_app_storage` | `{ appId, key }` | `Option<Value>` |
| `set_external_app_storage` | `{ appId, key, value }` | `()` |
| `clear_external_app_storage` | `{ appId }` | `()` |
| `get_external_app_grants` | `{ appId }` | `Vec<String>` |
| `set_external_app_grants` | `{ appId, grants }` | `()` |

### 5.3 存储隔离

复用现有存储抽象，通过 key 前缀隔离：

```rust
fn storage_key(app_id: &str, user_key: &str) -> String {
    format!("externalapp:{}:{}", app_id, user_key)
}
```

不同外部应用之间、外部应用与宿主之间数据完全隔离。

### 5.4 ControlExternalApp Tool

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct ControlExternalAppRequest {
    pub action: ControlAction,
    pub app_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ControlAction {
    Open,
    SendCommand { command: String, params: Option<Value> },
    QueryState,
}
```

**工具描述动态拼接**：运行时根据 `bitfun.manifest.json` 中的 `commands` 和 `stateSchema` 生成描述，使 LLM 了解可操控接口。

---

## 6. 权限与授权

### 6.1 bitfun.manifest.json 格式

外部应用部署目录下放置 `/.well-known/bitfun.manifest.json`：

```json
{
  "$schema": "https://bitfun.dev/schemas/bitfun-manifest-v1.json",
  "version": "1.0.0",
  "capabilities": {
    "ai": {
      "enabled": true,
      "allowedModels": ["gpt-4", "claude-3"],
      "description": "允许调用 AI 对话和补全能力"
    },
    "storage": {
      "enabled": true,
      "description": "允许读写隔离存储"
    },
    "dialog": {
      "enabled": true,
      "description": "允许打开系统文件对话框"
    },
    "clipboard": {
      "enabled": false
    }
  },
  "commands": [
    {
      "name": "setFilter",
      "description": "设置列表筛选条件",
      "parameters": {
        "type": "object",
        "properties": {
          "timeRange": { "type": "string", "enum": ["today", "week", "month"] }
        }
      }
    }
  ],
  "stateSchema": {
    "type": "object",
    "properties": {
      "currentFilter": { "type": "string" },
      "itemCount": { "type": "number" }
    }
  },
  "businessDomains": ["https://api.myapp.com", "https://cdn.partner.com"]
}
```

### 6.2 首次授权面板

1. 用户打开外部应用 → 创建 iframe
2. iframe 加载后，宿主拉取 `bitfun.manifest.json`
3. 对比后端存储的已授权列表
4. 存在未授权能力 → 弹出 `PermissionGrantPanel`：
   - 列明每项能力名称 + 描述
   - "全选授权" 和 "逐项勾选"
   - "拒绝" 按钮（关闭 iframe）
5. 用户确认 → 调用 `set_external_app_grants` 持久化
6. 桥接建立，未授权能力在 `window.app` 中不存在

### 6.3 授权记录管理（P1）

- 设置面板查看已安装外部应用及授权列表
- 逐项撤回权限（撤回后立即生效）
- "重置数据"按钮：清空 storage + 授权记录

---

## 7. 数据流

### 7.1 externalAppStore

```ts
interface ExternalAppStore {
  apps: ExternalAppMeta[];
  loading: boolean;
  grants: Map<string, Set<string>>;
  capabilities: Map<string, Capabilities>;
  stateCache: Map<string, unknown>;  // P1

  loadApps: () => Promise<void>;
  addApp: (meta: CreateExternalAppRequest) => Promise<void>;
  removeApp: (appId: string) => Promise<void>;
  fetchManifest: (appId: string, url: string) => Promise<Capabilities>;
  setGrants: (appId: string, grants: string[]) => Promise<void>;
  revokeGrant: (appId: string, capability: string) => Promise<void>;
  clearAllData: (appId: string) => Promise<void>;
}
```

### 7.2 iframe 生命周期

```
用户打开 externalapp:id
    │
    ▼
加载元数据（后端 API）
    │
    ▼
创建 iframe，src={url}
    │
    ▼
iframe onLoad
    │
    ▼
拉取 bitfun.manifest.json
    │
    ▼
检查已授权列表
    │
    ├─ 全部已授权 ──► 建立桥接
    │
    └─ 存在未授权 ──► 弹出授权面板
                          │
                          ▼
                    用户确认 ──► 持久化授权 ──► 建立桥接
                    用户拒绝 ──► 关闭 iframe
```

### 7.3 状态上报与缓存（P1）

外部应用通过 SDK 主动上报：

```ts
window.bitfun.reportState({ currentFilter: 'week', itemCount: 42 });
```

宿主缓存到 `externalAppStore.stateCache`。`ControlExternalApp` 的 `queryState` 优先读缓存，缓存失效时 fallback 通过 `postMessage` 询问 iframe。

---

## 8. 错误处理

| 场景 | 处理策略 |
|---|---|
| 外部应用 URL 无法加载 | iframe `onError` / `onLoad` 超时检测，展示错误面板，提供"编辑 URL"和"删除应用" |
| `bitfun.manifest.json` 拉取失败 | 降级为基础能力（仅 `storage` + `theme/locale`），提示"未检测到能力声明" |
| `bitfun.manifest.json` 格式无效 | 同上降级处理，控制台打印解析错误 |
| 用户拒绝授权 | 关闭 iframe，标签页显示"等待授权"占位态，提供"重新授权"按钮 |
| 跨域 `postMessage` 被拦截 | SDK 初始化超时检测，iframe 内提示"无法连接到 BitFun 宿主" |
| 调用未授权能力 | 桥接返回 `JSON-RPC error: capability not granted`，外部应用自行处理 |
| iframe 内弹窗被阻止 | `sandbox` 已含 `allow-popups`，若仍被阻止属浏览器策略 |
| 外部应用 SSL 证书无效 | 浏览器安全策略阻止加载，BitFun 展示浏览器级错误信息 |

---

## 9. 测试策略

### 9.1 单元测试

- `useExternalAppBridge`：模拟 `postMessage` 收发，验证方法白名单过滤
- `externalAppStore`：状态变更、授权逻辑、缓存逻辑
- `bitfun.manifest.json` 解析：有效/无效/缺失字段
- `PermissionGrantPanel`：全选、逐项勾选、拒绝交互

### 9.2 集成测试

- 添加外部应用 → 打开 → 授权 → 使用：端到端数据流
- `ControlExternalApp` Tool：Rust 调用 → 前端 iframe 接收 → 外部应用响应
- 权限撤回：撤回后 iframe 内对应能力消失
- 一键清空：storage 和授权记录同时清除

### 9.3 契约测试

- `bitfun.manifest.json` schema 校验（新增 JSON Schema 文件）
- SDK `postMessage` 协议版本兼容性

---

## 10. 需求追踪

### P0 — 必须交付

| ID | 需求 | 实现位置 |
|---|---|---|
| P0-1 | `externalapp:` 场景类型 | `SceneViewport.tsx`, `types.ts` |
| P0-2 | 外部应用元数据管理 | `external_app/commands.rs`, `externalAppStore.ts` |
| P0-3 | iframe 通过 `src` 加载外部 URL | `ExternalAppRunner.tsx` |
| P0-4 | 简化桥接脚本注入 | `@bitfun/sdk`, `useExternalAppBridge.ts` |
| P0-5 | `bitfun.manifest.json` 拉取与解析 | `external_app/manifest.rs` |
| P0-6 | 首次使用权限授权面板 | `PermissionGrantPanel.tsx` |
| P0-7 | 隔离存储 | `external_app/storage.rs` |
| P0-8 | 画廊入口与标签页管理 | `ExternalAppGalleryScene.tsx`, `NavPanel/MainNav.tsx` |
| P0-9 | `ControlExternalApp` Rust Tool | `control_external_app_tool.rs` |

### P1 — 重要优化

| ID | 需求 | 实现位置 |
|---|---|---|
| P1-1 | 状态主动上报与缓存 | `SDK.reportState`, `externalAppStore.stateCache` |
| P1-2 | 一键清空缓存入口 | `clear_external_app_storage` |
| P1-3 | 授权记录管理面板 | 设置面板扩展 |
| P1-4 | 外部应用分类与搜索 | `ExternalAppGalleryScene.tsx` |

### P2 — 未来考虑

| ID | 需求 | 说明 |
|---|---|---|
| P2-1 | 外部应用市场/发现页 | 支持从远程索引安装 |
| P2-2 | PWA 增强适配 | 检测 Service Worker，提示离线能力 |
| P2-3 | 权限变更重新授权 | `bitfun.manifest.json` 版本变更时自动触发重新确认 |
| P2-4 | 后端元数据持久化 | 已完成（本规格已选择后端持久化） |

---

## 11. 待确认问题（已解决）

| 问题 | 决议 |
|---|---|
| 外部应用元数据存储在前端还是后端？ | **后端 Rust 持久化** |
| 跨域 iframe 的 `postMessage` 是否需要校验 origin？ | **是**，校验 `event.origin === new URL(url).origin` |
| AI 发送指令到外部应用后的超时与重试策略？ | **5 秒超时，不重试**，失败由 LLM 自行决策 |
| 是否允许外部应用调用 `app.ai.chat` 流式接口？ | **允许**，复用现有 MiniApp 的 `ai:stream` 事件通道 |
| `bitfun.manifest.json` 格式 schema 是否复用现有 tool schema？ | **复用 JSON Schema 子集**，降低 LLM 理解成本 |
| 桥接脚本注入方式？ | **外部应用引入 SDK**（私有 npm 包 `@bitfun/sdk`） |
| 画廊场景独立还是合并？ | **完全独立**，不与 MiniApp 耦合 |
| 第三方域名限制？ | **不做技术限制**，`bitfun.manifest.json` 中可选 `businessDomains` 仅作透明度披露 |

---

## 12. 附录：架构原则

1. **共享 UI 外壳，独立逻辑内核**：复用场景注册与标签页布局，但桥接、存储、权限、生命周期完全独立。
2. **前端闭环，后端最小侵入**：除元数据 CRUD API 和 `ControlExternalApp` Tool 外，全部逻辑放在前端 TypeScript；不新增 Rust crate，仅在 `core` 下新增模块。
3. **默认最小权限**：外部应用默认仅拥有 `storage` 和 `theme/locale` 同步，其他能力必须显式声明且经用户同意后才注入桥接。
4. **HTTP 应用不碰高敏感权限**：`fs`/`shell`/`net`/`os` 仅限编译型 MiniApp，外部应用绝对禁止。
