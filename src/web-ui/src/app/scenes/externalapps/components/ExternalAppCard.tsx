import React from 'react';
import { Globe, ExternalLink, Trash2, Play } from 'lucide-react';
import type { ExternalAppMeta } from '../types/externalApp';
import './ExternalAppCard.scss';

interface ExternalAppCardProps {
  app: ExternalAppMeta;
  index?: number;
  onOpen: (appId: string) => void;
  onDelete: (appId: string) => void;
  onOpenInWindow: (app: ExternalAppMeta) => void;
}

const ExternalAppCard: React.FC<ExternalAppCardProps> = ({
  app,
  index = 0,
  onOpen,
  onDelete,
  onOpenInWindow,
}) => {
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(app.id);
  };

  const handleOpenWindowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenInWindow(app);
  };

  const handleOpenClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen(app.id);
  };

  const isEmojiIcon = app.icon && !app.icon.startsWith('http') && app.icon.length <= 4;

  return (
    <div
      className="external-app-card"
      style={{
        '--card-index': index,
        '--external-app-card-gradient': 'linear-gradient(135deg, rgba(99, 102, 241, 0.28) 0%, rgba(168, 85, 247, 0.18) 100%)',
      } as React.CSSProperties}
      onClick={handleOpenClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleOpenClick(e as unknown as React.MouseEvent)}
      aria-label={app.name}
    >
      {/* Header with icon, title and version */}
      <div className="external-app-card__header">
        <div className="external-app-card__icon-area">
          <div className="external-app-card__icon">
            {isEmojiIcon ? (
              <span className="external-app-card__emoji">{app.icon}</span>
            ) : app.icon?.startsWith('http') ? (
              <img src={app.icon} alt="" className="external-app-card__img" />
            ) : (
              <Globe size={20} />
            )}
          </div>
        </div>
        <div className="external-app-card__title-group">
          <span className="external-app-card__name">{app.name}</span>
          <span className="external-app-card__version">v{app.version}</span>
        </div>
      </div>

      {/* Body: url + description + tags */}
      <div className="external-app-card__body">
        <div className="external-app-card__url-line">{app.url}</div>
        {app.description ? (
          <div className="external-app-card__desc">
            <span className="external-app-card__desc-inner">{app.description}</span>
          </div>
        ) : null}
        {app.business_domains.length > 0 ? (
          <div className="external-app-card__tags">
            {app.business_domains.slice(0, 3).map((tag) => (
              <span key={tag} className="external-app-card__tag">{tag}</span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Footer with actions: delete moved to far right */}
      <div className="external-app-card__footer">
        <div className="external-app-card__actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="external-app-card__action-btn external-app-card__action-btn--primary"
            onClick={handleOpenClick}
            aria-label="打开"
            title="打开"
          >
            <Play size={15} fill="currentColor" strokeWidth={0} />
          </button>
          <button
            className="external-app-card__action-btn"
            onClick={handleOpenWindowClick}
            aria-label="在独立窗口打开"
            title="在独立窗口打开"
          >
            <ExternalLink size={13} />
          </button>
          <button
            className="external-app-card__action-btn external-app-card__action-btn--danger"
            onClick={handleDeleteClick}
            aria-label="删除"
            title="删除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExternalAppCard;
