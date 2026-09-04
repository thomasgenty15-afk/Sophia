import type { MessageKey } from "../i18n/t";

/**
 * À QUI LA FICHE PARLE — et c'est un fait, pas un réglage de ton.
 *
 * ── LE DÉFAUT MESURÉ (2026-08-19) ─────────────────────────────────────────
 * La même fiche sert le TITULAIRE et les autres bouches, et elle était écrite
 * entièrement à la troisième personne. Le maître lisait donc « Son corps »,
 * « Comment elle mange », « Renseigner ses préférences alimentaires » — sur sa
 * propre carte. Signalé: « tu utilises "il", "elle" alors que pour le maître ça
 * devrait être "tu" ».
 *
 * ── ⛔ POURQUOI PAS UN SIMPLE ÉCHANGE DE PRONOM ───────────────────────────
 * En français l'accord change le VERBE, pas seulement le pronom: « tu manges »
 * contre « elle mange », « tu n'aimes pas » contre « elle n'aime pas ». Une
 * seule phrase paramétrée par un pronom rendrait « tu mange ». Chaque phrase
 * concernée existe donc en DEUX versions, et le `Record` ci-dessous garantit
 * qu'aucune ne peut exister sans sa jumelle — le compilateur refuse une entrée
 * manquante.
 *
 * ── ⚠️ ET LA TROISIÈME PERSONNE NOMME, ELLE NE GENRE PAS ─────────────────
 * La demande était « il ou elle selon le sexe renseigné ». Le PRÉNOM fait
 * mieux, et pour trois raisons qui sont toutes des défauts évités:
 *
 *   · le sexe peut valoir « Autre » ou n'avoir jamais été renseigné — et le
 *     français n'a pas de troisième personne neutre d'usage courant. Un
 *     `il` par défaut misgenre la moitié d'un foyer;
 *   · l'ÉLISION diverge (« ce qu'il » contre « ce que Christèle »), donc une
 *     phrase qui accepte les deux est fausse dans un cas sur deux;
 *   · avec trois personnes à table, « elle » ne dit pas laquelle.
 *
 * Le repli quand le prénom manque est « cette personne » — jamais un pronom
 * deviné. Les possessifs français (`son`, `sa`, `ses`) s'accordent avec l'objet
 * possédé et pas avec le possesseur: ils traversent sans genre, et n'ont donc
 * pas besoin du prénom.
 */
export type MouthVoice = "self" | "other";

/**
 * LES CLÉS QUI EXISTENT DANS LES DEUX VOIX.
 *
 * ⛔ N'Y AJOUTER UNE CLÉ QU'AVEC SA JUMELLE `_you` dans les DEUX catalogues:
 * le `Record` complet ci-dessous ne compile pas sans, et c'est la seule chose
 * qui empêche une fiche de repasser à « son corps » sur la carte du maître.
 */
export type VoicedKey =
  | "household.mouth.identity_hint"
  | "household.mouth.body"
  | "household.mouth.activity"
  | "household.mouth.day_activity"
  | "household.mouth.sport"
  | "household.mouth.meal_structure"
  | "household.mouth.appetite"
  | "household.mouth.appetite_hint"
  | "household.mouth.diet"
  | "household.mouth.habits"
  | "household.mouth.habits_hint"
  | "household.mouth.eating"
  | "household.mouth.eating_hint"
  // ── chantier-0904/FF-060 ──
  | "household.mouth.rhythm_derived"
  | "household.mouth.shake_composed"
  | "household.mouth.habit_shaker_here"
  | "household.mouth.shaker_at"
  | "household.mouth.rhythm"
  | "household.mouth.rhythm_hint"
  | "household.mouth.rhythm_house"
  | "household.mouth.tastes"
  | "household.mouth.tastes_hint"
  | "household.mouth.shaker_title"
  | "household.mouth.shaker_label"
  | "household.mouth.shaker_label_hint"
  | "household.mouth.preferences_open"
  | "setup.mouths.allergies"
  | "setup.mouths.first_name_hint";

/** La jumelle « tu » de chaque clé. `Record` COMPLET — voir `VoicedKey`. */
const YOU: Record<VoicedKey, MessageKey> = {
  "household.mouth.identity_hint": "household.mouth.identity_hint_you",
  "household.mouth.body": "household.mouth.body_you",
  "household.mouth.activity": "household.mouth.activity_you",
  "household.mouth.day_activity": "household.mouth.day_activity_you",
  "household.mouth.sport": "household.mouth.sport_you",
  "household.mouth.meal_structure": "household.mouth.meal_structure_you",
  "household.mouth.appetite": "household.mouth.appetite_you",
  "household.mouth.appetite_hint": "household.mouth.appetite_hint_you",
  "household.mouth.diet": "household.mouth.diet_you",
  "household.mouth.habits": "household.mouth.habits_you",
  // ── LA SECTION FUSIONNÉE (2026-09-01) ────────────────────────────────────
  // `habits` et `rhythm` restent déclarées au-dessus: elles servent encore à
  // `/app/household` et aux tests. C'est la SECTION qui a fusionné, pas les
  // clés — les retirer casserait des appelants qui ne sont pas dans ce lot.
  "household.mouth.eating": "household.mouth.eating_you",
  "household.mouth.eating_hint": "household.mouth.eating_hint_you",
  "household.mouth.rhythm_derived": "household.mouth.rhythm_derived_you",
  "household.mouth.shake_composed": "household.mouth.shake_composed_you",
  "household.mouth.habit_shaker_here": "household.mouth.habit_shaker_here_you",
  "household.mouth.shaker_at": "household.mouth.shaker_at_you",
  "household.mouth.habits_hint": "household.mouth.habits_hint_you",
  "household.mouth.rhythm": "household.mouth.rhythm_you",
  "household.mouth.rhythm_hint": "household.mouth.rhythm_hint_you",
  "household.mouth.rhythm_house": "household.mouth.rhythm_house_you",
  "household.mouth.tastes": "household.mouth.tastes_you",
  "household.mouth.tastes_hint": "household.mouth.tastes_hint_you",
  "household.mouth.shaker_title": "household.mouth.shaker_title_you",
  "household.mouth.shaker_label": "household.mouth.shaker_label_you",
  "household.mouth.shaker_label_hint": "household.mouth.shaker_label_hint_you",
  "household.mouth.preferences_open": "household.mouth.preferences_open_you",
  "setup.mouths.allergies": "setup.mouths.allergies_you",
  "setup.mouths.first_name_hint": "setup.mouths.first_name_hint_you",
};

/** La clé à rendre pour cette voix. */
export function voiced(key: VoicedKey, voice: MouthVoice): MessageKey {
  return voice === "self" ? YOU[key] : key;
}

/**
 * CE QUE `{who}` VAUT DANS LA VOIX « autre ».
 *
 * ⚠️ LE PRÉNOM, ET « cette personne » QUAND IL MANQUE. Jamais un pronom
 * deviné: voir l'en-tête. Le repli est atteignable pour de vrai — la fiche
 * d'AJOUT s'ouvre avant qu'un prénom soit tapé.
 */
export function whoOf(firstName: string, fallback: string): string {
  const name = firstName.trim();
  return name === "" ? fallback : name;
}
