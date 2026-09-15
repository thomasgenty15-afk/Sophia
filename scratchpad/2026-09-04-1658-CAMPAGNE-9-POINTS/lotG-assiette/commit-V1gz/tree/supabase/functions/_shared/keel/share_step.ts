/**
 * A8.3 — LES ÉTAPES D'ÉCRAN DU SORT D'UNE PART. Le modèle PUR du RENDU.
 *
 * `meal_share_outcome.ts` DÉCIDE (l'espace des sorts, qui est cochable, qui a
 * raison). Ce module-ci HABILLE ces décisions en étapes de conversation: des
 * identifiants de bouton, deux tables de mots, et une ceinture. Il n'ajoute
 * AUCUNE règle — chaque liste qu'il rend vient d'une fonction du modèle.
 *
 * Séparé de `evening_strip.ts` pour la raison exacte que `accident_tap.ts`
 * donne de sa propre existence: ce fichier-là est déjà la bande ET son
 * vocabulaire ET sa ceinture, et lui ajouter trois familles d'identifiants le
 * rendrait illisible. La ceinture, elle, est IMPORTÉE et non recopiée
 * (`acceptStripText`): une seconde définition de « ce qui est une affordance »
 * divergerait au premier ajout, et c'est la frontière qui tient FF-058.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ AUCUN DE CES TEXTES N'EST UNE QUESTION, ET L'ÉTAPE S'APPELLE POURTANT
 *    « QUI N'A PAS MANGÉ ? »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le mandat nomme l'étape par sa question. La bande, elle, ne pose JAMAIS de
 * question (FF-058 R2, et `acceptStripText` refuse le point d'interrogation
 * comme les tournures interrogatives des deux langues). Les deux se concilient
 * de la seule façon qui tienne: l'étape porte le nom de la question dans le
 * code, et à l'écran elle CONSTATE puis OFFRE — « Cette part n'a pas été
 * mangée. » suivi de `[Moi] [Tout le foyer] [Choisir…]`.
 *
 * Ce n'est pas un contournement de la règle: c'est la règle. Une bande qui
 * interroge redevient le formulaire quotidien que ce produit a retiré, avec sa
 * mesure — « un formulaire quotidien se fait ignorer, puis couper ». Et la
 * ceinture est APPLIQUÉE ici, pas seulement promise: chaque constructeur passe
 * son texte à `acceptStripText` et rend `null` plutôt que de sortir une
 * question.
 *
 * ── CE QU'AUCUNE DE CES ÉTAPES NE FAIT ────────────────────────────────────
 *   · Aucune écriture. Ce module est pur: l'écriture vit dans
 *     `_shared/chat/share_outcome_tap.ts`, par la RPC de la migration.
 *   · Aucun glissement de plan (D8.4). `[Tout le foyer]` ne déplace rien
 *     ici — il RENVOIE à la procédure accident, qui possède `shift_dish`.
 *   · Aucune coche, dans aucun sens (D8.2). Le silence n'écrit rien.
 */

import { dayName } from "./accident.ts";
import { acceptStripText, type StripLanguage } from "./evening_strip.ts";
import {
  type AccountlessMouth,
  type BoxOption,
  isShareOutcome,
  type ShareOutcome,
} from "./meal_share_outcome.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE DES IDENTIFIANTS
// ---------------------------------------------------------------------------

/**
 * Le préfixe de cette famille.
 *
 * DISJOINT de `KEEL_STRIP_`, `KEEL_FIX_`, `KEEL_PULSE_` et `KEEL_RECO_`: chaque
 * lecteur rend « rien » sur ce qui ne le concerne pas, donc l'ordre de lecture
 * dans `deterministic_buttons.ts` est sans conséquence. Un test le pinne.
 *
 * ⚠️ `KEEL_SHARE_` N'EST PAS UN PRÉFIXE DE `KEEL_STRIP_` NI L'INVERSE — les
 * deux se lisent par `startsWith`, et un préfixe qui en contient un autre ferait
 * répondre deux routeurs au même tap.
 */
export const SHARE_BUTTON_PREFIX = "KEEL_SHARE_";

/** Même séparateur que la bande et la fiche accident, pour la même raison. */
const SEP = "|";

export const SHARE_KIND = {
  /** L'étape « qui n'a pas mangé ». La charge porte le choix. */
  who: "KEEL_SHARE_WHO",
  /** Une bouche SANS COMPTE désignée par le maître. */
  mouth: "KEEL_SHARE_MOUTH",
  /** Le sort d'une boîte. La charge porte la bouche, le sort et le jour. */
  box: "KEEL_SHARE_BOX",
} as const;

/** Les trois réponses de l'étape « qui ». Liste FERMÉE. */
export const WHO_CHOICES = ["me", "all", "pick"] as const;
export type WhoChoice = (typeof WHO_CHOICES)[number];

export interface ShareButton {
  id: string;
  title: string;
}

/** `-` et pas la chaîne vide: une charge tronquée ne doit pas se relire. */
const NO_DAY = "-";

function requireId(raw: string, what: string): string {
  const id = String(raw ?? "").trim();
  if (!id) throw new Error(`[keel/share_step] empty ${what}`);
  if (id.includes(SEP)) {
    throw new Error(`[keel/share_step] ${what} carries the separator`);
  }
  return id;
}

function requireIndex(dishIndex: number): string {
  if (!Number.isInteger(dishIndex) || dishIndex < 0) {
    throw new Error(`[keel/share_step] bad dish index ${dishIndex}`);
  }
  return String(dishIndex);
}

export function shareWhoId(
  mealId: string,
  dishIndex: number,
  choice: WhoChoice,
): string {
  return [
    SHARE_KIND.who,
    requireId(mealId, "meal id"),
    requireIndex(dishIndex),
    choice,
  ].join(SEP);
}

export function shareMouthId(
  mealId: string,
  dishIndex: number,
  memberId: string,
): string {
  return [
    SHARE_KIND.mouth,
    requireId(mealId, "meal id"),
    requireIndex(dishIndex),
    requireId(memberId, "member id"),
  ].join(SEP);
}

export function shareBoxId(args: {
  mealId: string;
  dishIndex: number;
  memberId: string;
  outcome: ShareOutcome;
  day: string | null;
}): string {
  if (args.outcome === "shifted" && !args.day) {
    // La même règle que le CHECK de la table et que la porte SQL, ici aussi:
    // une charge `shifted` sans jour ne dit rien, et elle serait refusée à
    // l'écriture APRÈS avoir été montrée. Un bouton qu'on sait refusé ne
    // s'affiche pas — le refus loin du geste se lit comme un bouton mort.
    throw new Error("[keel/share_step] `shifted` without a day");
  }
  if (args.outcome !== "shifted" && args.day) {
    throw new Error(`[keel/share_step] \`${args.outcome}\` carries a day`);
  }
  return [
    SHARE_KIND.box,
    requireId(args.mealId, "meal id"),
    requireIndex(args.dishIndex),
    requireId(args.memberId, "member id"),
    args.outcome,
    args.day ?? NO_DAY,
  ].join(SEP);
}

// ---------------------------------------------------------------------------
// RELIRE UN TAP — déterministe, et il ne devine jamais
// ---------------------------------------------------------------------------

export type ShareReply =
  | { kind: "who"; mealId: string; dishIndex: number; choice: WhoChoice }
  | { kind: "mouth"; mealId: string; dishIndex: number; memberId: string }
  | {
    kind: "box";
    mealId: string;
    dishIndex: number;
    memberId: string;
    outcome: ShareOutcome;
    day: string | null;
  }
  | { kind: "none" };

const NONE: ShareReply = { kind: "none" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Interprète un `button_payload`. Rend `{kind:"none"}` sur tout ce qui n'est
 * pas EXACTEMENT une charge de cette famille — jamais une supposition.
 *
 * ⚠️ L'ARITÉ EST VÉRIFIÉE, PAS DEVINÉE. Une charge tronquée se relisait, dans
 * la bande, comme « le plat n° 0 » — parce que `Number("")` vaut 0 et que
 * `Number.isInteger(0)` vaut `true`. On compte donc les segments et on refuse
 * un segment vide, plutôt que de laisser une conversion décider.
 */
export function readShareReply(payload: string | null | undefined): ShareReply {
  const raw = String(payload ?? "").trim();
  if (!raw.startsWith(SHARE_BUTTON_PREFIX)) return NONE;
  const parts = raw.split(SEP);
  const kind = parts[0];

  const index = (token: string | undefined): number | null => {
    if (!token || !/^\d+$/.test(token)) return null;
    const n = Number(token);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  if (kind === SHARE_KIND.who) {
    if (parts.length !== 4) return NONE;
    const dishIndex = index(parts[2]);
    const mealId = String(parts[1] ?? "");
    const choice = String(parts[3] ?? "");
    if (!mealId || dishIndex === null) return NONE;
    if (!(WHO_CHOICES as readonly string[]).includes(choice)) return NONE;
    return { kind: "who", mealId, dishIndex, choice: choice as WhoChoice };
  }

  if (kind === SHARE_KIND.mouth) {
    if (parts.length !== 4) return NONE;
    const dishIndex = index(parts[2]);
    const mealId = String(parts[1] ?? "");
    const memberId = String(parts[3] ?? "");
    if (!mealId || dishIndex === null || !memberId) return NONE;
    return { kind: "mouth", mealId, dishIndex, memberId };
  }

  if (kind === SHARE_KIND.box) {
    if (parts.length !== 6) return NONE;
    const dishIndex = index(parts[2]);
    const mealId = String(parts[1] ?? "");
    const memberId = String(parts[3] ?? "");
    const outcome = String(parts[4] ?? "");
    const dayToken = String(parts[5] ?? "");
    if (!mealId || dishIndex === null || !memberId) return NONE;
    if (!isShareOutcome(outcome)) return NONE;
    const day = dayToken === NO_DAY ? null : dayToken;
    if (day !== null && !DAY_RE.test(day)) return NONE;
    // LES DEUX SENS DU CHECK DE LA TABLE, RELUS ICI. Une charge forgée qui les
    // enfreint est refusée AVANT toute écriture, avec le même vocabulaire que
    // la base — sans quoi la porte SQL rendrait une erreur brute que l'appelant
    // afficherait comme une panne au lieu d'un refus.
    if (outcome === "shifted" && day === null) return NONE;
    if (outcome !== "shifted" && day !== null) return NONE;
    return {
      kind: "box",
      mealId,
      dishIndex,
      memberId,
      outcome: outcome as ShareOutcome,
      day,
    };
  }

  return NONE;
}

// ---------------------------------------------------------------------------
// LES MOTS — deux langues, tables fermées, et la ceinture les juge
// ---------------------------------------------------------------------------

interface ShareCopy {
  /** Le CONSTAT qui ouvre l'étape « qui ». Jamais une question. */
  whoLead: string;
  whoMe: string;
  whoAll: string;
  whoPick: string;
  /** Le constat qui ouvre la liste des bouches sans compte. */
  pickLead: string;
  /** Le constat qui ouvre le sort d'une boîte. `{jour}` est le jour du plat. */
  boxLead: (day: string) => string;
  /** La même chose, pour la boîte de quelqu'un d'autre. */
  boxLeadFor: (name: string, day: string) => string;
  boxKeep: (day: string) => string;
  boxFreeze: string;
  boxDiscard: string;
  /** Ce que la vue de la part rend quand la boîte attend encore. */
  stillWaiting: (day: string) => string;
  ackNoted: string;
  ackStale: string;
}

const COPY: Readonly<Record<StripLanguage, ShareCopy>> = {
  en: {
    whoLead: "That share was not eaten.",
    whoMe: "Mine",
    whoAll: "The whole household",
    whoPick: "Choose…",
    pickLead: "The shares that were left.",
    boxLead: (day) => `Your box from ${day}.`,
    boxLeadFor: (name, day) => `${name}'s box from ${day}.`,
    boxKeep: (day) => `Keep it for ${day}`,
    boxFreeze: "Into the freezer",
    boxDiscard: "Thrown out",
    stillWaiting: (day) => `Box from ${day}, still in the fridge`,
    ackNoted: "Noted.",
    ackStale: "That one is out of date now — nothing was saved.",
  },
  fr: {
    whoLead: "Cette part n'a pas été mangée.",
    whoMe: "La mienne",
    whoAll: "Tout le foyer",
    whoPick: "Choisir…",
    pickLead: "Les parts qui sont restées.",
    boxLead: (day) => `Ta boîte de ${day}.`,
    boxLeadFor: (name, day) => `La boîte de ${name}, de ${day}.`,
    boxKeep: (day) => `La garder pour ${day}`,
    boxFreeze: "Au congélateur",
    boxDiscard: "Jetée",
    stillWaiting: (day) => `Boîte de ${day}, encore au frigo`,
    ackNoted: "C'est noté.",
    ackStale: "Celle-là n'est plus d'actualité — rien n'a été enregistré.",
  },
};

/**
 * Un prénom, ramené à ce qui se lit dans une bulle.
 *
 * Même règle que `cleanTitle` de la bande, et pour la même raison: un prénom
 * est de la DONNÉE (quelqu'un l'a tapé dans le formulaire du foyer), pas une
 * formulation que nous écrivons. Un « ? » dedans ferait pourtant LIRE l'étape
 * comme une question — on le retire du prénom plutôt que de perdre l'étape.
 */
function cleanName(raw: unknown): string {
  return String(raw ?? "").replace(/[?？]/g, "").replace(/\s+/g, " ").trim();
}

export interface ShareStep {
  body: string;
  buttons: ShareButton[];
}

/**
 * Le garde-fou commun: rien ne sort d'ici sans avoir été jugé.
 *
 * ⚠️ LE TEXTE JUGÉ EST CELUI QUE **NOUS** ÉCRIVONS. Un prénom ou un titre de
 * plat n'est pas une formulation de notre part, et le laisser faire disparaître
 * une étape transformerait une donnée bizarre en panne silencieuse — c'est le
 * partage exact que `buildEveningStrip` fait entre `authored` et la liste.
 */
function guarded(step: ShareStep, authored: readonly string[]): ShareStep | null {
  const verdict = acceptStripText(authored.filter(Boolean).join("\n"), false);
  if (verdict.ok) return step;
  console.warn(JSON.stringify({
    tag: "keel.share_step.text_refused",
    reason: verdict.reason,
    detail: verdict.detail,
  }));
  return null;
}

// ---------------------------------------------------------------------------
// ① L'ÉTAPE « QUI N'A PAS MANGÉ ? » — chez le MAÎTRE, et seulement lui
// ---------------------------------------------------------------------------

/**
 * L'étape « qui », ou `null` quand elle n'a pas lieu d'être.
 *
 * ⛔ `null` DANS TROIS CAS, ET LES TROIS SONT DES DÉCISIONS:
 *   · l'appelant n'est pas le maître (`step.asked === false`) — un profil
 *     réclamé n'a qu'une bouche à décrire, et lui demander « qui ? » lui
 *     offrirait une réponse qu'il n'a pas le droit de donner (R11);
 *   · le foyer n'a AUCUNE bouche sans compte — `[Choisir…]` n'aurait rien à
 *     choisir, et `[Moi]` / `[Tout le foyer]` seuls ne sont pas « qui n'a pas
 *     mangé », ce sont deux boutons qui n'apprennent rien de plus que le ✗ qui
 *     vient d'être tapé. La bande retombe alors sur le formulaire accident,
 *     c'est-à-dire sur son comportement d'avant ce lot;
 *   · le texte ne passe pas la ceinture — fail-closed du côté du silence.
 *
 * ⚠️ `step` VIENT DE `whoDidNotEatOptions`, ET N'EST PAS RECALCULÉ ICI. La
 * règle « les cases sont les bouches SANS COMPTE » vit à UN endroit, éprouvée,
 * et ce module ne fait que l'habiller. Refiltrer ici ferait deux gardes d'écran
 * pour une seule règle, et c'est celle qu'on ne relit pas qui gagnerait.
 */
export function buildWhoStep(args: {
  mealId: string;
  dishIndex: number;
  /** La sortie de `whoDidNotEatOptions`. */
  step: { asked: boolean; choosable: readonly AccountlessMouth[] };
  language: StripLanguage;
}): ShareStep | null {
  if (!args.step.asked) return null;
  if (args.step.choosable.length === 0) return null;
  const copy = COPY[args.language];
  const buttons: ShareButton[] = [
    {
      id: shareWhoId(args.mealId, args.dishIndex, "me"),
      title: copy.whoMe,
    },
    {
      id: shareWhoId(args.mealId, args.dishIndex, "all"),
      title: copy.whoAll,
    },
    {
      id: shareWhoId(args.mealId, args.dishIndex, "pick"),
      title: copy.whoPick,
    },
  ];
  return guarded(
    { body: copy.whoLead, buttons },
    [copy.whoLead, ...buttons.map((b) => b.title)],
  );
}

/**
 * `[Choisir…]` — LES BOUCHES SANS COMPTE, UNE PAR BOUTON.
 *
 * ⚠️ UN BOUTON PAR BOUCHE, ET PAS UNE CASE À COCHER. Une conversation n'a pas
 * de formulaire: le geste qui existe est le tap. Chaque tap désigne UNE bouche
 * et ouvre le sort de SA boîte — c'est plus long que trois cases, et c'est le
 * prix de ne pas inventer une surface qui n'existe pas dans ce canal.
 *
 * ⛔ LA LISTE N'EST PAS REFILTRÉE ICI. Elle arrive de `whoDidNotEatOptions`,
 * qui a déjà retiré toute bouche portant un compte (R11). Un second filtre
 * écrit à côté serait la deuxième définition d'une règle de sécurité.
 */
export function buildMouthPickStep(args: {
  mealId: string;
  dishIndex: number;
  mouths: readonly AccountlessMouth[];
  language: StripLanguage;
}): ShareStep | null {
  if (args.mouths.length === 0) return null;
  const copy = COPY[args.language];
  const buttons: ShareButton[] = [];
  for (const mouth of args.mouths) {
    const name = cleanName(mouth.firstName);
    if (!mouth.memberId) continue;
    buttons.push({
      id: shareMouthId(args.mealId, args.dishIndex, mouth.memberId),
      // Une bouche sans prénom lisible garde son bouton: la faire disparaître
      // rendrait sa boîte impossible à ranger. On la nomme par le mot le plus
      // plat qui existe plutôt que d'inventer un nom.
      title: name || copy.whoMe,
    });
  }
  if (buttons.length === 0) return null;
  return guarded({ body: copy.pickLead, buttons }, [copy.pickLead]);
}

// ---------------------------------------------------------------------------
// ② LE SORT D'UNE BOÎTE — la même étape pour soi et pour une bouche sans compte
// ---------------------------------------------------------------------------

/**
 * « Ta boîte de {jour} » et ses sorties.
 *
 * ⚠️ `options` VIENT DE `boxOptionsFor`, ET N'EST NI COMPLÉTÉ NI TRIÉ ICI. La
 * fenêtre frigo, la borne du jour écoulé et la condition du congélateur sont
 * DÉJÀ décidées, avec leurs épreuves. Ce module rend ce qu'on lui donne — et
 * si la liste est vide, il n'y a pas d'étape: proposer un espace vide serait
 * un bouton mort, et un bouton mort se lit comme une panne.
 *
 * @param mouthName `null` quand c'est SA propre boîte. Un nom quand le maître
 *   range celle d'une bouche sans compte — sans le nom, il rangerait une boîte
 *   sans savoir laquelle, et deux enfants ont deux boîtes.
 */
export function buildBoxStep(args: {
  mealId: string;
  dishIndex: number;
  memberId: string;
  /** La date du PLAT, pas celle du tap: c'est le jour de la boîte. */
  dishDate: string;
  options: readonly BoxOption[];
  mouthName: string | null;
  language: StripLanguage;
}): ShareStep | null {
  if (args.options.length === 0) return null;
  const copy = COPY[args.language];
  const name = cleanName(args.mouthName);
  const dishDay = dayName(args.language, args.dishDate);
  const body = name
    ? copy.boxLeadFor(name, dishDay)
    : copy.boxLead(dishDay);

  const buttons: ShareButton[] = [];
  const authored: string[] = [name ? "" : copy.boxLead(dishDay)];
  for (const option of args.options) {
    if (option.outcome === "not_eaten") continue;
    const title = option.outcome === "shifted"
      ? copy.boxKeep(dayName(args.language, option.day ?? ""))
      : option.outcome === "frozen"
      ? copy.boxFreeze
      : copy.boxDiscard;
    buttons.push({
      id: shareBoxId({
        mealId: args.mealId,
        dishIndex: args.dishIndex,
        memberId: args.memberId,
        outcome: option.outcome,
        day: option.day,
      }),
      title,
    });
    authored.push(title);
  }
  if (buttons.length === 0) return null;
  return guarded({ body, buttons }, authored);
}

// ---------------------------------------------------------------------------
// ③ LES ACCUSÉS — sans verdict, sans chiffre (R4)
// ---------------------------------------------------------------------------

export type ShareAck = "noted" | "stale";

/**
 * L'accusé d'un tap de cette famille.
 *
 * ⚠️ LA CEINTURE EST APPLIQUÉE ICI, pas seulement testée, et avec
 * `banNumbers: true`: un accusé qui compte est un score qui commence. Même
 * règle et même repli que `renderStripAck`.
 */
export function renderShareAck(kind: ShareAck, language: StripLanguage): string {
  const copy = COPY[language];
  const text = kind === "noted" ? copy.ackNoted : copy.ackStale;
  const verdict = acceptStripText(text, true);
  if (verdict.ok) return text;
  console.warn(JSON.stringify({
    tag: "keel.share_step.ack_refused",
    kind,
    language,
    reason: verdict.reason,
    detail: verdict.detail,
  }));
  return language === "fr" ? "C'est noté." : "Noted.";
}

/**
 * « Boîte de {jour}, encore au frigo » — LA PHRASE QUE LA VUE DE LA PART REND.
 *
 * ⚠️ ELLE NE DÉCIDE RIEN. C'est `boxStillWaiting` qui dit si la boîte attend
 * encore (et qui refuse de le dire d'un `not_eaten` sans suite, ou d'un jour
 * dépassé); cette fonction-ci ne fait que l'écrire. L'appelant qui la
 * rendrait sans passer par la décision annoncerait une boîte qui n'existe plus
 * — le mensonge exact que FF-057 existe pour corriger.
 */
export function renderStillWaiting(
  dishDate: string,
  language: StripLanguage,
): string {
  return COPY[language].stillWaiting(dayName(language, dishDate));
}
