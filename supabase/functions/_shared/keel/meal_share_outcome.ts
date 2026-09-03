/**
 * A8.2 — LE SORT D'UNE PART NON MANGÉE. Le modèle PUR.
 *
 * Autorité: ANALYSE du 2026-09-03 §8.2 (tableau des cas), D8.2 · D8.3 · D8.4 ·
 * D8.5. Table: `meal_share_outcomes` (migration 20260903172000).
 *
 * Séparé de l'I/O pour la même raison que partout ailleurs dans `_shared/keel/`:
 * la décision est pure et testable, la lecture ne l'est pas. Aucune I/O, aucune
 * horloge, aucun aléa, aucun appel modèle.
 *
 * ── LES DEUX QUESTIONS QUE CE MODULE RÉPOND ───────────────────────────────
 *
 *   1. **Qu'est-ce qu'on propose ?** Un ✗ du MEMBRE ouvre le sort de SA boîte
 *      — la garder pour un jour, la congeler, la jeter. Un ✗ du MAÎTRE ouvre
 *      d'abord « qui n'a pas mangé ? », parce que la casserole entière et une
 *      seule assiette ne se réparent pas pareil.
 *
 *   2. **Qui a raison quand deux personnes ont parlé ?** D8.3: la ligne
 *      déclarée par LA PERSONNE gagne sur celle du maître. Pas par
 *      ancienneté, pas par ordre d'écriture: par AUTORITÉ.
 *
 * ── ⛔ CE QU'IL NE FAIT JAMAIS ────────────────────────────────────────────
 *   · Aucun glissement de plan (D8.4). Un membre déclare; le plan du foyer ne
 *     bouge que par le maître, et alors c'est `shift_dish`, qui existe déjà.
 *   · Aucune déclaration implicite (D8.2). Le silence ne produit AUCUNE ligne;
 *     c'est le lecteur qui comptera « mangé, base `assumed` ». Écrire une
 *     coche que personne n'a posée est la cicatrice
 *     `auto-tick-writes-undeniable-false-facts`, et elle est indélébile.
 *   · Aucune lecture de titre, aucun matcher: on ne manipule que des index et
 *     des identifiants de bouche.
 */

import { addDays } from "./local_date.ts";
import { MAX_FRIDGE_DAYS } from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE — fermé, et le même qu'en base
// ---------------------------------------------------------------------------

/**
 * ⚠️ CETTE LISTE EST LE JUMEAU DU CHECK DE LA TABLE. Les deux se vérifient
 * l'une l'autre (`meal_share_outcome_test.ts` lit la migration): un vocabulaire
 * qui diverge s'écrit en base avant que quiconque le voie, et c'est la même
 * discipline que `MEAL_UNTICK_REASONS`.
 */
export const SHARE_OUTCOMES = [
  /** Elle n'a pas été mangée, et on n'a pas dit ce qu'elle devient. */
  "not_eaten",
  /** Gardée pour un jour nommé — DANS la fenêtre frigo, jamais au-delà. */
  "shifted",
  /** Au congélateur. Seulement si le foyer en a DÉCLARÉ un. */
  "frozen",
  /** Jetée. C'est une fin, et elle doit être offerte: sans elle on force à mentir. */
  "discarded",
] as const;
export type ShareOutcome = (typeof SHARE_OUTCOMES)[number];

export function isShareOutcome(value: unknown): value is ShareOutcome {
  return (SHARE_OUTCOMES as readonly string[]).includes(String(value ?? ""));
}

// ---------------------------------------------------------------------------
// 1. CE QU'ON PROPOSE AU MEMBRE — le sort de SA boîte
// ---------------------------------------------------------------------------

export interface BoxOption {
  outcome: ShareOutcome;
  /** Le jour visé, pour `shifted` seulement. `null` partout ailleurs. */
  day: string | null;
}

/**
 * LE SORT D'UNE BOÎTE — l'espace d'action, fermé et dérivé de l'état RÉEL.
 *
 * ── LA FENÊTRE FRIGO EST LA MÊME QU'AILLEURS ──────────────────────────────
 * `MAX_FRIDGE_DAYS` (3), importée et jamais recopiée: deux définitions d'une
 * même règle physique divergent, et celle-ci décide si on propose de manger
 * quelque chose. Les jours proposés sont ceux qui SUIVENT le jour du plat et
 * qui restent dans la fenêtre — jamais un jour ÉCOULÉ, et jamais le jour même
 * (la boîte est déjà là, la garder pour aujourd'hui ne veut rien dire).
 *
 * ── LE CONGÉLATEUR NE S'INVENTE PAS ───────────────────────────────────────
 * `hasFreezer` doit venir de `hasFreezerDeclared` — une déclaration POSITIVE.
 * « Il n'en a pas » et « on ne lui a jamais demandé » rendent tous deux `false`,
 * et c'est la seule direction acceptable: proposer de congeler à quelqu'un qui
 * n'a pas de congélateur, c'est proposer de laisser une part sur le plan de
 * travail.
 *
 * ── « JETÉE » EST TOUJOURS LÀ, ET C'EST UNE RÈGLE ─────────────────────────
 * Une liste qui n'offre que des fins heureuses force à mentir ou à ne rien
 * répondre — et « ne rien répondre » n'écrit rien (D8.2), donc on perd le fait.
 * Même raison que « ne rien faire » dans `REALIGNMENT_ACTIONS`: c'est une
 * BONNE FIN, pas un échec.
 */
export function boxOptionsFor(input: {
  /** La date du plat, résolue. */
  dishDate: string;
  /** Le jour LOCAL de la personne. Un jour écoulé ne se propose pas. */
  today: string;
  /** `hasFreezerDeclared(equipment)` — jamais `!== false`. */
  hasFreezer: boolean;
  /** Pour l'éprouver sans dépendre de la constante: elle vaut MAX_FRIDGE_DAYS. */
  maxFridgeDays?: number;
}): BoxOption[] {
  const window = Math.max(0, input.maxFridgeDays ?? MAX_FRIDGE_DAYS);
  const out: BoxOption[] = [];
  for (let d = 1; d <= window; d++) {
    const day = addDays(input.dishDate, d);
    // ⚠️ LA BORNE DU JOUR, ET PAS SEULEMENT CELLE DE LA FENÊTRE. On peut
    // ranger la boîte d'hier ce matin: la fenêtre part du PLAT, mais un jour
    // déjà passé ne se propose pas — ce serait une consigne pour hier.
    if (day < input.today) continue;
    out.push({ outcome: "shifted", day });
  }
  if (input.hasFreezer) out.push({ outcome: "frozen", day: null });
  out.push({ outcome: "discarded", day: null });
  return out;
}

// ---------------------------------------------------------------------------
// 2. CE QU'ON PROPOSE AU MAÎTRE — « qui n'a pas mangé ? »
// ---------------------------------------------------------------------------

export type WhoDidNotEat =
  /** Moi seul: c'est MA part qui est restée, la casserole a servi. */
  | { kind: "me" }
  /**
   * Tout le foyer: la casserole entière est restée ⇒ `shift_dish`, l'action
   * existante, plan-wide et LÉGITIME parce que c'est le maître qui la demande.
   */
  | { kind: "whole_household" }
  /**
   * Certaines bouches, nommées. ⛔ SANS COMPTE UNIQUEMENT — voir
   * `whoDidNotEatOptions`.
   */
  | { kind: "some_mouths"; memberIds: readonly string[] };

export interface AccountlessMouth {
  memberId: string;
  firstName: string;
}

export interface WhoStep {
  /** `true` quand l'étape a lieu d'être posée. */
  asked: boolean;
  /**
   * Les bouches cochables. ⛔ **SANS COMPTE UNIQUEMENT**, et vide quand il n'y
   * en a pas — auquel cas `[choisir…]` n'a rien à choisir.
   */
  choosable: readonly AccountlessMouth[];
}

/**
 * L'ÉTAPE « QUI N'A PAS MANGÉ ? », ET QUI PEUT Y FIGURER.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LES CASES SONT LES BOUCHES **SANS COMPTE**, ET RIEN D'AUTRE.
 *
 * Une bouche qui a un compte parle pour elle-même: elle reçoit sa propre bande
 * du soir depuis A8.0, et elle a ses propres cases depuis A8.1. Lui cocher
 * « elle n'a pas mangé » serait le maître déclarant à sa place — l'interdit de
 * FF-058 R11, et la surveillance que R12 a retirée du produit. La porte SQL le
 * refuse déjà (`not_your_line`); cette liste est la garde d'écran, et les deux
 * disent la même chose pour que le refus ne soit jamais une surprise à
 * l'écran.
 *
 * D8.5 autorise l'inverse pour une bouche SANS compte: ce n'est pas surveiller
 * un adulte, c'est ranger un contenant. R12 tient — on ne compte AUCUNE
 * consommation pour un enfant.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ L'ÉTAPE NE SE POSE PAS À UN MEMBRE. Un profil réclamé n'a qu'une bouche à
 * décrire — la sienne — et lui demander « qui ? » lui offrirait une réponse
 * qu'il n'a pas le droit de donner.
 */
export function whoDidNotEatOptions(input: {
  /** L'appelant est-il le maître du foyer ? REQUIS: `false` ferme l'étape. */
  isOwner: boolean;
  /** TOUTES les bouches du foyer, avec ou sans compte. */
  mouths: ReadonlyArray<{
    memberId: string;
    firstName: string;
    /** `null` = SANS COMPTE. C'est ce qui rend une bouche cochable. */
    userId: string | null;
  }>;
}): WhoStep {
  if (!input.isOwner) return { asked: false, choosable: [] };
  const choosable = input.mouths
    .filter((m) => m.userId === null && String(m.memberId ?? "").trim())
    .map((m) => ({ memberId: m.memberId, firstName: m.firstName }));
  return { asked: true, choosable };
}

// ---------------------------------------------------------------------------
// 3. QUI A RAISON — D8.3, la ligne de la personne gagne
// ---------------------------------------------------------------------------

export interface ShareOutcomeRow {
  /**
   * ⟳ 2026-09-03 (A8.3, défaut D6) — LA BOÎTE EST IDENTIFIÉE PAR LE PLAT, PAS
   * PAR LA BOUCHE.
   *
   * Ces deux champs manquaient, et leur absence était un défaut de CONCEPTION,
   * pas d'écriture: la table porte UNE LIGNE PAR BOÎTE
   * (`generated_meal_id, dish_index, member_id, declared_by`), et la résolution
   * regroupait sur `memberId` SEUL. Deux boîtes d'une même personne — celle de
   * mardi et celle de jeudi — s'effondraient donc en une, et la dernière lue
   * effaçait l'autre. La vue de la part ne pouvait structurellement pas rendre
   * « boîte de mardi » et « boîte de jeudi » côte à côte, ce qui est
   * exactement ce que le lecteur du reste doit faire.
   */
  generatedMealId: string;
  /** La position dans le `dishes[]` STOCKÉ. La même clé que la coche. */
  dishIndex: number;
  memberId: string;
  /** Le compte qui a déclaré. */
  declaredBy: string;
  outcome: ShareOutcome;
  shiftedToDay: string | null;
  answeredLocalDate: string;
}

export interface ResolvedShare {
  /** Voir `ShareOutcomeRow`: une boîte est identifiée par SON plat. */
  generatedMealId: string;
  dishIndex: number;
  memberId: string;
  outcome: ShareOutcome;
  shiftedToDay: string | null;
  /**
   * QUI fait autorité sur cette ligne. `self` = la personne concernée l'a dit
   * elle-même; `owner` = le maître l'a dit pour une bouche sans compte.
   *
   * ⚠️ RENDU, ET PAS SEULEMENT UTILISÉ POUR TRANCHER. Un écran qui affiche
   * « boîte au congélateur » sans savoir qui l'a dit ne peut pas expliquer une
   * contradiction à celui qui la voit.
   */
  authority: "self" | "owner";
}

/**
 * D8.3 — LA LIGNE DÉCLARÉE PAR LA PERSONNE GAGNE.
 *
 * ⚠️ PAS « LA PLUS RÉCENTE », ET C'EST TOUT L'ARBITRAGE. Trancher par date
 * ferait gagner celui qui tape en dernier, c'est-à-dire donnerait au maître le
 * pouvoir d'écraser la déclaration d'un adulte en rouvrant l'app le soir. Ce
 * qui départage est l'AUTORITÉ: on parle de sa propre part.
 *
 * ⚠️ ET ELLE NE « CORRIGE » RIEN. La ligne du maître reste en base, intacte:
 * ce module CHOISIT laquelle lire, il n'en efface aucune. Corriger la ligne du
 * maître est un interdit explicite du lot — une déclaration est un fait, et un
 * fait ne se réécrit pas parce qu'un autre fait le contredit.
 *
 * `mouthOwner` donne, pour chaque bouche, le compte qui la porte (`null` =
 * bouche sans compte). Sans lui on ne saurait pas laquelle des deux lignes est
 * « la sienne » — et deviner par `declaredBy === memberId` serait faux: ce sont
 * deux espaces d'identifiants différents (un compte, une bouche).
 */
export function resolveShareOutcomes(input: {
  rows: readonly ShareOutcomeRow[];
  mouthOwner: Readonly<Record<string, string | null>>;
}): ResolvedShare[] {
  // ⚠️ LA CLÉ DE REGROUPEMENT EST CELLE DE LA TABLE, MOINS `declared_by`.
  //
  // `declared_by` est justement la colonne sur laquelle on ARBITRE: la retirer
  // de la clé de regroupement est ce qui fait se rencontrer les deux
  // déclarations. Les TROIS autres restent — regrouper sur `memberId` seul
  // effondrait la boîte de mardi et celle de jeudi l'une dans l'autre (défaut
  // D6, mesuré le 2026-09-03).
  const keyOf = (row: { generatedMealId: string; dishIndex: number; memberId: string }) =>
    `${row.generatedMealId}\u0000${row.dishIndex}\u0000${row.memberId}`;

  const byBox = new Map<string, ResolvedShare>();
  for (const row of input.rows) {
    const owner = input.mouthOwner[row.memberId] ?? null;
    const authority: "self" | "owner" = owner !== null && owner === row.declaredBy
      ? "self"
      : "owner";
    const key = keyOf(row);
    const current = byBox.get(key);
    // `self` bat `owner`. Deux lignes de même autorité ne peuvent pas exister
    // sur la même boîte: la clé porte `declared_by`, et un maître est unique.
    if (current && current.authority === "self") continue;
    if (current && authority !== "self") continue;
    byBox.set(key, {
      generatedMealId: row.generatedMealId,
      dishIndex: row.dishIndex,
      memberId: row.memberId,
      outcome: row.outcome,
      shiftedToDay: row.shiftedToDay,
      authority,
    });
  }
  // Ordre STABLE, celui de la première apparition: un rendu qui changerait
  // d'ordre entre deux lectures ferait clignoter la liste des boîtes.
  const seen: ResolvedShare[] = [];
  const done = new Set<string>();
  for (const row of input.rows) {
    const key = keyOf(row);
    if (done.has(key)) continue;
    const resolved = byBox.get(key);
    if (!resolved) continue;
    done.add(key);
    seen.push(resolved);
  }
  return seen;
}

/**
 * LA BOÎTE EST-ELLE ENCORE LÀ ? — ce que la vue de la part rend.
 *
 * ⚠️ « ENCORE AU FRIGO » A UNE FIN. Une boîte reportée à un jour DÉPASSÉ n'est
 * plus une boîte: c'est une part perdue, et l'annoncer « encore au frigo »
 * serait exactement le mensonge que FF-057 existe pour corriger — le plan qui
 * annonce un plat que personne n'a. `not_eaten` sans suite ne s'affiche pas non
 * plus: on ne sait pas ce qu'elle est devenue, et « on ne sait pas » n'est pas
 * « elle t'attend ».
 */
export function boxStillWaiting(
  share: ResolvedShare,
  today: string,
): boolean {
  if (share.outcome === "frozen") return true;
  if (share.outcome !== "shifted") return false;
  return share.shiftedToDay !== null && share.shiftedToDay >= today;
}
