import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';
import type {
  ExternalAppMeta,
  CreateExternalAppRequest,
  UpdateExternalAppRequest,
  AiCompleteOptions,
  AiChatMessage,
  AiChatOptions,
} from '@/app/scenes/externalapps/types/externalApp';
import type { AIModelConfig } from '@/infrastructure/config/types';

export class ExternalAppAPI {
  async listExternalApps(): Promise<ExternalAppMeta[]> {
    try {
      return await api.invoke('list_external_apps', {});
    } catch (error) {
      throw createTauriCommandError('list_external_apps', error);
    }
  }

  async getExternalApp(appId: string): Promise<ExternalAppMeta> {
    try {
      return await api.invoke('get_external_app', { appId });
    } catch (error) {
      throw createTauriCommandError('get_external_app', error, { appId });
    }
  }

  async createExternalApp(req: CreateExternalAppRequest): Promise<ExternalAppMeta> {
    try {
      return await api.invoke('create_external_app', { payload: req });
    } catch (error) {
      throw createTauriCommandError('create_external_app', error);
    }
  }

  async updateExternalApp(appId: string, req: UpdateExternalAppRequest): Promise<ExternalAppMeta> {
    try {
      return await api.invoke('update_external_app', { appId, payload: req });
    } catch (error) {
      throw createTauriCommandError('update_external_app', error, { appId });
    }
  }

  async deleteExternalApp(appId: string): Promise<void> {
    try {
      await api.invoke('delete_external_app', { appId });
    } catch (error) {
      throw createTauriCommandError('delete_external_app', error, { appId });
    }
  }

  async getStorage(appId: string, key: string): Promise<unknown> {
    try {
      return await api.invoke('get_external_app_storage', { appId, key });
    } catch (error) {
      throw createTauriCommandError('get_external_app_storage', error, { appId, key });
    }
  }

  async setStorage(appId: string, key: string, value: unknown): Promise<void> {
    try {
      await api.invoke('set_external_app_storage', { appId, key, value });
    } catch (error) {
      throw createTauriCommandError('set_external_app_storage', error, { appId, key });
    }
  }

  async clearStorage(appId: string): Promise<void> {
    try {
      await api.invoke('clear_external_app_storage_cmd', { appId });
    } catch (error) {
      throw createTauriCommandError('clear_external_app_storage_cmd', error, { appId });
    }
  }

  async getGrants(appId: string): Promise<string[]> {
    try {
      return await api.invoke('get_external_app_grants', { appId });
    } catch (error) {
      throw createTauriCommandError('get_external_app_grants', error, { appId });
    }
  }

  async setGrants(appId: string, grants: string[]): Promise<void> {
    try {
      await api.invoke('set_external_app_grants', { appId, grants });
    } catch (error) {
      throw createTauriCommandError('set_external_app_grants', error, { appId });
    }
  }

  // ─── AI commands ────────────────────────────────────────────────────────────

  async aiComplete(appId: string, prompt: string, options?: AiCompleteOptions): Promise<{ text: string }> {
    try {
      return await api.invoke('external_app_ai_complete', {
        request: { appId, prompt, systemPrompt: options?.systemPrompt, model: options?.model, maxTokens: options?.maxTokens, temperature: options?.temperature },
      });
    } catch (error) {
      throw createTauriCommandError('external_app_ai_complete', error, { appId });
    }
  }

  async aiChat(appId: string, messages: AiChatMessage[], streamId: string, options?: AiChatOptions): Promise<{ text: string }> {
    try {
      return await api.invoke('external_app_ai_chat', {
        request: { appId, messages, streamId, systemPrompt: options?.systemPrompt, model: options?.model, maxTokens: options?.maxTokens, temperature: options?.temperature },
      });
    } catch (error) {
      throw createTauriCommandError('external_app_ai_chat', error, { appId, streamId });
    }
  }

  async aiCancel(appId: string, streamId: string): Promise<void> {
    try {
      await api.invoke('external_app_ai_cancel', { request: { appId, streamId } });
    } catch (error) {
      throw createTauriCommandError('external_app_ai_cancel', error, { appId, streamId });
    }
  }

  async aiListModels(appId: string): Promise<Omit<AIModelConfig, 'api_key'>[]> {
    try {
      return await api.invoke('external_app_ai_list_models', { request: { appId } });
    } catch (error) {
      throw createTauriCommandError('external_app_ai_list_models', error, { appId });
    }
  }

  // ─── Tool call polling / submission ─────────────────────────────────────────

  async pollToolCall(appId: string): Promise<{ callId: string; command: string; params: unknown } | null> {
    try {
      return await api.invoke('poll_external_app_tool_call', { appId });
    } catch (error) {
      throw createTauriCommandError('poll_external_app_tool_call', error, { appId });
    }
  }

  async submitToolResult(callId: string, success: boolean, data?: unknown, error?: string): Promise<void> {
    try {
      await api.invoke('submit_external_app_tool_result', {
        payload: { callId, success, data, error },
      });
    } catch (err) {
      throw createTauriCommandError('submit_external_app_tool_result', err, { callId });
    }
  }
}

export const externalAppAPI = new ExternalAppAPI();
