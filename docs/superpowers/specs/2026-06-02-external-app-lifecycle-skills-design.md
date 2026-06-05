# BitFun 外部应用生命周期管理内置技能规格

> 前置规格：`docs/superpowers/specs/2026-06-01-external-app-module-design.md`
> 设计日期：2026-06-02

---

## 1. 概述

本规格定义 BitFun 外部应用（ExternalApp）的 **AI 内置生命周期管理技能**。目标是将外部应用的完整生命周期（添加、删除、更新、查询、打开、关闭、命令执行）暴露为 LLM 始终可见的内置工具，解决当前动态注册工具不可见、以及 `ControlExternalAppTool` 仅为 mock 的问题。

### 1.1 核心设计决策

| 决策项 | 选择 | 说明 |
|---|---|---|
| 管理工具聚合方式 | 单工具多 action（`ExternalAppManager`） | 与现有 `ControlExternalAppTool` 对称，减少 LLM 学习成本 |
| open/close 实现路径 | `ToolUseContext` 注入 `ExternalAppHost` trait | 与 `computer_use_host` 架构对齐，避免 queue 轮询的延迟和复杂性 |
| execute_command 实现路径 | `ExternalAppHost` 内部封装 `tool_call_queue` | 仍需与前端 iframe 通信，queue 封装在 host 实现中 |
| 动态工具 `ExternalAppCommandTool` | 保留但降级为备用 | 主要执行路径改为 `ControlExternalApp(execute_command)`，兼容已有代码 |
| 平台边界 | core 定义 trait，desktop 实现 | 保持 core 平台无关，server/cli 可提供空实现或报错 |

---

## 2. 架构总览

### 2.1 系统边界

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LLM / Agent 层                                  │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │ ExternalAppManager Tool │    │      ControlExternalApp Tool            │ │
│  │  (list/get/add/remove/  │    │  (open / close / execute_command /      │ │
│  │   update / list_commands)│   │   query_state)                          │ │
│  └───────────┬─────────────┘    └──────────────────┬──────────────────────┘ │
│              │                                      │                        │
│              ▼                                      ▼                        │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │  ExternalAppService     │    │  ToolUseContext.external_app_host       │ │
│  │  (list_apps/get_app/    │    │         │                               │ │
│  │   create_app/delete_app/│    │         ▼                               │ │
│  │   update_app)           │    │  ┌─────────────────────────────────┐    │ │
│  └─────────────────────────┘    │  │ ExternalAppHost trait (async)   │    │ │
│                                 │  │  • open_app(app_id)             │    │ │
│                                 │  │  • close_app(app_id)            │    │ │
│                                 │  │  • query_app_state(app_id)      │    │ │
│                                 │  │  • execute_command(...)         │    │ │
│                                 │  └─────────────────────────────────┘    │ │
│                                 └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ 平台适配
┌─────────────────────────────────────────────────────────────────────────────┐
│                           bitfun-desktop                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DesktopExternalAppHost                                                  ││
│  │  • open_app    → Tauri API: create WebviewWindow (external-app-window) ││
│  │  • close_app   → Tauri API: close WebviewWindow                        ││
│  │  • query_state → 查询窗口存在性 + 前端状态缓存                          ││
│  │  • execute_command → 复用 tool_call_queue → iframe postMessage         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构变更

```
src/crates/core/src/agentic/tools/
├── implementations/
│   ├── external_app_manager_tool.rs      # [新增] 管理工具
│   ├── control_external_app_tool.rs      # [重写] 从 mock 到实际实现
│   ├── external_app_command_tool.rs      # [保留] 动态工具（备用路径）
│   └── mod.rs                            # [修改] 导出新增模块
├── external_app_host.rs                  # [新增] ExternalAppHost trait
└── tool_context_runtime.rs               # [修改] ToolUseContext 扩展

src/crates/core/src/service/external_app/
├── mod.rs                                # [修改] 导出 tool_call_queue
└── tool_call_queue.rs                    # [保留] execute_command 仍用它

src/crates/tool-packs/src/lib.rs          # [修改] 注册 ExternalAppManager

src/apps/desktop/src/
├── lib.rs                                # [修改] 注入 DesktopExternalAppHost
└── external_app_host.rs                  # [新增] DesktopExternalAppHost 实现
```

---

## 3. 工具设计

### 3.1 ExternalAppManager Tool（新增）

**职责：** 管理外部应用的元数据和命令列表查询。纯后端操作，不依赖前端或窗口状态。

**工具名：** `ExternalAppManager`

**输入 Schema：**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "list_apps",
        "get_app_info",
        "list_commands",
        "add_app",
        "remove_app",
        "update_app"
      ]
    },
    "app_id": { "type": "string", "description": "Required for get_app_info, list_commands, remove_app, update_app" },
    "url": { "type": "string", "description": "Required for add_app" }
  },
  "required": ["action"]
}
```

**Action 详情：**

| Action | 必需字段 | 功能 | 返回值 |
|---|---|---|---|
| `list_apps` | 无 | 列出所有已安装外部应用 | `[{id, name, url, version, command_count}]` |
| `get_app_info` | `app_id` | 获取应用完整元数据 | `{id, name, description, url, version, icon, commands: [...]}` |
| `list_commands` | `app_id` | 列出应用所有命令（扁平化） | `[{name, description, parameters}]` |
| `add_app` | `url` | 拉取 manifest 并安装 | 新创建的 `ExternalAppMeta` |
| `remove_app` | `app_id` | 卸载应用 | `{success: true}` |
| `update_app` | `app_id` | 重新拉取 manifest 更新 | 更新后的 `ExternalAppMeta` |

**实现要点：**
- `list_apps` / `get_app_info` / `remove_app`：直接调用 `ExternalAppService` 已有 API
- `list_commands`：调用 `ExternalAppService::get_app(app_id)`，提取 `commands` 字段返回
- `add_app`：
  1. 使用 `reqwest` 拉取 `{url}/.well-known/bitfun.manifest.json`
  2. 解析 `ManifestCapabilities`
  3. 调用 `ExternalAppService::create_app(CreateExternalAppRequest { ... })`
- `update_app`：
  1. 获取现有应用 URL
  2. 重新拉取 manifest
  3. 调用 `ExternalAppService::update_app(app_id, UpdateExternalAppRequest { ... })`

**权限要求：** `needs_permissions` 返回 `true`（添加/删除/更新为破坏性操作）。

---

### 3.2 ControlExternalApp Tool（重写）

**职责：** 控制外部应用的运行状态和命令执行。通过 `ExternalAppHost` trait 调用，实际行为由平台适配层实现。

**工具名：** `ControlExternalApp`

**输入 Schema（修订版）：**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["open", "close", "execute_command", "query_state"]
    },
    "app_id": { "type": "string" },
    "command": { "type": "string", "description": "Required for execute_command" },
    "params": { "type": "object", "description": "Optional for execute_command" }
  },
  "required": ["action", "app_id"]
}
```

**Action 详情：**

| Action | 必需字段 | 功能 | 实现路径 |
|---|---|---|---|
| `open` | `app_id` | 打开外部应用窗口 | `external_app_host.open_app(app_id)` |
| `close` | `app_id` | 关闭外部应用窗口 | `external_app_host.close_app(app_id)` |
| `execute_command` | `app_id`, `command` | 执行应用命令 | `external_app_host.execute_command(...)` |
| `query_state` | `app_id` | 查询应用当前状态 | `external_app_host.query_app_state(app_id)` |

**`call_impl` 伪代码：**

```rust
async fn call_impl(&self, input: &Value, context: &ToolUseContext) -> BitFunResult<Vec<ToolResult>> {
    let request: ControlExternalAppRequest = serde_json::from_value(input.clone())?;
    let host = context.external_app_host
        .ok_or_else(|| BitFunError::Tool("External app host not available".to_string()))?;

    let result = match request.action {
        ControlAction::Open => host.open_app(&request.app_id).await?,
        ControlAction::Close => host.close_app(&request.app_id).await?,
        ControlAction::ExecuteCommand { command, params } => {
            host.execute_command(&request.app_id, &command, params.unwrap_or_default()).await?
        }
        ControlAction::QueryState => host.query_app_state(&request.app_id).await?,
    };

    Ok(vec![ToolResult::ok(result, None)])
}
```

**权限要求：** `needs_permissions` 返回 `true`（所有 action 都可能改变应用状态）。

---

## 4. ExternalAppHost 平台抽象

### 4.1 Trait 定义

```rust
use async_trait::async_trait;
use serde_json::Value;
use crate::util::errors::BitFunResult;

/// Platform-agnostic host for external app window lifecycle and command execution.
/// Implemented by bitfun-desktop; server/cli may provide a no-op or error impl.
#[async_trait]
pub trait ExternalAppHost: Send + Sync {
    /// Open an external app in a dedicated window/tab.
    async fn open_app(&self, app_id: &str) -> BitFunResult<Value>;

    /// Close the external app's window/tab.
    async fn close_app(&self, app_id: &str) -> BitFunResult<Value>;

    /// Query the current runtime state of an external app.
    async fn query_app_state(&self, app_id: &str) -> BitFunResult<Value>;

    /// Execute a command on an external app.
    /// Desktop implementation internally uses tool_call_queue for iframe communication.
    async fn execute_command(
        &self,
        app_id: &str,
        command: &str,
        params: Value,
    ) -> BitFunResult<Value>;
}

/// Type alias for Arc<dyn ExternalAppHost>, stored in ToolUseContext.
pub type ExternalAppHostRef = Arc<dyn ExternalAppHost>;
```

### 4.2 ToolUseContext 扩展

```rust
pub struct ToolUseContext {
    // ... existing fields ...
    pub computer_use_host: Option<crate::agentic::tools::computer_use_host::ComputerUseHostRef>,
    /// External app window lifecycle host; only set in BitFun desktop.
    pub external_app_host: Option<crate::agentic::tools::external_app_host::ExternalAppHostRef>,
    // ...
}
```

### 4.3 DesktopExternalAppHost 实现

```rust
use bitfun_core::agentic::tools::external_app_host::ExternalAppHost;
use bitfun_core::service::external_app::tool_call_queue::get_external_app_tool_call_queue;
use tauri::{AppHandle, Manager};

pub struct DesktopExternalAppHost {
    app_handle: AppHandle,
}

#[async_trait]
impl ExternalAppHost for DesktopExternalAppHost {
    async fn open_app(&self, app_id: &str) -> BitFunResult<Value> {
        // Reuse existing Tauri command logic from external_app_api.rs
        // 1. Get app meta from ExternalAppService
        // 2. Create WebviewWindow with label "external-app-{app_id}"
        // 3. Return {success: true, window_label: "..."}
    }

    async fn close_app(&self, app_id: &str) -> BitFunResult<Value> {
        // Find window by label "external-app-{app_id}" and close it
        // Return {success: true}
    }

    async fn query_app_state(&self, app_id: &str) -> BitFunResult<Value> {
        // Check if window exists
        // Optionally query frontend state cache (P1)
        // Return {is_open: bool, window_label: Option<String>}
    }

    async fn execute_command(
        &self,
        app_id: &str,
        command: &str,
        params: Value,
    ) -> BitFunResult<Value> {
        // Internally use tool_call_queue (same as ExternalAppCommandTool)
        let queue = get_external_app_tool_call_queue();
        let (call_id, rx) = queue.enqueue(app_id.to_string(), command.to_string(), params);
        // Wait for frontend to execute (30s timeout)
        // Return result data
    }
}
```

**注入位置：** `src/apps/desktop/src/lib.rs` 中，在 `ToolPipeline` 创建时传入：

```rust
let external_app_host: ExternalAppHostRef =
    Arc::new(external_app_host::DesktopExternalAppHost::new(app_handle.clone()));

let tool_pipeline = Arc::new(tools::pipeline::ToolPipeline::new(
    tool_registry,
    tool_state_manager,
    Some(computer_use_host),
    Some(external_app_host),  // [新增]
));
```

---

## 5. 工具注册

### 5.1 tool-packs 注册

在 `src/crates/tool-packs/src/lib.rs` 的 `product_tool_provider_group_plan()` 中，`core.integration` 组新增 `ExternalAppManager`：

```rust
ToolProviderGroupPlan {
    provider_id: "core.integration",
    tool_names: vec![
        // ... existing tools ...
        "ControlExternalApp",
        "ExternalAppManager",  // [新增]
        "ControlHub",
        // ...
    ],
}
```

### 5.2 product_runtime 注册

在 `src/crates/core/src/agentic/tools/product_runtime.rs` 的 `materialize_tool` 中新增分支：

```rust
fn materialize_tool(tool_name: &str) -> Arc<dyn Tool> {
    match tool_name {
        // ... existing tools ...
        "ControlExternalApp" => Arc::new(ControlExternalAppTool::new()),
        "ExternalAppManager" => Arc::new(ExternalAppManagerTool::new()),  // [新增]
        // ...
    }
}
```

### 5.3 动态工具 `ExternalAppCommandTool` 处理

保留 `ExternalAppCommandTool` 及其实例化逻辑，但主执行路径切换为 `ControlExternalApp(execute_command)`。动态工具继续注册到 `ToolRegistry` 中，作为 LLM 直接可见的备选方案（当应用已安装且命令明确时，可直接调用）。

**无需删除** `external_app_command_tool.rs` 或相关动态注册代码。

---

## 6. 关键交互流程

### 6.1 完整生命周期示例：添加并打开应用

```
用户: "添加外部应用 https://demo.example.com"
  │
  ▼
LLM: 调用 ExternalAppManager(action="add_app", url="https://demo.example.com")
  │
  ▼
Rust: 拉取 manifest → create_app → 返回 {id: "app-xxx", name: "Demo", commands: [...]}
  │
  ▼
LLM: "已成功添加应用 Demo（ID: app-xxx），包含命令：setFilter、refreshList。"
```

### 6.2 命令执行示例："使用 setFilter"

```
用户: "使用 setFilter 设置任务列表的筛选条件为 today"
  │
  ▼
LLM: 不确定 setFilter 属于哪个应用
  │
  ▼
LLM: 调用 ExternalAppManager(action="list_commands", app_id="?") 
      → 实际上先调用 list_apps 获取所有应用，再对目标应用调用 list_commands
      或更好的：list_apps 返回 command_count，然后对每个应用 list_commands
      但 LLM 也可以直接调用 list_apps 看到所有应用的命令摘要
  │
  ▼
Rust: 返回 [{app: "demo-app", commands: [{name: "setFilter", description: "..."}]}]
  │
  ▼
LLM: 找到目标应用 demo-app
  │
  ▼
LLM: 调用 ControlExternalApp(action="open", app_id="demo-app")
  │
  ▼
Rust: DesktopExternalAppHost::open_app → Tauri 创建窗口 → 返回 {success: true}
  │
  ▼
LLM: 调用 ControlExternalApp(action="execute_command", app_id="demo-app",
                               command="setFilter", params={"filter": "today"})
  │
  ▼
Rust: DesktopExternalAppHost::execute_command → enqueue to queue
      前端轮询 → iframe postMessage → SDK 执行 → 提交结果
      → 返回 {success: true, data: {...}}
  │
  ▼
LLM: "已设置 Demo 应用的筛选条件为 today。"
```

### 6.3 LLM 工具选择决策树

```
用户意图涉及外部应用？
  │
  ├─ 管理类（添加/删除/更新/查询）
  │     └─ ExternalAppManager
  │
  └─ 控制类（打开/关闭/执行命令/查询状态）
        └─ ControlExternalApp
              │
              ├─ 已知具体命令 + 应用已打开
              │     └─ execute_command（直接）
              │
              └─ 需要查找命令 / 不确定应用状态
                    └─ 先 query_state / 用户询问
                    └─ 必要时先 open
```

---

## 7. 错误处理

| 场景 | 错误信息 | LLM 可采取的恢复策略 |
|---|---|---|
| `ExternalAppManager::add_app` URL 无效或 manifest 不存在 | `"Failed to fetch manifest from {url}: {http_error}"` | 提示用户检查 URL 或网络 |
| `ExternalAppManager::add_app` manifest 格式无效 | `"Invalid manifest format: {parse_error}"` | 提示用户检查 manifest JSON |
| `ExternalAppManager::*` app_id 不存在 | `"External app not found: {app_id}"` | 调用 `list_apps` 确认可用应用 |
| `ControlExternalApp::open` 窗口创建失败 | `"Failed to open external app window: {tauri_error}"` | 重试或告知用户 |
| `ControlExternalApp::close` 窗口未找到 | `"External app window not found (already closed?)"` | 视为成功，继续下一步 |
| `ControlExternalApp::execute_command` 应用未打开 | `"External app is not running. Please open it first."` | 自动调用 `open` 后重试 |
| `ControlExternalApp::execute_command` 命令不存在 | `"Command '{command}' not found in app '{app_id}'"` | 调用 `list_commands` 确认 |
| `ControlExternalApp::execute_command` 超时 | `"Command timed out after 30s. The app may not be responding."` | 提示用户检查应用状态 |
| `ControlExternalApp::*` `external_app_host` 未设置 | `"External app host not available (not running in desktop?)"` | 告知用户此功能仅限桌面端 |

---

## 8. 测试策略

### 8.1 单元测试（Rust）

**ExternalAppManagerTool**
- `list_apps`：返回空列表 / 包含多个应用的列表
- `get_app_info`：有效 app_id / 无效 app_id（404）
- `list_commands`：提取 commands 字段 / 无命令时返回空数组
- `add_app`：模拟 HTTP manifest 拉取成功 / 失败 / 格式错误
- `remove_app`：成功删除 / 删除不存在的应用
- `update_app`：重新拉取并更新 / URL 不变时仅刷新 manifest

**ControlExternalAppTool（mock host）**
- 使用 mock `ExternalAppHost` 实现测试所有 action
- `open` / `close` / `query_state` / `execute_command` 正确路由到 host
- `external_app_host` 为 `None` 时返回适当错误

**DesktopExternalAppHost**
- `open_app`：正确构造窗口 label，调用 Tauri API
- `close_app`：正确查找并关闭窗口
- `query_state`：窗口存在 / 不存在
- `execute_command`：正确 enqueue 到 queue，处理成功/失败/超时

### 8.2 集成测试

- **端到端：** `ExternalAppManager` 添加应用 → `ControlExternalApp` 打开 → `execute_command` → 验证 iframe 收到 postMessage
- **与现有动态工具兼容：** `ExternalAppCommandTool` 仍可通过原有路径调用
- **错误恢复：** execute_command 返回"未打开" → LLM 自动 open → 再次 execute_command

### 8.3 契约测试

- `ExternalAppHost` trait 的各实现（Desktop / 未来 Server）行为一致性
- `ControlExternalAppTool` 输入 schema 兼容性（与现有 `ControlExternalAppRequest` 结构差异最小化）

---

## 9. 范围与取舍

### 包含在本规格

- `ExternalAppManagerTool` 完整实现（6 个 action）
- `ControlExternalAppTool` 从 mock 到实际实现（4 个 action）
- `ExternalAppHost` trait 定义
- `DesktopExternalAppHost` 实现
- `ToolUseContext` 扩展
- 工具注册更新

### 不包含（避免过度设计）

- **外部应用权限管理（grants）**：已有独立 API，不纳入工具
- **外部应用 AI 能力（ai_complete/chat）**：已有独立 API 和桥接协议
- **外部应用 storage 管理**：已有独立 API
- **状态主动上报（P1）**：依赖 SDK `reportState`，当前规格 `query_state` 仅返回窗口存在性
- **Server/CLI 端的 `ExternalAppHost` 实现**：标记为 `todo!("not supported")` 或返回错误

### 向后兼容

- `ControlExternalApp` 工具名不变，LLM 调用方式基本不变（action 枚举微调）
- `ExternalAppCommandTool` 动态注册逻辑不变，现有外部应用不受影响
- `tool_call_queue` 结构不变，前端轮询逻辑无需修改

---

## 10. 需求追踪

| ID | 需求 | 实现文件 |
|---|---|---|
| P0-1 | `ExternalAppManagerTool` 定义与实现 | `external_app_manager_tool.rs` |
| P0-2 | `ControlExternalAppTool` 重写（非 mock） | `control_external_app_tool.rs` |
| P0-3 | `ExternalAppHost` trait 定义 | `external_app_host.rs` |
| P0-4 | `DesktopExternalAppHost` 实现 | `desktop/src/external_app_host.rs` |
| P0-5 | `ToolUseContext` 扩展 `external_app_host` | `tool_context_runtime.rs` |
| P0-6 | `ToolPipeline` 注入 host | `desktop/src/lib.rs` |
| P0-7 | `product_runtime` 注册 `ExternalAppManager` | `product_runtime.rs` |
| P0-8 | `tool-packs` 注册 `ExternalAppManager` | `tool-packs/src/lib.rs` |
| P1-1 | `query_state` 返回前端状态缓存（非仅窗口存在性） | 未来迭代 |
| P1-2 | `open_app` 支持激活已有窗口（而非重复创建） | 未来迭代 |

---

## 11. 附录：与前置规格的关系

本规格是 `2026-06-01-external-app-module-design.md` 的 **AI 技能层补充**，不替代或修改其中定义的任何前端/后端基础能力：

- `bitfun.manifest.json` 格式不变
- iframe 桥接协议不变
- `ExternalAppService` API 不变
- `tool_call_queue` 机制不变
- 前端 `useExternalAppBridge` / `ExternalAppScene` 不变

本规格新增的内容全部位于 **agentic 工具层**和**平台适配层**，使 LLM 能够通过标准化内置工具与外部应用交互。
