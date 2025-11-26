'use client';

import React, { createContext, useContext, useState, useRef } from "react";

const AdminContext = createContext(null);
const ADMIN_PIN = "2727";

export function AdminProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [prompt, setPrompt] = useState({ open: false, actionLabel: "", pin: "" });
  const actionRef = useRef(null);

  const showNotification = (message, type = "info", duration = 0) => {
    const id = Date.now().toString() + Math.random().toString(16).slice(2);
    setNotifications((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, duration);
    }
  };

  const dismissNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const requireAdminPin = (actionLabel, fn) => {
    actionRef.current = fn;
    setPrompt({ open: true, actionLabel, pin: "" });
  };

  const closePrompt = () => {
    setPrompt((prev) => ({ ...prev, open: false, pin: "" }));
    actionRef.current = null;
  };

  const submitPin = async (e) => {
    e.preventDefault();
    if (prompt.pin !== ADMIN_PIN) {
      showNotification("Wrong PIN.", "error");
      return;
    }
    const fn = actionRef.current;
    closePrompt();
    if (typeof fn === "function") {
      try {
        await fn();
      } catch (err) {
        console.error(err);
        showNotification("Admin action failed.", "error");
      }
    }
  };

  return (
    <AdminContext.Provider value={{ showNotification, requireAdminPin, notifications }}>
      {children}

      {/* PIN modal */}
      {prompt.open && (
        <div className="pin-backdrop">
          <form className="pin-modal" onSubmit={submitPin}>
            <div className="pin-modal-title">Admin PIN</div>
            <div className="pin-modal-sub">
              Enter PIN to {prompt.actionLabel}.
            </div>
            <input
              className="pin-input"
              type="password"
              maxLength={6}
              autoFocus
              value={prompt.pin}
              onChange={(e) =>
                setPrompt((prev) => ({ ...prev, pin: e.target.value }))
              }
            />
            <div className="pin-modal-actions">
              <button
                type="button"
                className="pin-btn pin-btn-cancel"
                onClick={closePrompt}
              >
                Cancel
              </button>
              <button type="submit" className="pin-btn pin-btn-ok">
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notifications */}
      <div className="notification-root">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={
              "notification-4d " +
              (n.type === "success"
                ? "notif-success"
                : n.type === "error"
                ? "notif-error"
                : "notif-info")
            }
          >
            <div className="notification-4d-message">
              <span className="notification-4d-icon">
                {n.type === "success" ? "✓" : n.type === "error" ? "!" : "i"}
              </span>
              <span>{n.message}</span>
            </div>
            <button
              className="notification-4d-close"
              onClick={() => dismissNotification(n.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
