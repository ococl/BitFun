//! External app tool call queue — bridges Rust tool execution to frontend iframe.

use crate::util::errors::{BitFunError, BitFunResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

/// A pending tool call waiting for the frontend to execute it in an iframe.
pub struct PendingToolCall {
    pub app_id: String,
    pub command: String,
    pub params: Value,
    pub result_sender: oneshot::Sender<ToolCallResult>,
}

/// Result returned from the frontend after executing a tool call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Global queue for pending external app tool calls.
#[derive(Default)]
pub struct ExternalAppToolCallQueue {
    calls: Mutex<HashMap<String, PendingToolCall>>,
}

impl ExternalAppToolCallQueue {
    pub fn new() -> Self {
        Self {
            calls: Mutex::new(HashMap::new()),
        }
    }

    /// Enqueue a new tool call and return the call id.
    pub fn enqueue(
        &self,
        app_id: String,
        command: String,
        params: Value,
    ) -> (String, oneshot::Receiver<ToolCallResult>) {
        let call_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        let pending = PendingToolCall {
            app_id,
            command,
            params,
            result_sender: tx,
        };
        self.calls.lock().unwrap().insert(call_id.clone(), pending);
        (call_id, rx)
    }

    /// Poll a pending tool call for a specific app (frontend uses this).
    pub fn poll_for_app(&self, app_id: &str) -> Option<ToolCallRequest> {
        let calls = self.calls.lock().unwrap();
        for (call_id, pending) in calls.iter() {
            if pending.app_id == app_id {
                return Some(ToolCallRequest {
                    call_id: call_id.clone(),
                    app_id: pending.app_id.clone(),
                    command: pending.command.clone(),
                    params: pending.params.clone(),
                });
            }
        }
        None
    }

    /// Submit the result for a tool call.
    pub fn submit_result(&self, call_id: &str, result: ToolCallResult) -> BitFunResult<()> {
        let mut calls = self.calls.lock().unwrap();
        let pending = calls
            .remove(call_id)
            .ok_or_else(|| BitFunError::Service(format!("tool call not found: {}", call_id)))?;
        let _ = pending.result_sender.send(result);
        Ok(())
    }

    /// Cancel a pending tool call (e.g. timeout or app closed).
    pub fn cancel(&self, call_id: &str) -> BitFunResult<()> {
        let mut calls = self.calls.lock().unwrap();
        let pending = calls
            .remove(call_id)
            .ok_or_else(|| BitFunError::Service(format!("tool call not found: {}", call_id)))?;
        let _ = pending.result_sender.send(ToolCallResult {
            success: false,
            data: None,
            error: Some("Tool call cancelled".to_string()),
        });
        Ok(())
    }
}

/// Request sent to the frontend to execute a tool call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub call_id: String,
    pub app_id: String,
    pub command: String,
    pub params: Value,
}

use std::sync::OnceLock;

static GLOBAL_TOOL_CALL_QUEUE: OnceLock<Arc<ExternalAppToolCallQueue>> = OnceLock::new();

pub fn get_external_app_tool_call_queue() -> Arc<ExternalAppToolCallQueue> {
    GLOBAL_TOOL_CALL_QUEUE
        .get_or_init(|| Arc::new(ExternalAppToolCallQueue::new()))
        .clone()
}
