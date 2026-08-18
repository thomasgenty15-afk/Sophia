// PREUVE CIBLÉE — LOT L2: le consommateur est ATTEINT.
//
// `computeAndStoreWeekReview` est la fonction que le cron du dimanche
// (`keel-weekly-flow-v1/index.ts:285`) appelle avant d'envoyer le point hebdo.
// Ce fichier la rejoue sur la BASE LOCALE VIVANTE avec de vraies séances, et
// vérifie que le compte est bien GELÉ dans `weekly_reviews.week_facts.activity`.
//
// Ce qu'il prouve, et ce qu'il ne prouve pas: il prouve que la chaîne
// table → loadWeekFacts → computeWeekReview → writeWeekFacts fonctionne de bout
// en bout sur du vrai SQL. Il ne rejoue pas la SÉLECTION du cron (dimanche dans
// le fuseau de l'élève, plan actif, mute), qui est indépendante de ce lot.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { computeAndStoreWeekReview } from "../supabase/functions/_shared/keel/week_review_io.ts";

function env(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

Deno.test("L2: le compte de séances est gelé dans weekly_reviews.week_facts", async () => {
  const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/, "");
  const anon = createClient(supabaseUrl, env("VITE_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nonce = crypto.randomUUID().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const { error: suErr } = await anon.auth.signUp({
    email: `l2.consumer+${nonce}@example.com`,
    password: "TestPassword!123",
  });
  if (suErr) throw suErr;
  const { data: signIn, error: siErr } = await anon.auth.signInWithPassword({
    email: `l2.consumer+${nonce}@example.com`,
    password: "TestPassword!123",
  });
  if (siErr) throw siErr;
  const userId = signIn.user!.id as string;

  const weekStart = "2026-08-10";
  const weekEnd = "2026-08-16";

  try {
    // Trois séances sur deux jours, dont une sans durée ni intensité.
    const { error: insErr } = await admin.from("student_activity_sessions").insert([
      {
        user_id: userId,
        local_date: "2026-08-10",
        kind: "strength",
        duration_min: 45,
        intensity: "hard",
        source: "app",
      },
      {
        user_id: userId,
        local_date: "2026-08-10",
        kind: "mobility",
        duration_min: 20,
        intensity: "easy",
        source: "app",
      },
      {
        user_id: userId,
        local_date: "2026-08-13",
        kind: "cardio",
        source: "chat",
      },
      // HORS FENÊTRE: elle ne doit pas être comptée.
      {
        user_id: userId,
        local_date: "2026-08-09",
        kind: "cardio",
        duration_min: 60,
        intensity: "moderate",
        source: "app",
      },
    ]);
    if (insErr) throw insErr;

    // ── LE GESTE DU CRON DU DIMANCHE ────────────────────────────────────────
    const result = await computeAndStoreWeekReview(admin, {
      userId,
      weekStart,
      weekEnd,
      contentLocale: "fr-FR",
      now: new Date("2026-08-16T18:00:00Z"),
    });
    assertEquals(result.outcome, "computed", JSON.stringify(result));

    assertEquals(result.reading?.activity, {
      sessions: 3,
      days: 2,
      minutes: 65,
      minutesFrom: 2,
      byIntensity: { easy: 1, moderate: 0, hard: 1, undeclared: 1 },
    });

    // ── ET C'EST BIEN GELÉ EN BASE ──────────────────────────────────────────
    const { data, error } = await admin
      .from("weekly_reviews")
      .select("week_facts")
      .eq("user_id", userId)
      .eq("week_start_date", weekStart)
      .is("plan_version_id", null)
      .maybeSingle();
    if (error) throw error;
    const frozen = (data as { week_facts: Record<string, unknown> } | null)?.week_facts;
    assert(frozen, "aucun week_facts gelé");
    assertEquals(
      (frozen as { activity: unknown }).activity,
      {
        sessions: 3,
        days: 2,
        minutes: 65,
        minutesFrom: 2,
        byIntensity: { easy: 1, moderate: 0, hard: 1, undeclared: 1 },
      },
    );

    // ⛔ AUCUNE ÉNERGIE DANS LE GEL.
    const serialized = JSON.stringify(frozen).toLowerCase();
    for (const forbidden of ["kcal", "calorie", "burn"]) {
      assert(!serialized.includes(forbidden), `le gel porte « ${forbidden} »`);
    }

    // ── ISOLATION: LE FILTRE `.eq('user_id')` EST BIEN PORTÉ ────────────────
    // Ce chargeur tourne en service_role, où RLS ne s'applique pas. On sème
    // une séance chez QUELQU'UN D'AUTRE dans la même fenêtre; le recalcul doit
    // rendre exactement le même compte.
    const { data: other, error: otherErr } = await anon.auth.signUp({
      email: `l2.other+${nonce}@example.com`,
      password: "TestPassword!123",
    });
    if (otherErr) throw otherErr;
    const otherId = other.user!.id as string;
    try {
      await admin.from("student_activity_sessions").insert({
        user_id: otherId,
        local_date: "2026-08-11",
        kind: "cardio",
        duration_min: 90,
        intensity: "hard",
        source: "app",
      });
      const again = await computeAndStoreWeekReview(admin, {
        userId,
        weekStart,
        weekEnd,
        contentLocale: "fr-FR",
        now: new Date("2026-08-16T18:00:00Z"),
      });
      assertEquals(
        again.reading?.activity?.sessions,
        3,
        "les séances d'un autre élève ont fui dans ce bilan",
      );
    } finally {
      await admin.auth.admin.deleteUser(otherId).catch(() => {});
    }
  } finally {
    // Exception QA d'AGENTS.md: on ne supprime QUE ce que CE run a créé.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
});
