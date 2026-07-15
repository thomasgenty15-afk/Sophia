import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  TrackProgressIntent,
  TrackProgressRequestedEffect,
  TrackProgressStatus,
} from "./contract.ts";

export type TrackProgressIntakeResult = {
  detected: boolean;
  intent: TrackProgressIntent;
  progress_status: TrackProgressStatus | null;
  target_item_id: string | null;
  target_title: string | null;
  value: number | null;
  date_hint: string | null;
  // Correction explicite d'un report deja fait (contrat dispatcher 3h):
  // seule voie qui autorise a re-ecrire un outcome oppose le meme jour.
  is_correction: boolean;
  // Citation verbatim des mots du user qui nomment la cible (contrat 3d-ter):
  // preuve exigee avant toute ecriture sur target_status=identified.
  target_evidence: string | null;
  // Correction de cible (contrat 3h-bis): item errone dont l'entry du jour
  // doit etre invalidee avant de committer sur target_item_id.
  retarget_from_item_id: string | null;
  confidence: "high" | "medium" | "low";
  reason_code: string;
  evidence: string[];
};

function trackEffect(turnFrame: TurnFrame) {
  return turnFrame.direct_effects.find((effect) =>
    effect.effect_type === "track_progress_plan_item"
  ) ?? null;
}

function payloadFromTurnFrame(turnFrame: TurnFrame): Record<string, unknown> {
  const payload = trackEffect(turnFrame)?.payload_hint ?? {};
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function validStatus(value: unknown): TrackProgressStatus | null {
  // Frontiere de contrat avec le dispatcher: l'enum canonique est
  // completed|partial|missed, mais des versions du prompt ont enseigne
  // "done" — on normalise l'alias sur ce slot structure plutot que de
  // bloquer un effet explicite avec status_missing.
  if (value === "completed" || value === "done") return "completed";
  if (value === "missed") return "missed";
  if (value === "partial") return "partial";
  return null;
}

function intentForStatus(status: TrackProgressStatus): TrackProgressIntent {
  if (status === "missed") return "log_missed";
  if (status === "partial") return "log_partial";
  return "log_completed";
}

function valueForStatus(status: TrackProgressStatus, raw: unknown): number {
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(1, numeric));
  if (status === "missed") return 0;
  if (status === "partial") return 0.5;
  return 1;
}

export function isTrackProgressFutureIntent(message: string): boolean {
  const normalized = normalizeIntentText(message);
  if (!normalized) return false;
  if (containsAnyPhrase(normalized, completedProgressPhrases)) return false;
  return containsAnyPhrase(normalized, futureProgressPhrases);
}

function normalizeIntentText(value: string): string {
  const stripped = value
    .toLowerCase()
    .normalize("NFD")
    .replaceAll("\u0300", "")
    .replaceAll("\u0301", "")
    .replaceAll("\u0302", "")
    .replaceAll("\u0303", "")
    .replaceAll("\u0308", "")
    .replaceAll("\u0327", "");
  let out = "";
  let previousWasSpace = true;
  for (const char of stripped) {
    const isAsciiLetterOrDigit =
      (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
    if (isAsciiLetterOrDigit) {
      out += char;
      previousWasSpace = false;
    } else if (!previousWasSpace) {
      out += " ";
      previousWasSpace = true;
    }
  }
  return ` ${out.trim()} `;
}

function containsAnyPhrase(message: string, phrases: string[]): boolean {
  return phrases.some((phrase) => message.includes(` ${phrase} `));
}

const completedProgressPhrases = [
  "c est fait",
  "cest fait",
  "j ai fait",
  "je l ai fait",
  "je lai fait",
  "j ai termine",
  "j ai fini",
  "je viens de faire",
  "je viens d avancer",
  "j ai avance",
  "j ai marche",
  "j ai reussi",
];

const futureProgressPhrases = [
  "je vais faire",
  "je vais le faire",
  "je vais la faire",
  "je vais m y mettre",
  "je vais essayer",
  "je vais tenter",
  "j vais faire",
  "jvais faire",
  "je compte faire",
  "je prevois de faire",
  "je prevois faire",
  "je pense faire",
  "je dois faire",
  "je devrais faire",
  "je le ferai",
  "je la ferai",
  "je ferai",
  "je vais pas faire",
  "je ne vais pas faire",
  "je ne vais pas le faire",
  "je ne vais pas la faire",
];

const statusQuestionPhrases = [
  "est ce que tu as note",
  "est ce que tu l as note",
  "est ce que tu as enregistre",
  "est ce que tu l as enregistre",
  "est ce que c est note",
  "est ce que c est enregistre",
  "tu as note",
  "tu l as note",
  "tu as enregistre",
  "tu l as enregistre",
  "c est note",
  "c est enregistre",
  "tu as pris en compte",
  "tu l as pris en compte",
  // P5-B (paul-p4verify Y2): question de LECTURE de progression — « j'en
  // suis à combien ? » émettait un track fantôme (blocked
  // target_not_evidenced → clarify parasite) alors que le statut était servi.
  "j en suis a combien",
  "j en suis ou",
  "ou j en suis",
  "combien j en ai",
  "combien il m en reste",
  // P5-B (nina-global20 T14): question de VERIFICATION explicite — la
  // réponse vient de la projection DB, jamais d'une ré-écriture ni du
  // narratif de conversation.
  "t es sur",
  "t es sure",
  "tu es sur que",
  "tu es sure que",
  "verifie que",
  "verifie stp",
  "tu peux verifier",
  "sont bien enregistre",
  "sont bien enregistres",
  "sont bien compte",
  "sont bien comptes",
  "est bien enregistre",
  "est bien compte",
];

export function isTrackProgressStatusQuestion(
  message: string,
  turnFrame: TurnFrame,
): boolean {
  const payload = payloadFromTurnFrame(turnFrame);
  if (payload.intent_hint === "status_question") return true;
  const normalized = normalizeIntentText(message);
  if (containsAnyPhrase(normalized, statusQuestionPhrases)) return true;
  // P6-F (nina-untested21 R1-B05): acte dominant VERIFICATION DE COMPTE avec
  // report implicite embarqué (« ça me fait bien 3 avec celui que j'ai fait
  // aussi, c'est ça ? ») — écrire exige un MARQUEUR D'ACTION explicite
  // (« note aussi », « compte celui d'aujourd'hui ») ; sans lui, le tour est
  // une lecture: compte DB + offre, jamais un commit.
  const verificationDominant =
    / c est (bien )?ca /.test(normalized) ||
    / ca (me |nous )?fait (bien )?\d/.test(normalized) ||
    / on est (bien )?d accord /.test(normalized);
  const explicitWriteMarker =
    / (note|compte|ajoute|marque|enregistre)[sz]? /.test(normalized) ||
    / tu peux (noter|compter|ajouter|marquer|enregistrer) /.test(normalized);
  if (verificationDominant && !explicitWriteMarker) return true;
  // P8-D (nina-hard23 T15, probe P8-4 passe 6): l'INTERROGATIVE de
  // vérification en 1re PERSONNE (« j'ai bien coché mon eau aujourd'hui ? »)
  // n'était couverte par aucune forme — le dispatcher la classe parfois hors
  // verify et le track COMMITTAIT une entrée sur une question (double-track
  // non consenti quand l'item n'était pas encore coché). C'est une LECTURE:
  // « j'ai bien coché/noté X » + cadre interrogatif. Seul un marqueur
  // d'écriture IMPÉRATIF adressé à Sophia (« note aussi », « tu peux
  // noter ») ré-ouvre l'écriture — le participe (« noté ») ne compte pas.
  // P10-C (rose-p8reval T8): le clitique objet (« je L'ai bien cochée ») et
  // les accords en genre/nombre échappaient au motif strict « j ai bien
  // coché » — la question écrivait quand même une entrée (reps gonflés,
  // confirmation auto-réalisatrice). Le doute exprimé (« il me semble »,
  // « je suis plus sûre ») vaut cadre interrogatif.
  const firstPersonVerification =
    / j(?: |e (?:l |les |en )?)ai bien (coche|note|enregistre|valide|compte|marque)e?s? /
      .test(normalized) &&
    (String(message ?? "").includes("?") ||
      / (c est ca|hein|non|n est ce pas|il me semble|je (ne )?suis plus (tres )?sure?)/
        .test(normalized));
  const imperativeWriteMarker =
    / (note|compte|ajoute|marque|enregistre)[sz]?[- ](aussi|moi|le|la|les|ca|celui|celle)\b/
      .test(normalized) ||
    / tu peux (noter|compter|ajouter|marquer|enregistrer) /.test(normalized);
  return firstPersonVerification && !imperativeWriteMarker;
}

export function runTrackProgressIntake(args: {
  turn_frame: TurnFrame;
  message: string;
}): TrackProgressIntakeResult {
  const effect = trackEffect(args.turn_frame);
  if (!effect) {
    return {
      detected: false,
      intent: "ignore",
      progress_status: null,
      target_item_id: null,
      target_title: null,
      value: null,
      date_hint: null,
      is_correction: false,
      target_evidence: null,
      retarget_from_item_id: null,
      confidence: "low",
      reason_code: "no_track_progress_direct_effect",
      evidence: [],
    };
  }

  if (isTrackProgressStatusQuestion(args.message, args.turn_frame)) {
    return {
      detected: true,
      intent: "status_question",
      progress_status: null,
      target_item_id: null,
      target_title: null,
      value: null,
      date_hint: null,
      is_correction: false,
      target_evidence: null,
      retarget_from_item_id: null,
      confidence: "high",
      reason_code: "status_question",
      evidence: [args.message],
    };
  }

  if (isTrackProgressFutureIntent(args.message)) {
    return {
      detected: true,
      intent: "future_intent",
      progress_status: null,
      target_item_id: null,
      target_title: null,
      value: null,
      date_hint: null,
      is_correction: false,
      target_evidence: null,
      retarget_from_item_id: null,
      confidence: "high",
      reason_code: "future_intent",
      evidence: [args.message],
    };
  }

  const payload = payloadFromTurnFrame(args.turn_frame);
  const status = validStatus(payload.status_hint);
  // Le champ canonique est target_item_id; plan_item_id est tolere car
  // c'est le nom du champ dans active_action_candidates_for_direct_effects
  // que le dispatcher recopie.
  const rawItemId = typeof payload.target_item_id === "string"
    ? payload.target_item_id
    : typeof payload.plan_item_id === "string"
    ? payload.plan_item_id
    : "";
  const targetItemId = rawItemId.trim();
  const targetTitle = typeof payload.target_title === "string"
    ? payload.target_title.trim()
    : "";
  const dateHint = typeof payload.date_hint === "string"
    ? payload.date_hint
    : null;
  const isCorrection = payload.correction === true;
  const targetEvidence = typeof payload.target_evidence === "string"
    ? payload.target_evidence.trim()
    : "";
  const retargetFromItemId = typeof payload.retarget_from === "string"
    ? payload.retarget_from.trim()
    : "";

  if (!status) {
    return {
      detected: true,
      intent: "clarify",
      progress_status: null,
      target_item_id: targetItemId || null,
      target_title: targetTitle || null,
      value: null,
      date_hint: dateHint,
      is_correction: isCorrection,
      target_evidence: targetEvidence || null,
      retarget_from_item_id: retargetFromItemId || null,
      confidence: "low",
      reason_code: "status_missing",
      evidence: [args.message],
    };
  }

  return {
    detected: true,
    intent: intentForStatus(status),
    progress_status: status,
    target_item_id: targetItemId || null,
    target_title: targetTitle || null,
    value: valueForStatus(status, payload.value_hint),
    date_hint: dateHint,
    is_correction: isCorrection,
    target_evidence: targetEvidence || null,
    retarget_from_item_id: retargetFromItemId || null,
    confidence: "high",
    reason_code: "dispatcher_status_hint",
    evidence: [args.message],
  };
}

export function requestedEffectFromIntake(args: {
  intake: TrackProgressIntakeResult;
  target_title: string;
  source_message_id: string;
}): TrackProgressRequestedEffect | null {
  if (
    !args.intake.target_item_id ||
    !args.intake.progress_status ||
    !Number.isFinite(args.intake.value)
  ) return null;

  return {
    type: "track_progress_plan_item",
    target_item_id: args.intake.target_item_id,
    target_title: args.target_title,
    progress_status: args.intake.progress_status,
    value: Number(args.intake.value),
    date_hint: args.intake.date_hint,
    source_message_id: args.source_message_id,
    retarget_from_item_id: args.intake.retarget_from_item_id,
    correction: args.intake.is_correction,
  };
}
