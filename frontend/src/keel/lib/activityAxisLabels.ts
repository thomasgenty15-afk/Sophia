import { type MessageKey } from "../i18n/t";
import type {
  DayActivityLevel,
  SportFrequency,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";

// ===========================================================================
// LE VOCABULAIRE DES DEUX AXES D'ACTIVITÉ — SANS LE RENDU
//
// ── ⟳ SORTI DE `components/ActivityAxesTiles.tsx` LE 2026-09-20 ───────────
// Il y vivait depuis le 2026-09-06, collé aux tuiles qui le montent, et c'était
// la bonne adresse tant qu'un seul écran le lisait. Les résumés des cartes
// REPLIÉES de `/app/setup` doivent maintenant NOMMER le cran choisi, et un
// résumé n'est pas une tuile: il rend un libellé dans un `<dd>`.
//
// ⛔ ET IL NE PEUT PAS ÊTRE EXPORTÉ DEPUIS LE FICHIER DU COMPOSANT. `eslint`
// refuse (`react-refresh/only-export-components`): un module qui exporte à la
// fois un composant et une constante casse le rafraîchissement à chaud — le
// module entier est rechargé, l'état du composant est perdu. La règle a mordu
// à la première tentative, et elle a raison.
//
// ⚠️ UN `Record` COMPLET PAR AXE, comme avant: un cran ajouté à `tokens.ts`
// sans ses mots ne compile pas. C'est la seule chose qui empêche un septième
// jeton d'arriver muet dans une grille.
//
// PURE MODULE: aucune traduction n'est faite ici, seulement NOMMÉE. `t()` est
// appelé par qui rend.
// ===========================================================================

/** ② LE PREMIER AXE — la journée, sport EXCLU. */
export const DAY_ACTIVITY_KEYS: Record<
  DayActivityLevel,
  { label: MessageKey; hint: MessageKey }
> = {
  seated: {
    label: "setup.day_activity.seated",
    hint: "setup.day_activity.seated_hint",
  },
  on_feet: {
    label: "setup.day_activity.on_feet",
    hint: "setup.day_activity.on_feet_hint",
  },
  physical_job: {
    label: "setup.day_activity.physical_job",
    hint: "setup.day_activity.physical_job_hint",
  },
};

/**
 * ② LE SECOND AXE — les séances par semaine, journée EXCLUE.
 *
 * ⚠️ `none` EST UNE TUILE, ET CE N'EST PAS UN « JE NE SAIS PAS ». « Je ne fais
 * pas de sport » est une RÉPONSE, et elle pèse: elle fait descendre le PAL au
 * bas de la bande sédentaire. C'est `null` — aucune tuile cochée — qui veut
 * dire « pas répondu », et il n'a pas de tuile, exprès.
 */
export const SPORT_KEYS: Record<
  SportFrequency,
  { label: MessageKey; hint: MessageKey }
> = {
  none: { label: "setup.sport.none", hint: "setup.sport.none_hint" },
  "1_2": { label: "setup.sport.1_2", hint: "setup.sport.1_2_hint" },
  "3_4": { label: "setup.sport.3_4", hint: "setup.sport.3_4_hint" },
  "5_plus": { label: "setup.sport.5_plus", hint: "setup.sport.5_plus_hint" },
};
