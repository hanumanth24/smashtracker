'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { useCollection } from "../hooks/useCollection.js";
import { useAdmin } from "../context/AdminContext.jsx";

const formatTags = [
  "Single Elimination",
  "Double Elimination",
  "Round Robin",
  "Group Stage → Knockout",
  "Custom Layout",
];

const formatLabelMap = {
  "round-robin": "Round Robin",
  knockout: "Knockout",
  "double-elim": "Double Elimination",
  hybrid: "Hybrid",
};

const statusBadges = [
  { tone: "blue", label: "Upcoming", icon: "🔵" },
  { tone: "amber", label: "Warm-up", icon: "🟠" },
  { tone: "fire", label: "Live", icon: "🔥" },
  { tone: "green", label: "Completed", icon: "🟢" },
];

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function winPct(wins = 0, losses = 0) {
  const total = wins + losses;
  if (!total) return 0;
  return Math.round((wins / total) * 100);
}

function buildRounds(matches = [], teams = [], players = []) {
  if (!matches.length) return [];
  const teamName = (id) => {
    const team = teams.find((t) => t.id === id);
    if (!team) return "";
    const playerNames = (team.playerIds || [])
      .map((pid) => players.find((p) => p.id === pid)?.name)
      .filter(Boolean);
    if (playerNames.length) return playerNames.join(" & ");
    return team.name || "";
  };
  const sorted = [...matches].sort((a, b) => {
    if ((a.round || 0) === (b.round || 0)) return (a.order || 0) - (b.order || 0);
    return (a.round || 0) - (b.round || 0);
  });
  const grouped = new Map();
  sorted.forEach((m) => {
    const label =
      m.roundLabel ||
      (m.round ? `Round ${m.round}` : m.group ? `Group ${m.group}` : `Round ${Math.floor((m.order || 0) / 2) + 1}`);
    const list = grouped.get(label) || [];
    list.push({
      ...m,
      displayTeamA: teamName(m.teamAId) || m.seedA || "TBD",
      displayTeamB: teamName(m.teamBId) || m.seedB || "TBD",
    });
    grouped.set(label, list);
  });
  return Array.from(grouped.entries()).map(([name, list], idx) => ({
    name,
    depth: `${-12 * idx}px`,
    matches: list,
  }));
}

export default function FuturisticShowcase() {
  const playersRef = useMemo(() => collection(db, "nrrcPlayers"), []);
  const teamsRef = useMemo(() => collection(db, "tournamentTeams"), []);
  const matchesRef = useMemo(() => collection(db, "tournamentMatches"), []);
  const pendingRef = useMemo(() => collection(db, "pendingRequests"), []);
  const historyRef = useMemo(() => collection(db, "tournamentHistory"), []);
  const projectionStateRef = useMemo(() => doc(collection(db, "tournamentProjection"), "current"), []);

  const players = useCollection(playersRef, "players");
  const teams = useCollection(teamsRef, "tournamentTeams");
  const matches = useCollection(matchesRef, "tournamentMatches");
  const pending = useCollection(pendingRef, "pendingRequests");
  const history = useCollection(historyRef, "tournamentHistory");
  const { showNotification } = useAdmin();

  const [name, setName] = useState("");
  const [tournamentName, setTournamentName] = useState("");
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingFields, setEditingFields] = useState({ name: "" });
  const [beamMatch, setBeamMatch] = useState(null);
  const [format, setFormat] = useState("round-robin");
  const [hybridGroupSize, setHybridGroupSize] = useState(4);
  const [isEnding, setIsEnding] = useState(false);
  const [scoreDrafts, setScoreDrafts] = useState({});
  const [nextPhaseMode, setNextPhaseMode] = useState("auto");
  const [projectionScores, setProjectionScores] = useState({});
  const [projectionLoaded, setProjectionLoaded] = useState(false);
  const [isEndingGroup, setIsEndingGroup] = useState(false);
  const [matchStatusFilter, setMatchStatusFilter] = useState("all");
  const [matchTeamFilter, setMatchTeamFilter] = useState("");
  const saveTimers = useRef({});
  const [scoresLocked, setScoresLocked] = useState(false);
  const [storedLockPin, setStoredLockPin] = useState("1234");
  const [lockError, setLockError] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinEntry, setPinEntry] = useState("");
  const [pinModalError, setPinModalError] = useState("");
  const [projectionHydrated, setProjectionHydrated] = useState(false);
  const [modalMode, setModalMode] = useState("unlock");
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const historyTeamsMap = useMemo(() => {
    if (!selectedHistory?.teams) return new Map();
    const map = new Map();
    selectedHistory.teams.forEach((t) => {
      if (t.id) map.set(t.id, t.name || "Team");
    });
    return map;
  }, [selectedHistory]);

  const topPlayer = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
      const aPct = winPct(a.points || 0, a.losses || 0);
      const bPct = winPct(b.points || 0, b.losses || 0);
      return bPct - aPct;
    });
    return sorted[0];
  }, [players]);

  const todayMatches = useMemo(() => {
    const today = new Date().toDateString();
    return matches.filter((m) => {
      const raw = m.createdAt || m.time;
      const d = raw?.toDate ? raw.toDate() : new Date(raw || 0);
      return d.toDateString() === today;
    }).length;
  }, [matches]);

  const liveCount = useMemo(
    () => matches.filter((m) => (m.status || "").toLowerCase() === "live").length,
    [matches]
  );

  const completedMatches = useMemo(
    () => matches.filter((m) => (m.status || "").toLowerCase() === "finished").length,
    [matches]
  );
  const totalMatches = matches.length;
  const completionPct = totalMatches ? Math.round((completedMatches / totalMatches) * 100) : 0;
  const allRoundRobinFinished = format === "round-robin" && matches.length > 0 && matches.every((m) => (m.status || "").toLowerCase() === "finished");

  const analyticsItems = useMemo(
    () => [
      { title: "Players", value: `${players.length} roster`, accent: "cyan" },
      { title: "Tournament teams", value: `${teams.length || 0} ready`, accent: "violet" },
      {
        title: "Top player",
        value: topPlayer ? `${topPlayer.name} (${winPct(topPlayer.points || 0, topPlayer.losses || 0)}%)` : "—",
        accent: "green",
      },
      { title: "Matches today", value: `${todayMatches}`, accent: "amber" },
      { title: "Live matches", value: `${liveCount}`, accent: "orange" },
      { title: "Pending requests", value: `${pending.length}`, accent: "pink" },
    ],
    [players, teams, topPlayer, todayMatches, liveCount, pending]
  );

  const filteredMatches = useMemo(() => {
    const teamFilter = matchTeamFilter.trim().toLowerCase();
    return matches.filter((m) => {
      const statusOk =
        matchStatusFilter === "all" ||
        (m.status || "").toLowerCase() === matchStatusFilter.toLowerCase();
      if (!statusOk) return false;
      if (!teamFilter) return true;
      const teamA = teams.find((t) => t.id === m.teamAId);
      const teamB = teams.find((t) => t.id === m.teamBId);
      const tA = teamA?.name?.toLowerCase() || "";
      const tB = teamB?.name?.toLowerCase() || "";
      const playersA = (teamA?.playerIds || [])
        .map((pid) => players.find((p) => p.id === pid)?.name?.toLowerCase() || "")
        .join(" ");
      const playersB = (teamB?.playerIds || [])
        .map((pid) => players.find((p) => p.id === pid)?.name?.toLowerCase() || "")
        .join(" ");
      return tA.includes(teamFilter) || tB.includes(teamFilter) || playersA.includes(teamFilter) || playersB.includes(teamFilter);
    });
  }, [matches, teams, players, matchStatusFilter, matchTeamFilter]);

  const rounds = useMemo(() => buildRounds(filteredMatches, teams, players), [filteredMatches, teams, players]);

  const labelForTeam = (team) => {
    if (!team) return "";
    const playerNames = (team.playerIds || [])
      .map((pid) => players.find((p) => p.id === pid)?.name)
      .filter(Boolean);
    if (playerNames.length) return playerNames.join(" & ");
    return team.name || "";
  };
  const scoreTotals = useMemo(() => {
    const map = new Map();
    teams.forEach((t) => map.set(t.id, { for: 0, against: 0 }));
    matches.forEach((m) => {
      if (!m.teamAId || !m.teamBId) return;
      const sA = Number(m.scoreA || 0);
      const sB = Number(m.scoreB || 0);
      const a = map.get(m.teamAId) || { for: 0, against: 0 };
      const b = map.get(m.teamBId) || { for: 0, against: 0 };
      a.for += sA;
      a.against += sB;
      b.for += sB;
      b.against += sA;
      map.set(m.teamAId, a);
      map.set(m.teamBId, b);
    });
    return map;
  }, [teams, matches]);

  useEffect(() => {
    const timers = saveTimers.current || {};
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const localName = localStorage.getItem("tournamentName");
    if (localName && !tournamentName) {
      setTournamentName(localName);
    }
  }, [tournamentName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("tournamentName", tournamentName || "");
  }, [tournamentName]);

  useEffect(() => {
    // lock state persisted via Firestore projection doc
  }, [scoresLocked, storedLockPin]);

  const derivedStats = useMemo(() => {
    const map = new Map();
    teams.forEach((t) =>
      map.set(t.id, {
        wins: 0,
        losses: 0,
        points: 0,
        played: 0,
      })
    );
    matches.forEach((m) => {
      const aId = m.teamAId;
      const bId = m.teamBId;
      if (!aId || !bId) return;
      const a = map.get(aId);
      const b = map.get(bId);
      if (!a || !b) return;
      const status = (m.status || "").toLowerCase();
      if (status !== "finished" && status !== "completed") return;
      const sA = Number(m.scoreA || 0);
      const sB = Number(m.scoreB || 0);
      if (sA === sB) return;
      const aWin = sA > sB;
      const winner = aWin ? a : b;
      const loser = aWin ? b : a;
      winner.wins += 1;
      winner.points += 2;
      loser.losses += 1;
    });
    map.forEach((v) => {
      v.played = v.wins + v.losses;
    });
    return map;
  }, [teams, matches]);

  const sortedTeams = useMemo(() => {
    const copy = [...teams];
    copy.sort((a, b) => {
      const aDerived = derivedStats.get(a.id) || {};
      const bDerived = derivedStats.get(b.id) || {};
      const aPoints = aDerived.points ?? a.points ?? 0;
      const bPoints = bDerived.points ?? b.points ?? 0;
      if (bPoints === aPoints) {
        const aWins = aDerived.wins ?? a.wins ?? 0;
        const bWins = bDerived.wins ?? b.wins ?? 0;
        if (bWins === aWins) {
          const aDiff = (scoreTotals.get(a.id)?.for || 0) - (scoreTotals.get(a.id)?.against || 0);
          const bDiff = (scoreTotals.get(b.id)?.for || 0) - (scoreTotals.get(b.id)?.against || 0);
          return bDiff - aDiff;
        }
        return bWins - aWins;
      }
      return bPoints - aPoints;
    });
    return copy;
  }, [teams, derivedStats, scoreTotals]);

  const knockoutSeeds = useMemo(() => {
    const limit = nextPhaseMode === "final" ? 2 : 4;
    return sortedTeams.slice(0, Math.min(sortedTeams.length, limit));
  }, [sortedTeams, nextPhaseMode]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(projectionStateRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data?.scores) setProjectionScores(data.scores);
          if (data?.mode) setNextPhaseMode(data.mode);
          if (data?.tournamentName) {
            setTournamentName(data.tournamentName);
            if (typeof window !== "undefined") localStorage.setItem("tournamentName", data.tournamentName);
          } else if (typeof window !== "undefined") {
            const localName = localStorage.getItem("tournamentName");
            if (localName) setTournamentName(localName);
          }
          if (data?.lockPin) {
            setStoredLockPin(data.lockPin);
            setScoresLocked(!!data.locked);
          }
        }
        setProjectionHydrated(true);
      } catch (err) {
        console.error("Failed to load projection state", err);
      } finally {
        setProjectionLoaded(true);
      }
    })();
  }, [projectionStateRef]);

  useEffect(() => {
    if (!projectionLoaded || !projectionHydrated) return;
    (async () => {
      try {
        await setDoc(
          projectionStateRef,
          {
            scores: projectionScores,
            mode: nextPhaseMode,
            tournamentName: tournamentName || "Tournament",
            lockPin: storedLockPin,
            locked: scoresLocked,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error("Failed to persist projection state", err);
        showNotification("Could not sync semi/final scores to Firestore.", "error", 2000);
      }
    })();
  }, [projectionScores, nextPhaseMode, projectionLoaded, projectionHydrated, projectionStateRef, showNotification, tournamentName, storedLockPin, scoresLocked]);

  const addPlayer = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addDoc(playersRef, {
      name: trimmed,
      points: 0,
      losses: 0,
      createdAt: serverTimestamp(),
    })
      .then(() => {
        setName("");
        showNotification("Player added.", "success", 2000);
      })
      .catch((err) => {
        console.error(err);
        showNotification("Failed to add player.", "error", 2000);
      });
  };

  const startEditPlayer = (p) => {
    setEditingPlayer(p.id);
    setEditingFields({ name: p.name || "" });
  };

  const savePlayer = () => {
    if (!editingPlayer) return;
    updateDoc(doc(playersRef, editingPlayer), {
      name: editingFields.name || "Player",
    })
      .then(() => {
        setEditingPlayer(null);
        showNotification("Player updated.", "success", 2000);
      })
      .catch((err) => {
        console.error(err);
        showNotification("Failed to update player.", "error", 2000);
      });
  };

  const removePlayer = (id) => {
    deleteDoc(doc(playersRef, id))
      .then(() => showNotification("Player removed.", "info", 2000))
      .catch((err) => {
        console.error(err);
        showNotification("Failed to remove player.", "error", 2000);
      });
  };

  const saveMatches = (newMatches, successMessage) => {
    if (!newMatches || !newMatches.length) {
      showNotification("No matches to save.", "error", 2000);
      return;
    }
    (async () => {
      try {
        const batch = writeBatch(db);
        matches.forEach((m) => batch.delete(doc(matchesRef, m.id)));
        newMatches.forEach((m) => {
          const ref = doc(matchesRef);
          batch.set(ref, { ...m, createdAt: serverTimestamp() });
        });
        await batch.commit();
        showNotification(successMessage || "Matches generated.", "success", 2000);
      } catch (err) {
        console.error(err);
        showNotification("Failed to generate matches.", "error", 2000);
      }
    })();
  };

  const generateRoundRobinMatches = () => {
    if (teams.length < 2) {
      showNotification("Need at least 2 teams for round robin.", "error", 2000);
      return;
    }

    const ids = shuffle(teams).map((t) => t.id);
    if (ids.length % 2 !== 0) ids.push(null); // add bye to balance rounds

    const roundsPairs = [];
    let arr = [...ids];
    const roundsCount = arr.length - 1;

    for (let r = 0; r < roundsCount; r++) {
      const pairs = [];
      for (let i = 0; i < arr.length / 2; i++) {
        const a = arr[i];
        const b = arr[arr.length - 1 - i];
        if (a && b) {
          pairs.push([a, b]);
        }
      }
      roundsPairs.push(pairs);
      const fixed = arr[0];
      const rest = arr.slice(1);
      rest.unshift(rest.pop());
      arr = [fixed, ...rest];
    }

    let order = 1;
    const next = [];
    roundsPairs.forEach((pairs, idx) => {
      pairs.forEach(([a, b]) => {
        next.push({
          teamAId: a,
          teamBId: b,
          status: "upcoming",
          round: idx + 1,
          roundLabel: `Round ${idx + 1}`,
          order: order++,
          scoreA: 0,
          scoreB: 0,
        });
      });
    });

    saveMatches(next, "Round-robin schedule generated.");
    resetProjectionState();
  };

  const labelForSize = (size) => {
    if (size >= 16) return `Round of ${size}`;
    if (size === 8) return "Quarter-finals";
    if (size === 4) return "Semi-finals";
    if (size === 2) return "Final";
    return "Round";
  };

  const generateKnockoutMatches = () => {
    if (teams.length < 2) {
      showNotification("Need at least 2 teams for knockout.", "error", 2000);
      return;
    }
    const ordered = [...teams].sort((a, b) => (b.points || 0) - (a.points || 0));
    let seeds = ordered.map((t) => t.id);
    let round = 1;
    let order = 1;
    const next = [];

    while (seeds.length > 1) {
      const label = labelForSize(seeds.length);
      const newSeeds = [];
      for (let i = 0; i < seeds.length; i += 2) {
        const a = seeds[i];
        const b = seeds[i + 1];
        const match = {
          teamAId: a || null,
          teamBId: b || null,
          status: "upcoming",
          round,
          roundLabel: label,
          order: order++,
          scoreA: 0,
          scoreB: 0,
          seedA: a ? null : `Winner ${label} M${i + 1}`,
          seedB: b ? null : `Winner ${label} M${i + 2}`,
        };
        next.push(match);
        newSeeds.push(null); // placeholder winners for next round
      }
      seeds = newSeeds;
      round += 1;
    }
    saveMatches(next, "Knockout bracket generated.");
    resetProjectionState();
  };

  const generateHybrid = () => {
    if (teams.length < 3) {
      showNotification("Need at least 3 teams for hybrid.", "error", 2000);
      return;
    }
    const size = Math.max(3, hybridGroupSize);
    const shuffled = shuffle(teams);
    const groups = [];
    for (let i = 0; i < shuffled.length; i += size) {
      groups.push(shuffled.slice(i, i + size));
    }

    let order = 1;
    const next = [];
    groups.forEach((g, idx) => {
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          next.push({
            teamAId: g[i].id,
            teamBId: g[j].id,
            status: "upcoming",
            round: 1,
            roundLabel: `Group ${idx + 1}`,
            group: idx + 1,
            order: order++,
            scoreA: 0,
            scoreB: 0,
          });
        }
      }
    });

    // Placeholder knockout semifinals using group winners
    if (groups.length >= 2) {
      next.push({
        teamAId: null,
        teamBId: null,
        seedA: "Winner Group 1",
        seedB: "Winner Group 2",
        status: "upcoming",
        round: 2,
        roundLabel: "Semi-finals",
        order: order++,
        scoreA: 0,
        scoreB: 0,
      });
    }
    if (groups.length >= 4) {
      next.push({
        teamAId: null,
        teamBId: null,
        seedA: "Winner Group 3",
        seedB: "Winner Group 4",
        status: "upcoming",
        round: 2,
        roundLabel: "Semi-finals",
        order: order++,
        scoreA: 0,
        scoreB: 0,
      });
    }
    next.push({
      teamAId: null,
      teamBId: null,
      seedA: "Winner SF 1",
      seedB: "Winner SF 2",
      status: "upcoming",
      round: 3,
      roundLabel: "Final",
      order: order++,
      scoreA: 0,
      scoreB: 0,
    });

    saveMatches(next, "Hybrid groups + knockout placeholders generated.");
    resetProjectionState();
  };

  const endTournament = async () => {
    if (!teams.length && !matches.length) {
      showNotification("Nothing to archive. Add teams or matches first.", "error", 2000);
      return;
    }
    setIsEnding(true);
    try {
      const standings = sortedTeams.map((t, idx) => {
        const totals = scoreTotals.get(t.id) || { for: 0, against: 0 };
        const derived = derivedStats.get(t.id) || {};
        const wins = derived.wins ?? t.wins ?? 0;
        const losses = derived.losses ?? t.losses ?? 0;
        const points = derived.points ?? t.points ?? 0;
        const played = derived.played ?? wins + losses;
        return {
          rank: idx + 1,
          name: t.name,
          playerIds: t.playerIds || [],
          wins,
          losses,
          played,
          points,
          scoreFor: totals.for,
          scoreAgainst: totals.against,
        };
      });

      const snapshot = {
        endedAt: serverTimestamp(),
        tournamentName: tournamentName || "Tournament",
        format,
        teamCount: teams.length,
        matchCount: matches.length,
        completedMatches,
        completionPct,
        teams: teams.map((t) => {
          const derived = derivedStats.get(t.id) || {};
          return {
            name: t.name,
            playerIds: t.playerIds || [],
            wins: derived.wins ?? t.wins ?? 0,
            losses: derived.losses ?? t.losses ?? 0,
            points: derived.points ?? t.points ?? 0,
            played: derived.played ?? undefined,
          };
        }),
        matches: matches.map((m) => ({
          teamAId: m.teamAId || null,
          teamBId: m.teamBId || null,
          winnerTeamId: m.winnerTeamId || null,
          status: m.status || "unknown",
          scoreA: m.scoreA ?? null,
          scoreB: m.scoreB ?? null,
          round: m.round || null,
          roundLabel: m.roundLabel || null,
          order: m.order || null,
          court: m.court || "",
          time: m.time || null,
        })),
        standings,
        winner: standings[0]?.name || null,
        runnerUp: standings[1]?.name || null,
      };

      const batch = writeBatch(db);
      const historyDoc = doc(historyRef);
      batch.set(historyDoc, snapshot);
      teams.forEach((t) => batch.delete(doc(teamsRef, t.id)));
      matches.forEach((m) => batch.delete(doc(matchesRef, m.id)));
      await batch.commit();
      showNotification("Tournament archived to history.", "success", 2000);
    } catch (err) {
      console.error(err);
      showNotification("Failed to end tournament.", "error", 2000);
    } finally {
      setIsEnding(false);
    }
  };

  const endRoundRobinStage = async () => {
    if (!allRoundRobinFinished) {
      showNotification("Finish all round robin matches first.", "error", 2000);
      return;
    }
    setIsEndingGroup(true);
    try {
      const standingsSnapshot = sortedTeams.map((t, idx) => {
        const totals = scoreTotals.get(t.id) || { for: 0, against: 0 };
        const derived = derivedStats.get(t.id) || {};
        const wins = derived.wins ?? t.wins ?? 0;
        const losses = derived.losses ?? t.losses ?? 0;
        const points = derived.points ?? t.points ?? 0;
        const played = derived.played ?? wins + losses;
        return {
          rank: idx + 1,
          name: t.name,
          playerIds: t.playerIds || [],
          wins,
          losses,
          played,
          points,
          scoreFor: totals.for,
          scoreAgainst: totals.against,
        };
      });
      const snapshot = {
        endedAt: serverTimestamp(),
        tournamentName: tournamentName || "Tournament",
        stage: "round-robin",
        format,
        teamCount: teams.length,
        matchCount: matches.length,
        completedMatches,
        completionPct,
        standings: standingsSnapshot,
      };
      await addDoc(historyRef, snapshot);
      showNotification("Round robin stage archived.", "success", 2000);
    } catch (err) {
      console.error(err);
      showNotification("Failed to archive round robin.", "error", 2000);
    } finally {
      setIsEndingGroup(false);
    }
  };

  const generateTeamsAndSave = () => {
    const ids = players.map((p) => p.id);
    if (ids.length < 2) {
      showNotification("Add at least 2 players to form teams.", "error", 2000);
      return;
    }
    const shuffled = shuffle(ids);
    const pairs = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      const a = shuffled[i];
      const b = shuffled[i + 1];
      const p1 = players.find((p) => p.id === a);
      const p2 = players.find((p) => p.id === b);
      if (p1 && p2) {
        pairs.push({ name: `${p1.name} & ${p2.name}`, ids: [p1.id, p2.id] });
      }
    }
    if (!pairs.length) {
      showNotification("Could not form full pairs.", "error", 2000);
      return;
    }

    (async () => {
      try {
        const batch = writeBatch(db);
        teams.forEach((t) => batch.delete(doc(teamsRef, t.id)));
        matches.forEach((m) => batch.delete(doc(matchesRef, m.id)));
        pairs.forEach((pair) => {
          const ref = doc(teamsRef);
          batch.set(ref, {
            name: pair.name,
            playerIds: pair.ids,
            wins: 0,
            losses: 0,
            points: 0,
            createdAt: serverTimestamp(),
          });
        });
        await batch.commit();
        showNotification("Tournament teams generated from live players.", "success", 2000);
        resetProjectionState();
      } catch (err) {
        console.error(err);
        showNotification("Failed to generate teams.", "error", 2000);
      }
    })();
  };

  const deleteHistoryEntry = (historyId) => {
    if (!historyId) return;
    setModalMode("delete");
    setDeleteTargetId(historyId);
    setPinEntry("");
    setPinModalError("");
    setShowPinModal(true);
  };

  const queueInlineSave = (matchId, draft) => {
    if (scoresLocked) {
      setLockError("Scores are locked. Unlock with PIN to edit.");
      showNotification("Scores locked. Unlock to edit.", "error", 1500);
      return;
    }
    if (saveTimers.current[matchId]) {
      clearTimeout(saveTimers.current[matchId]);
    }
    saveTimers.current[matchId] = setTimeout(() => {
      saveInlineScores(matchId, draft);
    }, 350);
  };

  const handleLockToggle = () => {
    if (!allRoundRobinFinished) {
      setLockError("Locking is available after all round robin matches are finished.");
      showNotification("Finish all round robin matches first.", "error", 1800);
      return;
    }
    if (scoresLocked) {
      setModalMode("unlock");
      setPinEntry("");
      setPinModalError("");
      setShowPinModal(true);
      return;
    }
    setScoresLocked(true);
    setLockError("");
    showNotification("Scores locked. Use admin PIN to unlock.", "success", 1800);
  };

  const confirmPinAction = async () => {
    if (!pinEntry) {
      setPinModalError("PIN required to unlock.");
      return;
    }
    if (pinEntry !== storedLockPin) {
      setPinModalError("Incorrect PIN.");
      return;
    }
    if (modalMode === "unlock") {
      setScoresLocked(false);
      setShowPinModal(false);
      setPinModalError("");
      setPinEntry("");
      showNotification("Scores unlocked.", "success", 1500);
    } else if (modalMode === "delete" && deleteTargetId) {
      try {
        await deleteDoc(doc(historyRef, deleteTargetId));
        showNotification("Archive deleted.", "success", 1500);
      } catch (err) {
        console.error(err);
        showNotification("Failed to delete archive.", "error", 1800);
      } finally {
        setShowPinModal(false);
        setPinModalError("");
        setPinEntry("");
        setDeleteTargetId(null);
      }
    }
  };

  const resetProjectionState = async () => {
    setProjectionScores({});
    setScoresLocked(false);
    setStoredLockPin("1234");
    setTournamentName("");
    try {
      await setDoc(
        projectionStateRef,
        {
          scores: {},
          mode: "auto",
          tournamentName: "",
          lockPin: "1234",
          locked: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Failed to reset projection state", err);
    }
  };

  const saveInlineScores = (matchId, overrideDraft = null) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const draft = overrideDraft || scoreDrafts[matchId] || {};
    const scoreA = Number(draft.scoreA ?? match.scoreA ?? 0);
    const scoreB = Number(draft.scoreB ?? match.scoreB ?? 0);
    const winnerTeamId = scoreA === scoreB ? null : scoreA > scoreB ? match.teamAId : match.teamBId;
    const status = winnerTeamId ? "finished" : "scheduled";

    (async () => {
      try {
        const matchRef = doc(matchesRef, matchId);
        const prevSnap = await getDoc(matchRef);
        const prev = prevSnap.exists() ? prevSnap.data() : {};
        const batch = writeBatch(db);

        const adjustTeam = (teamId, winDelta, lossDelta, pointDelta) => {
          if (!teamId) return;
          batch.set(
            doc(teamsRef, teamId),
            { wins: increment(winDelta), losses: increment(lossDelta), points: increment(pointDelta) },
            { merge: true }
          );
        };

        if (prev.winnerTeamId && prev.status === "finished") {
          const prevLoser = prev.winnerTeamId === prev.teamAId ? prev.teamBId : prev.teamAId;
          adjustTeam(prev.winnerTeamId, -1, 0, -2);
          adjustTeam(prevLoser, 0, -1, 0);
        }

        if (winnerTeamId) {
          const loserId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
          adjustTeam(winnerTeamId, 1, 0, 2);
          adjustTeam(loserId, 0, 1, 0);
        }

        batch.update(matchRef, {
          scoreA,
          scoreB,
          status,
          winnerTeamId: winnerTeamId || null,
        });

        await batch.commit();
        setScoreDrafts((prev) => ({ ...prev, [matchId]: { scoreA, scoreB } }));
        setBeamMatch(matchId);
        setTimeout(() => setBeamMatch(null), 1400);
        showNotification("Match updated in Firestore.", "success", 2000);
      } catch (err) {
        console.error(err);
        showNotification("Failed to update match.", "error", 2000);
      }
    })();
  };

  return (
    <div className="immersive-wrap">
      {/* Hero removed per request */}

      <section className="section-shell">
        <div className="section-label">Tournament & Player Setup</div>
        <h2>Manual entry, realtime lists, and Firestore-backed team generation</h2>
        <div className="panel-grid">
          <div className="panel-4d">
            <div className="panel-head">
              <span className="pill-chip">Player Entry</span>
              <div className="pill-chip ghost" role="status">Unlimited · Edit · Delete</div>
            </div>
            <form
              className="input-row"
              onSubmit={(e) => {
                e.preventDefault();
                addPlayer();
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Add player name"
              />
              <button type="submit" className="btn btn-primary">
                Add Player (Firestore)
              </button>
            </form>
            <div className="player-list-4d">
              {players.length === 0 ? (
                <div className="muted">No players yet. Add above.</div>
              ) : (
                players.map((p) => (
                  <div key={p.id} className="player-chip-4d">
                    <div style={{ flex: 1 }}>
                      {editingPlayer === p.id ? (
                        <input
                          value={editingFields.name}
                          onChange={(e) => setEditingFields((f) => ({ ...f, name: e.target.value }))}
                          style={{ width: "100%", marginBottom: 6 }}
                        />
                      ) : (
                        <strong>{p.name}</strong>
                      )}
                    </div>
                    {editingPlayer === p.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="btn btn-primary" onClick={savePlayer}>Save</button>
                        <button type="button" className="btn btn-ghost" onClick={() => setEditingPlayer(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="ghost-link" onClick={() => startEditPlayer(p)}>
                          Edit
                        </button>
                        <button type="button" className="ghost-link" onClick={() => removePlayer(p.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel-4d">
            <div className="panel-head">
              <span className="pill-chip">Teams (live)</span>
              <div className="pill-chip ghost" role="status">Firestore tournament teams</div>
            </div>
            <div className="input-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={generateTeamsAndSave}>
                Random doubles teams (save)
              </button>
              <div className="muted">Uses all players; shuffle animation, 3D flip, holographic glow on lock.</div>
            </div>
            <div className="teams-rail" data-shuffle={teams.length}>
              {teams.length === 0 ? (
                <div className="muted">No tournament teams yet.</div>
              ) : (
                teams.map((t) => (
                  <div key={t.id} className="team-card-4d">
                    <div className="card-front">
                      <div className="pill-label">{t.name}</div>
                      <div className="team-name">
                        {(t.playerIds || []).map((id) => players.find((p) => p.id === id)?.name || "Player").join(" · ")}
                      </div>
                    </div>
                    <div className="card-back">
                      <div className="pill-label">Record</div>
                      <div className="team-name glow">
                        {(() => {
                          const derived = derivedStats.get(t.id) || {};
                          const wins = derived.wins ?? t.wins ?? 0;
                          const losses = derived.losses ?? t.losses ?? 0;
                          const points = derived.points ?? t.points ?? 0;
                          return `${wins}W / ${losses}L · ${points} pts`;
                        })()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="section-label">Scheduling</div>
        <h2>Generate live schedules: round robin, knockout, or hybrid</h2>
        <div className="panel-4d">
          <div className="input-row" style={{ alignItems: "center" }}>
            <label className="pill-label" style={{ color: "#cbd5e1" }}>Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="round-robin">Round Robin</option>
              <option value="knockout">Knockout</option>
              <option value="hybrid">Hybrid (Groups → KO)</option>
            </select>
            {format === "hybrid" && (
              <input
                type="number"
                min={3}
                max={6}
                value={hybridGroupSize}
                onChange={(e) => setHybridGroupSize(Number(e.target.value))}
                placeholder="Group size"
                style={{ width: 120 }}
              />
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (format === "round-robin") generateRoundRobinMatches();
                else if (format === "knockout") generateKnockoutMatches();
                else generateHybrid();
              }}
            >
              Generate schedule
            </button>
            <div className="muted">Deletes existing matches, writes new schedule to Firestore.</div>
          </div>
        </div>
      </section>

      <section className="section-shell" id="bracket-4d">
        <div className="section-label">4D Bracket System</div>
        <h2>Layered rounds with live status bands</h2>
        <div className="panel-4d" style={{ overflow: "visible" }}>
          <div className="input-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <span className="pill-chip ghost">Filter status</span>
            <select value={matchStatusFilter} onChange={(e) => setMatchStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="upcoming">Upcoming</option>
              <option value="live">Live</option>
              <option value="finished">Finished</option>
              <option value="completed">Completed</option>
            </select>
            <input
              type="text"
              placeholder="Search team"
              value={matchTeamFilter}
              onChange={(e) => setMatchTeamFilter(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.45)",
                background: "rgba(15,23,42,0.9)",
                color: "#e5e7eb",
                minWidth: 180,
              }}
            />
          </div>
          <div className="panel-head" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="pill-chip">Format: {formatLabelMap[format] || "Custom"}</span>
              <span className="pill-chip ghost">Matches: {completedMatches}/{totalMatches || 0}</span>
              <span className="pill-chip ghost">Live: {liveCount}</span>
              <input
                type="text"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder="Tournament name"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.45)",
                  background: "rgba(15,23,42,0.9)",
                  color: "#e5e7eb",
                  minWidth: 180,
                }}
              />
            </div>
            <div style={{ minWidth: 200 }}>
              <div className="bar-track" style={{ height: 8 }}>
                <div className="bar-fill" style={{ width: `${completionPct}%`, height: 8 }} />
              </div>
              <div className="muted" style={{ fontSize: 11 }}>{completionPct}% complete</div>
            </div>
          </div>
          <div className="input-row" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="pill-chip ghost">Score lock</span>
            <button
              type="button"
              className={`btn ${scoresLocked ? "btn-ghost" : "btn-primary"}`}
              onClick={handleLockToggle}
              disabled={!allRoundRobinFinished}
              title={!allRoundRobinFinished ? "Finish all round-robin matches to lock scores" : ""}
            >
              {scoresLocked ? "Unlock scores" : "Lock scores"}
            </button>
            <div className="muted" style={{ fontSize: 12 }}>
              {allRoundRobinFinished
                ? scoresLocked
                  ? "Locked — inline edits disabled. Admin PIN required via popup to unlock."
                  : "Anyone can lock; admin PIN required via popup to unlock."
                : "Locking is enabled after all round-robin matches are finished."}
            </div>
            {lockError && <div className="pill-chip" style={{ background: "rgba(239,68,68,0.18)", borderColor: "rgba(239,68,68,0.5)", color: "#fecdd3" }}>{lockError}</div>}
          </div>
          <div
            className="bracket-4d"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "8px 4px",
            }}
          >
            {rounds.length === 0 ? (
              <div className="muted">No tournament matches yet. Generate a schedule in admin.</div>
            ) : (
              rounds.flatMap((round, rIdx) =>
                round.matches.map((m, mIdx) => {
                  const draft = scoreDrafts[m.id] || {};
                  const scoreAVal = draft.scoreA ?? (m.scoreA ?? "");
                  const scoreBVal = draft.scoreB ?? (m.scoreB ?? "");
                  const winnerId = m.winnerTeamId
                    ? m.winnerTeamId
                    : m.scoreA !== m.scoreB
                    ? m.scoreA > m.scoreB
                      ? m.teamAId
                      : m.teamBId
                    : null;
                  const winnerName = m.winnerTeamId
                    ? teams.find((t) => t.id === m.winnerTeamId)?.name
                    : m.scoreA !== m.scoreB
                    ? m.scoreA > m.scoreB
                      ? m.displayTeamA
                      : m.displayTeamB
                    : null;
                      return (
                    <div
                      key={m.id}
                      className={`match-node ${beamMatch === m.id ? "beam-active" : ""}`}
                      style={{ alignItems: "flex-start", gap: 10 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span className={`status-dot status-${(m.status || "upcoming").toLowerCase()}`} style={{ padding: "2px 8px" }}>
                            {m.status || "Upcoming"}
                          </span>
                          <span className="muted" style={{ fontSize: 11 }}>
                            #{m.order || mIdx + 1}
                          </span>
                        </div>
                      </div>

                      <div className="scoreboard-bar">
                        <div className="scoreboard-side left">
                          {winnerId && winnerId === m.teamAId && (
                            <>
                              <span className="winner-icon-inline winner-desktop">WIN</span>
                            </>
                          )}
                          <span>{m.displayTeamA}</span>
                        </div>
                        <div className="scoreboard-center">
                          <div className="score-input-wrap">
                            <input
                              type="number"
                              value={scoreAVal}
                              disabled={scoresLocked}
                              onChange={(e) =>
                                setScoreDrafts((prev) => {
                                  const nextDraft = { ...prev[m.id], scoreA: e.target.value };
                                  queueInlineSave(m.id, nextDraft);
                                  return { ...prev, [m.id]: nextDraft };
                                })
                              }
                              className="scoreboard-input"
                              placeholder="0"
                            />
                          </div>
                          <span className="score-mid">-</span>
                          <div className="score-input-wrap">
                            <input
                              type="number"
                              value={scoreBVal}
                              disabled={scoresLocked}
                              onChange={(e) =>
                                setScoreDrafts((prev) => {
                                  const nextDraft = { ...prev[m.id], scoreB: e.target.value };
                                  queueInlineSave(m.id, nextDraft);
                                  return { ...prev, [m.id]: nextDraft };
                                })
                              }
                              className="scoreboard-input"
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div className="scoreboard-side right">
                          {winnerId && winnerId === m.teamBId && (
                            <>
                              <span className="winner-icon-inline winner-desktop">WIN</span>
                            </>
                          )}
                          <span>{m.displayTeamB}</span>
                        </div>
                      </div>

                      <div className="node-meta" style={{ width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                        <div />
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="section-label">Points Table</div>
        <h2>Live tournament standings</h2>
        <div className="panel-4d">
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
                  <th>Score Won</th>
                  <th>Score Lost</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeams.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">No tournament teams yet.</td>
                  </tr>
                ) : (
                  sortedTeams.map((t, idx) => {
                    const derived = derivedStats.get(t.id) || {};
                    const wins = derived.wins ?? t.wins ?? 0;
                    const losses = derived.losses ?? t.losses ?? 0;
                    const played = derived.played ?? wins + losses;
                    const points = derived.points ?? t.points ?? 0;
                    const playersNames = (t.playerIds || [])
                      .map((id) => players.find((p) => p.id === id)?.name || "Player")
                      .join(" & ");
                    return (
                      <tr key={t.id} className={idx < 2 ? "top-two" : ""}>
                        <td>{idx + 1}</td>
                        <td>{labelForTeam(t)}</td>
                        <td>{playersNames}</td>
                        <td>{played}</td>
                        <td>{wins}</td>
                        <td>{losses}</td>
                        <td>{points}</td>
                        <td>{scoreTotals.get(t.id)?.for || 0}</td>
                        <td>{scoreTotals.get(t.id)?.against || 0}</td>
                      </tr>
                    );
                  })
              )}
            </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="section-label">Knockout Projection</div>
        <h2>Next-phase bracket</h2>
        <div className="panel-4d">
          <div className="input-row" style={{ alignItems: "center" }}>
            <span className="pill-chip ghost">Advance mode</span>
            <select value={nextPhaseMode} onChange={(e) => setNextPhaseMode(e.target.value)}>
              <option value="auto">Auto (top 4→SF if available)</option>
              <option value="semi">Semi-finals (top 4)</option>
              <option value="final">Direct final (top 2)</option>
            </select>
          </div>
          {knockoutSeeds.length < 2 ? (
            <div className="muted">Need at least 2 teams to project finals.</div>
          ) : knockoutSeeds.length >= 4 && nextPhaseMode !== "final" ? (
            <>
              <div className="proj-row">
                <div className="proj-card">
                  <div className="bracket-title">Semi-final 1</div>
                  <div className="scoreboard-shell knockout">
                    <div className="scoreboard-body">
                      <span className="scoreboard-team">{labelForTeam(knockoutSeeds[0])}</span>
                      <div className="scoreboard-score">
                        <input
                          type="number"
                          value={projectionScores.sf1a ?? ""}
                          onChange={(e) => setProjectionScores((prev) => ({ ...prev, sf1a: e.target.value }))}
                          className="scoreboard-input"
                          placeholder="0"
                        />
                        <span className="scoreboard-sep">-</span>
                        <input
                          type="number"
                          value={projectionScores.sf1b ?? ""}
                          onChange={(e) => setProjectionScores((prev) => ({ ...prev, sf1b: e.target.value }))}
                          className="scoreboard-input"
                          placeholder="0"
                        />
                      </div>
                      <span className="scoreboard-team">{labelForTeam(knockoutSeeds[3])}</span>
                      {(() => {
                        const a = Number(projectionScores.sf1a ?? 0);
                        const b = Number(projectionScores.sf1b ?? 0);
                        if (a === b) return null;
                        return a > b ? (
                          <span className="winner-icon-inline small-win">WIN</span>
                        ) : (
                          <span className="winner-icon-inline small-win" style={{ gridColumn: "3 / span 1" }}>
                            WIN
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="proj-card">
                  <div className="bracket-title">Semi-final 2</div>
                  <div className="scoreboard-shell knockout">
                    <div className="scoreboard-body">
                      <span className="scoreboard-team">{labelForTeam(knockoutSeeds[1])}</span>
                      <div className="scoreboard-score">
                        <input
                          type="number"
                          value={projectionScores.sf2a ?? ""}
                          onChange={(e) => setProjectionScores((prev) => ({ ...prev, sf2a: e.target.value }))}
                          className="scoreboard-input"
                          placeholder="0"
                        />
                        <span className="scoreboard-sep">-</span>
                        <input
                          type="number"
                          value={projectionScores.sf2b ?? ""}
                          onChange={(e) => setProjectionScores((prev) => ({ ...prev, sf2b: e.target.value }))}
                          className="scoreboard-input"
                          placeholder="0"
                        />
                      </div>
                      <span className="scoreboard-team">{labelForTeam(knockoutSeeds[2])}</span>
                      {(() => {
                        const a = Number(projectionScores.sf2a ?? 0);
                        const b = Number(projectionScores.sf2b ?? 0);
                        if (a === b) return null;
                        return a > b ? (
                          <span className="winner-icon-inline small-win">WIN</span>
                        ) : (
                          <span className="winner-icon-inline small-win" style={{ gridColumn: "3 / span 1" }}>
                            WIN
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
              {(() => {
                const sf1a = Number(projectionScores.sf1a ?? 0);
                const sf1b = Number(projectionScores.sf1b ?? 0);
                const sf2a = Number(projectionScores.sf2a ?? 0);
                const sf2b = Number(projectionScores.sf2b ?? 0);
                const finalA =
                  sf1a === sf1b
                    ? "Winner SF1"
                    : sf1a > sf1b
                    ? labelForTeam(knockoutSeeds[0])
                    : labelForTeam(knockoutSeeds[3]);
                const finalB =
                  sf2a === sf2b
                    ? "Winner SF2"
                    : sf2a > sf2b
                    ? labelForTeam(knockoutSeeds[1])
                    : labelForTeam(knockoutSeeds[2]);
                const fa = Number(projectionScores.fina ?? 0);
                const fb = Number(projectionScores.finb ?? 0);
                const finalWinner = fa === fb ? null : fa > fb ? finalA : finalB;
                return (
                  <div className="proj-card final-card">
                    <div className="bracket-title">Final</div>
                    <div className="scoreboard-shell knockout">
                      <div className="scoreboard-body">
                        <span className="scoreboard-team">
                          {finalWinner && finalWinner === finalA && (
                            <span className="winner-icon-inline final-win final-win-fireworks" style={{ marginRight: 8 }}>
                              WINNERS
                            </span>
                          )}
                          {finalA}
                        </span>
                        <div className="scoreboard-score">
                          <input
                            type="number"
                            value={projectionScores.fina ?? ""}
                            onChange={(e) => setProjectionScores((prev) => ({ ...prev, fina: e.target.value }))}
                            className="scoreboard-input"
                            placeholder="0"
                          />
                          <span className="scoreboard-sep">-</span>
                          <input
                            type="number"
                            value={projectionScores.finb ?? ""}
                            onChange={(e) => setProjectionScores((prev) => ({ ...prev, finb: e.target.value }))}
                            className="scoreboard-input"
                            placeholder="0"
                          />
                        </div>
                        <span className="scoreboard-team">
                          {finalWinner && finalWinner === finalB && (
                            <span className="winner-icon-inline final-win final-win-fireworks" style={{ marginRight: 8 }}>
                              WINNERS
                            </span>
                          )}
                          {finalB}
                        </span>
                      </div>
                    </div>
                    {finalWinner && (
                      <div className="muted" style={{ fontSize: 11, textAlign: "center" }}>
                        Champion: {finalWinner}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            (() => {
              const finalA = labelForTeam(knockoutSeeds[0]);
              const finalB = labelForTeam(knockoutSeeds[1]) || "Seed 2";
              const fa = Number(projectionScores.fina ?? 0);
              const fb = Number(projectionScores.finb ?? 0);
              const finalWinner = fa === fb ? null : fa > fb ? finalA : finalB;
              return (
                <div className="proj-card final-card">
                  <div className="bracket-title">Final</div>
                  <div className="scoreboard-shell knockout">
                    <div className="scoreboard-body">
                      <span className="scoreboard-team">
                        {finalWinner && finalWinner === finalA && (
                          <span className="winner-icon-inline final-win final-win-fireworks" style={{ marginRight: 8 }}>
                            WINNERS
                          </span>
                        )}
                        {finalA}
                      </span>
                      <div className="scoreboard-score">
                        <input
                          type="number"
                          value={projectionScores.fina ?? ""}
                          onChange={(e) => setProjectionScores((prev) => ({ ...prev, fina: e.target.value }))}
                          className="scoreboard-input"
                          placeholder="0"
                        />
                        <span className="scoreboard-sep">-</span>
                        <input
                          type="number"
                          value={projectionScores.finb ?? ""}
                          onChange={(e) => setProjectionScores((prev) => ({ ...prev, finb: e.target.value }))}
                          className="scoreboard-input"
                          placeholder="0"
                        />
                      </div>
                      <span className="scoreboard-team">
                        {finalWinner && finalWinner === finalB && (
                          <span className="winner-icon-inline final-win final-win-fireworks" style={{ marginRight: 8 }}>
                            WINNERS
                          </span>
                        )}
                        {finalB}
                      </span>
                    </div>
                  </div>
                  {finalWinner && (
                    <div className="muted" style={{ fontSize: 11, textAlign: "center" }}>
                      Champion: {finalWinner}
                    </div>
                  )}
                </div>
              );
            })()
          )}
          <div className="input-row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-danger"
              onClick={endTournament}
              disabled={isEnding}
              style={{ minWidth: 180 }}
            >
              {isEnding ? "Ending..." : "End tournament"}
            </button>
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="section-label">Tournament History</div>
        <h2>Archived tournaments</h2>
        <div className="panel-4d">
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Format</th>
                  <th>Teams</th>
                  <th>Matches</th>
                  <th>Winner</th>
                  <th>Runner-up</th>
                  <th>View</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="muted">No history yet.</td>
                  </tr>
                ) : (
                  history
                    .slice()
                    .sort((a, b) => (b.endedAt?.toMillis?.() || 0) - (a.endedAt?.toMillis?.() || 0))
                    .map((h, idx) => {
                      const ended = h.endedAt?.toDate ? h.endedAt.toDate() : null;
                      const endedText = ended ? ended.toLocaleString() : "—";
                      return (
                        <tr key={h.id || idx}>
                          <td>{idx + 1}</td>
                          <td>{h.tournamentName || "Tournament"}</td>
                          <td>{formatLabelMap[h.format] || "Custom"}</td>
                          <td>{h.teamCount || 0}</td>
                          <td>{h.matchCount || 0}</td>
                          <td>{h.winner || "—"}</td>
                          <td>{h.runnerUp || "—"}</td>
                          <td>
                            <button type="button" className="ghost-link" onClick={() => setSelectedHistory(h)}>
                              View
                            </button>
                          </td>
                          <td>
                            <button type="button" className="ghost-link" onClick={() => deleteHistoryEntry(h.id || idx)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {typeof window !== "undefined" &&
        showPinModal &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2000,
              backdropFilter: "blur(6px)",
            }}
          >
            <div
              style={{
                background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(3,7,18,0.98))",
                border: "1px solid rgba(148,163,184,0.45)",
                borderRadius: 16,
                padding: 18,
                width: "min(360px, 90vw)",
                boxShadow: "0 16px 38px rgba(0,0,0,0.55)",
              }}
            >
              <h3 style={{ margin: 0, marginBottom: 10 }}>Unlock scores</h3>
              <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
                {modalMode === "unlock" ? "Enter admin PIN to enable score editing." : "Enter admin PIN to delete this archive."}
              </p>
              <input
                type="password"
                value={pinEntry}
                onChange={(e) => {
                  setPinEntry(e.target.value);
                  setPinModalError("");
                }}
                placeholder="Admin PIN"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.5)",
                  background: "rgba(15,23,42,0.9)",
                  color: "#e5e7eb",
                }}
              />
              {pinModalError && (
                <div style={{ color: "#fca5a5", marginTop: 8, fontSize: 13 }}>{pinModalError}</div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowPinModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={confirmPinAction}>
                  {modalMode === "unlock" ? "Unlock" : "Delete"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {typeof window !== "undefined" &&
        selectedHistory &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1900,
              padding: "10px",
              backdropFilter: "blur(4px)",
            }}
          >
            <div
              style={{
                background: "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(3,7,18,0.98))",
                border: "1px solid rgba(148,163,184,0.45)",
                borderRadius: 16,
                padding: 18,
                width: "min(720px, 96vw)",
                maxHeight: "86vh",
                overflowY: "auto",
                boxShadow: "0 16px 38px rgba(0,0,0,0.55)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{selectedHistory.tournamentName || "Tournament"}</h3>
                  <div className="muted" style={{ marginTop: 4 }}>
                    {formatLabelMap[selectedHistory.format] || "Custom"} · Teams: {selectedHistory.teamCount || 0} · Matches:{" "}
                    {selectedHistory.matchCount || 0}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Winner: {selectedHistory.winner || "—"} · Runner-up: {selectedHistory.runnerUp || "—"}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedHistory(null)}>
                  Close
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <h4 style={{ margin: "8px 0" }}>Teams</h4>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  {(selectedHistory.teams || []).map((t, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "10px",
                        borderRadius: 12,
                        border: "1px solid rgba(148,163,184,0.35)",
                        background: "rgba(15,23,42,0.75)",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        Record: {(t.wins || 0)}W / {(t.losses || 0)}L · {(t.points || 0)} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: "8px 0" }}>Matches</h4>
                <div style={{ display: "grid", gap: 8 }}>
                  {(selectedHistory.matches || []).map((m, idx) => {
                    const nameA = historyTeamsMap.get(m.teamAId) || m.seedA || "TBD";
                    const nameB = historyTeamsMap.get(m.teamBId) || m.seedB || "TBD";
                    return (
                    <div
                      key={idx}
                      style={{
                        padding: "10px",
                        borderRadius: 12,
                        border: "1px solid rgba(148,163,184,0.3)",
                        background: "rgba(15,23,42,0.7)",
                        display: "grid",
                        gridTemplateColumns: "1fr auto 1fr",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{nameA}</span>
                      <div style={{ textAlign: "center", color: "#e2e8f0" }}>
                        {m.scoreA ?? "-"} - {m.scoreB ?? "-"}
                      </div>
                      <span style={{ fontWeight: 700, textAlign: "right" }}>{nameB}</span>
                      <div className="muted" style={{ gridColumn: "1 / span 3", fontSize: 12 }}>
                        {m.roundLabel || m.round ? `Round: ${m.roundLabel || m.round}` : "Round: —"} · Status: {m.status || "unknown"}
                      </div>
                    </div>
                  );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
