import React, { useState } from 'react';
import type { CreateExternalAppRequest } from '../types/externalApp';

interface AddExternalAppDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (req: CreateExternalAppRequest) => void;
}

const AddExternalAppDialog: React.FC<AddExternalAppDialogProps> = ({ open, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    onSubmit({ name: name.trim(), url: url.trim(), icon: icon.trim() || undefined, description: description.trim() || undefined });
    setName(''); setUrl(''); setIcon(''); setDescription('');
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <h3>添加外部应用</h3>
        <form onSubmit={handleSubmit}>
          <label>名称 *<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>URL *<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required /></label>
          <label>图标（emoji 或 URL）<input value={icon} onChange={(e) => setIcon(e.target.value)} /></label>
          <label>描述<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>取消</button>
            <button type="submit">添加</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddExternalAppDialog;
