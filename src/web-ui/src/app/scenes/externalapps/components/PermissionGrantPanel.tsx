import React, { useState, useMemo } from 'react';
import {
  Brain, Database, FolderOpen, ClipboardCheck, Globe, Bell,
  Check, X, ShieldCheck, AlertCircle,
} from 'lucide-react';
import type { ManifestCapabilities } from '../types/externalApp';
import './PermissionGrantPanel.scss';

interface PermissionGrantPanelProps {
  appName: string;
  manifest: ManifestCapabilities;
  currentGrants: Set<string>;
  onConfirm: (grants: string[]) => void;
  onDeny: () => void;
}

const CAPABILITY_META: Record<string, { label: string; icon: React.ReactNode }> = {
  ai: { label: 'AI 对话与补全', icon: <Brain size={20} /> },
  storage: { label: '隔离存储读写', icon: <Database size={20} /> },
  dialog: { label: '系统文件对话框', icon: <FolderOpen size={20} /> },
  clipboard: { label: '剪贴板访问', icon: <ClipboardCheck size={20} /> },
  network: { label: '外部网络请求', icon: <Globe size={20} /> },
  notification: { label: '桌面通知', icon: <Bell size={20} /> },
};

const PermissionGrantPanel: React.FC<PermissionGrantPanelProps> = ({
  appName, manifest, currentGrants, onConfirm, onDeny,
}) => {
  const capabilities = useMemo(() => {
    const caps: { key: string; label: string; description?: string; icon: React.ReactNode; required: boolean }[] = [];
    const c = manifest.capabilities;
    const add = (key: string) => {
      const item = c[key as keyof typeof c];
      if (!item?.enabled) return;
      const meta = CAPABILITY_META[key] ?? { label: key, icon: <ShieldCheck size={20} /> };
      caps.push({ key, label: meta.label, description: item.description, icon: meta.icon, required: item.required ?? false });
    };
    add('ai');
    add('storage');
    add('dialog');
    add('clipboard');
    add('network');
    add('notification');
    return caps;
  }, [manifest]);

  const [selected, setSelected] = useState<Set<string>>(new Set(currentGrants));
  const [showError, setShowError] = useState(false);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setShowError(false);
  };

  const allKeys = capabilities.map((c) => c.key);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const noneSelected = allKeys.every((k) => !selected.has(k));

  const requiredKeys = useMemo(() => capabilities.filter((c) => c.required).map((c) => c.key), [capabilities]);
  const requiredMet = requiredKeys.every((k) => selected.has(k));
  const hasRequired = requiredKeys.length > 0;
  const canConfirm = !hasRequired || requiredMet;

  const handleConfirm = () => {
    if (!canConfirm) {
      setShowError(true);
      return;
    }
    onConfirm(Array.from(selected));
  };

  if (capabilities.length === 0) return null;

  return (
    <div className="permission-panel">
      <div className="permission-panel__header">
        <div className="permission-panel__icon">
          <ShieldCheck size={32} strokeWidth={1.5} />
        </div>
        <h3 className="permission-panel__title">{appName}</h3>
        <p className="permission-panel__subtitle">请求访问以下权限</p>
      </div>

      <div className="permission-panel__list">
        {capabilities.map((cap) => {
          const isSelected = selected.has(cap.key);
          return (
            <button
              key={cap.key}
              type="button"
              className={[
                'permission-panel__item',
                isSelected && 'permission-panel__item--selected',
              ].filter(Boolean).join(' ')}
              onClick={() => toggle(cap.key)}
              aria-pressed={isSelected}
            >
              <div className="permission-panel__item-icon">{cap.icon}</div>
              <div className="permission-panel__item-body">
                <div className="permission-panel__item-label">
                  {cap.label}
                  {cap.required && <span className="permission-panel__required-tag">必需</span>}
                </div>
                {cap.description ? (
                  <div className="permission-panel__item-desc">{cap.description}</div>
                ) : null}
              </div>
              <div className="permission-panel__item-check">
                {isSelected ? <Check size={14} strokeWidth={3} /> : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="permission-panel__bulk">
        <button
          type="button"
          className={[
            'permission-panel__bulk-btn',
            allSelected && 'permission-panel__bulk-btn--active',
          ].filter(Boolean).join(' ')}
          onClick={() => { setSelected(new Set(allKeys)); setShowError(false); }}
          disabled={allSelected}
        >
          全选
        </button>
        <button
          type="button"
          className={[
            'permission-panel__bulk-btn',
            noneSelected && 'permission-panel__bulk-btn--active',
          ].filter(Boolean).join(' ')}
          onClick={() => { setSelected(new Set()); setShowError(false); }}
          disabled={noneSelected}
        >
          全不选
        </button>
      </div>

      {showError && hasRequired && !requiredMet && (
        <div className="permission-panel__error">
          <AlertCircle size={14} />
          请勾选所有标记为"必需"的权限
        </div>
      )}

      <div className="permission-panel__actions">
        <button type="button" className="permission-panel__btn permission-panel__btn--secondary" onClick={onDeny}>
          <X size={14} />
          拒绝
        </button>
        <button
          type="button"
          className="permission-panel__btn permission-panel__btn--primary"
          onClick={handleConfirm}
          disabled={!canConfirm}
        >
          <Check size={14} />
          确认授权
        </button>
      </div>
    </div>
  );
};

export default PermissionGrantPanel;
