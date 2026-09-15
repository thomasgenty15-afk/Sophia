/**
 * LE FOYER — L'ALLERGIE D'UNE BOUCHE QUI N'A PAS DE COMPTE.
 *
 * Autorité produit: docs/keel/CHANTIER-FOYER-PROFILS.md, lot 4.
 * Table: `household_member_allergies` (migration 20260810170000).
 *
 * ── LE TROU, ET POURQUOI C'EN EST UN DE SÉCURITÉ ────────────────────────────
 *
 * `student_safety_constraints` est clée sur `user_id`.
 * `generate-household-meal-v1` en fait l'union du foyer — « une allergie d'un
 * seul membre gouverne TOUTE la casserole » — et refuse de composer si la
 * lecture échoue. Depuis le lot 1, une bouche peut exister SANS COMPTE: son
 * allergie n'avait donc nulle part où vivre, et n'entrait dans aucune union.
 * L'écran, lui, la réclamait déjà.
 *
 * ── LES DEUX CHOSES QUE CE MODULE SÉPARE, ET QU'IL NE FAUT JAMAIS FONDRE ────
 *
 *   ALLERGIE — médicale. Elle rejoint l'union de sécurité, avec le MÊME
 *   fail-closed: une lecture cassée arrête la génération, elle ne la laisse pas
 *   composer sans ceinture.
 *
 *   RÈGLE DE MAISON — parentale. Elle garde le verrou existant
 *   (`household_restriction_lock.ts`), celui qui EFFACE le « pourquoi » du plat
 *   pour que Sophia ne porte pas une décision domestique comme un conseil de
 *   santé.
 *
 * Les faire passer par le même chemin tairait la raison médicale d'une allergie
 * et classerait un allergène au rang d'un Nutella interdit. C'est pour ça que
 * `householdHardConstraints` rend DEUX sorties d'un seul geste: la séparation
 * est décidée UNE fois, ici, et pas dans un `where` que chaque lecteur doit se
 * rappeler d'écrire.
 *
 * ── POURQUOI LA BASE STOCKE UN MOT ET PAS UN SLUG ──────────────────────────
 *
 * C'est le compte maître qui écrit, à la main, dans sa langue: « arachide »,
 * « lait de vache ». R1 demande qu'on branche sur des IDENTIFIANTS — donc la
 * résolution vit ici, à côté du matcher et de la table des formes de surface,
 * et pas en SQL où elle serait une seconde copie de cette table.
 *
 * Deux conséquences voulues:
 *   · la table des formes de surface grandit ⇒ les lignes déjà écrites gagnent
 *     la couverture, sans migration de données;
 *   · « arachide » et « cacahuète » retrouvent le slug canonique `peanut`, donc
 *     ses formes de surface (« satay », « nut butter », « PB »). Sans cette
 *     étape, une allergie déclarée en français ne mordrait que sur le mot
 *     français — c'est-à-dire une garde à moitié désarmée, la faute que ce
 *     dépôt a déjà payée deux fois sur ce même matcher.
 *
 * PURE + un seul lecteur d'I/O, qui LÈVE. Aucun cache: la question posée est
 * « qui est allergique maintenant », pas « qui l'était ».
 */

import {
  ALLERGEN_SURFACE_FORMS,
  surfaceFormsFor,
} from "./allergen_surface_forms.ts";
import { normalizeForMatch, tokenPattern } from "./forbidden_matcher.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";

/** Une ligne de `household_member_allergies`, réduite à ce qui compte ici. */
export interface HouseholdAllergyRow {
  id: string;
  memberId: string;
  /** Le mot de la personne, dans sa langue. Jamais un slug. */
  label: string;
}

/** Une ligne de `household_food_restrictions` — le POUVOIR DOMESTIQUE. */
export interface HouseholdHouseRuleRow {
  memberId: string;
  label: string;
}

// ---------------------------------------------------------------------------
// La résolution d'un mot vers des identifiants
// ---------------------------------------------------------------------------

function matchesLabel(label: string, token: string): boolean {
  const text = normalizeForMatch(label);
  if (!text) return false;
  // Un `RegExp` neuf à chaque appel: `tokenPattern` rend un motif `g`, dont le
  // `lastIndex` serait porté d'un appel à l'autre si on le mémorisait.
  return tokenPattern(token).test(text);
}

/** `Lait de vache` -> `lait_de_vache`. ASCII snake_case (R1). */
function slugifyLabel(label: string): string {
  return normalizeForMatch(label)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * ⛔ UNE ALLERGIE QUE LA CEINTURE DE SORTIE NE SAIT COUVRIR QUE PAR LE MOT TAPÉ.
 *
 * ── LE DÉFAUT, MESURÉ LE 2026-08-22 (lot S1b) ─────────────────────────────
 * `householdAllergenRefs("fruits de mer")` rendait `["fruits_de_mer"]`, et
 * `surfaceFormsFor("fruits_de_mer")` rendait `[]`. La ceinture partait donc
 * chercher UNE CHAÎNE FRANÇAISE DANS UN TEXTE ANGLAIS. Mesuré, contrainte
 * `fruits_de_mer` en `severity='medical'`:
 *
 *     « des fruits de mer ce soir »  -> 1 morsure
 *     « seafood platter »            -> 0
 *     « a shrimp and crab platter »  -> 0
 *
 * — c'est-à-dire une ceinture ARMÉE ET MORTE EN ANGLAIS, la langue par défaut
 * de la génération. Et elle ne disait rien: aucun log, aucun compteur, aucun
 * champ. Un lecteur voyait une contrainte de plus dans l'union et concluait
 * qu'elle était tenue.
 *
 * ── POURQUOI ÇA LÈVE, ET CE QUE ÇA COÛTE ──────────────────────────────────
 * Une ceinture qui échoue bruyamment sur une lane sans second essai REFUSE le
 * plan. C'est le bon comportement pour une allergie — mais il faut le SAVOIR,
 * parce qu'il se paie:
 *
 *   · `generate-household-meal-v1:2338` n'entoure PAS `householdHardConstraints`
 *     d'un `try`: la levée remonte au `catch` de tête et sort en **HTTP 500**,
 *     `{ok:false, error:<ce message>}`. `readEdgeRefusal` prend le champ
 *     `error` pour un JETON, `edgeRefusalKey` ne le connaît pas, et
 *     `MealBuilder.tsx:869` affiche donc CE MESSAGE TEL QUEL — une phrase
 *     d'ingénieur en anglais, sous un code qui se lit comme une panne. Le refus
 *     traduit qui conviendrait existe déjà (`safety_constraints_unreadable`,
 *     503) et il n'est pas branché ici: fiche `S1b-c`.
 *   · la lane de conversation, elle, l'attrape (`loadHouseholdTurnSafety`) et
 *     dégrade comme prévu: aucune nourriture proposée, et elle le dit.
 *
 * ── CE QUE ÇA ÉCHANGE, ET COMMENT ON REVIENT EN ARRIÈRE ───────────────────
 * ⛔ Ceci RETIRE une propriété écrite et testée du module: « un mot inconnu
 * garde le mot, jamais rien », la propriété qui le rendait incapable de
 * RÉDUIRE la couverture. Une allergie au kiwi ne compose plus AUCUN plan, là
 * où elle recevait avant une couverture littérale sur son propre mot. C'est un
 * échange assumé, pas un oubli: mesuré sur les libellés réellement en base
 * (`household_member_allergies`: peanut, pistachio, gluten, celeriac,
 * arachide, sesame — 6 lignes), la levée mord **0 fois sur 6**, et la fixture
 * obligatoire (« arachide ») passe.
 *
 * LE RETOUR ARRIÈRE EST UNE LIGNE: supprimer le bloc `if` ci-dessous dans
 * `householdAllergenRefs`. Il rend exactement le comportement d'avant, silence
 * compris.
 *
 * ⚠️ ET LA VRAIE RÉPARATION N'EST PAS ICI: c'est d'écrire les formes de surface
 * du mot dans `allergen_surface_forms.ts`. La levée n'est qu'un réveil.
 */
export class HouseholdAllergenWithoutSurfaceFormsError extends Error {
  readonly refs: readonly string[];
  constructor(refs: readonly string[]) {
    super(
      "[keel/household_safety] a household allergy resolves to no catalogued " +
        `allergen (${refs.join(", ")}); the output belt would only match the ` +
        "exact word that was typed, so no meal may be composed. Add its " +
        "surface forms to ALLERGEN_SURFACE_FORMS.",
    );
    this.name = "HouseholdAllergenWithoutSurfaceFormsError";
    this.refs = [...refs];
  }
}

/**
 * `belt_ref_without_forms` — LE COMPTEUR QUI DOIT RESTER À ZÉRO.
 *
 * Il compte les libellés dont AUCUN identifiant ne porte de forme de surface,
 * c'est-à-dire exactement les cas où la ceinture de sortie n'a rien d'autre que
 * le mot tapé. Il est incrémenté AVANT la levée, pour qu'un appelant qui
 * l'attrape (la lane de conversation le fait) ne fasse pas disparaître le fait.
 *
 * ⛔ Un `console.error` ne se groupe pas et ne se compare pas d'un run à
 * l'autre; c'est la cicatrice `V0-B-bis` (« un remplissage qui lève en boucle
 * ressemblait à un remplissage qui marche »). Les deux sont donc écrits: le log
 * structuré pour le runtime, le compteur pour le test.
 */
export const BELT_REF_WITHOUT_FORMS_TAG =
  "keel.household_safety.belt_ref_without_forms";

let beltRefWithoutForms = 0;

/** La valeur du compteur. Seuil produit: **0**. */
export function beltRefWithoutFormsCount(): number {
  return beltRefWithoutForms;
}

/** Remise à zéro — pour les tests, jamais pour le runtime. */
export function resetBeltRefWithoutFormsCount(): void {
  beltRefWithoutForms = 0;
}

/**
 * LES IDENTIFIANTS QU'UN LIBELLÉ PORTE, du plus canonique au plus littéral.
 *
 * Trois crans, dans cet ordre, et l'ordre est la règle:
 *
 *   1. le libellé NOMME un slug connu (« peanut oil » -> `peanut`);
 *   2. sinon, il correspond à une FORME DE SURFACE (« arachide » -> `peanut`);
 *   3. et dans tous les cas on garde le mot de la personne, slugifié.
 *
 * Le cran 3 garde le mot de la personne: sans lui, un mot inconnu de la table
 * ne serait porté par rien.
 *
 * ⛔ ~~Le cran 3 rend cette fonction incapable de RÉDUIRE la couverture: le
 * pire cas est exactement ce qu'on aurait eu sans les crans 1 et 2.~~ CE
 * N'EST PLUS VRAI DEPUIS LE 2026-08-22 (lot S1b), et c'est délibéré. Il y a un
 * CRAN 4: si aucun des identifiants rendus ne porte de forme de surface, la
 * fonction LÈVE au lieu de rendre une couverture littérale muette. Le pourquoi,
 * la mesure, ce que ça coûte et le geste du retour arrière sont écrits sur
 * `HouseholdAllergenWithoutSurfaceFormsError`, juste au-dessus.
 *
 * ⚠️ UNE AMBIGUÏTÉ REND PLUSIEURS SLUGS, elle n'en choisit pas un. « nut
 * butter » est une forme de surface de `peanut` ET de `tree_nut`; en garder un
 * seul déciderait, à la place d'un parent, laquelle des deux allergies compte.
 * La doctrine de la table est écrite: sur-bloquer escalade, sous-bloquer sert
 * l'allergène, et seul le premier est récupérable.
 */
export function householdAllergenRefs(label: string): string[] {
  const text = String(label ?? "").trim();
  if (!text) return [];

  const byName = Object.keys(ALLERGEN_SURFACE_FORMS)
    .filter((slug) => matchesLabel(text, slug));

  const canonical = byName.length > 0 ? byName : Object.entries(
    ALLERGEN_SURFACE_FORMS,
  )
    .filter(([, forms]) => forms.some((form) => matchesLabel(text, form)))
    .map(([slug]) => slug);

  const refs = [...canonical];
  const literal = slugifyLabel(text);
  if (literal && !refs.includes(literal)) refs.push(literal);

  // ⛔ LA CEINTURE NE PEUT PLUS SE TAIRE (2026-08-22, lot S1b).
  // Voir `HouseholdAllergenWithoutSurfaceFormsError` pour la mesure, l'arbitrage
  // et le geste EXACT du retour arrière.
  if (!refs.some((ref) => surfaceFormsFor(ref).length > 0)) {
    beltRefWithoutForms += 1;
    console.error(JSON.stringify({
      tag: BELT_REF_WITHOUT_FORMS_TAG,
      // Le LIBELLÉ n'est pas journalisé: c'est la donnée de santé d'une bouche
      // qui n'a pas de compte. Les identifiants qu'il produit suffisent à
      // rouvrir le cas, et ils sont déjà des slugs.
      refs,
      count: beltRefWithoutForms,
    }));
    throw new HouseholdAllergenWithoutSurfaceFormsError(refs);
  }
  return refs;
}

// ---------------------------------------------------------------------------
// La projection vers l'union de sécurité
// ---------------------------------------------------------------------------

/**
 * Les allergies du foyer, rendues dans la forme que le générateur unit déjà.
 *
 * ── LES TROIS VALEURS EN DUR, ET POURQUOI AUCUNE N'EST UNE COLONNE ─────────
 *
 * `severity: 'medical'` — toute ligne de cette table en est une. Une
 * intolérance déclarée comme allergie fait perdre un plat; l'inverse fait
 * perdre un enfant. La colonne n'existe pas en base pour la même raison que
 * `households.kind` a été supprimée au lot 2: une colonne à valeur unique
 * invite un lecteur, dans six mois, à en réactiver une deuxième sans relire ce
 * qui en dépend.
 *
 * `kind: 'allergy'` — idem.
 *
 * `declaredBy: 'student'` — le vocabulaire fermé de `student_safety_constraints`
 * n'a que deux valeurs, et la distinction qu'elles portent est « le coach » vs
 * « la personne qui mange ». Le compte maître est du second côté. Écrire
 * `'coach'` dirait au modèle qu'un professionnel a posé la contrainte, ce qui
 * est faux.
 *
 * ⚠️ `userId` EST VIDE, ET C'EST LE SUJET DU LOT. Une bouche sans compte n'a
 * pas d'identifiant de compte. Y mettre son `member_id` ferait une fixture qui
 * ment — un identifiant de MEMBRE rangé dans un champ de COMPTE — et le premier
 * lecteur qui joindrait dessus trouverait zéro ligne sans rien dire. Aucun
 * consommateur de cette lane ne lit ce champ (vérifié: le bloc de prompt et la
 * ceinture de sortie lisent kind, severity, declaredBy et les refs).
 *
 * UNE LIGNE PEUT RENDRE PLUSIEURS CONTRAINTES — une par identifiant résolu. Les
 * `id` sont suffixés par le ref pour que deux violations issues du même
 * libellé restent distinguables dans le journal.
 */
export function householdAllergyConstraints(
  rows: readonly HouseholdAllergyRow[],
  contentLocale: string,
): StudentSafetyConstraint[] {
  return householdAllergyConstraintsWithMouths(rows, contentLocale).constraints;
}

/**
 * LES MÊMES CONTRAINTES, ET LA BOUCHE DE CHACUNE.
 *
 * ── POURQUOI L'APPARIEMENT SE FAIT ICI ET NULLE PART AILLEURS ─────────────
 * L'`id` d'une contrainte de foyer est `${row.id}:${ref}`, et `ref` sort de
 * `householdAllergenRefs` — un libellé en rend PLUSIEURS (« nut butter » est
 * une forme de surface de `peanut` ET de `tree_nut`). Reconstruire la clé chez
 * l'appelant demanderait de rappeler `householdAllergenRefs` et de refaire le
 * même suffixage: deux copies d'une règle de clé, dont c'est celle qu'on
 * regarde le moins qui garderait l'ancienne le jour où le format bouge. Ici la
 * paire naît dans la MÊME boucle que la contrainte, donc elle ne peut pas en
 * diverger.
 *
 * ⚠️ CE N'EST PAS UN `userId`. Une bouche sans compte n'en a pas, et y ranger
 * son `member_id` ferait une donnée qui ment (voir le commentaire de
 * `userId: ""` juste en dessous, inchangé). La bouche voyage dans une table à
 * part, `constraintId → member_id`, que l'appelant résout en prénom avec le
 * roster qu'il tient déjà.
 */
export function householdAllergyConstraintsWithMouths(
  rows: readonly HouseholdAllergyRow[],
  contentLocale: string,
): { constraints: StudentSafetyConstraint[]; memberIdOf: Map<string, string> } {
  const out: StudentSafetyConstraint[] = [];
  const memberIdOf = new Map<string, string>();
  for (const row of rows) {
    for (const ref of householdAllergenRefs(row.label)) {
      memberIdOf.set(`${row.id}:${ref}`, row.memberId);
      out.push({
        id: `${row.id}:${ref}`,
        userId: "",
        kind: "allergy",
        allergenRef: ref,
        substanceRef: null,
        medicationClass: null,
        conditionRef: null,
        dietRef: null,
        severity: "medical",
        declaredBy: "student",
        // La prose n'est JAMAIS matchée (R1). Le libellé est gardé pour qu'un
        // journal de violation soit lisible par un humain, pas pour mordre.
        notes: row.label,
        contentLocale,
      });
    }
  }
  return { constraints: out, memberIdOf };
}

/**
 * LES DEUX SORTIES, D'UN SEUL GESTE — c'est ici que la séparation est décidée.
 *
 * Le générateur en tire l'union de sécurité d'un côté et les libellés du verrou
 * des règles de maison de l'autre. Les calculer séparément aux deux points
 * d'appel remettrait la question « et si on mélangeait ? » à chaque lecture; ici
 * elle est répondue une fois, et un test la mute pour le prouver.
 *
 * ── TROIS SORTIES DEPUIS LE 2026-08-19 ────────────────────────────────────
 * `memberIdOf` est la troisième, et elle vient du même geste pour la même
 * raison: elle est ce qui permet à la ligne de prompt de porter un prénom, et
 * la reconstruire ailleurs ferait une seconde règle de clé.
 */
export function householdHardConstraints(input: {
  allergies: readonly HouseholdAllergyRow[];
  houseRules: readonly HouseholdHouseRuleRow[];
  contentLocale: string;
}): {
  safetyConstraints: StudentSafetyConstraint[];
  houseRuleLabels: string[];
  /** `constraint.id` → `member_id` de la bouche qui la porte. */
  memberIdOf: Map<string, string>;
} {
  const allergies = householdAllergyConstraintsWithMouths(
    input.allergies,
    input.contentLocale,
  );
  return {
    safetyConstraints: allergies.constraints,
    memberIdOf: allergies.memberIdOf,
    houseRuleLabels: input.houseRules
      .map((r) => String(r.label ?? "").trim())
      .filter((label) => label !== ""),
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA TABLE D'ATTRIBUTION DU PROMPT — et son compteur à TROIS nombres.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Elle unit les DEUX provenances d'une contrainte de foyer, qui ne se
 * résolvent pas par la même clé:
 *
 *   · `student_safety_constraints` — la ligne d'un TITULAIRE. Sa bouche se
 *     retrouve par `userId`;
 *   · `household_member_allergies` — la ligne d'une bouche qui n'a peut-être
 *     PAS de compte (c'est toute la raison d'être de la table). Sa bouche se
 *     retrouve par `memberIdOf`, produit dans la même boucle que la contrainte.
 *
 * ⚠️ TROIS NOMBRES, JAMAIS DEUX. « demandé / attribué » rendrait le même zéro
 * pour « aucune contrainte » et « quatre contraintes, aucune bouche
 * retrouvée » — et c'est précisément le second état qu'on veut voir. Le
 * compteur est donc `declared / attributed / unattributed`, et l'appelant le
 * journalise: un lot désarmé doit être visible sans relire le prompt.
 *
 * PURE: aucune I/O, aucun ordre implicite. Une contrainte dont la bouche ne se
 * résout pas N'EST PAS OMISE — elle est comptée `unattributed` et le bloc de
 * prompt lui écrit `someone at this table`. L'omettre la retirerait du prompt,
 * c'est-à-dire retirerait une allergie pour cause de prénom manquant.
 */
export function householdConstraintMouths(input: {
  constraints: readonly StudentSafetyConstraint[];
  /** `constraint.id` → `member_id`, tel que rendu par `householdHardConstraints`. */
  memberIdOf: ReadonlyMap<string, string>;
  /** `member_id` → prénom. Le roster, que l'appelant tient déjà. */
  nameOfMember: ReadonlyMap<string, string>;
  /** `user_id` → prénom. Le même roster, vu par son autre clé. */
  nameOfAccount: ReadonlyMap<string, string>;
}): {
  nameOf: Map<string, string>;
  declared: number;
  attributed: number;
  unattributed: number;
} {
  const nameOf = new Map<string, string>();
  let attributed = 0;
  for (const c of input.constraints) {
    const byMember = input.memberIdOf.get(c.id);
    const name = (byMember ? input.nameOfMember.get(byMember) : undefined) ??
      (c.userId ? input.nameOfAccount.get(c.userId) : undefined);
    const clean = String(name ?? "").trim();
    if (clean === "") continue;
    nameOf.set(c.id, clean);
    attributed += 1;
  }
  return {
    nameOf,
    declared: input.constraints.length,
    attributed,
    unattributed: input.constraints.length - attributed,
  };
}

// ---------------------------------------------------------------------------
// La lecture — elle LÈVE, elle ne rend jamais « aucune allergie »
// ---------------------------------------------------------------------------

export class HouseholdAllergiesLoadError extends Error {
  readonly householdId: string;
  constructor(householdId: string, cause: unknown) {
    super(
      `[keel/household_safety] Failed to load household_member_allergies for ` +
        `household ${householdId}: ${
          cause instanceof Error ? cause.message : String(cause)
        }. Refusing to cook with an unknown constraint set.`,
    );
    this.name = "HouseholdAllergiesLoadError";
    this.householdId = householdId;
  }
}

type HouseholdAllergyDbRow = {
  id: string;
  member_id: string;
  label: string;
};

/** Type structurel: les tests injectent un faux, la prod un SupabaseClient. */
type HouseholdAllergiesQuery =
  & PromiseLike<{ data: HouseholdAllergyDbRow[] | null; error: unknown }>
  & { eq(column: string, value: string): HouseholdAllergiesQuery };

export type HouseholdAllergiesDb = {
  from(table: string): { select(columns: string): HouseholdAllergiesQuery };
};

/**
 * Toutes les allergies d'un foyer.
 *
 * LÈVE sur toute panne, exactement comme `loadStudentSafetyConstraints`, et
 * pour la même raison écrite là-bas: « une liste vide et une requête ratée sont
 * indiscernables pour un appelant qui avale l'erreur, et la différence est
 * médicale ». Ici la conséquence est pire d'un cran — le repas est servi à
 * plusieurs personnes, dont des enfants qui n'ont pas déclaré eux-mêmes.
 */
export async function loadHouseholdAllergies(
  db: HouseholdAllergiesDb,
  householdId: string,
): Promise<HouseholdAllergyRow[]> {
  const id = String(householdId ?? "").trim();
  if (!id) {
    throw new HouseholdAllergiesLoadError(
      String(householdId),
      new Error("empty household id"),
    );
  }
  let data: HouseholdAllergyDbRow[] | null;
  let error: unknown;
  try {
    ({ data, error } = await db
      .from("household_member_allergies")
      .select("id, member_id, label")
      .eq("household_id", id));
  } catch (thrown) {
    throw new HouseholdAllergiesLoadError(id, thrown);
  }
  if (error) throw new HouseholdAllergiesLoadError(id, error);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    memberId: String(row.member_id),
    label: String(row.label ?? ""),
  }));
}

// ---------------------------------------------------------------------------
// LA LANE DE LA CONVERSATION — et l'arbitrage de panne qui n'est PAS celui du
// générateur
// ---------------------------------------------------------------------------

/**
 * Ce qu'un TOUR DE CHAT sait des allergies du foyer.
 *
 * ── LE TROU QUE CETTE LANE FERME ───────────────────────────────────────────
 * `run.ts` chargeait `loadStudentSafetyConstraints` du SEUL LOCUTEUR. Les
 * allergies du foyer — clées sur `member_id`, donc les seules qui puissent
 * porter celle d'un enfant SANS COMPTE — n'étaient lues que par
 * `generate-household-meal-v1`. Un parent qui demandait « je cuisine quoi ce
 * soir ? » dans le chat n'avait donc pas l'allergie de son enfant armée: le
 * générateur la connaissait, la conversation non. C'est le même défaut de
 * famille que le §3.3 a payé deux fois — une garantie énoncée globalement,
 * câblée sur un chemin sur N.
 *
 * ── `[]` ET `unreadableReason` SONT DEUX ÉTATS, PAS UN ─────────────────────
 * « ce foyer n'a déclaré aucune allergie » et « je n'ai pas pu lire ses
 * allergies » ne se comportent pas pareil, et c'est exactement ce que
 * `loadHouseholdAllergies` protège en LEVANT. Les fondre ici rendrait le
 * fail-closed impossible à écrire.
 */
export interface HouseholdTurnSafety {
  /** L'union du foyer, prête pour la ceinture. Vide = rien à armer. */
  constraints: StudentSafetyConstraint[];
  /**
   * `null` ⇒ la lecture a abouti. Non-null ⇒ ON NE SAIT PAS, et le tour se
   * comporte différemment (voir `HOUSEHOLD_SAFETY_UNREADABLE_BLOCK`).
   */
  unreadableReason: string | null;
}

/**
 * L'état d'un tour SANS FOYER — et d'un tour hors élève KEEL.
 *
 * Une valeur, pas un `null`: le contexte de tour porte ce champ comme un champ
 * OBLIGATOIRE, pour que le compilateur refuse un chemin qui l'oublierait. Un
 * champ optionnel ici serait la cicatrice `safetyBand` refaite à l'identique.
 */
export const NO_HOUSEHOLD_SAFETY: HouseholdTurnSafety = Object.freeze({
  constraints: Object.freeze([]) as unknown as StudentSafetyConstraint[],
  unreadableReason: null,
});

/**
 * Les allergies du foyer de ce tour. NE LÈVE JAMAIS.
 *
 * ── AUCUN FOYER ⇒ AUCUNE REQUÊTE, ET C'EST UNE EXIGENCE ────────────────────
 * `run.ts` est le chemin de TOUTES les conversations du produit, dont
 * l'immense majorité n'a pas de foyer. `householdId === null` sort
 * immédiatement sur la constante: pas de requête, pas d'allocation, pas de
 * bloc. Le foyer est résolu UNE fois par tour, en amont
 * (`household_turn_context.ts :: resolveHouseholdIdFor`), et cette résolution
 * existait déjà avant ce lot — personne ne paie un aller-retour de plus.
 *
 * ── L'ARBITRAGE DE PANNE, ET POURQUOI IL N'EST PAS CELUI DU GÉNÉRATEUR ─────
 *
 * `generate-household-meal-v1` répond **503 `safety_constraints_unreadable`**
 * et ne compose rien. C'est juste là-bas: sa seule sortie EST un repas, et un
 * repas composé sans ceinture est le produit défaillant lui-même. Il n'a rien
 * d'autre à rendre.
 *
 * Un tour de chat n'a pas cette forme. Refuser LE TOUR parce qu'une lecture
 * d'allergie a échoué, ce serait taire aussi le routage de crise, le renvoi
 * clinicien, la doctrine du coach et le simple fait de répondre à quelqu'un —
 * pour une table qui n'a rien à voir avec sa question. Et ce serait un
 * fail-closed plus strict que celui de la lane INDIVIDUELLE: `run.ts`
 * fail-OPEN, nommément, quand `student_safety_constraints` est illisible.
 * Être plus dur sur le foyer que sur la propre allergie du locuteur, pendant
 * la MÊME panne, n'est pas une position défendable.
 *
 * D'où l'arbitrage retenu, qui n'est ni l'un ni l'autre:
 *
 *   ON NE COUPE PAS LA CONVERSATION. ON COUPE LA CAPACITÉ QUE LA DONNÉE
 *   MANQUANTE PROTÉGEAIT — proposer à manger.
 *
 * C'est l'analogue honnête du 503: le générateur refuse de CUISINER, le chat
 * refuse de PROPOSER, et le dit. Tout le reste du tour est intact. La
 * dégradation est bornée à un tour et à un verbe, elle est BRUYANTE
 * (`unreadableReason` + log), et elle ne peut pas se confondre avec « ce foyer
 * n'a pas d'allergie »: c'est toute la raison d'être des deux états.
 *
 * ⚠️ LA PORTÉE DE LA DÉGRADATION S'ARRÊTE À CE QU'ON SAIT. Une panne sur la
 * RÉSOLUTION du foyer (`household_members`) n'arme rien du tout: on ignore
 * alors s'il y a un foyer, la panne frapperait tous les élèves y compris ceux
 * qui vivent seuls, et la lane individuelle laisse déjà passer ce tour-là. Ce
 * qui arme la dégradation, c'est de SAVOIR qu'il y a des bouches et de ne pas
 * pouvoir lire leurs contraintes — le mode de panne réaliste d'une table
 * jeune (grant, RLS, migration en vol), pas d'un `household_members` chargé
 * depuis le premier jour.
 */
export async function loadHouseholdTurnSafety(
  db: HouseholdAllergiesDb,
  args: { householdId: string | null; contentLocale: string },
): Promise<HouseholdTurnSafety> {
  const householdId = String(args.householdId ?? "").trim();
  if (!householdId) return NO_HOUSEHOLD_SAFETY;
  try {
    const rows = await loadHouseholdAllergies(db, householdId);
    return {
      constraints: householdAllergyConstraints(
        rows,
        String(args.contentLocale ?? "").trim() || "en-GB",
      ),
      unreadableReason: null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      "[keel/household_safety] household allergies unreadable for this turn " +
        "(NO FOOD MAY BE PROPOSED)",
      reason,
    );
    return { constraints: [], unreadableReason: reason };
  }
}

/**
 * Les identifiants que le FOYER tient — pour les tours où quelqu'un en retire
 * un.
 *
 * La ceinture de sortie se désarme sur ce que le tour RÉTRACTE
 * (`retractedConstraintRefsIn`), et ce désarmement est écrit pour la lane
 * individuelle: on retire sa PROPRE contrainte, donc on a le droit de
 * l'entendre nommer. Il ne peut pas s'appliquer au foyer: la rétractation du
 * chat n'écrit que dans `student_safety_constraints`, la ligne du foyer
 * SURVIT, et l'honorer reviendrait à taire l'allergie d'une autre bouche parce
 * qu'un tiers a dit qu'il n'avait plus la sienne. Retirer une allergie de
 * foyer se fait sur l'écran du foyer, là où elle a été écrite.
 */
export function householdConstraintRefs(
  constraints: readonly StudentSafetyConstraint[],
): Set<string> {
  const refs = new Set<string>();
  for (const c of constraints) {
    for (const ref of [c.allergenRef, c.substanceRef, c.medicationClass]) {
      const token = String(ref ?? "").trim().toLowerCase();
      if (token) refs.add(token);
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// LES DEUX BLOCS DE PROMPT
// ---------------------------------------------------------------------------

/**
 * L'union du foyer, rendue pour le PROMPT — la moitié « avant génération » du
 * double verrou, côté foyer.
 *
 * ── POURQUOI CE BLOC EXISTE AU LIEU D'ALLONGER CELUI DE L'ÉLÈVE ────────────
 * `safetyConstraintsPromptBlock` titre « THIS STUDENT'S HARD CONSTRAINTS
 * (source: student_safety_constraints) ». Verser l'allergie d'un enfant dans
 * cette liste rendrait les DEUX moitiés de cette phrase fausses, et le modèle
 * dirait à un parent qu'IL est allergique aux arachides. Affirmer à quelqu'un
 * qu'il porte une allergie qu'il n'a pas est un fait faux sur une personne —
 * exactement le registre que ce dépôt refuse ailleurs (« coche auto = faits
 * faux indémentables »).
 *
 * La ceinture de sortie, elle, n'attribue rien: elle refuse de NOMMER un jeton
 * médical. L'union entre donc dans la ceinture (une seule liste, un seul
 * matcher) et reste distincte dans le prompt (deux blocs, deux attributions).
 *
 * ── CE QU'IL NE DIT PAS, ET C'EST DÉLIBÉRÉ ────────────────────────────────
 * Il ne dit pas DE QUI est chaque allergie. Le nommer demanderait de joindre le
 * roster, donc de faire dépendre une garde médicale d'une date locale et d'une
 * RPC — et n'ajouterait rien à ce qui gouverne la casserole. Le compte maître,
 * lui, sait: c'est lui qui l'a écrite.
 *
 * ⚠️ IL NE PORTE QUE DES IDENTIFIANTS (R1), jamais la prose du libellé. Le mot
 * de la personne y arrive quand même, mais par le seul chemin légitime: le
 * cran 3 de `householdAllergenRefs` le rend comme identifiant littéral, donc
 * « arachide » est là ET `peanut` aussi.
 *
 * Rend `null` quand il n'y a rien à dire — un bloc vide dans un prompt est du
 * bruit qui coûte du cache, et « ce foyer n'a pas d'allergie » est une phrase
 * que personne n'a demandée.
 */
export function householdAllergyPromptBlock(
  safety: HouseholdTurnSafety,
): string | null {
  if (safety.unreadableReason) return HOUSEHOLD_SAFETY_UNREADABLE_BLOCK;
  const refs: string[] = [];
  for (const ref of householdConstraintRefs(safety.constraints)) refs.push(ref);
  if (refs.length === 0) return null;
  return [
    "=== THIS HOUSEHOLD'S MEDICAL ALLERGIES (source: household_member_allergies) ===",
    "They belong to the mouths at this table — possibly to a child who has no",
    "account and cannot declare anything. They are loaded fresh every turn.",
    "ONE MEMBER'S ALLERGY GOVERNS THE WHOLE POT: everything cooked, bought or",
    "served in this household avoids all of them, for everyone.",
    "",
    `AVOID: ${refs.join(", ")}`,
    "",
    "Never suggest, recommend or include any of the above for this household,",
    "and never suggest a food that ordinarily contains one (a nut butter for a",
    "peanut constraint, a satay sauce, a tahini for sesame). Check anything you",
    "propose to cook, buy or serve against this list first.",
    "You MAY name them to warn, to exclude, or to answer a direct question about",
    "them — avoiding a food requires being able to say its name.",
    "This block does NOT say whose each allergy is, and you must not guess:",
    "never tell the person you are talking to that THEY are allergic to",
    "something. Say it is a constraint of this household.",
    "Removing one is done on the household screen, never here.",
  ].join("\n");
}

/**
 * CE QU'ON DIT QUAND ON NE SAIT PAS — la dégradation, écrite en toutes lettres.
 *
 * Elle coupe UN VERBE, pas la conversation (l'arbitrage complet est sur
 * `loadHouseholdTurnSafety`). Deux détails qui ne sont pas cosmétiques:
 *
 *   · elle interdit de PROPOSER, pas de LIRE. Les plats déjà composés que
 *     porte le bloc du foyer ont été produits par un générateur qui, LUI,
 *     refuse de composer sans la ceinture (503). Les relire n'est pas proposer
 *     à manger, et les taire priverait le foyer du dîner qu'il a déjà validé;
 *   · elle DIT qu'elle ne sait pas. Un modèle à qui on retire une capacité
 *     sans lui dire pourquoi la contourne poliment; un silence sur une
 *     allergie est indiscernable d'une absence d'allergie, et c'est le mode de
 *     défaillance que toute cette lane existe pour empêcher.
 */
export const HOUSEHOLD_SAFETY_UNREADABLE_BLOCK = [
  "=== THIS HOUSEHOLD'S ALLERGIES COULD NOT BE READ ON THIS TURN ===",
  "Someone here may have a medical allergy that you cannot see right now, and a",
  "child with no account cannot tell you about it.",
  "So, on this turn only: do NOT propose, recommend, name as an option, or",
  "endorse any food, dish, ingredient, recipe or shopping item for this",
  "household. Not one you would invent, not one you remember, not one you infer",
  "from anything above.",
  "Say plainly that you cannot check this household's allergies right now, and",
  "send them to the meals screen, which reads them itself before composing.",
  "Reading back a dish that is already listed above is NOT proposing food: it",
  "was composed with these constraints armed. Repeating it is fine; adding to",
  "it, swapping it, or suggesting anything else is not.",
  "Everything else in this conversation is unaffected. Answer it normally.",
].join("\n");
