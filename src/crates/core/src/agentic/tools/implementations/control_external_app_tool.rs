//! Control External App Tool — built-in tool for controlling external app lifecycle.

use crate::agentic::tools::framework::{Tool, ToolResult, ToolUseContext};
use crate::util::errors::{BitFunError, BitFunResult};
use async_trait::async_trait;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub struct ControlExternalAppTool;

impl ControlExternalAppTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ControlExternalAppTool {
    fn default() -> Self {
        Self::new()
    }
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
    Close,
    ExecuteCommand { command: String, params: Option<Value> },
    QueryState,
}

#[async_trait]
impl Tool for ControlExternalAppTool {
    fn name(&self) -> &str {
        "ControlExternalApp"
    }

    async fn description(&self) -> BitFunResult<String> {
        Ok(r#"Control an external application in BitFun.
Actions:
- open: open the external app in a dedicated window/tab
- close: close the external app's window/tab
- execute_command: execute a command on the external app with parameters
- query_state: query the current runtime state of the external app"#
            .to_string())
    }

    fn short_description(&self) -> String {
        "Control an external application (open, close, execute command, query state).".to_string()
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "object",
                    "oneOf": [
                        { "type": "object", "properties": { "type": { "type": "string", "const": "open" } }, "required": ["type"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "close" } }, "required": ["type"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "execute_command" }, "command": { "type": "string" }, "params": { "type": "object" } }, "required": ["type", "command"] },
                        { "type": "object", "properties": { "type": { "type": "string", "const": "query_state" } }, "required": ["type"] }
                    ]
                },
                "app_id": { "type": "string" }
            },
            "required": ["action", "app_id"]
        })
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> BitFunResult<Vec<ToolResult>> {
        let request: ControlExternalAppRequest = serde_json::from_value(input.clone())
            .map_err(|e| BitFunError::Tool(format!("invalid request: {}", e)))?;

        let host = context.external_app_host.as_ref().ok_or_else(|| {
            BitFunError::Tool("External app host not available. This feature is only available in BitFun Desktop.".to_string())
        })?;

        info!(
            "ControlExternalApp action={:?} app_id={}",
            request.action, request.app_id
        );

        let result = match request.action {
            ControlAction::Open => {
                debug!("Opening external app: {}", request.app_id);
                host.open_app(&request.app_id).await?
            }
            ControlAction::Close => {
                debug!("Closing external app: {}", request.app_id);
                host.close_app(&request.app_id).await?
            }
            ControlAction::ExecuteCommand { command, params } => {
                debug!(
                    "Executing command on external app: app_id={}, command={}",
                    request.app_id, command
                );
                host.execute_command(&request.app_id, &command, params.unwrap_or_default())
                    .await?
            }
            ControlAction::QueryState => {
                debug!("Querying state of external app: {}", request.app_id);
                host.query_app_state(&request.app_id).await?
            }
        };

        Ok(vec![ToolResult::ok(result, None)])
    }

    fn needs_permissions(&self, _input: Option<&Value>) -> bool {
        true
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
        let schema = tool.input_schema();
        assert!(schema.get("properties").is_some());
        assert!(schema.get("required").is_some());
    }

    #[test]
    fn control_action_deserialization() {
        let json = json!({"type": "open"});
        let action: ControlAction = serde_json::from_value(json).unwrap();
        assert!(matches!(action, ControlAction::Open));

        let json = json!({"type": "execute_command", "command": "setFilter", "params": {"filter": "today"}});
        let action: ControlAction = serde_json::from_value(json).unwrap();
        assert!(matches!(action, ControlAction::ExecuteCommand { .. }));
    }
}
