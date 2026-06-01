import React from 'react';
import type { ExternalAppMeta } from '../types/externalApp';

interface ExternalAppCardProps {
  app: ExternalAppMeta;
  onOpen: (appId: string) => void;
  onDelete: (appId: string) => void;
}

const ExternalAppCard: React.FC<ExternalAppCardProps> = ({ app, onOpen, onDelete }) => (
  <div className="external-app-card" onClick={() => onOpen(app.id)}>
    <div className="external-app-icon">{app.icon}</div>
    <div className="external-app-info">
      <div className="external-app-name">{app.name}</div>
      <div className="external-app-url">{app.url}</div>
      {app.description && <div className="external-app-desc">{app.description}</div>}
    </div>
    <button
      className="external-app-delete-btn"
      onClick={(e) => { e.stopPropagation(); onDelete(app.id); }}
    >
      删除
    </button>
  </div>
);

export default ExternalAppCard;
