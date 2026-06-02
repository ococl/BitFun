import React, { useEffect, useState, useCallback } from 'react';
import ExternalAppRunner from './ExternalAppRunner';
import { externalAppAPI } from '@/infrastructure/api/service-api/ExternalAppAPI';
import type { ExternalAppMeta } from './types/externalApp';
import './ExternalAppScene.scss';

interface ExternalAppSceneProps {
  appId: string;
}

type SceneState = 'loading' | 'error' | 'running';

const ExternalAppScene: React.FC<ExternalAppSceneProps> = ({ appId }) => {
  const [meta, setMeta] = useState<ExternalAppMeta | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [sceneState, setSceneState] = useState<SceneState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSceneState('loading');
    setErrorMsg(null);
    try {
      const appMeta = await externalAppAPI.getExternalApp(appId);
      setMeta(appMeta);
      const storedGrants = await externalAppAPI.getGrants(appId);
      const grantSet = new Set(storedGrants);
      setGrants(grantSet);
      setSceneState('running');
    } catch (e) {
      setErrorMsg(String(e));
      setSceneState('error');
    }
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  const handleRetry = () => load();

  if (sceneState === 'loading') return <div className="external-app-scene loading"><span>加载中...</span></div>;
  if (sceneState === 'error') {
    return (
      <div className="external-app-scene error">
        <p>加载失败: {errorMsg}</p>
        <button onClick={handleRetry}>重试</button>
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
