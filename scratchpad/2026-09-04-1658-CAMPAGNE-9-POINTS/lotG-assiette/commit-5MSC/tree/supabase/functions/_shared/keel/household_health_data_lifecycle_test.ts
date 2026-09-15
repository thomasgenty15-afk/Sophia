// ===========================================================================
// S5 — LES ALLERGIES DU FOYER ENTRENT AU CYCLE DE VIE RGPD
//
// ── LE TROU, MESURÉ LE 2026-08-22 ─────────────────────────────────────────
//
//     grep -c 'household_member_allergies\|household_food_restrictions' \
//       supabase/functions/account-export-v1/index.ts   →   0
//
// `household_member_allergies` (8 lignes) et `household_food_restrictions`
// (6) n'étaient réclamées NI par l'export, NI par la purge, NI par le seul
// test qui prétend garder le cycle de vie RGPD. Ce sont des données de SANTÉ,
// y compris de mineurs, y compris de bouches qui n'ont jamais eu de compte.
//
// ── POURQUOI CE FICHIER EST ICI, ET PAS SEULEMENT DANS LE TEST D'INTÉGRATION
//
// ⚠️ `keel_gdpr_lifecycle_test.ts` SAUTE sans pile vivante (`SKIP_INTEGRATION`)
// et `agent-gate.sh` ne lance QUE `supabase/functions/_shared/keel/`. Le filet
// qui ÉNUMÈRE `information_schema` vit là-bas — il ne peut pas vivre ici, il
// lui faut la base. Ce fichier est la moitié que le gate VOIT: il lit la
// SOURCE, comme `household_export_test.ts` juste à côté, et il mord sans
// réseau ni variable d'environnement.
//
// C'est le patron de garde du domaine foyer, et il a une raison mesurée: un
// filet qui n'est lancé que par une session qui pense à exporter trois
// variables ressemble trait pour trait à un filet qui marche.
// ===========================================================================

import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

async function exportSource(): Promise<string> {
  return await Deno.readTextFile(
    new URL("account-export-v1/index.ts", FUNCTIONS_DIR),
  );
}

async function exportScopeSource(): Promise<string> {
  return await Deno.readTextFile(
    new URL("account-export-v1/export_scope.ts", FUNCTIONS_DIR),
  );
}

/**
 * LE CORPS DE LA PURGE **TELLE QU'ELLE TOURNE**.
 *
 * Même lecteur que `household_export_test.ts`, et pour la même raison: la
 * fonction a déjà été `create or replace`-ée deux fois, et un test qui lisait
 * la migration d'origine en dur assertait sur une définition que la base
 * n'exécute plus — vert, et aveugle.
 */
async function latestPurgeBody(): Promise<string> {
  const dir = new URL("../../../migrations/", import.meta.url);
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) names.push(entry.name);
  }
  names.sort();
  let body = "";
  let from = "";
  for (const name of names) {
    const sql = await Deno.readTextFile(new URL(name, dir));
    const at = sql.indexOf(
      "create or replace function public.keel_household_purge_user",
    );
    if (at < 0) continue;
    const end = sql.indexOf(
      "comment on function public.keel_household_purge_user",
      at,
    );
    body = sql.slice(at, end > at ? end : undefined);
    from = name;
  }
  assert(body !== "", "la purge a disparu de toutes les migrations");
  console.log(`[household_health_data] purge lue dans ${from}`);
  return body;
}

Deno.test("S5 — LES DEUX TABLES DE SANTÉ SONT DANS L'EXPORT", async () => {
  const src = await exportSource();
  for (const table of [
    "household_member_allergies",
    "household_food_restrictions",
  ]) {
    assert(
      src.includes(`"${table}"`),
      `${table} n'est exportée nulle part. C'est de la donnée de SANTÉ, et ` +
        `elle était hors de l'export, de la purge et du test avant le ` +
        `2026-08-22 — mesuré à grep -c → 0.`,
    );
  }
});

Deno.test("S5 — CE SONT SES ALLERGIES, JAMAIS CELLES DU FOYER", async () => {
  // ⚠️ LE SEUL GESTE QUI RENDRAIT CE LOT PIRE QUE LE TROU QU'IL FERME. Les
  // deux tables n'ont pas de `user_id`: elles pendent à
  // `household_members.member_id`. Nourrir la lecture des `member_id` du
  // ROSTER mettrait les allergies de ses enfants et de son conjoint dans SON
  // archive — une divulgation médicale sur des tiers, servie par le droit
  // d'accès de quelqu'un d'autre.
  //
  // C'est aussi la moitié « B » de la décision n° 24 du plan (2026-08-21):
  // une bouche AVEC un compte exporte LES SIENNES; une bouche SANS compte n'a
  // aucun moyen d'exporter, et c'est le maître qui les porte.
  const src = await exportSource();
  for (const table of [
    "household_member_allergies",
    "household_food_restrictions",
  ]) {
    const at = src.indexOf(`"${table}"`);
    assert(at >= 0, `la lecture de ${table} a disparu`);
    // ⚠️ BORNÉ PAR LA FIN DE L'APPEL, pas par un nombre de caractères écrit à
    // la main: un `at + 500` a déjà raté une ligne ici dès qu'un commentaire
    // s'est allongé.
    const end = src.indexOf("\n  );", at);
    assert(end > at, `l'appel de ${table} n'a plus la forme attendue`);
    const call = src.slice(at, end);
    assert(
      call.includes('"member_id"'),
      `${table} n'est plus lue par \`member_id\`.`,
    );
    assert(
      call.includes("householdMembership"),
      `les identifiants de ${table} ne viennent plus de \`householdMembership\` ` +
        `— c'est-à-dire de la lecture DÉJÀ filtrée sur \`user_id = <lui>\`. ` +
        `Toute autre source exporte les allergies d'autrui.`,
    );
    assert(
      !call.includes("roster"),
      `un roster nourrit la liste d'ids de ${table}: l'export d'une personne ` +
        `divulgue les données de santé des autres bouches du foyer.`,
    );
  }
});

Deno.test("S5 — L'ALLOWLIST NE PORTE PAS L'ID D'UN TIERS", async () => {
  // `created_by` est le compte du MAÎTRE qui a déclaré pour une bouche sans
  // compte. Le sortir livrerait un identifiant de tiers dans l'archive de
  // quelqu'un — exactement la règle déjà écrite pour `updated_by` sur les
  // habitudes.
  const scope = await exportScopeSource();
  for (const key of ["householdMemberAllergies", "householdFoodRestrictions"]) {
    const at = scope.indexOf(`${key}:`);
    assert(at >= 0, `l'allowlist ${key} a disparu`);
    const line = scope.slice(at, scope.indexOf("\n", at));
    assert(line.includes("label"), `${key} n'exporte plus le libellé.`);
    assert(line.includes("member_id"), `${key} n'exporte plus la bouche.`);
    assertEquals(
      line.includes("created_by"),
      false,
      `${key} exporte \`created_by\`: l'id d'un AUTRE compte entre dans ` +
        `l'archive de quelqu'un.`,
    );
  }
});

Deno.test(
  "S5 — LA PURGE EFFACE QUAND LA BOUCHE PART, ET GARDE QUAND ELLE RESTE",
  async () => {
    // ⛔ LES DEUX MOITIÉS, ET LA SECONDE EST CELLE QU'ON « RÉPARE » PAR
    // SYMÉTRIE SANS LIRE L'ARBITRAGE.
    //
    // Le CORPS part dans les deux branches (2026-08-12), et l'arbitrage était:
    // « le coût est une part standard jusqu'à ce que le maître resaisisse —
    // sûr, et visible ». L'état dégradé d'un corps effacé est SÛR.
    //
    // Celui d'une allergie effacée ne l'est pas: la bouche reste à table, le
    // foyer cuisine encore pour elle, et `generate-household-meal-v1` fait
    // l'UNION des allergies du foyer — « une allergie d'un seul membre
    // gouverne TOUTE la casserole ». Effacer la ligne au détachement
    // retirerait la ceinture EN SILENCE.
    //
    //     UN GESTE DE VIE PRIVÉE NE PEUT PAS PRODUIRE UNE RÉGRESSION DE
    //     SÉCURITÉ.
    //
    // Ce test est donc dans les DEUX sens: il rougit si la branche « je pars
    // avec ma place » cesse d'effacer, ET il rougit si la branche du
    // détachement se met à effacer.
    const body = await latestPurgeBody();

    const removedBranch = body.slice(
      0,
      body.indexOf("'action', 'removed'") >= 0
        ? body.indexOf("'action', 'removed'")
        : undefined,
    );
    for (const table of [
      "household_member_allergies",
      "household_food_restrictions",
    ]) {
      assert(
        removedBranch.includes(`delete from public.${table}`),
        `la branche « je pars avec ma place » n'efface pas ${table}: une ` +
          `donnée de santé survit à une bouche SUPPRIMÉE, sans titulaire.`,
      );
    }

    const detachedBranch = body.slice(body.indexOf("'action', 'removed'"));
    for (const table of [
      "household_member_allergies",
      "household_food_restrictions",
    ]) {
      assertEquals(
        detachedBranch.includes(`delete from public.${table}`),
        false,
        `la branche du DÉTACHEMENT efface désormais ${table}. C'est ` +
          `peut-être juste, mais alors la ceinture d'allergie du foyer tombe ` +
          `en silence pour une bouche qui reste à table — et la phrase ` +
          `\`ce_qui_survit_a_la_suppression\` de l'export devient fausse au ` +
          `même instant. Rouvrir l'arbitrage, pas ce test.`,
      );
    }
  },
);

Deno.test("S5 — L'EXPORT DIT CE QU'IL GARDE DES DONNÉES DE SANTÉ", async () => {
  // La moitié qui compte, et c'est la même leçon que `birth_date` en C3: une
  // donnée qu'on garde et qu'on ne dit pas est le seul des deux cas qui n'a
  // aucune justification.
  const src = await exportSource();
  const at = src.indexOf("champs_conserves");
  assert(at >= 0, "la liste des champs conservés a disparu");
  const block = src.slice(at, at + 1400);
  for (const table of [
    "household_member_allergies",
    "household_food_restrictions",
  ]) {
    assert(
      block.includes(table),
      `l'archive ne dit pas que ${table} survit au compte supprimé. On garde ` +
        `une donnée de santé sans le dire.`,
    );
  }
  assert(
    src.includes("mes_allergies"),
    "les allergies ne sont pas rendues dans `mon_foyer.json`.",
  );
  assert(
    src.includes("les_regles_de_maison_qui_me_visent"),
    "les règles de maison ne sont pas rendues dans `mon_foyer.json`.",
  );
});
