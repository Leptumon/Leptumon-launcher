/** Modal confirmation dialog (portal), used for stopping the game, cancelling installs and updates. */
import React from 'react';
import { createPortal } from 'react-dom';

import Button from './Button';

type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = 'Confirm',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <span id="confirm-title" className="modal-title">{title}</span>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onCancel}>{cancelText}</Button>
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmText}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmDialog;
