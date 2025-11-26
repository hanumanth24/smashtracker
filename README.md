# SmashTrack 3D

Firebase-backed badminton league + tournament tracker with a neon Three.js court preview. Players and matches are queued as requests; admins approve them behind a PIN before scores are applied.

## Tech stack

- Next.js 14 (App Router) on React 18
- Firebase Firestore for all data
- Three.js for the animated court panel

## Scripts

- `npm run dev` – start the Next dev server
- `npm run build` – production build
- `npm run start` – run the production build
- `npm run lint` – run ESLint (`next lint`)

## Admin PIN

Admin actions are protected by a PIN modal. Default: `2727`. Change it in `src/context/AdminContext.jsx` before deploying.

## Deployment (Netlify)

- Build command: `npm run build`
- Publish directory: `out` (generated because `output: "export"` is set in `next.config.js`)
