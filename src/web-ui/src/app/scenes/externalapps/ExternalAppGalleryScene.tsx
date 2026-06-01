import React, { useEffect, useState } from 'react';
import ExternalAppCard from './components/ExternalAppCard';
import AddExternalAppDialog from './components/AddExternalAppDialog';
import { useExternalAppStore } from './stores/externalAppStore';
import { useSceneManager } from '../../hooks/useSceneManager';
import type { CreateExternalAppRequest } from './types/externalApp';

const ExternalAppGalleryScene: React.FC = () => {
  const { openScene } = useSceneManager();
  const apps = useExternalAppStore((s) => s.apps);
  const loading = useExternalAppStore((s) => s.loading);
  const loadApps = useExternalAppStore((s) => s.loadApps);
  const addApp = useExternalAppStore((s) => s.addApp);
  const removeApp = useExternalAppStore((s) => s.removeApp);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => { loadApps(); }, [loadApps]);

  const handleOpen = (appId: string) => { openScene(`externalapp:${appId}` as `externalapp:${string}`); };
  const handleDelete = async (appId: string) => { if (confirm('确定要删除此外部应用吗？')) await removeApp(appId); };
  const handleAdd = async (req: CreateExternalAppRequest) => { await addApp(req); };

  return (
    <div className="external-app-gallery-scene">
      <div className="gallery-header">
        <h2>外部应用</h2>
        <button onClick={() => setDialogOpen(true)}>+ 添加应用</button>
      </div>
      {loading && <div>加载中...</div>}
      <div className="gallery-grid">
        {apps.map((app) => (
          <ExternalAppCard key={app.id} app={app} onOpen={handleOpen} onDelete={handleDelete} />
        ))}
      </div>
      {apps.length === 0 && !loading && <div className="gallery-empty">暂无外部应用，点击"添加应用"开始。</div>}
      <AddExternalAppDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmit={handleAdd} />
    </div>
  );
};

export default ExternalAppGalleryScene;
