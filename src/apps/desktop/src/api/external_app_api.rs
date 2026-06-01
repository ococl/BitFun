//! ExternalApp API — Tauri commands for external app CRUD, storage, and grants.

use bitfun_core::service::external_app::{
    CreateExternalAppRequest, ExternalAppMeta, ExternalAppService, UpdateExternalAppRequest,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub struct CreateExternalAppPayload {
    pub name: String,
    pub url: String,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateExternalAppPayload {
    pub name: Option<String>,
    pub url: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[tauri::command]
pub fn list_external_apps() -> Result<Vec<ExternalAppMeta>, String> {
    ExternalAppService::list_apps().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_external_app(app_id: String) -> Result<ExternalAppMeta, String> {
    ExternalAppService::get_app(&app_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_external_app(payload: CreateExternalAppPayload) -> Result<ExternalAppMeta, String> {
    let request = CreateExternalAppRequest {
        name: payload.name,
        url: payload.url,
        icon: payload.icon,
        description: payload.description,
    };
    ExternalAppService::create_app(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_external_app(
    app_id: String,
    payload: UpdateExternalAppPayload,
) -> Result<ExternalAppMeta, String> {
    let request = UpdateExternalAppRequest {
        name: payload.name,
        url: payload.url,
        icon: payload.icon,
        description: payload.description,
    };
    ExternalAppService::update_app(&app_id, request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_external_app(app_id: String) -> Result<(), String> {
    ExternalAppService::delete_app(&app_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_external_app_storage(app_id: String, key: String) -> Result<Option<Value>, String> {
    ExternalAppService::get_storage(&app_id, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_external_app_storage(
    app_id: String,
    key: String,
    value: Value,
) -> Result<(), String> {
    ExternalAppService::set_storage(&app_id, &key, value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_external_app_storage_cmd(app_id: String) -> Result<(), String> {
    ExternalAppService::clear_storage(&app_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_external_app_grants(app_id: String) -> Result<Vec<String>, String> {
    ExternalAppService::get_grants(&app_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_external_app_grants(app_id: String, grants: Vec<String>) -> Result<(), String> {
    ExternalAppService::set_grants(&app_id, grants).map_err(|e| e.to_string())
}
