/**
 * useSceneManager — thin wrapper around the shared sceneStore.
 *
 * All consumers (SceneBar, SceneViewport, NavPanel, …) now read from and
 * write to the same Zustand store, so state is always in sync.
 */

import { SCENE_TAB_REGISTRY, getMiniAppSceneDef, getExternalAppSceneDef } from '../scenes/registry';
import type { SceneTabDef, SceneTabId } from '../components/SceneBar/types';
import { useSceneStore } from '../stores/sceneStore';
import { useMiniAppStore } from '../scenes/miniapps/miniAppStore';
import { useExternalAppStore } from '../scenes/externalapps/stores/externalAppStore';
import { pickLocalizedString } from '../scenes/miniapps/utils/pickLocalizedString';
import { useI18n } from '@/infrastructure/i18n';

export interface UseSceneManagerReturn {
  openTabs: ReturnType<typeof useSceneStore.getState>['openTabs'];
  activeTabId: ReturnType<typeof useSceneStore.getState>['activeTabId'];
  tabDefs: SceneTabDef[];
  activateScene: (id: SceneTabId) => void;
  openScene: (id: SceneTabId) => void;
  closeScene: (id: SceneTabId) => void;
}

export function useSceneManager(): UseSceneManagerReturn {
  const { openTabs, activeTabId, activateScene, openScene, closeScene } = useSceneStore();
  const miniApps = useMiniAppStore((s) => s.apps);
  const externalApps = useExternalAppStore((s) => s.apps);
  const { currentLanguage } = useI18n();

  const miniAppDefs: SceneTabDef[] = openTabs
    .filter((t) => typeof t.id === 'string' && t.id.startsWith('miniapp:'))
    .map((t) => {
      const appId = (t.id as string).slice('miniapp:'.length);
      const app = miniApps.find((a) => a.id === appId);
      const localizedName = app ? pickLocalizedString(app, currentLanguage, 'name') : undefined;
      return getMiniAppSceneDef(appId, localizedName ?? app?.name);
    });

  const externalAppDefs: SceneTabDef[] = openTabs
    .filter((t) => typeof t.id === 'string' && t.id.startsWith('externalapp:'))
    .map((t) => {
      const appId = (t.id as string).slice('externalapp:'.length);
      const app = externalApps.find((a) => a.id === appId);
      return getExternalAppSceneDef(appId, app?.name);
    });

  return {
    openTabs,
    activeTabId,
    tabDefs: [...SCENE_TAB_REGISTRY, ...miniAppDefs, ...externalAppDefs],
    activateScene,
    openScene,
    closeScene,
  };
}
