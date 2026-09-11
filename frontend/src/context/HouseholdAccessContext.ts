import { createContext, useContext } from "react";

import type { HouseholdCoverage } from "../keel/api/householdCoverage";

// ---------------------------------------------------------------------------
// FF-064 — LA COUVERTURE DU FOYER, LUE UNE FOIS ET PARTAGÉE
// ---------------------------------------------------------------------------
//
// ── POURQUOI UN CONTEXTE, ET PAS UNE LECTURE PAR ÉCRAN ────────────────────
// Trois surfaces posent la MÊME question — « mon foyer est-il couvert, et
// jusqu'à quand ? » : le mur de paiement (`KeelPaywallGate`), le bandeau de fin
// d'essai (`TrialEndingBanner`, monté dans le shell, donc sur chaque écran) et
// la page d'abonnement. Trois lectures indépendantes, c'est trois appels par
// navigation et trois réponses qui peuvent diverger d'une seconde à l'autre —
// donc un mur qui tombe pendant qu'un bandeau annonce qu'il reste deux jours.
//
// ── CE FICHIER NE PORTE AUCUN COMPOSANT, ET C'EST LA RAISON DU DÉCOUPAGE ──
// Même partage que `AuthContext` / `AuthProvider.tsx`: un module qui exporte à
// la fois un composant et autre chose casse le Fast Refresh de Vite
// (`react-refresh/only-export-components`). Le fournisseur vit à côté, dans
// `HouseholdAccessProvider.tsx`.
//
// ⚠️ `.ts` ET PAS `.tsx`, ET CE N'EST PAS COSMÉTIQUE. Il n'y a aucun JSX ici,
// et `scripts/ci/i18n-lint.mjs` cherche la prose en dur dans les `.tsx` avec
// `/>([^<>{}\n]{3,})</` — qui lit `Promise<void>` comme du texte entre deux
// balises. Trois fichiers du dépôt portent déjà cette fausse dette dans leur
// baseline; celui-ci n'a pas à la porter, puisqu'il n'a rien à y faire.
//
// ── LE DÉFAUT PAR DÉFAUT EST « OUVERT » ───────────────────────────────────
// La valeur initiale rend `coverage: null` avec `status: "loading"`. Aucun
// lecteur ne doit conclure « gelé » d'un `null`: ne pas savoir n'est pas une
// raison de couper quelqu'un qui paie. C'est la même règle que
// `loadMyHouseholdCoverage`, qui replie déjà toute erreur sur `frozen: false`.

export type HouseholdAccessStatus = "loading" | "known";

export interface HouseholdAccessValue {
  status: HouseholdAccessStatus;
  /** `null` tant que `status === "loading"`, ou hors session. */
  coverage: HouseholdCoverage | null;
  /**
   * Relire MAINTENANT, en ignorant le cache.
   *
   * Un seul appelant prévu: le retour du tunnel Stripe sur `/app/billing`. Le
   * webhook peut atterrir après le navigateur, et la page doit pouvoir
   * redemander plutôt qu'afficher « en pause » à quelqu'un qui vient de payer.
   */
  refresh: () => Promise<void>;
}

export const HouseholdAccessContext = createContext<HouseholdAccessValue>({
  status: "loading",
  coverage: null,
  refresh: async () => {},
});

export const useHouseholdAccess = () => useContext(HouseholdAccessContext);
