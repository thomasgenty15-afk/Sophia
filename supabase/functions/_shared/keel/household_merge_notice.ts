/**
 * LA PROPOSITION, L'AVERTISSEMENT, ET CE QUI TIENT UNE FUSION EN PLACE. PUR.
 *
 * Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md,
 * arbitrages D8 (la validation APRÈS la fusion et ses trois sorties), D10 (la
 * fusion est manuelle, sur proposition) et D17 (le réglage discret). Lot L5.
 *
 * ── CE MODULE NE FUSIONNE RIEN, ET C'EST SA RAISON D'ÊTRE ────────────────
 * Il ne lit aucune base, n'appelle aucun modèle, n'écrit pas une ligne. Il
 * répond à trois questions, toutes décidables sur des dates:
 *
 *   1. D10 — DE QUI PEUT-ON PROPOSER LA FUSION, et sur combien de jours.
 *   2. D8  — QUI A VALIDÉ UN PLAN **APRÈS** QU'ON L'A FUSIONNÉ. C'est une
 *            comparaison de deux `validated_at`: celle que L4 a archivée dans
 *            `merged_from`, et celle que porte son plan vivant aujourd'hui.
 *   3. LA FUSION EST-ELLE COLLANTE — qui une composition ordinaire doit
 *      RE-REPRENDRE, parce que le maître a déjà dit oui et que rien n'a changé
 *      depuis.
 *
 * ── LE TROU QUE CE MODULE BOUCHE, NOMMÉMENT (L4, « ce qui reste ouvert » n°2)
 * Recomposer la même fenêtre en `compose` RÉ-EXCLUAIT la personne qu'on venait
 * de reprendre: son plan personnel couvre toujours la fenêtre, donc L3 la
 * retire, et le maître perdait sa fusion sans l'avoir demandé. La réparation
 * n'est pas un état stocké « untel est fusionné » — ce serait un écrivain de
 * plus à ne jamais oublier — mais la RELECTURE de `merged_from` sur le plan
 * VIVANT, qui est déjà écrit, déjà daté, et déjà la source de l'avertissement.
 * Une seule donnée porte les deux mécanismes, donc ils ne peuvent pas diverger.
 *
 * ── POURQUOI PAS DE SECONDE ARITHMÉTIQUE DE FENÊTRE ──────────────────────
 * La proposition ANNONCE ce que la fusion FERA (« son plan couvre 5 jours, dont
 * 2 déjà passés — je peux fusionner les 3 restants », D16 mot pour mot). Elle
 * passe donc par `bestMergePair`, la même fonction que `resolveMergeRequest`
 * dans le générateur. Un second calcul aurait promis des jours que la fusion ne
 * prend pas — et personne ne l'aurait vu, parce que les deux nombres sont
 * plausibles.
 */

import {
  bestMergePair,
  type MergedFromEntry,
  mergedFromEntry,
  type MergeWindow,
  type MergeWindowRefusal,
  type PlanSpan,
  resolveTailWindow,
} from "./household_merge.ts";
// L7/D11 — LE MOT DU REFUS, IMPORTÉ ET PAS RECOPIÉ. Le `skipped` du lecteur et
// le 429 du générateur décrivent le même fait; deux orthographes en feraient
// deux faits pour qui lit des journaux.
import {
  MERGE_QUOTA_EXHAUSTED,
  type MergeQuotaState,
} from "./household_merge_quota.ts";

// ---------------------------------------------------------------------------
// 1. RELIRE `merged_from` SUR UN PLAN DÉJÀ ÉCRIT
//
// La provenance vit dans `generated_from`, qui est du `jsonb` libre: on la lit
// avec la même tolérance que `parseOwnPlans` et `parseAwayDays` — une entrée
// illisible tombe, les autres restent, et rien n'est deviné. L'échec est OUVERT
// dans le sens sûr: sans provenance lisible, personne n'est re-repris, donc le
// repli de L3 s'applique — la personne mange son plan. Une lecture ratée coûte
// une fusion à refaire d'un clic, jamais une assiette manquante.
// ---------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Les entrées `merged_from` d'un plan du foyer, telles que L4 les écrit.
 *
 * Chemin: `generated_from.household.merge.merged_from`. Il est écrit ICI en un
 * seul endroit — trois `?.` recopiés sur un écran et sur un serveur finissent
 * par pointer deux profondeurs différentes le jour où la forme bouge.
 */
export function readMergedFrom(generatedFrom: unknown): MergedFromEntry[] {
  const household = asRecord(asRecord(generatedFrom)?.household);
  const merge = asRecord(household?.merge);
  const raw = merge?.merged_from;
  if (!Array.isArray(raw)) return [];
  const out: MergedFromEntry[] = [];
  for (const entry of raw) {
    const e = asRecord(entry);
    if (!e) continue;
    const memberId = String(e.member_id ?? "").trim();
    const planId = String(e.plan_id ?? "").trim();
    if (!memberId || !planId) continue;
    const startsOn = String(e.plan_starts_on ?? "").trim();
    const duration = Number(e.plan_duration_days);
    out.push({
      member_id: memberId,
      user_id: e.user_id == null ? null : String(e.user_id).trim() || null,
      plan_id: planId,
      plan_starts_on: DATE.test(startsOn) ? startsOn : "",
      plan_duration_days: Number.isFinite(duration) && duration >= 1
        ? Math.round(duration)
        : 0,
      validated_at: e.validated_at == null
        ? null
        : String(e.validated_at).trim() || null,
      days: Array.isArray(e.days)
        ? e.days.map((d) => String(d)).filter((d) => DATE.test(d))
        : [],
    });
  }
  return out;
}

/** Le plan du foyer dans lequel on a repris cette personne, si l'archive le nomme. */
export function readMergedIntoPlanId(generatedFrom: unknown): string | null {
  const merge = asRecord(asRecord(asRecord(generatedFrom)?.household)?.merge);
  const id = String(merge?.into_plan_id ?? "").trim();
  return id || null;
}

// ---------------------------------------------------------------------------
// 1bis. LE PLAN DU FOYER QUI PARLE POUR UNE BOUCHE — LE SEUL ENDROIT QUI CHOISIT
//
// ⚠️ AJOUTÉ LE 2026-08-12 APRÈS TROIS DÉFAUTS MESURÉS EN HTTP, ET C'EST LE MÊME
// DÉFAUT TROIS FOIS. **Deux plans du foyer sont vivants en même temps par
// contrat** — le courant et le suivant, c'est ce que `prepare_next` produit, et
// rien ne retire un plan passé. Les deux peuvent porter la MÊME reprise, parce
// que `merged_from` est reporté d'un plan à l'autre. Trois endroits prenaient
// alors « le premier de la liste » (donc le PLUS ANCIEN, `loadLiveHouseholdPlans`
// triant `starts_on` croissant):
//
//   · la DÉFUSION recomposait le plan périmé, et rendait `unmerge_window_all_past`
//     alors que le lecteur, lui, offrait le bouton;
//   · le LECTEUR rendait au maître la `validated_at` du plan périmé;
//   · la composition ordinaire relisait la reprise du plan périmé.
//
// C'est exactement le piège que `bestMergePair` a fermé du côté de la
// PROPOSITION, et il était resté ouvert partout ailleurs. Ce module-ci est
// désormais le SEUL endroit qui choisit, et les trois appelants passent par lui:
// la proposition et le geste ne peuvent plus désigner deux lignes différentes.
//
// ── LE CRITÈRE: CELUI QU'ON MANGE MAINTENANT, PAS LE PLUS LONG ────────────
// Ce n'est PAS le critère de `bestMergePair` (« la fenêtre fusionnable la plus
// longue »), et c'est délibéré: les deux fonctions répondent à deux questions.
// Fusionner cherche le plus de jours à reprendre; défusionner — et re-reprendre
// — porte sur la table d'AUJOURD'HUI. Prendre « la queue la plus longue » ferait
// agir la défusion sur le plan de la semaine PROCHAINE dès qu'il est plus long
// que ce qu'il reste de la semaine en cours, c'est-à-dire dans le cas le plus
// courant du produit.
//
//   1. Un plan dont il reste des jours (D16) gagne toujours sur un plan
//      entièrement consommé: le second n'est plus recomposable, et le geste que
//      la proposition offre doit être un geste qui aboutit.
//   2. Entre deux plans vivants: celui dont la QUEUE commence le plus tôt —
//      c'est-à-dire celui qui couvre aujourd'hui, la contrainte d'exclusion
//      interdisant à deux plans vivants de se chevaucher.
//   3. Tous consommés: le plus récent, parce que c'est le plus informatif. La
//      défusion refusera, et elle refusera en le nommant.
// ---------------------------------------------------------------------------

/** Un plan du foyer vivant, tel que `loadLiveHouseholdPlans` le rend. */
export interface MergeCarrierPlan extends PlanSpan {
  id: string;
  /** `generated_from` brut. Non optionnel: un `?` ferait une garde désarmée. */
  generatedFrom: unknown;
}

/** Le plan du foyer dont on parle quand on parle de la reprise de cette bouche. */
export interface MergeCarrier<H extends MergeCarrierPlan> {
  plan: H;
  /** Son entrée `merged_from` — celle-là, jamais celle d'un autre plan vivant. */
  entry: MergedFromEntry;
  /** Ce qu'il reste de ce plan à partir d'aujourd'hui. `null` = tout est passé. */
  tail: MergeWindow | null;
  /** Pourquoi il n'y a pas de queue, quand `tail` est `null`. */
  tailRefusal: MergeWindowRefusal | null;
}

function betterCarrier<H extends MergeCarrierPlan>(
  a: MergeCarrier<H>,
  b: MergeCarrier<H>,
): boolean {
  const aLive = a.tail !== null;
  const bLive = b.tail !== null;
  if (aLive !== bLive) return aLive;
  if (a.tail !== null && b.tail !== null) {
    if (a.tail.window.startsOn !== b.tail.window.startsOn) {
      return a.tail.window.startsOn < b.tail.window.startsOn;
    }
  } else if (a.plan.startsOn !== b.plan.startsOn) {
    return a.plan.startsOn > b.plan.startsOn;
  }
  // DÉPARTAGE STABLE. Deux lectures de la même base doivent rendre la même
  // ligne, sinon la proposition et le geste divergent de nouveau — au hasard de
  // l'ordre des lignes, ce qui est la pire des divergences à reproduire.
  if (a.plan.startsOn !== b.plan.startsOn) return a.plan.startsOn < b.plan.startsOn;
  return a.plan.id < b.plan.id;
}

/**
 * POUR CHAQUE BOUCHE REPRISE, LE PLAN DU FOYER VIVANT QUI PORTE SA REPRISE.
 *
 * L'ordre de la carte est celui de la PREMIÈRE apparition, donc celui des plans
 * tels qu'ils arrivent — `merged_from` garde ainsi l'ordre d'archive que L4 lui
 * donne, et une trace ne change pas d'ordre entre deux lectures.
 */
export function mergeCarriers<H extends MergeCarrierPlan>(args: {
  householdPlans: readonly H[];
  /** Jour local du maître, `YYYY-MM-DD`. Voir `resolveMergeWindow`. */
  today: string;
}): Map<string, MergeCarrier<H>> {
  const out = new Map<string, MergeCarrier<H>>();
  for (const plan of args.householdPlans) {
    const resolved = resolveTailWindow({ plan, today: args.today });
    for (const entry of readMergedFrom(plan.generatedFrom)) {
      const candidate: MergeCarrier<H> = {
        plan,
        entry,
        tail: resolved.ok ? resolved : null,
        tailRefusal: resolved.ok ? null : resolved.refusal,
      };
      const kept = out.get(entry.member_id);
      if (!kept || betterCarrier(candidate, kept)) out.set(entry.member_id, candidate);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. D8 — LA COMPARAISON DES DEUX DATES DE VALIDATION
//
// ⚠️ C'EST LA RAISON POUR LAQUELLE L4 ARCHIVE `validated_at`, et pas seulement
// un id de plan. « Il vient d'en valider un nouveau » n'est pas décidable sur
// deux identifiants: c'est une comparaison de DATES. Un membre peut valider,
// faire retirer son plan, en écrire un autre — les ids changent sans rien dire
// de l'ordre des gestes.
//
// LES DATES SE COMPARENT PAR `Date.parse`, JAMAIS EN CHAÎNES. Un `timestamptz`
// rendu par PostgREST porte son décalage (`+00:00`), et deux formes du même
// instant (`Z` et `+00:00`) ne s'ordonnent pas lexicographiquement. Une
// comparaison de chaînes rendrait un verdict faux le jour où la forme change,
// et elle le rendrait en silence.
// ---------------------------------------------------------------------------

/** Un plan personnel VIVANT et VALIDÉ, tel que le roster le rend (`own_plans`). */
export interface MemberLivePlan {
  id: string;
  startsOn: string;
  durationDays: number;
  validatedAt: string | null;
}

/** La personne n'a rien validé depuis: la fusion tient. */
export const STANDING_HELD = "still_merged";
/** D8 — elle a revalidé LE PLAN FUSIONNÉ: le maître doit être averti. */
export const STANDING_REVALIDATED = "revalidated_after_merge";
/** D8 — le plan fusionné a disparu, et elle en a validé un autre DEPUIS. */
export const STANDING_MERGED_PLAN_REPLACED = "merged_plan_replaced";
/**
 * Le plan fusionné n'est plus vivant, et rien de plus récent n'a été validé.
 *
 * Voir le commentaire de `mergeStandings`: ce n'est PAS « elle a revalidé », et
 * les confondre fabriquait une alerte D8 fausse.
 */
export const STANDING_MERGED_PLAN_GONE = "merged_plan_no_longer_live";
/** Elle n'a plus AUCUN plan personnel vivant: il n'y a plus rien à tenir. */
export const STANDING_NO_LIVE_PLAN = "no_live_personal_plan";
/** L'archive ne porte pas de date lisible. Voir le commentaire de `mergeStandings`. */
export const STANDING_UNDATED = "merge_date_unreadable";

export type MergeStandingState =
  | typeof STANDING_HELD
  | typeof STANDING_REVALIDATED
  | typeof STANDING_MERGED_PLAN_REPLACED
  | typeof STANDING_MERGED_PLAN_GONE
  | typeof STANDING_NO_LIVE_PLAN
  | typeof STANDING_UNDATED;

export interface MergeStanding {
  memberId: string;
  /** Ce que la fusion avait repris. */
  mergedPlanId: string;
  mergedValidatedAt: string | null;
  /**
   * Le plan fusionné est-il TOUJOURS vivant sous cet id ?
   *
   * C'est la question que D8 posait mal: elle se posait sur « le plus récent de
   * ses plans », qui n'est pas forcément celui qu'on a fusionné.
   */
  mergedPlanStillLive: boolean;
  /** La validation que porte AUJOURD'HUI le plan fusionné. `null` s'il a disparu. */
  mergedPlanValidatedAtNow: string | null;
  /** Le plan personnel vivant le PLUS RÉCEMMENT validé, aujourd'hui. */
  latestPlanId: string | null;
  latestValidatedAt: string | null;
  state: MergeStandingState;
  /** D8 — il y a matière à avertir le maître. */
  warn: boolean;
  /**
   * Une composition ordinaire doit RE-REPRENDRE cette personne (D10: le maître
   * a déjà dit oui une fois, et rien n'a changé depuis).
   */
  hold: boolean;
}

function instant(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Le plan vivant validé le plus récemment. Les non datés ne concourent pas. */
export function latestValidated(
  plans: readonly MemberLivePlan[],
): MemberLivePlan | null {
  let best: MemberLivePlan | null = null;
  let bestAt = -Infinity;
  for (const plan of plans) {
    const at = instant(plan.validatedAt);
    if (at === null) continue;
    if (at > bestAt) {
      best = plan;
      bestAt = at;
    }
  }
  return best;
}

/**
 * OÙ EN EST CHAQUE PERSONNE QUE LE PLAN VIVANT A FUSIONNÉE.
 *
 * ⚠️ LA COMPARAISON PORTE SUR **LE PLAN QUI A ÉTÉ FUSIONNÉ**, retrouvé PAR SON
 * ID (`merged_from[].plan_id`), et pas sur « le plus récemment validé de ses
 * plans ». C'était le défaut, et il a été MESURÉ EN HTTP le 2026-08-12:
 *
 *   Zoé porte DEUX plans personnels vivants et validés — la contrainte
 *   d'exclusion n'interdit que le chevauchement, pas l'adjacence, et ce fichier
 *   le documentait déjà trente lignes plus bas. Le maître fusionne celui de
 *   cette semaine (validé à 04:29:47,614). L'autre, celui de la semaine
 *   prochaine, a été validé à 04:29:48,755 — une seconde plus tard, et DISJOINT
 *   du plan du foyer, donc jamais fusionnable. Lecture immédiate, personne
 *   n'ayant rien validé entre-temps: `merged_plan_revalidated`, `held: []`.
 *   Deux dégâts, et il fallait les deux: la fusion cessait d'être collante (le
 *   `compose` suivant ré-excluait Zoé, `servings` 3 → 2, sans que le maître
 *   n'ait rien demandé) ET l'alerte D8 était fausse, indiscernable d'une vraie,
 *   donc le maître allait cliquer « défusionner ».
 *
 * ── LES SIX ÉTATS, ET LA DIRECTION DE CHAQUE ERREUR ──────────────────────
 *   · `still_merged`        le plan fusionné est là, avec la même validation
 *                           ⇒ on TIENT. Cas nominal, et c'est lui qui rend la
 *                           fusion collante.
 *   · `revalidated_…`       le plan fusionné est là et porte une validation
 *                           POSTÉRIEURE ⇒ on AVERTIT et on ne tient plus.
 *                           Reprendre en silence quelqu'un qui vient de
 *                           revalider déciderait à sa place — ce que D10 refuse.
 *   · `merged_plan_repla…`  le plan fusionné a DISPARU et quelque chose de plus
 *                           récent a été validé ⇒ c'est le cas canonique de D8
 *                           (`write_student_meal_plan` retire la ligne d'avant
 *                           et en écrit une neuve, donc l'id change), et on
 *                           avertit. On ne tient plus: elle mange autre chose.
 *   · `merged_plan_no_lo…`  le plan fusionné a disparu, et RIEN de plus récent
 *                           n'a été validé. On n'avertit PAS — « elle a validé
 *                           un nouveau plan » serait faux, et c'est cette
 *                           fausse alerte-là qui a été mesurée. On ne tient pas
 *                           non plus, et c'est sans effet: la contrainte
 *                           d'exclusion interdit qu'un autre plan vivant
 *                           couvre les jours du plan disparu, donc plus rien ne
 *                           la retire de la table — L3 la compose d'office.
 *   · `no_live_personal_…`  plus AUCUN plan à elle ⇒ plus rien à tenir. Elle
 *                           est composée comme une bouche ordinaire, ce qu'elle
 *                           est redevenue, et l'entrée cesse d'être portée.
 *   · `merge_date_unread…`  STRUCTURELLEMENT INATTEIGNABLE depuis une base
 *                           valide: `own_plans` filtre `validated_at is not
 *                           null`, donc une fusion ne peut pas archiver une
 *                           date absente. La branche existe pour qu'une
 *                           archive abîmée ne fabrique pas un faux
 *                           avertissement. Elle TIENT la fusion sans avertir:
 *                           l'erreur coûte au pire une assiette de trop (le
 *                           même arbitrage que L2 sur `servings` et que L3 sur
 *                           le recouvrement total), là où l'inverse défait en
 *                           silence un geste que le maître a fait.
 *
 * ⚠️ `latestValidated` SERT ENCORE, MAIS SEULEMENT QUAND LE PLAN FUSIONNÉ A
 * DISPARU. C'est là, et seulement là, que « a-t-elle validé quelque chose
 * depuis ? » est la bonne question: tant que le plan fusionné est vivant, un
 * autre plan vivant ne peut pas couvrir ses jours, donc il ne dit rien de la
 * fenêtre qu'on a reprise.
 */
export function mergeStandings(args: {
  mergedFrom: readonly MergedFromEntry[];
  /** Les plans personnels vivants et validés, par `member_id`. */
  plansByMember: ReadonlyMap<string, readonly MemberLivePlan[]>;
}): MergeStanding[] {
  const out: MergeStanding[] = [];
  for (const entry of args.mergedFrom) {
    const plans = args.plansByMember.get(entry.member_id) ?? [];
    // LE PLAN DONT ON PARLE, retrouvé par son id. C'est toute la correction.
    const merged = plans.find((p) => p.id === entry.plan_id) ?? null;
    const latest = latestValidated(plans);
    const mergedAt = instant(entry.validated_at);
    const mergedNowAt = instant(merged?.validatedAt ?? null);
    const latestAt = instant(latest?.validatedAt ?? null);

    let state: MergeStandingState;
    if (mergedAt === null) state = STANDING_UNDATED;
    else if (merged !== null) {
      // Le plan fusionné est TOUJOURS LÀ. Une date illisible dessus (impossible
      // depuis `own_plans`) tient la fusion plutôt que d'inventer une alerte.
      state = mergedNowAt !== null && mergedNowAt > mergedAt
        ? STANDING_REVALIDATED
        : STANDING_HELD;
    } else if (latest === null || latestAt === null) state = STANDING_NO_LIVE_PLAN;
    else if (latestAt > mergedAt) state = STANDING_MERGED_PLAN_REPLACED;
    else state = STANDING_MERGED_PLAN_GONE;

    out.push({
      memberId: entry.member_id,
      mergedPlanId: entry.plan_id,
      mergedValidatedAt: entry.validated_at,
      mergedPlanStillLive: merged !== null,
      mergedPlanValidatedAtNow: merged?.validatedAt ?? null,
      latestPlanId: latest?.id ?? null,
      latestValidatedAt: latest?.validatedAt ?? null,
      state,
      warn: state === STANDING_REVALIDATED ||
        state === STANDING_MERGED_PLAN_REPLACED,
      hold: state === STANDING_HELD || state === STANDING_UNDATED,
    });
  }
  return out;
}

/** Les bouches qu'une composition ordinaire doit re-reprendre. Ordre d'archive. */
export function heldMemberIds(standings: readonly MergeStanding[]): string[] {
  return standings.filter((s) => s.hold).map((s) => s.memberId);
}

/**
 * UNE REPRISE COLLANTE, **AVEC LA FENÊTRE SUR LAQUELLE ELLE COLLE**.
 *
 * ⚠️ LA PORTÉE FAIT PARTIE DU FAIT, ET SON ABSENCE ÉTAIT UN MENSONGE MESURÉ. Le
 * lecteur annonçait `held` comme « ce que la prochaine composition re-reprendra
 * d'office » en le calculant sur TOUS les plans du foyer vivants, alors que le
 * générateur ne relit `merged_from` que sur les plans qui MORDENT sur la fenêtre
 * qu'il recompose. Les deux listes étaient donc différentes dès qu'un maître
 * composait une fenêtre qui ne recouvre pas le plan porteur — et l'écran
 * promettait une bouche que la composition n'allait pas reprendre.
 *
 * On ne peut pas ALIGNER les deux en amont: le lecteur ne connaît pas la fenêtre
 * que le maître composera ensuite, et l'inventer serait un second avis sur une
 * fenêtre — exactement ce que ce lot refuse partout ailleurs. On rend donc la
 * portée EXPLICITE: « une composition qui mord sur cette fenêtre-ci re-reprendra
 * cette bouche », qui est mot pour mot le prédicat du générateur
 * (`plansOverlap(plan, fenêtre)` puis `readMergedFrom`).
 */
export interface HeldMerge {
  memberId: string;
  /** Le plan du foyer vivant qui porte la reprise — celui que le geste vise. */
  planId: string;
  /** LA PORTÉE: la fenêtre de ce plan. Hors d'elle, la reprise ne colle pas. */
  window: PlanSpan;
}

export function heldMerges<H extends MergeCarrierPlan>(
  standings: readonly MergeStanding[],
  carriers: ReadonlyMap<string, MergeCarrier<H>>,
): HeldMerge[] {
  const out: HeldMerge[] = [];
  for (const standing of standings) {
    if (!standing.hold) continue;
    const carrier = carriers.get(standing.memberId);
    // Sans porteur il n'y a pas de portée à annoncer, donc rien à annoncer.
    // Inatteignable quand les standings viennent des porteurs, et c'est le seul
    // cas qui existe: la branche refuse une portée devinée.
    if (!carrier) continue;
    out.push({
      memberId: standing.memberId,
      planId: carrier.plan.id,
      window: {
        startsOn: carrier.plan.startsOn,
        durationDays: carrier.plan.durationDays,
      },
    });
  }
  return out;
}

/**
 * LES ENTRÉES `merged_from` QUE LE PROCHAIN PLAN DOIT PORTER.
 *
 * ⚠️ SANS ELLE, LA CHAÎNE CASSE AU DEUXIÈME GESTE. Le plan neuf remplace le
 * plan vivant, donc il remplace aussi sa provenance: si `merged_from` ne
 * portait que la fusion du jour, la composition SUIVANTE ne trouverait plus
 * trace des reprises précédentes et les ré-excluerait toutes — c'est-à-dire
 * exactement le trou que ce lot ferme, décalé d'un tour.
 *
 * LES JOURS SONT RECALCULÉS SUR LA NOUVELLE FENÊTRE, jamais recopiés: `days`
 * dit « les jours réellement repris » par CE plan-ci (L4). Recopier ceux du
 * plan d'avant ferait porter à une ligne des dates qu'elle ne couvre pas.
 *
 * LES AUTRES FAITS SONT RECOPIÉS TELS QUELS — id de plan, fenêtre du plan,
 * `validated_at`. C'est ce qui rend la comparaison de D8 stable dans le temps:
 * la date archivée reste celle du geste du maître, pas celle de la dernière
 * recomposition. Un `hold` signifie précisément que la personne n'a rien validé
 * depuis, donc la date d'aujourd'hui et celle d'alors sont le même instant.
 */
export function carryMergedFrom(args: {
  mergedFrom: readonly MergedFromEntry[];
  heldMemberIds: readonly string[];
  window: PlanSpan;
}): MergedFromEntry[] {
  const out: MergedFromEntry[] = [];
  for (const entry of args.mergedFrom) {
    if (!args.heldMemberIds.includes(entry.member_id)) continue;
    out.push(mergedFromEntry({
      memberId: entry.member_id,
      userId: entry.user_id,
      plan: {
        id: entry.plan_id,
        startsOn: entry.plan_starts_on,
        durationDays: entry.plan_duration_days,
        validatedAt: entry.validated_at,
      },
      window: args.window,
    }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. D10 · D8 — CE QU'ON PROPOSE AU MAÎTRE, ET CE QU'ON LUI SIGNALE
//
// ⚠️ UN LECTEUR, PAS UN GÉNÉRATEUR. Rien ici ne décide de composer: la fusion
// reste un GESTE du maître (D10), et ce module ne fait que lui dire ce qu'il
// peut faire et ce qu'il devrait savoir.
//
// CE QU'IL NE SAIT PAS PRÉDIRE, ET C'EST ÉCRIT PLUTÔT QUE MASQUÉ: la présence.
// `merge_member_away_all_window` se décide sur le rythme de repas et les
// absences résolus à la composition; le refaire ici demanderait de recalculer
// une présence sur une fenêtre qui n'est pas encore celle d'un plan. Une
// proposition peut donc, dans ce cas précis, être refusée au moment du geste —
// nommément, en 400 ms, sans appel modèle. C'est le seul écart connu entre ce
// que la proposition annonce et ce que la fusion fait.
// ---------------------------------------------------------------------------

/** D10 — « le plan de X a été validé, voulez-vous le fusionner ? » */
export const NOTICE_MERGE_AVAILABLE = "merge_available";
/** D8 — « X a validé un nouveau plan APRÈS que vous l'avez fusionné. » */
export const NOTICE_MERGED_PLAN_REVALIDATED = "merged_plan_revalidated";

export type MergeNoticeKind =
  | typeof NOTICE_MERGE_AVAILABLE
  | typeof NOTICE_MERGED_PLAN_REVALIDATED;

/**
 * LES SORTIES, NOMMÉES PAR LE SERVEUR.
 *
 * D8 en donne TROIS et pas deux, et elles sont écrites ici pour que l'écran
 * n'en invente pas une quatrième ni n'en oublie une. « Dans les trois cas, X
 * garde son plan » est l'invariant du modèle: aucune de ces sorties n'écrit
 * quoi que ce soit sur le compte du secondaire.
 */
export const EXIT_MERGE = "merge";
export const EXIT_UNMERGE = "unmerge";
export const EXIT_DISMISS = "dismiss";

export interface MergeNoticeWindow {
  /** Les jours de SON plan qui reviendraient. C'est la phrase de D16. */
  window: PlanSpan;
  /**
   * D1 — CE QUE LA FUSION RECOMPOSERAIT VRAIMENT: la queue du plan du foyer.
   *
   * ⚠️ RENDU PARCE QUE LA PROPOSITION DOIT DIRE LE GESTE, PAS LA MOITIÉ DU
   * GESTE. Quand le plan personnel s'arrête avant la fin de la semaine du
   * foyer, la fusion refait le foyer jusqu'à dimanche — sinon la fin de la
   * semaine se retrouverait sans plan (voir `MergeWindow.recomposed`). Un
   * maître à qui on annonce « 3 jours » et à qui on refait 5 dîners a le droit
   * de le savoir AVANT de cliquer; il vaut égal à `window` dans le cas nominal,
   * et l'écran ne dit alors rien de plus.
   */
  recomposed: PlanSpan;
  intersection: PlanSpan;
  pivot: string;
  daysAlreadyPast: number;
  intoPlanId: string;
}

export interface MergeNotice {
  kind: MergeNoticeKind;
  memberId: string;
  userId: string | null;
  displayName: string;
  /**
   * LE PLAN QU'UNE FUSION PRENDRAIT VRAIMENT — choisi par `bestMergePair`,
   * jamais « le plus récent ».
   *
   * ⚠️ LA DIFFÉRENCE EST RÉELLE ET ELLE A ÉTÉ TROUVÉE EN RELECTURE. Une bouche
   * peut porter DEUX plans personnels vivants et validés: la contrainte
   * d'exclusion n'interdit que le chevauchement, pas l'adjacence. Zoé valide le
   * 12 un plan pour cette semaine, puis le 14 un plan pour la suivante — si la
   * proposition ne regardait que « le plus récemment validé », elle
   * n'annoncerait rien du tout (le plan de la semaine prochaine ne croise pas le
   * plan du foyer d'aujourd'hui) alors que la fusion, elle, reprendrait sans
   * problème celui de cette semaine. La proposition doit décrire CE QUE LA
   * FUSION FERA, pas ce que la dernière validation raconte.
   *
   * Quand rien n'est fusionnable, ces champs décrivent le plan le plus
   * récemment validé: c'est tout ce qu'on a à montrer, et l'avertissement de D8
   * n'a de toute façon pas de fenêtre à annoncer.
   */
  planId: string;
  planStartsOn: string;
  planDurationDays: number;
  validatedAt: string | null;
  /**
   * L'INSTANT À RENVOYER À `keel_household_dismiss_merge_notice`.
   *
   * ⚠️ CE N'EST PAS `validatedAt` CI-DESSUS, et confondre les deux ferait
   * refuser `notice_moved_on` en boucle sans que personne comprenne. « Refuser »
   * porte sur l'ÉTAT des plans de cette personne — donc sur la validation la
   * plus récente, celle qu'une validation de plus fera bouger — pas sur le plan
   * particulier qu'une fusion prendrait.
   */
  dismissValidatedAt: string | null;
  /**
   * Ce qu'une fusion prendrait, calculé par `bestMergePair` — la MÊME fonction
   * que le générateur. `null` quand plus rien n'est fusionnable (D8 avertit
   * quand même: le plan du foyer porte une reprise périmée, et le maître doit
   * pouvoir la défaire).
   */
  mergeable: MergeNoticeWindow | null;
  /** Pourquoi rien n'est fusionnable, quand `mergeable` est `null`. */
  mergeableRefusal: MergeWindowRefusal | null;
  /**
   * D8 seulement: ce que le plan du foyer avait repris, ET SUR QUELLE LIGNE.
   *
   * ⚠️ `householdPlanId` ET `unmergeWindow` SONT LA MOITIÉ QUI MANQUAIT. Deux
   * plans du foyer vivants peuvent porter la même reprise; la défusion en
   * recompose UN, et tant que la proposition ne nommait pas lequel, elle
   * pouvait offrir un bouton que le geste refusait (mesuré: `exits` portait
   * `unmerge` pendant que le geste rendait `unmerge_window_all_past`, parce que
   * les deux ne parlaient pas du même plan). `mergeCarriers` choisit la ligne,
   * une seule fois, pour les deux.
   */
  merged:
    | {
      planId: string;
      validatedAt: string | null;
      householdPlanId: string;
      /** Ce que la défusion recomposerait. `null` ⇒ le geste refusera. */
      unmergeWindow: PlanSpan | null;
    }
    | null;
  /** Les sorties offertes, dans l'ordre où D8 les écrit. */
  exits: string[];
}

/** Pourquoi cette bouche n'a pas de proposition. Jamais un silence. */
export const SKIP_IS_OWNER = "member_is_owner";
export const SKIP_NO_VALIDATED_PLAN = "no_validated_plan";
export const SKIP_MUTED = "proposals_muted";
export const SKIP_DISMISSED = "dismissed_by_owner";
export const SKIP_ALREADY_MERGED = "already_merged";
/**
 * L7/D11 — LA SEMAINE DU FOYER EST PLEINE.
 *
 * ⚠️ C'EST LE MÊME MOT QUE LE REFUS DU GÉNÉRATEUR, et il est IMPORTÉ. Proposer
 * un bouton qui rendra `merge_quota_exhausted` est une promesse qu'on ne tient
 * pas; le dire dans `skipped` est la seule façon d'expliquer un écran vide sans
 * ouvrir une base de production.
 */
export const SKIP_QUOTA_EXHAUSTED = MERGE_QUOTA_EXHAUSTED;

export interface MergeNoticeSkip {
  memberId: string;
  displayName: string;
  reason: string;
}

/** Une bouche du foyer, telle que le roster la rend. */
export interface NoticeMember {
  memberId: string;
  userId: string | null;
  displayName: string;
  isOwner: boolean;
  ownPlans: readonly MemberLivePlan[];
}

/** Le réglage discret de D17, par bouche. */
export interface MergeSettingRow {
  memberId: string;
  proposalsMuted: boolean;
  /** La validation que le maître a explicitement écartée (« refuser »). */
  dismissedValidatedAt: string | null;
}

export interface MergeNoticeResult {
  notices: MergeNotice[];
  skipped: MergeNoticeSkip[];
  /**
   * Les reprises collantes, CHACUNE AVEC SA PORTÉE. Voir `HeldMerge`: une liste
   * d'ids seule promettait une reprise que la composition suivante ne faisait
   * pas dès qu'elle visait une autre fenêtre.
   */
  held: HeldMerge[];
  standings: MergeStanding[];
}

/**
 * CE QUE LE MAÎTRE DOIT VOIR, POUR SON FOYER, MAINTENANT.
 *
 * ── D17 — LE RÉGLAGE COUPE LA PROPOSITION, JAMAIS LA FUSION ──────────────
 * `proposalsMuted` retire la PROPOSITION de D10 et rien d'autre. Le geste, lui,
 * reste possible: `operation: "merge"` ne lit pas ce réglage, et un test de
 * source le tient. Un réglage qui bloquerait le geste serait une punition, pas
 * un filtre — et le maître qui demande explicitement une fusion pour quelqu'un
 * qu'il a masqué a évidemment le droit de l'obtenir.
 *
 * ⚠️ IL NE COUPE PAS L'AVERTISSEMENT DE D8, ET C'EST UNE DÉCISION. Une
 * proposition parle du plan de QUELQU'UN D'AUTRE — on peut ne plus vouloir
 * l'entendre. Un avertissement parle du plan du MAÎTRE: il dit que sa propre
 * ligne vivante contient la reprise d'un plan que l'intéressé a remplacé.
 * Le taire rendrait un plan périmé invisible ET indéfaisable, puisque la
 * défusion se déclenche depuis cet avertissement.
 *
 * ── « REFUSER », LA TROISIÈME SORTIE, DOIT DURER PLUS QU'UN ÉCRAN ────────
 * `dismissedValidatedAt` porte la validation que le maître a écartée. Elle
 * coupe la PROPOSITION pour cette validation-là, et pour elle seule: le jour où
 * la personne valide un plan de plus, la date change, et la question se repose.
 * Sans cette borne, « refuser » serait soit un silence d'un instant — l'écran
 * reposerait la question au rechargement suivant — soit un silence définitif,
 * c'est-à-dire D17 déguisé.
 *
 * ⚠️ ET IL NE COUPE PAS L'AVERTISSEMENT NON PLUS (D5, QA du 2026-08-12). Il le
 * coupait, et le commentaire ci-dessus disait « les DEUX » sans jamais se
 * demander ce que devenait le plan du maître. Mesuré: plan du foyer portant une
 * reprise périmée + `dismiss` ⇒ `notices: []`, `skipped:
 * dismissed_by_owner` — la ligne vivante gardait sa reprise obsolète et la
 * sortie `unmerge` devenait HORS D'ATTEINTE jusqu'à ce que la personne valide
 * encore autre chose. C'est mot pour mot le dégât que l'arbitrage de D17 juste
 * au-dessus existe pour empêcher, et celui que L7 a repris pour le plafond.
 *
 * LES TROIS SE LISENT DONC PAREIL, et c'est la seule ligne à retenir: ce qui
 * parle du plan de QUELQU'UN D'AUTRE se tait sur demande; ce qui parle du plan
 * DU MAÎTRE ne se tait jamais. « Refuser » reste le plus explicite des trois —
 * c'est un geste, pas un réglage — mais il n'a pas plus de droit que le mute sur
 * une ligne qui n'est pas celle de l'autre.
 *
 * ⚠️ CE QUE ÇA COÛTE, ET C'EST ASSUMÉ: sur un avertissement, le bouton
 * « refuser » ne fait plus disparaître la carte. Il reste offert (`EXIT_DISMISS`
 * est dans `exits` des deux natures) parce qu'il POSE la borne — le jour où la
 * personne valide un plan de plus, la proposition ne revient pas. Une carte qui
 * revient est un rappel qu'on peut ignorer; un plan périmé qu'on ne peut plus
 * défaire est un dégât qu'on ne peut pas.
 */
export function buildMergeNotices(args: {
  /**
   * Les plans du foyer VIVANTS. `plan_kind = 'household'`, déjà filtré, et
   * PORTANT LEUR `generated_from`.
   *
   * ⚠️ `mergedFrom` N'EST PLUS UN ARGUMENT, ET C'EST LA CORRECTION. L'appelant
   * l'aplatissait lui-même en gardant « la première entrée trouvée » — donc
   * celle du plan le PLUS ANCIEN, `loadLiveHouseholdPlans` triant `starts_on`
   * croissant. Mesuré: la `validated_at` rendue au maître était celle d'un plan
   * périmé, pas celle du geste réel sur son plan courant. Le choix est
   * désormais fait ici, par `mergeCarriers`, et par personne d'autre.
   */
  householdPlans: readonly MergeCarrierPlan[];
  members: readonly NoticeMember[];
  settings: readonly MergeSettingRow[];
  /** Jour local du maître, `YYYY-MM-DD`. */
  today: string;
  /**
   * L7/D11 — CE QUE LE PLAFOND DIT DE CETTE SEMAINE, ou `null` s'il n'a pas pu
   * être lu.
   *
   * ⚠️ REQUIS, PAS OPTIONNEL, et c'est une cicatrice de ce dépôt: « un
   * paramètre de garde optionnel est une garde désarmée ». Un appelant qui
   * l'oublierait proposerait des fusions que le quota refuse, et rien ne
   * tomberait. Le compilateur a listé les appelants.
   *
   * `null` VAUT « ON NE SAIT PAS », ET ON PROPOSE QUAND MÊME. C'est le bon sens
   * de l'échec pour un FILTRE D'AFFICHAGE — se tromper dans l'autre sens
   * masquerait en silence des propositions parfaitement valides. Le vrai
   * plafond, lui, ne dépend pas de cette valeur: il est dans le prédicat de
   * `keel_household_claim_merge_quota`.
   */
  quota: MergeQuotaState | null;
}): MergeNoticeResult {
  // Une seule lecture du fait, en tête: le plafond est un fait de FOYER, pas
  // une propriété d'une bouche. Le relire dans la boucle inviterait à le rendre
  // conditionnel par personne, ce que D11 ne dit nulle part.
  const quotaExhausted = args.quota?.exhausted === true;
  const plansByMember = new Map<string, readonly MemberLivePlan[]>();
  for (const m of args.members) plansByMember.set(m.memberId, m.ownPlans);
  const carriers = mergeCarriers({
    householdPlans: args.householdPlans,
    today: args.today,
  });
  const standings = mergeStandings({
    mergedFrom: [...carriers.values()].map((c) => c.entry),
    plansByMember,
  });
  const standingOf = new Map(standings.map((s) => [s.memberId, s]));
  const settingOf = new Map(args.settings.map((s) => [s.memberId, s]));

  const notices: MergeNotice[] = [];
  const skipped: MergeNoticeSkip[] = [];

  for (const member of args.members) {
    const skip = (reason: string) =>
      skipped.push({
        memberId: member.memberId,
        displayName: member.displayName,
        reason,
      });

    // D2 — LE PLAN DU MAÎTRE EST LE PLAN DU FOYER: il n'y a jamais rien à lui
    // proposer, et le générateur refuse déjà `merge_member_is_owner`.
    if (member.isOwner) {
      skip(SKIP_IS_OWNER);
      continue;
    }

    const latest = latestValidated(member.ownPlans);
    const standing = standingOf.get(member.memberId) ?? null;
    // LE PLAN DU FOYER DONT ON PARLE — le même que celui que la défusion
    // recomposera, parce que c'est la même fonction qui l'a choisi.
    const carrier = carriers.get(member.memberId) ?? null;
    const setting = settingOf.get(member.memberId) ?? null;

    // LA FUSION TIENT: rien à décider, et surtout rien à proposer une seconde
    // fois. La personne est déjà à la table du maître.
    if (standing?.hold) {
      skip(SKIP_ALREADY_MERGED);
      continue;
    }

    if (!latest) {
      skip(SKIP_NO_VALIDATED_PLAN);
      continue;
    }

    // ⚠️ LU AVANT LES TROIS SILENCES, ET C'EST L'ORDRE QUI PORTE D5. Les trois
    // — « refuser », le mute de D17, le plafond de L7 — partagent la même
    // condition: ils ne se taisent que sur ce qui parle du plan D'UN AUTRE.
    // Calculer `warns` après l'un d'eux le rendait aveugle, et c'est très
    // exactement ce que la QA a mesuré sur `dismiss`.
    const warns = standing?.warn === true;

    // « REFUSER » — la troisième sortie de D8, bornée à CETTE validation.
    if (
      !warns &&
      setting?.dismissedValidatedAt &&
      instant(setting.dismissedValidatedAt) !== null &&
      instant(latest.validatedAt) !== null &&
      instant(setting.dismissedValidatedAt)! >= instant(latest.validatedAt)!
    ) {
      skip(SKIP_DISMISSED);
      continue;
    }

    // D17 — le réglage discret. Il ne coupe QUE la proposition: un
    // avertissement parle du plan du maître, pas de celui d'un autre.
    if (!warns && setting?.proposalsMuted) {
      skip(SKIP_MUTED);
      continue;
    }

    // ⚠️ TOUS SES PLANS, PAS SEULEMENT LE DERNIER VALIDÉ — voir le long
    // commentaire sur `planId`. C'est la MÊME entrée que `resolveMergeRequest`
    // donne au générateur, donc la proposition annonce exactement ce que la
    // fusion prendra.
    const pair = bestMergePair({
      householdPlans: args.householdPlans,
      personalPlans: member.ownPlans,
      today: args.today,
    });
    const shown = pair.ok ? pair.personal : latest;

    if (!pair.ok && !warns) {
      // Rien à fusionner et rien à avertir: ce n'est pas une proposition, c'est
      // un fait de calendrier. Il est tracé, jamais tu.
      skip(pair.refusal);
      continue;
    }

    // ── L7/D11 — LA SEMAINE EST PLEINE ──────────────────────────────────
    //
    // ⚠️ APRÈS `pair.refusal`, ET C'EST L'ORDRE QUI COMPTE: quand il n'y a
    // rien à fusionner, le plafond n'est pas la raison. Le motif le plus
    // PRÉCIS gagne, sinon le maître répare la mauvaise chose.
    //
    // MÊME PARTAGE QUE D17, et pour la même raison. Une PROPOSITION parle du
    // plan d'un autre: si le geste va être refusé, la proposer est une
    // promesse qu'on ne tient pas, donc elle devient un `skipped` nommé. Un
    // AVERTISSEMENT parle du plan du MAÎTRE — sa ligne vivante contient la
    // reprise d'un plan que l'intéressé a remplacé. Le taire rendrait ce plan
    // périmé invisible ET indéfaisable, alors que la défusion, elle, ne coûte
    // aucun quota. On garde donc l'avertissement et on lui retire la SEULE
    // sortie que le plafond refuse: `merge`.
    if (quotaExhausted && !warns) {
      skip(SKIP_QUOTA_EXHAUSTED);
      continue;
    }

    const mergeable: MergeNoticeWindow | null = pair.ok
      ? {
        window: pair.window.window,
        recomposed: pair.window.recomposed,
        intersection: pair.window.intersection,
        pivot: pair.window.pivot,
        daysAlreadyPast: pair.window.daysAlreadyPast,
        intoPlanId: pair.household.id,
      }
      : null;

    notices.push({
      kind: warns ? NOTICE_MERGED_PLAN_REVALIDATED : NOTICE_MERGE_AVAILABLE,
      memberId: member.memberId,
      userId: member.userId,
      displayName: member.displayName,
      planId: shown.id,
      planStartsOn: shown.startsOn,
      planDurationDays: shown.durationDays,
      validatedAt: shown.validatedAt,
      dismissValidatedAt: latest.validatedAt,
      mergeable,
      mergeableRefusal: pair.ok ? null : pair.refusal,
      merged: warns && standing && carrier
        ? {
          planId: standing.mergedPlanId,
          validatedAt: standing.mergedValidatedAt,
          householdPlanId: carrier.plan.id,
          unmergeWindow: carrier.tail === null ? null : {
            startsOn: carrier.tail.window.startsOn,
            durationDays: carrier.tail.window.durationDays,
          },
        }
        : null,
      // D8 — LES TROIS SORTIES, DANS L'ORDRE DU REGISTRE. La défusion d'abord:
      // c'est elle qui préserve les courses déjà faites, donc c'est elle que le
      // maître doit voir en premier. Une fusion qui n'a plus de fenêtre ne
      // propose pas de refusionner — ce serait offrir un bouton qui refuse.
      //
      // ⚠️ ET LA DÉFUSION NON PLUS, POUR LA MÊME RAISON. Elle n'est offerte que
      // si le plan du foyer qui porte la reprise a encore des jours devant lui
      // (D16). Mesuré le 2026-08-12: le lecteur offrait `unmerge` pendant que le
      // geste rendait 409 `unmerge_window_all_past`, et le maître n'avait alors
      // AUCUN moyen de défaire la reprise. La condition et le geste lisent
      // maintenant le même porteur.
      //
      // ⚠️ L7/D11 — `EXIT_MERGE` TOMBE QUAND LA SEMAINE EST PLEINE, et lui
      // seul. `unmerge` et `dismiss` ne consomment aucun quota: la défusion
      // répare une fusion (la taxer ferait payer deux fois la même erreur) et
      // « refuser » n'est qu'une ligne de réglage. Retirer les trois aurait
      // enfermé le maître avec un plan périmé jusqu'au lundi suivant.
      exits: warns
        ? [
          ...(carrier?.tail ? [EXIT_UNMERGE] : []),
          ...(mergeable && !quotaExhausted ? [EXIT_MERGE] : []),
          EXIT_DISMISS,
        ]
        : [EXIT_MERGE, EXIT_DISMISS],
    });
  }

  return { notices, skipped, held: heldMerges(standings, carriers), standings };
}

/**
 * LA PHRASE DE D16, RENDUE PAR LE SERVEUR ET PAS PAR L'ÉCRAN.
 *
 * « son plan couvre 5 jours, dont 2 déjà passés — je peux fusionner les 3
 * restants » est écrit MOT POUR MOT dans le registre. Les trois nombres
 * viennent tous de `bestMergePair`; les recomposer côté écran ferait un second
 * avis sur des jours, et c'est très exactement ce que ce lot refuse.
 *
 * ⚠️ RENDUE EN ANGLAIS comme tout ce qui sort du serveur ici. La traduction est
 * une affaire d'écran (`frontend/src/keel/i18n`); ce qui ne doit pas se
 * dédoubler, c'est l'ARITHMÉTIQUE, et elle est ici.
 */
export function proposalSentence(notice: MergeNotice): string {
  if (!notice.mergeable) {
    return `${notice.displayName} has a plan of their own, and none of its days ` +
      `can be merged into the household plan.`;
  }
  const covered = notice.mergeable.intersection.durationDays;
  const past = notice.mergeable.daysAlreadyPast;
  const left = notice.mergeable.window.durationDays;
  const head = `${notice.displayName}'s plan covers ${covered} ` +
    `${covered === 1 ? "day" : "days"} of this household's week`;
  const sentence = past === 0
    ? `${head} — I can merge ${left === 1 ? "the day" : `all ${left} of them`}.`
    : `${head}, ${past} of them already behind us — I can merge the ` +
      `${left} ${left === 1 ? "day" : "days"} that are left.`;
  // ── D1 — CE QUE LA FUSION REFERA EN PLUS, DIT ICI OU NULLE PART ──────────
  //
  // Quand leur plan s'arrête avant la fin de la semaine du foyer, la fusion
  // recompose la semaine JUSQU'AU BOUT — sinon la fin de semaine se retrouverait
  // sans aucun plan, et la base refuse justement de l'écrire (mesuré: 409
  // `plan_overlaps_existing` après 16,1 s de modèle). Le maître doit lire ce
  // supplément AVANT de cliquer: c'est la moitié du geste que la première
  // phrase, qui ne parle que des jours de la PERSONNE, ne peut pas porter.
  //
  // ⚠️ SILENCIEUX DANS LE CAS NOMINAL. Deux plans « jusqu'à dimanche » rendent
  // `recomposed === window`, et cette phrase n'apparaît pas: une proposition
  // qui explique toujours tout finit par ne plus être lue.
  const rebuilt = notice.mergeable.recomposed.durationDays;
  if (rebuilt <= left) return sentence;
  return `${sentence} Doing it rebuilds the household's ${rebuilt} remaining ` +
    `${rebuilt === 1 ? "day" : "days"}, so the end of the week keeps a plan.`;
}

/** Réexporté: tout consommateur de `mergeStandings` en manipule. */
export type { MergedFromEntry };
