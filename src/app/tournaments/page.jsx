'use client';

import React, { useMemo, useState } from "react";
import SiteHeader from "../../components/SiteHeader.jsx";
import { AdminProvider, useAdmin } from "../../context/AdminContext.jsx";
import { collection } from "firebase/firestore";
import { db } from "../../firebase.js";
import { useCollection } from "../../hooks/useCollection.js";
import { useHydrated } from "../../hooks/useHydrated.js";

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const formatLabels = {
  "round-robin": "Round Robin / League",
  knockout: "Knockout / Single Elimination",
  "double-elim": "Double Elimination",
  groups: "Group Stage → Knockout",
};

function BracketPreview({ bracket, format, onEditMatch, onSwapTeams }) {
  const rounds = bracket?.rounds || [];
  if (!rounds.length) {
    return (
      <div className="bracket-shell">
        <div className="section-label">Bracket Preview</div>
        <h3>3D-style Tournament Bracket</h3>
        <div className="muted">Add players and generate teams to seed the bracket.</div>
      </div>
    );
  }
  return (
    <div className="bracket-shell">
      <div className="section-label">Bracket Preview</div>
      <h3>3D-style Tournament Bracket</h3>
      <div className="bracket-meta-row">
        <span className="pill-chip">
          Format: {formatLabels[format] || "Custom"}
        </span>
        <span className="muted">
          Tap a match to edit time, court, or score. Swap flips seeds.
        </span>
      </div>
      <div className="bracket-grid">
        {rounds.map((round, idx) => (
          <div key={idx} className="bracket-round">
            <div className="round-title">{round.name || `Round ${idx + 1}`}</div>
            {round.matches.length === 0 ? (
              <div className="muted">Waiting for teams.</div>
            ) : (
              round.matches.map((match, mIdx) => (
                <button
                  type="button"
                  key={match.id}
                  className="bracket-card"
                  onClick={() => onEditMatch(idx, mIdx)}
                >
                  <div className="bracket-card__teams">
                    <div className="bracket-team">{match.teamA || "TBD"}</div>
                    <div className="bracket-vs">vs</div>
                    <div className="bracket-team">{match.teamB || "TBD"}</div>
                  </div>
                  <div className="match-meta">
                    <span className="pill-chip ghost">
                      🕒 {match.time || "Set time"}
                    </span>
                    <span className="pill-chip ghost">
                      🏟️ {match.court || "Court TBD"}
                    </span>
                  </div>
                  <div className="score-line">
                    <span className="score-badge">
                      {match.scoreA === "" && match.scoreB === ""
                        ? "Score pending"
                        : `${match.scoreA || 0} - ${match.scoreB || 0}`}
                    </span>
                    <span
                      className="ghost-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwapTeams(idx, mIdx);
                      }}
                    >
                      Swap seeds
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TournamentBuilder() {
  const { notifications } = useAdmin();
  const hydrated = useHydrated();
  const pendingRequests = useCollection(useMemo(() => collection(db, "pendingRequests"), []), "pendingRequests");
  const notifCount = pendingRequests.length || notifications.length;

  const [form, setForm] = useState({
    name: "",
    location: "",
    startDate: "",
    endDate: "",
    format: "round-robin",
    rules: "",
  });
  const [playerName, setPlayerName] = useState("");
  const [playerGroup, setPlayerGroup] = useState("Beginner");
  const [players, setPlayers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [teams, setTeams] = useState([]);
  const [locked, setLocked] = useState(false);
  const [bracket, setBracket] = useState({ rounds: [], format: "round-robin" });
  const [editingMatch, setEditingMatch] = useState(null);
  const [editForm, setEditForm] = useState({
    teamA: "",
    teamB: "",
    time: "",
    court: "",
    scoreA: "",
    scoreB: "",
  });

  const seedBracketFromTeams = (teamNames, formatOverride) => {
    const formatKey = formatOverride || form.format;
    const round1Matches = [];
    for (let i = 0; i < teamNames.length; i += 2) {
      const pair = teamNames.slice(i, i + 2);
      round1Matches.push({
        id: `r1-m${i / 2 + 1}-${Date.now()}`,
        teamA: pair[0] || "TBD",
        teamB: pair[1] || "TBD",
        time: "",
        court: "",
        scoreA: "",
        scoreB: "",
      });
    }

    const rounds = [
      { name: formatKey === "round-robin" ? "Round Robin Fixtures" : "Round 1", matches: round1Matches },
    ];

    if (formatKey !== "round-robin" && round1Matches.length > 1) {
      const nextCount = Math.ceil(round1Matches.length / 2);
      rounds.push({
        name: round1Matches.length > 2 ? "Semi-finals" : "Final",
        matches: new Array(nextCount).fill(null).map((_, idx) => ({
          id: `r2-m${idx + 1}-${Date.now()}`,
          teamA: `Winner R1M${idx * 2 + 1}`,
          teamB: round1Matches[idx * 2 + 1] ? `Winner R1M${idx * 2 + 2}` : "Bye",
          time: "",
          court: "",
          scoreA: "",
          scoreB: "",
        })),
      });
    }

    if (formatKey !== "round-robin" && round1Matches.length > 2) {
      rounds.push({
        name: "Final",
        matches: [
          {
            id: `r3-m1-${Date.now()}`,
            teamA: "Winner Semi 1",
            teamB: "Winner Semi 2",
            time: "",
            court: "",
            scoreA: "",
            scoreB: "",
          },
        ],
      });
    }

    setBracket({ rounds, format: formatKey });
  };

  const startEdit = (roundIdx, matchIdx) => {
    const match = bracket.rounds?.[roundIdx]?.matches?.[matchIdx];
    if (!match) return;
    setEditingMatch({ roundIdx, matchIdx });
    setEditForm({
      teamA: match.teamA || "",
      teamB: match.teamB || "",
      time: match.time || "",
      court: match.court || "",
      scoreA: match.scoreA ?? "",
      scoreB: match.scoreB ?? "",
    });
  };

  const saveEdit = () => {
    if (!editingMatch) return;
    setBracket((prev) => {
      const rounds = prev.rounds.map((r, rIdx) => {
        if (rIdx !== editingMatch.roundIdx) return r;
        const matches = r.matches.map((m, mIdx) =>
          mIdx === editingMatch.matchIdx ? { ...m, ...editForm } : m
        );
        return { ...r, matches };
      });
      return { ...prev, rounds };
    });
    setEditingMatch(null);
  };

  const swapTeams = (roundIdx, matchIdx) => {
    setBracket((prev) => {
      const rounds = prev.rounds.map((r, rIdx) => {
        if (rIdx !== roundIdx) return r;
        const matches = r.matches.map((m, mIdx) => {
          if (mIdx !== matchIdx) return m;
          return {
            ...m,
            teamA: m.teamB,
            teamB: m.teamA,
            scoreA: m.scoreB,
            scoreB: m.scoreA,
          };
        });
        return { ...r, matches };
      });
      return { ...prev, rounds };
    });
  };

  const addCustomMatch = () => {
    const newMatch = {
      id: `custom-${Date.now()}`,
      teamA: "Team A",
      teamB: "Team B",
      time: "",
      court: "",
      scoreA: "",
      scoreB: "",
    };
    setBracket((prev) => {
      const baseRounds = prev.rounds.length
        ? [...prev.rounds]
        : [{ name: "Round 1", matches: [] }];
      baseRounds[0] = {
        ...baseRounds[0],
        matches: [...baseRounds[0].matches, newMatch],
      };
      return { ...prev, rounds: baseRounds };
    });
  };

  const addPlayer = () => {
    const name = playerName.trim();
    if (!name || locked) return;
    const newPlayer = {
      id: `p-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      group: playerGroup,
    };
    setPlayers((prev) => [...prev, newPlayer]);
    setPlayerName("");
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === players.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(players.map((p) => p.id));
    }
  };

  const togglePlayer = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const generateTeams = () => {
    if (locked) return;
    const ids = selectedIds.length ? selectedIds : players.map((p) => p.id);
    if (ids.length < 2) return;
    const shuffled = shuffle(ids);
    const generated = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      const pair = shuffled.slice(i, i + 2);
      if (pair.length === 2) {
        const p1 = players.find((p) => p.id === pair[0]);
        const p2 = players.find((p) => p.id === pair[1]);
        generated.push(`${p1?.name || "P1"} & ${p2?.name || "P2"}`);
      } else {
        generated.push(players.find((p) => p.id === pair[0])?.name || "TBD");
      }
    }
    setTeams(generated);
    seedBracketFromTeams(generated);
  };

  return (
    <>
      <SiteHeader
        tab="tournament"
        onTabChange={() => {}}
        notificationsCount={notifCount}
        hydrated={hydrated}
        activePage="tournaments"
      />
      <div className="app-shell section-stack">
        <div className="card">
          <div className="section-label">Step 0</div>
          <h2>Create Tournament</h2>
          <div className="form-grid">
            <label className="form-field">
              <span className="pill-label">Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Autumn Open"
              />
            </label>
            <label className="form-field">
              <span className="pill-label">Location</span>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Main Arena"
              />
            </label>
            <label className="form-field">
              <span className="pill-label">Start Date</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <label className="form-field">
              <span className="pill-label">End Date</span>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
            <label className="form-field">
              <span className="pill-label">Format</span>
              <select
                value={form.format}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => ({ ...f, format: value }));
                  setBracket((prev) => ({ ...prev, format: value }));
                }}
              >
                <option value="round-robin">Round Robin</option>
                <option value="knockout">Knockout</option>
                <option value="double-elim">Double Elimination</option>
                <option value="groups">Group Stage + KO</option>
              </select>
            </label>
            <label className="form-field">
              <span className="pill-label">Rules</span>
              <input
                type="text"
                value={form.rules}
                onChange={(e) => setForm((f) => ({ ...f, rules: e.target.value }))}
                placeholder="Best of 3 to 21, rally scoring"
              />
            </label>
          </div>
        </div>

        <div className="card">
          <div className="section-label">Step 1</div>
          <h2>Enter Players & Groups</h2>
          <p className="muted">Add players manually and tag them by group. Select All toggles for quick batching.</p>
          <div className="controls-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Player name"
              style={{ flex: "1 1 220px", padding: "10px 12px", borderRadius: 10 }}
            />
            <select
              value={playerGroup}
              onChange={(e) => setPlayerGroup(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
              <option value="Group A">Group A</option>
              <option value="Group B">Group B</option>
              <option value="Group C">Group C</option>
            </select>
            <button type="button" className="btn btn-primary" onClick={addPlayer}>
              Add Player
            </button>
          </div>
          <div className="controls-row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <div className="muted">Players added: {players.length}</div>
            <button type="button" className="btn btn-ghost" onClick={toggleSelectAll} style={{ border: "1px solid rgba(148,163,184,0.6)", color: "#e5e7eb" }}>
              {selectedIds.length === players.length ? "Clear selection" : "Select all"}
            </button>
          </div>
          <div
            style={{
              maxHeight: 220,
              overflowY: "auto",
              borderRadius: 12,
              border: "1px solid rgba(55,65,81,0.9)",
              padding: "8px 10px",
              marginTop: 8,
            }}
          >
            {players.length === 0 ? (
              <div className="muted">No players yet. Add above.</div>
            ) : (
              players.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    padding: "4px 0",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => togglePlayer(p.id)}
                  />
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span className="badge-chip" style={{ padding: "4px 8px", fontSize: 11 }}>
                    {p.group}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="section-label">Step 2</div>
          <h2>Generate Teams / Pairs</h2>
          <p className="muted">Shuffle and form random pairs for doubles. Lock teams when finalized.</p>
          <div className="controls-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="button" onClick={generateTeams}>
              Generate Random Teams
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setLocked((v) => !v)}
              style={{ border: "1px solid rgba(148,163,184,0.6)", color: "#e5e7eb" }}
            >
              {locked ? "Unlock Teams" : "Lock Teams"}
            </button>
          </div>
          <div className="controls-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => seedBracketFromTeams(teams)}
              disabled={!teams.length}
              style={{ border: "1px solid rgba(148,163,184,0.5)", color: "#e5e7eb" }}
            >
              Regenerate bracket from teams
            </button>
            <button className="btn btn-ghost" type="button" onClick={addCustomMatch}>
              Add custom match
            </button>
          </div>
          <div className="team-list">
            {teams.length === 0 ? (
              <div className="muted">No teams yet. Generate above.</div>
            ) : (
              teams.map((t, idx) => (
                <div key={idx} className="team-chip">
                  <span>Team {idx + 1}</span>
                  <strong>{t}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="section-label">Step 3</div>
          <BracketPreview
            bracket={bracket}
            format={form.format}
            onEditMatch={startEdit}
            onSwapTeams={swapTeams}
          />
          {editingMatch && (
            <div className="edit-panel">
              <div className="edit-panel__header">
                <div>
                  <div className="pill-label">Editing</div>
                  <strong>
                    {bracket.rounds[editingMatch.roundIdx]?.name || "Round"} · Match{" "}
                    {editingMatch.matchIdx + 1}
                  </strong>
                </div>
                <button className="btn btn-ghost" type="button" onClick={() => setEditingMatch(null)}>
                  Close
                </button>
              </div>
              <div className="edit-grid">
                <label className="form-field">
                  <span className="pill-label">Team A</span>
                  <input
                    type="text"
                    value={editForm.teamA}
                    onChange={(e) => setEditForm((f) => ({ ...f, teamA: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span className="pill-label">Team B</span>
                  <input
                    type="text"
                    value={editForm.teamB}
                    onChange={(e) => setEditForm((f) => ({ ...f, teamB: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span className="pill-label">Time</span>
                  <input
                    type="text"
                    value={editForm.time}
                    placeholder="Sat 4:00 PM"
                    onChange={(e) => setEditForm((f) => ({ ...f, time: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span className="pill-label">Court</span>
                  <input
                    type="text"
                    value={editForm.court}
                    placeholder="Court 2"
                    onChange={(e) => setEditForm((f) => ({ ...f, court: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span className="pill-label">Score A</span>
                  <input
                    type="number"
                    value={editForm.scoreA}
                    onChange={(e) => setEditForm((f) => ({ ...f, scoreA: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span className="pill-label">Score B</span>
                  <input
                    type="number"
                    value={editForm.scoreB}
                    onChange={(e) => setEditForm((f) => ({ ...f, scoreB: e.target.value }))}
                  />
                </label>
              </div>
              <div className="controls-row" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-primary" type="button" onClick={saveEdit}>
                  Save match
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function TournamentsPage() {
  return (
    <AdminProvider>
      <TournamentBuilder />
    </AdminProvider>
  );
}
