'use client';

import React, { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { useCollection } from "../hooks/useCollection.js";
import { useAdmin } from "../context/AdminContext.jsx";

function getPointsPct(p) {
  const points = p.points || 0;
  const losses = p.losses || 0;
  const total = points + losses;
  if (total === 0) return "0%";
  return ((points / total) * 100).toFixed(1) + "%";
}

function formatTime(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return (
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return "";
  }
}

export default function LeagueView({
  pendingRequests = [],
  playersData,
  matchesData,
  variant = "all",
}) {
  const playersRef = useMemo(() => collection(db, "players"), []);
  const matchesRef = useMemo(() => collection(db, "matches"), []);
  const pendingRequestsRef = useMemo(() => collection(db, "pendingRequests"), []);

  const playersHook = useCollection(playersRef, "players", { disabled: Boolean(playersData) });
  const matchesHook = useCollection(matchesRef, "matches", { disabled: Boolean(matchesData) });
  const players = playersData || playersHook;
  const matches = matchesData || matchesHook;
  const { showNotification, requireAdminPin } = useAdmin();

  const [newName, setNewName] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");

  const [team1, setTeam1] = useState({ p1: "", p2: "" });
  const [team2, setTeam2] = useState({ p1: "", p2: "" });
  const [winnerTeam, setWinnerTeam] = useState("");

  const playerMap = useMemo(() => {
    const m = new Map();
    players.forEach((p) => m.set(p.id, p));
    return m;
  }, [players]);

  const sortedPlayers = useMemo(() => {
    const arr = [...players];
    arr.sort((a, b) => {
      if ((b.points || 0) === (a.points || 0)) {
        return (a.name || "").localeCompare(b.name || "");
      }
      return (b.points || 0) - (a.points || 0);
    });
    return arr;
  }, [players]);

  const filteredMatches = useMemo(() => {
    if (historyFilter === "all") return matches;
    const now = new Date();
    return matches.filter((m) => {
      const d = m.time?.toDate ? m.time.toDate() : new Date(m.time || 0);
      if (Number.isNaN(d.getTime())) return true;
      if (historyFilter === "today") {
        return d.toDateString() === now.toDateString();
      }
      if (historyFilter === "week") {
        const diff = now - d;
        return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
      }
      return true;
    });
  }, [matches, historyFilter]);

  const getPlayerName = (id) => playerMap.get(id)?.name || "Unknown";
  const getWinPctNumber = (p) => {
    const pts = p.points || 0;
    const losses = p.losses || 0;
    const total = pts + losses;
    return total === 0 ? 0 : (pts / total) * 100;
  };
  const topPlayer = sortedPlayers[0];
  const topWinPct = topPlayer ? Math.round(getWinPctNumber(topPlayer)) : 0;
  const todayMatches = useMemo(() => {
    const today = new Date().toDateString();
    return matches.filter((m) => {
      const d = m.time?.toDate ? m.time.toDate() : new Date(m.time || 0);
      return d.toDateString() === today;
    }).length;
  }, [matches]);

  const playerOptions = (exclude = []) =>
    players.filter((p) => !exclude.includes(p.id));

  const requestNewPlayer = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      showNotification("Enter a player name.", "error");
      return;
    }
    try {
      await addDoc(pendingRequestsRef, {
        type: "player",
        name,
        createdAt: serverTimestamp(),
      });
      setNewName("");
      showNotification("Player request submitted.", "success");
    } catch (err) {
      console.error(err);
      showNotification("Failed to submit player request.", "error");
    }
  };

  const requestMatch = async (e) => {
    e.preventDefault();
    if (players.length < 4) {
      showNotification("Add at least 4 players first.", "error");
      return;
    }
    const ids = [team1.p1, team1.p2, team2.p1, team2.p2];
    if (ids.some((id) => !id)) {
      showNotification("Select all 4 players.", "error");
      return;
    }
    if (new Set(ids).size !== 4) {
      showNotification("Each position must have a different player.", "error");
      return;
    }
    if (!winnerTeam) {
      showNotification("Select winning team.", "error");
      return;
    }

    try {
      const team1Ids = [team1.p1, team1.p2];
      const team2Ids = [team2.p1, team2.p2];

      await addDoc(pendingRequestsRef, {
        type: "match",
        team1Ids,
        team2Ids,
        winningTeam: Number(winnerTeam),
        createdAt: serverTimestamp(),
      });

      setTeam1({ p1: "", p2: "" });
      setTeam2({ p1: "", p2: "" });
      setWinnerTeam("");
      showNotification("Match request submitted.", "success");
    } catch (err) {
      console.error(err);
      showNotification("Failed to submit match request.", "error");
    }
  };

  const addPoint = (id) => {
    requireAdminPin("add a point", async () => {
      try {
        await updateDoc(doc(playersRef, id), { points: increment(1) });
        showNotification("Point added.", "success");
      } catch (err) {
        console.error(err);
        showNotification("Failed to add point.", "error");
      }
    });
  };

  const addLoss = (id) => {
    requireAdminPin("add a loss", async () => {
      try {
        await updateDoc(doc(playersRef, id), { losses: increment(1) });
        showNotification("Loss added.", "info");
      } catch (err) {
        console.error(err);
        showNotification("Failed to add loss.", "error");
      }
    });
  };

  const removePlayer = (id) => {
    requireAdminPin("remove this player", async () => {
      if (!window.confirm("Remove this player?")) return;
      await deleteDoc(doc(playersRef, id));
      showNotification("Player removed.", "success");
    });
  };

  const resetAll = () => {
    if (!players.length) return;
    requireAdminPin("reset all points & losses", async () => {
      if (!window.confirm("Reset all points and losses?")) return;
      const batch = writeBatch(db);
      players.forEach((p) => {
        batch.update(doc(playersRef, p.id), {
          points: increment(-1 * (p.points || 0)),
          losses: increment(-1 * (p.losses || 0)),
        });
      });
      await batch.commit();
      showNotification("All points and losses reset.", "info");
    });
  };

  const clearHistory = () => {
    if (!matches.length) return;
    requireAdminPin("clear ALL match history", async () => {
      if (!window.confirm("Clear ALL match history?")) return;
      const batch = writeBatch(db);
      matches.forEach((m) => {
        batch.delete(doc(matchesRef, m.id));
      });
      await batch.commit();
      showNotification("Match history cleared.", "info");
    });
  };

  const renderScoreboard = () => (
    <div className="league-shell">
      <div className="section-head">
        <div>
          <div className="section-label">League</div>
          <h2>Scoreboard & Requests</h2>
          <p className="muted">Friends submit player/match requests. Admin approves via PIN.</p>
        </div>
      </div>

      <form onSubmit={requestNewPlayer} className="controls-row surface-row">
        <input
          type="text"
          className="pill-input grow"
          placeholder="Request new player name (e.g. Hanu)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Request Player
        </button>
      </form>

      <div className="card score-card">
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Points</th>
                <th>Losses</th>
                <th>Win %</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No players yet. Submit requests or add via admin.
                  </td>
                </tr>
              ) : (
                sortedPlayers.map((p, idx) => (
                  <tr key={p.id}>
                    <td>{idx + 1}</td>
                    <td>{p.name}</td>
                    <td>{p.points || 0}</td>
                      <td>{p.losses || 0}</td>
                      <td>{getPointsPct(p)}</td>
                      <td className="actions">
                        <button className="chip-btn chip-win" onClick={() => addPoint(p.id)}>
                          +Point
                        </button>
                        <button className="chip-btn chip-loss" onClick={() => addLoss(p.id)}>
                          +Loss
                        </button>
                        <button className="chip-btn chip-remove" onClick={() => removePlayer(p.id)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="controls-row controls-end">
        <button className="btn btn-danger" onClick={resetAll}>
          Reset All Points (Admin)
        </button>
      </div>
    </div>
  );

  const renderExtras = () => (
    <div className="league-shell">
      <div className="card" style={{ marginTop: 0 }}>
        <div className="section-label">Friends – Group Match</div>
        <h2>Request Match Result (2 vs 2)</h2>
        <p className="muted">
          Pick 2 players per team and select the winner. The request goes to
          pending; admin verifies & applies.
        </p>
        <form onSubmit={requestMatch} className="stack-md">
          <div className="match-grid">
            <div className="card team-card">
              <h3 className="team-title">Team 1</h3>
              <div className="team-row">
                <label>Player 1</label>
                <select
                  value={team1.p1}
                  onChange={(e) => setTeam1((t) => ({ ...t, p1: e.target.value }))}
                >
                  <option value="">Select</option>
                  {playerOptions([team1.p2, team2.p1, team2.p2]).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="team-row">
                <label>Player 2</label>
                <select
                  value={team1.p2}
                  onChange={(e) => setTeam1((t) => ({ ...t, p2: e.target.value }))}
                >
                  <option value="">Select</option>
                  {playerOptions([team1.p1, team2.p1, team2.p2]).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="card team-card">
              <h3 className="team-title">Team 2</h3>
              <div className="team-row">
                <label>Player 1</label>
                <select
                  value={team2.p1}
                  onChange={(e) => setTeam2((t) => ({ ...t, p1: e.target.value }))}
                >
                  <option value="">Select</option>
                  {playerOptions([team2.p2, team1.p1, team1.p2]).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="team-row">
                <label>Player 2</label>
                <select
                  value={team2.p2}
                  onChange={(e) => setTeam2((t) => ({ ...t, p2: e.target.value }))}
                >
                  <option value="">Select</option>
                  {playerOptions([team2.p1, team1.p1, team1.p2]).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="controls-row match-actions">
            <div className="label-stack">
              <label className="label-sm">Winning team</label>
              <select value={winnerTeam} onChange={(e) => setWinnerTeam(e.target.value)}>
                <option value="">Select winner</option>
                <option value="1">Team 1</option>
                <option value="2">Team 2</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              Request Match
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="section-label">History</div>
        <div className="section-head">
          <h2>Match History</h2>
          <div className="filter-row">
            <span className="muted">Filter:</span>
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
            </select>
            <button className="btn btn-danger" onClick={clearHistory}>
              Clear History (Admin)
            </button>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team 1</th>
                <th>Team 2</th>
                <th>Winner</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No matches yet.
                  </td>
                </tr>
              ) : (
                filteredMatches.map((m, idx) => {
                  const t1Names = (m.team1Ids || [])
                    .map((id) => getPlayerName(id))
                    .join(" & ");
                  const t2Names = (m.team2Ids || [])
                    .map((id) => getPlayerName(id))
                    .join(" & ");
                  const winnerNames = m.winningTeam === 1 ? t1Names : t2Names;
                  return (
                    <tr key={m.id}>
                      <td>{idx + 1}</td>
                      <td>{t1Names}</td>
                      <td>{t2Names}</td>
                      <td>{winnerNames}</td>
                      <td>{formatTime(m.time)}</td>
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

  if (variant === "score") return renderScoreboard();
  if (variant === "extras") return renderExtras();
  return (
    <>
      {renderScoreboard()}
      {renderExtras()}
    </>
  );
}
