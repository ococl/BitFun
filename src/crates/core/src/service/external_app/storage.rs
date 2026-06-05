use crate::infrastructure::app_paths::try_get_path_manager_arc;
use crate::util::errors::{BitFunError, BitFunResult};
use serde_json::Value;
use std::path::PathBuf;

fn storage_key(app_id: &str, user_key: &str) -> String {
    format!("externalapp:{}:{}", app_id, user_key)
}

fn external_app_storage_dir(app_id: &str) -> BitFunResult<PathBuf> {
    let base = try_get_path_manager_arc()?.user_data_dir();
    Ok(base.join("external_apps").join(app_id))
}

fn storage_file_path(app_id: &str) -> BitFunResult<PathBuf> {
    let dir = external_app_storage_dir(app_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| {
        BitFunError::Service(format!("create storage dir failed: {}", e))
    })?;
    Ok(dir.join("storage.json"))
}

fn read_storage_map(app_id: &str) -> BitFunResult<serde_json::Map<String, Value>> {
    let path = storage_file_path(app_id)?;
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| {
        BitFunError::Service(format!("read storage file failed: {}", e))
    })?;
    let map: serde_json::Map<String, Value> = serde_json::from_str(&content).map_err(|e| {
        BitFunError::Service(format!("parse storage file failed: {}", e))
    })?;
    Ok(map)
}

fn write_storage_map(app_id: &str, map: &serde_json::Map<String, Value>) -> BitFunResult<()> {
    let path = storage_file_path(app_id)?;
    let content = serde_json::to_string_pretty(map).map_err(|e| {
        BitFunError::Service(format!("serialize storage failed: {}", e))
    })?;
    std::fs::write(&path, content).map_err(|e| {
        BitFunError::Service(format!("write storage file failed: {}", e))
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
            BitFunError::Service(format!("remove storage file failed: {}", e))
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
