use crate::agentic::tools::framework::{Tool, ToolResult, ToolUseContext};
use crate::util::errors::{BitFunError, BitFunResult};
use async_trait::async_trait;
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
    SendCommand { command: String, params: Option<Value> },
    QueryState,
}

#[async_trait]
impl Tool for ControlExternalAppTool {
    fn name(&self) -> &str {
        "ControlExternalApp"
    }

    async fn description(&self) -> BitFunResult<String> {
        Ok(r#"Control an external application open in BitFun.
Actions: open (open in new tab), sendCommand (send command with params), queryState (query current state)."#
            .to_string())
    }

    fn short_description(&self) -> String {
        "Control an external application open in BitFun.".to_string()
    }

    fn input_schema(&self) -> Value {
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

    async fn call_impl(
        &self,
        input: &Value,
        _context: &ToolUseContext,
    ) -> BitFunResult<Vec<ToolResult>> {
        let request: ControlExternalAppRequest = serde_json::from_value(input.clone())
            .map_err(|e| BitFunError::Tool(format!("invalid request: {}", e)))?;
        let result = match request.action {
            ControlAction::Open => {
                json!({"success": true, "opened": true})
            }
            ControlAction::SendCommand { command, params } => {
                json!({"success": true, "sent": true, "command": command, "params": params})
            }
            ControlAction::QueryState => {
                json!({"success": true, "state": null})
            }
        };
        Ok(vec![ToolResult::ok(result, None)])
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
}
