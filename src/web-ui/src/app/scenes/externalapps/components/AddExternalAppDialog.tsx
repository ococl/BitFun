import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CreateExternalAppRequest } from '../types/externalApp';
import './AddExternalAppDialog.scss';

interface AddExternalAppDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (req: CreateExternalAppRequest) => void;
}

const AddExternalAppDialog: React.FC<AddExternalAppDialogProps> = ({ open, onClose, onSubmit }) => {
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    setLoading(true);
    try {
      await onSubmit({ url: trimmedUrl, description: description.trim() || undefined });
    } finally {
      setLoading(false);
      setUrl('');
      setDescription('');
      onClose();
    }
  };

  return createPortal(
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <h3>添加外部应用</h3>
        <form onSubmit={handleSubmit}>
          <label>URL *<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://example.com" /></label>
          <label>备注<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="可选备注" /></label>
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={loading}>取消</button>
            <button type="submit" disabled={loading}>{loading ? '添加中...' : '添加'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default AddExternalAppDialog;
