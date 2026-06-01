import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';
import type {
  ExternalAppMeta,
  CreateExternalAppRequest,
  UpdateExternalAppRequest,
} from '@/app/scenes/externalapps/types/externalApp';

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
      return await api.invoke('create_external_app', { request: req });
    } catch (error) {
      throw createTauriCommandError('create_external_app', error);
    }
  }

  async updateExternalApp(appId: string, req: UpdateExternalAppRequest): Promise<ExternalAppMeta> {
    try {
      return await api.invoke('update_external_app', { appId, request: req });
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
}

export const externalAppAPI = new ExternalAppAPI();
