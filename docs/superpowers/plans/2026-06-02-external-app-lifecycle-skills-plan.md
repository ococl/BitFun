# 外部应用生命周期管理内置技能 — 实现计划

> 对应规格：`docs/superpowers/specs/2026-06-02-external-app-lifecycle-skills-design.md`

---

## 任务 1：定义 ExternalAppHost trait 和 ToolUseContext 扩展

**目标：** 在 `bitfun-core` 中定义平台无关的 `ExternalAppHost` trait，并将其注入到 `ToolUseContext` 中。

**文件变更：**
- `src/crates/core/src/agentic/tools/external_app_host.rs` [新建]
- `src/crates/core/src/agentic/tools/tool_context_runtime.rs` [修改]
- `src/crates/core/src/agentic/tools/mod.rs` 或相关导出 [修改]

**步骤：**
1. 新建 `external_app_host.rs`，定义 `ExternalAppHost` async trait 和 `ExternalAppHostRef` 类型别名
2. `ToolUseContext` 新增 `external_app_host: Option<ExternalAppHostRef>` 字段
3. 确保编译通过：`cargo check -p bitfun-core`

**验证：**
- `cargo check -p bitfun-core` 0 errors

---

## 任务 2：实现 ExternalAppManagerTool

**目标：** 创建内置工具 `ExternalAppManager`，覆盖外部应用的 CRUD 和查询操作。

**文件变更：**
- `src/crates/core/src/agentic/tools/implementations/external_app_manager_tool.rs` [新建]
- `src/crates/core/src/agentic/tools/implementations/mod.rs` [修改]

**步骤：**
1. 定义 `ExternalAppManagerRequest` 和 `ManagerAction` 枚举
2. 实现 `Tool` trait：
   - `name()` → `"ExternalAppManager"`
   - `description()` / `short_description()`
   - `input_schema()` → 包含 action / app_id / url 的 JSON schema
   - `needs_permissions()` → `true`
   - `call_impl()` → match action 调用 `ExternalAppService` 或拉取 manifest
3. `add_app` action：
   - 使用 `reqwest` 拉取 `{url}/.well-known/bitfun.manifest.json`
   - 解析 `ManifestCapabilities` 提取 name / description / version / commands
   - 调用 `ExternalAppService::create_app()`
4. `update_app` action：
   - 获取现有应用 URL，重新拉取 manifest
   - 调用 `ExternalAppService::update_app()`
5. 其他 action 直接委托 `ExternalAppService`
6. 在 `mod.rs` 中导出

**验证：**
- `cargo check -p bitfun-core` 0 errors
- `cargo test -p bitfun-core external_app_manager` 通过（至少工具名和 schema 测试）

---

## 任务 3：重写 ControlExternalAppTool

**目标：** 将现有的 mock `ControlExternalAppTool` 改为通过 `ExternalAppHost` 实际执行。

**文件变更：**
- `src/crates/core/src/agentic/tools/implementations/control_external_app_tool.rs` [重写]

**步骤：**
1. 修订 `ControlAction` 枚举：
   - `Open`
   - `Close` [新增]
   - `ExecuteCommand { command, params }` [原 SendCommand 改名]
   - `QueryState`
2. 修订 `input_schema`：action 改为 `enum` 字符串（`"open" | "close" | "execute_command" | "query_state"`）
3. 重写 `call_impl`：
   - 从 `ToolUseContext` 获取 `external_app_host`，未设置则返回错误
   - match action 调用 host 方法
   - 将 host 返回结果包装为 `ToolResult`
4. 更新现有测试

**验证：**
- `cargo check -p bitfun-core` 0 errors
- `cargo test -p bitfun-core control_external_app` 通过

---

## 任务 4：实现 DesktopExternalAppHost

**目标：** 在 `bitfun-desktop` 中实现 `ExternalAppHost` trait，连接 Tauri API。

**文件变更：**
- `src/apps/desktop/src/external_app_host.rs` [新建]
- `src/apps/desktop/src/lib.rs` [修改]

**步骤：**
1. 新建 `external_app_host.rs`，实现 `DesktopExternalAppHost`：
   - 持有 `AppHandle`
   - `open_app`：调用 `ExternalAppService::get_app(app_id)` 获取 URL，使用 `WebviewWindowBuilder` 创建窗口（label = `external-app-{app_id}`）
   - `close_app`：通过 `app_handle.get_webview_window(label)` 查找并关闭
   - `query_app_state`：检查窗口是否存在，返回 `{is_open: bool}`
   - `execute_command`：内部使用 `tool_call_queue` enqueue，等待前端返回（30s 超时），与 `ExternalAppCommandTool` 共用同一 queue
2. 在 `lib.rs` 中：
   - `mod external_app_host;`
   - 创建 `DesktopExternalAppHost` 实例
   - 传入 `ToolPipeline::new(...)` 的第四个参数（或扩展参数结构）
3. 检查 `ToolPipeline::new` 签名是否需要修改以接受 `external_app_host`

**验证：**
- `cargo check -p bitfun-desktop` 0 errors

---

## 任务 5：工具注册与集成

**目标：** 将新工具注册到内置工具列表中，使 LLM 始终可见。

**文件变更：**
- `src/crates/tool-packs/src/lib.rs` [修改]
- `src/crates/core/src/agentic/tools/product_runtime.rs` [修改]

**步骤：**
1. `tool-packs/src/lib.rs`：在 `core.integration` 组的 `tool_names` 中新增 `"ExternalAppManager"`
2. `product_runtime.rs`：在 `materialize_tool` match 中新增 `"ExternalAppManager" => Arc::new(ExternalAppManagerTool::new())`
3. 确保 `ControlExternalApp` 仍在列表中（已存在，无需删除）

**验证：**
- `cargo test -p bitfun-core product_tool_runtime` 通过（registry 契约测试）

---

## 任务 6：验证与测试

**目标：** 确保所有变更编译通过，前端不受影响。

**验证步骤：**
1. `cargo check --workspace`
2. `cargo test -p bitfun-core external_app`
3. `cargo test -p bitfun-core product_tool_runtime`
4. `pnpm run type-check:web`
5. `pnpm run build:web`
6. `cargo check -p bitfun-desktop`

**预期结果：** 全部通过，0 errors。

---

## 依赖关系

```
任务 1 (trait + context)
    │
    ├──► 任务 2 (ExternalAppManagerTool) ──► 任务 5 (注册)
    │
    ├──► 任务 3 (ControlExternalAppTool) ──► 任务 5 (注册)
    │
    └──► 任务 4 (DesktopExternalAppHost)
              │
              └──► 任务 3 (ControlExternalAppTool 依赖 host 实现)

任务 6 (最终验证) 依赖所有前置任务
```

**执行顺序：** 1 → (2, 3, 4 可并行) → 5 → 6

---

## 风险与应对

| 风险 | 应对 |
|---|---|
| `ToolPipeline::new` 签名不接受新参数 | 修改为 struct 形式的参数，或添加到 `ToolUseContext` 构建逻辑中 |
| `reqwest` 在 `bitfun-core` 中不可用 | 检查 `Cargo.toml` 依赖，如不可用则使用现有 HTTP 客户端抽象 |
| `ControlExternalApp` schema 变更影响已有测试 | 同步更新 `control_external_app_tool.rs` 中的测试用例 |
| Desktop host 的 Tauri API 与现有 `external_app_api.rs` 重复 | 将公共逻辑抽取为共享函数，或让 DesktopExternalAppHost 直接调用已有 API 函数 |
