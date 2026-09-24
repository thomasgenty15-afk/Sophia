// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// Le brouillon d'une bouche qu'on ajoute: sa forme, « porte-t-il quelque
// chose ? », et le vide.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import { emptyMouthDraft as emptyMouthFormDraft, type MouthFormDraft } from "../../lib/mouthForm";

/**
 * Le brouillon d'une bouche qu'on ajoute.
 *
 * ── ⛔ AUCUN CHAMP `kind`, ET C'EST LE POINT (2026-08-18) ─────────────────
 * Ce brouillon portait `kind: "adult" | "child"`, demandé par deux boutons
 * juste sous le prénom. Deux raisons de l'avoir retiré, et la seconde est un
 * défaut mesuré:
 *
 *   1. LA DATE DE NAISSANCE LE DIT DÉJÀ, et elle est collectée dans le même
 *      formulaire, trois champs plus bas. Deux sources pour un même fait
 *      finissent par se contredire — et c'est la réponse TAPÉE qui gagnerait,
 *      parce qu'elle est plus récente. Le moteur, lui, résout l'âge en TROIS
 *      états (mineur, majeur, INCONNU), où l'inconnu n'applique aucune
 *      direction: un booléen d'écran ne sait pas dire le troisième.
 *
 *   2. REPASSER EN « ENFANT » EFFAÇAIT L'OBJECTIF DU BROUILLON. C'est
 *      l'ancienne règle « un mineur n'a jamais d'objectif », RENVERSÉE le
 *      2026-08-18: un mineur porte les trois directions exactement comme un
 *      majeur (migration `20260818100000`, les deux portes RPC ouvertes,
 *      `servingDirectionFor` côté moteur, `goalsForAge` rend la même liste des
 *      deux côtés). Cet écran était le dernier endroit à l'appliquer.
 *
 *      ⟳ 2026-09-03 (chantier P3, D3.2): la liste n'est PLUS la même des deux
 *      côtés — `goalsForAge("minor")` ne rend que `maintenance` (« Manger
 *      normalement ») depuis que la base refuse `fat_loss` et `muscle_gain`
 *      sur un mineur (`20260822041500`, lot S4, quatre portes). Mais rien ici
 *      n'EFFACE une direction, et c'est ce que le point 2 garde: une date qui
 *      rend quelqu'un mineur PLIE sa direction à « Manger normalement » à la
 *      lecture et à l'écriture (`goalForAge`, `foldMinorGoal`), et l'écran le
 *      dit. Le brouillon garde ce qui a été tapé — corriger la date vers un
 *      âge adulte fait réapparaître la direction d'origine.
 *
 * ⛔ NE PAS LE RÉINTRODUIRE. Ce que `MouthFormDialog` dit déjà de son côté vaut
 * ici mot pour mot: « on ne demande jamais adulte ou enfant ».
 */
/**
 * ── ⚠️ C'EST `MouthFormDraft`, ET PLUS UNE FORME LOCALE (2026-08-18) ──────
 *
 * Ce brouillon portait ses neuf champs à lui. Il en manquait cinq — le poids
 * visé, le rythme, les habitudes, les dégoûts, le régime — et les cinq
 * existaient déjà, nommés et testés, dans `lib/mouthForm.ts`. Les recopier ici
 * aurait fait une SECONDE forme de la même personne: deux `emptyMouthDraft`,
 * deux parseurs, et le jour du premier correctif un seul des deux corrigé.
 *
 * ⚠️ `activityLevel` CHANGE DE VOCABULAIRE AU PASSAGE: `null` devient `""`.
 * Les deux disent « personne n'a répondu » — `tokens.ts` refuse un jeton
 * d'ignorance des deux côtés —, mais `ActivityTiles` parle en `null`, d'où les
 * deux traductions au point de montage. Une seule, ici, et pas une par champ.
 */
export type MouthDraft = MouthFormDraft;

/**
 * CE BROUILLON PORTE-T-IL QUELQUE CHOSE ?
 *
 * ⚠️ NÉ D'UN DÉFAUT VU À L'ÉCRAN LE 2026-08-14. Le formulaire d'ajout a la même
 * forme qu'une fiche de personne — prénom, adulte/enfant, naissance, corps,
 * direction — et il n'avait AUCUN moyen d'être vidé. Quelqu'un tape deux
 * lettres par mégarde et se retrouve devant ce qu'il lit comme une personne de
 * plus, sans bouton pour la retirer. Ses mots: « j'ai fait ajouter une personne
 * sans faire exprès mais on peut pas la retirer ». En base il n'y avait
 * personne — mais ça, l'écran ne le disait pas non plus.
 *
 * `allergiesNone` compte: c'est une RÉPONSE (« aucune »), pas un défaut.
 */
export function mouthDraftHasContent(d: MouthDraft): boolean {
  return d.firstName.trim() !== "" ||
    d.birthDate !== "" ||
    d.heightCm !== "" ||
    d.weightKg !== "" ||
    d.gender !== "" ||
    // Un cran coché EST du contenu: sans lui, quelqu'un qui n'a cliqué que sur
    // une tuile ne verrait pas le bouton « Effacer », et le brouillon
    // partirait en silence au geste d'à côté.
    d.activityLevel !== "" ||
    d.goal !== "" ||
    // ── ET CE QUI SE SAISIT DERRIÈRE LE BOUTON COMPTE AUTANT ────────────────
    // Les préférences vivent dans une fenêtre depuis le 2026-08-18. Les
    // oublier ici ferait disparaître « Effacer » sous une fiche où quelqu'un
    // vient de déclarer trois allergies — le brouillon partirait alors en
    // silence au geste d'à côté, ce que cette fonction existe pour empêcher.
    d.targetWeightKg !== "" ||
    d.paceKgPerWeek !== "" ||
    Object.values(d.habits).some((v) => v.trim() !== "") ||
    d.shaker !== null ||
    d.dislikes.length > 0 ||
    d.diet !== "" ||
    d.allergies.length > 0 ||
    d.allergiesNone;
}

/** Le vide vient de la SEULE source — voir `MouthDraft` juste au-dessus. */
export function emptyMouthDraft(): MouthDraft {
  return emptyMouthFormDraft();
}
