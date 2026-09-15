/**
 * FF-058 — LA BANDE DU SOIR. Ce qui rend la coche gratuite à poser.
 *
 * ── LE DÉFAUT PRODUIT QUE CE MODULE CORRIGE ─────────────────────────────────
 * La coche existe et elle est bonne (`meal_tick.ts`). Elle coûte simplement trop
 * cher à POSER: ouvrir l'app, trouver l'écran, retrouver les plats. Donc les
 * coches sont clairsemées, donc tout ce qui les lit — le fait du soir,
 * l'adhérence, la vue coach, FF-056 — décide sur du bruit.
 *
 * On n'ajoute AUCUNE collecte. On réduit le prix d'un geste que la personne
 * voulait déjà faire, dans le message du soir QUI EXISTE DÉJÀ.
 *
 * ── LA FRONTIÈRE QUI TIENT TOUTE LA FICHE (R2, et T3 avec elle) ─────────────
 * `[✓ poulet-riz]` OFFRE. « Tu as mangé le poulet ? » INTERROGE. La bande est
 * une AFFORDANCE, pas une question — c'est ce qui la rend compatible avec T3
 * (« le chat n'initie jamais une collecte »). Si cette frontière tombe, toute la
 * fiche tombe, et c'est pour ça que `acceptStripText` est un vérificateur ARMÉ
 * sur le texte exact, dans les deux langues, et pas une consigne de rédaction.
 *
 * Corollaires directs, tous vérifiés ici plutôt que promis:
 *   · AUCUN verdict, même positif (R4). L'accusé du `✓` ne dit ni « bravo », ni
 *     « 3/3 », ni série — `findQualifyingVerdict` (la ceinture partagée du soir)
 *     est appliquée au texte, et aucun chiffre n'y est autorisé.
 *   · AUCUNE question sur le futur (R17). La date des courses est déjà dans le
 *     plan: le jour venu on CONSTATE.
 *   · Zéro plat prévu ⇒ AUCUNE bande (R7). `buildEveningStrip` rend `null`, et
 *     le message du soir reste exactement ce qu'il était.
 *
 * ── LE COÛT DU GESTE NOMINAL EST DE UN TAP (R1) ────────────────────────────
 * Trois oui/non par soir seraient le formulaire quotidien que ce produit a
 * retiré, avec sa mesure: « un formulaire quotidien se fait ignorer, puis
 * couper ; la mesure elle-même finissait par se détruire » (`daily_recap.ts`).
 * D'où UN bouton agrégé, et la déviation seule qui coûte deux ou trois gestes.
 *
 * ── LES IDENTIFIANTS SONT DU DÉTERMINISTE, JAMAIS DU LLM ───────────────────
 * Même règle que `daily_pulse.ts`. Et l'identifiant agrégé porte LA LISTE DES
 * INDEX, pas un « tout » ambigu: le tap doit rester reconstructible (quels
 * plats exactement) et idempotent (l'index unique partiel
 * `(user_id, source_message_id)` arbitre le double tap côté Postgres, comme
 * pour l'écran — rien à coder).
 *
 * ⚠️ LE PLAN QUI POSSÈDE LE JOUR, JAMAIS `startsWith`. Un plan COURANT et un
 * plan SUIVANT coexistent et leurs coches portent le même préfixe. Toutes les
 * clés d'ici sont bâties sur le `mealId` du plan qui possède CE jour
 * (`loadPlannedDishContext`), et relues par `parseMealTickKey`. Le symptôme
 * qu'on évite est documenté dans `meal_tick.ts`: un « 5 des 3 » qu'aucune
 * erreur ne signale.
 *
 * ── LE FOYER: LA CUISSON EST UN FAIT DE FOYER, LA CONSOMMATION UN FAIT DE
 *    PERSONNE (R10-R14) ─────────────────────────────────────────────────────
 * Ce module ne connaît qu'UNE personne à la fois, et c'est la garantie: il n'y a
 * ici AUCUN chemin par lequel le tap d'un compte pourrait écrire une coche
 * attribuée à quelqu'un d'autre (R11), et aucune bouche sans compte n'a de clé
 * (R12). `masterOnly` porte ce qui appartient au FOYER — aujourd'hui la seule
 * ligne de courses (R14) — et il est REQUIS: un paramètre de garde optionnel est
 * une garde désarmée.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire (un refus de ceinture se
 * journalise, et c'est tout). La lecture et l'écriture vivent dans
 * `evening_strip_io.ts`.
 */

import { findQualifyingVerdict } from "./daily_recap.ts";
import {
  type ForbiddenTerm,
  findForbiddenMatches,
} from "./forbidden_matcher.ts";
import { mealTickKey, parseMealTickKey } from "./meal_tick.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE DES IDENTIFIANTS
// ---------------------------------------------------------------------------

/**
 * Le préfixe de tous les identifiants de cette bande.
 *
 * Disjoint de `KEEL_PULSE_` (`daily_pulse.ts`) et de `KEEL_RECO_`
 * (`daily_recommendation.ts`): chaque lecteur rend « rien » sur ce qui ne le
 * concerne pas, et l'ordre de lecture dans `deterministic_buttons.ts` est donc
 * sans conséquence.
 */
export const STRIP_BUTTON_PREFIX = "KEEL_STRIP_";

/**
 * Le séparateur de premier niveau.
 *
 * `|` et pas `:`, parce que la charge utile CONTIENT une clé de coche, qui est
 * elle-même faite de `:` (`meal_tick:<uuid>:<index>`). Un seul séparateur pour
 * les deux niveaux obligerait à compter les segments — c'est-à-dire à deviner —
 * et `parseMealTickKey` refuse déjà de deviner sur une clé mal formée.
 */
const SEP = "|";

export const STRIP_KIND = {
  /** Toutes les coches du jour, en un tap. La charge porte la liste des index. */
  all: "KEEL_STRIP_ALL",
  /** Déplier les plats un par un. Ne rien écrire. */
  some: "KEEL_STRIP_SOME",
  /** Un plat coché. La charge EST la clé de coche. */
  tick: "KEEL_STRIP_TICK",
  /** Un plat décoché. La charge EST la clé de coche. */
  untick: "KEEL_STRIP_UNTICK",
  /** La vague de courses du jour est faite. */
  shopDone: "KEEL_STRIP_SHOP_DONE",
  /** La vague de courses du jour n'est pas faite. */
  shopLater: "KEEL_STRIP_SHOP_LATER",
} as const;

export interface StripButton {
  id: string;
  title: string;
}

export function stripAllId(mealId: string, dishIndexes: readonly number[]): string {
  const id = String(mealId ?? "").trim();
  if (!id) throw new Error("[keel/evening_strip] empty meal id");
  if (dishIndexes.length === 0) {
    throw new Error("[keel/evening_strip] the aggregate id carries no dish");
  }
  // La liste des index, PAS un « tout ». Un « tout » se réinterpréterait au
  // moment du tap contre un plan qui a pu changer entre-temps, et il écrirait
  // alors des coches que la personne n'a jamais vues nommées. Ici le tap ne peut
  // écrire que ce que la bande a montré.
  return [STRIP_KIND.all, id, indexList(dishIndexes)].join(SEP);
}

export function stripSomeId(mealId: string, dishIndexes: readonly number[]): string {
  const id = String(mealId ?? "").trim();
  if (!id) throw new Error("[keel/evening_strip] empty meal id");
  if (dishIndexes.length === 0) {
    throw new Error("[keel/evening_strip] the aggregate id carries no dish");
  }
  return [STRIP_KIND.some, id, indexList(dishIndexes)].join(SEP);
}

/** ✓ sur UN plat. La charge est la clé de coche elle-même — une seule forme. */
export function stripTickId(mealId: string, dishIndex: number): string {
  return `${STRIP_KIND.tick}${SEP}${mealTickKey(mealId, dishIndex)}`;
}

/** ✗ sur UN plat. Même clé, autre verbe. */
export function stripUntickId(mealId: string, dishIndex: number): string {
  return `${STRIP_KIND.untick}${SEP}${mealTickKey(mealId, dishIndex)}`;
}

export function stripShoppingId(
  kind: "done" | "later",
  mealId: string,
  buyOn: string,
): string {
  const id = String(mealId ?? "").trim();
  if (!id) throw new Error("[keel/evening_strip] empty meal id");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(buyOn ?? ""))) {
    throw new Error(`[keel/evening_strip] "${buyOn}" is not a calendar date`);
  }
  return [
    kind === "done" ? STRIP_KIND.shopDone : STRIP_KIND.shopLater,
    id,
    buyOn,
  ].join(SEP);
}

function indexList(dishIndexes: readonly number[]): string {
  for (const i of dishIndexes) {
    if (!Number.isInteger(i) || i < 0) {
      throw new Error(`[keel/evening_strip] bad dish index ${i}`);
    }
  }
  return [...dishIndexes].join(",");
}

// ---------------------------------------------------------------------------
// RELIRE UN TAP — déterministe, et il ne devine jamais
// ---------------------------------------------------------------------------

export type StripReply =
  | { kind: "all"; mealId: string; dishIndexes: number[] }
  | { kind: "some"; mealId: string; dishIndexes: number[] }
  | { kind: "tick"; mealId: string; dishIndex: number }
  | { kind: "untick"; mealId: string; dishIndex: number }
  | { kind: "shopping"; done: boolean; mealId: string; buyOn: string }
  | { kind: "none" };

const NONE: StripReply = { kind: "none" };

/**
 * Interprète un `button_payload`. Rend `{kind:"none"}` sur tout ce qui n'est pas
 * exactement une charge de cette bande — jamais une supposition.
 *
 * Aucun repli sur le texte libre, pour la raison que `readPulseReply` écrit déjà:
 * « oui » tapé à la main peut vouloir dire la réponse au bouton comme n'importe
 * quoi d'autre. Un identifiant, lui, ne peut venir que du bouton.
 */
export function readStripReply(payload: string | null | undefined): StripReply {
  const raw = String(payload ?? "").trim();
  if (!raw.startsWith(STRIP_BUTTON_PREFIX)) return NONE;

  const at = raw.indexOf(SEP);
  if (at <= 0) return NONE;
  const kind = raw.slice(0, at);
  const rest = raw.slice(at + 1);

  if (kind === STRIP_KIND.tick || kind === STRIP_KIND.untick) {
    const parsed = parseMealTickKey(rest);
    if (!parsed) return NONE;
    return {
      kind: kind === STRIP_KIND.tick ? "tick" : "untick",
      mealId: parsed.mealId,
      dishIndex: parsed.dishIndex,
    };
  }

  const cut = rest.lastIndexOf(SEP);
  if (cut <= 0) return NONE;
  const mealId = rest.slice(0, cut);
  const tail = rest.slice(cut + 1);
  if (!mealId) return NONE;

  if (kind === STRIP_KIND.all || kind === STRIP_KIND.some) {
    const indexes: number[] = [];
    for (const token of tail.split(",")) {
      // ⚠️ `Number("")` vaut 0, ET `Number.isInteger(0)` vaut `true`. Sans ce
      // refus explicite, une charge tronquée (`…|<mealId>|`) se relisait comme
      // « le plat n° 0 » — c'est-à-dire qu'une clé mal formée écrivait une
      // coche, exactement ce que `parseMealTickKey` refuse de faire. Trouvé par
      // le test des charges malformées, pas par relecture.
      if (!/^\d+$/.test(token)) return NONE;
      const n = Number(token);
      if (!Number.isInteger(n) || n < 0) return NONE;
      indexes.push(n);
    }
    if (indexes.length === 0) return NONE;
    return {
      kind: kind === STRIP_KIND.all ? "all" : "some",
      mealId,
      dishIndexes: indexes,
    };
  }

  if (kind === STRIP_KIND.shopDone || kind === STRIP_KIND.shopLater) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tail)) return NONE;
    return {
      kind: "shopping",
      done: kind === STRIP_KIND.shopDone,
      mealId,
      buyOn: tail,
    };
  }

  return NONE;
}

// ---------------------------------------------------------------------------
// LA CEINTURE — « une affordance, pas une question »
// ---------------------------------------------------------------------------

/**
 * LES FORMULATIONS QUI FONT REDEVENIR LA BANDE UNE QUESTION.
 *
 * ── POURQUOI PAS UN MATCHER MAISON ─────────────────────────────────────────
 * Cicatrice `never-hand-roll-a-matcher-here`: « laitue » matchait « lait », 12
 * faux positifs sur 12 mesurés. Le matcher de ce dépôt est
 * `findForbiddenMatches`, et il porte déjà les frontières de mot correctes (des
 * lookarounds sur lettres/chiffres, pas `\b` — qui ne mord pas après « é »).
 *
 * ── EN ET FR, PARCE QUE T9 ─────────────────────────────────────────────────
 * Cicatrice `guard-tested-in-one-language-only`: une garde écrite dans une seule
 * langue passe par accident de grammaire. Chaque famille est donc écrite dans
 * les deux, et chacune a un test qui la fait MORDRE et un test où elle NE MORD
 * PAS sur la formulation légitime de la bande.
 *
 * ── LECTURE ABSOLUE, NÉGATION NON BLANCHISSANTE ────────────────────────────
 * `allowNegatedMentions: false`. « Je ne te demande pas si tu as mangé » reste
 * une phrase qui parle de demander, et elle n'a rien à faire dans une bande.
 */
const INTERROGATIVE_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "did_you",
    token: "did_you",
    surfaceForms: ["have you", "did you", "were you", "was it"],
  },
  {
    ruleId: "how_was",
    token: "how_was",
    surfaceForms: ["how was", "how did", "how are", "how is"],
  },
  {
    ruleId: "what_did",
    token: "what_did",
    surfaceForms: ["what did", "what do", "what have", "which ones"],
  },
  {
    ruleId: "as_tu",
    token: "as_tu",
    // « t'as » est écrit sans apostrophe ici: `tokenPattern` découpe sur
    // espaces/tirets/underscores, et l'apostrophe n'est pas un séparateur —
    // « t'as mangé » se lit donc comme un seul mot « t'as ». On liste la forme
    // telle qu'elle s'écrit.
    surfaceForms: ["as-tu", "avez-vous", "est-ce que", "t'as", "tu as mange"],
  },
  {
    ruleId: "comment_s_est",
    token: "comment_s_est",
    surfaceForms: ["comment s'est", "comment ca", "qu'est-ce que", "c'etait comment"],
  },
];

export type StripTextRefusal =
  /** Un point d'interrogation, où que ce soit. La frontière la plus simple. */
  | "asks_a_question"
  /** Une tournure interrogative sans point d'interrogation. */
  | "interrogative_phrasing"
  /** R4 — un verdict, même positif. Ceinture partagée avec le message du soir. */
  | "qualifies_the_day"
  /** R4 — un chiffre dans un accusé, c'est un score en germe. */
  | "carries_a_number";

export type StripTextVerdict =
  | { ok: true }
  | { ok: false; reason: StripTextRefusal; detail: string };

/**
 * Le texte de la bande est-il une AFFORDANCE ?
 *
 * @param banNumbers REQUIS. `true` pour les accusés (R4: ni score, ni série, ni
 *   « 3/3 »); `false` pour la ligne qui NOMME les plats, laquelle a parfaitement
 *   le droit de porter « et 2 autres ». Requis et non optionnel: un paramètre de
 *   garde optionnel est une garde désarmée, et ici l'oubli aurait fait passer un
 *   accusé chiffré sans que rien ne le signale.
 */
export function acceptStripText(
  text: string,
  banNumbers: boolean,
): StripTextVerdict {
  const raw = String(text ?? "");

  const mark = raw.match(/[?？]/);
  if (mark) return { ok: false, reason: "asks_a_question", detail: mark[0] };

  const found = findForbiddenMatches(raw, INTERROGATIVE_TERMS, {
    allowNegatedMentions: false,
  });
  if (found.length > 0) {
    return {
      ok: false,
      reason: "interrogative_phrasing",
      detail: found.map((f) => f.matchedText).join(" | "),
    };
  }

  // R4 — LA MÊME CEINTURE QUE LE MESSAGE DU SOIR, sur CE chemin aussi.
  // Elle est appelée ici plutôt que supposée: `acceptComposedRecap` ne juge que
  // le corps composé par le modèle, et la bande n'y passe jamais. Sans cet
  // appel, « Bravo, tout comme prévu ! » sortirait par un chemin que la ceinture
  // du soir ne regarde pas — c'est-à-dire une ceinture verte et désarmée.
  const verdict = findQualifyingVerdict(raw);
  if (verdict) {
    return { ok: false, reason: "qualifies_the_day", detail: verdict };
  }

  if (banNumbers) {
    const digit = raw.match(/\d/);
    if (digit) {
      return { ok: false, reason: "carries_a_number", detail: digit[0] };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// LE TEXTE — deux langues, tables fermées
// ---------------------------------------------------------------------------

/**
 * La langue de la bande. Résolue par l'appelant (`isFrenchLocale`), et REQUISE:
 * `profiles.locale` vaut `fr-FR` par défaut en base, donc un défaut implicite
 * ici mentirait sur la langue de la moitié des fixtures.
 */
export type StripLanguage = "fr" | "en";

interface StripCopy {
  /** Introduit la liste des plats. NON interrogatif — c'est le sujet de R2. */
  today: string;
  and: string;
  more: (n: number) => string;
  allAsPlanned: string;
  notEverything: string;
  dishesLead: string;
  tick: (title: string) => string;
  untick: (title: string) => string;
  /** Constat, jamais question sur le futur (R17). */
  shoppingLead: string;
  shoppingDone: string;
  shoppingLater: string;
  ackAll: string;
  ackTick: string;
  ackUntick: string;
  ackShoppingDone: string;
  ackShoppingLater: string;
  ackStale: string;
}

const COPY: Readonly<Record<StripLanguage, StripCopy>> = {
  en: {
    today: "Today",
    and: "and",
    more: (n) => (n === 1 ? "1 more" : `${n} more`),
    allAsPlanned: "✓ All as planned",
    notEverything: "Not everything",
    dishesLead: "Today's dishes",
    tick: (t) => `✓ ${t}`,
    untick: (t) => `✗ ${t}`,
    shoppingLead: "Shopping was on the plan for today.",
    shoppingDone: "✓ Shopping done",
    shoppingLater: "Not yet",
    ackAll: "Noted.",
    ackTick: "Noted.",
    ackUntick: "Noted.",
    ackShoppingDone: "Noted.",
    ackShoppingLater: "Noted.",
    ackStale: "That one is out of date now — nothing was saved.",
  },
  fr: {
    today: "Aujourd'hui",
    and: "et",
    more: (n) => (n === 1 ? "1 autre" : `${n} autres`),
    allAsPlanned: "✓ Tout comme prévu",
    notEverything: "Pas tout",
    dishesLead: "Les plats du jour",
    tick: (t) => `✓ ${t}`,
    untick: (t) => `✗ ${t}`,
    shoppingLead: "Les courses étaient au plan aujourd'hui.",
    shoppingDone: "✓ Courses faites",
    shoppingLater: "Pas encore",
    ackAll: "C'est noté.",
    ackTick: "C'est noté.",
    ackUntick: "C'est noté.",
    ackShoppingDone: "C'est noté.",
    ackShoppingLater: "C'est noté.",
    ackStale: "Celui-là n'est plus d'actualité — rien n'a été enregistré.",
  },
};

/** Au-delà, on ne nomme plus: on compte. Même arbitrage que `daily_recap.ts`. */
export const MAX_STRIP_TITLES = 4;

/**
 * Un titre de plat, ramené à ce qui se lit dans une bulle.
 *
 * ── LE POINT D'INTERROGATION EST RETIRÉ, ET C'EST UNE DÉCISION ─────────────
 * Un titre est de la DONNÉE (il vient de la composition), pas une formulation
 * que nous écrivons. La ceinture de R2, elle, juge ce que NOUS écrivons — voir
 * `authoredTextOf`. Mais un « ? » dans un titre ferait quand même LIRE la bande
 * comme une question, et c'est le seul caractère qui puisse produire cet effet.
 * On le retire du titre plutôt que de supprimer la bande: perdre une
 * ponctuation coûte moins cher que perdre l'affordance tous les soirs, en
 * silence, chez un élève dont un plat s'appelle mal.
 */
function cleanTitle(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[?？]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// CONSTRUIRE LA BANDE
// ---------------------------------------------------------------------------

export interface StripDish {
  /** L'INDEX D'ORIGINE dans la composition. C'est lui qui identifie la coche. */
  dishIndex: number;
  title: string;
}

/**
 * LA VAGUE DE COURSES DU SOIR — au plus UNE, déjà arbitrée par l'appelant.
 *
 * Deux vagues qui tombent le même jour ⇒ UNE seule ligne (§7): la ligne porte
 * « les courses du jour », pas chaque vague. L'appelant fusionne, ce module rend
 * une ligne.
 */
export interface StripShoppingWave {
  /** `YYYY-MM-DD` — le jour d'achat, et il vaut AUJOURD'HUI (R15). */
  buyOn: string;
}

export interface EveningStrip {
  /** La ligne à coller sous le fait du jour. Jamais vide quand la bande existe. */
  line: string;
  buttons: StripButton[];
  /** De quoi mesurer R6 sans relire le texte. */
  interactiveCount: number;
  /** Les plats nommés, pour le compte-rendu du job. */
  dishCount: number;
  /** La ligne de courses est-elle portée ? Faux le plus souvent. */
  carriesShopping: boolean;
}

/**
 * La bande, ou `null` quand il n'y en a pas.
 *
 * `null` dans exactement deux cas, et les deux sont des DÉCISIONS:
 *   · aucun plat prévu ce jour (R7) — le message du soir reste ce qu'il est;
 *   · le texte produit ne passe pas la ceinture — on préfère perdre la bande
 *     que sortir une question. Fail-closed du côté du silence.
 *
 * @param masterOnly REQUIS (R14). `true` quand ce compte répond des faits du
 *   FOYER — le maître, ou une personne sans foyer, qui est son propre maître. Un
 *   profil réclamé reçoit ses plats et JAMAIS la ligne de courses: il n'en sait
 *   rien, et sa réponse serait du bruit. Requis parce que le défaut inverse
 *   (`false` par omission) ferait taire la ligne pour tout le monde sans qu'un
 *   seul test ne tombe.
 * @param restrictionFlag REQUIS (R8). Le plancher de restriction alimentaire.
 *   Sous plancher, AUCUNE bande — et le plancher est PAR PERSONNE: un maître
 *   sous plancher n'en reçoit pas, son conjoint reçoit la sienne normalement.
 *
 *   ⚠️ SON SEUL PRODUCTEUR A ÉTÉ RETIRÉ EN L3 LE 2026-08-08
 *   (`isRestrictionFlagged`, sur `weekly_reviews.risk_band`, colonne sans
 *   écrivain). `keel-daily-pulse-v1` passe donc `false`, exactement comme il le
 *   fait déjà pour la pratique du soir. La garde est ici, ARMÉE et testée,
 *   plutôt que chez l'appelant: c'est ce qui la rendra vivante le jour où une
 *   source alimentée sera rebranchée, au lieu d'être une ligne à retrouver.
 */
export function buildEveningStrip(args: {
  mealId: string;
  dishes: readonly StripDish[];
  language: StripLanguage;
  /** La vague du jour, ou `null`. Voir R15: seulement le soir d'un `buyOn`. */
  shopping: StripShoppingWave | null;
  masterOnly: boolean;
  restrictionFlag: boolean;
}): EveningStrip | null {
  // R8 — LE PLANCHER PRIME SUR TOUT, ET IL PASSE EN PREMIER. Une bande sous
  // plancher nommerait des plats à quelqu'un dont on vient de décider qu'on ne
  // lui parle pas de nourriture; l'ordre des gardes est le contrat (T7).
  if (args.restrictionFlag) return null;

  const copy = COPY[args.language];
  const dishes = args.dishes
    .map((d) => ({ dishIndex: d.dishIndex, title: cleanTitle(d.title) }))
    .filter((d) => Number.isInteger(d.dishIndex) && d.dishIndex >= 0);

  // R7 — zéro plat prévu, aucune bande. Et pas de bande « courses seule »: la
  // ligne de courses voyage DANS la bande, elle n'en est pas une à elle seule.
  if (dishes.length === 0) return null;

  const named = dishes.map((d) => d.title).filter(Boolean);
  const shown = named.slice(0, MAX_STRIP_TITLES);
  const hidden = dishes.length - shown.length;
  const list = shown.length === 0
    // Des plats sans titre citable: on ne fabrique pas de nom, on ne nomme
    // simplement pas. Le bouton, lui, reste exact.
    ? ""
    : hidden > 0
    ? `${shown.join(" · ")} ${copy.and} ${copy.more(hidden)}`
    : shown.join(" · ");

  const lines: string[] = [];
  lines.push(list ? `${copy.today} : ${list}` : `${copy.today} :`);

  // CE QUE NOUS ÉCRIVONS, séparé de ce que le PLAN nous donne. La ceinture de R2
  // juge notre formulation; un titre de plat n'en est pas une, et le laisser
  // faire disparaître la bande transformerait une donnée bizarre en panne
  // silencieuse et quotidienne.
  const authored: string[] = [
    copy.today,
    copy.and,
    hidden > 0 ? copy.more(hidden) : "",
  ];

  const indexes = dishes.map((d) => d.dishIndex);
  const buttons: StripButton[] = [
    { id: stripAllId(args.mealId, indexes), title: copy.allAsPlanned },
    { id: stripSomeId(args.mealId, indexes), title: copy.notEverything },
  ];
  authored.push(copy.allAsPlanned, copy.notEverything);

  // ── R14/R15 — LA LIGNE DE COURSES ────────────────────────────────────────
  // Elle n'apparaît QUE le soir d'un `buyOn`, et QUE chez le maître. La faire
  // réapparaître « tant que ce n'est pas fait » serait du harcèlement de corvée,
  // et c'est cette limitation qui rend le mécanisme acceptable.
  const carriesShopping = Boolean(args.shopping) && args.masterOnly;
  if (carriesShopping && args.shopping) {
    lines.push(copy.shoppingLead);
    buttons.push({
      id: stripShoppingId("done", args.mealId, args.shopping.buyOn),
      title: copy.shoppingDone,
    });
    buttons.push({
      id: stripShoppingId("later", args.mealId, args.shopping.buyOn),
      title: copy.shoppingLater,
    });
    authored.push(copy.shoppingLead, copy.shoppingDone, copy.shoppingLater);
  }

  const line = lines.join("\n");
  // La ceinture juge tout ce que NOUS écrivons — la ligne d'entête et les
  // libellés compris. Un libellé interrogatif sous une ligne irréprochable
  // resterait une question.
  const verdict = acceptStripText(authored.filter(Boolean).join("\n"), false);
  if (!verdict.ok) return null;

  return {
    line,
    buttons,
    interactiveCount: buttons.length,
    dishCount: dishes.length,
    carriesShopping,
  };
}

/**
 * FF-061 ① — LES COURSES, SEULES, EN TÊTE DE CHAÎNE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI ELLE SORT DE LA BANDE, ALORS QU'ELLE Y VIVAIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * FF-058 la faisait voyager DANS la bande: une ligne de plus sous la liste des
 * plats, deux boutons de plus. C'était juste tant que les deux étaient
 * indépendantes.
 *
 * FF-061 les rend dépendantes: **① éteint ③**. Déclarer « pas encore » invalide
 * la cuisson que cette vague sert, donc les plats qui en descendent. Les
 * afficher dans la MÊME bulle reviendrait à nommer des plats qu'on est en train
 * de rendre impossibles, et à laisser leurs boutons armés — la personne
 * cocherait un repas que sa propre réponse vient d'effacer.
 *
 * D'où la chaîne: ① seule, puis la suite se calcule sur l'état écrit
 * (`day_review.ts`). Le coût est un tap de plus les soirs de courses, et il est
 * assumé: c'est le prix de ne pas montrer un plan faux.
 *
 * ⛔ CE N'EST TOUJOURS PAS UNE QUESTION SUR LE FUTUR (R17 de FF-058). La date
 * des courses est dans le plan; le jour venu, on CONSTATE. La même ceinture
 * (`acceptStripText`) juge ce texte-ci que celui de la bande.
 *
 * @param masterOnly REQUIS (R9 de FF-061, R14 de FF-058). La vague est un fait
 *   de FOYER: un profil réclamé n'a pas à en répondre, et sa réponse serait du
 *   bruit. Requis parce que le défaut inverse ferait taire l'étape pour tout le
 *   monde sans qu'un test ne tombe.
 * @param restrictionFlag REQUIS (R12 de FF-061). Sous plancher, aucun bilan.
 */
export function buildShoppingStep(args: {
  mealId: string;
  buyOn: string;
  language: StripLanguage;
  masterOnly: boolean;
  restrictionFlag: boolean;
}): { line: string; buttons: StripButton[] } | null {
  // L'ORDRE DES GARDES EST LE CONTRAT (T7): le plancher passe en premier.
  if (args.restrictionFlag) return null;
  if (!args.masterOnly) return null;
  const copy = COPY[args.language];
  const buttons: StripButton[] = [
    {
      id: stripShoppingId("done", args.mealId, args.buyOn),
      title: copy.shoppingDone,
    },
    {
      id: stripShoppingId("later", args.mealId, args.buyOn),
      title: copy.shoppingLater,
    },
  ];
  const verdict = acceptStripText(
    [copy.shoppingLead, ...buttons.map((b) => b.title)].join("\n"),
    false,
  );
  // Fail-closed du côté du silence, comme la bande: on préfère perdre l'étape
  // que sortir une question.
  if (!verdict.ok) return null;
  return { line: copy.shoppingLead, buttons };
}

/**
 * L'ÉTAPE `Pas tout` — les plats, ✓/✗ chacun.
 *
 * DEUX boutons par plat, et pas un seul. « Tape ce qui n'a pas eu lieu » ferait
 * du silence sur les autres une coche: c'est la coche automatique que la fiche
 * interdit, obtenue en évitant de la nommer. Le silence n'écrit rien, jamais.
 *
 * Ce n'est PAS un second message du soir: c'est la réponse à un tap
 * (`isReply: true`), exactement comme la question d'axe du pulse. L'interdit
 * « jamais un second message » porte sur la NOTIFICATION du soir.
 */
export function renderStripDishStep(args: {
  mealId: string;
  dishes: readonly StripDish[];
  language: StripLanguage;
}): { body: string; buttons: StripButton[] } | null {
  const copy = COPY[args.language];
  const dishes = args.dishes.filter((d) =>
    Number.isInteger(d.dishIndex) && d.dishIndex >= 0
  );
  if (dishes.length === 0) return null;

  const buttons: StripButton[] = [];
  for (const dish of dishes) {
    // Un plat sans titre garde sa position, et la position est ce qui identifie
    // la coche. On l'affiche par son rang plutôt que de le faire disparaître —
    // un plat évaporé de la bande est un plat qu'on ne pourra jamais cocher.
    const title = cleanTitle(dish.title) || `#${dish.dishIndex + 1}`;
    buttons.push({
      id: stripTickId(args.mealId, dish.dishIndex),
      title: copy.tick(title),
    });
    buttons.push({
      id: stripUntickId(args.mealId, dish.dishIndex),
      title: copy.untick(title),
    });
  }

  const body = `${copy.dishesLead} :`;
  // Ce que NOUS écrivons ici est l'entête et les deux marqueurs; le reste du
  // libellé est un titre de plat. Même partage que `buildEveningStrip`.
  const verdict = acceptStripText(
    [body, copy.tick("x"), copy.untick("x")].join("\n"),
    false,
  );
  if (!verdict.ok) return null;
  return { body, buttons };
}

// ---------------------------------------------------------------------------
// LES ACCUSÉS — sans verdict, sans chiffre, sans série (R4)
// ---------------------------------------------------------------------------

export type StripAck =
  | "all"
  | "tick"
  | "untick"
  | "shopping_done"
  | "shopping_later"
  | "stale";

/**
 * L'accusé d'un tap de bande. Court, plat, et VÉRIFIÉ.
 *
 * Il ne dit ni « bravo », ni « 3 sur 3 », ni « 4e soir d'affilée ». Le geste est
 * accusé, rien n'est qualifié — même règle que `renderPulseAck`, dont l'en-tête
 * explique pourquoi: sur un geste quotidien, la tendresse non groundée devient
 * insupportable en une semaine.
 *
 * ⚠️ LA CEINTURE EST APPLIQUÉE ICI, pas seulement testée. Une constante qu'on
 * change un mardi soir n'est relue par personne; un vérificateur qui tourne à
 * chaque rendu, si. Le repli est la phrase la plus plate des deux langues.
 */
export function renderStripAck(kind: StripAck, language: StripLanguage): string {
  const copy = COPY[language];
  const text = kind === "all"
    ? copy.ackAll
    : kind === "tick"
    ? copy.ackTick
    : kind === "untick"
    ? copy.ackUntick
    : kind === "shopping_done"
    ? copy.ackShoppingDone
    : kind === "shopping_later"
    ? copy.ackShoppingLater
    : copy.ackStale;

  // `banNumbers: true` — un accusé qui compte est un score qui commence.
  const verdict = acceptStripText(text, true);
  if (verdict.ok) return text;
  console.warn(JSON.stringify({
    tag: "keel.evening_strip.ack_refused",
    kind,
    language,
    reason: verdict.reason,
    detail: verdict.detail,
  }));
  return language === "fr" ? "C'est noté." : "Noted.";
}
