'use client';

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div className="pin-backdrop">
      <div className="pin-modal confirm-modal" role="dialog" aria-modal="true">
        <div className="pin-modal-title">{title}</div>
        <div className="pin-modal-sub">{body}</div>
        <div className="pin-modal-actions">
          <button type="button" className="pin-btn pin-btn-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="pin-btn pin-btn-ok" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
