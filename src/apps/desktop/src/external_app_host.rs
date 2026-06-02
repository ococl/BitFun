//! Desktop implementation of `ExternalAppHost` for `bitfun-desktop`.

use bitfun_core::agentic::tools::external_app_host::ExternalAppHost;
use bitfun_core::service::external_app::{
    commands::ExternalAppService,
    tool_call_queue::get_external_app_tool_call_queue,
};
use bitfun_core::util::errors::{BitFunError, BitFunResult};
use async_trait::async_trait;
use log::{debug, error, info, warn};
use serde_json::{json, Value};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};

const EXTERNAL_APP_WINDOW_PREFIX: &str = "external-app-";

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// Set the global app handle (called once during Tauri setup).
pub fn set_app_handle(handle: AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

fn get_app_handle() -> BitFunResult<AppHandle> {
    APP_HANDLE
        .get()
        .cloned()
        .ok_or_else(|| BitFunError::Tool("App handle not initialized".to_string()))
}

pub struct DesktopExternalAppHost;

impl DesktopExternalAppHost {
    pub fn new() -> Self {
        Self
    }

    fn window_label(app_id: &str) -> String {
        format!("{}{}", EXTERNAL_APP_WINDOW_PREFIX, app_id)
    }
}

impl std::fmt::Debug for DesktopExternalAppHost {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DesktopExternalAppHost")
            .finish_non_exhaustive()
    }
}

#[async_trait]
impl ExternalAppHost for DesktopExternalAppHost {
    async fn open_app(&self, app_id: &str) -> BitFunResult<Value> {
        let app = ExternalAppService::get_app(app_id)?;
        let label = Self::window_label(app_id);
        let app_handle = get_app_handle()?;

        // Check if window already exists
        if let Some(win) = app_handle.get_webview_window(&label) {
            debug!("External app window already exists, focusing: {}", label);
            win.set_focus().map_err(|e| {
                BitFunError::Tool(format!("Failed to focus external app window: {}", e))
            })?;
            return Ok(json!({
                "success": true,
                "window_label": label,
                "already_open": true,
            }));
        }

        info!("Creating external app window: label={}, url={}", label, app.url);

        let wrapper_url = format!(
            "external-app-window.html?appId={}&url={}&theme=dark&locale=en",
            urlencoding::encode(app_id),
            urlencoding::encode(&app.url)
        );

        let _win = tauri::WebviewWindowBuilder::new(
            &app_handle,
            &label,
            tauri::WebviewUrl::App(wrapper_url.into()),
        )
        .title(&app.name)
        .inner_size(1200.0, 800.0)
        .center()
        .resizable(true)
        .visible(true)
        .build()
        .map_err(|e| {
            BitFunError::Tool(format!("Failed to create external app window: {}", e))
        })?;

        debug!("External app window created: label={}", label);

        Ok(json!({
            "success": true,
            "window_label": label,
            "already_open": false,
        }))
    }

    async fn close_app(&self, app_id: &str) -> BitFunResult<Value> {
        let label = Self::window_label(app_id);
        let app_handle = get_app_handle()?;

        if let Some(win) = app_handle.get_webview_window(&label) {
            win.close().map_err(|e| {
                BitFunError::Tool(format!("Failed to close external app window: {}", e))
            })?;
            info!("Closed external app window: {}", label);
            Ok(json!({ "success": true, "closed": true }))
        } else {
            warn!("External app window not found (already closed?): {}", label);
            Ok(json!({ "success": true, "closed": false, "reason": "window not found" }))
        }
    }

    async fn query_app_state(&self, app_id: &str) -> BitFunResult<Value> {
        let label = Self::window_label(app_id);
        let app_handle = get_app_handle()?;
        let is_open = app_handle.get_webview_window(&label).is_some();

        Ok(json!({
            "is_open": is_open,
            "window_label": label,
        }))
    }

    async fn execute_command(
        &self,
        app_id: &str,
        command: &str,
        params: Value,
    ) -> BitFunResult<Value> {
        // Verify app exists before enqueuing
        let _app = ExternalAppService::get_app(app_id)?;

        let queue = get_external_app_tool_call_queue();
        let (call_id, rx) = queue.enqueue(app_id.to_string(), command.to_string(), params.clone());

        debug!(
            "Enqueued external app command: call_id={}, app_id={}, command={}",
            call_id, app_id, command
        );

        // Push event to the external app window so it can execute immediately
        // (no polling needed). Fallback: window will poll once on load if it misses the event.
        let app_handle = get_app_handle()?;
        let label = Self::window_label(app_id);
        if let Err(e) = app_handle.emit_to(
            &label,
            "bitfun:external-app-command",
            json!({
                "callId": call_id,
                "command": command,
                "params": params,
            }),
        ) {
            warn!(
                "Failed to emit external app command to window {}: {}. Command will rely on polling fallback.",
                label, e
            );
        } else {
            debug!("Pushed external app command event to window: label={}", label);
        }

        // Wait for frontend to execute and return result (30s timeout)
        let timeout = tokio::time::Duration::from_secs(30);
        let result = match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => {
                warn!("External app command channel closed: call_id={}", call_id);
                return Err(BitFunError::Tool(format!(
                    "External app '{}' command '{}' channel closed",
                    app_id, command
                )));
            }
            Err(_) => {
                warn!(
                    "External app command timed out after {}s: call_id={}",
                    timeout.as_secs(),
                    call_id
                );
                let _ = queue.cancel(&call_id);
                return Err(BitFunError::Tool(format!(
                    "External app '{}' command '{}' timed out after {} seconds. The app may not be running or did not respond.",
                    app_id, command, timeout.as_secs()
                )));
            }
        };

        if result.success {
            let data = result.data.unwrap_or_else(|| json!({ "success": true }));
            Ok(data)
        } else {
            let err_msg = result
                .error
                .unwrap_or_else(|| "Unknown external app error".to_string());
            error!(
                "External app command failed: app={}, command={}, error={}",
                app_id, command, err_msg
            );
            Err(BitFunError::Tool(format!(
                "External app '{}' command '{}' failed: {}",
                app_id, command, err_msg
            )))
        }
    }
}
