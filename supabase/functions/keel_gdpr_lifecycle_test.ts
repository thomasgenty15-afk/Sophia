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
  // LE LOG DE SÉANCE (2026-08-18, migration 20260818180000). Ce que quelqu'un
  // a fait de son corps, quel jour et combien de temps: donnée personnelle au
  // sens plein, elle sort dans l'archive et disparaît à la purge.
  //
  // ⚠️ PAS DE MARQUEUR TEXTUEL, ET C'EST UNE PROPRIÉTÉ DE LA TABLE: elle ne
  // stocke AUCUNE prose — que des jetons de listes fermées, une date et une
  // durée. Et surtout AUCUN chiffre d'énergie, par décision chiffrée (voir
  // l'en-tête de la migration). Elle se prouve donc par son VOCABULAIRE PROPRE
  // (`mobility`), exactement comme `student_daily_checkins` se prouve par
  // `whatsapp_button` — l'assertion est plus bas, à côté de la sienne.
  { table: "student_activity_sessions", owner: "user_id", marker: null },
  // FF-027 — la faim déclarée en conversation. Elle porte LES MOTS DE L'ÉLÈVE,
  // donc elle doit sortir dans l'archive et disparaître à la purge, comme le
  // reste. Une table neuve que le lifecycle ne réclame pas est une cicatrice
  // connue de ce dépôt.
  {
    table: "student_hunger_reports",
    owner: "user_id",
    marker: "A13SEED-FAIM",
  },
  // ⛔ `recurring_meals` et `student_facts` ONT ÉTÉ RETIRÉES D'ICI LE
  // 2026-08-22, et le motif est le défaut que ce fichier répare, pris par le
  // haut au lieu du bas: elles sont DROPPÉES depuis le 2026-08-03
  // (`20260803161000_drop_dead_soft_memory_tables.sql`) et cette liste écrite
  // à la main les réclamait encore. Le décor les semait, donc ce test ne
  // pouvait PAS tourner — une liste à la main se périme dans les deux sens, et
  // celui-ci était devenu INEXÉCUTABLE sans que rien ne le dise.
  // L'export les traite déjà comme vides, sans sonder la base.
  // `student_cards`, `card_armings`, `card_wins`: droppées par 20260808070000
  // (retrait résidus grand public) — leurs marqueurs sont partis avec elles.
  // ⛔ `meal_ideas` A ÉTÉ RETIRÉE D'ICI LE 2026-08-22, ET C'EST LA TROISIÈME
  // FORME DE PÉREMPTION D'UNE LISTE ÉCRITE À LA MAIN — celle qu'aucune des
  // deux autres n'attrape: la table EXISTE, mais SA COLONNE DE PROPRIÉTAIRE
  // n'existe plus. `meal_ideas.student_id` a été droppée le 2026-08-04
  // (`20260804210000_coach_recipe_library.sql`): la bibliothèque de recettes
  // est désormais GLOBALE, elle appartient au coach, et AUCUNE colonne ne
  // relie plus une recette à un élève. L'export l'avait retirée le jour même;
  // ce fichier la réclamait encore, et levait
  // `Could not find the 'student_id' column of 'meal_ideas'`.
  //
  // Le filet plus bas assert maintenant que CHAQUE colonne de propriétaire
  // existe dans l'inventaire — c'est ce qui aurait dit cette panne.
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
  // `mobility` n'apparaît nulle part ailleurs dans l'archive d'un élève: c'est
  // le vocabulaire propre de cette table, et c'est ce qui sert de marqueur.
  await ins("student_activity_sessions", {
    user_id: userId,
    local_date: "2026-08-04",
    kind: "mobility",
    duration_min: 41,
    intensity: "easy",
    source: "app",
  });
  await ins("student_hunger_reports", {
    user_id: userId,
    local_date: "2026-08-04",
    source: "chat",
    matched: "j ai eu faim",
    student_note: "A13SEED-FAIM",
    content_locale: "fr-FR",
  });
  // ⛔ LES DEUX SEMIS DE `recurring_meals` ET `student_facts` SONT PARTIS AVEC
  // LEURS TABLES (droppées le 2026-08-03). Ils levaient `seed recurring_meals:
  // relation does not exist` à la première ligne — donc CE TEST NE POUVAIT PAS
  // TOURNER, et le seul filet RGPD du dépôt était inexécutable sans que rien
  // ne le dise.
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
    assert(
      archive.includes("mobility"),
      "student_activity_sessions absent de l'archive",
    );
    // ET L'ARCHIVE NE PORTE AUCUN CHIFFRE D'ÉNERGIE SUR CES LIGNES. La table
    // n'a pas de colonne de calories, par décision chiffrée (20260818180000):
    // ce contrôle tomberait le jour où quelqu'un l'ajouterait sans rouvrir
    // l'arbitrage.
    const activityRows = JSON.parse(decoder.decode(files["mon_plan.json"]))
      ?.seances_dactivite;
    assert(
      Array.isArray(activityRows) && activityRows.length >= 1,
      "les séances doivent être une liste non vide dans mon_plan.json",
    );
    for (const row of activityRows) {
      for (const key of Object.keys(row)) {
        assert(
          !/kcal|calorie|energy|burn/i.test(key),
          `la séance exportée porte une colonne d'énergie: ${key}`,
        );
      }
    }
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

// ===========================================================================
// S5 — LE FILET CESSE D'ÊTRE UNE LISTE ÉCRITE À LA MAIN
//
// ── LE DÉFAUT QUE CE BLOC RÉPARE, ET C'EST CELUI DE SON PROPRE FICHIER ─────
//
// `PIVOT_TABLES` ci-dessus est une liste écrite à la main. Elle a fermé neuf
// trous et elle en laisse ouverts tous les autres, pour une raison
// structurelle et non ponctuelle:
//
//     UNE TABLE ABSENTE DE LA LISTE NE ROUGIT JAMAIS.
//
// Mesuré le 2026-08-22 (lot `S5`): **126** tables de base dans `public`,
// **15** citées par ce fichier, donc **111** hors de tout contrôle — dont
// `household_member_allergies` et `household_food_restrictions`, qui portent
// des données de SANTÉ, y compris de mineurs, y compris de bouches qui n'ont
// jamais eu de compte.
//
// Et la liste ne se périme pas seulement par le bas: `recurring_meals` et
// `student_facts` y figuraient encore alors qu'elles sont DROPPÉES depuis le
// 2026-08-03 (`20260803161000`). Une liste à la main porte donc les deux
// erreurs à la fois — des tables qu'elle ne connaît pas, et des tables qui
// n'existent plus.
//
// ── ET LE MÊME DÉFAUT SE REJOUE UN CRAN PLUS BAS, PAR COLONNE ─────────────
//
// `account-export-v1` lit chaque table par une allowlist de COLONNES, elle
// aussi écrite à la main. Mesuré le même jour: **145** colonnes hors
// allowlist sur **35** des 38 tables lues. Fermer les tables sans fermer les
// colonnes reviendrait à fermer la porte en laissant la fenêtre.
//
// ── CE QUE CE BLOC EXIGE ──────────────────────────────────────────────────
//
//   1. CHAQUE table de `public` est classée: réclamée, ou nommée dans une
//      classe explicite avec sa raison. Une table neuve n'est dans aucune des
//      deux ⇒ ROUGE.
//   2. AUCUN FANTÔME: une table nommée ici qui n'existe pas dans le schéma
//      ⇒ ROUGE. C'est ce qui aurait attrapé `recurring_meals`.
//   3. CHAQUE colonne d'une table réclamée est soit exportée, soit NOMMÉE
//      comme exclue. Une colonne neuve dans aucune des deux ⇒ ROUGE.
//   4. La dette de la classe `A_QUALIFIER` ne GRANDIT pas.
// ===========================================================================

/**
 * ⚠️ LES TABLES RÉCLAMÉES, LUES DANS LE CODE ET PAS RECOPIÉES ICI.
 *
 * Recopier la liste des lectures de l'export dans ce fichier reproduirait très
 * exactement le défaut qu'il répare: deux listes à la main qui divergent au
 * premier ajout. Le couple `(table, clé d'allowlist)` est donc EXTRAIT de
 * `account-export-v1/index.ts`, et le nombre d'appels trouvés est asserté —
 * une lecture qui changerait de forme rendrait ce filet aveugle en silence.
 */
const EXPORT_INDEX = new URL(
  "./account-export-v1/index.ts",
  import.meta.url,
);
const EXPORT_CALL_RE =
  /fetch(?:KeelRows|AllRows|RowsByIdChunks)\(\s*\n?\s*admin,\s*\n?\s*"([a-z_]+)",\s*\n?\s*SCOPE\.(\w+)/g;
/** Le minimum d'appels que le filet DOIT trouver. Mesuré: 41 le 2026-08-22. */
const MIN_EXPORT_CALLS = 38;

async function exportReads(): Promise<Map<string, string>> {
  const src = await Deno.readTextFile(EXPORT_INDEX);
  const found = new Map<string, string>();
  let hits = 0;
  for (const m of src.matchAll(EXPORT_CALL_RE)) {
    hits++;
    found.set(m[1], m[2]);
  }
  assert(
    hits >= MIN_EXPORT_CALLS,
    `seulement ${hits} lectures d'export reconnues (< ${MIN_EXPORT_CALLS}): ` +
      `la forme des appels a changé et ce filet ne voit plus ce qu'il garde.`,
  );
  // `profiles` est lu EN LIGNE, pas par SCOPE: il a son propre extracteur,
  // sinon la table qui porte le nom, la date de naissance et le PAYS serait la
  // seule à échapper au contrôle par colonne.
  //
  // ⚠️ IL CONCATÈNE LES LITTÉRAUX, il ne lit pas UNE chaîne. La première
  // version cherchait `.select("…")` d'un seul tenant; le jour où la liste est
  // passée sur trois lignes avec des `+`, elle a matché une AUTRE lecture de
  // `profiles` et rendu un filet vert sur des colonnes qu'il ne voyait plus.
  // Une garde qui trouve « quelque chose » ressemble trait pour trait à une
  // garde qui trouve la bonne chose.
  const at = src.indexOf('.from("profiles")');
  assert(at >= 0, "la lecture en ligne de `profiles` a disparu");
  const selectAt = src.indexOf(".select(", at);
  assert(selectAt > at, "la lecture en ligne de `profiles` a perdu son select");
  // ⚠️ BORNÉ PAR LA PARENTHÈSE FERMANTE, pas par le `;` de la requête. Un
  // scan qui allait jusqu'au point-virgule ramassait AUSSI le `"id"` du
  // `.eq("id", user.id)` juste après, et le collait à la dernière colonne:
  // `proactive_muted_at` devenait `proactive_muted_atid` et se dénonçait
  // comme muette. Le bug était dans le FILET, pas dans l'export.
  let depth = 0;
  let selectEnd = -1;
  for (let i = selectAt + ".select".length; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) {
        selectEnd = i;
        break;
      }
    }
  }
  assert(selectEnd > selectAt, "le `.select(` de `profiles` n'est pas fermé");
  const literals = [
    ...src.slice(selectAt, selectEnd).matchAll(/"([^"]*)"/g),
  ].map((m) => m[1]).join("");
  assert(
    literals.includes("full_name") && literals.includes("proactive_muted_at"),
    "la lecture en ligne de `profiles` n'est plus reconnue: ce filet ne " +
      "contrôle plus les colonnes de la table qui porte le nom et le pays.",
  );
  found.set("profiles", `@inline:${literals}`);
  return found;
}

/**
 * LES TABLES QUE LE CYCLE DE VIE NE RÉCLAME PAS, ET POURQUOI.
 *
 * ⚠️ CHAQUE CLASSE EST UNE AFFIRMATION, PAS UN TIROIR. Ranger une table ici
 * la déclare propre; s'en servir pour faire taire le filet serait exactement
 * la faute qu'il existe pour empêcher. C'est pour ça que `A_QUALIFIER` existe:
 * une table qui porte de la donnée personnelle et n'est PAS réclamée y est
 * NOMMÉE, comptée, et sa dette ne peut que descendre.
 */
const NON_RECLAMEES: Record<string, string[]> = {
  // Aucune ligne n'appartient à un compte: ce sont des référentiels partagés.
  // Les exporter mettrait le catalogue du produit dans l'archive de quelqu'un.
  "referentiel — aucune ligne n'appartient a un compte": [
    "app_config",
    "crisis_resources",
    "food_composition_aliases",
    "food_composition_pending",
    "food_composition_refs",
    "food_groups",
    "food_items",
    "food_price_group_bands",
    "food_price_pending",
    "llm_pricing",
    "slot_vocabulary",
    "substance_interactions",
    "substance_limits",
    "substances",
  ],
  // Écrites par le serveur, sans valeur de portabilité, et emportées par la
  // cascade ou par un TTL. Un export qui les porterait rendrait des traces
  // machine à quelqu'un qui demande ses données.
  "journal serveur — purge par cascade ou TTL, aucune portabilite": [
    "account_security_confirmations",
    "confirmation_tokens_consumed",
    "conversation_eval_events",
    "conversation_eval_judge_jobs",
    "conversation_eval_runs",
    "conversation_runtime_events",
    "conversation_turn_traces",
    "deletion_records",
    "inbound_dedup",
    "internal_admins",
    "llm_raw_response_events",
    "llm_retry_jobs",
    "llm_usage_events",
    "memory_change_log",
    "memory_eval_annotations",
    "memory_extraction_runs",
    "memory_message_processing",
    "memory_observability_events",
    "memory_weekly_review_runs",
    "proactive_job_state",
    "rate_limit_counters",
    "scheduled_checkins_delete_audit",
    "stripe_webhook_events",
    "system_error_logs",
    "system_runtime_snapshots",
    "turn_summary_logs",
    "user_cycle_drafts",
    "whatsapp_cost_events",
  ],
  // Produit DÉRIVÉ d'une ligne déjà exportée, ou compteur de quota. Les
  // exporter rendrait deux fois la même chose, dont une fois en langage
  // machine.
  "derive ou quota — la source est deja reclamee": [
    "coach_doctrine_compilations",
    "coach_billing_periods",
    "household_billing_periods",
    "household_merge_quota",
    "subscription_notifications",
  ],
  // ⛔ LA DETTE, NOMMÉE. Ces tables portent de la donnée personnelle et ne
  // sont réclamées NI par l'export NI par ce filet. Les ranger ailleurs serait
  // un mensonge; les réclamer toutes dans ce lot serait un lot différent. Le
  // compte est plafonné plus bas: il ne peut que descendre.
  "A_QUALIFIER — porte de la donnee personnelle, NON reclamee": [
    "coach_food_items",
    "coach_food_rules",
    "coach_protocols",
    "coach_terms",
    "coach_timing_rules",
    "coach_broadcasts",
    "coaches",
    "communication_logs",
    "conversation_scope_memories",
    "cooking_session_states",
    "grocery_wave_states",
    "household_envy_submissions",
    "household_invitations",
    "household_merge_settings",
    "household_traditions",
    "households",
    "meal_ideas",
    "meal_plan_feedback",
    "memory_item_action_occurrences",
    "memory_item_actions",
    "memory_item_entities",
    "memory_item_sources",
    "memory_item_topics",
    "outbound_messages",
    "pending_actions",
    "reengagement_episodes",
    "scheduled_checkins",
    "student_daily_recommendations",
    "subscriptions",
    "user_chat_states",
    "user_entities",
    "user_framework_entries",
    "user_profile_facts",
    "user_relation_preferences",
    "user_topic_keywords",
    "user_topic_memories",
    "vocabulary_extension_requests",
  ],
};

/** Plafond de la dette, MESURÉ le 2026-08-22 (38, puis 37 quand FF-056 a été
 * raccordée dans ce lot même). Il ne peut que DESCENDRE. */
const A_QUALIFIER_MAX = 37;
const A_QUALIFIER_KEY =
  "A_QUALIFIER — porte de la donnee personnelle, NON reclamee";

/**
 * LES COLONNES QUI NE SORTENT PAS, TABLE PAR TABLE, AVEC LEUR RAISON.
 *
 * ⚠️ C'EST LA MOITIÉ QUE LA v1 DU LOT N'AVAIT PAS. Fermer les tables sans
 * fermer les colonnes laisse la fenêtre: une colonne s'ajoute en une
 * migration, l'allowlist ne bouge pas, et rien ne le dit. Mesuré: 145
 * colonnes dans ce cas le 2026-08-22, dont deux que la migration du lot 18
 * déclarait exportées.
 */
const HORS_EXPORT: Record<string, [string[], string][]> = {
  profiles: [
    [
      ["id", "created_at", "updated_at", "phone_verified_at", "purge_at"],
      "cles et horodatages de cycle de vie du compte, deja rendus ailleurs",
    ],
    [
      [
        "whatsapp_opted_in",
        "whatsapp_last_inbound_at",
        "whatsapp_last_outbound_at",
        "whatsapp_optin_sent_at",
        "whatsapp_bilan_opted_in",
        "whatsapp_opted_out_at",
        "whatsapp_optout_reason",
        "whatsapp_optout_confirmed_at",
        "whatsapp_state",
        "whatsapp_state_updated_at",
        "whatsapp_bilan_paused_until",
        "whatsapp_bilan_missed_streak",
        "whatsapp_bilan_last_prompt_at",
        "whatsapp_bilan_winback_step",
        "whatsapp_bilan_last_winback_at",
        "whatsapp_coaching_paused_until",
        "phone_invalid",
      ],
      "canal WhatsApp GELE (de-whatsapp, 2026-08-04) — l'etat d'un canal qui " +
        "n'a plus aucun ecrivain; l'export rend le reglage REEL de relances",
    ],
    [
      [
        "trial_start",
        "trial_end",
        "stripe_customer_id",
        "access_tier",
        "account_status",
        "deletion_requested_at",
        "pre_deletion_proactive_muted",
        "keel_role",
        "onboarding_completed",
      ],
      "etat de compte et d'abonnement — rendu par l'app, ce n'est pas une " +
        "donnee que la personne a declaree",
    ],
    [
      [
        "install_app_dismissed_until",
        "install_app_marked_installed_at",
        "install_app_last_prompted_at",
        "morning_active_action_checkins_seeded_at",
        "activity_axes_asked_at",
        "chat_last_inbound_at",
        "chat_last_outbound_at",
        "chat_last_read_at",
        "tz_follow_device",
        "energy_display_enabled",
        "energy_target_enabled",
      ],
      "cadence d'ecran et reglages d'affichage — quand une question a ete " +
        "POSEE, pas ce qui a ete repondu",
    ],
    [
      ["avatar_url"],
      "⚠️ DETTE NOMMEE: chemin d'une image de profil, dont le bucket n'est " +
        "pas parcouru par `collectStorageFiles`. Rendre le chemin sans les " +
        "octets donnerait une reference morte",
    ],
  ],
  memory_items: [
    [["user_id"], "cle de proprietaire — redondante avec l'archive elle-meme"],
    [
      [
        "confidence",
        "importance_score",
        "sensitivity_level",
        "sensitivity_categories",
        "requires_user_initiated",
      ],
      "scores et classifications internes — classe exclue par l'en-tete",
    ],
    [
      ["embedding", "embedding_model", "canonical_key", "source_hash"],
      "artefacts machine — illisibles, et sans valeur de portabilite",
    ],
    [
      [
        "status",
        "structured_data",
        "domain_keys",
        "source_message_id",
        "source_scope",
        "time_precision",
        "timezone",
        "valid_from",
        "valid_until",
        "superseded_by_item_id",
        "extraction_run_id",
        "last_retrieved_at",
        "version",
        "metadata",
        "updated_at",
      ],
      "plomberie du magasin de memoire — l'export rend la memoire ACTIVE",
    ],
  ],
  chat_messages: [[
    ["id", "user_id", "agent_used", "metadata"],
    "cles internes et routage — le message lui-meme sort en entier",
  ]],
  plan_templates: [[["coach_id"], "sa propre cle — c'est SON export"]],
  plan_documents: [
    [["coach_id"], "sa propre cle"],
    [
      ["ocr_result", "layout_probe", "updated_at"],
      "artefacts de lecture machine — le PDF source part dans l'archive",
    ],
  ],
  plan_versions: [[
    ["coach_id", "student_id", "template_id", "published_by", "updated_at"],
    "cles de tiers et de plomberie",
  ]],
  plan_commitments: [[
    ["user_id", "coach_id", "template_commitment_key", "updated_at"],
    "cles de tiers et de plomberie",
  ]],
  protocol_events: [
    [["user_id"], "sa propre cle"],
    [
      ["recognition_confidence", "evidence_weight", "portion_band"],
      "scores internes — classe exclue par l'en-tete",
    ],
    [
      [
        "source_message_id",
        "disqualified_reason",
        "media_sha256",
        "analyzed_at",
        "plan_relation",
      ],
      "correlation interne du pipeline photo",
    ],
  ],
  commitment_evaluations: [[
    ["user_id", "confidence", "source_event_ids", "updated_at"],
    "sa propre cle, un score interne, et la plomberie",
  ]],
  planned_deviations: [[["user_id"], "sa propre cle"]],
  upcoming_contexts: [[["user_id"], "sa propre cle"]],
  meal_precision_questions: [[
    ["user_id", "asked_for_message_id", "ask_kind"],
    "sa propre cle et la correlation interne de la question",
  ]],
  student_body_measures: [[["user_id"], "sa propre cle"]],
  weekly_reviews: [
    [["user_id", "updated_at"], "sa propre cle et la plomberie"],
    [
      ["risk_band", "top_failing_commitment_id"],
      "classification interne — nommee dans l'en-tete",
    ],
    [
      ["coach_draft_reply"],
      "brouillon NON ENVOYE du coach — ce n'est pas la donnee de l'eleve",
    ],
    [
      ["week_facts", "week_facts_computed_at"],
      "instantane de calcul interne, recalculable a partir des lignes exportees",
    ],
  ],
  contract_change_requests: [[
    ["user_id", "sophia_evidence"],
    "sa propre cle et l'instantane d'evidences internes (ids + scores)",
  ]],
  student_safety_constraints: [[["user_id"], "sa propre cle"]],
  coach_clients: [[
    ["updated_at", "cohort_id", "scheduled_end_at", "billing_interval"],
    "plomberie de siege et de facturation, pas la relation elle-meme",
  ]],
  coach_invitations: [[
    ["invite_token_hash"],
    "⛔ HASH D'UN IDENTIFIANT VIVANT — il ne doit JAMAIS entrer dans une archive",
  ]],
  student_goals: [[["user_id"], "sa propre cle"]],
  student_week_plans: [[["user_id"], "sa propre cle"]],
  student_daily_checkins: [[["user_id"], "sa propre cle"]],
  student_activity_sessions: [[["user_id"], "sa propre cle"]],
  student_hunger_reports: [[["user_id"], "sa propre cle"]],
  student_generated_meals: [
    [["user_id", "household_id"], "sa propre cle et celle de son foyer"],
    [
      ["member_portions"],
      "⚠️ LES PARTS DES AUTRES BOUCHES — meme regle que `household_members`: " +
        "l'export RGPD de l'un ne divulgue pas les autres",
    ],
  ],
  student_meal_documents: [[["user_id"], "sa propre cle"]],
  student_weight_divergence_episodes: [[["user_id"], "sa propre cle"]],
  meal_composition_verdicts: [[["user_id"], "sa propre cle"]],
  // A8.2 — `declared_by` vaut son id a CHAQUE ligne: la rendre ajouterait son
  // identifiant N fois sans rien lui apprendre. C'est la colonne PAR LAQUELLE
  // l'export filtre, donc sa valeur est connue d'avance. `member_id`, lui,
  // SORT: il dit DE QUELLE bouche on parle, et c'est la seule chose qui
  // distingue la boite de l'un de celle de l'autre sur les lignes qu'il a
  // ecrites pour une bouche sans compte.
  meal_share_outcomes: [[["declared_by"], "sa propre cle"]],
  coach_doctrines: [
    [["coach_id"], "sa propre cle"],
    [
      ["compiled_prompt", "compiled_prompt_hash"],
      "bloc de prompt assemble et sa cle de cache — classe « no system prompts »",
    ],
    [["published_by"], "id d'un tiers"],
    [
      [
        "foods",
        "qa",
        "daily_practices",
        "composition_steering",
        "composition_positions",
        "activity_stance",
      ],
      "⚠️ DETTE NOMMEE: ce sont SES convictions, ecrites par lui, et elles ne " +
        "sortent pas. A reclamer dans le lot qui rouvre l'export cote coach",
    ],
  ],
  cohorts: [[["coach_id"], "sa propre cle"]],
  coach_syntheses: [[
    ["coach_id", "flagged_students", "narrative"],
    "sa propre cle, et deux colonnes qui NOMMENT d'autres personnes",
  ]],
  coach_food_proposals: [[["coach_id"], "sa propre cle"]],
  coach_documents: [[["coach_id"], "sa propre cle"]],
  coach_document_chunks: [[["coach_id"], "sa propre cle"]],
  coach_document_citations: [[["coach_id"], "sa propre cle"]],
  household_members: [[["user_id"], "sa propre cle"]],
  household_member_bodies: [
    [
      ["household_id", "recorded_by"],
      "deja dans `household_members`, et l'id du compte qui a saisi",
    ],
    [
      [
        "activity_axes_asked_at",
        "meal_structure_asked_at",
        "appetite_asked_at",
      ],
      "cadence d'ecran — quand la question a ete posee, pas la reponse",
    ],
  ],
  household_member_habits: [[
    ["household_id", "updated_by"],
    "deja dans `household_members`, et l'id d'un AUTRE compte",
  ]],
  household_member_allergies: [[
    ["household_id", "created_by"],
    "deja dans `household_members`, et l'id d'un AUTRE compte — le maitre qui " +
      "a declare pour une bouche sans compte. Meme regle qu'`updated_by`",
  ]],
  household_food_restrictions: [[
    ["household_id", "created_by"],
    "deja dans `household_members`, et l'id d'un AUTRE compte",
  ]],
};

Deno.test(
  "S5 — LE SCHÉMA EST ÉNUMÉRÉ, PAS LISTÉ À LA MAIN",
  { ignore: SKIP_INTEGRATION },
  async () => {
    const { admin } = clients();
    const { data: inventory, error } = await admin.rpc(
      "keel_gdpr_public_inventory",
    );
    if (error) throw error;
    const schema = inventory as Record<string, string[]>;
    const allTables = Object.keys(schema).sort();
    assert(
      allTables.length > 100,
      `l'inventaire rend ${allTables.length} tables: la porte est fermee ou ` +
        `la migration 20260822040000 n'est pas appliquee.`,
    );

    const reads = await exportReads();
    const claimed = new Set<string>([
      ...reads.keys(),
      ...PIVOT_TABLES.map((t) => t.table),
    ]);

    // ---- 1. AUCUN FANTÔME ------------------------------------------------
    const ghosts: string[] = [];
    for (const t of claimed) if (!schema[t]) ghosts.push(t);
    for (const [, tables] of Object.entries(NON_RECLAMEES)) {
      for (const t of tables) if (!schema[t]) ghosts.push(t);
    }
    assertEquals(
      ghosts.sort(),
      [],
      `tables nommees par le filet qui n'existent plus dans le schema: ` +
        `${ghosts.join(", ")}. Une liste ecrite a la main se perime aussi ` +
        `PAR LE HAUT — c'est ce qui a laisse \`recurring_meals\` et ` +
        `\`student_facts\` ici pendant trois semaines apres leur DROP.`,
    );

    // ---- 1bis. LA COLONNE DE PROPRIÉTAIRE EXISTE ENCORE -----------------
    //
    // ⛔ LA TROISIÈME PÉREMPTION, ET AUCUN DES DEUX CONTRÔLES CI-DESSUS NE LA
    // VOIT: la table existe, sa colonne de propriétaire non. C'est ce qui a
    // laissé `meal_ideas` avec `owner: "student_id"` du 2026-08-04 au
    // 2026-08-22, en levant `Could not find the 'student_id' column` à la
    // première ligne du décor — c'est-à-dire en rendant le seul filet RGPD du
    // dépôt INEXÉCUTABLE, sans qu'une seule ligne le dise.
    const brokenOwners = PIVOT_TABLES
      .filter((t) => !(schema[t.table] ?? []).includes(t.owner))
      .map((t) => `${t.table}.${t.owner}`);
    assertEquals(
      brokenOwners,
      [],
      `colonne(s) de propriétaire disparue(s): ${brokenOwners.join(", ")}. ` +
        `Le décor de ce fichier ne peut plus semer, donc le filet ne tourne ` +
        `plus du tout — et une liste écrite à la main ne le dit jamais.`,
    );

    // ---- 2. AUCUNE TABLE NON CLASSÉE -------------------------------------
    const named = new Set<string>(claimed);
    for (const [, tables] of Object.entries(NON_RECLAMEES)) {
      for (const t of tables) named.add(t);
    }
    // ⛔ ET AUCUNE TABLE N'EST DANS LES DEUX LISTES. « Réclamée » et
    // « nommée comme exclue » sont contradictoires: la première gagnerait en
    // silence, et une table pourrait rester dans la classe de la dette tout en
    // étant exportée — ou l'inverse.
    const both: string[] = [];
    for (const [, tables] of Object.entries(NON_RECLAMEES)) {
      for (const t of tables) if (claimed.has(t)) both.push(t);
    }
    assertEquals(
      both.sort(),
      [],
      `table(s) à la fois RÉCLAMÉES et NOMMÉES COMME EXCLUES: ` +
        `${both.join(", ")}. Les deux affirmations ne peuvent pas être vraies.`,
    );

    const unclassified = allTables.filter((t) => !named.has(t));
    assertEquals(
      unclassified,
      [],
      `⛔ ${unclassified.length} table(s) de \`public\` ne sont NI reclamees ` +
        `par le cycle de vie RGPD NI nommees comme exclues: ` +
        `${unclassified.join(", ")}. Une table absente d'une liste ecrite a ` +
        `la main ne rougit jamais — c'est exactement ce que ce filet existe ` +
        `pour empecher.`,
    );

    // ---- 3. LA DETTE NE GRANDIT PAS --------------------------------------
    const debt = NON_RECLAMEES[A_QUALIFIER_KEY] ?? [];
    assert(
      debt.length <= A_QUALIFIER_MAX,
      `la classe A_QUALIFIER porte ${debt.length} tables pour un plafond de ` +
        `${A_QUALIFIER_MAX}: une table personnelle de plus a ete rangee dans ` +
        `la dette au lieu d'etre reclamee.`,
    );

    // ---- 4. CHAQUE COLONNE EST EXPORTÉE OU NOMMÉE ------------------------
    const { SCOPE } = await import("./account-export-v1/export_scope.ts");
    const silent: string[] = [];
    for (const [table, key] of reads) {
      const allow = key.startsWith("@inline:")
        ? key.slice("@inline:".length)
        : (SCOPE as Record<string, string>)[key];
      assert(allow, `la cle d'allowlist \`${key}\` (${table}) n'existe plus`);
      const exported = new Set(allow.split(","));
      const excluded = new Set<string>();
      for (const [cols] of HORS_EXPORT[table] ?? []) {
        for (const c of cols) excluded.add(c);
      }
      for (const column of schema[table] ?? []) {
        if (!exported.has(column) && !excluded.has(column)) {
          silent.push(`${table}.${column}`);
        }
      }
    }
    assertEquals(
      silent,
      [],
      `⛔ ${silent.length} colonne(s) ne sortent pas dans l'export ET ne sont ` +
        `nommees nulle part: ${silent.join(", ")}. L'allowlist est PAR ` +
        `COLONNE: une colonne neuve est absente par defaut, donc muette. ` +
        `C'est ainsi que \`composition_unknowns\` et ` +
        `\`composition_energy_sources\` sont restees dehors pendant que la ` +
        `migration du lot 18 declarait la table « exportee en entier ».`,
    );
  },
);

Deno.test(
  "S5 — LES DEUX TABLES DE SANTÉ DU FOYER SORTENT À L'EXPORT ET PARTENT À LA PURGE",
  { ignore: SKIP_INTEGRATION },
  async () => {
    // ── CE QUE CE CAS PROUVE, ET QU'AUCUNE LECTURE DE SOURCE NE PROUVE ─────
    //   · les deux libellés de SANTÉ sont dans l'archive RÉELLE;
    //   · ceux de l'AUTRE bouche n'y sont PAS (la seule façon de rendre ce lot
    //     pire que le trou qu'il ferme);
    //   · la branche « je pars avec ma place » les efface pour de bon;
    //   · la branche du DÉTACHEMENT les GARDE — décision, pas oubli.
    const { supabaseUrl, anonKey, anon, admin } = clients();
    const nonce = makeNonce();

    const master = `a13.s5.master+${nonce}@example.com`;
    const leaver = `a13.s5.leaver+${nonce}@example.com`;
    const { error: e1 } = await anon.auth.signUp({
      email: master,
      password: PASSWORD,
    });
    if (e1) throw e1;
    const { error: e2 } = await anon.auth.signUp({
      email: leaver,
      password: PASSWORD,
    });
    if (e2) throw e2;
    const { data: inM, error: e3 } = await anon.auth.signInWithPassword({
      email: master,
      password: PASSWORD,
    });
    if (e3) throw e3;
    const masterId = inM.user!.id as string;
    const masterToken = inM.session!.access_token as string;
    const { data: inL, error: e4 } = await anon.auth.signInWithPassword({
      email: leaver,
      password: PASSWORD,
    });
    if (e4) throw e4;
    const leaverId = inL.user!.id as string;

    // ---- LE FOYER, monté à la clé de service ------------------------------
    // Le geste produit (`keel_household_create` + invitation) exigerait deux
    // jetons et une acceptation; ce cas garde les DONNÉES, pas le parcours.
    const { data: house, error: hErr } = await admin.from("households")
      .insert({ name: `A13S5 ${nonce}`, created_by: masterId })
      .select("id").single();
    if (hErr) throw hErr;
    const houseId = house.id as string;
    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      // ⚠️ ON NE SUPPRIME QUE CE QUE CE RUN A CRÉÉ. La cascade du foyer
      // emporte ses bouches, leurs allergies et leurs règles.
      await admin.from("households").delete().eq("id", houseId);
    };

    try {
      const { data: mRow, error: mErr } = await admin.from("household_members")
        .insert({
          household_id: houseId,
          user_id: masterId,
          role: "owner",
          first_name: `Maitre${nonce}`,
          birth_date: "1988-04-04",
        }).select("member_id").single();
      if (mErr) throw mErr;
      const masterMember = mRow.member_id as string;

      const { data: lRow, error: lErr } = await admin.from("household_members")
        .insert({
          household_id: houseId,
          user_id: leaverId,
          role: "member",
          first_name: `Partant${nonce}`,
          birth_date: "1992-09-09",
          departs_with_account: true,
        }).select("member_id").single();
      if (lErr) throw lErr;
      const leaverMember = lRow.member_id as string;

      const MINE_ALLERGY = `A13S5-MON-ALLERGIE-${nonce}`;
      const MINE_RULE = `A13S5-MA-REGLE-${nonce}`;
      const THEIRS_ALLERGY = `A13S5-SON-ALLERGIE-${nonce}`;
      const THEIRS_RULE = `A13S5-SA-REGLE-${nonce}`;

      const seed = async (table: string, member: string, label: string) => {
        const { error } = await admin.from(table).insert({
          household_id: houseId,
          member_id: member,
          label,
          created_by: masterId,
        });
        if (error) throw new Error(`seed ${table}: ${error.message}`);
      };
      await seed("household_member_allergies", masterMember, MINE_ALLERGY);
      await seed("household_food_restrictions", masterMember, MINE_RULE);
      await seed("household_member_allergies", leaverMember, THEIRS_ALLERGY);
      await seed("household_food_restrictions", leaverMember, THEIRS_RULE);

      // ---- 1. L'EXPORT DU MAÎTRE -----------------------------------------
      const exp = await callFn(
        supabaseUrl,
        anonKey,
        "account-export-v1",
        masterToken,
        { password: PASSWORD },
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

      const missing = [MINE_ALLERGY, MINE_RULE].filter((m) =>
        !archive.includes(m)
      );
      assertEquals(
        missing,
        [],
        `⛔ donnée de SANTÉ absente de l'archive: ${missing.join(", ")}. ` +
          `Avant le 2026-08-22, les DEUX l'étaient — mesuré à grep -c → 0.`,
      );

      // ⛔ ET CELLES DE L'AUTRE BOUCHE N'Y SONT PAS.
      const leaked = [THEIRS_ALLERGY, THEIRS_RULE].filter((m) =>
        archive.includes(m)
      );
      assertEquals(
        leaked,
        [],
        `⛔ l'archive du maître porte les données de santé d'une AUTRE ` +
          `personne: ${leaked.join(", ")}. C'est le seul geste qui rendrait ` +
          `ce lot pire que le trou qu'il ferme.`,
      );

      // Et l'archive ne ment pas sur ce qui manque.
      const manifest = JSON.parse(decoder.decode(files["fichiers.json"]));
      assertEquals(
        manifest.tables_indisponibles,
        [],
        "une table est signalée indisponible: la lecture neuve échoue en " +
          "silence et rend du vide.",
      );

      // ---- 2. LA PURGE, BRANCHE « JE PARS AVEC MA PLACE » ----------------
      const { data: purgeL, error: pErr } = await admin.rpc(
        "keel_household_purge_user",
        { p_user: leaverId },
      );
      if (pErr) throw pErr;
      assertEquals((purgeL as any)?.action, "removed");
      for (const table of [
        "household_member_allergies",
        "household_food_restrictions",
      ]) {
        const { count, error } = await admin.from(table)
          .select("id", { count: "exact", head: true })
          .eq("member_id", leaverMember);
        if (error) throw error;
        assertEquals(
          count ?? 0,
          0,
          `${table}: une donnée de santé survit à une bouche SUPPRIMÉE.`,
        );
      }

      // ---- 3. LA PURGE, BRANCHE DU DÉTACHEMENT --------------------------
      // ⛔ LE CAS QUI PASSE DE L'AUTRE CÔTÉ, et il est OBLIGATOIRE: sans lui,
      // « la purge efface tout » passerait pour une garde qui marche.
      const { data: purgeM, error: pErr2 } = await admin.rpc(
        "keel_household_purge_user",
        { p_user: masterId },
      );
      if (pErr2) throw pErr2;
      assertEquals((purgeM as any)?.action, "detached");
      for (const table of [
        "household_member_allergies",
        "household_food_restrictions",
      ]) {
        const { count, error } = await admin.from(table)
          .select("id", { count: "exact", head: true })
          .eq("member_id", masterMember);
        if (error) throw error;
        assertEquals(
          count ?? 0,
          1,
          `${table}: la ligne d'une bouche DÉTACHÉE a disparu. Le foyer ` +
            `cuisinera pour elle sans savoir ce qui la rend malade — un ` +
            `geste de vie privée ne peut pas produire une régression de ` +
            `sécurité.`,
        );
      }
    } finally {
      await cleanup();
    }
  },
);
