// BROUILLON DE CLÉS — refonte « par la douleur » du 2026-08-13.
//
// ⚠️ FICHIER TEMPORAIRE. Il existe pour UNE raison: `t()` LÈVE en dev sur une
// clé inconnue, donc une page refondue ne se rend pas au navigateur tant que
// ses clés ne sont pas dans le catalogue. Huit constructeurs écrivant
// directement dans `en.ts` se seraient écrasés; chacun écrit ICI, dans SON
// fichier, et `drafts/index.ts` fait la fusion pour le temps du chantier.
//
// L'orchestrateur replie ce contenu dans `en.ts` en phase 2 et supprime le
// dossier. Rien de ce qui est ici ne doit survivre au chantier.
//
// LE FICHIER PORTE L'INTÉGRALITÉ DU NAMESPACE `gyms.` — pas seulement les
// clés neuves. Les anciennes clés du namespace seront SUPPRIMÉES d'`en.ts`
// et remplacées par ce fichier: ce qui n'est pas ici n'existera plus.

export const gymsEn = {} as const;
