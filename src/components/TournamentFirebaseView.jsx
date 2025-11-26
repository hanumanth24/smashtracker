'use client';

import React, { useMemo, useState } from "react";
import {
  collection,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { useCollection } from "../hooks/useCollection.js";
import { useAdmin } from "../context/AdminContext.jsx";

export default function TournamentFirebaseView() {
  const teamsRef = useMemo(() => collection(db, "tournamentTeams"), []);
  const matchesRef = useMemo(() => collection(db, "tournamentMatches"), []);
  const playersRef = useMemo(() => collection(db, "players"), []);

  const teams = useCollection(teamsRef, "tournamentTeams");
  const matches = useCollection(matchesRef, "tournamentMatches");
  const { showNotification, requireAdminPin } = useAdmin();
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);

  const standings = useMemo(() => {
    const arr = [...teams];
    arr.sort((a, b) => {
      if ((b.points || 0) === (a.points || 0)) {
        return (b.wins || 0) - (a.wins || 0);
      }
      return (b.points || 0) - (a.points || 0);
    });
    return arr;
  }, [teams]);

  const togglePlayer = (id) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const players = useCollection(playersRef, "players");

  const createRandomTeams = () => {
    const ids = [...selectedPlayerIds];
    if (ids.length < 2) {
      showNotification("Select at least 2 players for random teams.", "error");
      return;
    }
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const result = [];
    for (let i = 0; i < ids.length; i += 2) {
      const pair = ids.slice(i, i + 2);
      if (pair.length === 2) {
        const p1 = players.find((p) => p.id === pair[0]);
        const p2 = players.find((p) => p.id === pair[1]);
        result.push({
          name: `${p1?.name || "P1"} & ${p2?.name || "P2"}`,
          playerIds: pair,
        });
      }
    }
    if (!result.length) {
      showNotification("Not enough players to form full teams.", "error");
      return;
    }
    requireAdminPin("save tournament teams", async () => {
      const batch = writeBatch(db);
      teams.forEach((t) => batch.delete(doc(teamsRef, t.id)));
      matches.forEach((m) => batch.delete(doc(matchesRef, m.id)));

      result.forEach((t) => {
        const ref = doc(teamsRef);
        batch.set(ref, {
          name: t.name,
          playerIds: t.playerIds,
          wins: 0,
          losses: 0,
          points: 0,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      showNotification("Tournament teams saved & old data cleared.", "success");
    });
  };

  const generateRoundRobin = () => {
    if (teams.length < 2) {
      showNotification("Need at least 2 teams.", "error");
      return;
    }
    requireAdminPin("generate round robin schedule", async () => {
      const batchDel = writeBatch(db);
      matches.forEach((m) => batchDel.delete(doc(matchesRef, m.id)));
      await batchDel.commit();

      const batch = writeBatch(db);
      let order = 1;
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          const ref = doc(matchesRef);
          batch.set(ref, {
            teamAId: teams[i].id,
            teamBId: teams[j].id,
            status: "scheduled",
            winnerTeamId: null,
            order,
            createdAt: serverTimestamp(),
          });
          order++;
        }
      }
      await batch.commit();
      showNotification("Round-robin schedule created.", "success");
    });
  };

  const recordMatchWinner = (match, winnerId) => {
    const loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId;
    requireAdminPin("record match result", async () => {
      const batch = writeBatch(db);
      batch.update(doc(matchesRef, match.id), {
        status: "finished",
        winnerTeamId: winnerId,
      });
      batch.update(doc(teamsRef, winnerId), {
        wins: increment(1),
        points: increment(2),
      });
      batch.update(doc(teamsRef, loserId), {
        losses: increment(1),
      });
      await batch.commit();
      showNotification("Match result recorded.", "success");
    });
  };

  const getPlayerName = (id) =>
    players.find((p) => p.id === id)?.name || "Player";

  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-label">Tournament</div>
      <h2>Teams & Schedule (Firestore)</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Step 1</div>
        <h2>Pick Players & Build Teams</h2>
        <p className="muted">
          Select players from the global league and generate random doubles
          teams for this tournament.
        </p>
        <div
          style={{
            maxHeight: 160,
            overflowY: "auto",
            borderRadius: 10,
            border: "1px solid rgba(55,65,81,0.9)",
            padding: "6px 8px",
            marginBottom: 8,
          }}
        >
          {players.length === 0 ? (
            <div className="muted">No players yet in the league.</div>
          ) : (
            players.map((p) => (
              <label
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "2px 0",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedPlayerIds.includes(p.id)}
                  onChange={() => togglePlayer(p.id)}
                />
                <span>{p.name}</span>
              </label>
            ))
          )}
        </div>
        <button className="btn btn-primary" type="button" onClick={createRandomTeams}>
          Create Random Teams & Save (Admin)
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Step 2</div>
        <h2>Schedule Matches</h2>
        <p className="muted">
          Generate a full round-robin schedule. Each team plays every other team
          once.
        </p>
        <button className="btn btn-primary" type="button" onClick={generateRoundRobin}>
          Generate Round-Robin Schedule (Admin)
        </button>
        <div style={{ marginTop: 10 }}>
          <div className="section-label">Matches</div>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team A</th>
                  <th>Team B</th>
                  <th>Status</th>
                  <th>Winner / Action</th>
                </tr>
              </thead>
              <tbody>
                {matches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No matches scheduled yet.
                    </td>
                  </tr>
                ) : (
                  matches.map((m, idx) => {
                    const teamA = teams.find((t) => t.id === m.teamAId);
                    const teamB = teams.find((t) => t.id === m.teamBId);
                    const teamAName = teamA ? teamA.name : "Team A";
                    const teamBName = teamB ? teamB.name : "Team B";
                    const statusLabel =
                      m.status === "finished" ? "Finished" : "Scheduled";
                    let winnerLabel = "";
                    if (m.status === "finished" && m.winnerTeamId) {
                      const wt = teams.find((t) => t.id === m.winnerTeamId);
                      winnerLabel = wt ? wt.name : "Winner";
                    }
                    return (
                      <tr key={m.id}>
                        <td>{idx + 1}</td>
                        <td>{teamAName}</td>
                        <td>{teamBName}</td>
                        <td>{statusLabel}</td>
                        <td>
                          {m.status === "finished" ? (
                            winnerLabel
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                justifyContent: "center",
                              }}
                            >
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: "4px 8px" }}
                                onClick={() => recordMatchWinner(m, m.teamAId)}
                              >
                                A Won
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: "4px 8px" }}
                                onClick={() => recordMatchWinner(m, m.teamBId)}
                              >
                                B Won
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Step 3</div>
        <h2>Tournament Points Table</h2>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>Players</th>
                <th>Played</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No tournament teams yet.
                  </td>
                </tr>
              ) : (
                standings.map((t, idx) => {
                  const playersNames = (t.playerIds || [])
                    .map((id) => getPlayerName(id))
                    .join(" & ");
                  const wins = t.wins || 0;
                  const losses = t.losses || 0;
                  const played = wins + losses;
                  return (
                    <tr key={t.id}>
                      <td>{idx + 1}</td>
                      <td>{t.name}</td>
                      <td>{playersNames}</td>
                      <td>{played}</td>
                      <td>{wins}</td>
                      <td>{losses}</td>
                      <td>{t.points || 0}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
