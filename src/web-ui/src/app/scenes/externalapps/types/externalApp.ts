export interface ExternalAppMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  version: string;
  business_domains: string[];
  created_at: number;
  updated_at: number;
}

export interface ManifestCapabilityItem {
  enabled: boolean;
  required?: boolean;
  allowedModels?: string[];
  description?: string;
}

export interface ManifestCapabilitySet {
  ai?: ManifestCapabilityItem;
  storage?: ManifestCapabilityItem;
  dialog?: ManifestCapabilityItem;
  clipboard?: ManifestCapabilityItem;
  network?: ManifestCapabilityItem;
  notification?: ManifestCapabilityItem;
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
  name?: string;
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

export interface AiCompleteOptions {
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatOptions {
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}
