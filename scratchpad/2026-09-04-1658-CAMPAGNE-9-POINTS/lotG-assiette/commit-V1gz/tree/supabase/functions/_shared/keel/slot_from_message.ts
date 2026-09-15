/**
 * KEEL — LE CRÉNEAU QUE L'ÉLÈVE A NOMMÉ, lu déterministiquement dans SON texte.
 *
 * ── LE DÉFAUT MESURÉ (QA agent 4, 2026-08-03) ─────────────────────────────
 * Trois messages, trois créneaux nommés explicitement, trois `slot_key` NULL en
 * base:
 *
 *   « I had chicken and rice for LUNCH »        -> slot_key NULL
 *   « I ate yoghurt at BREAKFAST this morning » -> slot_key NULL
 *   « I had salmon for DINNER tonight »         -> slot_key NULL
 *
 * Ce n'était pas un manque de capacité: `log_protocol_event/intake.ts` LIT
 * `payload_hint.slot_key` (`parseSlotKey`, l. 321-326) et le prompt dispatcher
 * le DEMANDE nommément (« le creneau que l'eleve nomme »). Le modèle ne
 * l'émettait simplement jamais. 0/3, pas du bruit.
 *
 * ── POURQUOI UN EXTRACTEUR ET PAS UN MEILLEUR PROMPT ──────────────────────
 * Parce que le prompt le demandait déjà. C'est exactement la leçon
 * `p8-revalidation-rose-reds`: un correctif prompt-only régresse en run réel.
 * Et l'enjeu n'est pas cosmétique — `timingFor` (`evaluator.ts:576-585`) est la
 * SEULE source de `on_time`/`off_window`, et le correctif B2 de
 * `Q6_NUTRITION_LAYER` consiste à filtrer par slot dans `matchEvent`. Livré sur
 * une colonne toujours NULL, B2 arriverait **pré-désarmé**: une garde neuve qui
 * ne peut pas mordre parce que sa donnée d'entrée est vide.
 *
 * ── LA RÈGLE QUE CE MODULE NE VIOLE PAS ───────────────────────────────────
 * Le prompt dit: « Absent s'il ne le dit pas — ne le deduis pas de l'heure
 * qu'il est. » Ce module respecte cette règle À LA LETTRE et c'est sa contrainte
 * de conception principale: il ne lit QUE des mots de créneau présents dans le
 * message. Il ne reçoit pas l'horloge, il ne peut donc pas en déduire quoi que
 * ce soit. « j'ai mangé du saumon » à 20h05 ne devient PAS `dinner`.
 *
 * Corollaire assumé: `snack` seul n'est jamais résolu. `snack_am` et `snack_pm`
 * sont deux créneaux distincts, et trancher entre eux demanderait précisément
 * l'heure qu'on s'interdit de lire. Un `null` honnête vaut mieux qu'un créneau
 * inventé — c'est la même posture que « un unknown vaut toujours mieux qu'un
 * faux met ».
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

import type { SlotKey } from "./tokens.ts";

/**
 * Formes de surface -> créneau. EN + FR (la branche legacy génère encore du
 * français, et un élève peut être servi dans l'une ou l'autre langue).
 *
 * ORDRE SIGNIFICATIF: la table est parcourue telle quelle et la PREMIÈRE forme
 * trouvée dans le message gagne, donc les formes les plus longues viennent en
 * premier. Sans ça « petit-déjeuner » serait lu comme « déjeuner » et un
 * petit-déjeuner français deviendrait un déjeuner — une erreur silencieuse d'un
 * repas d'écart, tous les matins.
 */
const SLOT_SURFACE_FORMS: ReadonlyArray<readonly [string, SlotKey]> = [
  // --- formes composées d'abord (voir la note sur l'ordre)
  ["petit-dejeuner", "breakfast"],
  ["petit dejeuner", "breakfast"],
  ["petit-dej", "breakfast"],
  ["petit dej", "breakfast"],
  ["pre-workout", "pre_workout"],
  ["pre workout", "pre_workout"],
  ["before training", "pre_workout"],
  ["before my workout", "pre_workout"],
  ["avant l'entrainement", "pre_workout"],
  ["avant la seance", "pre_workout"],
  ["post-workout", "post_workout"],
  ["post workout", "post_workout"],
  ["after training", "post_workout"],
  ["after my workout", "post_workout"],
  ["apres l'entrainement", "post_workout"],
  ["apres la seance", "post_workout"],
  ["before bed", "before_bed"],
  ["before going to bed", "before_bed"],
  ["at bedtime", "before_bed"],
  ["au coucher", "before_bed"],
  ["avant de dormir", "before_bed"],
  ["avant d'aller au lit", "before_bed"],
  ["on waking", "on_waking"],
  ["when i woke up", "on_waking"],
  ["first thing", "on_waking"],
  ["au reveil", "on_waking"],
  ["evening meal", "dinner"],
  // --- LES FORMES DÉICTIQUES DE REPAS, et pourquoi elles sont ici
  //
  // MESURÉ (FF-017, run réel 2026-08-08, 3 tours sur 3):
  //   « Poulet grillé, riz complet et brocolis à midi »  -> slot_key NULL
  //   « Grilled salmon … for dinner »                    -> slot_key dinner
  // Le créneau le plus courant du français — « à midi » — n'était dans aucune
  // des deux listes, alors que le plancher de FF-017 l'accepte comme mot de
  // créneau pour OUVRIR sa porte (`SLOT_MARKERS`). La déclaration passait donc
  // la porte grâce à « à midi » et s'écrivait sans le créneau que « à midi »
  // nommait. C'est la cicatrice `guard-tested-in-one-language-only` à
  // l'intérieur d'une même fonctionnalité, et R6 de FF-017 la nomme.
  //
  // ⚠️ CE QUI RESTE DEHORS, ET C'EST LA MOITIÉ DE LA DÉCISION. « ce matin » et
  // « this morning » ne sont PAS des créneaux: un fruit à 10 h n'est pas un
  // petit-déjeuner, et les mapper inventerait le repas le plus souvent sauté.
  // Le module préfère un `null` honnête à un créneau supposé — c'est déjà sa
  // règle pour `snack`, et elle vaut identiquement dans les deux langues.
  ["a midi", "lunch"],
  ["ce midi", "lunch"],
  ["le midi", "lunch"],
  ["hier midi", "lunch"],
  ["ce soir", "dinner"],
  ["hier soir", "dinner"],
  ["this evening", "dinner"],
  ["at lunchtime", "lunch"],
  // --- formes simples
  ["breakfast", "breakfast"],
  ["lunch", "lunch"],
  ["lunchtime", "lunch"],
  ["midday", "lunch"],
  ["dinner", "dinner"],
  ["supper", "dinner"],
  ["tonight", "dinner"],
  ["dejeuner", "lunch"],
  ["diner", "dinner"],
  ["souper", "dinner"],
  ["midi", "lunch"],
];

/**
 * Normalisation minimale, alignée sur `forbidden_matcher.normalizeForMatch`:
 * retirer les diacritiques et minusculiser, rien d'autre. « dîner » doit
 * matcher « diner », « Petit-Déjeuner » doit matcher « petit-dejeuner ».
 */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Frontière de mot tolérante aux tirets/apostrophes qui entourent nos formes. */
function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[\s-]+/g, "[\\s\\-]+");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(haystack);
}

/**
 * Le créneau nommé dans le message, ou `null`.
 *
 * `null` quand l'élève n'en nomme aucun, ET quand il en nomme PLUSIEURS: un
 * message qui parle de deux repas ne désigne pas un créneau, il en décrit
 * deux, et en choisir un serait inventer. Le fait reste écrit sans slot —
 * exactement l'état d'avant ce module, donc aucune régression possible sur ce
 * cas.
 */
export function slotKeyNamedIn(message: unknown): SlotKey | null {
  const text = normalize(String(message ?? ""));
  if (!text.trim()) return null;

  const found: SlotKey[] = [];
  const matchedSpans: string[] = [];
  for (const [phrase, slot] of SLOT_SURFACE_FORMS) {
    if (!containsPhrase(text, phrase)) continue;
    // Une forme déjà couverte par une forme plus longue déjà trouvée ne compte
    // pas pour une seconde mention: « petit-dejeuner » contient « dejeuner ».
    if (matchedSpans.some((span) => span.includes(phrase))) continue;
    matchedSpans.push(phrase);
    if (!found.includes(slot)) found.push(slot);
  }
  return found.length === 1 ? found[0] : null;
}
