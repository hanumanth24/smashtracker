'use client';

import React, { useMemo } from "react";
import { collection } from "firebase/firestore";
import { AdminProvider, useAdmin } from "../../context/AdminContext.jsx";
import SiteHeader from "../../components/SiteHeader.jsx";
import FuturisticShowcase from "../../components/FuturisticShowcase.jsx";
import { db } from "../../firebase.js";
import { useCollection } from "../../hooks/useCollection.js";
import { useHydrated } from "../../hooks/useHydrated.js";

function NrrcContent() {
  const hydrated = useHydrated();
  const { notifications } = useAdmin();
  const pendingRequests = useCollection(
    useMemo(() => collection(db, "pendingRequests"), []),
    "pendingRequests"
  );
  const notifCount = pendingRequests.length || notifications.length;

  return (
    <>
      <SiteHeader
        tab="league"
        onTabChange={() => {}}
        notificationsCount={notifCount}
        hydrated={hydrated}
        activePage="nrrc"
      />
      <FuturisticShowcase />
    </>
  );
}

export default function NrrcPage() {
  return (
    <AdminProvider>
      <NrrcContent />
    </AdminProvider>
  );
}
