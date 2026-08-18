import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// LA RÉGRESSION: un rythme ENREGISTRÉ s'affichait décoché.
//
// `/app/plan` rendait ses cartes dès le premier rendu, avec `goal === null`.
// `EatingRhythmCard` fige son brouillon à son montage, donc il se montait sur
// un tableau vide et rien ne le rattrapait quand la lecture arrivait. L'élève
// voyait « Nothing ticked » sur un rythme qui existait — et le Save d'à côté
// l'écrasait.
//
// Ce test lit ce que l'ÉLÈVE voit, pas ce que le composant croit: les cases.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON =
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const EMAIL = process.env.E2E_STUDENT_EMAIL || "qa0805.a13.s1@keeltest.dev";
const PASSWORD = process.env.E2E_STUDENT_PASSWORD || "1234567";

test("a saved eating rhythm shows up ticked on load", async ({ page }) => {
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signInErr) throw signInErr;
  const session = signIn.session!;
  const uid = signIn.user!.id;

  // Le rythme est écrit PAR L'API, exactement comme la carte l'écrit.
  const { data: before } = await anon
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", uid)
    .single();
  const pc = (before?.practical_constraints ?? {}) as Record<string, unknown>;
  const { error: writeErr } = await anon
    .from("student_goals")
    .update({
      practical_constraints: {
        ...pc,
        eating_rhythm: [
          { slot: "breakfast", size: null },
          { slot: "lunch", size: null },
          { slot: "snack_pm", size: "small" },
        ],
      },
    })
    .eq("user_id", uid);
  if (writeErr) throw writeErr;

  // La session est posée avant tout rendu: le but est de voir le PREMIER
  // affichage de la page, c'est là que le défaut vivait.
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  await page.addInitScript(
    ([storageKey, value]) => {
      window.localStorage.setItem(storageKey as string, value as string);
    },
    [
      `sb-${ref}-auth-token`,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: "bearer",
        user: session.user,
      }),
    ],
  );

  await page.goto("/app/plan");

  // LA PAGE DIT CE QUI EST ENREGISTRÉ, SANS RIEN OUVRIR.
  // Depuis le 2026-08-07 les quatre questions vivent dans une fenêtre, et la
  // page ne garde qu'une carte de résumé — une ligne par section.
  await expect(page.getByText("Breakfast · Lunch · Afternoon (small)")).toBeVisible({
    timeout: 15_000,
  });

  // Dans la fenêtre, les cases doivent porter ce même rythme — c'est CE point
  // qui cassait, et c'est ce qu'un Save posé par-dessus écrasait.
  await page.getByRole("button", { name: /^(Change|Set up)$/ }).first().click();

  const boxes = page.locator("#eating-rhythm-editor").getByRole("checkbox");
  await expect(boxes.nth(0)).toBeChecked(); // Breakfast
  await expect(boxes.nth(1)).not.toBeChecked(); // Mid-morning
  await expect(boxes.nth(2)).toBeChecked(); // Lunch
  await expect(boxes.nth(3)).toBeChecked(); // Afternoon
  await expect(boxes.nth(4)).not.toBeChecked(); // Dinner
  await expect(boxes.nth(5)).not.toBeChecked(); // Before bed
  await expect(page.getByText("Nothing ticked.")).toHaveCount(0);
});
