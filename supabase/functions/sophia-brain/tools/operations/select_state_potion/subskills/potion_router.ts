import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../../_shared/gemini.ts";
import { buildStatePotionCatalogPrompt } from "../catalog.ts";
import type {
  SelectStatePotionSlotFillerInput,
  SelectStatePotionSlotFillerOutput,
} from "../intake.ts";
import { buildPotionDetailSubskillPrompt } from "./potion_detail_intake.ts";

export async function fillPotionRouterSlotsWithAi(
  input: SelectStatePotionSlotFillerInput,
  normalize: (raw: unknown) => SelectStatePotionSlotFillerOutput,
): Promise<SelectStatePotionSlotFillerOutput | null> {
  const systemPrompt = [
    "Tu es le sous-skill router interne du Tool Skill select_state_potion de Sophia.",
    "Tu ne generes jamais de draft. Tu choisis uniquement l'etat, la potion, ou une shortlist de deux potions.",
    "Tu ne reponds jamais librement au user. Tu retournes uniquement un JSON de progression.",
    "Principe strict: la comprehension du message user est ici, dans ce JSON. Le code ne fera pas de regex ni de fallback metier.",
    buildStatePotionCatalogPrompt(),
    buildPotionDetailSubskillPrompt(),
    "Si le user nomme explicitement une potion valide, renseigne explicit_potion_request et selected_potion: il ne faut pas proposer deux options.",
    "Si le user demande une potion sans nommer explicitement le type, identifie l'etat emotionnel dominant puis propose les deux meilleures potions dans shortlist.options; laisse selected_potion manquante et generated_user_message doit demander de choisir entre les deux.",
    "Si current_state contient une shortlist et que le user choisit une option, renseigne selected_potion depuis son choix structure.",
    "Si l'etat dominant reste ambigu, ne propose pas de shortlist: pose une seule question courte dans generated_user_message.",
    "Quand selected_potion et state sont prets, current_sub_skill='detail_intake' et generated_user_message doit demander les deux champs requis du sous-skill detail correspondant, dans un seul message court.",
    "Les messages user doivent etre courts et naturels pour WhatsApp. Pas de vocabulaire technique.",
    "Tu tutoies toujours l'utilisateur.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "route_select_state_potion_tool_skill",
    required_json_shape: {
      current_sub_skill:
        "state_resolution|potion_choice|detail_intake",
      state_patch: {
        state: {
          status: "missing|ambiguous|identified",
          kind:
            "decrochage|fear_avoidance|shame_guilt|confusion_overload|self_harshness|stress_pressure|null",
          intensity: "low|medium|high|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        explicit_potion_request: {
          status: "none|identified",
          potion_type: "rappel|courage|guerison|clarte|amour|apaisement|null",
          evidence: ["string"],
        },
        shortlist: {
          status: "missing|ambiguous|identified",
          options: [{
            potion_type: "rappel|courage|guerison|clarte|amour|apaisement",
            reason: "string",
            fit_confidence: "low|medium|high",
            evidence: ["string"],
          }],
          evidence: ["string"],
        },
        selected_potion: {
          status: "missing|ambiguous|identified",
          value: "rappel|courage|guerison|clarte|amour|apaisement|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        context: {
          target_hint: "string|null",
          related_plan_item_id: "string|null",
          topic_hint: "string|null",
        },
        missing_slots: ["state|potion_type"],
        generated_user_message: "string|null",
        confidence: "low|medium|high",
      },
      missing_slots: ["state|potion_type"],
      confidence: "low|medium|high",
      generated_user_message: "string|null",
      evidence: ["string"],
    },
    current_user_message: input.message,
    recent_messages: input.recent_messages ?? [],
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
    timezone: input.timezone,
    channel: input.channel,
  });
  try {
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "select_state_potion.router",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalize(raw);
  } catch (error) {
    console.warn("[SelectStatePotion] router subskill failed", error);
    return null;
  }
}
