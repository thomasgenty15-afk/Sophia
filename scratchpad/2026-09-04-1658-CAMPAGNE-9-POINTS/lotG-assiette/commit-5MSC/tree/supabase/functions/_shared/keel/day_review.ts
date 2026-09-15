/**
 * FF-061 — LE BILAN DU JOUR: LA CHAÎNE DES TROIS ÉTAPES. PUR.
 *
 * Autorité: docs/fonctionnalites/suivi-quotidien/FF-061-le-bilan-du-jour.md
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE CE MODULE DÉCIDE, ET C'EST TOUT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Quelle étape OUVRE le message du soir, et quelle étape suit une réponse.
 * Rien d'autre: ni ce que chaque étape dit (les trois renderers existent déjà),
 * ni ce qu'elle écrit (les trois écrivains aussi).
 *
 * ── POURQUOI UNE CHAÎNE, ET PAS TROIS BLOCS DANS UNE BULLE ───────────────
 * R1: **un seul message par jour**, toutes étapes confondues; ② et ③ sont des
 * RÉPONSES à un tap (`isReply: true`), jamais des notifications.
 *
 * Et surtout: ① ÉTEINT ②. Déclarer « je n'ai pas fait les courses » invalide la
 * cuisson que cette vague sert — poser les deux questions dans la même bulle
 * ferait donc répondre à une question qui vient de perdre son objet, et la
 * réponse contredirait le fait qu'on vient d'écrire. L'ordre n'est pas une
 * commodité de lecture, c'est la seule façon de ne pas demander une chose
 * qu'on est en train de rendre fausse.
 *
 * ── ET ③ N'EST PAS UNE QUESTION (R2) ─────────────────────────────────────
 * On INTERROGE ① et ②, on OFFRE ③. À 20h les courses et la cuisson sont faites
 * ou pas — il n'y a pas d'« en cours ». Le dîner, si: « tu as mangé ? » à 20h05
 * pour un dîner à 20h30 apprend à ignorer le message. `[✓ poulet-riz]` offre.
 * Ce module ne fait que placer ③ en dernier; c'est `buildEveningStrip` qui tient
 * la frontière, avec sa ceinture armée sur le texte exact.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire.
 */

/**
 * Les trois étapes, DANS L'ORDRE DE LA CHAÎNE.
 *
 * ⚠️ L'ORDRE DU TABLEAU EST LA RÈGLE, pas une convention d'écriture: `stepAfter`
 * et `openingStep` le parcourent. Le permuter change le produit — et c'est
 * exactement ce qu'on veut d'une liste qui porte une décision.
 */
export const DAY_REVIEW_STEPS = ["shopping", "cooking", "meals"] as const;
export type DayReviewStep = (typeof DAY_REVIEW_STEPS)[number];

/**
 * Ce qui RESTE à demander, résolu par la couche IO.
 *
 * Les trois sont des faits, pas des préférences:
 *   `shopping` — une vague tombe aujourd'hui, aucune ligne ne la déclare, et ce
 *                compte répond des faits du FOYER (R9: le maître, ou quelqu'un
 *                sans foyer, qui est son propre maître).
 *   `cooking`  — une session tombe aujourd'hui, aucune ligne ne la déclare,
 *                même condition de foyer.
 *   `meals`    — il reste au moins un plat à offrir APRÈS l'extinction.
 */
export interface DayReviewPending {
  shopping: boolean;
  cooking: boolean;
  meals: boolean;
}

function pendingAt(pending: DayReviewPending, step: DayReviewStep): boolean {
  switch (step) {
    case "shopping":
      return pending.shopping === true;
    case "cooking":
      return pending.cooking === true;
    case "meals":
      return pending.meals === true;
  }
}

/**
 * L'étape qui OUVRE le message du soir, ou `null` s'il n'y a rien à dire.
 *
 * ⚠️ `null` EST UNE RÉPONSE, ET C'EST R10: zéro plat, zéro cuisson, zéro vague
 * ⇒ aucun bilan. Un message du soir qui ne porte rien est une notification sans
 * objet — le message reste exactement ce qu'il était avant cette fiche.
 */
export function openingStep(pending: DayReviewPending): DayReviewStep | null {
  return DAY_REVIEW_STEPS.find((s) => pendingAt(pending, s)) ?? null;
}

/**
 * L'étape qui suit celle qu'on vient de répondre, ou `null` si la chaîne
 * s'arrête là.
 *
 * ⚠️ `pending` EST RECALCULÉ APRÈS L'ÉCRITURE, ET C'EST LE POINT. Répondre
 * « pas encore » aux courses invalide la cuisson que la vague sert: au moment
 * où on demande la suite, `cooking` doit déjà valoir `false`. Passer le
 * `pending` d'AVANT la réponse ferait poser une question que la réponse
 * précédente vient de vider — le défaut exact que la chaîne existe pour éviter.
 *
 * ⛔ ON NE REVIENT JAMAIS EN ARRIÈRE. La recherche part de l'étape SUIVANTE
 * dans l'ordre du tableau, jamais du début: une étape déjà répondue reste
 * `pending: false` (sa ligne existe), mais une lecture en panne la rendrait
 * `true` et rouvrirait une question qu'on vient de fermer.
 */
export function stepAfter(
  answered: DayReviewStep,
  pending: DayReviewPending,
): DayReviewStep | null {
  const at = DAY_REVIEW_STEPS.indexOf(answered);
  if (at < 0) return null;
  return DAY_REVIEW_STEPS.slice(at + 1).find((s) => pendingAt(pending, s)) ??
    null;
}
