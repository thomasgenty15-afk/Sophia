// LA SURFACE ÉLÈVE DES CONTRAINTES — éprouvée sous un VRAI JWT d'élève.
//
// POURQUOI CE TEST NE PEUT PAS ÊTRE UNITAIRE. Tout ce qu'il vérifie est tenu
// par la base et par personne d'autre: une policy RLS et un trigger. Un test à
// double mémoire prouverait que mon code appelle `.update()`; seul un vrai JWT
// prouve que Postgres l'accepte — et surtout qu'il REFUSE le reste.
//
// Ce que la migration `20260804190000` ferme, et qu'on rejoue ici:
//   * un élève pouvait déclarer une contrainte et jamais la retirer (aucune
//     policy UPDATE). Un produit qui enferme;
//   * une policy UPDATE nue lui aurait laissé réécrire `declared_by` — donc
//     fabriquer une contrainte attribuée à son coach, sur la table la plus
//     sensible du produit.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const MISSING = REQUIRED_ENV.filter((n) =>
  (Deno.env.get(n) ?? "").trim().length === 0
);
const SKIP = MISSING.length > 0;
if (SKIP) {
  console.log(
    `[skip] student_safety_constraint_surface_int_test.ts: stack requise — manque: ${
      MISSING.join(", ")
    }`,
  );
}

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

function admin() {
  return createClient(URL_BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Le client tel que le NAVIGATEUR l'utilise: anon + le JWT de l'élève. */
function asStudent(token: string) {
  return createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function makeStudent(): Promise<{ id: string; token: string }> {
  const anon = createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const { data, error } = await anon.auth.signUp({
    email: `constraint-${nonce}@test.dev`,
    password: "1234567",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`signUp: ${error?.message ?? "no session"}`);
  }
  await admin().from("profiles").update({
    keel_role: "student",
    timezone: "Europe/Paris",
    country: "GB",
  } as never).eq("id", data.user.id);
  return { id: data.user.id, token: data.session.access_token };
}

const TABLE = "student_safety_constraints";

Deno.test({
  name: "l'élève déclare une allergie, la relit, et peut la RETIRER",
  ignore: SKIP,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const student = await makeStudent();
    const db = asStudent(student.token);

    const inserted = await db.from(TABLE).insert({
      user_id: student.id,
      kind: "allergy",
      allergen_ref: "peanut",
      severity: "medical",
      declared_by: "student",
      content_locale: "en-GB",
    } as never).select("id, status, allergen_ref, declared_by").single();
    assertEquals(inserted.error, null, `insert: ${inserted.error?.message}`);
    const id = (inserted.data as { id: string }).id;

    const active = await db.from(TABLE).select("id").eq("user_id", student.id)
      .eq("status", "active");
    assertEquals(active.error, null);
    assertEquals((active.data ?? []).length, 1);

    // LA RÉTRACTATION — c'est elle qui n'existait pas.
    const retracted = await db.from(TABLE).update({
      status: "retracted",
      retracted_reason: "student_removed",
      retracted_at: new Date().toISOString(),
    } as never).eq("id", id).eq("user_id", student.id)
      .select("id, status, retracted_at").single();
    assertEquals(retracted.error, null, `retract: ${retracted.error?.message}`);
    assertEquals((retracted.data as { status: string }).status, "retracted");
    assert(
      (retracted.data as { retracted_at: string | null }).retracted_at !== null,
      "une rétractation sans horodatage violerait la CHECK de la table",
    );

    // La ligne SURVIT: on retire, on ne supprime pas. La trace reste pour le
    // coach et pour le RGPD.
    const all = await admin().from(TABLE).select("id").eq("user_id", student.id);
    assertEquals((all.data ?? []).length, 1);

    await admin().auth.admin.deleteUser(student.id).catch(() => {});
  },
});

Deno.test({
  name: "un élève ne peut PAS s'attribuer une contrainte de son coach",
  ignore: SKIP,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const student = await makeStudent();
    const db = asStudent(student.token);

    const inserted = await db.from(TABLE).insert({
      user_id: student.id,
      kind: "allergy",
      allergen_ref: "sesame",
      severity: "strict",
      declared_by: "student",
      content_locale: "en-GB",
    } as never).select("id").single();
    assertEquals(inserted.error, null);
    const id = (inserted.data as { id: string }).id;

    // FALSIFICATION D'AUTORITÉ: la contrainte deviendrait « écrite par le
    // coach », sur la table qui décide de ce que Sophia refuse de dire.
    const forged = await db.from(TABLE)
      .update({ declared_by: "coach" } as never).eq("id", id);
    assert(forged.error !== null, "declared_by a pu être réécrit par l'élève");
    assert(
      String(forged.error?.message ?? "").includes("declared_by is immutable"),
      `motif inattendu: ${forged.error?.message}`,
    );

    // RÉÉCRITURE D'IDENTITÉ: on remplace une déclaration, on ne l'édite pas.
    const rewritten = await db.from(TABLE)
      .update({ allergen_ref: "peanut" } as never).eq("id", id);
    assert(rewritten.error !== null, "allergen_ref a pu être réécrit");

    // RÉSURRECTION: une contrainte retirée ne se rallume pas en place.
    await db.from(TABLE).update({
      status: "retracted",
      retracted_at: new Date().toISOString(),
    } as never).eq("id", id);
    const revived = await db.from(TABLE)
      .update({ status: "active" } as never).eq("id", id);
    assert(revived.error !== null, "une rétractation a pu être annulée");

    await admin().auth.admin.deleteUser(student.id).catch(() => {});
  },
});

Deno.test({
  name: "un élève ne voit ni ne touche les contraintes d'un autre",
  ignore: SKIP,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const alice = await makeStudent();
    const bob = await makeStudent();

    const inserted = await admin().from(TABLE).insert({
      user_id: alice.id,
      kind: "allergy",
      allergen_ref: "shellfish",
      severity: "medical",
      declared_by: "student",
      content_locale: "en-GB",
    } as never).select("id").single();
    const id = (inserted.data as { id: string }).id;

    const bobDb = asStudent(bob.token);
    const seen = await bobDb.from(TABLE).select("id").eq("user_id", alice.id);
    assertEquals(
      (seen.data ?? []).length,
      0,
      "RLS laisse un élève lire les contraintes d'un autre",
    );

    // Rétracter la contrainte de quelqu'un d'autre: RLS ne doit rien toucher.
    await bobDb.from(TABLE).update({
      status: "retracted",
      retracted_at: new Date().toISOString(),
    } as never).eq("id", id);
    const after = await admin().from(TABLE).select("status").eq("id", id).single();
    assertEquals(
      (after.data as { status: string }).status,
      "active",
      "un élève a pu retirer l'allergie médicale d'un autre",
    );

    await admin().auth.admin.deleteUser(alice.id).catch(() => {});
    await admin().auth.admin.deleteUser(bob.id).catch(() => {});
  },
});

Deno.test({
  name: "chaque valeur que l'écran propose est ACCEPTÉE par le schéma",
  ignore: SKIP,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // LE TEST QUI MANQUAIT, ET QUI A MORDU TOUT DE SUITE.
    //
    // La première version de l'écran proposait `severity='strong'`. Le schéma
    // dit `strict`. Un élève aurait rempli le formulaire, appuyé sur Ajouter, et
    // reçu une erreur PostgREST brute sur la déclaration de son allergie — sur
    // la table la plus sensible du produit.
    //
    // C'est la jointure code↔base qui n'était pas testée
    // (`renaming-a-table-needs-three-absence-proofs`, même famille). On ne LIT
    // pas la contrainte CHECK: on tente vraiment chaque valeur, ce qui reste
    // vrai même si la contrainte change de forme.
    const student = await makeStudent();
    const db = asStudent(student.token);

    // Les listes doivent rester alignées, à la main, sur ce que le front offre:
    // `CONSTRAINT_KINDS` et `CONSTRAINT_SEVERITIES` de
    // `frontend/src/keel/api/safetyConstraints.ts`.
    const KINDS_OFFERED = ["allergy", "intolerance", "medical", "religious", "dislike"];
    const SEVERITIES_OFFERED = ["medical", "strict", "preference"];

    for (const kind of KINDS_OFFERED) {
      for (const severity of SEVERITIES_OFFERED) {
        const written = await db.from(TABLE).insert({
          user_id: student.id,
          kind,
          // Le champ que l'écran choisit pour ce `kind` (`refFieldFor`).
          allergen_ref: kind === "medical" ? null : "probe_ref",
          medication_class: kind === "medical" ? "probe_class" : null,
          severity,
          declared_by: "student",
          content_locale: "en-GB",
        } as never).select("id").single();
        assertEquals(
          written.error,
          null,
          `l'écran propose kind='${kind}' severity='${severity}', que le schéma refuse: ${written.error?.message}`,
        );
        await admin().from(TABLE).delete()
          .eq("id", (written.data as { id: string }).id);
      }
    }

    await admin().auth.admin.deleteUser(student.id).catch(() => {});
  },
});
