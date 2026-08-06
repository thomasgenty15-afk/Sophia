import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { initUiLocale } from './keel/i18n/runtime'

// W9/R3 — la locale d'interface est résolue AVANT le premier rendu, et une
// seule fois. Synchrone, et surtout sans attendre la session: `AuthProvider`
// démarre à `loading: true` et met deux allers-retours à connaître le profil.
// Bloquer le premier paint derrière ça donnerait une vitrine blanche au
// visiteur anonyme — c'est-à-dire à l'acheteur.
initUiLocale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
