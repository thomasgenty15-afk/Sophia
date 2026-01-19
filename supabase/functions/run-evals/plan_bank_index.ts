// AUTO-GENERATED (repo-local plan bank)
// This file is generated from `supabase/functions/run-evals/plan_bank/**/*.json`.
//
// Why:
// - Edge Runtime bundles TypeScript/JS imports, but does NOT ship arbitrary repo files at runtime.
// - To make the plan bank available inside `run-evals`, we import JSON here so it is bundled.
//
// Regenerate:
// - Run the generator script again, then update this file (we can automate later).

export type PlanBankEntry = {
  meta: {
    id?: string;
    theme_key?: string;
    theme_id?: string;
    theme_title?: string;
    axis_id?: string;
    axis_title?: string;
    selected_problem_ids?: string[];
    selected_problem_labels?: string[];
    fingerprint?: string;
    model?: string;
    created_at?: string;
  };
  fake?: any;
  plan_json: any;
};

// NOTE: Deno requires explicit import assertions for JSON.
// Keeping paths relative to this file ensures bundling works in Supabase Edge Runtime.
import p01 from "./plan_bank/DISCIPLINE/plan_DISCIPLINE_DSC_1_5dc4c8e6d2e760e0.json" assert { type: "json" };
import p02 from "./plan_bank/DISCIPLINE/plan_DISCIPLINE_DSC_4_dc504315b502920e.json" assert { type: "json" };
import p03 from "./plan_bank/DISCIPLINE/plan_DISCIPLINE_DSC_6_1f1bec11e34c0042.json" assert { type: "json" };
import p04 from "./plan_bank/ENERGY/plan_ENERGY_ENG_1_424855a5c6df9022.json" assert { type: "json" };
import p05 from "./plan_bank/ENERGY/plan_ENERGY_ENG_1_b7280ed80e3d24a7.json" assert { type: "json" };
import p06 from "./plan_bank/ENERGY/plan_ENERGY_ENG_4_5f4305d069f0c5bd.json" assert { type: "json" };
import p07 from "./plan_bank/PROFESSIONAL/plan_PROFESSIONAL_PRO_1_b06b50bfa9850300.json" assert { type: "json" };
import p08 from "./plan_bank/PROFESSIONAL/plan_PROFESSIONAL_PRO_2_44773b0623429c65.json" assert { type: "json" };
import p09 from "./plan_bank/PROFESSIONAL/plan_PROFESSIONAL_PRO_4_2703fad4de9f137a.json" assert { type: "json" };
import p10 from "./plan_bank/RELATIONS/plan_RELATIONS_REL_4_d96679ef9bb625e7.json" assert { type: "json" };
import p11 from "./plan_bank/RELATIONS/plan_RELATIONS_REL_8_9ab3d7eb64c965e4.json" assert { type: "json" };
import p12 from "./plan_bank/RELATIONS/plan_RELATIONS_REL_8_d63206122ca6d03f.json" assert { type: "json" };
import p13 from "./plan_bank/SENSE/plan_SENSE_SNS_3_22ed64880c0f90e9.json" assert { type: "json" };
import p14 from "./plan_bank/SENSE/plan_SENSE_SNS_3_c08c447b6325d8a9.json" assert { type: "json" };
import p15 from "./plan_bank/SENSE/plan_SENSE_SNS_4_5ff74aa09a971112.json" assert { type: "json" };
import p16 from "./plan_bank/SLEEP/plan_SLEEP_SLP_1_d25dad97a2d43717.json" assert { type: "json" };
import p17 from "./plan_bank/SLEEP/plan_SLEEP_SLP_2_acaf45404dd4fada.json" assert { type: "json" };
import p18 from "./plan_bank/SLEEP/plan_SLEEP_SLP_3_eaef6788cf775412.json" assert { type: "json" };
import p19 from "./plan_bank/TRV/plan_TRV_TRV_2_9a38f6f47b3f0436.json" assert { type: "json" };

export const PLAN_BANK: PlanBankEntry[] = [
  p01 as any,
  p02 as any,
  p03 as any,
  p04 as any,
  p05 as any,
  p06 as any,
  p07 as any,
  p08 as any,
  p09 as any,
  p10 as any,
  p11 as any,
  p12 as any,
  p13 as any,
  p14 as any,
  p15 as any,
  p16 as any,
  p17 as any,
  p18 as any,
  p19 as any,
];



