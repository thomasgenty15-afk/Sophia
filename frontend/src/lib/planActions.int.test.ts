import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthedTestUser } from "../test/supabaseTestUtils";
import { distributePlanActions } from "./planActions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { GeneratedPlan } from "../types/dashboard";

describe("integration: distributePlanActions()", () => {
  let userId: string;
  let client: SupabaseClient;

  beforeEach(async () => {
    const res = await createAuthedTestUser();
    userId = res.userId;
    client = res.client;
    // distributePlanActions uses the module-level `supabase` singleton, so we must auth it too.
    await supabase.auth.setSession({ access_token: res.accessToken, refresh_token: res.refreshToken });
  });

  afterEach(async () => {
    // Best-effort cleanup for local runs. (Auth user rows may remain; that's OK locally.)
    try {
      await client.from("user_plans").delete().eq("user_id", userId);
      await client.from("user_actions").delete().eq("user_id", userId);
      await client.from("user_framework_tracking").delete().eq("user_id", userId);
      await client.from("user_vital_signs").delete().eq("user_id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("écrit actions/frameworks/vital en DB avec les bons statuts", async () => {
    // 1) Create a minimal plan row (FK target for actions/frameworks/vitals)
    const planContent: GeneratedPlan = {
      grimoireTitle: "Test Plan",
      strategy: "Test Strategy",
      phases: [
        {
          id: 1,
          title: "Phase 1",
          subtitle: "Sub",
          status: "active",
          actions: [
            {
              id: "a1",
              type: "habitude",
              title: "Boire de l'eau",
              description: "1 verre au réveil",
              isCompleted: false,
              tracking_type: "boolean",
              time_of_day: "morning",
              targetReps: 7,
            },
            {
              id: "a2",
              type: "mission",
              title: "Acheter une gourde",
              description: "Une gourde de 1L",
              isCompleted: false,
              tracking_type: "boolean",
              time_of_day: "any_time",
            },
            {
              id: "a3",
              type: "framework",
              title: "Journal 3 lignes",
              description: "Écrire 3 lignes",
              isCompleted: false,
              tracking_type: "boolean",
              time_of_day: "evening",
              targetReps: 7,
              frameworkDetails: { type: "recurring", intro: "Intro", sections: [{ id: "s1", label: "Q", inputType: "text" }] },
            },
          ],
        },
      ],
      // IMPORTANT: le code actuel cherche vitalSignal.name/label (pas vitalSignal.title)
      vitalSignal: {
        name: "Sommeil (heures)",
        unit: "h",
        startValue: "7",
        targetValue: "8",
        tracking_type: "counter",
        type: "number",
      },
    };

    const { data: planRow, error: planErr } = await client
      .from("user_plans")
      .insert({ user_id: userId, content: planContent, status: "active", title: "Test Plan" })
      .select("id")
      .single();
    if (planErr) throw planErr;

    const planId = planRow.id as string;

    // 2) Run the same code path the frontend uses
    await distributePlanActions(userId, planId, null, planContent);

    // 3) Assert DB effects
    const { data: actions, error: actionsErr } = await client
      .from("user_actions")
      .select("title,status,tracking_type,time_of_day")
      .eq("plan_id", planId)
      .order("title", { ascending: true });
    if (actionsErr) throw actionsErr;

    expect(actions).toHaveLength(2);
    expect((actions as Array<{ status: string }>).map((a) => a.status)).toEqual(["active", "active"]);

    const { data: frameworks, error: fwErr } = await client
      .from("user_framework_tracking")
      .select("title,status,tracking_type")
      .eq("plan_id", planId);
    if (fwErr) throw fwErr;

    expect(frameworks).toHaveLength(1);
    expect(frameworks[0].status).toBe("active"); // phase.status = active => actions are active unless explicitly pending

    const { data: vitals, error: vitalsErr } = await client
      .from("user_vital_signs")
      .select("label,status,tracking_type")
      .eq("plan_id", planId);
    if (vitalsErr) throw vitalsErr;

    expect(vitals).toHaveLength(1);
    expect(vitals[0].status).toBe("active");
    expect(vitals[0].label).toContain("Sommeil");
  });

  it("force pending pour toute action/framework d'une phase locked (même si le JSON dit active)", async () => {
    const planContent: GeneratedPlan = {
      grimoireTitle: "Test Plan 2",
      strategy: "Test Strategy",
      phases: [
        {
          id: 1,
          title: "Phase 1",
          subtitle: "Sub",
          status: "active",
          actions: [
            {
              id: "p1_a1",
              type: "habitude",
              title: "P1 Habitude",
              description: "Desc",
              isCompleted: false,
              tracking_type: "boolean",
              time_of_day: "morning",
              targetReps: 3,
            },
            {
              id: "p1_a2",
              type: "mission",
              title: "P1 Mission",
              description: "Desc",
              isCompleted: false,
              tracking_type: "boolean",
              time_of_day: "any_time",
            },
          ],
        },
        {
          id: 2,
          title: "Phase 2",
          subtitle: "Sub",
          status: "locked",
          actions: [
            {
              id: "p2_a1",
              type: "habitude",
              title: "P2 Habitude (should be pending)",
              description: "Desc",
              isCompleted: false,
              status: "active", // malicious / buggy upstream
              tracking_type: "boolean",
              time_of_day: "evening",
              targetReps: 3,
            } as any,
            {
              id: "p2_fw1",
              type: "framework",
              title: "P2 Framework (should be pending)",
              description: "Desc",
              isCompleted: false,
              status: "active", // malicious / buggy upstream
              tracking_type: "boolean",
              time_of_day: "evening",
              targetReps: 1,
              frameworkDetails: { type: "one_shot", intro: "Intro", sections: [{ id: "s1", label: "Q", inputType: "text" }] },
            } as any,
          ],
        },
      ],
      vitalSignal: {
        name: "Sommeil (heures)",
        unit: "h",
        startValue: "7",
        targetValue: "8",
        tracking_type: "counter",
        type: "number",
      },
    };

    const { data: planRow, error: planErr } = await client
      .from("user_plans")
      .insert({ user_id: userId, content: planContent, status: "active", title: "Test Plan 2" })
      .select("id")
      .single();
    if (planErr) throw planErr;
    const planId = planRow.id as string;

    await distributePlanActions(userId, planId, null, planContent);

    const { data: actionRows, error: actionsErr } = await client
      .from("user_actions")
      .select("title,status")
      .eq("plan_id", planId);
    if (actionsErr) throw actionsErr;

    const byTitle = new Map((actionRows ?? []).map((r: any) => [r.title, r.status]));
    expect(byTitle.get("P1 Habitude")).toBe("active");
    expect(byTitle.get("P1 Mission")).toBe("active");
    expect(byTitle.get("P2 Habitude (should be pending)")).toBe("pending");

    const { data: fwRows, error: fwErr } = await client
      .from("user_framework_tracking")
      .select("title,status,action_id")
      .eq("plan_id", planId);
    if (fwErr) throw fwErr;

    const fwByTitle = new Map((fwRows ?? []).map((r: any) => [r.title, r.status]));
    expect(fwByTitle.get("P2 Framework (should be pending)")).toBe("pending");
  });
});


