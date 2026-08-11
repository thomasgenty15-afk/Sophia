// AGENT 13 — LE CYCLE DE VIE RGPD DES TABLES DU PIVOT : créer → exporter →
// supprimer → vérifier.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// `account_export_test.ts` et `account_deletion_test.ts` couvrent le socle
// historique (cycles, plans, conversations, WhatsApp). Aucun des deux ne sait
// que le pivot nutrition a ajouté onze tables. Mesuré le 2026-08-03 sur un
// élève « plein » : l'export rendait `tables_indisponibles: []` — donc « rien
// ne manque » — alors que son objectif, son plan de la semaine, ses taps du
// soir, ses repas récurrents, ses préférences, ses cartes et ses idées de repas
// n'avaient jamais été interrogés.
//
// La leçon est structurelle, pas ponctuelle : une table s'ajoute en une
// migration, et rien dans le dépôt ne la réclame au cycle de vie. Ce test est
// la réclamation. La liste `PIVOT_TABLES` ci-dessous est le contrat : ajouter
// une table au produit sans l'ajouter ici est possible ; l'ajouter ici sans la
// câbler dans l'export ou la purge ne l'est pas.
//
// CE QUI EST VÉRIFIÉ, DANS CET ORDRE
//   1. l'élève « plein » a bien une ligne dans CHAQUE table (sinon on
//      prouverait qu'un export vide exporte bien du vide) ;
//   2. l'archive contient chaque marqueur semé, table par table ;
//   3. après suppression + purge J+7 forcée, CHAQUE table rend 0 ligne ;
//   4. la synthèse du coach SURVIT, mais sans l'uuid ni le nom de l'élève —
//      et la ligne « à rattraper » est toujours là, anonyme.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { unzipSync } from "npm:fflate@0.8.2";

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim().length === 0) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

// Même porte d'intégration que ses deux voisins : sans stack vivante ces cas
// SAUTENT, ils n'échouent pas. Un filet en permanence rouge n'est plus lu.
const REQUIRED_ENV = [
  "SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const MISSING_ENV = REQUIRED_ENV.filter((n) =>
  (Deno.env.get(n) ?? "").trim().length === 0
);
const SKIP_INTEGRATION = MISSING_ENV.length > 0;
if (SKIP_INTEGRATION) {
  console.log(
    `[skip] keel_gdpr_lifecycle_test.ts: needs a live Supabase stack — missing env: ${
      MISSING_ENV.join(", ")
    }`,
  );
}

const PASSWORD = "TestPassword!123";

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
}

function internalSecret(): string {
  return (Deno.env.get("MEGA_INTERNAL_SECRET") ?? "").trim() ||
    (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim() ||
    (Deno.env.get("SECRET_KEY") ?? "").trim();
}

function clients() {
  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { supabaseUrl, anonKey, anon, admin };
}

async function callFn(
  supabaseUrl: string,
  anonKey: string,
  name: string,
  accessToken: string,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function callInternal(
  supabaseUrl: string,
  anonKey: string,
  name: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "x-internal-secret": internalSecret(),
    },
    body: "{}",
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/**
 * LE CONTRAT. Une entrée = une table du pivot, la colonne qui porte l'élève, et
 * le marqueur unique semé dedans. Le marqueur est ce qui rend l'assertion
 * d'export INCONTOURNABLE : chercher une chaîne dans l'archive ne peut pas
 * passer par accident, là où compter des clés JSON le peut.
 */
const PIVOT_TABLES = [
  { table: "student_goals", owner: "user_id", marker: "A13SEED-OBJECTIF" },
  { table: "student_week_plans", owner: "user_id", marker: "A13SEED-SEMAINE" },
  { table: "student_daily_checkins", owner: "user_id", marker: null },
  // FF-027 — la faim déclarée en conversation. Elle porte LES MOTS DE L'ÉLÈVE,
  // donc elle doit sortir dans l'archive et disparaître à la purge, comme le
  // reste. Une table neuve que le lifecycle ne réclame pas est une cicatrice
  // connue de ce dépôt.
  {
    table: "student_hunger_reports",
    owner: "user_id",
    marker: "A13SEED-FAIM",
  },
  { table: "recurring_meals", owner: "user_id", marker: "A13SEED-REPAS" },
  { table: "student_facts", owner: "user_id", marker: "A13SEED-AVERSION" },
  // `student_cards`, `card_armings`, `card_wins`: droppées par 20260808070000
  // (retrait résidus grand public) — leurs marqueurs sont partis avec elles.
  { table: "meal_ideas", owner: "student_id", marker: "A13SEED-IDEE" },
  { table: "protocol_events", owner: "user_id", marker: "A13SEED-PHOTO" },
  { table: "weekly_reviews", owner: "user_id", marker: "A13SEED-BILAN" },
  // FF-031 — les mesures corporelles datées. Donnée personnelle de santé, et
  // elle porte LES MOTS DE L'ÉLÈVE quand la pesée a été dite en conversation.
  // Réclamée ici dans le même lot que sa migration: c'est la troisième table du
  // pivot que ce fichier a dû rattraper après coup, et la cicatrice est connue.
  {
    table: "student_body_measures",
    owner: "user_id",
    marker: "A13SEED-PESEE",
  },
  {
    table: "student_safety_constraints",
    owner: "user_id",
    marker: "A13SEED-ALLERGIE",
  },
  { table: "chat_messages", owner: "user_id", marker: "A13SEED-MESSAGE" },
  { table: "upcoming_contexts", owner: "user_id", marker: "A13SEED-CONTEXTE" },
  // FF-056 — les épisodes de divergence. Donnée personnelle de santé: elle dit
  // que le poids de quelqu'un n'a pas suivi son plan, et pourquoi (catégorie).
  //
  // ⚠️ ELLE N'A PAS DE MARQUEUR TEXTUEL, ET C'EST UNE PROPRIÉTÉ, PAS UN OUBLI:
  // la table ne stocke AUCUNE prose de l'élève, seulement un token d'une liste
  // fermée (fiche §5 — « stocker les mots de quelqu'un qui explique pourquoi il
  // n'a pas perdu de poids créerait un dossier »). Le contrôle qui compte pour
  // elle est donc la PURGE, pas la présence d'une chaîne dans l'archive.
  //
  // 🔴 DÉPENDANCE BLOQUÉE, NOMMÉE: le raccord d'EXPORT vit dans
  // `supabase/functions/account-export-v1/index.ts`, fichier réservé à une
  // autre session au moment de ce lot. Le diff exact est dans
  // `scratchpad/RAPPORT-FF-056.md`. La purge, elle, est déjà garantie par
  // `on delete cascade` et prouvée dans la migration (bloc (j)).
  {
    table: "student_weight_divergence_episodes",
    owner: "user_id",
    marker: null,
  },
] as const;

/** Remplit chaque table de PIVOT_TABLES pour `userId`. Renvoie l'id du coach. */
async function seedFullStudent(
  admin: any,
  anon: any,
  userId: string,
): Promise<string> {
  const nonce = makeNonce();

  // Le coach : il porte la synthèse qui doit survivre à la purge, anonymisée.
  // Créé par `signUp` et non par l'API admin d'auth : `admin.createUser` exige
  // une clé que GoTrue accepte, et une stack locale à clés asymétriques rejette
  // la clé service_role historique. `signUp` marche partout.
  const { data: coachSignUp, error: coachErr } = await anon.auth.signUp({
    email: `a13.coach+${nonce}@example.com`,
    password: PASSWORD,
  });
  if (coachErr) throw coachErr;
  const coachUserId = coachSignUp.user!.id as string;

  const { data: coach, error } = await admin.from("coaches").insert({
    user_id: coachUserId,
    display_name: "Coach A13",
    status: "active",
  }).select("id").single();
  if (error) throw error;
  const coachId = coach.id as string;
  const { error: linkErr } = await admin.from("coach_clients").insert({
    coach_id: coachId,
    student_user_id: userId,
    status: "active",
    consent_granted_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  });
  if (linkErr) throw linkErr;

  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await admin.from(table).insert(row).select("id")
      .single();
    if (error) throw new Error(`seed ${table}: ${error.message}`);
    return data.id as string;
  };

  await ins("student_goals", {
    user_id: userId,
    goal: "fat_loss",
    situation: "A13SEED-OBJECTIF",
    content_locale: "fr-FR",
  });
  await ins("student_week_plans", {
    user_id: userId,
    week_start: "2026-08-03",
    items: [{
      kind: "nutrition",
      label: "A13SEED-SEMAINE",
      source_belief_key: "b1",
      source_belief_claim: "proteine d abord",
      days: ["mon"],
    }],
    status: "draft",
    content_locale: "fr-FR",
  });
  await ins("student_daily_checkins", {
    user_id: userId,
    local_date: "2026-08-03",
    overall: "hard",
    axis: "hunger",
    source: "whatsapp_button",
  });
  await ins("student_hunger_reports", {
    user_id: userId,
    local_date: "2026-08-04",
    source: "chat",
    matched: "j ai eu faim",
    student_note: "A13SEED-FAIM",
    content_locale: "fr-FR",
  });
  await ins("recurring_meals", {
    user_id: userId,
    label: "A13SEED-REPAS",
    slot_key: "breakfast",
    status: "candidate",
    content_locale: "fr-FR",
  });
  await ins("student_facts", {
    user_id: userId,
    kind: "aversion",
    value: { label: "brocoli" },
    note: "A13SEED-AVERSION",
    content_locale: "fr-FR",
  });
  await ins("protocol_events", {
    user_id: userId,
    occurred_at: new Date().toISOString(),
    local_date: "2026-08-03",
    slot_key: "breakfast",
    source: "photo",
    student_note: "A13SEED-PHOTO",
    media_path: `${userId}/2026-08-03/a13.jpg`,
    content_locale: "fr-FR",
  });
  await ins("weekly_reviews", {
    user_id: userId,
    week_start_date: "2026-08-03",
    biofeedback: {
      energy: 4,
      hunger: 2,
      sleep: 3,
      digestion: 4,
      mood: 3,
      training: 5,
    },
    student_narrative: "A13SEED-BILAN",
    content_locale: "fr-FR",
  });
  await ins("student_body_measures", {
    user_id: userId,
    measured_at: "2026-08-05T07:12:00Z",
    local_date: "2026-08-05",
    kind: "weight",
    value_si: 78.4,
    source: "chat",
    student_note: "A13SEED-PESEE",
    content_locale: "fr-FR",
  });
  await ins("student_safety_constraints", {
    user_id: userId,
    kind: "allergy",
    allergen_ref: "peanut",
    severity: "medical",
    declared_by: "student",
    notes: "A13SEED-ALLERGIE",
    content_locale: "fr-FR",
  });
  await ins("chat_messages", {
    user_id: userId,
    role: "user",
    content: "A13SEED-MESSAGE",
    scope: "whatsapp",
  });
  await ins("upcoming_contexts", {
    user_id: userId,
    local_date: "2026-08-05",
    kind: "restaurant",
    source: "chat",
    note: "A13SEED-CONTEXTE",
    content_locale: "fr-FR",
  });

  // FF-056 — un épisode de divergence. Aucune prose de l'élève: la table ne
  // porte qu'une catégorie d'une liste fermée, et c'est voulu (§5).
  await ins("student_weight_divergence_episodes", {
    user_id: userId,
    state: "nothing_to_change",
    category: "not_a_divergence",
    detector_version: "ff056.v1",
    shape: "moving_away",
    goal_direction: "down",
    plan_fingerprint: "a13-fp",
    opened_local_date: "2026-08-05",
    closed_at: new Date().toISOString(),
    content_locale: "fr-FR",
  });

  await ins("meal_ideas", {
    author_kind: "coach",
    coach_id: coachId,
    student_id: userId,
    title: "A13SEED-IDEE",
    slot_key: "breakfast",
    content_locale: "fr-FR",
    status: "active",
  });

  return coachId;
}

Deno.test(
  "RGPD pivot: un élève plein est exporté en entier, puis ne laisse plus une ligne",
  { ignore: SKIP_INTEGRATION },
  async () => {
    Deno.env.set("MEGA_TEST_MODE", "1");
    const { supabaseUrl, anonKey, anon, admin } = clients();

    const nonce = makeNonce();
    const email = `a13.lifecycle+${nonce}@example.com`;
    const { error: signUpErr } = await anon.auth.signUp({
      email,
      password: PASSWORD,
    });
    if (signUpErr) throw signUpErr;
    const { data: signIn, error: signInErr } = await anon.auth
      .signInWithPassword({
        email,
        password: PASSWORD,
      });
    if (signInErr) throw signInErr;
    const userId = signIn.user!.id as string;
    const accessToken = signIn.session!.access_token as string;

    await admin.from("profiles").update({
      full_name: `Eleve A13 ${nonce}`,
      timezone: "Europe/Paris",
    }).eq("id", userId);

    const coachId = await seedFullStudent(admin, anon, userId);
    const studentName = `Eleve A13 ${nonce}`;

    // La synthèse du coach qui NOMME l'élève : c'est elle qui doit survivre
    // anonymisée, pas disparaître.
    const { data: syn0, error: synErr } = await admin.from("coach_syntheses")
      .insert({
        coach_id: coachId,
        kind: "weekly",
        period_start: "2026-07-27",
        period_end: "2026-08-02",
        metrics: { student_count: 1 },
        flagged_students: [{
          student_user_id: userId,
          reason_code: "silent_5d",
        }],
        narrative: `To catch up:\n- ${studentName}: no message for 5 days.`,
        content_locale: "fr-FR",
      }).select("id").single();
    if (synErr) throw synErr;
    const synthesisId = syn0.id as string;

    // ---- 1. La fixture est bien pleine (sinon on exporterait du vide) -------
    for (const t of PIVOT_TABLES) {
      const { count, error } = await admin
        .from(t.table)
        .select("id", { count: "exact", head: true })
        .eq(t.owner, userId);
      if (error) throw error;
      assert(
        (count ?? 0) >= 1,
        `fixture: ${t.table} devrait porter au moins 1 ligne`,
      );
    }

    // ---- 2. L'EXPORT contient chaque marqueur ------------------------------
    const exp = await callFn(
      supabaseUrl,
      anonKey,
      "account-export-v1",
      accessToken,
      {
        password: PASSWORD,
      },
    );
    assertEquals(exp.status, 200, JSON.stringify(exp.json));
    const zipRes = await fetch(
      String(exp.json.url).replace("http://kong:8000", supabaseUrl),
    );
    assertEquals(zipRes.status, 200, "l'URL signée doit rendre l'archive");
    const files = unzipSync(new Uint8Array(await zipRes.arrayBuffer()));
    const decoder = new TextDecoder();
    const archive = Object.entries(files)
      .filter(([name]) => name.endsWith(".json"))
      .map(([, bytes]) => decoder.decode(bytes))
      .join("\n");

    const missing = PIVOT_TABLES
      .filter((t) => t.marker !== null && !archive.includes(t.marker!))
      .map((t) => t.table);
    assertEquals(
      missing,
      [],
      `tables absentes de l'archive: ${missing.join(", ")}`,
    );
    // La table sans prose se prouve par son vocabulaire propre.
    assert(
      archive.includes("whatsapp_button"),
      "student_daily_checkins absent de l'archive",
    );
    // Et l'archive ne doit PAS mentir sur ce qui manque.
    const manifest = JSON.parse(decoder.decode(files["fichiers.json"]));
    assertEquals(
      manifest.tables_indisponibles,
      [],
      "aucune table ne devrait être signalée indisponible sur une stack à jour",
    );

    // ---- 3. SUPPRESSION + PURGE J+7 forcée ---------------------------------
    const prepare = await callFn(
      supabaseUrl,
      anonKey,
      "account-deletion-v1",
      accessToken,
      {
        action: "prepare",
        password: PASSWORD,
      },
    );
    assertEquals(prepare.status, 200, JSON.stringify(prepare.json));
    const confirm = await callFn(
      supabaseUrl,
      anonKey,
      "account-deletion-v1",
      accessToken,
      {
        action: "confirm",
        token: prepare.json.token,
        typed_confirmation: "DELETE",
      },
    );
    assertEquals(confirm.status, 200, JSON.stringify(confirm.json));

    await admin.from("profiles").update({
      purge_at: new Date(Date.now() - 60_000).toISOString(),
    }).eq("id", userId);

    const purge = await callInternal(
      supabaseUrl,
      anonKey,
      "purge-deleted-accounts",
    );
    assertEquals(purge.status, 200, JSON.stringify(purge.json));
    assertEquals(
      purge.json?.errors?.length ?? 0,
      0,
      JSON.stringify(purge.json?.errors),
    );

    // ---- 4. PLUS UNE LIGNE, table par table --------------------------------
    const survivors: string[] = [];
    for (const t of PIVOT_TABLES) {
      const { count, error } = await admin
        .from(t.table)
        .select("id", { count: "exact", head: true })
        .eq(t.owner, userId);
      if (error) throw error;
      if ((count ?? 0) > 0) survivors.push(`${t.table}=${count}`);
    }
    assertEquals(survivors, [], `lignes survivantes: ${survivors.join(", ")}`);

    const { data: profileAfter } = await admin
      .from("profiles").select("id").eq("id", userId).maybeSingle();
    assertEquals(profileAfter, null, "le profil doit avoir disparu");

    // Les compteurs de limitation de débit (aucune FK, donc aucune cascade).
    const { count: rateLeft } = await admin
      .from("rate_limit_counters")
      .select("bucket_key", { count: "exact", head: true })
      .like("bucket_key", `%${userId}%`);
    assertEquals(
      rateLeft ?? 0,
      0,
      "les compteurs de rate-limit doivent partir aussi",
    );

    // ---- 5. LA RÉFÉRENCE QUI SURVIT EST ANONYME ----------------------------
    {
      const { data: syn, error } = await admin
        .from("coach_syntheses")
        .select("id,narrative,flagged_students,metrics")
        .eq("id", synthesisId)
        .maybeSingle();
      if (error) throw error;
      assert(syn, "la synthèse du coach doit SURVIVRE à la purge de l'élève");
      assert(
        !JSON.stringify(syn!.flagged_students).includes(userId),
        "l'uuid de l'élève purgé ne doit plus figurer dans flagged_students",
      );
      assert(
        !String(syn!.narrative ?? "").includes(studentName),
        "le nom de l'élève purgé ne doit plus figurer dans la prose",
      );
      // Le rapport garde son COMPTE : la ligne « à rattraper » est toujours là,
      // sans identité. Sans ça la semaine relue dirait 0 élève à rattraper.
      const flagged = (syn!.flagged_students ?? []) as Array<
        Record<string, unknown>
      >;
      assertEquals(
        flagged.length,
        1,
        "la ligne agrégée ne doit pas disparaître",
      );
      assertEquals(flagged[0].student_purged, true);
      assertEquals(flagged[0].reason_code, "silent_5d");
      assertEquals(flagged[0].student_user_id, null);
    }
  },
);
