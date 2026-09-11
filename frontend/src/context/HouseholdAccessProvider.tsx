import React from "react";

import { useAuth } from "./AuthContext";
import {
  HouseholdAccessContext,
  type HouseholdAccessStatus,
  type HouseholdAccessValue,
} from "./HouseholdAccessContext";
import {
  loadMyHouseholdCoverage,
  type HouseholdCoverage,
} from "../keel/api/householdCoverage";

// ---------------------------------------------------------------------------
// FF-064 — LE FOURNISSEUR: UNE LECTURE PAR IDENTITÉ, PAS PAR NAVIGATION
// ---------------------------------------------------------------------------
//
// ── LE CACHE DE MODULE N'EST PAS DE L'OPTIMISATION PRÉMATURÉE ─────────────
// Ce fournisseur est monté AU-DESSUS du routeur, donc il ne se remonte pas à
// chaque navigation — le cache ne sert donc pas à ça. Il sert au cas réel:
// React 18 en `StrictMode` monte, démonte et remonte chaque effet en
// développement, et sans lui la RPC part deux fois par chargement. Il sert
// aussi au retour de `refresh()`: on veut que la valeur survive au re-rendu qui
// suit, pas qu'elle reparte de « loading ».
//
// ── CE FOURNISSEUR NE DÉCIDE RIEN ─────────────────────────────────────────
// Il transporte. « Ce foyer est-il couvert » a UNE définition, en SQL
// (`keel_household_is_covered`), et `loadMyHouseholdCoverage` en est la seule
// porte côté navigateur. Écrire ici « gelé = pas d'abonnement et essai fini »
// serait la seconde définition que le chantier 3 a existé pour retirer.
//
// ⚠️ FAIL-OPEN, ET IL NE SE RATTRAPE PAS ICI. `loadMyHouseholdCoverage` replie
// déjà toute erreur sur `{inHousehold:false, frozen:false}` et son commentaire
// dit pourquoi. Ce fichier n'ajoute aucun `catch` qui transformerait une panne
// réseau en gel: se tromper de sens coupe quelqu'un qui paie, et aucun nouvel
// essai ne répare ça.

let cache: { userId: string; coverage: HouseholdCoverage } | null = null;

export function HouseholdAccessProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [state, setState] = React.useState<{
    status: HouseholdAccessStatus;
    coverage: HouseholdCoverage | null;
  }>(() =>
    cache && cache.userId === userId
      ? { status: "known", coverage: cache.coverage }
      : { status: "loading", coverage: null }
  );

  const read = React.useCallback(async (id: string) => {
    const coverage = await loadMyHouseholdCoverage();
    cache = { userId: id, coverage };
    return coverage;
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    // PAS DE SESSION: il n'y a pas de foyer à interroger, et la RPC rendrait
    // `{in_household:false}` de toute façon. `known` et pas `loading`: un
    // garde qui attend indéfiniment sur une page publique n'afficherait jamais
    // rien.
    if (!userId) {
      cache = null;
      setState({ status: "known", coverage: null });
      return;
    }

    if (cache && cache.userId === userId) {
      setState({ status: "known", coverage: cache.coverage });
      return;
    }

    setState({ status: "loading", coverage: null });
    void read(userId).then((coverage) => {
      if (cancelled) return;
      setState({ status: "known", coverage });
    });

    return () => {
      cancelled = true;
    };
  }, [userId, read]);

  const refresh = React.useCallback(async () => {
    if (!userId) return;
    const coverage = await read(userId);
    setState({ status: "known", coverage });
  }, [userId, read]);

  const value = React.useMemo<HouseholdAccessValue>(
    () => ({ status: state.status, coverage: state.coverage, refresh }),
    [state.status, state.coverage, refresh],
  );

  return (
    <HouseholdAccessContext.Provider value={value}>
      {children}
    </HouseholdAccessContext.Provider>
  );
}

export default HouseholdAccessProvider;
