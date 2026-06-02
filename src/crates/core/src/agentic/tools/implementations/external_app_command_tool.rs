//! External App Command Tool — dynamically registered tool for each external app command.

use crate::agentic::tools::framework::{
    DynamicToolInfo, Tool, ToolRenderOptions, ToolResult, ToolUseContext, ValidationResult,
};
use crate::service::external_app::tool_call_queue::get_external_app_tool_call_queue;
use crate::util::errors::{BitFunError, BitFunResult};
use async_trait::async_trait;
use log::{debug, error, info, warn};
use serde_json::{json, Value};

/// Tool that invokes a command on an external app running in a frontend iframe.
pub struct ExternalAppCommandTool {
    app_id: String,
    app_name: String,
    command_name: String,
    command_description: String,
    parameters_schema: Value,
}

impl ExternalAppCommandTool {
    pub fn new(
        app_id: String,
        app_name: String,
        command_name: String,
        command_description: String,
        parameters_schema: Option<Value>,
    ) -> Self {
        let schema = parameters_schema.unwrap_or_else(|| json!({ "type": "object" }));
        Self {
            app_id,
            app_name,
            command_name,
            command_description,
            parameters_schema: schema,
        }
    }

    /// Build the full tool name used in the registry.
    pub fn build_tool_name(app_id: &str, command_name: &str) -> String {
        format!("external_app__{}__{}", app_id, command_name)
    }
}

#[async_trait]
impl Tool for ExternalAppCommandTool {
    fn name(&self) -> &str {
        // Stored name is recomputed on each call; this is fine for short strings.
        // In practice the caller should use build_tool_name to match.
        Box::leak(Self::build_tool_name(&self.app_id, &self.command_name).into_boxed_str())
    }

    async fn description(&self) -> BitFunResult<String> {
        Ok(self.command_description.clone())
    }

    fn short_description(&self) -> String {
        format!(
            "{} (via {})",
            self.command_description, self.app_name
        )
    }

    fn input_schema(&self) -> Value {
        self.parameters_schema.clone()
    }

    fn dynamic_provider_id(&self) -> Option<&str> {
        Some(&self.app_id)
    }

    fn dynamic_tool_info(&self) -> Option<DynamicToolInfo> {
        Some(DynamicToolInfo {
            provider_id: self.app_id.clone(),
            provider_kind: Some("external_app".to_string()),
            mcp: None,
        })
    }

    async fn is_enabled(&self) -> bool {
        true
    }

    fn is_readonly(&self) -> bool {
        false
    }

    fn is_concurrency_safe(&self, _input: Option<&Value>) -> bool {
        false
    }

    fn needs_permissions(&self, _input: Option<&Value>) -> bool {
        true
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        if !input.is_object() {
            return ValidationResult {
                result: false,
                message: Some("Input must be an object".to_string()),
                error_code: Some(400),
                meta: None,
            };
        }
        ValidationResult {
            result: true,
            message: None,
            error_code: None,
            meta: None,
        }
    }

    fn render_result_for_assistant(&self, output: &Value) -> String {
        format!(
            "External app command '{}' completed. Result: {}",
            self.command_name,
            serde_json::to_string_pretty(output).unwrap_or_else(|_| "(invalid json)".to_string())
        )
    }

    fn render_tool_use_message(&self, input: &Value, _options: &ToolRenderOptions) -> String {
        format!(
            "Using external app '{}' command '{}' with input: {}",
            self.app_name, self.command_name, input
        )
    }

    fn render_tool_use_rejected_message(&self) -> String {
        format!(
            "External app command '{}' from '{}' was rejected by user",
            self.command_name, self.app_name
        )
    }

    fn render_tool_result_message(&self, output: &Value) -> String {
        self.render_result_for_assistant(output)
    }

    async fn call_impl(
        &self,
        input: &Value,
        _context: &ToolUseContext,
    ) -> BitFunResult<Vec<ToolResult>> {
        info!(
            "Calling external app command: app={}, command={}",
            self.app_id, self.command_name
        );
        debug!("Input: {}", serde_json::to_string_pretty(input).unwrap_or_else(|_| "invalid json".to_string()));

        let queue = get_external_app_tool_call_queue();
        let (call_id, rx) = queue.enqueue(
            self.app_id.clone(),
            self.command_name.clone(),
            input.clone(),
        );

        debug!("Enqueued external app tool call: call_id={}", call_id);

        // Wait for frontend to execute and return result (30s timeout).
        let timeout = tokio::time::Duration::from_secs(30);
        let result = match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => {
                warn!("External app tool call channel closed: call_id={}", call_id);
                return Err(BitFunError::Tool(format!(
                    "External app '{}' command '{}' channel closed",
                    self.app_id, self.command_name
                )));
            }
            Err(_) => {
                warn!(
                    "External app tool call timed out after {}s: call_id={}",
                    timeout.as_secs(),
                    call_id
                );
                let _ = queue.cancel(&call_id);
                return Err(BitFunError::Tool(format!(
                    "External app '{}' command '{}' timed out after {} seconds. The app may not be running or did not respond.",
                    self.app_id, self.command_name, timeout.as_secs()
                )));
            }
        };

        if result.success {
            let data = result.data.unwrap_or_else(|| json!({ "success": true }));
            let assistant_text = self.render_result_for_assistant(&data);
            Ok(vec![ToolResult::Result {
                data,
                result_for_assistant: Some(assistant_text),
                image_attachments: None,
            }])
        } else {
            let err_msg = result
                .error
                .unwrap_or_else(|| "Unknown external app error".to_string());
            error!(
                "External app command failed: app={}, command={}, error={}",
                self.app_id, self.command_name, err_msg
            );
            Err(BitFunError::Tool(format!(
                "External app '{}' command '{}' failed: {}",
                self.app_id, self.command_name, err_msg
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_name_format() {
        assert_eq!(
            ExternalAppCommandTool::build_tool_name("my-app", "doSomething"),
            "external_app__my-app__doSomething"
        );
    }

    #[test]
    fn default_parameters_schema() {
        let tool = ExternalAppCommandTool::new(
            "app-1".to_string(),
            "Test App".to_string(),
            "test".to_string(),
            "Test command".to_string(),
            None,
        );
        let schema = tool.input_schema();
        assert_eq!(schema.get("type").unwrap(), "object");
    }
}
