// Pack français — le namespace `common`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `common.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frCommon = {
  // ══════════════════════════════════════════════════════════════════════════
  // LOT 3 — LES ATOMES PARTAGÉS
  //
  // Les tables jeton → mot que `api/labels.ts` lit DYNAMIQUEMENT. Elles ne
  // dépendent d'aucun écran: un jeton vient de la base, et n'importe quelle
  // page de plan peut le rendre. C'est pour ça qu'elles entrent ensemble et
  // avant les pages — voir le bloc « LES ATOMES PARTAGÉS » de `catalog.ts`.
  //
  // ⚠️ SEULES LES VALEURS SONT ICI. Les clés (`unit.one.serving`,
  // `day.long.mon`) sont des jetons ASCII anglais et ne se traduisent jamais.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Les mots communs ─────────────────────────────────────────────────────
  "common.clear": "effacer",
  // Le dernier maillon d'une énumération. `namedDays` colle les précédents avec
  // des virgules et confie les deux derniers à cette clé.
  "common.list_pair": "{first} et {second}",
  "common.back": "Retour",
  "common.cancel": "Annuler",
  "common.close": "Fermer",
  "common.continue": "Continuer",
} satisfies TranslatedMessagesOf<"common">;
