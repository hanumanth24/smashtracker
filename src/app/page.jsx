'use client';

import React, { useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import { AdminProvider, useAdmin } from "../context/AdminContext.jsx";
import SiteHeader from "../components/SiteHeader.jsx";
import LeagueView from "../components/LeagueView.jsx";
import TournamentFirebaseView from "../components/TournamentFirebaseView.jsx";
import ThreeCourt from "../components/ThreeCourt.jsx";
import { db } from "../firebase.js";
import { useCollection } from "../hooks/useCollection.js";
import SnapshotOverview from "../components/SnapshotOverview.jsx";
import { useHydrated } from "../hooks/useHydrated.js";

function PageContent() {
  const [tab, setTab] = useState("league");
  const hydrated = useHydrated();
  const { notifications } = useAdmin();
  const playersRef = useMemo(() => collection(db, "players"), []);
  const matchesRef = useMemo(() => collection(db, "matches"), []);
  const pendingRef = useMemo(() => collection(db, "pendingRequests"), []);

  const playersAll = useCollection(playersRef, "players");
  const matchesAll = useCollection(matchesRef, "matches");
  const pendingRequests = useCollection(pendingRef, "pendingRequests");
  const notifCount = useMemo(() => {
    if (pendingRequests.length) return pendingRequests.length;
    return notifications.length;
  }, [notifications, pendingRequests]);

  return (
    <>
      <SiteHeader
        tab={tab}
        onTabChange={setTab}
        notificationsCount={notifCount}
        hydrated={hydrated}
        activePage="league"
      />

      <div className="app-shell" id="top">
        <SnapshotOverview
          mode={tab === "tournament" ? "tournament" : "league"}
          playersData={playersAll}
          matchesData={matchesAll}
          pendingData={pendingRequests}
        />

        <div id="league" className="anchor-spacer" aria-hidden />
        <div id="tournament" className="anchor-spacer" aria-hidden />
        <div id="arena" className="anchor-spacer" aria-hidden />

        <div className="top-grid">
          <div className="card league-card">
            {tab === "league" ? (
              <LeagueView
                pendingRequests={pendingRequests}
                playersData={playersAll}
                matchesData={matchesAll}
              />
            ) : (
              <TournamentFirebaseView />
            )}
          </div>
          <div className="side-stack">
            <div id="arena" className="card side-card">
              <div className="section-label">3D Court</div>
              <h2>Esports Arena</h2>
              <div className="court-wrapper">
                <ThreeCourt />
              </div>
              <p className="muted" style={{ marginTop: 10 }}>
                Rotate, zoom, and share the neon court preview with teammates.
                Tip: use it as a lobby screen while matches are queued.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <AdminProvider>
      <PageContent />
    </AdminProvider>
  );
}
