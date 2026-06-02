import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Plus } from 'lucide-react';
import {
  GalleryLayout,
  GalleryPageHeader,
  GalleryGrid,
  GalleryZone,
  GalleryEmpty,
  GallerySkeleton,
} from '@/app/components';
import { Search } from '@/component-library';
import ExternalAppCard from './components/ExternalAppCard';
import AddExternalAppDialog from './components/AddExternalAppDialog';
import PermissionGrantPanel from './components/PermissionGrantPanel';
import { useExternalAppStore } from './stores/externalAppStore';
import { useSceneManager } from '../../hooks/useSceneManager';
import { useTheme } from '@/infrastructure/theme/hooks/useTheme';
import { useI18n } from '@/infrastructure/i18n';
import { externalAppAPI } from '@/infrastructure/api/service-api/ExternalAppAPI';
import { openedExternalAppWindowLabels } from './services/externalAppWindowSync';
import type { CreateExternalAppRequest, ExternalAppMeta, ManifestCapabilities } from './types/externalApp';
import './ExternalAppGalleryScene.scss';

interface AuthModalState {
  open: boolean;
  app: ExternalAppMeta | null;
  manifest: ManifestCapabilities | null;
  currentGrants: Set<string>;
  onDone: (() => void) | null;
}

const ExternalAppGalleryScene: React.FC = () => {
  const { openScene, activateScene, openTabs } = useSceneManager();
  const { themeType } = useTheme();
  const { currentLanguage } = useI18n();
  const apps = useExternalAppStore((s) => s.apps);
  const loading = useExternalAppStore((s) => s.loading);
  const loadApps = useExternalAppStore((s) => s.loadApps);
  const addApp = useExternalAppStore((s) => s.addApp);
  const removeApp = useExternalAppStore((s) => s.removeApp);
  const fetchManifest = useExternalAppStore((s) => s.fetchManifest);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [authModal, setAuthModal] = useState<AuthModalState>({
    open: false,
    app: null,
    manifest: null,
    currentGrants: new Set(),
    onDone: null,
  });

  useEffect(() => { loadApps(); }, [loadApps]);

  const openTabIds = useMemo(() => new Set(openTabs.map((tab) => tab.id)), [openTabs]);

  const filtered = useMemo(() => {
    return apps.filter((app) => {
      if (!search) return true;
      const keyword = search.toLowerCase();
      return (
        app.name.toLowerCase().includes(keyword) ||
        app.description.toLowerCase().includes(keyword) ||
        app.url.toLowerCase().includes(keyword) ||
        app.business_domains.some((d) => d.toLowerCase().includes(keyword))
      );
    });
  }, [apps, search]);

  const openedApps = useMemo(
    () =>
      openTabs
        .filter((tab) => tab.id.startsWith('externalapp:'))
        .map((tab) => apps.find((app) => `externalapp:${app.id}` === tab.id))
        .filter((app): app is ExternalAppMeta => Boolean(app)),
    [openTabs, apps]
  );

  const ensureAuthorized = useCallback(async (app: ExternalAppMeta, onAuthorized: () => void) => {
    const manifest = await fetchManifest(app.id, app.url);
    const effectiveManifest = manifest ?? {
      version: '0.0.0',
      capabilities: { storage: { enabled: true } },
      commands: [],
    };
    const storedGrants = await externalAppAPI.getGrants(app.id);
    const grantSet = new Set(storedGrants);

    const required = new Set<string>();
    if (effectiveManifest.capabilities.ai?.enabled) required.add('ai');
    if (effectiveManifest.capabilities.storage?.enabled) required.add('storage');
    if (effectiveManifest.capabilities.dialog?.enabled) required.add('dialog');
    if (effectiveManifest.capabilities.clipboard?.enabled) required.add('clipboard');

    const missing = Array.from(required).filter((g) => !grantSet.has(g));
    if (missing.length > 0) {
      setAuthModal({
        open: true,
        app,
        manifest: effectiveManifest,
        currentGrants: grantSet,
        onDone: onAuthorized,
      });
    } else {
      onAuthorized();
    }
  }, [fetchManifest]);

  const handleAuthConfirm = useCallback(async (grants: string[]) => {
    if (!authModal.app) return;
    await externalAppAPI.setGrants(authModal.app.id, grants);
    const onDone = authModal.onDone;
    setAuthModal({ open: false, app: null, manifest: null, currentGrants: new Set(), onDone: null });
    onDone?.();
  }, [authModal]);

  const handleAuthDeny = useCallback(() => {
    setAuthModal({ open: false, app: null, manifest: null, currentGrants: new Set(), onDone: null });
  }, []);

  const handleOpen = useCallback((appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    ensureAuthorized(app, () => {
      const tabId = `externalapp:${appId}` as `externalapp:${string}`;
      if (openTabIds.has(tabId)) {
        activateScene(tabId);
      } else {
        openScene(tabId);
      }
    });
  }, [apps, openTabIds, activateScene, openScene, ensureAuthorized]);

  const handleDelete = async (appId: string) => {
    if (confirm('确定要删除此外部应用吗？')) await removeApp(appId);
  };

  const handleAdd = async (req: CreateExternalAppRequest) => { await addApp(req); };

  const handleOpenInWindow = useCallback(async (app: ExternalAppMeta) => {
    ensureAuthorized(app, async () => {
      try {
        const { Window } = await import('@tauri-apps/api/window');
        const { Webview } = await import('@tauri-apps/api/webview');
        const winLabel = `external-app-${app.id}-${Date.now()}`;
        const webviewLabel = `${winLabel}-view`;
        openedExternalAppWindowLabels.add(webviewLabel);
        const wrapperUrl = `external-app-window.html?appId=${encodeURIComponent(app.id)}&url=${encodeURIComponent(app.url)}&theme=${encodeURIComponent(themeType)}&locale=${encodeURIComponent(currentLanguage)}`;
        const win = new Window(winLabel, {
          title: app.name,
          width: 1200,
          height: 800,
          visible: false,
          center: true,
          resizable: true,
        });
        await new Promise((r) => setTimeout(r, 300));
        new Webview(win, webviewLabel, {
          url: wrapperUrl,
          x: 0,
          y: 0,
          width: 1200,
          height: 800,
        });
        await win.show();
      } catch (e) {
        alert(`打开独立窗口失败: ${e}`);
      }
    });
  }, [ensureAuthorized, themeType, currentLanguage]);

  return (
    <GalleryLayout className="external-app-gallery">
      <GalleryPageHeader
        title="外部应用"
        subtitle="在 BitFun 中嵌入和管理外部 Web 应用"
        actions={(
          <>
            <Search value={search} onChange={setSearch} placeholder="搜索外部应用…" size="small" />
            <button
              type="button"
              className="gallery-action-btn gallery-action-btn--primary"
              onClick={() => setDialogOpen(true)}
              title="添加应用"
            >
              <Plus size={15} />
            </button>
          </>
        )}
      />

      <div className="gallery-zones">
        <GalleryZone
          title="已打开"
          tools={openedApps.length > 0 ? <span className="gallery-zone-badge">{openedApps.length}</span> : null}
        >
          {openedApps.length > 0 ? (
            <GalleryGrid minCardWidth={360}>
              {openedApps.map((app, index) => (
                <ExternalAppCard
                  key={app.id}
                  app={app}
                  index={index}
                  onOpen={handleOpen}
                  onDelete={handleDelete}
                  onOpenInWindow={handleOpenInWindow}
                />
              ))}
            </GalleryGrid>
          ) : (
            <div className="gallery-run-empty">暂无打开中的应用</div>
          )}
        </GalleryZone>

        <GalleryZone
          title="全部应用"
          tools={<span className="gallery-zone-count">{filtered.length} 个应用</span>}
        >
          {loading && apps.length === 0 ? (
            <GallerySkeleton count={6} cardHeight={200} />
          ) : filtered.length === 0 ? (
            <GalleryEmpty
              icon={<Globe size={36} strokeWidth={1.2} />}
              message={apps.length === 0 ? '暂无外部应用，点击右上角按钮添加' : '没有匹配的应用'}
            />
          ) : (
            <GalleryGrid minCardWidth={360}>
              {filtered.map((app, index) => (
                <ExternalAppCard
                  key={app.id}
                  app={app}
                  index={index}
                  onOpen={handleOpen}
                  onDelete={handleDelete}
                  onOpenInWindow={handleOpenInWindow}
                />
              ))}
            </GalleryGrid>
          )}
        </GalleryZone>
      </div>

      <AddExternalAppDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmit={handleAdd} />

      {authModal.open && authModal.app && authModal.manifest && createPortal(
        <div className="external-app-auth-modal">
          <div className="external-app-auth-modal__overlay" onClick={handleAuthDeny} role="presentation" />
          <PermissionGrantPanel
            appName={authModal.app.name}
            manifest={authModal.manifest}
            currentGrants={authModal.currentGrants}
            onConfirm={handleAuthConfirm}
            onDeny={handleAuthDeny}
          />
        </div>,
        document.body,
      )}
    </GalleryLayout>
  );
};

export default ExternalAppGalleryScene;
