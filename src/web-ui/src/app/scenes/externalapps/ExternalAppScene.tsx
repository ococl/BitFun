import React, { useEffect, useState, useCallback } from 'react';
import ExternalAppRunner from './ExternalAppRunner';
import PermissionGrantPanel from './components/PermissionGrantPanel';
import { useExternalAppStore } from './stores/externalAppStore';
import { externalAppAPI } from '@/infrastructure/api/service-api/ExternalAppAPI';
import type { ExternalAppMeta, ManifestCapabilities } from './types/externalApp';

interface ExternalAppSceneProps {
  appId: string;
}

type SceneState = 'loading' | 'error' | 'granting' | 'running' | 'denied';

const ExternalAppScene: React.FC<ExternalAppSceneProps> = ({ appId }) => {
  const [meta, setMeta] = useState<ExternalAppMeta | null>(null);
  const [manifest, setManifest] = useState<ManifestCapabilities | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [sceneState, setSceneState] = useState<SceneState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fetchManifest = useExternalAppStore((s) => s.fetchManifest);
  const storeSetGrants = useExternalAppStore((s) => s.setGrants);

  const load = useCallback(async () => {
    setSceneState('loading');
    try {
      const appMeta = await externalAppAPI.getExternalApp(appId);
      setMeta(appMeta);
      const storedGrants = await externalAppAPI.getGrants(appId);
      const grantSet = new Set(storedGrants);
      setGrants(grantSet);

      const mani = await fetchManifest(appId, appMeta.url);
      if (!mani) {
        setManifest({ version: '0.0.0', capabilities: { storage: { enabled: true } }, commands: [] });
        setSceneState('running');
        return;
      }
      setManifest(mani);

      const required = new Set<string>();
      if (mani.capabilities.ai?.enabled) required.add('ai');
      if (mani.capabilities.storage?.enabled) required.add('storage');
      if (mani.capabilities.dialog?.enabled) required.add('dialog');
      if (mani.capabilities.clipboard?.enabled) required.add('clipboard');

      const missing = Array.from(required).filter((g) => !grantSet.has(g));
      if (missing.length > 0) setSceneState('granting');
      else setSceneState('running');
    } catch (e) {
      setErrorMsg(String(e));
      setSceneState('error');
    }
  }, [appId, fetchManifest]);

  useEffect(() => { load(); }, [load]);

  const handleConfirmGrants = async (newGrants: string[]) => {
    await storeSetGrants(appId, newGrants);
    setGrants(new Set(newGrants));
    setSceneState('running');
  };

  const handleDeny = () => setSceneState('denied');
  const handleRetry = () => load();

  if (sceneState === 'loading') return <div className="external-app-scene loading"><span>加载中...</span></div>;
  if (sceneState === 'error') return <div className="external-app-scene error"><p>加载失败: {errorMsg}</p><button onClick={handleRetry}>重试</button></div>;
  if (sceneState === 'denied') return <div className="external-app-scene denied"><p>用户拒绝了权限授权</p><button onClick={handleRetry}>重新授权</button></div>;
  if (sceneState === 'granting' && meta && manifest) {
    return (
      <div className="external-app-scene granting">
        <PermissionGrantPanel appName={meta.name} manifest={manifest} currentGrants={grants} onConfirm={handleConfirmGrants} onDeny={handleDeny} />
      </div>
    );
  }
  if (sceneState === 'running' && meta) {
    return (
      <div className="external-app-scene running" style={{ width: '100%', height: '100%' }}>
        <ExternalAppRunner url={meta.url} appId={appId} grantedCapabilities={grants} />
      </div>
    );
  }
  return null;
};

export default ExternalAppScene;
