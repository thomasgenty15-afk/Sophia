// Decisions saillantes de session (nina-r6 B01 RED; etendu V5-4): une
// recommandation retenue par le flow coaching (potion amour, carte X), une
// initiative a creer (feature_opportunity), un ajustement de plan en attente
// (plan_realignment) n'existaient plus comme etat structure une fois le flow
// relache — le composeur repondait au recall (« redis-moi la potion qu'on
// avait retenue ») depuis sa memoire libre et fabriquait un nom hors
// catalogue (« potion anti-fringale »), ou omettait du recap la chose
// principale que le user voulait mettre en place (paul-r9 B02, nina-r7 B04).
//
// Chaine (charte cmd 6, meme famille que session_style_commitment): le SKILL
// decide (la decision est deja structuree dans son etat local), l'ETAT de
// session porte, ce bloc DECRIT (avec le catalogue canonique), le composeur
// PARLE. Aucune detection semantique ici (cmd 0): on lit des champs de
// contrat, jamais le texte.
//
// V5-4 (rose-r7 B03): une decision a un statut. Une NOUVELLE decision sur le
// meme levier SUPERSEDE l'ancienne (marquee `dropped`, jamais re-listee comme
// retenue) — c'est exactement le rejet de « courage » au profit
// d'« apaisement » que le memorizer encodait deja correctement mais que la
// couche in-turn ratait.
import type {
  CoachingPotionType,
  CoachingRecommendationLocalState,
} from "../skills/coaching_recommendation/contract.ts";
import type { PlanRealignmentLocalState } from "../skills/plan_realignment/contract.ts";

export type SessionDecisionStatus = "retained" | "dropped";

export type SessionDecision = {
  source:
    | "coaching_recommendation"
    | "feature_opportunity"
    | "plan_realignment";
  feature: string | null;
  lever: string | null;
  technique: string | null;
  potion_type: string | null;
  /** Reste-a-faire user-facing d'un hand-off non durable (initiative a creer,
   * plan a ajuster) — jamais un effet deja committe. */
  handoff: string | null;
  status: SessionDecisionStatus;
};

/** Miroir type-verifie de l'union CoachingPotionType: un ajout au contrat qui
 * manquerait ici casse le typecheck (jamais de catalogue stale silencieux). */
const POTION_CATALOGUE: readonly CoachingPotionType[] = [
  "apaisement",
  "amour",
  "courage",
  "clarte",
  "guerison",
  "anti_decrochage",
] as const;

const SESSION_DECISIONS_KEY = "__session_decisions";
const MAX_DECISIONS = 8;

function text(value: unknown): string | null {
  const out = String(value ?? "").trim();
  return out ? out : null;
}

function normalizeDecision(entry: unknown): SessionDecision | null {
  if (!entry || typeof entry !== "object") return null;
  const root = entry as Partial<SessionDecision>;
  const source = root.source === "feature_opportunity" ||
      root.source === "plan_realignment"
    ? root.source
    : "coaching_recommendation";
  return {
    source,
    feature: text(root.feature),
    lever: text(root.lever),
    technique: text(root.technique),
    potion_type: text(root.potion_type),
    handoff: text(root.handoff),
    // Entrees pre-V5 sans statut = retenues (retro-compatibilite d'etat).
    status: root.status === "dropped" ? "dropped" : "retained",
  };
}

export function sessionDecisionFromCoachingState(
  localState: unknown,
): SessionDecision | null {
  const state = localState as
    | Partial<CoachingRecommendationLocalState>
    | null
    | undefined;
  if (!state || typeof state !== "object") return null;
  const visible = state.last_visible_decision ?? null;
  const feature = text(state.current_recommendation?.feature) ??
    text(state.recommendation_decision?.primary_feature);
  const lever = text(visible?.lever);
  const technique = text(visible?.variant);
  const potionType = text(visible?.potion_type);
  if (!feature && !lever && !technique && !potionType) return null;
  return {
    source: "coaching_recommendation",
    feature,
    lever,
    technique,
    potion_type: potionType,
    handoff: null,
    status: "retained",
  };
}

// W2.B: le producteur `sessionDecisionFromFeatureOpportunityState` est parti
// avec le skill `feature_opportunity`. La valeur `"feature_opportunity"` reste
// dans l'union `SessionDecision["source"]` et dans `normalizeDecision`: c'est
// une valeur PERSISTEE dans `temp_memory.__session_decisions` de sessions
// anterieures — la retirer ferait silencieusement re-etiqueter ces entrees en
// `coaching_recommendation`.

/** Hand-off plan_realignment (nina-r7 B04): un ajustement discute mais non
 * execute (jamais de patch depuis le chat) reste un fait de session que le
 * recap ne doit pas omettre. */
export function sessionDecisionFromPlanRealignmentState(
  localState: unknown,
): SessionDecision | null {
  const state = localState as
    | Partial<PlanRealignmentLocalState>
    | null
    | undefined;
  if (!state || typeof state !== "object") return null;
  const drift = text(state.drift_type);
  if (!drift || drift === "ambiguous") return null;
  return {
    source: "plan_realignment",
    feature: "adjust_plan",
    lever: null,
    technique: null,
    potion_type: null,
    handoff: `ajustement du plan discute (${drift}) — a faire dans l'app`,
    status: "retained",
  };
}

/** Cle d'upsert/supersedence: la POSITION (source+feature+lever), pas la
 * valeur. Une nouvelle valeur sur la meme position remplace l'ancienne
 * (dropped) au lieu de s'empiler comme deux decisions « retenues ». */
function positionKey(decision: SessionDecision): string {
  return [decision.source, decision.feature ?? "", decision.lever ?? ""].join(
    "|",
  );
}

function valueKey(decision: SessionDecision): string {
  return [
    positionKey(decision),
    decision.technique ?? "",
    decision.potion_type ?? "",
    decision.handoff ?? "",
  ].join("|");
}

export function sessionDecisionsFromTempMemory(
  tempMemory: Record<string, unknown> | null | undefined,
): SessionDecision[] {
  const raw = (tempMemory ?? {})[SESSION_DECISIONS_KEY];
  return Array.isArray(raw)
    ? raw.map(normalizeDecision).filter((entry): entry is SessionDecision =>
      entry !== null
    )
    : [];
}

/** Upsert avec supersedence par position, cap MAX_DECISIONS. */
export function withSessionDecision(
  tempMemory: Record<string, unknown>,
  decision: SessionDecision | null,
): Record<string, unknown> {
  if (!decision) return tempMemory;
  const previous = sessionDecisionsFromTempMemory(tempMemory);
  const position = positionKey(decision);
  const value = valueKey(decision);
  const next = [
    ...previous.map((entry): SessionDecision => {
      if (valueKey(entry) === value) return entry; // identique → dedup plus bas
      if (positionKey(entry) === position && entry.status === "retained") {
        // Nouvelle decision sur la meme position: l'ancienne est ECARTEE,
        // pas oubliee (le recall doit pouvoir trancher « on l'avait ecartee »).
        return { ...entry, status: "dropped" };
      }
      return entry;
    }).filter((entry) => valueKey(entry) !== value),
    decision,
  ].slice(-MAX_DECISIONS);
  return { ...tempMemory, [SESSION_DECISIONS_KEY]: next };
}

function decisionLine(decision: SessionDecision): string {
  const parts = [
    decision.potion_type ? `potion ${decision.potion_type}` : null,
    decision.technique ? `technique ${decision.technique}` : null,
    decision.handoff,
    !decision.potion_type && !decision.technique && !decision.handoff &&
      decision.feature
      ? decision.feature
      : null,
    decision.lever && !decision.potion_type ? `(levier ${decision.lever})` : null,
  ].filter(Boolean);
  return `- ${parts.join(" ") || decision.feature || "decision"}`;
}

export function sessionDecisionsPromptBlock(
  tempMemory: Record<string, unknown> | null | undefined,
): string | null {
  const decisions = sessionDecisionsFromTempMemory(tempMemory);
  if (decisions.length === 0) return null;
  const retained = decisions.filter((entry) => entry.status === "retained");
  const dropped = decisions.filter((entry) => entry.status === "dropped");
  return [
    "=== DECISIONS DE SESSION (source structuree) ===",
    "Recommandations retenues dans CETTE conversation:",
    ...(retained.length > 0
      ? retained.map(decisionLine)
      : ["- (aucune decision encore retenue)"]),
    ...(dropped.length > 0
      ? [
        "Options ECARTEES en cours de session (jamais a re-lister comme retenues):",
        ...dropped.map(decisionLine),
      ]
      : []),
    `Catalogue canonique des potions (les SEULS noms qui existent): ${
      POTION_CATALOGUE.join(", ")
    }.`,
    "Pour tout recall, recap ou reparation portant sur ce qui a ete retenu/decide en session, reponds depuis cette liste — JAMAIS depuis ta memoire libre de la conversation. Un nom de potion rendu appartient TOUJOURS au catalogue ci-dessus; n'invente ni ne fusionne jamais un nom (ex. avec le titre d'une action du plan).",
    "Une option ECARTEE ne se presente jamais comme retenue; si le user la mentionne, tranche explicitement ('on l'avait ecartee, on est parti sur ...').",
    "Si le user corrige avec une valeur presente ici, tranche explicitement ('tu as raison, c'etait ...') au lieu de proposer de re-choisir.",
    "Dans un recap/point de session, les decisions retenues non encore executees (potions/techniques a prendre, initiatives a creer, ajustements a faire dans l'app) se listent comme 'reste a faire de ton cote' — jamais omises.",
  ].join("\n");
}
