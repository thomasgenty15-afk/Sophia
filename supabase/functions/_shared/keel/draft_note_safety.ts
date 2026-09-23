/**
 * LA SÉCURITÉ DITE DANS UNE NOTE — allergie, intolérance, régime.
 *
 * ⟳ 2026-09-23 — LE CANAL EST ROUVERT, SUR DÉCISION DU PROPRIÉTAIRE, ET
 * SOUS UNE CONDITION. Il avait été supprimé le 2026-09-09
 * (`docs/keel/NOMENCLATURE-MEMOIRE.md`, en tête) : une allergie écrite dans
 * une note ne devenait qu'une `food.exclude`. Le propriétaire le rouvre : une
 * note peut changer le régime d'une personne, et poser une allergie ou une
 * intolérance, **mais seulement quand la phrase le DIT** — « allergique »,
 * « intolérant », « ne tolère pas », « est végétarienne ». Le modèle doit en
 * être certain ; sans le mot, c'est un goût (`food.exclude`), et le plan le
 * tient quand même à l'écart.
 *
 * ⛔ LA GARDE EST UNE CITATION, PAS UN MATCHER. Chaque entrée porte `because`,
 * les mots de la note qui le disent, copiés tels quels. La relecture vérifie
 * qu'ils SONT dans la note (inclusion de chaîne, casse repliée) — une
 * jointure, pas une ressemblance. Elle ne cherche aucun mot-clé : c'est le
 * modèle qui juge, et la citation est ce qui rend son jugement vérifiable.
 * Une entrée dont la preuve n'est pas dans la note tombe (`noEvidence`).
 *
 * ⛔ UNE ENTRÉE SANS BOUCHE TOMBE. Une allergie appartient à une personne ;
 * `member_id: null` n'est jamais « toute la table » ici (le prompt demande
 * une entrée par personne), et jamais un repli sur la personne qui écrit.
 *
 * PURE MODULE : aucun I/O, aucune horloge, aucun aléatoire.
 */

/** Ce qu'une note a le droit de poser. `medical`, `religious`, `dislike` : non. */
export const DRAFT_NOTE_SAFETY_KINDS = ["allergy", "intolerance", "diet"] as const;
export type DraftNoteSafetyKind = (typeof DRAFT_NOTE_SAFETY_KINDS)[number];

/**
 * Les régimes, dans le vocabulaire de `household_members.diet` (CHECK en
 * base). `omnivore` = « n'est plus au régime » : il RETIRE, il ne pose rien.
 * `student_safety_constraints.diet_ref` n'a pas `omnivore` — pour la personne
 * qui écrit, il se traduit par une rétractation (`draft_note_safety_io.ts`).
 */
export const DRAFT_NOTE_DIETS = [
  "omnivore",
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten_free",
] as const;
export type DraftNoteDiet = (typeof DRAFT_NOTE_DIETS)[number];

/** Une déclaration relue, prête pour la porte d'écriture. */
export interface DraftNoteSafetyDeclaration {
  readonly kind: DraftNoteSafetyKind;
  /** L'uuid de la bouche. Jamais `null` : une allergie a un nom. */
  readonly memberId: string;
  /** L'allergène, dans ses mots, bien orthographié. `null` sur un régime. */
  readonly text: string | null;
  /** Le régime. `null` sur une allergie ou une intolérance. */
  readonly diet: DraftNoteDiet | null;
  /** Les mots de la note qui le disent — vérifiés présents dans la note. */
  readonly because: string;
}

export interface DraftNoteSafetyRefusals {
  readonly total: number;
  /** Un `kind` hors des trois. */
  readonly unknownKind: number;
  /** `member_id` absent, `null`, ou hors du rôle. */
  readonly unknownMember: number;
  /** Allergie sans allergène, ou allergène plus long que la note. */
  readonly badText: number;
  /** Régime hors du vocabulaire, ou régime posé sur une allergie. */
  readonly badDiet: number;
  /** ⛔ LA GARDE: `because` absent, ou absent de la note. */
  readonly noEvidence: number;
  /** La même déclaration deux fois (même bouche, même genre, même objet). */
  readonly duplicate: number;
  /** Ni objet, ni champs lisibles. */
  readonly malformed: number;
}

export interface DraftNoteSafetyReading {
  readonly proposed: number;
  readonly kept: number;
  readonly declarations: readonly DraftNoteSafetyDeclaration[];
  readonly refused: DraftNoteSafetyRefusals;
}

export const EMPTY_DRAFT_NOTE_SAFETY: DraftNoteSafetyReading = Object.freeze({
  proposed: 0,
  kept: 0,
  declarations: [],
  refused: Object.freeze({
    total: 0,
    unknownKind: 0,
    unknownMember: 0,
    badText: 0,
    badDiet: 0,
    noEvidence: 0,
    duplicate: 0,
    malformed: 0,
  }),
});

/** La casse et les espaces repliés — c'est tout. Aucune racine, aucun accent retiré. */
function folded(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * RELIT LA LISTE `safety` DU MODÈLE.
 *
 * `roster` : les uuid des bouches, en minuscules. `note` : la phrase entière
 * (la preuve doit s'y trouver). `textMax` : la même borne que les autres
 * tiroirs — un allergène plus long que la note n'est pas « ses mots ».
 */
export function readDraftNoteSafety(args: {
  rows: readonly unknown[];
  roster: ReadonlySet<string>;
  note: string;
  textMax: number;
}): DraftNoteSafetyReading {
  const rows = Array.isArray(args.rows) ? args.rows : [];
  if (rows.length === 0) return EMPTY_DRAFT_NOTE_SAFETY;
  const note = folded(String(args.note ?? ""));
  const out: DraftNoteSafetyDeclaration[] = [];
  const seen = new Set<string>();
  let unknownKind = 0, unknownMember = 0, badText = 0, badDiet = 0;
  let noEvidence = 0, duplicate = 0, malformed = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      malformed += 1;
      continue;
    }
    const rec = row as Record<string, unknown>;
    const kind = String(rec.kind ?? "").trim().toLowerCase();
    if (!(DRAFT_NOTE_SAFETY_KINDS as readonly string[]).includes(kind)) {
      unknownKind += 1;
      continue;
    }
    const memberId = String(rec.member_id ?? "").trim().toLowerCase();
    if (memberId === "" || memberId === "null" || !args.roster.has(memberId)) {
      unknownMember += 1;
      continue;
    }
    let text: string | null = null;
    let diet: DraftNoteDiet | null = null;
    if (kind === "diet") {
      const token = String(rec.diet ?? "").trim().toLowerCase();
      if (!(DRAFT_NOTE_DIETS as readonly string[]).includes(token)) {
        badDiet += 1;
        continue;
      }
      diet = token as DraftNoteDiet;
    } else {
      // Un régime posé sur une allergie est une entrée confuse: elle tombe.
      if (rec.diet !== undefined && rec.diet !== null && String(rec.diet).trim() !== "") {
        badDiet += 1;
        continue;
      }
      const raw = typeof rec.text === "string" ? rec.text.trim() : "";
      if (raw === "" || raw.length > args.textMax) {
        badText += 1;
        continue;
      }
      text = raw;
    }
    // ⛔ LA GARDE. Pas de preuve, ou une preuve que la note ne contient pas.
    const because = typeof rec.because === "string" ? rec.because.trim() : "";
    if (because.length < 2 || !note.includes(folded(because))) {
      noEvidence += 1;
      continue;
    }
    const key = `${memberId}|${kind}|${diet ?? folded(text ?? "")}`;
    if (seen.has(key)) {
      duplicate += 1;
      continue;
    }
    seen.add(key);
    out.push({ kind: kind as DraftNoteSafetyKind, memberId, text, diet, because });
  }
  const total = unknownKind + unknownMember + badText + badDiet + noEvidence + duplicate + malformed;
  return {
    proposed: rows.length,
    kept: out.length,
    declarations: out,
    refused: { total, unknownKind, unknownMember, badText, badDiet, noEvidence, duplicate, malformed },
  };
}

const DIET_WORDS: Readonly<Record<"fr" | "en", Readonly<Record<DraftNoteDiet, string>>>> = {
  fr: {
    omnivore: "plus de régime particulier",
    vegetarian: "végétarien",
    vegan: "végan",
    pescatarian: "pescétarien",
    gluten_free: "sans gluten",
  },
  en: {
    omnivore: "no special diet any more",
    vegetarian: "vegetarian",
    vegan: "vegan",
    pescatarian: "pescatarian",
    gluten_free: "gluten-free",
  },
};

const KIND_WORDS: Readonly<Record<"fr" | "en", Readonly<Record<DraftNoteSafetyKind, string>>>> = {
  fr: { allergy: "allergie", intolerance: "intolérance", diet: "régime" },
  en: { allergy: "allergy", intolerance: "intolerance", diet: "diet" },
};

/** L'objet seul: l'allergène dans ses mots, ou le régime dans la langue. */
export function draftNoteSafetyObject(
  d: Pick<DraftNoteSafetyDeclaration, "kind" | "text" | "diet">,
  language: "fr" | "en",
): string {
  return d.kind === "diet" && d.diet !== null ? DIET_WORDS[language][d.diet] : String(d.text ?? "");
}

/** La ligne lue sous le champ: « allergie : arachides », « régime : végétarien ». */
export function draftNoteSafetyLine(
  d: Pick<DraftNoteSafetyDeclaration, "kind" | "text" | "diet">,
  language: "fr" | "en",
): string {
  const what = draftNoteSafetyObject(d, language);
  return language === "fr" ? `${KIND_WORDS.fr[d.kind]} : ${what}` : `${KIND_WORDS.en[d.kind]}: ${what}`;
}
