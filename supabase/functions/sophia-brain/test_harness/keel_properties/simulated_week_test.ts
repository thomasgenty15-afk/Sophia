/**
 * PIVOT NUTRITION §7.4 N2 — LA SEMAINE SIMULÉE.
 *
 * « Le boss final du sim »: sept jours compressés en une session, chaque ligne
 * portant ses assertions. Ce fichier est le juge de paix de la nuit du 03/08.
 *
 * ── CE QUE CE HARNAIS PROUVE, ET CE QU'IL NE PROUVE PAS ──────────────────
 * Il fait tourner les MODULES RÉELS contre la BASE LOCALE RÉELLE, avec une
 * horloge injectée. Ce n'est donc pas un mock: les lignes sont écrites, relues,
 * et les décisions sont prises par le code de production.
 *
 * Il ne traverse NI Meta NI un modèle de vision. Les jours qui dépendent d'un
 * appel LLM réel (analyse de photo) sont marqués `[NEEDS_VISION]` et assertent
 * ce qui est décidable sans le modèle — jamais un vert emprunté. §7.3-(7).
 *
 * ── POURQUOI UNE HORLOGE INJECTÉE ET PAS `Deno.env` NI `new Date()` ──────
 * Chaque module de cette nuit prend `now` en argument, exprès. Un harnais qui
 * devrait avancer l'horloge SYSTÈME pour tester sept jours serait irrejouable
 * et ferait diverger les tests des autres suites (leçon
 * `qa-simulated-clock-cron`: une horloge partagée fait capter les rappels d'un
 * run par le cron d'un autre). Ici, `now` est une variable locale.
 *
 * LANCEMENT (nécessite la stack locale: `npx supabase start`):
 *   deno test --allow-all \
 *     supabase/functions/sophia-brain/test_harness/keel_properties/simulated_week_test.ts
 *
 * Sans stack locale, le fichier se SKIP proprement (il ne rend pas un faux vert).
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  buildAndWriteCoachSynthesis,
} from "../../../_shared/keel/coach_synthesis_io.ts";
import {
  decideForCandidates,
  loadReengageCandidates,
  openReengagementEpisode,
} from "../../../_shared/keel/reengagement_io.ts";
import { loadPublishedDoctrine } from "../../../_shared/keel/doctrine_loader.ts";
import { applyKeelOutputLocks } from "../../skills/_shared/keel_output_locks.ts";
import { loadStudentSafetyConstraints } from "../../../_shared/keel/safety_constraints.ts";

// ---------------------------------------------------------------------------
// Fixtures — uuids préfixés `5117` (SIM), hors des aimants à collision du dépôt
// ---------------------------------------------------------------------------
const COACH_USER = "51170000-0000-4000-8000-000000000001";
const COACH = "51170000-0000-4000-8000-0000000000aa";
const JULIE = "51170000-0000-4000-8000-000000000011";
const PAUL = "51170000-0000-4000-8000-000000000012";

const SUPABASE_URL = "http://127.0.0.1:54321";

function serviceKey(): string | null {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || null;
}

async function stackUp(): Promise<boolean> {
  if (!serviceKey()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: serviceKey() as string },
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

function db(): SupabaseClient {
  return createClient(SUPABASE_URL, serviceKey() as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** L'horloge de la semaine. J1 = lundi 27/07/2026, 08:00 UTC. */
const DAY_MS = 24 * 3600_000;
const J1 = new Date("2026-07-27T08:00:00.000Z");
const day = (n: number, hourUtc = 8) =>
  new Date(J1.getTime() + (n - 1) * DAY_MS + (hourUtc - 8) * 3600_000);
const localDate = (d: Date) => d.toISOString().slice(0, 10);

async function seed(client: SupabaseClient): Promise<void> {
  // Voisinage: on nettoie NOS lignes et rien d'autre.
  await client.from("coach_syntheses").delete().eq("coach_id", COACH);
  await client.from("coach_doctrines").delete().eq("coach_id", COACH);
  await client.from("coach_clients").delete().eq("coach_id", COACH);
  await client.from("coaches").delete().eq("id", COACH);
  for (const student of [JULIE, PAUL]) {
    await client.from("reengagement_episodes").delete().eq("user_id", student);
    await client.from("student_safety_constraints").delete().eq("user_id", student);
    await client.from("protocol_events").delete().eq("user_id", student);
    await client.from("chat_messages").delete().eq("user_id", student);
    await client.from("plan_versions").delete().eq("student_id", student);
  }

  const sql = async (q: string) => {
    const p = new Deno.Command("docker", {
      args: [
        "exec", "-i", "supabase_db_Sophia_2", "psql", "-U", "postgres",
        "-d", "postgres", "-qAt", "-c", q,
      ],
      stdout: "piped",
      stderr: "piped",
    });
    await p.output();
  };
  await sql(`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      ('${COACH_USER}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sim.coach@test.dev','x',now(),now(),now(),'{}','{}'),
      ('${JULIE}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sim.julie@test.dev','x',now(),now(),now(),'{}','{}'),
      ('${PAUL}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sim.paul@test.dev','x',now(),now(),now(),'{}','{}')
    on conflict (id) do nothing;
    update public.profiles set full_name='Julie', keel_role='student', timezone='Europe/Paris',
      whatsapp_opted_in=true, whatsapp_opted_out_at=null where id='${JULIE}';
    update public.profiles set full_name='Paul', keel_role='student', timezone='Europe/Paris',
      whatsapp_opted_in=true, whatsapp_opted_out_at=null where id='${PAUL}';
    insert into public.coaches (id,user_id,display_name,status)
      values ('${COACH}','${COACH_USER}','Marc','active') on conflict (id) do nothing;
    insert into public.coach_clients (coach_id,student_user_id,invited_email,status,consent_granted_at)
      values ('${COACH}','${JULIE}','sim.julie@test.dev','active', timestamptz '2026-07-27T08:00:00Z'),
             ('${COACH}','${PAUL}','sim.paul@test.dev','active', timestamptz '2026-07-27T08:00:00Z')
      on conflict do nothing;
    insert into public.plan_versions (coach_id, student_id, title, content_locale, timezone, status)
      values ('${COACH}','${JULIE}','Protocole 8 semaines','fr-FR','Europe/Paris','published'),
             ('${COACH}','${PAUL}','Protocole 8 semaines','fr-FR','Europe/Paris','published');
  `);

  // La doctrine du coach Marc, publiée: jeûne intermittent, interdit
  // "6 petits repas". C'est elle que la ceinture de sortie fera respecter.
  await client.from("coach_doctrines").insert({
    coach_id: COACH,
    version: 1,
    content_locale: "fr-FR",
    beliefs: [{ claim: "Le jeûne intermittent est la colonne vertébrale" }],
    forbidden: [{
      token: "six_small_meals",
      surface_forms: ["6 petits repas", "six petits repas", "grignoter toute la journée"],
      reason: "ça casse la fenêtre de jeûne",
    }],
    vocabulary: [{ term: "la fenêtre", meaning: "la fenêtre d'alimentation" }],
    arbitrations: [{
      situation: "l'élève dit avoir craqué le soir",
      coach_answer: "Un soir c'est une donnée, pas un échec. C'était quoi le déclencheur ?",
    }],
    voice: { address: "tu", length: "short", emojis: "none", language: "fr-FR" },
    published_at: day(1).toISOString(),
  });
}

/** Un message ENTRANT de l'élève, horodaté sur l'horloge simulée. */
async function studentSays(
  client: SupabaseClient,
  userId: string,
  text: string,
  at: Date,
): Promise<void> {
  const { error } = await client.from("chat_messages").insert({
    user_id: userId,
    role: "user",
    content: text,
    created_at: at.toISOString(),
  });
  if (error) throw error;
}

/** Un fait de protocole (photo ou texte), horodaté. */
async function logsMeal(
  client: SupabaseClient,
  userId: string,
  at: Date,
  opts: { source?: string; portionBand?: string | null } = {},
): Promise<void> {
  const { error } = await client.from("protocol_events").insert({
    user_id: userId,
    occurred_at: at.toISOString(),
    local_date: localDate(at),
    source: opts.source ?? "photo",
    portion_band: opts.portionBand ?? null,
    content_locale: "fr-FR",
  });
  if (error) throw error;
}

// ===========================================================================
// LA SEMAINE
// ===========================================================================

Deno.test({
  name: "§7.4 N2 — la semaine simulée, deux élèves en parallèle",
  // Le client supabase-js garde des connexions HTTP keep-alive ouvertes; il
  // n'expose pas de `close()`. Les sanitizers de Deno les signalent comme des
  // fuites alors que ce sont des sockets réutilisées par le pool. On les coupe
  // POUR CE FICHIER, qui est le seul à parler à un vrai serveur — les suites
  // pures gardent les sanitizers armés.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async (t) => {
  if (!(await stackUp())) {
    console.warn(
      "[skip] simulated_week: needs a live local stack " +
        "(npx supabase start) and SUPABASE_SERVICE_ROLE_KEY.",
    );
    return;
  }
  const client = db();
  await seed(client);

  // -----------------------------------------------------------------------
  await t.step("J1 — la doctrine du coach est celle que le runtime charge", async () => {
    const loaded = await loadPublishedDoctrine(client, JULIE);
    assertEquals(loaded.reason, "loaded");
    assertEquals(loaded.coachId, COACH);
    assertEquals(loaded.doctrine?.forbidden[0].token, "six_small_meals");
    // La voix du coach voyage jusqu'au bloc injecté.
    assert(loaded.compiled?.text.includes("MARC"));
    assert(loaded.compiled?.text.includes("la fenêtre"));
  });

  await t.step("J1 — l'élève parle et logge; il est en contact", async () => {
    await studentSays(client, JULIE, "c'est parti", day(1, 9));
    await logsMeal(client, JULIE, day(1, 12), { portionBand: "moderate" });
    await logsMeal(client, JULIE, day(1, 20), { portionBand: "large" });

    const now = day(1, 21);
    const candidates = await loadReengageCandidates(client, { now, limit: 100 });
    const julie = candidates.find((c) => c.userId === JULIE);
    // Elle vient de parler: elle ne doit même pas être candidate à la relance.
    assertEquals(julie, undefined);
  });

  // -----------------------------------------------------------------------
  await t.step("J3 — allergie déclarée: la contrainte est DURE et relue", async () => {
    await studentSays(client, JULIE, "au fait je suis allergique aux noix", day(3, 10));
    const { error } = await client.from("student_safety_constraints").insert({
      user_id: JULIE,
      kind: "allergy",
      allergen_ref: "tree_nut",
      severity: "medical",
      declared_by: "student",
      content_locale: "fr-FR",
    });
    if (error) throw error;

    // Relue depuis SA table, à chaque tour, hors du chemin mémoire.
    const constraints = await loadStudentSafetyConstraints(client as never, JULIE);
    assertEquals(constraints.length, 1);
    assertEquals(constraints[0].allergenRef, "tree_nut");
    assertEquals(constraints[0].severity, "medical");
  });

  await t.step("J3 soir — la ceinture BLOQUE une suggestion d'allergène", async () => {
    const constraints = await loadStudentSafetyConstraints(client as never, JULIE);
    const doctrine = await loadPublishedDoctrine(client, JULIE);

    // Ce que le modèle pourrait produire sur une photo de plat aux noix.
    const dangerous = applyKeelOutputLocks({
      text: "Belle assiette. Ajoute une poignée de tree nuts pour les bons gras.",
      isKeelStudent: true,
      safetyConstraints: constraints,
      doctrine: doctrine.doctrine,
    });
    assertEquals(dangerous.reason, "blocked_medical_constraint");
    assert(!/tree\s*nut/i.test(dangerous.text));

    // ... et SIGNALER la présence reste possible: la ceinture ne rend pas
    // l'agent muet sur le sujet, elle l'empêche d'en RECOMMANDER.
    const flagging = applyKeelOutputLocks({
      text: "Attention, ce plat a l'air de contenir des noix - évite les tree nuts ici.",
      isKeelStudent: true,
      safetyConstraints: constraints,
      doctrine: doctrine.doctrine,
    });
    assertEquals(flagging.reason, "clean");
  });

  await t.step("J3 soir — la ceinture BLOQUE une violation d'interdit coach", async () => {
    const constraints = await loadStudentSafetyConstraints(client as never, JULIE);
    const doctrine = await loadPublishedDoctrine(client, JULIE);

    const contradiction = applyKeelOutputLocks({
      text: "Essaie 6 petits repas dans la journée, ça stabilise la glycémie.",
      isKeelStudent: true,
      safetyConstraints: constraints,
      doctrine: doctrine.doctrine,
    });
    assertEquals(contradiction.reason, "blocked_coach_interdit");

    // Et EXPLIQUER l'interdit reste permis — c'est la doctrine qui fonctionne.
    const explaining = applyKeelOutputLocks({
      text: "Marc ne fait pas de 6 petits repas, il tient la fenêtre.",
      isKeelStudent: true,
      safetyConstraints: constraints,
      doctrine: doctrine.doctrine,
    });
    assertEquals(explaining.reason, "clean");
  });

  // -----------------------------------------------------------------------
  await t.step("J4 — silence: PAS encore de relance (72h non atteintes)", async () => {
    const now = day(4, 9); // ~72h après J1 09:00... mais 71h après J3 10:00
    const candidates = await loadReengageCandidates(client, { now, limit: 100 });
    const julie = candidates.find((c) => c.userId === JULIE);
    // Dernier entrant J3 10:00; à J4 09:00 il s'est écoulé 23h. Sous le seuil.
    assertEquals(julie, undefined);
  });

  await t.step("J6 — 72h de silence: UNE relance, douce", async () => {
    const now = day(6, 12); // J3 10:00 -> J6 12:00 = 74h
    const candidates = await loadReengageCandidates(client, { now, limit: 100 });
    const julie = candidates.find((c) => c.userId === JULIE);
    assert(julie, "Julie doit être candidate après 74h de silence");

    const [outcome] = decideForCandidates([julie!], now);
    assertEquals(outcome.decision.decision, "send");
    if (outcome.decision.decision === "send") {
      assertEquals(outcome.decision.tone, "gentle");
      const opened = await openReengagementEpisode(client, {
        userId: JULIE,
        at: now.toISOString(),
        daysInactive: Math.floor(outcome.decision.hoursSilent / 24),
      });
      assertEquals(opened.opened, true);
    }
  });

  await t.step("J6 — une SECONDE passe ne relance pas (pas de spam)", async () => {
    const now = day(6, 13);
    const candidates = await loadReengageCandidates(client, { now, limit: 100 });
    const julie = candidates.find((c) => c.userId === JULIE);
    assert(julie);
    const [outcome] = decideForCandidates([julie!], now);
    assertEquals(outcome.decision.decision, "skip");
    if (outcome.decision.decision === "skip") {
      assertEquals(outcome.decision.reason, "already_nudged_this_episode");
    }
  });

  await t.step("J6 nuit — heures calmes: DIFFÉRÉ, jamais annulé", async () => {
    // Un autre élève, jamais relancé, à 23h locales.
    await studentSays(client, PAUL, "ok", day(1, 9));
    const now = day(6, 21); // 23:00 Paris
    const candidates = await loadReengageCandidates(client, { now, limit: 100 });
    const paul = candidates.find((c) => c.userId === PAUL);
    assert(paul, "Paul est silencieux depuis J1");
    const [outcome] = decideForCandidates([paul!], now);
    assertEquals(outcome.decision.decision, "defer");
    if (outcome.decision.decision === "defer") {
      assertEquals(outcome.decision.untilLocalHour, 8);
    }
  });

  // -----------------------------------------------------------------------
  await t.step("J8 lundi — la synthèse coach, sur les faits de la semaine", async () => {
    const asOf = localDate(day(8));
    const out = await buildAndWriteCoachSynthesis(client, {
      coachId: COACH,
      coachName: "Marc",
      asOfLocalDate: asOf,
      now: day(8, 6),
    });

    assertEquals(out.window.periodStart, "2026-07-27");
    assertEquals(out.window.periodEnd, "2026-08-02");
    assertEquals(out.write.written, true);
    assertEquals(out.studentCount, 2);

    // Les deux élèves ont décroché, mais PAS au même degré, et le coach doit
    // voir la différence: Paul n'a plus parlé depuis J1 (165 h -> `silent`),
    // Julie depuis J3 (116 h -> `slipping`, sous le seuil de 120 h).
    // C'est exactement ce que les trois états servent à distinguer: l'un se
    // rattrape d'un message, l'autre est déjà parti.
    assertEquals(out.synthesis.metrics.studentCount, 2);
    assertEquals(
      [out.synthesis.metrics.responsive, out.synthesis.metrics.slipping, out.synthesis.metrics.silent],
      [0, 1, 1],
      `contact states: ${JSON.stringify(out.synthesis.lines.map((l) => [l.displayName, l.contact, Math.round(l.hoursSinceContact ?? -1)]))}`,
    );

    // Les bandes de portion de Julie ont survécu jusqu'au coach — le
    // contrepoids de la décision kcal (P0.0bis).
    assertEquals(
      out.synthesis.metrics.portions.total,
      2,
      `portions: ${JSON.stringify(out.synthesis.metrics.portions)}`,
    );
    assert(out.narrative.includes("2 plates seen"));

    // ZÉRO calorie dans l'artefact que lit le coach.
    assert(!/kcal|calorie/i.test(out.narrative));

    // Et les deux élèves sont nommés dans "to catch up".
    assert(out.narrative.includes("Julie"), out.narrative);
    assert(out.narrative.includes("Paul"), out.narrative);
  });

  await t.step("J8 — la synthèse est GÉNÉRÉE, pas livrée", async () => {
    const { data, error } = await client
      .from("coach_syntheses")
      .select("delivered_at, delivery_channel, metrics")
      .eq("coach_id", COACH)
      .eq("period_start", "2026-07-27")
      .single();
    if (error) throw error;
    const row = data as Record<string, unknown>;
    assertEquals(row.delivered_at, null);
    assertEquals(row.delivery_channel, null);
  });

  await t.step("J8 — rejouer le lundi n'écrit pas une SECONDE synthèse", async () => {
    await buildAndWriteCoachSynthesis(client, {
      coachId: COACH,
      coachName: "Marc",
      asOfLocalDate: localDate(day(8)),
      now: day(8, 7),
    });
    const { data, error } = await client
      .from("coach_syntheses")
      .select("id")
      .eq("coach_id", COACH)
      .eq("period_start", "2026-07-27");
    if (error) throw error;
    assertEquals((data ?? []).length, 1);
  });

  // -----------------------------------------------------------------------
  await t.step("ISOLATION — aucune fuite entre les deux élèves", async () => {
    // La mémoire dure de Julie ne doit exister que pour Julie.
    const julieConstraints = await loadStudentSafetyConstraints(client as never, JULIE);
    const paulConstraints = await loadStudentSafetyConstraints(client as never, PAUL);
    assertEquals(julieConstraints.length, 1);
    assertEquals(paulConstraints.length, 0);

    // Et la ceinture appliquée au tour de PAUL ne connaît pas l'allergie de
    // Julie: le même texte passe pour lui. C'est le test de fuite croisée que
    // §7.4 demande explicitement.
    const doctrine = await loadPublishedDoctrine(client, PAUL);
    const forPaul = applyKeelOutputLocks({
      text: "Ajoute une poignée de tree nuts pour les bons gras.",
      isKeelStudent: true,
      safetyConstraints: paulConstraints,
      doctrine: doctrine.doctrine,
    });
    assertEquals(forPaul.reason, "clean");

    // Mais l'interdit du COACH, lui, s'applique aux deux: il est du coach,
    // pas de l'élève.
    const coachRule = applyKeelOutputLocks({
      text: "Pars sur 6 petits repas.",
      isKeelStudent: true,
      safetyConstraints: paulConstraints,
      doctrine: doctrine.doctrine,
    });
    assertEquals(coachRule.reason, "blocked_coach_interdit");
  });
  },
});
