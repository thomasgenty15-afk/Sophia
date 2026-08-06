/**
 * LE RENDERER — gabarits FERMÉS, deux locales, zéro modèle.
 *
 * ── LA LIGNE ROUGE ───────────────────────────────────────────────────────────
 * Aucun gabarit ne nomme la durée de l'absence, ne demande pourquoi elle a eu
 * lieu, ni ne félicite du retour. Les trois font la même chose : ils font de
 * l'absence le sujet, alors que la boucle existe pour ramener l'élève à son
 * protocole.
 *
 * C'est la symétrie de `assertNoGuiltTripping`, qui garde déjà le message
 * SORTANT (`_shared/keel/reengagement_io.ts`). Interdire le reproche à l'aller
 * et le tolérer au retour n'aurait aucun sens — et `renderer_test.ts` passe
 * chaque gabarit au crible d'un lexique, dans les deux langues.
 */

/** Le lexique interdit, exporté: le test l'applique à TOUS les gabarits. */
export const KEEL_RESUME_FORBIDDEN_LEXICON = [
  // durée / comptage de l'absence
  "jours", "semaines", "depuis", "days", "weeks", "since",
  // reproche / justification
  "pourquoi", "absent", "disparu", "décroché", "decroche",
  "why", "missing", "gone", "dropped",
  // félicitation du retour
  "bravo", "félicitations", "felicitations", "congrats", "well done",
] as const;

type Locale = "fr" | "en";

function localeOf(responseLocale: string): Locale {
  return String(responseLocale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
}

/**
 * Le premier tour : rouvrir la porte, sans commenter ce qui s'est passé.
 *
 * La question est OUVERTE et porte sur le présent (« là, maintenant »), pas sur
 * l'intervalle. C'est ce qui distingue une reprise d'un interrogatoire.
 */
const WELCOME_BACK: Record<Locale, string> = {
  fr: "Content de te lire. On reprend où tu veux : qu'est-ce qui serait utile maintenant ?",
  en: "Good to hear from you. We pick up wherever you want: what would help right now?",
};

/**
 * Le second tour : on rend la main, en le disant.
 *
 * Pas de « je te laisse » sec — la phrase doit porter la continuité, sinon le
 * flow se referme comme une porte.
 */
const HANDED_BACK: Record<Locale, string> = {
  fr: "Très bien, on continue là-dessus.",
  en: "Good, let's carry on from there.",
};

export function renderKeelReengagementResume(args: {
  stage: "welcome_back" | "handed_back";
  responseLocale: string;
}): string {
  const locale = localeOf(args.responseLocale);
  return args.stage === "handed_back" ? HANDED_BACK[locale] : WELCOME_BACK[locale];
}

/** Exporté pour le test de lexique: il doit voir TOUS les gabarits. */
export const KEEL_RESUME_ALL_TEMPLATES = [
  ...Object.values(WELCOME_BACK),
  ...Object.values(HANDED_BACK),
];
