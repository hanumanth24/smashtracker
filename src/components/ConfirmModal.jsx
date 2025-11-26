'use client';

import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const modal = (
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

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
