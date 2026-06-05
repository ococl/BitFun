//! External App Manager Tool — built-in tool for managing external apps lifecycle.

use crate::agentic::tools::framework::{Tool, ToolResult, ToolUseContext};
use crate::service::external_app::{
    commands::{
        CreateExternalAppRequest, ExternalAppService, UpdateExternalAppRequest,
    },
    manifest::fetch_manifest,
};
use crate::util::errors::{BitFunError, BitFunResult};
use async_trait::async_trait;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub struct ExternalAppManagerTool;

impl ExternalAppManagerTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ExternalAppManagerTool {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExternalAppManagerRequest {
    pub action: ManagerAction,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ManagerAction {
    ListApps,
    GetAppInfo { app_id: String },
    ListCommands { app_id: String },
    AddApp { url: String },
    RemoveApp { app_id: String },
    UpdateApp { app_id: String },
}

#[async_trait]
impl Tool for ExternalAppManagerTool {
    fn name(&self) -> &str {
        "ExternalAppManager"
    }

    async fn description(&self) -> BitFunResult<String> {
        Ok(r#"Manage external applications in BitFun.
Actions:
- list_apps: list all installed external apps
- get_app_info: get full metadata of a specific app
- list_commands: list all commands exposed by an app
- add_app: install an external app by URL (fetches manifest automatically)
- remove_app: uninstall an external app
- update_app: re-fetch manifest and update app metadata"#
            .to_string())
    }

    fn short_description(&self) -> String {
        "Manage external applications (add, remove, update, query).".to_string()
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "object",
                    "oneOf": [
                        { "type": "object", "properties": { "type": { "type": "string", "const": "list_apps" } }, "required": ["type"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "get_app_info" }, "app_id": { "type": "string" } }, "required": ["type", "app_id"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "list_commands" }, "app_id": { "type": "string" } }, "required": ["type", "app_id"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "add_app" }, "url": { "type": "string" } }, "required": ["type", "url"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "remove_app" }, "app_id": { "type": "string" } }, "required": ["type", "app_id"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "update_app" }, "app_id": { "type": "string" } }, "required": ["type", "app_id"] }
                    ]
                }
            },
            "required": ["action"]
        })
    }

    async fn call_impl(
        &self,
        input: &Value,
        _context: &ToolUseContext,
    ) -> BitFunResult<Vec<ToolResult>> {
        let request: ExternalAppManagerRequest = serde_json::from_value(input.clone())
            .map_err(|e| BitFunError::Tool(format!("invalid request: {}", e)))?;

        info!("ExternalAppManager action: {:?}", request.action);

        let result = match request.action {
            ManagerAction::ListApps => list_apps(),
            ManagerAction::GetAppInfo { app_id } => get_app_info(&app_id),
            ManagerAction::ListCommands { app_id } => list_commands(&app_id),
            ManagerAction::AddApp { url } => add_app(&url).await,
            ManagerAction::RemoveApp { app_id } => remove_app(&app_id),
            ManagerAction::UpdateApp { app_id } => update_app(&app_id).await,
        }?;

        Ok(vec![ToolResult::ok(result, None)])
    }

    fn needs_permissions(&self, _input: Option<&Value>) -> bool {
        true
    }
}

fn list_apps() -> BitFunResult<Value> {
    let apps = ExternalAppService::list_apps()?;
    let summaries: Vec<Value> = apps
        .into_iter()
        .map(|app| {
            json!({
                "id": app.id,
                "name": app.name,
                "url": app.url,
                "version": app.version,
                "command_count": app.commands.len(),
            })
        })
        .collect();
    Ok(json!({ "apps": summaries }))
}

fn get_app_info(app_id: &str) -> BitFunResult<Value> {
    let app = ExternalAppService::get_app(app_id)?;
    Ok(serde_json::to_value(app).map_err(|e| {
        BitFunError::Tool(format!("serialize app info failed: {}", e))
    })?)
}

fn list_commands(app_id: &str) -> BitFunResult<Value> {
    let app = ExternalAppService::get_app(app_id)?;
    Ok(json!({ "commands": app.commands }))
}

async fn add_app(url: &str) -> BitFunResult<Value> {
    debug!("Fetching manifest for new app: {}", url);
    let manifest = fetch_manifest(url).await.map_err(|e| {
        BitFunError::Tool(format!("Failed to fetch manifest from {}: {}", url, e))
    })?;

    let request = CreateExternalAppRequest {
        name: manifest.name.unwrap_or_else(|| {
            // Fallback to hostname if name not provided
            url.trim_end_matches('/')
                .rsplit_once('/')
                .map(|(_, last)| last.to_string())
                .unwrap_or_else(|| "Untitled App".to_string())
        }),
        url: url.to_string(),
        icon: None,
        description: manifest.description,
        version: manifest.version,
        commands: manifest.commands,
    };

    let app = ExternalAppService::create_app(request)?;
    info!("Created external app: {} (id={})", app.name, app.id);
    Ok(json!({
        "success": true,
        "app": app,
    }))
}

fn remove_app(app_id: &str) -> BitFunResult<Value> {
    ExternalAppService::delete_app(app_id)?;
    info!("Deleted external app: {}", app_id);
    Ok(json!({ "success": true }))
}

async fn update_app(app_id: &str) -> BitFunResult<Value> {
    let existing = ExternalAppService::get_app(app_id)?;
    debug!("Re-fetching manifest for app: {} (url={})", app_id, existing.url);

    let manifest = fetch_manifest(&existing.url).await.map_err(|e| {
        BitFunError::Tool(format!(
            "Failed to re-fetch manifest for {}: {}",
            existing.url, e
        ))
    })?;

    let request = UpdateExternalAppRequest {
        name: manifest.name,
        url: None,
        icon: None,
        description: manifest.description,
        version: Some(manifest.version),
        commands: Some(manifest.commands),
    };

    let app = ExternalAppService::update_app(app_id, request)?;
    info!("Updated external app: {} (id={})", app.name, app.id);
    Ok(json!({
        "success": true,
        "app": app,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::tools::framework::Tool;

    #[test]
    fn tool_name_is_external_app_manager() {
        let tool = ExternalAppManagerTool::new();
        assert_eq!(tool.name(), "ExternalAppManager");
    }

    #[test]
    fn tool_schema_has_required_fields() {
        let tool = ExternalAppManagerTool::new();
        let schema = tool.input_schema();
        assert!(schema.get("properties").is_some());
        assert!(schema.get("required").is_some());
    }
}
