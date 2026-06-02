//! Host abstraction for external app window lifecycle (implemented in `bitfun-desktop`).

use crate::util::errors::BitFunResult;
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;

/// Platform-agnostic host for external app window lifecycle and command execution.
/// Implemented by `bitfun-desktop`; server/cli may provide a no-op or error impl.
#[async_trait]
pub trait ExternalAppHost: std::fmt::Debug + Send + Sync {
    /// Open an external app in a dedicated window/tab.
    async fn open_app(&self, app_id: &str) -> BitFunResult<Value>;

    /// Close the external app's window/tab.
    async fn close_app(&self, app_id: &str) -> BitFunResult<Value>;

    /// Query the current runtime state of an external app.
    async fn query_app_state(&self, app_id: &str) -> BitFunResult<Value>;

    /// Execute a command on an external app.
    /// Desktop implementation internally uses `tool_call_queue` for iframe communication.
    async fn execute_command(
        &self,
        app_id: &str,
        command: &str,
        params: Value,
    ) -> BitFunResult<Value>;
}

/// Type alias for `Arc<dyn ExternalAppHost>`, stored in `ToolUseContext`.
pub type ExternalAppHostRef = Arc<dyn ExternalAppHost>;
