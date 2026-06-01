use crate::util::errors::{BitFunError, BitFunResult};
use super::models::ManifestCapabilities;

const MANIFEST_PATH: &str = "/.well-known/bitfun.manifest.json";

pub async fn fetch_manifest(app_url: &str) -> BitFunResult<ManifestCapabilities> {
    let base = app_url.trim_end_matches('/');
    let manifest_url = format!("{}{}", base, MANIFEST_PATH);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| BitFunError::Service(format!("http client build failed: {}", e)))?;
    let resp = client.get(&manifest_url).send().await.map_err(|e| {
        BitFunError::Service(format!("fetch manifest failed: {}", e))
    })?;
    if !resp.status().is_success() {
        return Err(BitFunError::Service(format!(
            "manifest returned status {}", resp.status()
        )));
    }
    let text = resp.text().await.map_err(|e| {
        BitFunError::Service(format!("read manifest body failed: {}", e))
    })?;
    let manifest: ManifestCapabilities = serde_json::from_str(&text).map_err(|e| {
        BitFunError::Service(format!("parse manifest failed: {}", e))
    })?;
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manifest_path_constant() {
        assert_eq!(MANIFEST_PATH, "/.well-known/bitfun.manifest.json");
    }
}
