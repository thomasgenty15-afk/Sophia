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
 * IL N'Y A PLUS DE SECOND GABARIT, ET C'EST UNE SUPPRESSION MESURÉE.
 *
 * Un `HANDED_BACK` a existé ici — « Très bien, on continue là-dessus. » / « Good,
 * let's carry on from there. » Le premier run réel l'a condamné : au tour 2
 * l'élève écrivait « Je voudrais surtout gérer les dîners cette semaine » et
 * recevait cette phrase creuse à la place d'une réponse. Un gabarit fermé ne
 * peut pas répondre à une demande qu'il n'a pas lue.
 *
 * La sortie du flow est donc SILENCIEUSE : le composeur reprend le tour et
 * répond pour de vrai. Voir `contract.ts` pour la séquence observée.
 */
export function renderKeelReengagementResume(args: {
  stage: "welcome_back";
  responseLocale: string;
}): string {
  void args.stage;
  return WELCOME_BACK[localeOf(args.responseLocale)];
}

/** Exporté pour le test de lexique: il doit voir TOUS les gabarits. */
export const KEEL_RESUME_ALL_TEMPLATES = [...Object.values(WELCOME_BACK)];
