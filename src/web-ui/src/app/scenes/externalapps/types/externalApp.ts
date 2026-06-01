export interface ExternalAppMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  business_domains: string[];
  created_at: number;
  updated_at: number;
}

export interface ManifestCapabilityItem {
  enabled: boolean;
  allowedModels?: string[];
  description?: string;
}

export interface ManifestCapabilitySet {
  ai?: ManifestCapabilityItem;
  storage?: ManifestCapabilityItem;
  dialog?: ManifestCapabilityItem;
  clipboard?: ManifestCapabilityItem;
}

export interface ManifestCommand {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ManifestCapabilities {
  version: string;
  capabilities: ManifestCapabilitySet;
  commands: ManifestCommand[];
  stateSchema?: Record<string, unknown>;
  businessDomains?: string[];
}

export interface CreateExternalAppRequest {
  name: string;
  url: string;
  icon?: string;
  description?: string;
}

export interface UpdateExternalAppRequest {
  name?: string;
  url?: string;
  icon?: string;
  description?: string;
}

export interface ExternalAppStateCacheEntry {
  state: Record<string, unknown>;
  timestamp: number;
}
