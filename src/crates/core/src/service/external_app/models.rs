use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExternalAppMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub url: String,
    pub business_domains: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExternalAppPermissions {
    pub ai: ExternalAppAiPermission,
    pub storage: ExternalAppStoragePermission,
    pub dialog: bool,
    pub clipboard: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExternalAppAiPermission {
    pub enabled: bool,
    pub allowed_models: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExternalAppStoragePermission {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManifestCapabilities {
    pub version: String,
    pub capabilities: ManifestCapabilitySet,
    pub commands: Vec<ManifestCommand>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_schema: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub business_domains: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManifestCapabilitySet {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai: Option<ManifestCapabilityItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub storage: Option<ManifestCapabilityItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dialog: Option<ManifestCapabilityItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clipboard: Option<ManifestCapabilityItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManifestCapabilityItem {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_models: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManifestCommand {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_app_meta_serde_roundtrip() {
        let meta = ExternalAppMeta {
            id: "app-1".to_string(),
            name: "Test App".to_string(),
            description: "A test app".to_string(),
            icon: "globe".to_string(),
            url: "https://example.com".to_string(),
            business_domains: vec!["https://api.example.com".to_string()],
            created_at: 1717200000,
            updated_at: 1717200000,
        };
        let json = serde_json::to_string(&meta).unwrap();
        let restored: ExternalAppMeta = serde_json::from_str(&json).unwrap();
        assert_eq!(meta, restored);
    }

    #[test]
    fn manifest_capabilities_parse() {
        let json = r#"{
            "version": "1.0.0",
            "capabilities": {
                "ai": { "enabled": true, "allowedModels": ["gpt-4"] },
                "storage": { "enabled": true }
            },
            "commands": [{"name": "setFilter", "description": "Set filter"}]
        }"#;
        let manifest: ManifestCapabilities = serde_json::from_str(json).unwrap();
        assert_eq!(manifest.version, "1.0.0");
        assert!(manifest.capabilities.ai.as_ref().unwrap().enabled);
    }
}
