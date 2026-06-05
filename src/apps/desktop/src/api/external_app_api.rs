//! ExternalApp API — Tauri commands for external app CRUD, storage, and grants.

use crate::api::app_state::AppState;
use bitfun_core::service::external_app::{
    CreateExternalAppRequest, ExternalAppMeta, ExternalAppService, UpdateExternalAppRequest,
    ManifestCommand,
};
use bitfun_core::util::types::message::Message as AIMessage;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct CreateExternalAppPayload {
    pub name: Option<String>,
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
    #[serde(default)]
    pub commands: Option<Vec<ManifestCommand>>,
}

#[tauri::command]
pub fn list_external_apps() -> Result<Vec<ExternalAppMeta>, String> {
    ExternalAppService::list_apps().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_external_app(app_id: String) -> Result<ExternalAppMeta, String> {
    ExternalAppService::get_app(&app_id).map_err(|e| e.to_string())
}

async fn fetch_external_app_metadata(url: &str) -> (String, Option<String>, Option<String>, Option<String>, Vec<ManifestCommand>) {
    let base = url.trim_end_matches('/');
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(8)).build() {
        Ok(c) => c,
        Err(_) => return (extract_host_name(url), None, None, None, Vec::new()),
    };

    // 1. Try manifest
    let manifest_url = format!("{}/.well-known/bitfun.manifest.json", base);
    if let Ok(resp) = client.get(&manifest_url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                let name = json.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
                let icon = json.get("icon").and_then(|v| v.as_str()).map(|s| s.to_string());
                let desc = json.get("description").and_then(|v| v.as_str()).map(|s| s.to_string());
                let version = json.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                let commands = json.get("commands")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|cmd| {
                                match serde_json::from_value::<ManifestCommand>(cmd.clone()) {
                                    Ok(cmd) => Some(cmd),
                                    Err(e) => {
                                        log::warn!("Failed to parse manifest command: {} | cmd={}", e, cmd);
                                        None
                                    }
                                }
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                if name.is_some() {
                    return (name.unwrap(), icon.or_else(|| Some("globe".to_string())), desc, version, commands);
                }
            }
        }
    }

    // 2. Try HTML title
    if let Ok(resp) = client.get(url).send().await {
        if resp.status().is_success() {
            if let Ok(html) = resp.text().await {
                if let Some(title) = extract_html_title(&html) {
                    let icon = extract_favicon_url(&html, base).or_else(|| Some("globe".to_string()));
                    return (title, icon, None, None, Vec::new());
                }
            }
        }
    }

    (extract_host_name(url), None, None, None, Vec::new())
}

fn extract_host_name(url: &str) -> String {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| url.to_string())
}

fn extract_html_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title>")? + 7;
    let end = lower.find("</title>")?;
    if end > start {
        let title = html[start..end].trim();
        if !title.is_empty() {
            return Some(html[start..end].to_string());
        }
    }
    None
}

fn extract_favicon_url(html: &str, base_url: &str) -> Option<String> {
    // Try <link rel="icon" href="...">
    let lower = html.to_lowercase();
    if let Some(pos) = lower.find("rel=\"icon\"") {
        let before = &html[..pos];
        if let Some(href_start) = before.rfind("href=\"") {
            let href_begin = href_start + 6;
            if let Some(href_end) = html[href_begin..].find("\"") {
                let href = &html[href_begin..href_begin + href_end];
                if href.starts_with("http") {
                    return Some(href.to_string());
                } else if href.starts_with('/') {
                    return Some(format!("{}{}", base_url, href));
                } else {
                    return Some(format!("{}/{}", base_url, href));
                }
            }
        }
    }
    // Try /favicon.ico
    Some(format!("{}/favicon.ico", base_url))
}

#[tauri::command]
pub async fn create_external_app(payload: CreateExternalAppPayload) -> Result<ExternalAppMeta, String> {
    let url = payload.url.clone();
    let (name, icon, desc, version, commands) = if payload.name.as_ref().map(|n| n.trim().is_empty()).unwrap_or(true) {
        fetch_external_app_metadata(&url).await
    } else {
        (payload.name.clone().unwrap(), payload.icon.clone(), None, None, Vec::new())
    };

    log::info!(
        "create_external_app: url={}, fetched_name={}, commands_count={}",
        url,
        name,
        commands.len()
    );
    for cmd in &commands {
        log::info!(
            "create_external_app: command_name={}",
            cmd.name
        );
    }

    let request = CreateExternalAppRequest {
        name,
        url: payload.url,
        icon: payload.icon.or(icon),
        description: payload.description.filter(|d| !d.trim().is_empty()).or(desc),
        version: version.unwrap_or_else(|| "0.0.0".to_string()),
        commands: commands.clone(),
    };
    let meta = ExternalAppService::create_app(request).map_err(|e| e.to_string())?;

    // Register commands as dynamic tools
    if !commands.is_empty() {
        let tools = build_external_app_tools(&meta.id, &meta.name, &commands);
        let registry = bitfun_core::agentic::tools::registry::get_global_tool_registry();
        let mut registry_lock = registry.write().await;
        registry_lock.register_external_app_tools(&meta.id, tools);
        log::info!(
            "create_external_app: registered {} tools for app_id={}",
            commands.len(),
            meta.id
        );
    }

    Ok(meta)
}

#[tauri::command]
pub async fn update_external_app(
    app_id: String,
    payload: UpdateExternalAppPayload,
) -> Result<ExternalAppMeta, String> {
    let request = UpdateExternalAppRequest {
        name: payload.name,
        url: payload.url,
        icon: payload.icon,
        description: payload.description,
        version: None,
        commands: payload.commands.clone(),
    };
    let meta = ExternalAppService::update_app(&app_id, request).map_err(|e| e.to_string())?;

    // Re-register tools if commands changed
    if payload.commands.is_some() {
        let registry = bitfun_core::agentic::tools::registry::get_global_tool_registry();
        let mut registry_lock = registry.write().await;
        registry_lock.unregister_external_app_tools(&app_id);
        if !meta.commands.is_empty() {
            let tools = build_external_app_tools(&meta.id, &meta.name, &meta.commands);
            registry_lock.register_external_app_tools(&meta.id, tools);
        }
    }

    Ok(meta)
}

#[tauri::command]
pub async fn delete_external_app(app_id: String) -> Result<(), String> {
    ExternalAppService::delete_app(&app_id).map_err(|e| e.to_string())?;

    // Unregister tools for this app
    let registry = bitfun_core::agentic::tools::registry::get_global_tool_registry();
    let mut registry_lock = registry.write().await;
    registry_lock.unregister_external_app_tools(&app_id);

    Ok(())
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

// ─── AI commands for external apps (bypass miniapp_manager) ─────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppAiCompleteRequest {
    pub app_id: String,
    pub prompt: String,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub temperature: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppAiCompleteResponse {
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppAiChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppAiChatRequest {
    pub app_id: String,
    pub messages: Vec<ExternalAppAiChatMessage>,
    pub stream_id: String,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub temperature: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppAiChatResponse {
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppAiCancelRequest {
    pub app_id: String,
    pub stream_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppAiListModelsRequest {
    pub app_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppAiModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model_name: String,
    pub base_url: String,
    pub request_url: Option<String>,
    pub context_window: Option<u32>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub enabled: bool,
    pub category: bitfun_core::service::config::types::ModelCategory,
    pub capabilities: Vec<bitfun_core::service::config::types::ModelCapability>,
    pub recommended_for: Vec<String>,
    pub metadata: Option<serde_json::Value>,
    pub reasoning_mode: Option<bitfun_core::service::config::types::ReasoningMode>,
    pub inline_think_in_text: bool,
    pub custom_headers: Option<std::collections::HashMap<String, String>>,
    pub custom_headers_mode: Option<String>,
    pub skip_ssl_verify: bool,
    pub reasoning_effort: Option<String>,
    pub thinking_budget_tokens: Option<u32>,
    pub custom_request_body: Option<String>,
    pub custom_request_body_mode: Option<String>,
    pub auth: bitfun_core::service::config::types::AuthConfig,
}

fn check_ai_granted(app_id: &str) -> Result<(), String> {
    let grants = ExternalAppService::get_grants(app_id).map_err(|e| e.to_string())?;
    if grants.contains(&"ai".to_string()) {
        Ok(())
    } else {
        Err("AI capability not granted for this external app".to_string())
    }
}

#[tauri::command]
pub async fn external_app_ai_complete(
    state: State<'_, AppState>,
    request: ExternalAppAiCompleteRequest,
) -> Result<ExternalAppAiCompleteResponse, String> {
    check_ai_granted(&request.app_id)?;

    let model_id = request.model.as_deref().unwrap_or("primary").to_string();
    let client = state
        .ai_client_factory
        .get_client_resolved(&model_id)
        .await
        .map_err(|e| format!("Failed to get AI client: {}", e))?;

    let mut messages = Vec::new();
    if let Some(sp) = request.system_prompt.as_deref() {
        if !sp.is_empty() {
            messages.push(AIMessage::system(sp.to_string()));
        }
    }
    messages.push(AIMessage::user(request.prompt));

    let stream_response = client
        .send_message_stream(messages, None)
        .await
        .map_err(|e| format!("AI request failed: {}", e))?;

    let mut stream = stream_response.stream;
    let mut full_text = String::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                if let Some(text) = chunk.text {
                    full_text.push_str(&text);
                }
            }
            Err(e) => {
                return Err(format!("AI stream error: {}", e));
            }
        }
    }

    Ok(ExternalAppAiCompleteResponse {
        text: full_text.trim().to_string(),
    })
}

#[tauri::command]
pub async fn external_app_ai_chat(
    state: State<'_, AppState>,
    request: ExternalAppAiChatRequest,
) -> Result<ExternalAppAiChatResponse, String> {
    check_ai_granted(&request.app_id)?;

    let model_id = request.model.as_deref().unwrap_or("primary").to_string();
    let client = state
        .ai_client_factory
        .get_client_resolved(&model_id)
        .await
        .map_err(|e| format!("Failed to get AI client: {}", e))?;

    let mut messages = Vec::new();
    if let Some(sp) = request.system_prompt.as_deref() {
        if !sp.is_empty() {
            messages.push(AIMessage::system(sp.to_string()));
        }
    }
    for m in request.messages {
        let role = m.role.to_lowercase();
        let msg = match role.as_str() {
            "system" => AIMessage::system(m.content),
            "assistant" => AIMessage::assistant(m.content),
            _ => AIMessage::user(m.content),
        };
        messages.push(msg);
    }

    let stream_response = client
        .send_message_stream(messages, None)
        .await
        .map_err(|e| format!("AI request failed: {}", e))?;

    let mut stream = stream_response.stream;
    let mut full_text = String::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                if let Some(text) = chunk.text {
                    full_text.push_str(&text);
                }
            }
            Err(e) => {
                return Err(format!("AI stream error: {}", e));
            }
        }
    }

    Ok(ExternalAppAiChatResponse {
        text: full_text.trim().to_string(),
    })
}

#[tauri::command]
pub fn external_app_ai_cancel(_request: ExternalAppAiCancelRequest) -> Result<(), String> {
    // Simplified: full cancellation requires a shared stream registry.
    Ok(())
}

#[tauri::command]
pub async fn external_app_ai_list_models(
    state: State<'_, AppState>,
    request: ExternalAppAiListModelsRequest,
) -> Result<Vec<ExternalAppAiModelInfo>, String> {
    check_ai_granted(&request.app_id)?;

    let global_config = state
        .config_service
        .get_config::<bitfun_core::service::config::types::GlobalConfig>(None)
        .await
        .map_err(|e| e.to_string())?;

    let models: Vec<ExternalAppAiModelInfo> = global_config
        .ai
        .models
        .into_iter()
        .filter(|m| m.enabled)
        .map(|m| ExternalAppAiModelInfo {
            id: m.id.clone(),
            name: if m.name.trim().is_empty() {
                if m.model_name.trim().is_empty() {
                    m.id.clone()
                } else {
                    m.model_name.clone()
                }
            } else {
                m.name.clone()
            },
            provider: m.provider.clone(),
            model_name: m.model_name.clone(),
            base_url: m.base_url.clone(),
            request_url: m.request_url.clone(),
            context_window: m.context_window,
            max_tokens: m.max_tokens,
            temperature: m.temperature,
            top_p: m.top_p,
            enabled: m.enabled,
            category: m.category.clone(),
            capabilities: m.capabilities.clone(),
            recommended_for: m.recommended_for.clone(),
            metadata: m.metadata.clone(),
            reasoning_mode: m.reasoning_mode.clone(),
            inline_think_in_text: m.inline_think_in_text,
            custom_headers: m.custom_headers.clone(),
            custom_headers_mode: m.custom_headers_mode.clone(),
            skip_ssl_verify: m.skip_ssl_verify,
            reasoning_effort: m.reasoning_effort.clone(),
            thinking_budget_tokens: m.thinking_budget_tokens,
            custom_request_body: m.custom_request_body.clone(),
            custom_request_body_mode: m.custom_request_body_mode.clone(),
            auth: m.auth.clone(),
        })
        .collect();

    Ok(models)
}

// ─── External app tool registration helpers ─────────────────────────────────

fn build_external_app_tools(
    app_id: &str,
    app_name: &str,
    commands: &[ManifestCommand],
) -> Vec<Arc<dyn bitfun_core::agentic::tools::framework::Tool>> {
    use bitfun_core::agentic::tools::implementations::ExternalAppCommandTool;
    commands
        .iter()
        .map(|cmd| {
            Arc::new(ExternalAppCommandTool::new(
                app_id.to_string(),
                app_name.to_string(),
                cmd.name.clone(),
                cmd.description.clone().unwrap_or_else(|| format!("Execute '{}' on {}", cmd.name, app_name)),
                cmd.parameters.clone(),
            )) as Arc<dyn bitfun_core::agentic::tools::framework::Tool>
        })
        .collect()
}

/// Register external app tools on startup (call once after app initialization).
#[tauri::command]
pub async fn register_external_app_tools_on_startup() -> Result<(), String> {
    let apps = ExternalAppService::list_apps().map_err(|e| e.to_string())?;
    log::info!(
        "register_external_app_tools_on_startup: found {} external apps in store",
        apps.len()
    );
    let registry = bitfun_core::agentic::tools::registry::get_global_tool_registry();
    let mut registry_lock = registry.write().await;

    for app in &apps {
        log::info!(
            "register_external_app_tools_on_startup: app_id={}, name={}, commands_count={}",
            app.id,
            app.name,
            app.commands.len()
        );
        if !app.commands.is_empty() {
            let tools = build_external_app_tools(&app.id, &app.name, &app.commands);
            registry_lock.register_external_app_tools(&app.id, tools);
        }
    }

    let all_names = registry_lock.get_tool_names();
    let external_app_tools: Vec<&String> = all_names.iter().filter(|n| n.starts_with("external_app__")).collect();
    log::info!(
        "register_external_app_tools_on_startup: total tools={}, external_app_tools={:?}",
        all_names.len(),
        external_app_tools
    );

    Ok(())
}

// ─── Tool call polling / submission for frontend iframe bridge ──────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollExternalAppToolCallResponse {
    pub call_id: String,
    pub command: String,
    pub params: serde_json::Value,
}

#[tauri::command]
pub fn poll_external_app_tool_call(app_id: String) -> Result<Option<PollExternalAppToolCallResponse>, String> {
    let queue = bitfun_core::service::external_app::tool_call_queue::get_external_app_tool_call_queue();
    match queue.poll_for_app(&app_id) {
        Some(req) => Ok(Some(PollExternalAppToolCallResponse {
            call_id: req.call_id,
            command: req.command,
            params: req.params,
        })),
        None => Ok(None),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitExternalAppToolResultPayload {
    pub call_id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub fn submit_external_app_tool_result(payload: SubmitExternalAppToolResultPayload) -> Result<(), String> {
    let queue = bitfun_core::service::external_app::tool_call_queue::get_external_app_tool_call_queue();
    queue.submit_result(
        &payload.call_id,
        bitfun_core::service::external_app::tool_call_queue::ToolCallResult {
            success: payload.success,
            data: payload.data,
            error: payload.error,
        },
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct SendExternalAppNotificationRequest {
    pub app_id: String,
    pub title: String,
    pub body: Option<String>,
}

/// Send an OS-level desktop notification on behalf of an external app.
#[tauri::command]
pub async fn send_external_app_notification(
    app: tauri::AppHandle,
    request: SendExternalAppNotificationRequest,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    let mut builder = app.notification().builder().title(&request.title);
    if let Some(body) = &request.body {
        builder = builder.body(body);
    }
    builder.show().map_err(|e| e.to_string())
}
