'use client';

import React, { useMemo } from "react";
import { collection } from "firebase/firestore";
import { AdminProvider, useAdmin } from "../../context/AdminContext.jsx";
import SiteHeader from "../../components/SiteHeader.jsx";
import { db } from "../../firebase.js";
import { useCollection } from "../../hooks/useCollection.js";
import AdminPending from "../../components/AdminPending.jsx";
import { useHydrated } from "../../hooks/useHydrated.js";

function NotificationsContent() {
  const hydrated = useHydrated();
  const { notifications } = useAdmin();
  const pendingRequests = useCollection(useMemo(() => collection(db, "pendingRequests"), []), "pendingRequests");
  const playersAll = useCollection(useMemo(() => collection(db, "players"), []), "players");

  const notifCount = pendingRequests.length || notifications.length;

  return (
    <>
      <SiteHeader tab="league" onTabChange={() => {}} notificationsCount={notifCount} hydrated={hydrated} />
      <div className="app-shell">
        <div className="notifications-hero">
          <div className="section-label">Notifications</div>
          <h1>Live Alerts</h1>
          <p className="muted">
            Requests stay until they are approved or rejected. Use the actions below to process player or match requests.
          </p>
          <p className="muted">
            Pending approvals: {pendingRequests.length}
          </p>
        </div>

        <div className="card" style={{ marginTop: 10 }}>
          <AdminPending pendingRequests={pendingRequests} players={playersAll} />
        </div>
      </div>
    </>
  );
}

export default function NotificationsPage() {
  return (
    <AdminProvider>
      <NotificationsContent />
    </AdminProvider>
  );
}
