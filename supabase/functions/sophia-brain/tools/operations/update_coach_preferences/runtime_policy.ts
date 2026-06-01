import type { CoachPreferenceKey } from "../_shared/operation_payload_builder.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { SUPPORTED_COACH_PREFERENCE_KEYS } from "./status.ts";

export type CoachPreferenceRuntimePolicy = {
  question_tendency?: "low" | "normal" | "high";
  challenge_level?: "low" | "balanced" | "high";
  tone?: "soft" | "warm_direct" | "direct";
  composer_constraints: string[];
};

function valueText(pref: unknown): string {
  const record = pref && typeof pref === "object" && !Array.isArray(pref)
    ? pref as Record<string, unknown>
    : {};
  const value = record.value && typeof record.value === "object"
    ? record.value as Record<string, unknown>
    : {};
  return String(value.value ?? record.value ?? "").trim();
}

function composerConstraintForPreference(key: CoachPreferenceKey, value: string): string | null {
  if (key === "coach.question_tendency") {
    if (value === "low") {
      return "Préférence coach: poser moins de questions; privilégier une réponse plus directe et limiter les relances interrogatives.";
    }
    if (value === "high") {
      return "Préférence coach: poser davantage de questions utiles pour clarifier avant de conclure.";
    }
    if (value === "normal") {
      return "Préférence coach: garder un niveau équilibré de questions.";
    }
  }
  if (key === "coach.challenge_level") {
    if (value === "low") {
      return "Préférence coach: challenge léger; réduire la pression et la confrontation.";
    }
    if (value === "high") {
      return "Préférence coach: challenge élevé; pousser plus franchement et confronter avec exigence constructive.";
    }
    if (value === "balanced") {
      return "Préférence coach: challenge équilibré; combiner soutien et exigence sans surpression.";
    }
  }
  if (key === "coach.tone") {
    if (value === "direct") {
      return "Préférence coach: ton très direct; aller droit au point avec peu d'arrondis.";
    }
    if (value === "soft") {
      return "Préférence coach: ton doux; formuler avec plus de soutien et d'arrondi.";
    }
    if (value === "warm_direct") {
      return "Préférence coach: ton bienveillant ferme; rester chaleureux mais clair.";
    }
  }
  return null;
}

export function loadCoachPreferenceRuntimePolicy(
  preferences: Array<{ key?: string | null; value?: unknown }>,
): CoachPreferenceRuntimePolicy {
  const policy: CoachPreferenceRuntimePolicy = {
    composer_constraints: [],
  };
  for (const pref of preferences ?? []) {
    const key = String(pref?.key ?? "").trim() as CoachPreferenceKey;
    const value = valueText(pref);
    if (!key || !value) continue;
    if (key === "coach.question_tendency") {
      policy.question_tendency = value as CoachPreferenceRuntimePolicy[
        "question_tendency"
      ];
    } else if (key === "coach.challenge_level") {
      policy.challenge_level = value as CoachPreferenceRuntimePolicy[
        "challenge_level"
      ];
    } else if (key === "coach.tone") {
      policy.tone = value as CoachPreferenceRuntimePolicy["tone"];
    }
    const constraint = composerConstraintForPreference(key, value);
    if (constraint) policy.composer_constraints.push(constraint);
  }
  return policy;
}

export async function loadCoachPreferenceRuntimeContext(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string | null> {
  const { data, error } = await args.supabase
    .from("user_profile_facts")
    .select("key,value,status")
    .eq("user_id", args.userId)
    .eq("scope", "global")
    .eq("status", "active")
    .like("key", "coach.%");
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const supportedRows = (data as any[]).filter((row) =>
    (SUPPORTED_COACH_PREFERENCE_KEYS as readonly string[]).includes(
      String(row?.key ?? ""),
    )
  );
  const policy = loadCoachPreferenceRuntimePolicy(supportedRows as any);
  if (policy.composer_constraints.length === 0) return null;
  return [
    "=== PREFERENCES COACH UTILISATEUR (réglages UI) ===",
    ...policy.composer_constraints.map((constraint) => `- ${constraint}`),
    "Ces contraintes viennent uniquement des trois réglages visibles: ton, niveau de challenge, tendance à poser des questions.",
    "=== FIN PREFERENCES COACH UTILISATEUR ===",
  ].join("\n");
}

export async function loadCoachQuestionTendencyLow(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!supabase || typeof (supabase as any).from !== "function") {
    return false;
  }
  const { data } = await supabase
    .from("user_profile_facts")
    .select("value,status")
    .eq("user_id", userId)
    .eq("scope", "global")
    .eq("key", "coach.question_tendency")
    .eq("status", "active")
    .maybeSingle();
  const value = String((data as any)?.value?.value ?? "").trim();
  return value === "low" || value === "peu_de_questions";
}
