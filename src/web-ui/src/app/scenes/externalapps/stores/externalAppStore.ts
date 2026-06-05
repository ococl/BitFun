import { create } from 'zustand';
import { externalAppAPI } from '@/infrastructure/api/service-api/ExternalAppAPI';
import type {
  ExternalAppMeta,
  ManifestCapabilities,
  CreateExternalAppRequest,
} from '../types/externalApp';

interface ExternalAppStore {
  apps: ExternalAppMeta[];
  loading: boolean;
  error: string | null;
  grants: Map<string, Set<string>>;
  manifests: Map<string, ManifestCapabilities>;
  stateCache: Map<string, { state: Record<string, unknown>; timestamp: number }>;

  loadApps: () => Promise<void>;
  addApp: (req: CreateExternalAppRequest) => Promise<void>;
  removeApp: (appId: string) => Promise<void>;
  fetchManifest: (appId: string, url: string) => Promise<ManifestCapabilities | null>;
  setGrants: (appId: string, grants: string[]) => Promise<void>;
  revokeGrant: (appId: string, capability: string) => Promise<void>;
  clearAllData: (appId: string) => Promise<void>;
  cacheState: (appId: string, state: Record<string, unknown>) => void;
  getCachedState: (appId: string) => Record<string, unknown> | null;
}

export const useExternalAppStore = create<ExternalAppStore>((set, get) => ({
  apps: [],
  loading: false,
  error: null,
  grants: new Map(),
  manifests: new Map(),
  stateCache: new Map(),

  async loadApps() {
    set({ loading: true, error: null });
    try {
      const apps = await externalAppAPI.listExternalApps();
      set({ apps, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  async addApp(req) {
    const meta = await externalAppAPI.createExternalApp(req);
    set((state) => ({ apps: [...state.apps, meta] }));
  },

  async removeApp(appId) {
    await externalAppAPI.deleteExternalApp(appId);
    set((state) => ({
      apps: state.apps.filter((a) => a.id !== appId),
      grants: new Map([...state.grants].filter(([k]) => k !== appId)),
      manifests: new Map([...state.manifests].filter(([k]) => k !== appId)),
      stateCache: new Map([...state.stateCache].filter(([k]) => k !== appId)),
    }));
  },

  async fetchManifest(appId, url) {
    try {
      const base = url.replace(/\/$/, '');
      const resp = await fetch(`${base}/.well-known/bitfun.manifest.json`);
      if (!resp.ok) return null;
      const manifest: ManifestCapabilities = await resp.json();
      set((state) => ({
        manifests: new Map(state.manifests).set(appId, manifest),
      }));
      return manifest;
    } catch {
      return null;
    }
  },

  async setGrants(appId, grants) {
    await externalAppAPI.setGrants(appId, grants);
    set((state) => ({
      grants: new Map(state.grants).set(appId, new Set(grants)),
    }));
  },

  async revokeGrant(appId, capability) {
    const current = get().grants.get(appId) ?? new Set<string>();
    const updated = new Set(current);
    updated.delete(capability);
    const arr = Array.from(updated);
    await externalAppAPI.setGrants(appId, arr);
    set((state) => ({
      grants: new Map(state.grants).set(appId, updated),
    }));
  },

  async clearAllData(appId) {
    await externalAppAPI.clearStorage(appId);
    await externalAppAPI.setGrants(appId, []);
    set((state) => ({
      grants: new Map([...state.grants]).set(appId, new Set()),
      stateCache: new Map([...state.stateCache].filter(([k]) => k !== appId)),
    }));
  },

  cacheState(appId, state) {
    set((s) => ({
      stateCache: new Map(s.stateCache).set(appId, { state, timestamp: Date.now() }),
    }));
  },

  getCachedState(appId) {
    const entry = get().stateCache.get(appId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > 5000) return null;
    return entry.state;
  },
}));
