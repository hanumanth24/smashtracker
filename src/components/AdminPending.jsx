'use client';

import React, { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { useAdmin } from "../context/AdminContext.jsx";
import ConfirmModal from "./ConfirmModal.jsx";

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

export default function AdminPending({ pendingRequests = [], players = [] }) {
  const playersRef = useMemo(() => collection(db, "players"), []);
  const matchesRef = useMemo(() => collection(db, "matches"), []);
  const pendingRequestsRef = useMemo(() => collection(db, "pendingRequests"), []);
  const { showNotification, requireAdminPin } = useAdmin();
  const [rejecting, setRejecting] = useState(null);

  const getPlayerName = (id) =>
    players.find((p) => p.id === id)?.name || "Unknown";

  const approveRequest = (req) => {
    requireAdminPin("approve this " + req.type + " request", async () => {
      const reqRef = doc(pendingRequestsRef, req.id);

      if (req.type === "player") {
        const name = (req.name || "").trim();
        if (name) {
          await addDoc(playersRef, {
            name,
            points: 0,
            losses: 0,
            createdAt: serverTimestamp(),
          });
        }
      } else if (req.type === "match") {
        const team1Ids = req.team1Ids || [];
        const team2Ids = req.team2Ids || [];
        const winningTeam = req.winningTeam;
        const winningIds = winningTeam === 1 ? team1Ids : team2Ids;
        const losingIds = winningTeam === 1 ? team2Ids : team1Ids;

        const batch = writeBatch(db);
        winningIds.forEach((pid) => {
          batch.update(doc(playersRef, pid), { points: increment(1) });
        });
        losingIds.forEach((pid) => {
          batch.update(doc(playersRef, pid), { losses: increment(1) });
        });
        await batch.commit();

        await addDoc(matchesRef, {
          team1Ids,
          team2Ids,
          winningTeam,
          time: serverTimestamp(),
        });
      }

      await deleteDoc(reqRef);
      showNotification("Request approved.", "success");
    });
  };

  const rejectRequest = (req) => {
    setRejecting(req);
  };

  return (
    <div>
      <div className="section-label">Admin – Pending</div>
      <h2>Pending Requests</h2>
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Details</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pendingRequests.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No pending requests.
                </td>
              </tr>
            ) : (
              pendingRequests.map((req, idx) => {
                let typeLabel = "";
                let details = "";
                if (req.type === "player") {
                  typeLabel = "New Player";
                  details = "Name: " + req.name;
                } else if (req.type === "match") {
                  const t1 = (req.team1Ids || [])
                    .map((id) => getPlayerName(id))
                    .join(" & ");
                  const t2 = (req.team2Ids || [])
                    .map((id) => getPlayerName(id))
                    .join(" & ");
                  const winner = req.winningTeam === 1 ? "Team 1" : "Team 2";
                  details = `T1: ${t1} | T2: ${t2} | Winner: ${winner}`;
                }
                return (
                  <tr key={req.id}>
                    <td>{idx + 1}</td>
                    <td>{typeLabel}</td>
                    <td style={{ textAlign: "left", fontSize: 12 }}>{details}</td>
                    <td>{formatTime(req.createdAt)}</td>
                    <td>
                      <button
                        className="btn btn-primary"
                        style={{ padding: "4px 10px", marginRight: 4 }}
                        onClick={() => approveRequest(req)}
                      >
                        Approve
                      </button>
                      <button className="btn btn-danger" style={{ padding: "4px 10px" }} onClick={() => rejectRequest(req)}>
                        Reject
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <ConfirmModal
        open={Boolean(rejecting)}
        title="Reject request?"
        body={
          rejecting?.type === "player"
            ? `Reject new player "${rejecting?.name}"?`
            : "Reject this match request?"
        }
        confirmLabel="Reject"
        onCancel={() => setRejecting(null)}
        onConfirm={async () => {
          if (!rejecting) return;
          await deleteDoc(doc(pendingRequestsRef, rejecting.id));
          showNotification("Request rejected.", "info");
          setRejecting(null);
        }}
      />
    </div>
  );
}
