/**
 * KEEL W3.3 — student safety constraints: loaded every turn, OUTSIDE the LLM
 * memory path, plus a deterministic post-generation validator.
 *
 * Authority: docs/keel/CONTRACT.md ("Supplement safety gate (P0)"),
 * docs/keel/BUILD_PLAN.md W3.3. Table: `student_safety_constraints`
 * (migration 20260727090000_keel_p0_commitments.sql).
 *
 * WHY THIS IS NOT MEMORY
 * The memorizer runs on the midnight cron and produces items with status
 * 'candidate', ranked by embedding similarity, promoted probabilistically.
 * That machinery is correct for "prefers short answers in the evening". It is
 * catastrophic for "anaphylactic to peanuts": an allergy that is recalled 80%
 * of the time is an allergy that kills on the 5th turn. So:
 *
 *   1. constraints are read from their own table, on EVERY turn, synchronously
 *      with the turn (no cron, no candidate status, no ranking, no cache);
 *   2. nothing in this module imports the memory runtime, and nothing in the
 *      memory runtime may import this module (asserted by
 *      safety_constraints_test.ts);
 *   3. a load failure THROWS. An empty constraint list and a failed query are
 *      indistinguishable to a caller that swallows errors, and the difference
 *      is a medical one. Fail loud (R7) rather than answer with no allergies.
 *
 * The validator is the second half of the same idea: prompts are advisory, so
 * the guarantee cannot live in the prompt. After generation, any visible text
 * that names a BLOCKING token is rejected, deterministically.
 *
 * ⛔ « BLOCKING » = `BELT_BLOCKING_SEVERITIES` (voir plus bas), c'est-à-dire
 * `medical` ET `strict` depuis le 2026-08-22 — plus `medical` seul. La
 * contrainte de l'élève qui dit « je ne digère pas le lactose » vaut
 * vérification, pas seulement consigne. `preference` n'y entre pas.
 */

import {
  type ForbiddenMatchOptions,
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import { surfaceFormsFor } from "./allergen_surface_forms.ts";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

/**
 * LES CATÉGORIES, ET LA SIXIÈME QUI MANQUAIT.
 *
 * ── `diet` ÉTAIT EN BASE ET PAS ICI, ET LE `as` LE CACHAIT ────────────────
 * La migration `20260810140000` a ajouté `'diet'` au CHECK de la colonne
 * (FF-042). Cette liste, elle, n'a pas bougé — et le mapper de lignes écrit
 * `row.kind as SafetyConstraintKind`, un cast qui ne vérifie RIEN. Une ligne
 * de régime se chargeait donc avec `kind: "diet"`, une valeur HORS UNION, sans
 * qu'aucun test ne rougisse — puisque le type mentait.
 *
 * ⚠️ Vérifié: aucun appelant ne branche aujourd'hui sur `kind` (seul le bloc de
 * consigne l'imprime en texte libre). Rien n'était donc encore FAUX — c'est le
 * prochain `switch` exhaustif ou le prochain `Record<SafetyConstraintKind, …>`
 * qui l'aurait été, et il l'aurait été en silence. C'est la classe de défaut la
 * plus chère à trouver: elle n'existe pas encore le jour où on l'introduit.
 *
 * Ce dépôt a une cicatrice nommée pour exactement ça: « `as` sur un type
 * étranger désarme le typecheck ». Constaté ici le 2026-08-11, en écrivant une
 * fixture qui déclarait un végan et que le compilateur a refusée.
 *
 * La liste est FERMÉE et elle doit rester le miroir du CHECK. Un jeton présent
 * en base et absent ici est pire qu'un jeton absent des deux: la ligne existe,
 * l'élève la voit comme respectée, et le code la traite comme une catégorie
 * qu'il ne connaît pas.
 */
export const SAFETY_CONSTRAINT_KINDS = [
  "allergy",
  "intolerance",
  "medical",
  "religious",
  "dislike",
  "diet",
] as const;

export const SAFETY_CONSTRAINT_SEVERITIES = [
  "medical",
  "strict",
  "preference",
] as const;

export type SafetyConstraintKind = typeof SAFETY_CONSTRAINT_KINDS[number];
export type SafetyConstraintSeverity =
  typeof SAFETY_CONSTRAINT_SEVERITIES[number];

export type StudentSafetyConstraint = {
  id: string;
  userId: string;
  kind: SafetyConstraintKind;
  /** R1: ASCII snake_case slugs. At least one of the three is non-null. */
  allergenRef: string | null;
  substanceRef: string | null;
  medicationClass: string | null;
  /**
   * Jeton de MALADIE déclarée (`condition_ref`). Distinct de `substanceRef`:
   * une maladie n'est pas une substance ingérée.
   *
   * ── CE QUE SON ABSENCE COÛTAIT, mesuré le 2026-08-06 ────────────────────
   * La colonne existait en base et n'était PAS dans le `select` d'à côté. Une
   * ligne `medical | diabetes | active` se chargeait donc avec ses trois refs à
   * `null`, `safetyConstraintsPromptBlock` rendait `null`, et
   * `medicalConstraintTokens` rendait `[]`. Autrement dit: **le bloc de
   * contraintes dures n'existait pas pour un diabétique**, et la posture
   * clinique ne durait qu'un seul tour — celui de la déclaration. Écrire une
   * ligne que personne ne relit, c'est le même accusé fantôme, en différé.
   */
  conditionRef: string | null;
  /**
   * FF-042 — LE JETON DE RÉGIME (`diet_ref`): `vegan`, `vegetarian`,
   * `pescatarian`.
   *
   * ⚠️ IL N'ENTRE JAMAIS DANS LA LISTE D'ÉVITEMENT, et c'est le piège que
   * `dietary_regime.ts` documente en tête: armer la ceinture sur « vegan »
   * ferait rejeter toute réponse qui décrit un plat comme végan — donc
   * précisément les bonnes réponses, et seulement pour les végans. C'est le
   * même défaut que `allergen_ref='diabetes'` a produit en run réel le
   * 2026-08-06. La ceinture reçoit l'EXPANSION (viande, poisson, œuf…), jamais
   * le nom du régime.
   *
   * Il est lu ici parce que la colonne existait en base sans lecteur — et ce
   * fichier porte déjà, sur `conditionRef` juste au-dessus, ce que coûte une
   * colonne qu'on écrit et que personne ne relit.
   */
  dietRef: string | null;
  severity: SafetyConstraintSeverity;
  declaredBy: "student" | "coach";
  /** Prose, optional. NEVER used for matching (R1: identifiers, not prose). */
  notes: string | null;
  contentLocale: string;
};

type StudentSafetyConstraintRow = {
  id: string;
  user_id: string;
  kind: string;
  allergen_ref: string | null;
  substance_ref: string | null;
  medication_class: string | null;
  condition_ref: string | null;
  diet_ref: string | null;
  severity: string;
  declared_by: string;
  notes: string | null;
  content_locale: string;
};

/** Structural type: tests inject a fake, production injects a SupabaseClient. */
type SafetyConstraintsQuery =
  & PromiseLike<{ data: StudentSafetyConstraintRow[] | null; error: unknown }>
  & { eq(column: string, value: string): SafetyConstraintsQuery };

export type SafetyConstraintsDb = {
  from(table: string): {
    select(columns: string): SafetyConstraintsQuery;
  };
};

export class SafetyConstraintsLoadError extends Error {
  readonly userId: string;
  constructor(userId: string, cause: unknown) {
    super(
      `[keel/safety_constraints] Failed to load student_safety_constraints for ` +
        `user ${userId}: ${
          cause instanceof Error ? cause.message : String(cause)
        }. Refusing to continue with an unknown constraint set.`,
    );
    this.name = "SafetyConstraintsLoadError";
    this.userId = userId;
  }
}

/**
 * Load every safety constraint of one student.
 *
 * Called on EVERY turn by the composer context builder. There is deliberately
 * no cache and no memoization: the whole point of this module is that the
 * answer is the current row set, not a remembered one. A student who declares
 * a new allergy at 14:02 is protected at 14:03, not after the next cron.
 *
 * Throws `SafetyConstraintsLoadError` on any query failure (see module note).
 */
export async function loadStudentSafetyConstraints(
  db: SafetyConstraintsDb,
  userId: string,
): Promise<StudentSafetyConstraint[]> {
  const id = String(userId ?? "").trim();
  if (!id) {
    throw new SafetyConstraintsLoadError(
      String(userId),
      new Error("empty user id"),
    );
  }
  let data: StudentSafetyConstraintRow[] | null;
  let error: unknown;
  try {
    ({ data, error } = await db
      .from("student_safety_constraints")
      .select(
        "id, user_id, kind, allergen_ref, substance_ref, medication_class, " +
          "condition_ref, diet_ref, severity, declared_by, notes, content_locale",
      )
      .eq("user_id", id)
      // RÉTRACTATION (migration 20260803160000). Une contrainte retirée reste
      // EN BASE pour l'audit clinique et cesse de mordre ici, au seul endroit
      // qui compte: le chargement de chaque tour. Filtrer à la source plutôt
      // qu'au consommateur, sinon chaque nouveau lecteur doit se souvenir de
      // le faire — et un qui oublie ré-arme une contrainte que l'élève a
      // corrigée.
      .eq("status", "active"));
  } catch (thrown) {
    throw new SafetyConstraintsLoadError(id, thrown);
  }
  if (error) throw new SafetyConstraintsLoadError(id, error);
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    kind: row.kind as SafetyConstraintKind,
    allergenRef: row.allergen_ref,
    substanceRef: row.substance_ref,
    medicationClass: row.medication_class,
    conditionRef: row.condition_ref,
    dietRef: row.diet_ref,
    severity: row.severity as SafetyConstraintSeverity,
    declaredBy: row.declared_by as "student" | "coach",
    notes: row.notes,
    contentLocale: row.content_locale,
  }));
}

// ---------------------------------------------------------------------------
// Le bloc de PROMPT — la moitié « avant génération » du double verrou
// ---------------------------------------------------------------------------

/**
 * ══════════════════════════════════════════════════════════════════════════
 * À QUI EST CHAQUE CONTRAINTE, QUAND IL Y A PLUSIEURS BOUCHES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT MESURÉ LE 2026-08-19, SUR LA LANE FOYER ──────────────────────
 * Le bloc s'intitulait « THIS STUDENT'S HARD CONSTRAINTS » — au SINGULIER,
 * pour une tablée de quatre — et chaque ligne était `- pistachio — allergy…`,
 * sans une bouche. Deux runs réels, deux erreurs OPPOSÉES:
 *
 *   F1 (`f0100001-…`) le modèle DEVINE la bouche et devine juste par chance:
 *       « keep it away from the rest of the table and serve it only to
 *       Odalric ».
 *   F2 (`f0100002-…`) il INVERSE: 120 g de traybake au pistachio dans la
 *       boîte de l'ALLERGIQUE, et l'avertissement « with no pistachio » écrit
 *       sur l'assiette du VOISIN.
 *
 * Le contraste était dans le MÊME prompt, dix lignes plus bas: les règles de
 * maison s'écrivent `- Peregrine: never serve fennel` — ATTACHÉES — et le
 * modèle les a appliquées 4 fois sur 4. On copie le patron qui marche.
 *
 * ── POURQUOI CE N'EST PAS UN `userId` QU'ON REMPLIT ────────────────────────
 * Une bouche sans compte n'a pas d'identifiant de compte, et ranger son
 * `member_id` dans un champ de COMPTE ferait une donnée qui ment (voir
 * `household_safety.ts`, qui laisse `userId: ""` pour cette raison). La bouche
 * arrive donc par une TABLE À PART, construite par l'appelant qui, lui, tient
 * le roster.
 *
 * ── REQUIS, `T | null`, JAMAIS `T?` ───────────────────────────────────────
 * « Un paramètre de garde optionnel est une garde désarmée » est une cicatrice
 * de ce dépôt (`safetyBand`, jamais passé). Le paramètre est donc REQUIS et
 * `null` est une VALEUR: elle dit « une seule bouche, le bloc sait déjà de qui
 * il parle », et le compilateur oblige chaque lane à la dire.
 */
export type SafetyConstraintTable = {
  /**
   * `constraint.id` → le prénom de la bouche qui la porte.
   *
   * Clé sur l'`id` de la CONTRAINTE et pas sur son `userId`: sur la lane
   * foyer, la moitié des contraintes vient de `household_member_allergies`,
   * dont les lignes n'ont pas de compte. L'`id` est le seul identifiant que
   * les deux sources partagent.
   */
  nameOf: ReadonlyMap<string, string>;
  /**
   * Combien de bouches mangent de ce plan. Sert à UNE chose: ne pas écrire
   * « the mouths at this table » pour une personne qui vit seule.
   */
  mouths: number;
};

/**
 * CE QU'ON ÉCRIT QUAND LE ROSTER NE REND PAS DE NOM.
 *
 * Jamais un nom inventé, jamais un silence: une ligne sans bouche est
 * exactement le défaut qu'on répare, et elle doit rester LISIBLE dans le
 * prompt comme dans le compteur de l'appelant (déclaré / attribué / non
 * attribué). « someone at this table » ne désigne personne et ne restreint
 * donc rien — ce qui est le comportement sûr, puisque la phrase du dessous
 * dit que la contrainte gouverne toute la casserole de toute façon.
 */
export const UNATTRIBUTED_MOUTH = "someone at this table";

/**
 * Les contraintes dures de l'élève, rendues pour le PROMPT.
 *
 * ── POURQUOI CETTE FONCTION N'EXISTAIT PAS, ET CE QUE ÇA COÛTAIT ──────────
 * Le §3.3 du pivot décrit un DOUBLE verrou: injecté dans le prompt ET vérifié
 * en sortie. La moitié « vérifié en sortie » était écrite, testée, posée au
 * point de passage unique du rendu. La moitié « injecté dans le prompt »
 * n'existait pas: `grep` du 2026-08-03 montre que `safety_constraints` n'avait
 * que deux consommateurs runtime, `applyKeelOutputLocks` et le skill
 * `plan_question`. Les deux seuls blocs qu'un tour d'élève KEEL recevait
 * étaient le plan et la doctrine du coach.
 *
 * Le modèle générait donc À L'AVEUGLE, et toute la sécurité reposait sur un
 * matcher post-hoc. Conséquence mesurée: « the nut butter option is the
 * stronger bag snack » servi à un élève anaphylactique.
 *
 * Pire, cette absence rendait FAUSSE la justification écrite du fail-open de
 * `run.ts` (« le prompt porte déjà les contraintes, seule la vérification
 * déterministe manque »). Le fail-open est acceptable quand une des deux
 * moitiés tient. Il ne l'était pas quand aucune ne tenait.
 *
 * ── CE QUE LE BLOC DIT, ET CE QU'IL SE GARDE DE DIRE ──────────────────────
 * Il nomme les identifiants, pas la prose des `notes` (R1: on branche sur des
 * identifiants). Et il autorise EXPLICITEMENT d'en parler pour les éviter ou
 * les expliquer — sans cette phrase, un modèle prudent refuse de répondre à
 * « est-ce que ce plat contient des arachides ? », qui est précisément la
 * question qu'un élève allergique a le droit de poser. C'est la même carve-out
 * que la condition de désarmement `disarmed_negated_mention` de la ceinture:
 * les deux moitiés du verrou doivent avoir la MÊME politique de négation,
 * sinon le prompt produit un texte que la ceinture rejette.
 *
 * ── ET DEPUIS LE 2026-08-19, IL DIT DE QUI EST CHAQUE LIGNE ──────────────
 * Quand `table` porte au moins deux bouches. Le pourquoi, les deux runs qui
 * l'ont mesuré et le piège de l'attribution-sans-casserole sont écrits sur
 * `SafetyConstraintTable`, juste au-dessus. Une seule bouche rend le bloc
 * d'avant, octet pour octet.
 *
 * Rend `null` quand il n'y a rien à dire — un bloc vide dans un prompt est du
 * bruit qui coûte du cache.
 */
export function safetyConstraintsPromptBlock(
  constraints: readonly StudentSafetyConstraint[] | null,
  /**
   * REQUIS, `T | null`. `null` ⇒ une seule bouche: le bloc parle d'elle et il
   * le dit déjà par son titre. Non-null ⇒ chaque ligne porte son prénom.
   */
  table: SafetyConstraintTable | null,
): string | null {
  if (!constraints || constraints.length === 0) return null;
  // « Plusieurs bouches » est ce qui décide, pas « lane foyer »: l'entrée du
  // produit est un foyer À UNE personne (§5), et lui écrire « the mouths at
  // this table » serait faux. Un foyer d'une bouche rend donc EXACTEMENT le
  // bloc d'avant, octet pour octet, et un test le tient.
  const attributed = table !== null && table.mouths >= 2;
  const lines: string[] = [];
  for (const constraint of constraints) {
    const refs = safetyConstraintTokens(constraint);
    if (refs.length === 0) continue;
    // LE PRÉNOM DEVANT, comme `- Peregrine: never serve fennel` — le seul
    // patron de ce prompt dont on ait mesuré qu'il est appliqué à la bonne
    // personne, 4 fois sur 4.
    const mouth = attributed
      ? `${table!.nameOf.get(constraint.id)?.trim() || UNATTRIBUTED_MOUTH}: `
      : "";
    lines.push(
      `- ${mouth}${refs.join(", ")} — ${constraint.kind}, severity=${constraint.severity}` +
        ` (declared by ${constraint.declaredBy})`,
    );
  }
  // LES MALADIES DÉCLARÉES, dans leur propre section — et pas dans la liste
  // d'évitement au-dessus, pour la raison écrite sur `safetyConstraintTokens`.
  //
  // C'est ce qui rend la posture clinique DURABLE. `declared_medical_condition`
  // ne vaut que pour le tour de la déclaration; mesuré le 2026-08-06, l'élève
  // disait « I have type 2 diabetes » au tour 1 et recevait au tour 3 un plan
  // de repas sans la moindre trace de sa maladie. Ce n'était pas de la
  // retenue, c'était de l'amnésie.
  //
  // ⚠️ UNE MALADIE AUSSI EST « THIS STUDENT'S » AU SINGULIER. Sur une tablée,
  // la même phrase dirait à un parent que SA maison a un diabète, et le modèle
  // choisirait tout seul de qui. Quand la table est là, on nomme; sinon la
  // ligne reste octet pour octet celle d'avant.
  const conditions = constraints
    .map((c) => ({
      ref: String(c.conditionRef ?? "").trim(),
      mouth: attributed
        ? (table!.nameOf.get(c.id)?.trim() || UNATTRIBUTED_MOUTH)
        : "",
    }))
    .filter((c) => c.ref !== "");
  const conditionHeader = attributed
    ? `=== DIAGNOSED CONDITIONS THE PEOPLE AT THIS TABLE HAVE TOLD YOU ABOUT: ${
      [...new Set(conditions.map((c) => `${c.mouth} — ${c.ref}`))].join("; ")
    } ===`
    : `=== DIAGNOSED CONDITIONS THIS STUDENT HAS TOLD YOU ABOUT: ${
      [...new Set(conditions.map((c) => c.ref))].join(", ")
    } ===`;
  const conditionLines = conditions.length > 0
    ? [
      "",
      conditionHeader,
      "Do not prescribe for these: no target numbers, no foods-to-avoid list for",
      "the condition, no meal timing to manage it, and nothing about medication",
      "or dose. The clinician who has their results decides that.",
      "You MAY name the condition freely — to answer, to warn, to help them",
      "prepare what they will ask their doctor. Refusing to speak about it is",
      "not caution.",
      "Do not re-open it every turn. It is context, not the subject.",
    ]
    : [];

  if (lines.length === 0 && conditionLines.length === 0) return null;
  const hasMedical = constraints.some((c) => c.severity === "medical");
  // Une ligne SANS aliment à éviter (une maladie seule) ne doit pas produire un
  // en-tête « hard constraints » vide au-dessus de rien.
  if (lines.length === 0) return conditionLines.slice(1).join("\n");
  return [
    attributed
      ? "=== THE HARD CONSTRAINTS OF THE MOUTHS AT THIS TABLE (source: " +
        "student_safety_constraints + household_member_allergies) ==="
      : "=== THIS STUDENT'S HARD CONSTRAINTS (source: student_safety_constraints) ===",
    "These are not preferences. They are loaded fresh every turn.",
    ...lines,
    // ⚠️ LA MOITIÉ QUI EMPÊCHE LE PRÉNOM DE DEVENIR UNE PERMISSION.
    //
    // Nommer la bouche SANS cette phrase ferait EMPIRER le défaut mesuré: F1
    // avait déjà lu la liste détachée comme « je le sers à l'autre », et un
    // prénom devant la ligne serait l'autorisation explicite de le faire.
    // L'attribution sert à poser l'avertissement sur la BONNE assiette; elle
    // ne rétrécit jamais la règle à une assiette.
    //
    // ⚠️ ET ELLE TRANCHE LA CONTRADICTION DU MÊME MESSAGE. Le brief du foyer
    // ORDONNE dix lignes plus bas de servir l'habitude d'une personne (« count
    // their own thing in the shopping list ») et de composer l'envie de la
    // maison — pendant que ce bloc-ci interdit l'aliment que l'une ou l'autre
    // nomme. Deux consignes opposées dans le même prompt, et c'est la
    // contradiction qui a produit les 120 g de traybake au pistachio dans la
    // boîte de l'allergique. La ceinture de sortie, elle, est BINAIRE sur tout
    // le texte du plan: un seul plat qui nomme l'allergène vide la semaine
    // entière (422 `empty_meal`). Cette phrase est ce qui aligne la consigne
    // sur le verrou — elle ne desserre rien, elle dit au modèle ce que le
    // verrou exigeait déjà.
    ...(attributed
      ? [
        "",
        "WHOSE EACH ONE IS — AND WHY IT STILL GOVERNS THE WHOLE POT.",
        "The name says who would be harmed, so a warning lands on the right",
        "plate and never on someone else's. It does NOT narrow the rule to that",
        "person: ONE MOUTH'S HARD CONSTRAINT GOVERNS EVERYTHING this household",
        "cooks, buys, boxes or serves — for everyone, at every moment.",
        "So there is no plate any of these foods may be on. Never plan one and",
        "keep it away from the person it belongs to, never serve it 'only to'",
        "someone else, never put it in one box and not another.",
        "That includes what a person 'has their own' at a moment, and what the",
        "house asked for this week: if either names one of the foods above, do",
        "not cook it, do not buy it, do not write it anywhere. Put something",
        "else in that spot instead, and simply write the replacement.",
      ]
      : []),
    "",
    "NEVER suggest, recommend or include any of the above, and never suggest a",
    "food that ordinarily contains one (a nut butter for a peanut constraint, a",
    "satay sauce, a tahini for sesame). When you propose anything to eat, check",
    "it against this list first.",
    "You MAY name them to warn, to exclude, or to answer a direct question about",
    "them — avoiding a food requires being able to say its name.",
    ...(hasMedical
      ? [
        "A medical-severity constraint is not something to reason around: if a",
        "question turns on it clinically, say so and point to a doctor.",
      ]
      : []),
    // ⚠️ CE BLOC NE DIT PAS « NE NOMME PAS L'ALIMENT DANS UN PLAN », ET C'EST
    // UNE DÉCISION DE PÉRIMÈTRE, PRISE SUR UNE MESURE.
    //
    // ITÉRATIONS 2 ET 3 DE CE LOT, RETIRÉES. Deux runs réels ont montré que le
    // 422 `empty_meal` a DEUX causes distinctes, et qu'une seule est la mienne:
    //
    //   · l'ALIMENT est réellement dans le plan — pistachio butter cuisiné,
    //     mis en boîte et acheté pour un foyer où quelqu'un y est allergique
    //     (`b0000001-…`: 10 morsures, dont 4 sur des ingrédients et la liste
    //     de courses). C'est le défaut d'ATTRIBUTION, celui que ce bloc-ci
    //     répare;
    //   · l'aliment est correctement RETIRÉ, et le modèle l'explique:
    //     « I have swapped the requested pistachio butter for… »
    //     (`b2000001-…`, `b2000002-…`, `b2000003-…`: 1 morsure chacun, toutes
    //     dans `dishes[].why`). Ce défaut-là appartient au lot voisin, qui l'a
    //     mesuré sur la lane solo et l'a réparé DANS LE MÊME MESSAGE, douze
    //     lignes plus bas — `NAMING ONE OF THEM IN A PLAN IS NOT A WARNING`
    //     (`meal_generation.ts`), avec une échappatoire nommée et mesurée à
    //     zéro morsure: « one of the foods on your medical list ».
    //
    // J'avais écrit la même règle ici. Elle est partie: deux consignes qui
    // disent la même chose à dix lignes d'écart, avec deux formulations
    // d'échappatoire différentes, sont un générateur de divergence — et la
    // preuve que la leur suffit est dans le run `a3000001-…`, où le modèle a
    // recopié LEUR phrase mot pour mot alors que la mienne ne la contenait pas.
    //
    // ⚠️ DÉPENDANCE À CONNAÎTRE: leur bloc est posé sous la MÊME condition que
    // celui-ci (`safetyBlock` non nul, `meal_generation.ts`). S'il disparaît,
    // la règle de nommage disparaît avec lui — et c'est alors ici qu'il faudra
    // la réécrire, pas ailleurs.
    ...conditionLines,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Deterministic post-generation validator
// ---------------------------------------------------------------------------

/**
 * ⛔ S2 — LES SÉVÉRITÉS QUI ARMENT LA CEINTURE DE SORTIE, ÉCRITES UNE FOIS.
 *
 * ── LE DÉFAUT QUE CETTE CONSTANTE FERME ───────────────────────────────────
 * La ceinture ne lisait que `severity='medical'`, et le filtre était RECOPIÉ à
 * deux endroits de ce fichier (`medicalConstraintTokens` l. 541 et
 * `findMedicalConstraintViolations` l. 591 — les seuls des SIX sites énumérés
 * qui appartiennent à la ceinture ; les quatre autres — `safety_constraints.ts`
 * l. 408, `generate-household-meal-v1/index.ts` l. 2505, `allergen_bridge.ts`
 * l. 131 et l. 146 — sont des blocs de PROMPT ou des gardes Tier 0, et ils
 * gardent leur `medical` seul, chacun pour une raison écrite chez lui).
 * Mesuré le 2026-08-22 sur la base vivante:
 * **6 contraintes actives** portaient un jeton que rien ne vérifiait —
 * `dairy`, `lactose`, `gluten`, `fructose`, `fruits_de_mer`, `mustard`. Le
 * compteur de la ceinture rendait `bit 0 / 6`: armée, muette, et impossible à
 * distinguer d'une ceinture qui n'a rien trouvé.
 *
 * ── ET CE N'ÉTAIT DÉJÀ PLUS COHÉRENT AVEC LE RESTE DU PRODUIT ─────────────
 * `plan_question/allergen_bridge.ts:76` porte `BLOCKING_SEVERITIES = {medical,
 * strict}` depuis longtemps: un `strict` BLOQUAIT déjà l'échange d'un plat,
 * pendant que le même `strict` laissait passer le TEXTE qui le nomme. Élargir
 * ici ne crée pas une divergence, ça en referme une.
 *
 * ── CE QUI N'ENTRE PAS, ET POURQUOI CE N'EST PAS UN OUBLI ─────────────────
 *   · `preference` — 9 lignes actives (`aubergine`, `beetroot`, `coriander`,
 *     `okra`, `olive`, `fructose`). Une déception n'est pas un danger, et le
 *     prompt le dit déjà mot pour mot (`SEVERITY_READING_BLOCK`: « it is NOT a
 *     safety matter »). Une ceinture qui viderait la semaine d'un élève parce
 *     qu'un plat nomme l'olive est une ceinture qu'on débranche.
 *   · `dietRef` — les **8** lignes `kind='diet'` des 14 `strict` (vegan 2,
 *     vegetarian 3, pescatarian 3) n'entrent pas, parce que
 *     `safetyConstraintTokens` ne les rend pas. C'est la cicatrice `diabetes`:
 *     armer sur le NOM d'un régime ferait rejeter la réponse qui explique le
 *     régime. La ceinture reçoit l'EXPANSION (viande, poisson, œuf…), jamais le
 *     nom. ⇒ « couvrir `strict` » veut dire **6 lignes sur 14**, et c'est le
 *     seuil du lot.
 *   · `conditionRef` — voir le bloc sur `safetyConstraintTokens` juste dessous.
 *
 * ⚠️ CE QUE CET ÉLARGISSEMENT COÛTE, ET IL EST ASSUMÉ (plan §⑨ n° 4). Le taux
 * de blocage MONTE. En conversation, le texte est remplacé — d'où le SECOND
 * repli, `STRICT_BLOCK_FALLBACK_EN` (`keel_output_locks.ts`): servir « pose la
 * question à un médecin » à un intolérant au lactose est faux 100 % des fois
 * où ça sort. Sur les deux lanes de génération, une morsure VIDE le plan
 * (HTTP 422 `empty_meal`) — d'où la correction jumelle de
 * `SEVERITY_READING_BLOCK` dans `meal_generation.ts`, qui disait au modèle que
 * seul un nom `severity=medical` détruit la semaine.
 *
 * Le retour arrière tient en une ligne: retirer `"strict"` de ce `Set`.
 */
export const BELT_BLOCKING_SEVERITIES: ReadonlySet<SafetyConstraintSeverity> =
  new Set<SafetyConstraintSeverity>(["medical", "strict"]);

/**
 * Le prédicat, pour que les deux sites n'aient plus rien à recopier.
 *
 * Il prend `string` et non `SafetyConstraintSeverity` À DESSEIN: les lignes
 * arrivent de la base par un `as` (voir l'en-tête `kind`), donc une valeur hors
 * union est possible au runtime. Elle doit alors répondre `false` — ne PAS
 * armer sur une sévérité qu'on ne connaît pas — et pas faire passer le
 * compilateur pour un garde.
 */
export function isBeltBlockingSeverity(severity: string): boolean {
  return BELT_BLOCKING_SEVERITIES.has(severity as SafetyConstraintSeverity);
}

/**
 * Every identifier carried by a constraint (prose `notes` excluded, R1).
 *
 * ⚠️ `conditionRef` N'Y EST PAS, ET NE DOIT JAMAIS Y ENTRER.
 *
 * Cette liste est celle des choses QU'ON NE DOIT PAS PROPOSER DE MANGER, et
 * elle arme la ceinture de sortie. Une maladie n'est pas un aliment à éviter:
 * y verser `diabetes` ferait rejeter toute réponse qui nomme le diabète — donc
 * exactement celles qu'un diabétique a besoin de lire.
 *
 * Ce n'est pas théorique. Le 2026-08-06, le dispatcher a écrit quelques lignes
 * difformes (`allergen_ref='diabetes'`, `substance_ref='glucose'`), et la
 * ceinture s'est armée dessus: un message d'urgence — « take fast-acting
 * glucose now and call emergency services » — a été REMPLACÉ par un refus
 * poli, en run réel. Mettre `conditionRef` ici généraliserait ce bâillon à
 * tous les élèves malades.
 *
 * La maladie gouverne la POSTURE (voir `safetyConstraintsPromptBlock`), pas la
 * liste d'évitement.
 */
export function safetyConstraintTokens(
  constraint: StudentSafetyConstraint,
): string[] {
  return [
    constraint.allergenRef,
    constraint.substanceRef,
    constraint.medicationClass,
  ].filter((token): token is string => Boolean(token && token.trim()));
}

/**
 * Les jetons que la ceinture refuse de voir écrits, tous porteurs confondus.
 *
 * ⚠️ LE NOM DIT ENCORE `medical` ET LA FONCTION COUVRE `medical` + `strict`.
 * C'est délibéré, et c'est un arbitrage écrit (plan §⑨). Renommer coûterait
 * une passe sur cinq symboles exportés et une dizaine de fichiers d'un dépôt
 * partagé qui porte 313 fichiers modifiés par d'autres sessions — un
 * générateur de collisions pour un gain de lecture. Ce que le lecteur doit
 * savoir est donc écrit ici, et le SEUL endroit qui décide reste
 * `BELT_BLOCKING_SEVERITIES`, dix lignes plus haut.
 *
 * ⚠️ Cette fonction-ci n'a AUCUN appelant de production (mesuré le 2026-08-22,
 * commentaires et tests écartés): elle est lue par trois fichiers de test comme
 * « ce qui arme la ceinture ». Raison de plus pour qu'elle ne diverge pas du
 * site qui arme vraiment: une liste de diagnostic qui ne dit pas la même chose
 * que la garde est un mensonge que personne ne détecte.
 */
export function medicalConstraintTokens(
  constraints: readonly StudentSafetyConstraint[],
): string[] {
  const seen = new Set<string>();
  for (const constraint of constraints) {
    if (!isBeltBlockingSeverity(constraint.severity)) continue;
    for (const token of safetyConstraintTokens(constraint)) {
      seen.add(token.trim().toLowerCase());
    }
  }
  return [...seen];
}

export type MedicalConstraintViolation = {
  constraintId: string;
  /**
   * ⛔ S2 — LA SÉVÉRITÉ DE LA LIGNE QUI A MORDU, ET POURQUOI ELLE EST ICI.
   *
   * Depuis que la ceinture couvre `medical` ET `strict`, l'appelant ne peut
   * plus DÉDUIRE la sévérité: il en voit deux. Et il en a besoin, parce que le
   * texte de remplacement n'est pas le même — servir « pose la question à un
   * médecin » à un intolérant au lactose est faux à chaque fois.
   *
   * ⚠️ Elle est PORTÉE, pas re-cherchée. L'alternative était de rejoindre
   * `constraintId` sur la liste de contraintes chez l'appelant; ce dépôt a déjà
   * payé cette forme (`constraint_ref oublie condition_ref`): une jointure par
   * identifiant qui rate rend un défaut MUET, ici un repli médical servi pour
   * une intolérance ou l'inverse. La valeur voyage avec la morsure.
   */
  severity: SafetyConstraintSeverity;
  /** The slug that matched, canonical form. */
  token: string;
  /** The literal substring of the generated text that matched. */
  matchedText: string;
  index: number;
};

export class MedicalConstraintViolationError extends Error {
  readonly violations: MedicalConstraintViolation[];
  constructor(violations: MedicalConstraintViolation[]) {
    super(
      `[keel/safety_constraints] Generated text names ${violations.length} ` +
        `blocking constraint token(s): ` +
        // La SÉVÉRITÉ est dans le message: l'incident se lit dans un log, et
        // « peanut » à `medical` et « lactose » à `strict` n'appellent pas la
        // même lecture.
        violations.map((v) => `${v.token}/${v.severity} ("${v.matchedText}")`)
          .join(", ") +
        ". Output rejected; regenerate.",
    );
    this.name = "MedicalConstraintViolationError";
    this.violations = violations;
  }
}

/** Alias, not a copy: the negation policy is one decision, made in one place. */
export type MedicalConstraintCheckOptions = ForbiddenMatchOptions;

/**
 * Pure, deterministic, zero-I/O. Returns every blocking-token occurrence that
 * survives the negation exceptions. Callers that regenerate use this one;
 * callers that must fail loudly use `assertNoMedicalConstraintViolation`.
 *
 * ⛔ S2 — CE QU'ELLE COUVRE DEPUIS LE 2026-08-22: `BELT_BLOCKING_SEVERITIES`,
 * donc `medical` ET `strict`, et rien d'autre. Le nom garde son `Medical`
 * historique — l'arbitrage et sa raison sont écrits sur
 * `medicalConstraintTokens`. Chaque morsure PORTE sa `severity`: c'est ce qui
 * permet à l'appelant de choisir le bon texte de remplacement au lieu de
 * servir un renvoi au médecin pour une intolérance.
 */
export function findMedicalConstraintViolations(
  text: string,
  constraints: readonly StudentSafetyConstraint[],
  options: MedicalConstraintCheckOptions = {},
): MedicalConstraintViolation[] {
  // The engine lives in `forbidden_matcher.ts` -- see that file's header for
  // why. This function keeps its exact signature, its exact semantics and its
  // exact tests; what it no longer keeps is a private second copy of the
  // normalization and negation rules that the coach-doctrine lock also needs.
  const terms: ForbiddenTerm[] = [];
  // La sévérité de CHAQUE règle, par son identifiant — le moteur ne rend que
  // `ruleId`, et une jointure faite chez l'appelant serait la jointure qui
  // rate en silence.
  const severityByRule = new Map<string, SafetyConstraintSeverity>();
  for (const constraint of constraints) {
    if (!isBeltBlockingSeverity(constraint.severity)) continue;
    severityByRule.set(constraint.id, constraint.severity);
    for (const token of safetyConstraintTokens(constraint)) {
      // LES FORMES DE SURFACE, et leur absence était le trou (QA agent 4).
      //
      // Le moteur supporte `surfaceForms` depuis toujours et la doctrine du
      // coach s'en sert; cette moitié-ci ne les alimentait pas, donc la garde
      // MÉDICALE — la plus critique des deux — était la seule à ne matcher
      // qu'un mot. Mesuré: "the nut butter option is the stronger bag snack"
      // est SORTI, `reason: "clean"`, sur un élève `allergen_ref='peanut'`
      // `severity='medical'`.
      //
      // La table est plate, fermée, écrite à la main (voir son en-tête). Un
      // slug qui n'y figure pas garde exactement son comportement d'avant:
      // `surfaceFormsFor` rend `[]`, jamais `null`, donc l'ajout ne peut pas
      // réduire la couverture.
      terms.push({
        ruleId: constraint.id,
        token,
        surfaceForms: surfaceFormsFor(token),
      });
    }
  }
  return findForbiddenMatches(text, terms, options).map((m) => ({
    constraintId: m.ruleId,
    // ⛔ LE REPLI EST `medical`, JAMAIS `strict`. Un identifiant introuvable
    // dans la table ci-dessus est impossible par construction (les règles en
    // viennent) — mais si ça arrivait, la seule valeur sûre est la plus
    // protectrice. Un `strict` par défaut ferait servir le texte le plus doux
    // à l'élève le plus fragile.
    severity: severityByRule.get(m.ruleId) ?? "medical",
    token: m.token,
    matchedText: m.matchedText,
    index: m.index,
  }));
}

/**
 * Fail-loud gate to run on every generated visible text before it is sent.
 * Throws `MedicalConstraintViolationError` listing the offending tokens.
 */
export function assertNoMedicalConstraintViolation(
  text: string,
  constraints: readonly StudentSafetyConstraint[],
  options: MedicalConstraintCheckOptions = {},
): void {
  const violations = findMedicalConstraintViolations(text, constraints, options);
  if (violations.length === 0) return;
  console.error("keel.safety_constraints.medical_violation", {
    violation_count: violations.length,
    tokens: [...new Set(violations.map((v) => v.token))].join(","),
    // ⛔ S2 — LA VENTILATION PAR SÉVÉRITÉ, sinon le compteur de la ceinture ne
    // sait pas dire ce que l'élargissement a ajouté. Le nom de l'événement,
    // lui, ne bouge pas: c'est une clé de télémétrie, et la renommer casserait
    // les tableaux de bord qui la suivent.
    severities: [...new Set(violations.map((v) => v.severity))].sort().join(","),
    detail: "Generated output rejected before delivery; regenerate.",
  });
  throw new MedicalConstraintViolationError(violations);
}
