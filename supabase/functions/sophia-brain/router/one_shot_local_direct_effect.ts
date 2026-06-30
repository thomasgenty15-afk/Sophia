import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  emptyOneShotReminderPayloadHint,
  type OneShotReminderPayloadHint,
} from "./one_shot_reminder_prompt_contract.ts";

export type LocalOneShotDirectEffectRequest = {
  requested: boolean;
  effect_type: "create_one_shot_reminder" | null;
  explicitness: "explicit" | "implied" | "weak" | "none";
  target_status: "identified" | "ambiguous" | "missing" | "none";
  confidence_band: "low" | "medium" | "high";
  payload_hint: OneShotReminderPayloadHint;
  reason: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, max = 600): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  if (!text) return null;
  return text.slice(0, max).trim() || null;
}

export function emptyLocalOneShotDirectEffectRequest(): LocalOneShotDirectEffectRequest {
  return {
    requested: false,
    effect_type: null,
    explicitness: "none",
    target_status: "none",
    confidence_band: "low",
    payload_hint: emptyOneShotReminderPayloadHint(),
    reason: null,
  };
}

export function normalizeLocalOneShotDirectEffectRequest(
  raw: unknown,
): LocalOneShotDirectEffectRequest {
  const root = isRecord(raw) ? raw : {};
  const payloadRoot = isRecord(root.payload_hint) ? root.payload_hint : {};
  return {
    requested: root.requested === true,
    effect_type: root.effect_type === "create_one_shot_reminder"
      ? "create_one_shot_reminder"
      : null,
    explicitness: root.explicitness === "explicit" ||
        root.explicitness === "implied" ||
        root.explicitness === "weak"
      ? root.explicitness
      : "none",
    target_status: root.target_status === "identified" ||
        root.target_status === "ambiguous" ||
        root.target_status === "missing"
      ? root.target_status
      : "none",
    confidence_band: root.confidence_band === "high" ||
        root.confidence_band === "medium" ||
        root.confidence_band === "low"
      ? root.confidence_band
      : "low",
    payload_hint: {
      ...emptyOneShotReminderPayloadHint(),
      raw_text: cleanText(payloadRoot.raw_text, 600),
      when_hint: cleanText(payloadRoot.when_hint, 160),
      UTC_time: cleanText(payloadRoot.UTC_time, 80),
      local_label: cleanText(payloadRoot.local_label, 160),
      instruction_hint: cleanText(payloadRoot.instruction_hint, 300),
    },
    reason: cleanText(root.reason, 300),
  };
}

export function turnFrameHasOneShotReminderDirectEffect(
  turnFrame: Pick<TurnFrame, "direct_effects"> | null | undefined,
): boolean {
  return (turnFrame?.direct_effects ?? []).some((effect) =>
    effect.effect_type === "create_one_shot_reminder"
  );
}

export function shouldAcceptLocalOneShotDirectEffect(args: {
  turnFrame?: Pick<TurnFrame, "direct_effects"> | null;
  request?: LocalOneShotDirectEffectRequest | null;
}): boolean {
  const request = args.request;
  if (turnFrameHasOneShotReminderDirectEffect(args.turnFrame ?? null)) {
    return false;
  }
  return Boolean(
    request &&
      request.requested === true &&
      request.effect_type === "create_one_shot_reminder" &&
      request.explicitness === "explicit" &&
      request.target_status === "identified" &&
      request.confidence_band !== "low" &&
      request.payload_hint.raw_text &&
      request.payload_hint.when_hint &&
      request.payload_hint.UTC_time &&
      request.payload_hint.local_label &&
      request.payload_hint.instruction_hint,
  );
}

export function oneShotDirectEffectFromLocalRequest(
  request: LocalOneShotDirectEffectRequest | null | undefined,
  options?: {
    turnFrame?: Pick<TurnFrame, "direct_effects"> | null;
  },
): TurnFrame["direct_effects"][number] | null {
  if (!shouldAcceptLocalOneShotDirectEffect({
    turnFrame: options?.turnFrame ?? null,
    request,
  })) {
    return null;
  }
  if (!request) return null;
  return {
    effect_type: "create_one_shot_reminder",
    explicitness: request.explicitness as Exclude<
      LocalOneShotDirectEffectRequest["explicitness"],
      "none"
    >,
    target_status: request.target_status as Exclude<
      LocalOneShotDirectEffectRequest["target_status"],
      "none"
    >,
    confidence_band: request.confidence_band,
    payload_hint: {
      raw_text: request.payload_hint.raw_text,
      when_hint: request.payload_hint.when_hint,
      UTC_time: request.payload_hint.UTC_time,
      local_label: request.payload_hint.local_label,
      instruction_hint: request.payload_hint.instruction_hint,
    },
  };
}

export function localOneShotDirectEffectPromptLines(
  flowName: string,
): string[] {
  return [
    `- direct_effect_request: champ structure pour exposer le meme direct effect one-shot reminder que le dispatcher global. Si turn_frame.direct_effects contient deja create_one_shot_reminder, le dispatcher global a deja flagge le rappel: retourne direct_effect_request.requested=false, ne recrée pas, ne reroute pas, ne redemande pas et continue ${flowName} sur le besoin restant. Sinon, requested=true seulement si le user demande explicitement un rappel ponctuel, une notification ou une programmation avec un moment/delai exploitable pendant ${flowName}. effect_type vaut create_one_shot_reminder. explicitness=explicit si la demande est imperative/directe; implied ou weak si elle n'est pas assez claire. target_status=identified si le message contient un moment exploitable ou un delai clair, ambiguous si le moment est flou, missing si absent. confidence_band suit la clarte de la demande. payload_hint suit le contrat canonique: raw_text = clause exacte du rappel, when_hint = moment ou delai exploitable, UTC_time = instant ISO UTC calcule depuis now et la timezone utilisateur, local_label = libelle temporel user-facing, instruction_hint = uniquement ce qu'il faut rappeler sans absorber le besoin local restant. Le runtime direct-effect valide UTC_time et l'ecrit en DB comme scheduled_for; il ne parse pas when_hint pour calculer l'heure. Si when_hint, UTC_time, local_label ou instruction_hint manque, ne demande pas le direct effect. Laisse requested=false, effect_type=null, explicitness=none, target_status=none et payload_hint null si aucun rappel ponctuel. Ce champ influence seulement le runtime direct_effect standard; il ne donne jamais le droit au visible agent de dire que le rappel est cree avant commit.`,
    "- Regle UTC_time pour delai relatif: si when_hint est 'dans N minutes/heures/jours', calcule UTC_time directement depuis platform_context.direct_effect_time_context.now_utc + la duree. Ne convertis pas via user_local_datetime et ne soustrais jamais l'offset timezone une deuxieme fois. La timezone utilisateur sert aux heures locales absolues et au local_label, pas au calcul d'un delai relatif.",
  ];
}

export const LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE = {
  requested: false,
  effect_type: "create_one_shot_reminder|null",
  explicitness: "explicit|implied|weak|none",
  target_status: "identified|ambiguous|missing|none",
  confidence_band: "low|medium|high",
  payload_hint: {
    raw_text: "string|null",
    when_hint: "string|null",
    UTC_time: "string|null",
    local_label: "string|null",
    instruction_hint: "string|null",
  },
  reason: "string|null",
};
