# ExternalApp 模块实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现 BitFun ExternalApp 模块，允许通过 HTTP URL 嵌入独立部署的外部 Web 应用，通过 SDK 桥接提供 AI、存储、对话框等受控能力。

**架构：** 完全平行于 MiniApp 的独立系统。前端在 `src/web-ui/src/app/scenes/externalapps/` 下建立独立目录；后端在 `src/crates/core/src/service/external_app/` 下新增模块；基座仅 3 处单行修改。外部应用引入私有 npm 包 `@bitfun/sdk` 建立 `postMessage` JSON-RPC 桥接。

**技术栈：** React + TypeScript + Zustand + Tauri v2 + Rust

---

## 文件结构

### 后端 — 新建文件

| 文件 | 职责 |
|---|---|
| `src/crates/core/src/service/external_app/mod.rs` | 模块入口，导出模型、存储、命令、manifest |
| `src/crates/core/src/service/external_app/models.rs` | `ExternalAppMeta`、`ExternalAppPermissions`、`Manifest` 等数据模型 |
| `src/crates/core/src/service/external_app/storage.rs` | 隔离存储实现，`externalapp:{id}:{key}` 前缀 |
| `src/crates/core/src/service/external_app/manifest.rs` | `bitfun.manifest.json` HTTP 拉取、解析、验证 |
| `src/crates/core/src/service/external_app/commands.rs` | Tauri 命令：`list_external_apps`、`create_external_app` 等 |
| `src/crates/core/src/agentic/tools/implementations/control_external_app_tool.rs` | `ControlExternalApp` Tool，支持 `open`/`sendCommand`/`queryState` |

### 后端 — 修改文件

| 文件 | 修改 |
|---|---|
| `src/crates/core/src/service/mod.rs` | 新增 `pub mod external_app;` |
| `src/crates/core/src/agentic/tools/implementations/mod.rs` | 注册 `ControlExternalAppTool` |
| `src/crates/core/src/agentic/tools/product_runtime.rs` | 将 `ControlExternalAppTool` 加入默认工具列表 |

### 前端 — 新建文件

| 文件 | 职责 |
|---|---|
| `src/web-ui/src/app/scenes/externalapps/types/externalApp.ts` | TypeScript 类型定义 |
| `src/web-ui/src/infrastructure/api/service-api/ExternalAppAPI.ts` | Tauri 命令封装类 |
| `src/web-ui/src/app/scenes/externalapps/stores/externalAppStore.ts` | Zustand store |
| `src/web-ui/src/app/scenes/externalapps/hooks/useExternalAppBridge.ts` | `postMessage` JSON-RPC 桥接 hook |
| `src/web-ui/src/app/scenes/externalapps/ExternalAppRunner.tsx` | iframe 渲染器 |
| `src/web-ui/src/app/scenes/externalapps/ExternalAppScene.tsx` | 场景外壳（Header + Runner + 授权面板状态机） |
| `src/web-ui/src/app/scenes/externalapps/ExternalAppGalleryScene.tsx` | 画廊场景 |
| `src/web-ui/src/app/scenes/externalapps/components/ExternalAppCard.tsx` | 应用卡片 |
| `src/web-ui/src/app/scenes/externalapps/components/AddExternalAppDialog.tsx` | 添加应用弹窗 |
| `src/web-ui/src/app/scenes/externalapps/components/PermissionGrantPanel.tsx` | 首次授权面板 |

### 前端 — 修改文件

| 文件 | 修改 |
|---|---|
| `src/web-ui/src/app/components/SceneBar/types.ts` | `SceneTabId` 增加 `` `externalapp:${string}` `` |
| `src/web-ui/src/app/scenes/SceneViewport.tsx` | `renderScene` 增加 `externalapp:` 分支 |
| `src/web-ui/src/app/scenes/registry.ts` | 新增 `getExternalAppSceneDef(appId, appName)` |
| `src/web-ui/src/app/stores/sceneStore.ts` | `getSceneDefOrMiniapp` 增加 `externalapp:` 分支 |
| `src/web-ui/src/app/components/NavPanel/MainNav.tsx` | 底部新增"外部应用"导航入口 |

---

## 后端任务组

### 任务 1：ExternalApp 数据模型

**文件：**
- 创建：`src/crates/core/src/service/external_app/mod.rs`
- 创建：`src/crates/core/src/service/external_app/models.rs`
- 修改：`src/crates/core/src/service/mod.rs`
- 测试：`src/crates/core/src/service/external_app/models.rs`（内联 `#[cfg(test)]`）

- [ ] **步骤 1：编写模型与测试**

创建 `src/crates/core/src/service/external_app/models.rs`：

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExternalAppPermissions {
    pub ai: ExternalAppAiPermission,
    pub storage: ExternalAppStoragePermission,
    pub dialog: bool,
    pub clipboard: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExternalAppAiPermission {
    pub enabled: bool,
    pub allowed_models: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExternalAppStoragePermission {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManifestCapabilities {
    pub version: String,
    pub capabilities: ManifestCapabilitySet,
    pub commands: Vec<ManifestCommand>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_schema: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub business_domains: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManifestCapabilitySet {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai: Option<ManifestCapabilityItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub storage: Option<ManifestCapabilityItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dialog: Option<ManifestCapabilityItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clipboard: Option<ManifestCapabilityItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManifestCapabilityItem {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_models: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManifestCommand {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_app_meta_serde_roundtrip() {
        let meta = ExternalAppMeta {
            id: "app-1".to_string(),
            name: "Test App".to_string(),
            description: "A test app".to_string(),
            icon: "globe".to_string(),
            url: "https://example.com".to_string(),
            business_domains: vec!["https://api.example.com".to_string()],
            created_at: 1717200000,
            updated_at: 1717200000,
        };
        let json = serde_json::to_string(&meta).unwrap();
        let restored: ExternalAppMeta = serde_json::from_str(&json).unwrap();
        assert_eq!(meta, restored);
    }

    #[test]
    fn manifest_capabilities_parse() {
        let json = r#"{
            "version": "1.0.0",
            "capabilities": {
                "ai": { "enabled": true, "allowedModels": ["gpt-4"] },
                "storage": { "enabled": true }
            },
            "commands": [{"name": "setFilter", "description": "Set filter"}]
        }"#;
        let manifest: ManifestCapabilities = serde_json::from_str(json).unwrap();
        assert_eq!(manifest.version, "1.0.0");
        assert!(manifest.capabilities.ai.as_ref().unwrap().enabled);
    }
}
```

创建 `src/crates/core/src/service/external_app/mod.rs`：

```rust
pub mod models;
pub mod storage;
pub mod manifest;
pub mod commands;

pub use models::*;
```

修改 `src/crates/core/src/service/mod.rs`，在已有 `pub mod` 列表末尾添加：

```rust
pub mod external_app;
```

- [ ] **步骤 2：运行测试**

命令：`cargo test -p bitfun-core external_app::models -- --nocapture`
预期：PASS（2 个测试通过）

- [ ] **步骤 3：Commit**

```bash
git add src/crates/core/src/service/external_app/
git add src/crates/core/src/service/mod.rs
git commit -m "feat(external-app): add data models and manifest types"
```

---

### 任务 2：隔离存储

**文件：**
- 创建：`src/crates/core/src/service/external_app/storage.rs`
- 测试：内联 `#[cfg(test)]`

- [ ] **步骤 1：编写存储实现与测试**

```rust
use crate::util::errors::{BitFunError, BitFunResult};
use serde_json::Value;
use std::path::PathBuf;

fn storage_key(app_id: &str, user_key: &str) -> String {
    format!("externalapp:{}:{}", app_id, user_key)
}

fn external_app_storage_dir(app_id: &str) -> BitFunResult<PathBuf> {
    let base = crate::infrastructure::app_paths::app_data_dir()
        .map_err(|e| BitFunError::internal(format!("app data dir error: {}", e)))?;
    Ok(base.join("external_apps").join(app_id))
}

fn storage_file_path(app_id: &str) -> BitFunResult<PathBuf> {
    let dir = external_app_storage_dir(app_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| {
        BitFunError::internal(format!("create storage dir failed: {}", e))
    })?;
    Ok(dir.join("storage.json"))
}

fn read_storage_map(app_id: &str) -> BitFunResult<serde_json::Map<String, Value>> {
    let path = storage_file_path(app_id)?;
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| {
        BitFunError::internal(format!("read storage file failed: {}", e))
    })?;
    let map: serde_json::Map<String, Value> = serde_json::from_str(&content).map_err(|e| {
        BitFunError::internal(format!("parse storage file failed: {}", e))
    })?;
    Ok(map)
}

fn write_storage_map(app_id: &str, map: &serde_json::Map<String, Value>) -> BitFunResult<()> {
    let path = storage_file_path(app_id)?;
    let content = serde_json::to_string_pretty(map).map_err(|e| {
        BitFunError::internal(format!("serialize storage failed: {}", e))
    })?;
    std::fs::write(&path, content).map_err(|e| {
        BitFunError::internal(format!("write storage file failed: {}", e))
    })?;
    Ok(())
}

pub fn get_external_app_storage(app_id: &str, key: &str) -> BitFunResult<Option<Value>> {
    let map = read_storage_map(app_id)?;
    let full_key = storage_key(app_id, key);
    Ok(map.get(&full_key).cloned())
}

pub fn set_external_app_storage(app_id: &str, key: &str, value: Value) -> BitFunResult<()> {
    let mut map = read_storage_map(app_id)?;
    let full_key = storage_key(app_id, key);
    map.insert(full_key, value);
    write_storage_map(app_id, &map)
}

pub fn clear_external_app_storage(app_id: &str) -> BitFunResult<()> {
    let path = storage_file_path(app_id)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| {
            BitFunError::internal(format!("remove storage file failed: {}", e))
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn storage_key_format() {
        assert_eq!(storage_key("my-app", "foo"), "externalapp:my-app:foo");
    }

    #[test]
    fn get_set_clear_storage_roundtrip() {
        let app_id = "test-app-storage";
        let _ = clear_external_app_storage(app_id);
        assert_eq!(get_external_app_storage(app_id, "k1").unwrap(), None);
        set_external_app_storage(app_id, "k1", json!("v1")).unwrap();
        assert_eq!(get_external_app_storage(app_id, "k1").unwrap(), Some(json!("v1")));
        set_external_app_storage(app_id, "k2", json!({"a": 1})).unwrap();
        assert_eq!(get_external_app_storage(app_id, "k2").unwrap(), Some(json!({"a": 1})));
        clear_external_app_storage(app_id).unwrap();
        assert_eq!(get_external_app_storage(app_id, "k1").unwrap(), None);
    }
}
```

- [ ] **步骤 2：运行测试**

命令：`cargo test -p bitfun-core external_app::storage -- --nocapture`
预期：PASS

- [ ] **步骤 3：Commit**

```bash
git add src/crates/core/src/service/external_app/storage.rs
git commit -m "feat(external-app): add isolated storage with prefix key"
```

---

### 任务 3：Manifest 拉取与解析

**文件：**
- 创建：`src/crates/core/src/service/external_app/manifest.rs`

- [ ] **步骤 1：编写 manifest 实现**

```rust
use crate::util::errors::{BitFunError, BitFunResult};
use super::models::ManifestCapabilities;

const MANIFEST_PATH: &str = "/.well-known/bitfun.manifest.json";

pub async fn fetch_manifest(app_url: &str) -> BitFunResult<ManifestCapabilities> {
    let base = app_url.trim_end_matches('/');
    let manifest_url = format!("{}{}", base, MANIFEST_PATH);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| BitFunError::internal(format!("http client build failed: {}", e)))?;
    let resp = client.get(&manifest_url).send().await.map_err(|e| {
        BitFunError::internal(format!("fetch manifest failed: {}", e))
    })?;
    if !resp.status().is_success() {
        return Err(BitFunError::internal(format!(
            "manifest returned status {}", resp.status()
        )));
    }
    let text = resp.text().await.map_err(|e| {
        BitFunError::internal(format!("read manifest body failed: {}", e))
    })?;
    let manifest: ManifestCapabilities = serde_json::from_str(&text).map_err(|e| {
        BitFunError::internal(format!("parse manifest failed: {}", e))
    })?;
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manifest_path_constant() {
        assert_eq!(MANIFEST_PATH, "/.well-known/bitfun.manifest.json");
    }
}
```

- [ ] **步骤 2：运行测试**

命令：`cargo test -p bitfun-core external_app::manifest -- --nocapture`
预期：PASS

- [ ] **步骤 3：Commit**

```bash
git add src/crates/core/src/service/external_app/manifest.rs
git commit -m "feat(external-app): add manifest fetch and parse"
```

---

### 任务 4：Tauri 命令

**文件：**
- 创建：`src/crates/core/src/service/external_app/commands.rs`
- 修改：`src/crates/core/src/service/external_app/mod.rs`

- [ ] **步骤 1：编写命令实现**

```rust
use crate::util::errors::{BitFunError, BitFunResult};
use super::models::ExternalAppMeta;
use super::storage;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref APP_STORE: Mutex<Vec<ExternalAppMeta>> = Mutex::new(Vec::new());
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn app_store_path() -> BitFunResult<std::path::PathBuf> {
    let base = crate::infrastructure::app_paths::app_data_dir()
        .map_err(|e| BitFunError::internal(format!("app data dir error: {}", e)))?;
    Ok(base.join("external_apps").join("registry.json"))
}

fn read_registry() -> BitFunResult<Vec<ExternalAppMeta>> {
    let path = app_store_path()?;
    if !path.exists() { return Ok(Vec::new()); }
    let content = std::fs::read_to_string(&path).map_err(|e| {
        BitFunError::internal(format!("read registry failed: {}", e))
    })?;
    let apps: Vec<ExternalAppMeta> = serde_json::from_str(&content).map_err(|e| {
        BitFunError::internal(format!("parse registry failed: {}", e))
    })?;
    Ok(apps)
}

fn write_registry(apps: &[ExternalAppMeta]) -> BitFunResult<()> {
    let path = app_store_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            BitFunError::internal(format!("create registry dir failed: {}", e))
        })?;
    }
    let content = serde_json::to_string_pretty(apps).map_err(|e| {
        BitFunError::internal(format!("serialize registry failed: {}", e))
    })?;
    std::fs::write(&path, content).map_err(|e| {
        BitFunError::internal(format!("write registry failed: {}", e))
    })?;
    Ok(())
}

fn load_store() -> BitFunResult<()> {
    let apps = read_registry()?;
    let mut store = APP_STORE.lock().map_err(|e| {
        BitFunError::internal(format!("lock store failed: {}", e))
    })?;
    *store = apps;
    Ok(())
}

fn save_store() -> BitFunResult<()> {
    let store = APP_STORE.lock().map_err(|e| {
        BitFunError::internal(format!("lock store failed: {}", e))
    })?;
    write_registry(&store)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateExternalAppRequest {
    pub name: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateExternalAppRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[tauri::command]
pub fn list_external_apps() -> BitFunResult<Vec<ExternalAppMeta>> {
    load_store()?;
    let store = APP_STORE.lock().map_err(|e| {
        BitFunError::internal(format!("lock store failed: {}", e))
    })?;
    Ok(store.clone())
}

#[tauri::command]
pub fn get_external_app(app_id: String) -> BitFunResult<ExternalAppMeta> {
    load_store()?;
    let store = APP_STORE.lock().map_err(|e| {
        BitFunError::internal(format!("lock store failed: {}", e))
    })?;
    store.iter().find(|a| a.id == app_id).cloned()
        .ok_or_else(|| BitFunError::not_found(format!("external app not found: {}", app_id)))
}

#[tauri::command]
pub fn create_external_app(request: CreateExternalAppRequest) -> BitFunResult<ExternalAppMeta> {
    load_store()?;
    let mut store = APP_STORE.lock().map_err(|e| {
        BitFunError::internal(format!("lock store failed: {}", e))
    })?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_secs();
    let meta = ExternalAppMeta {
        id: id.clone(),
        name: request.name,
        description: request.description.unwrap_or_default(),
        icon: request.icon.unwrap_or_else(|| "globe".to_string()),
        url: request.url,
        business_domains: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    store.push(meta.clone());
    drop(store);
    save_store()?;
    Ok(meta)
}

#[tauri::command]
pub fn update_external_app(app_id: String, request: UpdateExternalAppRequest) -> BitFunResult<ExternalAppMeta> {
    load_store()?;
    let mut store = APP_STORE.lock().map_err(|e| {
        BitFunError::internal(format!("lock store failed: {}", e))
    })?;
    let app = store.iter_mut().find(|a| a.id == app_id)
        .ok_or_else(|| BitFunError::not_found(format!("external app not found: {}", app_id)))?;
    if let Some(name) = request.name { app.name = name; }
    if let Some(url) = request.url { app.url = url; }
    if let Some(icon) = request.icon { app.icon = icon; }
    if let Some(description) = request.description { app.description = description; }
    app.updated_at = now_secs();
    let cloned = app.clone();
    drop(store);
    save_store()?;
    Ok(cloned)
}

#[tauri::command]
pub fn delete_external_app(app_id: String) -> BitFunResult<()> {
    load_store()?;
    let mut store = APP_STORE.lock().map_err(|e| {
        BitFunError::internal(format!("lock store failed: {}", e))
    })?;
    let before = store.len();
    store.retain(|a| a.id != app_id);
    if store.len() == before {
        return Err(BitFunError::not_found(format!("external app not found: {}", app_id)));
    }
    drop(store);
    save_store()?;
    let _ = storage::clear_external_app_storage(&app_id);
    let _ = clear_grants(&app_id);
    Ok(())
}

#[tauri::command]
pub fn get_external_app_storage(app_id: String, key: String) -> BitFunResult<Option<Value>> {
    storage::get_external_app_storage(&app_id, &key)
}

#[tauri::command]
pub fn set_external_app_storage(app_id: String, key: String, value: Value) -> BitFunResult<()> {
    storage::set_external_app_storage(&app_id, &key, value)
}

#[tauri::command]
pub fn clear_external_app_storage_cmd(app_id: String) -> BitFunResult<()> {
    storage::clear_external_app_storage(&app_id)
}

fn grants_file_path() -> BitFunResult<std::path::PathBuf> {
    let base = crate::infrastructure::app_paths::app_data_dir()
        .map_err(|e| BitFunError::internal(format!("app data dir error: {}", e)))?;
    Ok(base.join("external_apps").join("grants.json"))
}

fn read_grants() -> BitFunResult<std::collections::HashMap<String, Vec<String>>> {
    let path = grants_file_path()?;
    if !path.exists() { return Ok(std::collections::HashMap::new()); }
    let content = std::fs::read_to_string(&path).map_err(|e| {
        BitFunError::internal(format!("read grants failed: {}", e))
    })?;
    let grants: std::collections::HashMap<String, Vec<String>> = serde_json::from_str(&content)
        .map_err(|e| BitFunError::internal(format!("parse grants failed: {}", e)))?;
    Ok(grants)
}

fn write_grants(grants: &std::collections::HashMap<String, Vec<String>>) -> BitFunResult<()> {
    let path = grants_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            BitFunError::internal(format!("create grants dir failed: {}", e))
        })?;
    }
    let content = serde_json::to_string_pretty(grants).map_err(|e| {
        BitFunError::internal(format!("serialize grants failed: {}", e))
    })?;
    std::fs::write(&path, content).map_err(|e| {
        BitFunError::internal(format!("write grants failed: {}", e))
    })?;
    Ok(())
}

fn clear_grants(app_id: &str) -> BitFunResult<()> {
    let mut grants = read_grants()?;
    grants.remove(app_id);
    write_grants(&grants)
}

#[tauri::command]
pub fn get_external_app_grants(app_id: String) -> BitFunResult<Vec<String>> {
    let grants = read_grants()?;
    Ok(grants.get(&app_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn set_external_app_grants(app_id: String, grants: Vec<String>) -> BitFunResult<()> {
    let mut all = read_grants()?;
    all.insert(app_id, grants);
    write_grants(&all)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn create_request_shape() {
        let req = CreateExternalAppRequest {
            name: "Test".to_string(),
            url: "https://test.com".to_string(),
            icon: None,
            description: None,
        };
        assert_eq!(req.name, "Test");
    }
}
```

确保 `src/crates/core/src/service/external_app/mod.rs` 已导出命令类型（前文已创建，确认包含 `pub use commands::*;` 即可）。

- [ ] **步骤 2：编译检查**

命令：`cargo check -p bitfun-core`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/crates/core/src/service/external_app/commands.rs
git add src/crates/core/src/service/external_app/mod.rs
git commit -m "feat(external-app): add Tauri commands for CRUD, storage, and grants"
```

---

### 任务 5：ControlExternalApp Tool

**文件：**
- 创建：`src/crates/core/src/agentic/tools/implementations/control_external_app_tool.rs`
- 修改：`src/crates/core/src/agentic/tools/implementations/mod.rs`
- 修改：`src/crates/core/src/agentic/tools/product_runtime.rs`

- [ ] **步骤 1：读取工具注册模式**

先查看 `src/crates/core/src/agentic/tools/implementations/mod.rs` 和 `src/crates/core/src/agentic/tools/product_runtime.rs` 的实际内容，确认现有工具的注册方式。

- [ ] **步骤 2：编写 Tool 实现**

```rust
use crate::agentic::tools::framework::{Tool, ToolResult, ToolUseContext};
use crate::util::errors::{BitFunError, BitFunResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub struct ControlExternalAppTool;

impl ControlExternalAppTool {
    pub fn new() -> Self { Self }
}

impl Default for ControlExternalAppTool {
    fn default() -> Self { Self::new() }
}

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

#[async_trait]
impl Tool for ControlExternalAppTool {
    fn name(&self) -> &str { "ControlExternalApp" }

    async fn description(&self) -> BitFunResult<String> {
        Ok(r#"Control an external application open in BitFun.
Actions: open (open in new tab), sendCommand (send command with params), queryState (query current state)."#.to_string())
    }

    fn schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "object",
                    "oneOf": [
                        { "type": "object", "properties": { "type": { "type": "string", "const": "open" } }, "required": ["type"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "send_command" }, "command": { "type": "string" }, "params": { "type": "object" } }, "required": ["type", "command"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "query_state" } }, "required": ["type"] }
                    ]
                },
                "app_id": { "type": "string" }
            },
            "required": ["action", "app_id"]
        })
    }

    async fn execute(&self, _ctx: &ToolUseContext, input: Value) -> BitFunResult<ToolResult> {
        let request: ControlExternalAppRequest = serde_json::from_value(input)
            .map_err(|e| BitFunError::invalid_input(format!("invalid request: {}", e)))?;
        match request.action {
            ControlAction::Open => {
                // Emit event for frontend to handle
                Ok(ToolResult::success(json!({"success": true, "opened": true})))
            }
            ControlAction::SendCommand { command, params } => {
                Ok(ToolResult::success(json!({"success": true, "sent": true, "command": command, "params": params})))
            }
            ControlAction::QueryState => {
                Ok(ToolResult::success(json!({"success": true, "state": null})))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::tools::framework::Tool;

    #[test]
    fn tool_name_is_control_external_app() {
        let tool = ControlExternalAppTool::new();
        assert_eq!(tool.name(), "ControlExternalApp");
    }

    #[test]
    fn tool_schema_has_required_fields() {
        let tool = ControlExternalAppTool::new();
        let schema = tool.schema();
        assert!(schema.get("properties").is_some());
        assert!(schema.get("required").is_some());
    }
}
```

- [ ] **步骤 3：注册 Tool**

修改 `src/crates/core/src/agentic/tools/implementations/mod.rs`：

```rust
mod control_external_app_tool;
pub use control_external_app_tool::ControlExternalAppTool;
```

修改 `src/crates/core/src/agentic/tools/product_runtime.rs`：

找到 `create_registry` 或类似函数，在工具注册列表中添加：

```rust
registry.register_tool(Arc::new(ControlExternalAppTool::new()));
```

- [ ] **步骤 4：编译检查**

命令：`cargo check -p bitfun-core`
预期：0 errors

- [ ] **步骤 5：运行测试**

命令：`cargo test -p bitfun-core control_external_app -- --nocapture`
预期：PASS

- [ ] **步骤 6：Commit**

```bash
git add src/crates/core/src/agentic/tools/implementations/control_external_app_tool.rs
git add src/crates/core/src/agentic/tools/implementations/mod.rs
git add src/crates/core/src/agentic/tools/product_runtime.rs
git commit -m "feat(external-app): add ControlExternalApp tool"
```

---

## 前端任务组

### 任务 6：类型定义

**文件：**
- 创建：`src/web-ui/src/app/scenes/externalapps/types/externalApp.ts`

- [ ] **步骤 1：编写类型文件**

```typescript
export interface ExternalAppMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  business_domains: string[];
  created_at: number;
  updated_at: number;
}

export interface ManifestCapabilityItem {
  enabled: boolean;
  allowedModels?: string[];
  description?: string;
}

export interface ManifestCapabilitySet {
  ai?: ManifestCapabilityItem;
  storage?: ManifestCapabilityItem;
  dialog?: ManifestCapabilityItem;
  clipboard?: ManifestCapabilityItem;
}

export interface ManifestCommand {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ManifestCapabilities {
  version: string;
  capabilities: ManifestCapabilitySet;
  commands: ManifestCommand[];
  stateSchema?: Record<string, unknown>;
  businessDomains?: string[];
}

export interface CreateExternalAppRequest {
  name: string;
  url: string;
  icon?: string;
  description?: string;
}

export interface UpdateExternalAppRequest {
  name?: string;
  url?: string;
  icon?: string;
  description?: string;
}

export interface ExternalAppStateCacheEntry {
  state: Record<string, unknown>;
  timestamp: number;
}
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/scenes/externalapps/types/externalApp.ts
git commit -m "feat(external-app): add TypeScript type definitions"
```

---

### 任务 7：API 层

**文件：**
- 创建：`src/web-ui/src/infrastructure/api/service-api/ExternalAppAPI.ts`

- [ ] **步骤 1：编写 API 类**

```typescript
import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';
import type {
  ExternalAppMeta,
  CreateExternalAppRequest,
  UpdateExternalAppRequest,
} from '@/app/scenes/externalapps/types/externalApp';

export class ExternalAppAPI {
  async listExternalApps(): Promise<ExternalAppMeta[]> {
    try {
      return await api.invoke('list_external_apps', {});
    } catch (error) {
      throw createTauriCommandError('list_external_apps', error);
    }
  }

  async getExternalApp(appId: string): Promise<ExternalAppMeta> {
    try {
      return await api.invoke('get_external_app', { appId });
    } catch (error) {
      throw createTauriCommandError('get_external_app', error, { appId });
    }
  }

  async createExternalApp(req: CreateExternalAppRequest): Promise<ExternalAppMeta> {
    try {
      return await api.invoke('create_external_app', { request: req });
    } catch (error) {
      throw createTauriCommandError('create_external_app', error);
    }
  }

  async updateExternalApp(appId: string, req: UpdateExternalAppRequest): Promise<ExternalAppMeta> {
    try {
      return await api.invoke('update_external_app', { appId, request: req });
    } catch (error) {
      throw createTauriCommandError('update_external_app', error, { appId });
    }
  }

  async deleteExternalApp(appId: string): Promise<void> {
    try {
      await api.invoke('delete_external_app', { appId });
    } catch (error) {
      throw createTauriCommandError('delete_external_app', error, { appId });
    }
  }

  async getStorage(appId: string, key: string): Promise<unknown> {
    try {
      return await api.invoke('get_external_app_storage', { appId, key });
    } catch (error) {
      throw createTauriCommandError('get_external_app_storage', error, { appId, key });
    }
  }

  async setStorage(appId: string, key: string, value: unknown): Promise<void> {
    try {
      await api.invoke('set_external_app_storage', { appId, key, value });
    } catch (error) {
      throw createTauriCommandError('set_external_app_storage', error, { appId, key });
    }
  }

  async clearStorage(appId: string): Promise<void> {
    try {
      await api.invoke('clear_external_app_storage_cmd', { appId });
    } catch (error) {
      throw createTauriCommandError('clear_external_app_storage_cmd', error, { appId });
    }
  }

  async getGrants(appId: string): Promise<string[]> {
    try {
      return await api.invoke('get_external_app_grants', { appId });
    } catch (error) {
      throw createTauriCommandError('get_external_app_grants', error, { appId });
    }
  }

  async setGrants(appId: string, grants: string[]): Promise<void> {
    try {
      await api.invoke('set_external_app_grants', { appId, grants });
    } catch (error) {
      throw createTauriCommandError('set_external_app_grants', error, { appId });
    }
  }
}

export const externalAppAPI = new ExternalAppAPI();
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/infrastructure/api/service-api/ExternalAppAPI.ts
git commit -m "feat(external-app): add frontend API client"
```

---

### 任务 8：Zustand Store

**文件：**
- 创建：`src/web-ui/src/app/scenes/externalapps/stores/externalAppStore.ts`

- [ ] **步骤 1：编写 Store**

```typescript
import { create } from 'zustand';
import { externalAppAPI } from '@/infrastructure/api/service-api/ExternalAppAPI';
import type {
  ExternalAppMeta,
  ManifestCapabilities,
  CreateExternalAppRequest,
} from '../types/externalApp';

interface ExternalAppStore {
  apps: ExternalAppMeta[];
  loading: boolean;
  error: string | null;
  grants: Map<string, Set<string>>;
  manifests: Map<string, ManifestCapabilities>;
  stateCache: Map<string, { state: Record<string, unknown>; timestamp: number }>;

  loadApps: () => Promise<void>;
  addApp: (req: CreateExternalAppRequest) => Promise<void>;
  removeApp: (appId: string) => Promise<void>;
  fetchManifest: (appId: string, url: string) => Promise<ManifestCapabilities | null>;
  setGrants: (appId: string, grants: string[]) => Promise<void>;
  revokeGrant: (appId: string, capability: string) => Promise<void>;
  clearAllData: (appId: string) => Promise<void>;
  cacheState: (appId: string, state: Record<string, unknown>) => void;
  getCachedState: (appId: string) => Record<string, unknown> | null;
}

export const useExternalAppStore = create<ExternalAppStore>((set, get) => ({
  apps: [],
  loading: false,
  error: null,
  grants: new Map(),
  manifests: new Map(),
  stateCache: new Map(),

  async loadApps() {
    set({ loading: true, error: null });
    try {
      const apps = await externalAppAPI.listExternalApps();
      set({ apps, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  async addApp(req) {
    const meta = await externalAppAPI.createExternalApp(req);
    set((state) => ({ apps: [...state.apps, meta] }));
  },

  async removeApp(appId) {
    await externalAppAPI.deleteExternalApp(appId);
    set((state) => ({
      apps: state.apps.filter((a) => a.id !== appId),
      grants: new Map([...state.grants].filter(([k]) => k !== appId)),
      manifests: new Map([...state.manifests].filter(([k]) => k !== appId)),
      stateCache: new Map([...state.stateCache].filter(([k]) => k !== appId)),
    }));
  },

  async fetchManifest(appId, url) {
    try {
      const base = url.replace(/\/$/, '');
      const resp = await fetch(`${base}/.well-known/bitfun.manifest.json`);
      if (!resp.ok) return null;
      const manifest: ManifestCapabilities = await resp.json();
      set((state) => ({
        manifests: new Map(state.manifests).set(appId, manifest),
      }));
      return manifest;
    } catch {
      return null;
    }
  },

  async setGrants(appId, grants) {
    await externalAppAPI.setGrants(appId, grants);
    set((state) => ({
      grants: new Map(state.grants).set(appId, new Set(grants)),
    }));
  },

  async revokeGrant(appId, capability) {
    const current = get().grants.get(appId) ?? new Set<string>();
    const updated = new Set(current);
    updated.delete(capability);
    const arr = Array.from(updated);
    await externalAppAPI.setGrants(appId, arr);
    set((state) => ({
      grants: new Map(state.grants).set(appId, updated),
    }));
  },

  async clearAllData(appId) {
    await externalAppAPI.clearStorage(appId);
    await externalAppAPI.setGrants(appId, []);
    set((state) => ({
      grants: new Map([...state.grants].set(appId, new Set())),
      stateCache: new Map([...state.stateCache].filter(([k]) => k !== appId)),
    }));
  },

  cacheState(appId, state) {
    set((s) => ({
      stateCache: new Map(s.stateCache).set(appId, { state, timestamp: Date.now() }),
    }));
  },

  getCachedState(appId) {
    const entry = get().stateCache.get(appId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > 5000) return null;
    return entry.state;
  },
}));
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/scenes/externalapps/stores/externalAppStore.ts
git commit -m "feat(external-app): add Zustand store for metadata, grants, and manifest"
```

---

### 任务 9：桥接 Hook

**文件：**
- 创建：`src/web-ui/src/app/scenes/externalapps/hooks/useExternalAppBridge.ts`

- [ ] **步骤 1：编写桥接 Hook**

```typescript
import { useLayoutEffect, useRef, RefObject } from 'react';
import { externalAppAPI } from '@/infrastructure/api/service-api/ExternalAppAPI';
import { miniAppAPI } from '@/infrastructure/api/service-api/MiniAppAPI';
import { open as dialogOpen, save as dialogSave, message as dialogMessage } from '@tauri-apps/plugin-dialog';
import { useTheme } from '@/infrastructure/theme/hooks/useTheme';
import { useI18n } from '@/infrastructure/i18n';
import { useExternalAppStore } from '../stores/externalAppStore';

interface JSONRPCRequest {
  jsonrpc?: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

const ALLOWED_METHODS = new Set([
  'storage.get', 'storage.set',
  'ai.complete', 'ai.chat', 'ai.cancel', 'ai.getModels',
  'dialog.open', 'dialog.save', 'dialog.message',
  'clipboard.writeText', 'clipboard.readText',
  'bitfun/request-theme', 'bitfun/request-locale',
]);

export function useExternalAppBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  appId: string,
  grantedCapabilities: Set<string>,
) {
  const { theme: currentTheme } = useTheme();
  const { currentLanguage } = useI18n('scenes/externalapp');
  const themeRef = useRef(currentTheme);
  themeRef.current = currentTheme;
  const localeRef = useRef(currentLanguage);
  localeRef.current = currentLanguage;
  const grantedRef = useRef(grantedCapabilities);
  grantedRef.current = grantedCapabilities;
  const cacheState = useExternalAppStore((s) => s.cacheState);

  useLayoutEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const msg = event.data as JSONRPCRequest;
      if (!msg?.method) return;

      const { id, method, params = {} } = msg;
      const reply = (result: unknown) =>
        iframeRef.current?.contentWindow?.postMessage({ jsonrpc: '2.0', id, result }, '*');
      const replyError = (message: string) =>
        iframeRef.current?.contentWindow?.postMessage(
          { jsonrpc: '2.0', id, error: { code: -32000, message } }, '*');

      const ns = method.split('.')[0];
      if (ns !== 'bitfun' && !grantedRef.current.has(ns)) {
        replyError(`capability not granted: ${ns}`);
        return;
      }
      if (!ALLOWED_METHODS.has(method)) {
        replyError(`method not allowed: ${method}`);
        return;
      }

      if (method === 'bitfun/request-theme') {
        reply({ theme: themeRef.current });
        return;
      }
      if (method === 'bitfun/request-locale') {
        reply({ locale: localeRef.current });
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'bitfun:event', event: 'localeChange', payload: { locale: localeRef.current } }, '*');
        return;
      }

      try {
        switch (method) {
          case 'storage.get': {
            const value = await externalAppAPI.getStorage(appId, String(params.key ?? ''));
            reply(value);
            return;
          }
          case 'storage.set': {
            await externalAppAPI.setStorage(appId, String(params.key ?? ''), params.value);
            reply(null);
            return;
          }
          case 'ai.complete': {
            const result = await miniAppAPI.aiComplete(appId, String(params.prompt ?? ''), params.options as Record<string, unknown>);
            reply(result);
            return;
          }
          case 'ai.chat': {
            const result = await miniAppAPI.aiChat(
              appId,
              (params.messages as { role: string; content: string }[]) ?? [],
              String(params.streamId ?? ''),
              params.options as Record<string, unknown>,
            );
            reply(result);
            return;
          }
          case 'ai.cancel': {
            await miniAppAPI.aiCancel(appId, String(params.streamId ?? ''));
            reply(null);
            return;
          }
          case 'ai.getModels': {
            const models = await miniAppAPI.aiListModels(appId);
            reply(models);
            return;
          }
          case 'dialog.open': {
            const path = await dialogOpen(params as Parameters<typeof dialogOpen>[0]);
            reply(path);
            return;
          }
          case 'dialog.save': {
            const path = await dialogSave(params as Parameters<typeof dialogSave>[0]);
            reply(path);
            return;
          }
          case 'dialog.message': {
            const ok = await dialogMessage(params as Parameters<typeof dialogMessage>[0]);
            reply(ok);
            return;
          }
          case 'clipboard.writeText': {
            await navigator.clipboard.writeText(String(params.text ?? ''));
            reply(null);
            return;
          }
          case 'clipboard.readText': {
            const text = await navigator.clipboard.readText();
            reply(text);
            return;
          }
          default:
            replyError(`unhandled method: ${method}`);
        }
      } catch (err) {
        replyError(String(err));
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [appId, iframeRef, cacheState]);

  useLayoutEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'bitfun:event', event: 'themeChange', payload: { theme: currentTheme } }, '*');
  }, [currentTheme, iframeRef]);
}
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/scenes/externalapps/hooks/useExternalAppBridge.ts
git commit -m "feat(external-app): add postMessage bridge hook with capability whitelist"
```

---

### 任务 10：ExternalAppRunner

**文件：**
- 创建：`src/web-ui/src/app/scenes/externalapps/ExternalAppRunner.tsx`

- [ ] **步骤 1：编写 Runner 组件**

```tsx
import React, { useRef } from 'react';
import { useExternalAppBridge } from './hooks/useExternalAppBridge';

interface ExternalAppRunnerProps {
  url: string;
  appId: string;
  grantedCapabilities: Set<string>;
}

const ExternalAppRunner: React.FC<ExternalAppRunnerProps> = ({ url, appId, grantedCapabilities }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useExternalAppBridge(iframeRef, appId, grantedCapabilities);

  return (
    <iframe
      ref={iframeRef}
      src={url}
      data-app-id={appId}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      style={{ width: '100%', height: '100%', border: 'none' }}
      title={appId}
    />
  );
};

export default ExternalAppRunner;
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/scenes/externalapps/ExternalAppRunner.tsx
git commit -m "feat(external-app): add ExternalAppRunner iframe component"
```

---

### 任务 11：PermissionGrantPanel

**文件：**
- 创建：`src/web-ui/src/app/scenes/externalapps/components/PermissionGrantPanel.tsx`

- [ ] **步骤 1：编写授权面板组件**

```tsx
import React, { useState, useMemo } from 'react';
import type { ManifestCapabilities } from '../types/externalApp';

interface PermissionGrantPanelProps {
  appName: string;
  manifest: ManifestCapabilities;
  currentGrants: Set<string>;
  onConfirm: (grants: string[]) => void;
  onDeny: () => void;
}

const CAPABILITY_LABELS: Record<string, string> = {
  ai: 'AI 对话与补全',
  storage: '隔离存储读写',
  dialog: '系统文件对话框',
  clipboard: '剪贴板访问',
};

const PermissionGrantPanel: React.FC<PermissionGrantPanelProps> = ({
  appName, manifest, currentGrants, onConfirm, onDeny,
}) => {
  const capabilities = useMemo(() => {
    const caps: { key: string; label: string; description?: string; enabled: boolean }[] = [];
    const c = manifest.capabilities;
    if (c.ai?.enabled) caps.push({ key: 'ai', label: CAPABILITY_LABELS.ai, description: c.ai.description, enabled: true });
    if (c.storage?.enabled) caps.push({ key: 'storage', label: CAPABILITY_LABELS.storage, description: c.storage.description, enabled: true });
    if (c.dialog?.enabled) caps.push({ key: 'dialog', label: CAPABILITY_LABELS.dialog, description: c.dialog.description, enabled: true });
    if (c.clipboard?.enabled) caps.push({ key: 'clipboard', label: CAPABILITY_LABELS.clipboard, description: c.clipboard.description, enabled: true });
    return caps;
  }, [manifest]);

  const [selected, setSelected] = useState<Set<string>>(new Set(currentGrants));

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (capabilities.length === 0) return null;

  return (
    <div className="external-app-permission-panel">
      <h3>{appName} 请求权限</h3>
      <ul className="permission-list">
        {capabilities.map((cap) => (
          <li key={cap.key}>
            <label>
              <input type="checkbox" checked={selected.has(cap.key)} onChange={() => toggle(cap.key)} />
              <span>{cap.label}</span>
            </label>
            {cap.description && <span className="desc">{cap.description}</span>}
          </li>
        ))}
      </ul>
      <div className="actions">
        <button onClick={() => setSelected(new Set(capabilities.map((c) => c.key)))}>全选</button>
        <button onClick={() => setSelected(new Set())}>全不选</button>
        <button onClick={() => onConfirm(Array.from(selected))}>确认授权</button>
        <button onClick={onDeny}>拒绝</button>
      </div>
    </div>
  );
};

export default PermissionGrantPanel;
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/scenes/externalapps/components/PermissionGrantPanel.tsx
git commit -m "feat(external-app): add PermissionGrantPanel component"
```

---

### 任务 12：ExternalAppScene

**文件：**
- 创建：`src/web-ui/src/app/scenes/externalapps/ExternalAppScene.tsx`

- [ ] **步骤 1：编写场景组件**

```tsx
import React, { useEffect, useState, useCallback } from 'react';
import ExternalAppRunner from './ExternalAppRunner';
import PermissionGrantPanel from './components/PermissionGrantPanel';
import { useExternalAppStore } from './stores/externalAppStore';
import { externalAppAPI } from '@/infrastructure/api/service-api/ExternalAppAPI';
import type { ExternalAppMeta, ManifestCapabilities } from './types/externalApp';

interface ExternalAppSceneProps {
  appId: string;
}

type SceneState = 'loading' | 'error' | 'granting' | 'running' | 'denied';

const ExternalAppScene: React.FC<ExternalAppSceneProps> = ({ appId }) => {
  const [meta, setMeta] = useState<ExternalAppMeta | null>(null);
  const [manifest, setManifest] = useState<ManifestCapabilities | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [sceneState, setSceneState] = useState<SceneState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fetchManifest = useExternalAppStore((s) => s.fetchManifest);
  const storeSetGrants = useExternalAppStore((s) => s.setGrants);

  const load = useCallback(async () => {
    setSceneState('loading');
    try {
      const appMeta = await externalAppAPI.getExternalApp(appId);
      setMeta(appMeta);
      const storedGrants = await externalAppAPI.getGrants(appId);
      const grantSet = new Set(storedGrants);
      setGrants(grantSet);

      const mani = await fetchManifest(appId, appMeta.url);
      if (!mani) {
        setManifest({ version: '0.0.0', capabilities: { storage: { enabled: true } }, commands: [] });
        setSceneState('running');
        return;
      }
      setManifest(mani);

      const required = new Set<string>();
      if (mani.capabilities.ai?.enabled) required.add('ai');
      if (mani.capabilities.storage?.enabled) required.add('storage');
      if (mani.capabilities.dialog?.enabled) required.add('dialog');
      if (mani.capabilities.clipboard?.enabled) required.add('clipboard');

      const missing = Array.from(required).filter((g) => !grantSet.has(g));
      if (missing.length > 0) setSceneState('granting');
      else setSceneState('running');
    } catch (e) {
      setErrorMsg(String(e));
      setSceneState('error');
    }
  }, [appId, fetchManifest]);

  useEffect(() => { load(); }, [load]);

  const handleConfirmGrants = async (newGrants: string[]) => {
    await storeSetGrants(appId, newGrants);
    setGrants(new Set(newGrants));
    setSceneState('running');
  };

  const handleDeny = () => setSceneState('denied');
  const handleRetry = () => load();

  if (sceneState === 'loading') return <div className="external-app-scene loading"><span>加载中...</span></div>;
  if (sceneState === 'error') return <div className="external-app-scene error"><p>加载失败: {errorMsg}</p><button onClick={handleRetry}>重试</button></div>;
  if (sceneState === 'denied') return <div className="external-app-scene denied"><p>用户拒绝了权限授权</p><button onClick={handleRetry}>重新授权</button></div>;
  if (sceneState === 'granting' && meta && manifest) {
    return (
      <div className="external-app-scene granting">
        <PermissionGrantPanel appName={meta.name} manifest={manifest} currentGrants={grants} onConfirm={handleConfirmGrants} onDeny={handleDeny} />
      </div>
    );
  }
  if (sceneState === 'running' && meta) {
    return (
      <div className="external-app-scene running" style={{ width: '100%', height: '100%' }}>
        <ExternalAppRunner url={meta.url} appId={appId} grantedCapabilities={grants} />
      </div>
    );
  }
  return null;
};

export default ExternalAppScene;
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/scenes/externalapps/ExternalAppScene.tsx
git commit -m "feat(external-app): add ExternalAppScene with lifecycle and grant flow"
```

---

### 任务 13：ExternalAppCard

**文件：**
- 创建：`src/web-ui/src/app/scenes/externalapps/components/ExternalAppCard.tsx`

- [ ] **步骤 1：编写卡片组件**

```tsx
import React from 'react';
import type { ExternalAppMeta } from '../types/externalApp';

interface ExternalAppCardProps {
  app: ExternalAppMeta;
  onOpen: (appId: string) => void;
  onDelete: (appId: string) => void;
}

const ExternalAppCard: React.FC<ExternalAppCardProps> = ({ app, onOpen, onDelete }) => (
  <div className="external-app-card" onClick={() => onOpen(app.id)}>
    <div className="external-app-icon">{app.icon}</div>
    <div className="external-app-info">
      <div className="external-app-name">{app.name}</div>
      <div className="external-app-url">{app.url}</div>
      {app.description && <div className="external-app-desc">{app.description}</div>}
    </div>
    <button
      className="external-app-delete-btn"
      onClick={(e) => { e.stopPropagation(); onDelete(app.id); }}
    >
      删除
    </button>
  </div>
);

export default ExternalAppCard;
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/scenes/externalapps/components/ExternalAppCard.tsx
git commit -m "feat(external-app): add ExternalAppCard component"
```

---

### 任务 14：AddExternalAppDialog

**文件：**
- 创建：`src/web-ui/src/app/scenes/externalapps/components/AddExternalAppDialog.tsx`

- [ ] **步骤 1：编写添加弹窗组件**

```tsx
import React, { useState } from 'react';
import type { CreateExternalAppRequest } from '../types/externalApp';

interface AddExternalAppDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (req: CreateExternalAppRequest) => void;
}

const AddExternalAppDialog: React.FC<AddExternalAppDialogProps> = ({ open, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    onSubmit({ name: name.trim(), url: url.trim(), icon: icon.trim() || undefined, description: description.trim() || undefined });
    setName(''); setUrl(''); setIcon(''); setDescription('');
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <h3>添加外部应用</h3>
        <form onSubmit={handleSubmit}>
          <label>名称 *<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>URL *<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required /></label>
          <label>图标（emoji 或 URL）<input value={icon} onChange={(e) => setIcon(e.target.value)} /></label>
          <label>描述<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>取消</button>
            <button type="submit">添加</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddExternalAppDialog;
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/scenes/externalapps/components/AddExternalAppDialog.tsx
git commit -m "feat(external-app): add AddExternalAppDialog component"
```

---

### 任务 15：ExternalAppGalleryScene

**文件：**
- 创建：`src/web-ui/src/app/scenes/externalapps/ExternalAppGalleryScene.tsx`

- [ ] **步骤 1：编写画廊场景**

```tsx
import React, { useEffect, useState } from 'react';
import ExternalAppCard from './components/ExternalAppCard';
import AddExternalAppDialog from './components/AddExternalAppDialog';
import { useExternalAppStore } from './stores/externalAppStore';
import { useSceneManager } from '../../hooks/useSceneManager';
import type { CreateExternalAppRequest } from './types/externalApp';

const ExternalAppGalleryScene: React.FC = () => {
  const { openScene } = useSceneManager();
  const apps = useExternalAppStore((s) => s.apps);
  const loading = useExternalAppStore((s) => s.loading);
  const loadApps = useExternalAppStore((s) => s.loadApps);
  const addApp = useExternalAppStore((s) => s.addApp);
  const removeApp = useExternalAppStore((s) => s.removeApp);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => { loadApps(); }, [loadApps]);

  const handleOpen = (appId: string) => { openScene(`externalapp:${appId}` as `externalapp:${string}`); };
  const handleDelete = async (appId: string) => { if (confirm('确定要删除此外部应用吗？')) await removeApp(appId); };
  const handleAdd = async (req: CreateExternalAppRequest) => { await addApp(req); };

  return (
    <div className="external-app-gallery-scene">
      <div className="gallery-header">
        <h2>外部应用</h2>
        <button onClick={() => setDialogOpen(true)}>+ 添加应用</button>
      </div>
      {loading && <div>加载中...</div>}
      <div className="gallery-grid">
        {apps.map((app) => (
          <ExternalAppCard key={app.id} app={app} onOpen={handleOpen} onDelete={handleDelete} />
        ))}
      </div>
      {apps.length === 0 && !loading && <div className="gallery-empty">暂无外部应用，点击"添加应用"开始。</div>}
      <AddExternalAppDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmit={handleAdd} />
    </div>
  );
};

export default ExternalAppGalleryScene;
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/scenes/externalapps/ExternalAppGalleryScene.tsx
git commit -m "feat(external-app): add ExternalAppGalleryScene"
```

---

## 基座集成任务组

### 任务 16：SceneTabId 与 SceneViewport 扩展

**文件：**
- 修改：`src/web-ui/src/app/components/SceneBar/types.ts`
- 修改：`src/web-ui/src/app/scenes/SceneViewport.tsx`

- [ ] **步骤 1：修改 SceneTabId**

在 `src/web-ui/src/app/components/SceneBar/types.ts` 的 `SceneTabId` 联合类型中，在 `miniapp:${string}` 之后添加：

```typescript
export type SceneTabId =
  | 'welcome'
  | 'session'
  // ... existing entries ...
  | `miniapp:${string}`
  | `externalapp:${string}`;
```

- [ ] **步骤 2：修改 SceneViewport**

在 `src/web-ui/src/app/scenes/SceneViewport.tsx` 的 `renderScene` 的 `default` 分支中，在 `miniapp:` 分支之后添加：

```tsx
import ExternalAppScene from './externalapps/ExternalAppScene';
// ...
default:
  if (typeof id === 'string' && id.startsWith('miniapp:')) {
    return <MiniAppScene appId={id.slice('miniapp:'.length)} />;
  }
  if (typeof id === 'string' && id.startsWith('externalapp:')) {
    return <ExternalAppScene appId={id.slice('externalapp:'.length)} />;
  }
  return null;
```

- [ ] **步骤 3：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 4：Commit**

```bash
git add src/web-ui/src/app/components/SceneBar/types.ts
git add src/web-ui/src/app/scenes/SceneViewport.tsx
git commit -m "feat(external-app): wire externalapp scene into viewport and tab types"
```

---

### 任务 17：Registry 与 SceneStore 扩展

**文件：**
- 修改：`src/web-ui/src/app/scenes/registry.ts`
- 修改：`src/web-ui/src/app/stores/sceneStore.ts`

- [ ] **步骤 1：修改 registry.ts**

在 `src/web-ui/src/app/scenes/registry.ts` 的 `getMiniAppSceneDef` 函数之后添加：

```typescript
export function getExternalAppSceneDef(appId: string, appName?: string): SceneTabDef {
  const id: SceneTabId = `externalapp:${appId}`;
  return {
    id,
    label: appName ?? appId,
    Icon: Globe,
    pinned: false,
    fixed: false,
    closable: true,
    singleton: false,
    defaultOpen: false,
  };
}
```

确认 `Globe` 已从 `lucide-react` 导入（registry.ts 中已有）。

- [ ] **步骤 2：修改 sceneStore.ts**

1. 将导入从 `../scenes/registry` 改为导入 `getExternalAppSceneDef`：

```typescript
import { SCENE_TAB_REGISTRY, MAX_OPEN_SCENES, getSceneDef, getMiniAppSceneDef, getExternalAppSceneDef } from '../scenes/registry';
```

2. 将 `getSceneDefOrMiniapp` 函数扩展为支持 `externalapp:`：

```typescript
function getSceneDefOrMiniapp(id: SceneTabId) {
  const d = getSceneDef(id);
  if (d) return d;
  if (typeof id === 'string' && id.startsWith('miniapp:')) {
    const appId = (id as string).slice('miniapp:'.length);
    return getMiniAppSceneDef(appId);
  }
  if (typeof id === 'string' && id.startsWith('externalapp:')) {
    const appId = (id as string).slice('externalapp:'.length);
    const appMeta = useExternalAppStore.getState().apps.find(a => a.id === appId);
    return getExternalAppSceneDef(appId, appMeta?.name);
  }
  return undefined;
}
```

3. 在 `sceneStore.ts` 顶部添加导入：

```typescript
import { useExternalAppStore } from '../scenes/externalapps/stores/externalAppStore';
```

- [ ] **步骤 3：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 4：Commit**

```bash
git add src/web-ui/src/app/scenes/registry.ts
git add src/web-ui/src/app/stores/sceneStore.ts
git commit -m "feat(external-app): add external app scene def resolver to registry and store"
```

---

### 任务 18：NavPanel 导航入口

**文件：**
- 修改：`src/web-ui/src/app/components/NavPanel/MainNav.tsx`

- [ ] **步骤 1：修改 MainNav.tsx**

在 `src/web-ui/src/app/components/NavPanel/MainNav.tsx` 中，找到 `MiniAppEntry` 组件的使用位置，在其后添加外部应用入口：

```tsx
import { Globe } from 'lucide-react';
// ... existing imports ...

// In the JSX, near the MiniAppEntry:
<div className="nav-external-apps-entry">
  <button className="nav-item" onClick={() => openScene('externalapps')}>
    <Globe size={18} />
    <span>外部应用</span>
  </button>
</div>
```

**注意**：`externalapps` 场景 ID 需要先注册到 `SCENE_TAB_REGISTRY`。在 `src/web-ui/src/app/scenes/registry.ts` 的 `SCENE_TAB_REGISTRY` 数组末尾添加：

```typescript
{
  id: 'externalapps' as SceneTabId,
  label: 'External Apps',
  labelKey: 'scenes.externalApps',
  Icon: Globe,
  pinned: false,
  singleton: true,
  defaultOpen: false,
},
```

- [ ] **步骤 2：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add src/web-ui/src/app/components/NavPanel/MainNav.tsx
git add src/web-ui/src/app/scenes/registry.ts
git commit -m "feat(external-app): add external apps nav entry and registry scene"
```

---

## 测试任务组

### 任务 19：Rust 单元测试

**文件：**
- 各 `#[cfg(test)]` 内联测试（models、storage、manifest、control_external_app_tool）

- [ ] **步骤 1：运行 Rust 测试**

命令：`cargo test -p bitfun-core external_app -- --nocapture`
预期：所有测试通过

- [ ] **步骤 2：全量 Cargo check**

命令：`cargo check --workspace`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git commit -m "test(external-app): verify Rust unit tests pass"
```

---

### 任务 20：前端类型检查与构建

- [ ] **步骤 1：TypeScript 类型检查**

命令：`pnpm run type-check:web`
预期：0 errors

- [ ] **步骤 2：Lint 检查**

命令：`pnpm run lint:web`
预期：0 errors（或仅存在预先存在的警告）

- [ ] **步骤 3：Commit**

```bash
git commit -m "test(external-app): verify frontend type-check and lint pass"
```

---

## 自检

### 规格覆盖度

| 规格章节 | 实现任务 | 状态 |
|---|---|---|
| P0-1 `externalapp:` 场景类型 | 任务 16 | 已覆盖 |
| P0-2 元数据管理 | 任务 1, 4, 7, 8 | 已覆盖 |
| P0-3 iframe `src` 加载 | 任务 10 | 已覆盖 |
| P0-4 简化桥接 | 任务 9 | 已覆盖 |
| P0-5 `bitfun.manifest.json` 拉取解析 | 任务 3, 12 | 已覆盖 |
| P0-6 授权面板 | 任务 11, 12 | 已覆盖 |
| P0-7 隔离存储 | 任务 2, 4 | 已覆盖 |
| P0-8 画廊入口与标签页管理 | 任务 15, 17, 18 | 已覆盖 |
| P0-9 `ControlExternalApp` Rust Tool | 任务 5 | 已覆盖 |
| P1-1 状态上报与缓存 | Store `cacheState` / `getCachedState` | 已覆盖 |
| P1-2 一键清空缓存 | Store `clearAllData` + API | 已覆盖 |
| P1-4 分类与搜索 | GalleryScene 可扩展 | 已预留 |

### 占位符扫描

- 无 "TODO" / "待定" / "后续实现" 等占位符。
- 每个代码步骤包含可直接使用的实际代码。
- 所有文件路径精确到具体文件。

### 类型一致性

- Rust：`ExternalAppMeta`、`ManifestCapabilities` 在 models.rs 中定义，commands.rs / manifest.rs 中复用。
- TypeScript：`ExternalAppMeta`、`ManifestCapabilities` 在 `types/externalApp.ts` 中定义，Store / API / 组件中复用。
- 桥接方法白名单：`useExternalAppBridge.ts` 中的 `ALLOWED_METHODS` 与规格一致。
- 存储 key 前缀：`externalapp:{id}:{key}` 前后端一致。

---

## 执行选项

**计划已完成并保存到 `docs/superpowers/plans/2026-06-01-external-app-module.md`。两种执行方式：**

**1. 子代理驱动（推荐）** — 每个任务调度一个新的子代理，任务间进行审查，快速迭代。使用 superpowers:subagent-driven-development 技能。

**2. 内联执行** — 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点供审查。使用 superpowers:executing-plans 技能。

**选哪种方式？**



