/**
 * SONDE LOT 4A — `plan_question` AVALE-T-IL `plan_feedback` ?
 *
 * Le run de chat réel a tourné sur une fixture SANS plan publié: `plan_question`
 * y est structurellement INDISPONIBLE (« la lane n'existe QUE si le payload
 * porte keel_plan_context »). Le 0/9 mesuré là-bas ne dit donc RIEN de la
 * compétition entre les deux lanes.
 *
 * Cette sonde met le dispatcher RÉEL, avec le prompt RÉEL et le modèle RÉEL,
 * devant un payload qui PORTE `keel_plan_context` — c'est-à-dire dans la seule
 * situation où la capture est possible. Aucune écriture en base.
 */
import { runDispatcher } from "../supabase/functions/sophia-brain/dispatcher/dispatcher.v2.ts";
import { generateWithGemini } from "../supabase/functions/_shared/gemini.ts";

const PLAN_CONTEXT = [
  "=== KEEL PLAN (SOURCE: plan_commitments + commitment_evaluations) ===",
  "Date 2026-08-19 (wednesday). 3 commitment(s) scheduled today, 0 resolved, 3 still unknown.",
  "SLOT lunch:",
  "- id:11111111-1111-4111-8111-111111111111 | Riz complet au dejeuner | food_group_ref=whole_grains | autonomy=coach_decides | swap_policy=ask_coach | status unknown",
  "SLOT dinner:",
  "- id:22222222-2222-4222-8222-222222222222 | Poisson gras le soir | food_group_ref=fatty_fish | autonomy=student_chooses | swap_policy=same_group_ok | status unknown",
  "ANY TIME:",
  "- id:33333333-3333-4333-8333-333333333333 | Marche de 30 minutes | status unknown",
  "HOW TO READ THIS BLOCK:",
  "- 'id:<uuid>' opens every line.",
].join("\n");

function realRunner() {
  return async (input: {
    system_prompt: string;
    user_prompt: string;
    json_mode: true;
    model_name: string;
  }) => {
    const raw = await generateWithGemini(
      input.system_prompt,
      input.user_prompt,
      0,
      input.json_mode,
      [],
      "auto",
      {
        model: Deno.env.get("SOPHIA_DISPATCHER_LLM_MODEL") ||
          Deno.env.get("GLOBAL_AI_MODEL") || "gpt-5.4-mini",
        source: "lot4a-probe",
        forceRealAi: true,
        forceInitialModel: true,
        maxRetries: 1,
      },
    );
    if (raw && typeof raw === "object") return raw;
    const text = String(raw ?? "").trim().replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "").trim();
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  };
}

const CASES: Array<{ label: string; message: string; expect: string }> = [
  {
    label: "FR · retour de part PUR",
    message:
      "Les portions du midi etaient beaucoup trop grosses cette semaine, j'ai jete la moitie de mon assiette.",
    expect: "plan_feedback(portion) seul",
  },
  {
    label: "EN · retour de part PUR",
    message:
      "Honestly the dinner servings were way too small this week, I was starving an hour later every night.",
    expect: "plan_feedback(portion) seul",
  },
  {
    label: "FR · retour de part + QUESTION de substitution",
    message:
      "La part de riz d'hier midi etait vraiment trop copieuse. Du coup ce soir je peux remplacer le riz par des pates ?",
    expect: "LES DEUX (plan_feedback + plan_question)",
  },
  {
    label: "EN · retour de part + QUESTION de substitution",
    message:
      "Yesterday's rice portion was way too big. So tonight can I swap the rice for pasta?",
    expect: "LES DEUX (plan_feedback + plan_question)",
  },
  {
    label: "FR · question de substitution SEULE (contre-épreuve)",
    message: "J'ai pas de saumon ce soir, du cabillaud ca va ?",
    expect: "plan_question seul, PAS de plan_feedback",
  },
  {
    label: "EN · demande de proposition (contre-épreuve du faux positif)",
    message: "I'm starving this morning, what should I have for breakfast?",
    expect: "AUCUN signal",
  },
];

const PASSES = Number(Deno.args[0] ?? "2");
const tally = {
  turns: 0,
  plan_feedback: 0,
  plan_question: 0,
  both: 0,
  neither: 0,
};

for (const testCase of CASES) {
  for (let pass = 1; pass <= PASSES; pass += 1) {
    const frame = await runDispatcher({
      user_message: testCase.message,
      recent_messages: [],
      user_id: "08050000-0000-4000-8000-000000000031",
      channel: "web",
      plan_snapshot: null,
      keel_plan_context: PLAN_CONTEXT,
      keel_student: true,
      safety_context_output: {
        risk_band: "none",
        reason_codes: [],
        evidence: [],
      },
      llm_runner: realRunner(),
      // deno-lint-ignore no-explicit-any
    } as any);
    const pf = frame.skill_signals.plan_feedback;
    const pq = frame.skill_signals.plan_question;
    tally.turns += 1;
    if (pf?.detected) tally.plan_feedback += 1;
    if (pq?.detected) tally.plan_question += 1;
    if (pf?.detected && pq?.detected) tally.both += 1;
    if (!pf?.detected && !pq?.detected) tally.neither += 1;
    console.log(
      JSON.stringify({
        case: testCase.label,
        pass,
        expect: testCase.expect,
        plan_feedback: pf?.detected === true ? (pf.kind ?? "?") : false,
        plan_question: pq?.detected === true
          ? (pq.context?.kind ?? "?")
          : false,
      }),
    );
  }
}

console.log("\n=== TALLY ===");
console.log(JSON.stringify(tally, null, 2));
