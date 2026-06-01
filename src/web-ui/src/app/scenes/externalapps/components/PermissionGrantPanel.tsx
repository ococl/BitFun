import React, { useState, useMemo } from 'react';
import type { ManifestCapabilities } from '../types/externalApp';

interface PermissionGrantPanelProps {
  appName: string;
  manifest: ManifestCapabilities;
  currentGrants: Set<string>;
  onConfirm: (grants: string[]) => void;
  onDeny: () => void;
}

const CAPABILITY_LABELS: Record<string, string> = {
  ai: 'AI 对话与补全',
  storage: '隔离存储读写',
  dialog: '系统文件对话框',
  clipboard: '剪贴板访问',
};

const PermissionGrantPanel: React.FC<PermissionGrantPanelProps> = ({
  appName, manifest, currentGrants, onConfirm, onDeny,
}) => {
  const capabilities = useMemo(() => {
    const caps: { key: string; label: string; description?: string; enabled: boolean }[] = [];
    const c = manifest.capabilities;
    if (c.ai?.enabled) caps.push({ key: 'ai', label: CAPABILITY_LABELS.ai, description: c.ai.description, enabled: true });
    if (c.storage?.enabled) caps.push({ key: 'storage', label: CAPABILITY_LABELS.storage, description: c.storage.description, enabled: true });
    if (c.dialog?.enabled) caps.push({ key: 'dialog', label: CAPABILITY_LABELS.dialog, description: c.dialog.description, enabled: true });
    if (c.clipboard?.enabled) caps.push({ key: 'clipboard', label: CAPABILITY_LABELS.clipboard, description: c.clipboard.description, enabled: true });
    return caps;
  }, [manifest]);

  const [selected, setSelected] = useState<Set<string>>(new Set(currentGrants));

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (capabilities.length === 0) return null;

  return (
    <div className="external-app-permission-panel">
      <h3>{appName} 请求权限</h3>
      <ul className="permission-list">
        {capabilities.map((cap) => (
          <li key={cap.key}>
            <label>
              <input type="checkbox" checked={selected.has(cap.key)} onChange={() => toggle(cap.key)} />
              <span>{cap.label}</span>
            </label>
            {cap.description && <span className="desc">{cap.description}</span>}
          </li>
        ))}
      </ul>
      <div className="actions">
        <button onClick={() => setSelected(new Set(capabilities.map((c) => c.key)))}>全选</button>
        <button onClick={() => setSelected(new Set())}>全不选</button>
        <button onClick={() => onConfirm(Array.from(selected))}>确认授权</button>
        <button onClick={onDeny}>拒绝</button>
      </div>
    </div>
  );
};

export default PermissionGrantPanel;
