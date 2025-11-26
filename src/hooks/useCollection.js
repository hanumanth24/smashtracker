import { useEffect, useState } from "react";
import { onSnapshot, query as fsQuery } from "firebase/firestore";

function getCached(key) {
  if (typeof window === "undefined" || !key) return null;
  try {
    const cached = sessionStorage.getItem(`fs-cache:${key}`);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function setCached(key, value) {
  if (typeof window === "undefined" || !key) return;
  try {
    sessionStorage.setItem(`fs-cache:${key}`, JSON.stringify(value));
  } catch {
    // ignore storage write failures (e.g., quota)
  }
}

export function useCollection(query, cacheKey) {
  // Keep SSR/client initial content aligned to avoid hydration mismatches; seed cache after mount.
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    if (!query) {
      setDocs([]);
      return undefined;
    }

    const cached = getCached(cacheKey);
    if (cached) {
      setDocs(cached);
    }

    const q = fsQuery(query);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setDocs(arr);
        if (cacheKey) setCached(cacheKey, arr);
      },
      (err) => {
        console.error("Firestore subscription failed", err);
        if (cacheKey) setCached(cacheKey, []);
        setDocs([]);
      }
    );
    return () => unsub();
  }, [query, cacheKey]);

  return docs;
}
