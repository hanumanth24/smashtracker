'use client';

import React, { useMemo } from "react";
import { collection } from "firebase/firestore";
import { db } from "../firebase.js";
import { useCollection } from "../hooks/useCollection.js";
import { useHydrated } from "../hooks/useHydrated.js";

function formatPct(wins = 0, losses = 0) {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

export default function SnapshotOverview({ mode = "league" }) {
  const hydrated = useHydrated();

  const playersRef = useMemo(() => collection(db, "players"), []);
  const matchesRef = useMemo(() => collection(db, "matches"), []);
  const teamsRef = useMemo(() => collection(db, "tournamentTeams"), []);
  const tMatchesRef = useMemo(() => collection(db, "tournamentMatches"), []);
  const pendingRef = useMemo(() => collection(db, "pendingRequests"), []);

  const players = useCollection(playersRef, "players");
  const matches = useCollection(matchesRef, "matches");
  const teams = useCollection(teamsRef, "tournamentTeams");
  const tournamentMatches = useCollection(tMatchesRef, "tournamentMatches");
  const pending = useCollection(pendingRef, "pendingRequests");

  const isTournament = mode === "tournament";
  const entity = isTournament ? teams : players;
  const played = isTournament ? tournamentMatches : matches;

  const todayMatches = useMemo(() => {
    const today = new Date().toDateString();
    return played.filter((m) => {
      const raw = isTournament ? m.createdAt || m.time : m.time;
      const d = raw?.toDate ? raw.toDate() : new Date(raw || 0);
      return d.toDateString() === today;
    }).length;
  }, [played, isTournament]);

  const topEntity = useMemo(() => {
    if (!entity.length) return null;
    const sorted = [...entity].sort((a, b) => {
      const aPct = isTournament ? formatPct(a.wins, a.losses) : formatPct(a.points, a.losses);
      const bPct = isTournament ? formatPct(b.wins, b.losses) : formatPct(b.points, b.losses);
      return bPct - aPct;
    });
    return sorted[0];
  }, [entity, isTournament]);

  const topWinPct = topEntity
    ? isTournament
      ? formatPct(topEntity.wins, topEntity.losses)
      : formatPct(topEntity.points, topEntity.losses)
    : 0;

  return (
    <div className="card snapshot-card" style={{ marginBottom: 14, width: "100%" }}>
      <div className="section-label">Overview</div>
      <h2>Arena Snapshot</h2>
      <div className="snapshot-grid">
        <div className="stat-pill">
          <div className="pill-label">{isTournament ? "Teams" : "Players"}</div>
          <div className="pill-value" suppressHydrationWarning>
            {hydrated ? entity.length : "—"}
          </div>
          <div className="pill-sub">{isTournament ? "Tournament roster" : "League roster"}</div>
        </div>
        <div className="stat-pill">
          <div className="pill-label">Matches</div>
          <div className="pill-value" suppressHydrationWarning>
            {hydrated ? played.length : "—"}
          </div>
          <div className="pill-sub" suppressHydrationWarning>
            {hydrated ? `${todayMatches} today` : "Loading"}
          </div>
        </div>
        <div className="stat-pill">
          <div className="pill-label">Pending</div>
          <div className="pill-value" suppressHydrationWarning>
            {hydrated ? pending.length : "—"}
          </div>
          <div className="pill-sub">Awaiting approval</div>
        </div>
        <div className="stat-pill">
          <div className="pill-label">Top win %</div>
          <div className="pill-value" suppressHydrationWarning>
            {hydrated ? `${topWinPct}%` : "—"}
          </div>
          <div className="pill-sub" suppressHydrationWarning>
            {hydrated ? (topEntity ? topEntity.name : "—") : "Loading"}
          </div>
        </div>
      </div>
      <div className="snapshot-bar">
        <div className="bar-label">Win momentum</div>
        <div className="bar-track">
          <div
            className="bar-fill"
            style={{ width: `${hydrated ? Math.min(topWinPct, 100) : 0}%` }}
            aria-hidden={!hydrated}
          />
        </div>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Share this link with your group; friends can request players and matches, and admin approvals drive the live scoreboard.
      </p>
    </div>
  );
}
