// LA FUSION DES BROUILLONS — temporaire, le temps de la refonte « par la
// douleur » (2026-08-13).
//
// ⚠️ CE DOSSIER DISPARAÎT EN PHASE 2. Il n'y a que deux lignes de couture:
// un `...draftEn` juste avant le `} as const` d'`en.ts`, et un `...draftFr`
// dans `fr.ts`. Les replier, c'est recopier les clés à leur place dans les
// deux catalogues, retirer ces deux lignes, et supprimer `drafts/`.
//
// POURQUOI CE DÉTOUR. `t()` LÈVE en dev sur une clé inconnue (`t.ts:72-79`):
// sans catalogue, une page refondue rend un écran blanc et aucun constructeur
// ne peut vérifier son travail au navigateur — or les défauts de ce chantier
// (débordement à 320 px, figure illisible, ligne française trop longue) ne se
// voient QU'au rendu. Et huit agents écrivant dans le même `en.ts` se seraient
// écrasés les uns les autres.

import { mealprepEn } from "./mealprep.en";
import { mealprepFr } from "./mealprep.fr";
import { couplesEn } from "./couples.en";
import { couplesFr } from "./couples.fr";
import { familiesEn } from "./families.en";
import { familiesFr } from "./families.fr";
import { coachesEn } from "./coaches.en";
import { coachesFr } from "./coaches.fr";
import { gymsEn } from "./gyms.en";
import { gymsFr } from "./gyms.fr";
import { communitiesEn } from "./communities.en";
import { communitiesFr } from "./communities.fr";
import { homeEn } from "./home.en";
import { homeFr } from "./home.fr";
import { proEn } from "./pro.en";
import { proFr } from "./pro.fr";

export const draftEn = {
  ...mealprepEn,
  ...couplesEn,
  ...familiesEn,
  ...coachesEn,
  ...gymsEn,
  ...communitiesEn,
  ...homeEn,
  ...proEn,
} as const;

export const draftFr = {
  ...mealprepFr,
  ...couplesFr,
  ...familiesFr,
  ...coachesFr,
  ...gymsFr,
  ...communitiesFr,
  ...homeFr,
  ...proFr,
} as const;
