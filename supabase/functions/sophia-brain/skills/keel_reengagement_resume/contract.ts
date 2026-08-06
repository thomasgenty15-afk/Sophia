/**
 * LA REPRISE APRÈS UNE RELANCE KEEL — le cadre qui manquait.
 *
 * ── LE TROU QUE CE FLOW FERME ────────────────────────────────────────────────
 * `keel-reengage-v1` envoie une relance à un élève silencieux depuis plus de
 * 72 h. L'élève répond. Et jusqu'ici, ce tour repartait au dispatcher global
 * comme un tour ordinaire : rien, dans le runtime, ne savait qu'il venait de
 * rompre un silence de plusieurs jours.
 *
 * Pire : l'épisode de décrochage est FERMÉ à la garde 4 de `chat-inbound-v1`,
 * vingt-neuf lignes avant que le moteur de tour ne démarre. Un flow qui aurait
 * lu « épisode ouvert ? » depuis `processMessage` aurait toujours vu « non ».
 * D'où l'armement À LA FERMETURE, seul instant où le fait est connu.
 *
 * ── POURQUOI ZÉRO APPEL MODÈLE ───────────────────────────────────────────────
 * Même arbitrage que `plan_question`, l'exemplaire du dépôt. Sur une reprise,
 * le risque n'est pas de mal comprendre : c'est de dire quelque chose de faux
 * sur une absence qu'on n'a pas observée (« tu as décroché », « ça fait une
 * semaine »). Un gabarit fermé ne peut pas inventer une durée, un motif ni un
 * reproche. Un prompt est une intention ; une constante est une garantie.
 *
 * La classification de la réponse pourra venir plus tard, si un besoin mesuré
 * l'exige. Elle n'est pas nécessaire pour CADRER.
 *
 * ── CE QUE CE FLOW NE FAIT PAS, ET C'EST STRUCTUREL ──────────────────────────
 * Aucun effet durable. Il cadre, il n'écrit pas. Les effets KEEL
 * (`log_protocol_event`, rappel, déviation) restent la propriété de leur lane :
 * si l'élève rapporte un fait dans le même message, c'est le dispatcher global
 * qui l'émet, pas ce flow.
 *
 * Et il est BORNÉ : deux tours au maximum. Un cadre de reprise qui s'installe
 * devient une conversation sur l'absence, ce qui est exactement le contraire du
 * but — la boucle existe pour ramener quelqu'un à son protocole, pas pour lui
 * faire commenter son silence.
 */

/** L'identifiant de skill, partagé par le routeur, l'état de flow et le runtime. */
export const KEEL_REENGAGEMENT_RESUME_SKILL_ID = "keel_reengagement_resume_v1";

/**
 * Deux tours, et le second est déjà une sortie.
 *
 * Le premier accueille et rouvre la porte ; le second rend la main au
 * dispatcher global quoi qu'il arrive. Voir le docstring : un cadre qui dure
 * devient le sujet.
 */
export const KEEL_REENGAGEMENT_RESUME_MAX_TURNS = 2;

export const KEEL_REENGAGEMENT_RESUME_STAGES = ["welcome_back", "handed_back"] as const;
export type KeelReengagementResumeStage =
  (typeof KEEL_REENGAGEMENT_RESUME_STAGES)[number];

/**
 * L'état local, volontairement minuscule.
 *
 * `awaiting_first_reply` n'est pas décoratif : c'est LUI que lit le carve-out
 * de fraîcheur d'`active_flow_state.ts`. Sans ce champ à `true`, le flow
 * expirerait au bout de 4 h — alors que l'élève répond à une relance des JOURS
 * plus tard. C'est la raison d'être du carve-out, et la seule.
 */
export type KeelReengagementResumeState = {
  version: 1;
  stage: KeelReengagementResumeStage;
  turns_in_flow: number;
  /** `true` tant qu'aucun tour n'a été possédé par le flow. */
  awaiting_first_reply: boolean;
  /** `reengagement_episodes.id`, pour la trace. Jamais rendu à l'élève. */
  episode_id: string | null;
  /**
   * Jours d'inactivité à l'ouverture de l'épisode.
   *
   * ⚠️ LU POUR LA TRACE, JAMAIS POUR LA COPIE. Le renderer n'y touche pas :
   * nommer la durée d'une absence à quelqu'un qui revient est précisément le
   * reproche que `assertNoGuiltTripping` interdit côté envoi. Ce serait
   * incohérent de l'interdire à l'aller et de le dire au retour.
   */
  days_inactive_at_open: number | null;
  armed_at: string;
};

export type KeelReengagementResumeDecision =
  /** Le tour est cadré et visible. */
  | { kind: "frame"; next: KeelReengagementResumeState }
  /** Le flow rend la main, sans texte propre: le dispatcher global reprend. */
  | { kind: "hand_back"; reason: KeelReengagementResumeExitReason };

export const KEEL_REENGAGEMENT_RESUME_EXIT_REASONS = [
  /** Le plafond de tours est atteint. */
  "max_turns",
  /** Safety préempte: ce flow ne parle jamais par-dessus une crise. */
  "safety",
  /** L'état persisté est illisible: on ne devine pas, on rend la main. */
  "unreadable_state",
  /** Message vide (média seul, bouton): rien à cadrer. */
  "empty_message",
] as const;
export type KeelReengagementResumeExitReason =
  (typeof KEEL_REENGAGEMENT_RESUME_EXIT_REASONS)[number];

/** Les invariants, nommés — le test les épingle un par un. */
export const KEEL_REENGAGEMENT_RESUME_INVARIANTS = [
  "never_commits_a_durable_effect",
  "never_names_the_absence_duration",
  "safety_always_preempts",
  "bounded_to_two_turns",
  "unreadable_state_hands_back",
] as const;

export function normalizeKeelReengagementResumeState(
  raw: unknown,
): KeelReengagementResumeState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.version !== 1) return null;
  const stage = String(record.stage ?? "");
  if (!(KEEL_REENGAGEMENT_RESUME_STAGES as readonly string[]).includes(stage)) {
    return null;
  }
  const turns = Number(record.turns_in_flow);
  return {
    version: 1,
    stage: stage as KeelReengagementResumeStage,
    turns_in_flow: Number.isFinite(turns) && turns >= 0 ? Math.floor(turns) : 0,
    awaiting_first_reply: record.awaiting_first_reply === true,
    episode_id: typeof record.episode_id === "string" ? record.episode_id : null,
    days_inactive_at_open: Number.isFinite(Number(record.days_inactive_at_open))
      ? Number(record.days_inactive_at_open)
      : null,
    armed_at: String(record.armed_at ?? ""),
  };
}
