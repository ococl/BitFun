use crate::infrastructure::app_paths::try_get_path_manager_arc;
use crate::util::errors::{BitFunError, BitFunResult};
use super::models::ExternalAppMeta;
use super::storage;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

static EXTERNAL_APP_STORE: OnceLock<Mutex<Vec<ExternalAppMeta>>> = OnceLock::new();
static EXTERNAL_APP_GRANTS: OnceLock<Mutex<HashMap<String, Vec<String>>>> = OnceLock::new();

fn app_store() -> &'static Mutex<Vec<ExternalAppMeta>> {
    EXTERNAL_APP_STORE.get_or_init(|| Mutex::new(Vec::new()))
}

fn grants_store() -> &'static Mutex<HashMap<String, Vec<String>>> {
    EXTERNAL_APP_GRANTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn app_store_path() -> BitFunResult<std::path::PathBuf> {
    let base = try_get_path_manager_arc()?.user_data_dir();
    Ok(base.join("external_apps").join("registry.json"))
}

fn grants_file_path() -> BitFunResult<std::path::PathBuf> {
    let base = try_get_path_manager_arc()?.user_data_dir();
    Ok(base.join("external_apps").join("grants.json"))
}

fn read_registry() -> BitFunResult<Vec<ExternalAppMeta>> {
    let path = app_store_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| {
        BitFunError::Service(format!("read registry failed: {}", e))
    })?;
    let apps: Vec<ExternalAppMeta> = serde_json::from_str(&content).map_err(|e| {
        BitFunError::Service(format!("parse registry failed: {}", e))
    })?;
    Ok(apps)
}

fn write_registry(apps: &[ExternalAppMeta]) -> BitFunResult<()> {
    let path = app_store_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            BitFunError::Service(format!("create registry dir failed: {}", e))
        })?;
    }
    let content = serde_json::to_string_pretty(apps).map_err(|e| {
        BitFunError::Service(format!("serialize registry failed: {}", e))
    })?;
    std::fs::write(&path, content).map_err(|e| {
        BitFunError::Service(format!("write registry failed: {}", e))
    })?;
    Ok(())
}

fn read_grants() -> BitFunResult<HashMap<String, Vec<String>>> {
    let path = grants_file_path()?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| {
        BitFunError::Service(format!("read grants failed: {}", e))
    })?;
    let grants: HashMap<String, Vec<String>> = serde_json::from_str(&content)
        .map_err(|e| BitFunError::Service(format!("parse grants failed: {}", e)))?;
    Ok(grants)
}

fn write_grants(grants: &HashMap<String, Vec<String>>) -> BitFunResult<()> {
    let path = grants_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            BitFunError::Service(format!("create grants dir failed: {}", e))
        })?;
    }
    let content = serde_json::to_string_pretty(grants).map_err(|e| {
        BitFunError::Service(format!("serialize grants failed: {}", e))
    })?;
    std::fs::write(&path, content).map_err(|e| {
        BitFunError::Service(format!("write grants failed: {}", e))
    })?;
    Ok(())
}

fn load_store() -> BitFunResult<()> {
    let apps = read_registry()?;
    let mut store = app_store()
        .lock()
        .map_err(|e| BitFunError::Service(format!("lock store failed: {}", e)))?;
    *store = apps;
    let grants = read_grants()?;
    let mut g = grants_store()
        .lock()
        .map_err(|e| BitFunError::Service(format!("lock grants failed: {}", e)))?;
    *g = grants;
    Ok(())
}

fn save_store() -> BitFunResult<()> {
    let store = app_store()
        .lock()
        .map_err(|e| BitFunError::Service(format!("lock store failed: {}", e)))?;
    write_registry(&store)?;
    let grants = grants_store()
        .lock()
        .map_err(|e| BitFunError::Service(format!("lock grants failed: {}", e)))?;
    write_grants(&grants)?;
    Ok(())
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

/// ExternalApp service — CRUD, storage, and grants.
pub struct ExternalAppService;

impl ExternalAppService {
    pub fn new() -> Self {
        Self
    }

    pub fn list_apps() -> BitFunResult<Vec<ExternalAppMeta>> {
        load_store()?;
        let store = app_store()
            .lock()
            .map_err(|e| BitFunError::Service(format!("lock store failed: {}", e)))?;
        Ok(store.clone())
    }

    pub fn get_app(app_id: &str) -> BitFunResult<ExternalAppMeta> {
        load_store()?;
        let store = app_store()
            .lock()
            .map_err(|e| BitFunError::Service(format!("lock store failed: {}", e)))?;
        store
            .iter()
            .find(|a| a.id == app_id)
            .cloned()
            .ok_or_else(|| BitFunError::NotFound(format!("external app not found: {}", app_id)))
    }

    pub fn create_app(request: CreateExternalAppRequest) -> BitFunResult<ExternalAppMeta> {
        load_store()?;
        let mut store = app_store()
            .lock()
            .map_err(|e| BitFunError::Service(format!("lock store failed: {}", e)))?;
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

    pub fn update_app(
        app_id: &str,
        request: UpdateExternalAppRequest,
    ) -> BitFunResult<ExternalAppMeta> {
        load_store()?;
        let mut store = app_store()
            .lock()
            .map_err(|e| BitFunError::Service(format!("lock store failed: {}", e)))?;
        let app = store
            .iter_mut()
            .find(|a| a.id == app_id)
            .ok_or_else(|| BitFunError::NotFound(format!("external app not found: {}", app_id)))?;
        if let Some(name) = request.name {
            app.name = name;
        }
        if let Some(url) = request.url {
            app.url = url;
        }
        if let Some(icon) = request.icon {
            app.icon = icon;
        }
        if let Some(description) = request.description {
            app.description = description;
        }
        app.updated_at = now_secs();
        let cloned = app.clone();
        drop(store);
        save_store()?;
        Ok(cloned)
    }

    pub fn delete_app(app_id: &str) -> BitFunResult<()> {
        load_store()?;
        let mut store = app_store()
            .lock()
            .map_err(|e| BitFunError::Service(format!("lock store failed: {}", e)))?;
        let before = store.len();
        store.retain(|a| a.id != app_id);
        if store.len() == before {
            return Err(BitFunError::NotFound(format!(
                "external app not found: {}",
                app_id
            )));
        }
        drop(store);
        save_store()?;
        let _ = storage::clear_external_app_storage(app_id);
        let mut grants = grants_store()
            .lock()
            .map_err(|e| BitFunError::Service(format!("lock grants failed: {}", e)))?;
        grants.remove(app_id);
        drop(grants);
        let _ = save_store();
        Ok(())
    }

    pub fn get_storage(app_id: &str, key: &str) -> BitFunResult<Option<Value>> {
        storage::get_external_app_storage(app_id, key)
    }

    pub fn set_storage(app_id: &str, key: &str, value: Value) -> BitFunResult<()> {
        storage::set_external_app_storage(app_id, key, value)
    }

    pub fn clear_storage(app_id: &str) -> BitFunResult<()> {
        storage::clear_external_app_storage(app_id)
    }

    pub fn get_grants(app_id: &str) -> BitFunResult<Vec<String>> {
        load_store()?;
        let grants = grants_store()
            .lock()
            .map_err(|e| BitFunError::Service(format!("lock grants failed: {}", e)))?;
        Ok(grants.get(app_id).cloned().unwrap_or_default())
    }

    pub fn set_grants(app_id: &str, grants: Vec<String>) -> BitFunResult<()> {
        load_store()?;
        let mut all = grants_store()
            .lock()
            .map_err(|e| BitFunError::Service(format!("lock grants failed: {}", e)))?;
        all.insert(app_id.to_string(), grants);
        drop(all);
        save_store()
    }
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
