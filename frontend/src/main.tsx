import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { initUiLocale } from './keel/i18n/runtime'
import { initGoogleAds } from './analytics/googleAds'

// W9/R3 — la locale d'interface est résolue AVANT le premier rendu, et une
// seule fois. Synchrone, et surtout sans attendre la session: `AuthProvider`
// démarre à `loading: true` et met deux allers-retours à connaître le profil.
// Bloquer le premier paint derrière ça donnerait une vitrine blanche au
// visiteur anonyme — c'est-à-dire à l'acheteur.
initUiLocale()

// Le tag publicitaire, avec Consent Mode v2: TOUT est refusé par défaut, et
// rien n'est écrit tant que le bandeau n'a pas reçu de réponse. No-op complet
// sans `VITE_GOOGLE_ADS_ID` — donc en dev, et tant que le compte Ads n'existe
// pas. L'ORDRE COMPTE: les défauts de consentement doivent être posés avant
// que le script de Google ne s'exécute (voir `analytics/googleAds.ts`).
initGoogleAds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
