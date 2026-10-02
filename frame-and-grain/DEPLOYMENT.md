# FRAME & GRAIN — DEPLOYMENT & PRODUCTION RUNBOOK

## 1. Overview
Frame & Grain is an interactive film recommendation system and living archive built with Next.js (App Router, Turbopack) and Vanilla CSS, powered by the TMDB API and JustWatch data.

---

## 2. Environment Variables

Create a `.env.local` file in the project root for local development, or configure these variables in your production hosting platform (Vercel, AWS Amplify, Docker, etc.):

| Variable | Required | Scope | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `TMDB_READ_ACCESS_TOKEN` | **YES** | Server-Only | TMDB API v4 Read Access Bearer Token | `eyJhbGciOi...` |
| `NODE_ENV` | Optional | Runtime | Node environment (`production` / `development`) | `production` |
| `PORT` | Optional | Runtime | Web server listening port (Default: `3000`) | `3000` |

> **Security Note**: Never prefix `TMDB_READ_ACCESS_TOKEN` with `NEXT_PUBLIC_`. All TMDB API communications are proxied, filtered, rate-limited, and cached server-side. Missing credentials result in an explicit `503 Service Unavailable` response (`TMDB_CREDENTIAL_MISSING`) rather than mock data leaks.

---

## 3. Local Development & Testing

```bash
# 1. Install dependencies
npm install

# 2. Run unit and integration test suite
npm test

# 3. Start local development server
npm run dev
```

The application will be accessible at `http://localhost:3000`.

---

## 4. Production Build & Deployment

```bash
# 1. Build optimized production bundle
npm run build

# 2. Start production server
npm run start
```

---

## 5. Typography Asset Integration (Fique & ITC Avant Garde Gothic)

Frame & Grain's locked visual identity specifies:
- **Primary Display**: `Fique`
- **Editorial / Subheadings**: `ITC Avant Garde Gothic`
- **Body & Functional UI**: `Inter`

### Current Fallback State
Until commercial font licenses are bundled, the application uses high-fidelity web-safe Google Font fallbacks (`Cormorant Garamond` and `Josefin Sans`) declared in `src/app/globals.css`.

### Adding Licensed Font Files
When commercial font files (`.woff2`) are acquired:
1. Place the font files in `public/fonts/`:
   - `public/fonts/Fique-Regular.woff2`
   - `public/fonts/ITCAvantGardeGothic-Demi.woff2`
2. Add `@font-face` declarations at the top of `src/app/globals.css`:
   ```css
   @font-face {
     font-family: 'Fique';
     src: url('/fonts/Fique-Regular.woff2') format('woff2');
     font-weight: 400;
     font-display: swap;
   }

   @font-face {
     font-family: 'ITC Avant Garde Gothic';
     src: url('/fonts/ITCAvantGardeGothic-Demi.woff2') format('woff2');
     font-weight: 500;
     font-display: swap;
   }
   ```
3. The CSS variables `--font-display` and `--font-editorial` will automatically resolve to the licensed font families with zero additional code changes.

---

## 6. Mandatory Attributions

Frame & Grain displays required legal attributions in `AboutPanel.tsx` and `FilmDetail.tsx`:
- **TMDB**: *"This product uses the TMDB API but is not endorsed or certified by TMDB."*
- **JustWatch**: *"Watch provider availability supplied by JustWatch."*

---

## 7. Performance & Caching Architecture

- **Two-Stage Candidate Pipeline**: Stage 1 raw metadata filtering drops 70–90% of non-qualifying titles in 0ms; Stage 2 enriches surviving candidates with controlled concurrency (`CONCURRENCY_LIMIT = 8`).
- **In-Memory Cache (LRU)**:
  - Provider data: 24h TTL
  - Genre taxonomy: 24h TTL
  - Discovery queries: 15m TTL
  - Title details: 12h TTL
- **In-Flight Request Coalescing**: Duplicate concurrent API requests share a single in-flight promise.
- **Cache Key Isolation**: Keys strictly include region codes, formats, and parameter hashes to prevent cross-region or stale data leakage.
