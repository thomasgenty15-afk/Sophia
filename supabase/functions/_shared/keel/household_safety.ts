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
 * LES IDENTIFIANTS QU'UN LIBELLÉ PORTE, du plus canonique au plus littéral.
 *
 * Trois crans, dans cet ordre, et l'ordre est la règle:
 *
 *   1. le libellé NOMME un slug connu (« peanut oil » -> `peanut`);
 *   2. sinon, il correspond à une FORME DE SURFACE (« arachide » -> `peanut`);
 *   3. et dans tous les cas on garde le mot de la personne, slugifié.
 *
 * Le cran 3 est ce qui rend cette fonction incapable de RÉDUIRE la couverture:
 * sans lui, un mot inconnu de la table ne serait porté par rien. Avec lui, le
 * pire cas est exactement ce qu'on aurait eu sans les crans 1 et 2.
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
  const out: StudentSafetyConstraint[] = [];
  for (const row of rows) {
    for (const ref of householdAllergenRefs(row.label)) {
      out.push({
        id: `${row.id}:${ref}`,
        userId: "",
        kind: "allergy",
        allergenRef: ref,
        substanceRef: null,
        medicationClass: null,
        conditionRef: null,
        severity: "medical",
        declaredBy: "student",
        // La prose n'est JAMAIS matchée (R1). Le libellé est gardé pour qu'un
        // journal de violation soit lisible par un humain, pas pour mordre.
        notes: row.label,
        contentLocale,
      });
    }
  }
  return out;
}

/**
 * LES DEUX SORTIES, D'UN SEUL GESTE — c'est ici que la séparation est décidée.
 *
 * Le générateur en tire l'union de sécurité d'un côté et les libellés du verrou
 * des règles de maison de l'autre. Les calculer séparément aux deux points
 * d'appel remettrait la question « et si on mélangeait ? » à chaque lecture; ici
 * elle est répondue une fois, et un test la mute pour le prouver.
 */
export function householdHardConstraints(input: {
  allergies: readonly HouseholdAllergyRow[];
  houseRules: readonly HouseholdHouseRuleRow[];
  contentLocale: string;
}): { safetyConstraints: StudentSafetyConstraint[]; houseRuleLabels: string[] } {
  return {
    safetyConstraints: householdAllergyConstraints(
      input.allergies,
      input.contentLocale,
    ),
    houseRuleLabels: input.houseRules
      .map((r) => String(r.label ?? "").trim())
      .filter((label) => label !== ""),
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
