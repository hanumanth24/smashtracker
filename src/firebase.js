'use client';

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCX8k2jee_uB5WYvbK7RdZrnX0-8-wOUuE",
  authDomain: "badminton-tracker-558c1.firebaseapp.com",
  projectId: "badminton-tracker-558c1",
  storageBucket: "badminton-tracker-558c1.firebasestorage.app",
  messagingSenderId: "980136762546",
  appId: "1:980136762546:web:cdd471e086d53e4bd27dab",
  measurementId: "G-FQ82F0MX5E",
};

const existingApps = getApps();
const app = existingApps.length ? getApp() : initializeApp(firebaseConfig);

// Use persistent local cache to speed up reloads; fall back to default instance if already created.
export const db = existingApps.length
  ? getFirestore(app)
  : initializeFirestore(app, { localCache: persistentLocalCache() });
