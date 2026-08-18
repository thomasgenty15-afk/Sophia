// KEEL — LE POP-UP « UNE BOUCHE », SES SIX BLOCS, ET CE QU'IL A LE DROIT DE
// MONTRER.
//
// Conception: `scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md` §1.
// Socle: `weight_pace.ts`, `tokens.ts` (lot L1, 2026-08-18).
//
// ── POURQUOI CE MODULE EXISTE À CÔTÉ DU COMPOSANT ─────────────────────────
// Le composant rend; celui-ci DÉCIDE. La règle qui compte ici n'est pas « où
// est le curseur » mais « y a-t-il un curseur, et sinon qu'est-ce qu'on dit à
// la place » — trois états distincts, dont deux sont des phrases. Écrite dans
// le JSX, cette décision serait testable seulement en lisant du HTML; écrite
// ici, elle se prouve sur la VALEUR rendue, et le composant devient un rendu
// sans branche cachée.
//
// ── LES SIX BLOCS, ET CE QUE « OBLIGATOIRE » VEUT DIRE ────────────────────
// Trois obligatoires (qui c'est · la direction · le corps), trois sautables
// (ce qu'elle mange déjà · les allergies · ses goûts et son régime).
//
// ⚠️ « OBLIGATOIRE » QUALIFIE L'ENREGISTREMENT, JAMAIS LA FENÊTRE. La
// conception est explicite: « un pop-up qu'on ne peut pas fermer fait
// abandonner l'ajout de la deuxième personne, et le foyer meurt là ». La
// fenêtre se ferme donc toujours — Échap, la croix, le bouton de sortie — et
// ce que les trois premiers blocs retiennent est le bouton qui INSCRIT la
// personne. Un blocage de fermeture serait la traduction littérale et fausse
// du mot « obligatoire ».
//
// ── ⛔ ON NE DEMANDE JAMAIS « ADULTE OU ENFANT » ──────────────────────────
// La date de naissance le dit, et `assessBirthDate` la résout déjà en trois
// états — mineur, majeur, INCONNU. Poser la question en plus ouvre la porte à
// deux réponses qui se contredisent, et c'est la réponse tapée à la main qui
// gagnerait, parce qu'elle est plus récente. Ce module ne porte donc aucun
// champ `kind`, et `ageStateOfDraft` est le SEUL chemin.
//
// PURE MODULE: no I/O, no clock beyond the `today` an appelant passe.

import {
  paceCeilingFor,
  type PaceBound,
  type PaceSaturation,
  paceSaturation,
  type PaceWarning,
  paceWarning,
  roundPace,
  type ScaleDirection,
  scaleDirectionOf,
  type TargetWeightRefusal,
  targetWeightRefusal,
  weeksToTarget,
} from "../../../../supabase/functions/_shared/keel/weight_pace.ts";
import type { MouthBody } from "../../../../supabase/functions/_shared/keel/meal_envelope.ts";
import {
  assessBirthDate,
  usableAge,
} from "../../../../supabase/functions/_shared/keel/student_age.ts";
import {
  type ActivityLevel,
  GOAL_TOKENS,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import type { MemberGender, MemberGoal } from "../api/household";
// ⚠️ `import type` ET RIEN D'AUTRE. `api/mouthProfile` tire le client Supabase;
// un import de VALEUR mettrait du réseau dans un module qui se déclare pur.
// Le type, lui, est effacé à l'exécution — et le partager est ce qui empêche
// une SECONDE forme du shaker de naître ici et de diverger de l'écrivain.
import type { ShakerToWrite } from "../api/mouthProfile";

// ---------------------------------------------------------------------------
// LES SIX BLOCS
// ---------------------------------------------------------------------------

/**
 * ── ⚠️ `body` EST PASSÉ AVANT `direction` LE 2026-08-18, SUR UNE MESURE ────
 *
 * L'ordre d'origine était `direction` puis `body`, et sa raison était bonne:
 * « on demande d'abord ce que la personne veut, puis ce qu'il faut pour le
 * calculer », plutôt que d'ouvrir un formulaire d'accueil par « taille, poids,
 * sexe » — la question la plus intime avant d'avoir dit à quoi elle sert.
 *
 * CE QUE ÇA A DONNÉ À L'ÉCRAN, mesuré au navigateur sur la fiche du maître, qui
 * s'ouvre avec un corps VIDE: on clique « perdre », le poids visé s'ouvre, et à
 * la place du curseur il y a une phrase qui demande d'aller remplir un bloc
 * situé PLUS BAS. L'utilisateur a rapporté ne voir « ni le poids visé ni le
 * rythme ». La cause n'est pas le calcul — il a été éprouvé sur sept corps —,
 * c'est l'ORDRE: on demandait un rythme avant d'avoir demandé le corps qui le
 * borne, et un contrôle muet se lit comme une fonctionnalité absente.
 *
 * Le corps vient donc en deuxième. Ce qui reste vrai de la raison d'origine est
 * gardé autrement: le bloc du corps dit à quoi il sert AVANT de le demander
 * (`household.mouth.body_hint`), et l'identité reste la première question.
 *
 * ⛔ NE PAS EN CONCLURE QUE `needs_body` EST MORT. Il reste le seul écran juste
 * quand quelqu'un saute le bloc du corps et descend choisir sa direction — et
 * il ne se confond pas avec `no_margin`: `null` veut dire « je ne connais pas
 * ce corps », `0` veut dire « je le connais, il n'a pas de marge ». Deux
 * phrases, deux écrans.
 */
export const MOUTH_FORM_BLOCKS = [
  "identity",
  "body",
  "direction",
  "habits",
  "allergies",
  "tastes",
] as const;
export type MouthFormBlock = (typeof MOUTH_FORM_BLOCKS)[number];

/** Les trois qui retiennent le bouton d'inscription. */
export const REQUIRED_MOUTH_FORM_BLOCKS = [
  "identity",
  "body",
  "direction",
] as const satisfies readonly MouthFormBlock[];

// ---------------------------------------------------------------------------
// LE BROUILLON
// ---------------------------------------------------------------------------

/**
 * TOUT EN CHAÎNES, ET C'EST DÉLIBÉRÉ.
 *
 * Un `number | null` dans un brouillon de formulaire confond « champ vide » et
 * « zéro tapé », et il force chaque `onChange` à décider d'un parseur. Les
 * chaînes gardent ce que la personne a tapé; le parseur est UN, il est ici, et
 * il rend `null` sur ce qu'il ne sait pas lire.
 */
export interface MouthFormDraft {
  // ── Bloc 1 · qui c'est ──────────────────────────────────────────────────
  firstName: string;
  birthDate: string;
  // ── Bloc 2 · la direction ───────────────────────────────────────────────
  goal: MemberGoal | "";
  targetWeightKg: string;
  /** kg/semaine. `""` = le curseur n'a pas été touché. */
  paceKgPerWeek: string;
  // ── Bloc 3 · le corps ───────────────────────────────────────────────────
  heightCm: string;
  weightKg: string;
  gender: MemberGender | "";
  activityLevel: ActivityLevel | "";
  // ── Bloc 4 · ce qu'elle mange déjà ──────────────────────────────────────
  /** Une ligne libre par moment nommé. La clé est le moment. */
  habits: Readonly<Record<string, string>>;
  /** Le shaker, ou `null`. Voir `ShakerDraft`. */
  shaker: ShakerDraft | null;
  // ── Bloc 5 · les allergies ──────────────────────────────────────────────
  allergies: readonly string[];
  /** « Rien » est une RÉPONSE, distincte de « personne n'a demandé ». */
  allergiesNone: boolean;
  // ── Bloc 6 · ses goûts, son régime ──────────────────────────────────────
  /** Aliments refusés par DÉGOÛT. Jamais une allergie — voir `blockSummary`. */
  dislikes: readonly string[];
  diet: string;
}

/**
 * LE SHAKER — ET LES DEUX NOMBRES QUI LE FONT COMPTER.
 *
 * `fixed_intakes` (FF-051) n'accepte une branche `declared` qu'avec ses trois
 * nombres: ce que pèse une portion, ce qu'elle apporte en protéines, ce
 * qu'elle apporte en énergie. Ils se lisent SUR L'ÉTIQUETTE DU POT — c'est un
 * fait du produit, pas un verdict sur la personne, et c'est ce qui garde la
 * frontière du §3 de la conception intacte.
 *
 * ⚠️ SANS EUX, LE SHAKER EST CONTOURNÉ AU LIEU D'ÊTRE COMPTÉ: 380 kcal
 * invisibles par jour, et un générateur qui rajoute de quoi combler un creux
 * qui n'existe pas — la mauvaise direction pour quelqu'un en perte.
 */
export interface ShakerDraft {
  /** « mon shaker ». Les mots de la personne, jamais un comparateur (R1). */
  label: string;
  servingGrams: string;
  proteinGPerServing: string;
  energyKcalPerServing: string;
  /** Le moment, ou `""` = hors moment nommé (`loose`). */
  slot: string;
}

export function emptyMouthDraft(): MouthFormDraft {
  return {
    firstName: "",
    birthDate: "",
    goal: "",
    targetWeightKg: "",
    paceKgPerWeek: "",
    heightCm: "",
    weightKg: "",
    gender: "",
    // ⚠️ AUCUN DÉFAUT, ET C'EST LA MÊME DÉCISION QUE LA COLONNE. Un défaut
    // ferait d'une non-réponse une réponse, et cette réponse pèserait dans une
    // estimation d'énergie. Voir `profiles.activity_level`.
    activityLevel: "",
    habits: {},
    shaker: null,
    allergies: [],
    allergiesNone: false,
    dislikes: [],
    diet: "",
  };
}

// ---------------------------------------------------------------------------
// D5 (2026-08-18) — REPRENDRE UNE FICHE QUI EXISTE
// ---------------------------------------------------------------------------

/**
 * CE QU'ON SAIT DÉJÀ D'UNE BOUCHE, TEL QUE LES LECTURES DE L'ÉCRAN LE RENDENT.
 *
 * ⚠️ TOUT EST NULLABLE, ET CHAQUE `null` VEUT DIRE « ON N'A PAS LU », JAMAIS
 * « C'EST VIDE ». Les deux ne s'écrivent pas pareil, et c'est là que se joue
 * la seule vraie menace de ce montage.
 */
export interface KnownMouth {
  firstName: string | null;
  birthDate: string | null;
  goal: MemberGoal | null;
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
  heightCm: number | null;
  weightKg: number | null;
  gender: MemberGender | null;
  activityLevel: ActivityLevel | null;
  /** Les habitudes DÉJÀ écrites, par moment. Voir l'avertissement ci-dessous. */
  habits: Readonly<Record<string, string>>;
}

/**
 * LE BROUILLON D'UNE FICHE QU'ON REPREND — ET IL EST UNE GARDE, PAS UN CONFORT.
 *
 * ── ⚠️ CE QUE L'ABSENCE DE SEMENCE COÛTERAIT, PORTE PAR PORTE ─────────────
 * `persistMouth` n'écrit pas des CHAMPS, il appelle des PORTES, et trois
 * d'entre elles REMPLACENT ce qu'elles trouvent. Ouvrir la fenêtre sur un
 * brouillon vide et cliquer « Enregistrer » ferait donc, sans un mot:
 *
 *   `setHabits`  la liste COMPLÈTE remplace — un brouillon vide EFFACE les
 *                habitudes déjà déclarées (« elle mange une pomme le matin »);
 *   `setTarget`  `(null, null)` EFFACE le poids visé et le rythme, y compris
 *                ceux réglés sur `/app/plan`;
 *   `setName`    un prénom vide est refusé par la base, mais un prénom
 *                RETAPÉ À CÔTÉ écraserait celui d'avant.
 *
 * Et le bloc 1 réclamant la date de naissance, une fiche non semée serait
 * en plus **impossible à enregistrer** tant qu'on ne la retape pas — un
 * formulaire qui redemande ce qu'il sait déjà.
 *
 * C'est la cicatrice `mount-snapshot-forms-need-a-loading-gate` prise par
 * l'autre bout: là-bas le formulaire affichait du vide NON LU puis l'écrasait;
 * ici il l'écraserait sans même l'afficher. D'où la règle de l'appelant, qui
 * n'est pas dans ce fichier parce qu'elle est un fait d'écran: **on n'ouvre
 * pas la fenêtre d'une fiche avant d'avoir lu ce qu'elle contient.**
 *
 * ── CE QUI N'EST PAS SEMÉ, ET POURQUOI CE N'EST PAS UN OUBLI ──────────────
 * Les allergies et les dégoûts s'AJOUTENT (`add_*`, il n'existe pas de « poser
 * la liste »): ne pas les semer ne perd rien, et les semer les rejouerait à
 * chaque enregistrement. Le shaker de même — la porte remplace la ligne de
 * même `food_ref` et garde les autres. Le régime, lui, n'existe pas pour une
 * bouche qui a un compte: la base refuse `has_account`.
 */
/**
 * LE PLACEHOLDER DU ROSTER — `household.ts` rend « — » pour un prénom vide.
 *
 * Le laisser passer sèmerait le tiret DANS le champ, et l'enregistrement
 * écrirait « — » comme prénom. C'est la clé de tout l'affichage (règle F5): un
 * tiret y survivrait à toutes les lectures.
 */
const ROSTER_NO_NAME = "—";

/**
 * CE QU'ON SAIT DU MAÎTRE — OU `null`, C'EST-À-DIRE « ON N'OUVRE PAS ».
 *
 * ⚠️ CETTE FONCTION EST LA GARDE, ET SON `null` EST SA RAISON D'ÊTRE. Trois
 * chemins y mènent, et aucun n'est un détail:
 *
 *   · `isOwner === false` — `keel_household_set_member_body` répond `not_owner`
 *     à un profil réclamé. La fenêtre échouerait à sa deuxième marche, et un
 *     contrôle qui échoue à tous les coups est « pire qu'un contrôle absent,
 *     parce qu'il promet »;
 *   · `ownMouth === null` — la cible et la date n'ont pas été lues, donc
 *     `persistMouth` les reposerait à `(null, null)`: le poids visé réglé sur
 *     `/app/plan` disparaîtrait;
 *   · `habits === null` — pas lues, et la porte REMPLACE la liste complète.
 *
 * ⚠️ `[]` N'EST PAS `null`. Un foyer sans habitude déclarée est un fait qu'on a
 * lu; confondre les deux fermerait la fenêtre à tout le monde sauf à ceux qui
 * mangent une pomme le matin.
 *
 * ⚠️ LA DIRECTION EST **RETROUVÉE** DANS LA LISTE, PAS CASTÉE. Un jeton hérité
 * de l'ancienne énumération (`health`, `performance`, `recomposition`) laisse
 * le champ vide plutôt que de proposer une valeur que le CHECK refuse.
 */
export function knownMouthForOwner(input: {
  isOwner: boolean;
  displayName: string;
  ownMouth: {
    birthDate: string | null;
    goal: string | null;
    targetWeightKg: number | null;
    paceKgPerWeek: number | null;
  } | null;
  /** `null` = jamais saisi. La porte du corps lit `null` comme « ne touche pas ». */
  body: {
    heightCm: number;
    weightKg: number;
    gender: MemberGender;
    activityLevel: ActivityLevel | null;
  } | null;
  /** `null` = PAS LU. `[]` = lu, et elle n'en a aucune. */
  habits: readonly { slot: string; usual: string }[] | null;
}): KnownMouth | null {
  if (!input.isOwner) return null;
  if (input.ownMouth === null || input.habits === null) return null;
  return {
    firstName: input.displayName === ROSTER_NO_NAME ? null : input.displayName,
    birthDate: input.ownMouth.birthDate,
    goal: GOAL_TOKENS.find((g) => g === input.ownMouth?.goal) ?? null,
    targetWeightKg: input.ownMouth.targetWeightKg,
    paceKgPerWeek: input.ownMouth.paceKgPerWeek,
    heightCm: input.body?.heightCm ?? null,
    weightKg: input.body?.weightKg ?? null,
    gender: input.body?.gender ?? null,
    activityLevel: input.body?.activityLevel ?? null,
    habits: Object.fromEntries(input.habits.map((h) => [h.slot, h.usual])),
  };
}

export function draftFromKnown(known: KnownMouth): MouthFormDraft {
  const asText = (n: number | null) => (n === null ? "" : String(n));
  return {
    ...emptyMouthDraft(),
    firstName: known.firstName ?? "",
    birthDate: known.birthDate ?? "",
    goal: known.goal ?? "",
    targetWeightKg: asText(known.targetWeightKg),
    paceKgPerWeek: asText(known.paceKgPerWeek),
    heightCm: asText(known.heightCm),
    weightKg: asText(known.weightKg),
    gender: known.gender ?? "",
    activityLevel: known.activityLevel ?? "",
    habits: { ...known.habits },
  };
}

// ---------------------------------------------------------------------------
// LES PARSEURS — un seul chemin de la chaîne au nombre
// ---------------------------------------------------------------------------

/**
 * Un nombre, ou `null` — SANS le zéro de complaisance de `Number()`.
 *
 * `Number("")` rend `0`. Un champ de poids vide deviendrait donc « zéro kilo »,
 * qui traverse `paceCeilingFor` (`weightKg <= 0` → `null`) mais pas
 * `targetWeightRefusal`, où il se lirait comme un poids actuel réel. Même
 * garde que `numberOrNaN` dans `fixed_intakes.ts`.
 */
export function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * L'ÉTAT D'ÂGE DU BROUILLON — mineur, majeur, ou INCONNU.
 *
 * ⚠️ TROIS ÉTATS, ET `unknown` N'EST PAS « ENFANT ». Une date illisible, une
 * date future, un âge invraisemblable: dans les trois cas on ne sait pas, et
 * `goalApplies` ne pose aucune direction sur un âge inconnu. Traiter l'inconnu
 * comme un mineur lui appliquerait le plafond pédiatrique du curseur; le
 * traiter comme un majeur lui ouvrirait le plancher adulte. Les deux sont des
 * décisions qu'aucune donnée ne porte.
 */
export type MouthAgeState = "minor" | "adult" | "unknown";

export function ageStateOfDraft(
  draft: MouthFormDraft,
  todayLocalIso: string,
): MouthAgeState {
  const verdict = assessBirthDate(draft.birthDate, todayLocalIso);
  if (verdict.status === "minor") return "minor";
  if (verdict.status === "adult") return "adult";
  return "unknown";
}

/**
 * LE CORPS DU BROUILLON, AU FORMAT DU MOTEUR.
 *
 * `activityLevel` est `null` quand rien n'est coché — le facteur d'hypothèse,
 * c'est-à-dire exactement l'enveloppe d'avant le 2026-08-18. Le formulaire
 * demande le cran, il ne l'invente pas quand il manque.
 */
export function bodyOfDraft(
  draft: MouthFormDraft,
  todayLocalIso: string,
): MouthBody {
  const verdict = assessBirthDate(draft.birthDate, todayLocalIso);
  return {
    heightCm: numberOrNull(draft.heightCm),
    weightKg: numberOrNull(draft.weightKg),
    gender: draft.gender === "" ? null : draft.gender,
    ageYears: usableAge(verdict),
    activityLevel: draft.activityLevel === "" ? null : draft.activityLevel,
  };
}

// ---------------------------------------------------------------------------
// BLOC 2 — LE CURSEUR, ET LES DEUX ÉCRANS QUI N'EN SONT PAS UN
// ---------------------------------------------------------------------------

/** Le pas du curseur, celui de `roundPace`. */
export const PACE_STEP_KG = 0.05;

/**
 * CE QUE LE BLOC 2 REND — quatre états, et deux d'entre eux sont des PHRASES.
 *
 * ⚠️ `needs_body` ET `no_margin` SONT DEUX ÉCRANS DIFFÉRENTS, ET LE TYPE DE
 * `PaceCeiling` LE DIT DEPUIS LE 2026-08-18 (défaut D3 de la vérification du
 * socle):
 *
 *   `paceCeilingFor` rend `null`  →  « je ne connais pas ce corps »
 *   `maxKgPerWeek === 0`          →  « je le connais, et il n'a pas de marge »
 *
 * Les confondre donnerait, dans le second cas, un curseur qui va de 0,05 à 0 —
 * un contrôle mort. Et le dépôt a mesuré trois fois qu'un contrôle mort se lit
 * comme un bouton cassé, jamais comme un refus.
 */
export type PaceControl =
  /** `maintenance`, ou rien de choisi: la balance ne bouge pas. */
  | { kind: "folded" }
  /** Le corps manque. On demande le corps, on n'affiche pas de curseur. */
  | { kind: "needs_body" }
  /** Corps connu, aucune marge disponible. Une phrase, pas un curseur. */
  | { kind: "no_margin" }
  | {
    kind: "slider";
    direction: ScaleDirection;
    min: number;
    max: number;
    step: number;
    /** Laquelle des trois bornes a décidé. */
    bound: PaceBound;
    /** Le cran courant, borné au maximum. */
    value: number;
    /**
     * La phrase au-delà de 0,5 kg/semaine en prise, ou `null`.
     *
     * ⚠️ ELLE VIENT DE `paceWarning`, ELLE N'EST PAS RÉÉCRITE ICI. Le seuil et
     * son mot sont une seule décision (`PACE_WARNING_LABELS`, deux langues),
     * et les séparer laisse l'un bouger sans l'autre.
     */
    warning: PaceWarning | null;
    /**
     * ③ — CE CRAN CHANGE-T-IL ENCORE QUELQUE CHOSE, OU EST-IL SATURÉ ?
     *
     * `null` = il est exécuté tel quel. Non nul = ce cran et tous les plus
     * rapides produisent LA MÊME assiette (`MAX_SURPLUS_FRACTION`), et l'écran
     * doit le dire — sans quoi quelqu'un pousse à 1,0 en croyant accélérer.
     *
     * ⚠️ CHAMP SÉPARÉ DE `warning`, ET C'EST LA DÉCISION. Les deux phrases sont
     * vraies en même temps sur un grand corps au-delà de 0,5 kg/semaine; un
     * champ unique en ferait taire une, et ce serait celle qui parle du corps.
     */
    saturation: PaceSaturation | null;
  };

/**
 * LE CURSEUR DE CETTE PERSONNE, OU CE QU'ON DIT À SA PLACE.
 *
 * `value` est le cran choisi, RABATTU sur le maximum: un brouillon qui porte
 * 0,80 parce que la personne a d'abord tapé un poids plus lourd ne doit pas
 * afficher un curseur au-delà de sa butée. Sans ce rabattage, l'écran
 * montrerait une valeur que la base refuse (`household_members_target_pace_
 * range_check`) et le refus arriverait au Save, loin du geste.
 */
export function paceControlFor(
  draft: MouthFormDraft,
  todayLocalIso: string,
): PaceControl {
  if (draft.goal === "") return { kind: "folded" };
  const direction = scaleDirectionOf(draft.goal);
  if (direction === null) return { kind: "folded" };

  const body = bodyOfDraft(draft, todayLocalIso);
  // ⚠️ UN SEUL `PaceSubject` POUR LE PLAFOND ET POUR LA SATURATION. Deux objets
  // construits séparément divergeraient au premier champ ajouté à `MouthBody`,
  // et l'écran dirait alors « ça ne change plus » sur le corps de quelqu'un
  // d'autre que celui dont il montre le curseur.
  const subject = {
    body,
    isMinor: ageStateOfDraft(draft, todayLocalIso) === "minor",
  };
  const ceiling = paceCeilingFor(direction, subject);
  if (ceiling === null) return { kind: "needs_body" };
  if (ceiling.maxKgPerWeek <= 0) return { kind: "no_margin" };

  const asked = numberOrNull(draft.paceKgPerWeek);
  // Le défaut du curseur est SON MAXIMUM et pas son minimum. Le rythme le plus
  // rapide que la composition sait livrer est le cran que la personne descend
  // si elle le veut; partir du plus lent ferait d'un formulaire jamais touché
  // une déclaration de prudence que personne n'a faite.
  const raw = asked === null ? ceiling.maxKgPerWeek : asked;
  const value = Math.min(
    Math.max(roundPace(raw), PACE_STEP_KG),
    ceiling.maxKgPerWeek,
  );
  return {
    kind: "slider",
    direction,
    min: PACE_STEP_KG,
    max: ceiling.maxKgPerWeek,
    step: PACE_STEP_KG,
    bound: ceiling.bound,
    value,
    warning: paceWarning(direction, value),
    // ③ — LA QUESTION EST POSÉE SUR LE CRAN AFFICHÉ (`value`), pas sur le
    // maximum: la phrase doit apparaître au moment exact où le curseur cesse
    // de servir à quelque chose, pas seulement tout en haut de sa course.
    saturation: paceSaturation(direction, subject, value),
  };
}

/**
 * LE POIDS VISÉ — ce que le champ doit dire, à côté de lui-même.
 *
 * ⚠️ LE REFUS EST RENDU À CÔTÉ DU CHAMP, ET C'EST LE CONTRAT DE PASSATION DU
 * SOCLE. Trois fois dans `SetupPage`, un refus rendu loin du geste s'est lu
 * comme un bouton mort — cicatrice `refusal-far-from-the-gesture-reads-as-a-
 * dead-button`. Ce type porte donc le refus ET la date d'arrivée sur le même
 * objet, pour qu'un rendu ne puisse pas prendre l'un sans l'autre.
 */
export type TargetWeightState =
  /** Pas de direction, ou champ vide: rien à dire. */
  | { kind: "idle" }
  | { kind: "refused"; refusal: TargetWeightRefusal }
  /** Accepté. `weeks` est `null` quand aucune date n'est calculable. */
  | { kind: "accepted"; weeks: number | null };

export function targetWeightStateFor(
  draft: MouthFormDraft,
  todayLocalIso: string,
): TargetWeightState {
  if (draft.goal === "") return { kind: "idle" };
  const direction = scaleDirectionOf(draft.goal);
  if (direction === null) return { kind: "idle" };
  const target = numberOrNull(draft.targetWeightKg);
  if (target === null) return { kind: "idle" };
  const current = numberOrNull(draft.weightKg);
  // Sans poids ACTUEL il n'y a ni sens de marche ni écart: on ne refuse pas sur
  // une ignorance, on attend le bloc 3.
  if (current === null) return { kind: "idle" };

  const body = bodyOfDraft(draft, todayLocalIso);
  const isMinor = ageStateOfDraft(draft, todayLocalIso) === "minor";
  const refusal = targetWeightRefusal(direction, current, target, {
    body,
    isMinor,
  });
  if (refusal !== null) return { kind: "refused", refusal };

  const pace = paceControlFor(draft, todayLocalIso);
  const paceValue = pace.kind === "slider" ? pace.value : 0;
  return { kind: "accepted", weeks: weeksToTarget(current, target, paceValue) };
}

// ---------------------------------------------------------------------------
// BLOC 3 — LE CRAN D'ACTIVITÉ, ET QUAND IL EST RÉCLAMÉ
// ---------------------------------------------------------------------------

/**
 * OBLIGATOIRE SEULEMENT QUAND LA BALANCE DOIT BOUGER — décision du 2026-08-18.
 *
 * ── LA CONTRADICTION QUE ÇA SOLDE ────────────────────────────────────────
 * Ce pop-up réclamait le cran de TOUT LE MONDE; l'entonnoir voisin le laissait
 * facultatif. Les deux versions coexistaient, donc la même question était à la
 * fois indispensable et sautable selon la porte d'entrée — et personne ne
 * pouvait dire laquelle était la règle.
 *
 * ── POURQUOI LA DIRECTION DÉCIDE ─────────────────────────────────────────
 * Sans activité, la fourchette d'entretien va de 28 à 33 kcal/kg: trop large
 * pour VISER un rythme, assez juste pour le TENIR. Qui veut seulement maintenir
 * n'a donc rien à gagner à répondre, et on ne demande que quand ça change
 * quelque chose.
 *
 * ⚠️ `""` NE RÉCLAME RIEN, ET C'EST DÉLIBÉRÉ. Une direction non choisie retient
 * déjà le bouton par son propre bloc (`direction`). Empiler `body` par-dessus
 * nommerait à la personne un manque qu'elle ne peut pas encore comprendre — on
 * lui réclamerait son activité pour un objectif qu'elle n'a pas posé.
 */
export function activityIsRequired(goal: MemberGoal | ""): boolean {
  if (goal === "") return false;
  return scaleDirectionOf(goal) !== null;
}

// ---------------------------------------------------------------------------
// BLOC 4 — LE SHAKER
// ---------------------------------------------------------------------------

/**
 * MIS EN AVANT POUR QUI PREND DU POIDS, PROPOSÉ SANS INSISTANCE AUX AUTRES.
 *
 * ⚠️ « SANS INSISTANCE » N'EST PAS « ABSENT », ET LA NUANCE EST MESURÉE.
 * Quelqu'un qui perd du poids peut très bien prendre un shaker; ne pas le lui
 * demander le rendrait invisible au calcul — c'est-à-dire 380 kcal par jour
 * que le générateur ne compte pas, dans le sens qui décourage.
 */
export function shakerIsForeground(goal: MemberGoal | ""): boolean {
  return goal === "muscle_gain";
}

/** Le shaker est-il complet, c'est-à-dire écrivable en `fixed_intakes` ? */
export function shakerIsComplete(shaker: ShakerDraft | null): boolean {
  if (shaker === null) return false;
  if (shaker.label.trim() === "") return false;
  for (
    const raw of [
      shaker.servingGrams,
      shaker.proteinGPerServing,
      shaker.energyKcalPerServing,
    ]
  ) {
    const n = numberOrNull(raw);
    // ⚠️ `> 0` SUR LA PORTION, `>= 0` SUR LES DEUX APPORTS. Une portion de zéro
    // gramme n'est pas une portion; une protéine de zéro est un fait
    // parfaitement ordinaire (un soda). Une énergie de zéro l'est aussi, et
    // c'est justement pour ça qu'elle est REQUISE: sans le champ, elle
    // entrerait à zéro sans que personne l'ait dit.
    if (n === null || n < 0) return false;
  }
  return (numberOrNull(shaker.servingGrams) ?? 0) > 0;
}

/**
 * LE SHAKER SAISI, TRADUIT EN CE QUI PART EN BASE — ou `null`.
 *
 * ── ⚠️ LA FRONTIÈRE, ET ELLE EST LA RAISON DU `null` ─────────────────────
 * Un APPORT FIXE est une quantité CONNUE qui entre dans le calcul; une
 * HABITUDE est une tendance que la composition contourne. Un shaker incomplet
 * est une habitude: on sait qu'il existe, on ne sait pas ce qu'il apporte.
 * Lui inventer une portion moyenne écrirait un fait que personne n'a pesé —
 * cicatrice `auto-tick-writes-undeniable-false-facts`, et le référentiel ne
 * pourrait même pas fournir la moyenne (mesuré: 911 références, zéro whey).
 *
 * ⚠️ CE `null` N'EST DONC PAS UNE PERTE SILENCIEUSE: l'écran dit déjà, à côté
 * des champs, que la déclaration est incomplète (`shaker_incomplete`), et
 * `shakerIsComplete` est la MÊME fonction des deux côtés. Ce qui disparaîtrait
 * sans un mot, ce serait un shaker complet — et c'est exactement ce que ce
 * traducteur existe pour empêcher.
 */
export function shakerToWrite(draft: MouthFormDraft): ShakerToWrite | null {
  const shaker = draft.shaker;
  if (!shakerIsComplete(shaker) || shaker === null) return null;
  return {
    label: shaker.label.trim(),
    servingGrams: numberOrNull(shaker.servingGrams) ?? 0,
    proteinGPerServing: numberOrNull(shaker.proteinGPerServing) ?? 0,
    energyKcalPerServing: numberOrNull(shaker.energyKcalPerServing) ?? 0,
    // `""` PART EN `null`, parce que c'est le mot que le type d'écriture
    // emploie pour « hors moment nommé » (`loose`). Deux façons de dire la même
    // absence dans une même chaîne finiraient par diverger sur la troisième.
    slot: shaker.slot.trim() === "" ? null : shaker.slot.trim(),
  };
}

// ---------------------------------------------------------------------------
// CE QUI RETIENT LE BOUTON
// ---------------------------------------------------------------------------

/**
 * LES BLOCS OBLIGATOIRES ENCORE INCOMPLETS, DANS L'ORDRE DE L'ÉCRAN.
 *
 * Vide = le bouton d'inscription est actif. Ce n'est PAS ce qui ferme la
 * fenêtre: elle se ferme toujours.
 *
 * ⚠️ `activityLevel` NE COMPTE DANS LE BLOC 3 QUE SOUS UNE DIRECTION QUI BOUGE
 * (décision du 2026-08-18, `activityIsRequired`). Le champ reste le « trou n°1
 * du produit » quand on VISE un rythme — sans lui, `energy_target.ts` multiplie
 * un métabolisme par une constante devinée et « produit une cible fausse avec
 * l'aplomb d'un tableau ». Mais la fourchette d'entretien (28 à 33 kcal/kg) est
 * assez juste pour TENIR un poids, et ce pop-up le réclamait de tout le monde
 * pendant que l'entonnoir voisin le laissait facultatif: deux règles pour une
 * question. `null` reste la lecture juste d'une non-réponse, et le moteur la
 * traite déjà (facteur d'hypothèse).
 */
export function missingRequiredBlocks(
  draft: MouthFormDraft,
): readonly MouthFormBlock[] {
  const out: MouthFormBlock[] = [];
  // ⚠️ LE PRÉNOM N'EST JAMAIS FACULTATIF: une part au prénom vide est filtrée
  // en silence par la composition (règle F5). Il est la clé de tout
  // l'affichage, pas un ornement.
  if (draft.firstName.trim() === "" || draft.birthDate.trim() === "") {
    out.push("identity");
  }
  // ⚠️ L'ORDRE DE CES DEUX-LÀ SUIT L'ÉCRAN DEPUIS LE 2026-08-18 (voir
  // `MOUTH_FORM_BLOCKS`). Une phrase « il manque: la direction, le corps » qui
  // nomme les blocs dans un ordre différent de celui où ils sont posés fait
  // chercher le premier manque au mauvais endroit.
  if (
    numberOrNull(draft.heightCm) === null ||
    numberOrNull(draft.weightKg) === null ||
    draft.gender === "" ||
    (activityIsRequired(draft.goal) && draft.activityLevel === "")
  ) {
    out.push("body");
  }
  if (draft.goal === "") out.push("direction");
  return out;
}

/**
 * LES TROIS BLOCS QUI SONT PASSÉS DERRIÈRE UN BOUTON (2026-08-18).
 *
 * Décision, mot pour mot: « le poids visé et le rythme d'évolution […] dans le
 * cadre de l'étape 3. Et le reste (allergies, etc.) dans une pop-up accessible
 * depuis "Renseigner ses préférences alimentaires" ». Ce qui STRUCTURE le plan
 * reste en ligne; ce qui l'AFFINE se replie.
 */
export const PREFERENCE_MOUTH_FORM_BLOCKS = [
  "habits",
  "allergies",
  "tastes",
] as const satisfies readonly MouthFormBlock[];

/**
 * CE QUI A DÉJÀ ÉTÉ RENSEIGNÉ DERRIÈRE LE BOUTON.
 *
 * ⚠️ CETTE FONCTION EXISTE PARCE QUE LA FENÊTRE CACHE CE QU'ON Y A TAPÉ. Le
 * brouillon vit chez l'appelant et survit à la fermeture — mais l'écran, lui,
 * n'en montre plus rien une fois la fenêtre refermée, et le dépôt sait ce que
 * ça produit: on rouvre pour vérifier, on doute, on retape. Le récapitulatif
 * sous le bouton est la seule chose qui dise « c'est gardé ».
 *
 * ⚠️ « AUCUNE ALLERGIE » COMPTE COMME RENSEIGNÉ. C'est une RÉPONSE, et la
 * distinguer d'un bloc jamais ouvert est exactement ce que `allergiesNone`
 * existe pour faire — sinon quelqu'un qui a répondu « rien » lirait qu'il n'a
 * rien répondu, et rouvrirait pour cocher deux fois.
 *
 * ⚠️ UNE HABITUDE VIDE N'EN EST PAS UNE: `habits` porte une clé par moment dès
 * qu'on a touché un champ puis effacé. On compte le TEXTE, pas la clé.
 */
export function filledPreferenceBlocks(
  draft: MouthFormDraft,
): readonly MouthFormBlock[] {
  const out: MouthFormBlock[] = [];
  const anyHabit = Object.values(draft.habits).some((v) => v.trim() !== "");
  if (anyHabit || draft.shaker !== null) out.push("habits");
  if (draft.allergies.length > 0 || draft.allergiesNone) out.push("allergies");
  if (draft.dislikes.length > 0 || draft.diet !== "") out.push("tastes");
  return out;
}

/**
 * LE POIDS VISÉ REFUSÉ RETIENT-IL LE BOUTON ?
 *
 * Oui — et c'est le seul refus non-bloc qui le fait. Un poids visé sous le
 * plancher d'énergie n'est pas une omission, c'est une valeur que la base
 * refusera. L'inscrire quand même remplacerait une phrase à côté du champ par
 * un refus serveur au Save, c'est-à-dire par le bouton mort qu'on évite.
 */
export function submitIsHeld(
  draft: MouthFormDraft,
  todayLocalIso: string,
): boolean {
  if (missingRequiredBlocks(draft).length > 0) return true;
  return targetWeightStateFor(draft, todayLocalIso).kind === "refused";
}

// ---------------------------------------------------------------------------
// CE QUI PART EN BASE
// ---------------------------------------------------------------------------

/**
 * LA CIBLE ET LE RYTHME NE S'ÉCRIVENT QU'ENSEMBLE, ET SEULEMENT SUR UNE
 * DIRECTION QUI BOUGE.
 *
 * Miroir exact de `household_members_target_needs_direction_check`:
 *
 *   (target_weight_kg is null and target_pace_kg_per_week is null)
 *   or goal in ('fat_loss', 'muscle_gain')
 *
 * Un écran qui enverrait une cible sur `maintenance` recevrait une violation de
 * contrainte PostgreSQL au milieu d'un entonnoir d'accueil — le mode d'échec
 * que la vérification du socle a mesuré sur `setup-goal` le matin même.
 */
export interface MouthTargetPayload {
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
}

export function targetPayloadOf(
  draft: MouthFormDraft,
  todayLocalIso: string,
): MouthTargetPayload {
  const empty: MouthTargetPayload = {
    targetWeightKg: null,
    paceKgPerWeek: null,
  };
  // ⚠️ UNE SEULE DÉCISION, JAMAIS DEUX — ET C'EST UNE MUTATION QUI L'A DIT.
  // Cette fonction commençait par SA PROPRE lecture de la direction
  // (`if (scaleDirectionOf(draft.goal) === null) return empty;`). Muter cette
  // ligne n'a fait rougir AUCUN test: `targetWeightStateFor` rend déjà `idle`
  // sur `maintenance`, donc la sortie était calculée puis jetée — du code mort
  // qui ressemble à une garde, la signature exacte d'une branche qui ne décide
  // rien. Même correctif que `servingDemandsFor` du lot socle: on délègue.
  const state = targetWeightStateFor(draft, todayLocalIso);
  if (state.kind !== "accepted") return empty;
  const pace = paceControlFor(draft, todayLocalIso);
  if (pace.kind !== "slider") return empty;
  const target = numberOrNull(draft.targetWeightKg);
  if (target === null) return empty;
  return { targetWeightKg: target, paceKgPerWeek: pace.value };
}

/**
 * LE BROUILLON, TRADUIT EN CE QUI PART EN BASE.
 *
 * ⚠️ IL SUPPOSE LES TROIS BLOCS OBLIGATOIRES REMPLIS, et le type le dit par ses
 * `number` non nullables. C'est `submitIsHeld` qui tient la porte; ce
 * traducteur-là n'est appelé qu'après. Les `?? 0` ci-dessous sont donc
 * INATTEIGNABLES par le bouton — ils existent pour que le compilateur n'oblige
 * pas l'appelant à re-parser ce que `missingRequiredBlocks` vient de vérifier.
 *
 * ⚠️ `birthDate` PART EN `null` QUAND ELLE EST VIDE, jamais en chaîne vide: la
 * porte SQL prend une `date`, et `''::date` lève. Le bloc 1 la réclame de toute
 * façon.
 *
 * ⚠️ `diet` PART EN `null` QUAND PERSONNE N'A RÉPONDU, et `persistMouth` saute
 * alors l'appel. `omnivore` est une RÉPONSE et s'écrit: sans lui, la base ne
 * distinguerait pas quelqu'un qui n'a rien à déclarer de quelqu'un à qui on n'a
 * jamais posé la question — et la différence vaut un plan de viande servi à un
 * végétarien.
 */
export interface MouthPersistPayload {
  memberId: string | null;
  firstName: string;
  birthDate: string | null;
  goal: string | null;
  heightCm: number;
  weightKg: number;
  gender: "male" | "female" | "other";
  activityLevel: ActivityLevel | null;
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
  habits: readonly { slot: string; kind: "own_usual"; usual: string }[];
  /**
   * LE SHAKER, OU `null` — ET IL EST ARRIVÉ ICI LE 2026-08-18 (D1).
   *
   * ⚠️ CE CHAMP MANQUAIT, ET SON ABSENCE ÉTAIT LE DÉFAUT. Le formulaire
   * demandait ses protéines et ses calories à quelqu'un, et ce traducteur les
   * JETAIT avant l'écriture: `addShakerToOwnIntakes` existait sans appelant, et
   * la question était décorative de bout en bout. Un champ qu'on remplit et qui
   * ne va nulle part est pire qu'un champ absent — il promet.
   */
  shaker: ShakerToWrite | null;
  allergies: readonly string[];
  dislikes: readonly string[];
  diet: string | null;
}

export function mouthToPersist(
  draft: MouthFormDraft,
  todayLocalIso: string,
  memberId: string | null = null,
): MouthPersistPayload {
  const target = targetPayloadOf(draft, todayLocalIso);
  return {
    memberId,
    firstName: draft.firstName.trim(),
    birthDate: draft.birthDate.trim() === "" ? null : draft.birthDate.trim(),
    goal: draft.goal === "" ? null : draft.goal,
    heightCm: numberOrNull(draft.heightCm) ?? 0,
    weightKg: numberOrNull(draft.weightKg) ?? 0,
    gender: draft.gender === "" ? "other" : draft.gender,
    activityLevel: draft.activityLevel === "" ? null : draft.activityLevel,
    targetWeightKg: target.targetWeightKg,
    paceKgPerWeek: target.paceKgPerWeek,
    // ⚠️ UNE HABITUDE VIDE N'EST PAS UNE HABITUDE. La base refuse un `usual`
    // vide (`bad_slots`), et surtout: un champ laissé blanc veut dire « rien à
    // dire », pas « elle ne mange rien ». Le filtrer ici plutôt qu'au rendu
    // garde le brouillon fidèle à ce qui est tapé.
    habits: Object.entries(draft.habits)
      .map(([slot, usual]) => ({
        slot,
        kind: "own_usual" as const,
        usual: usual.trim(),
      }))
      .filter((h) => h.usual !== ""),
    // ⚠️ LA MÊME LIGNE QUE LES HABITUDES, ET LA FRONTIÈRE ENTRE LES DEUX EST LE
    // SUJET: une habitude est une TENDANCE que la composition contourne, un
    // apport fixe est une QUANTITÉ CONNUE qu'elle compte. `shakerToWrite` rend
    // `null` tant que la quantité manque — voir la frontière écrite là-bas.
    shaker: shakerToWrite(draft),
    allergies: [...draft.allergies],
    dislikes: [...draft.dislikes],
    diet: draft.diet === "" ? null : draft.diet,
  };
}
