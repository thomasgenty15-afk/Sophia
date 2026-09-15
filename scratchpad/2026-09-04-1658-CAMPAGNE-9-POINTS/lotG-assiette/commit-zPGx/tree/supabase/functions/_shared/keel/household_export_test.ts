// ===========================================================================
// C3 ③ — LA DATE DE NAISSANCE SURVIT AU COMPTE, ET L'EXPORT LE DIT
//
// ── LE FAIT, VÉRIFIÉ PLUTÔT QUE SUPPOSÉ ────────────────────────────────────
// `keel_household_purge_user` (migration 20260811040000) DÉTACHE la ligne du
// foyer — `user_id` passe à NULL — au lieu de la supprimer. `first_name` et
// `birth_date` survivent donc au compte effacé. La survie de LA BOUCHE est
// voulue et testée (D3: « une bouche sans compte reste une bouche du foyer »).
// La survie de SA DATE DE NAISSANCE n'avait jamais été décidée — et
// `household_members` n'apparaissait NULLE PART dans `account-export-v1`.
//
// ── CE QUE C3 TRANCHE, ET POURQUOI ─────────────────────────────────────────
// ON GARDE, ET ON LE DIT. Le prénom répond à « pour qui je cuisine ». La date
// de naissance résout l'âge (`keel_household_member_age`), donc la direction de
// service, donc les PARTS — et pas seulement les siennes: retirer une bouche
// datée d'un foyer change la casserole de tout le monde. L'effacer dégraderait
// la composition d'un foyer que la personne quitte, ce qui est exactement le
// dégât que D3 existe pour empêcher.
//
// Ce qui manquait n'était donc pas l'effacement, c'était la DÉCLARATION: une
// donnée qu'on garde et qu'on ne dit pas est le seul des deux qui n'a aucune
// justification. L'export porte maintenant la ligne ET la phrase.
//
// ── L'OPTION ÉCARTÉE ───────────────────────────────────────────────────────
// Effacer `birth_date` à la purge (`user_id = null, birth_date = null`). Coût:
// toutes les bouches détachées repassent en `unknown`, donc en part standard,
// en silence — et le foyer ne peut pas la ressaisir puisqu'il ne sait pas
// qu'elle a disparu. Retour arrière de la décision prise: une ligne dans
// `keel_household_purge_user`, plus la ligne d'export ci-dessous.
// ===========================================================================

import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

async function exportSource(): Promise<string> {
  return await Deno.readTextFile(
    new URL("account-export-v1/index.ts", FUNCTIONS_DIR),
  );
}

/**
 * Le README de l'archive, qui a QUITTÉ `index.ts` (lot 7 — langue).
 *
 * Il y était français EN DUR, `index.ts` est en `@ts-nocheck`, et le README
 * porte l'avertissement de sécurité de l'archive. Il vit maintenant dans un
 * module pur à deux packs, `account-export-v1/export_copy.ts`.
 *
 * ⚠️ CETTE ÉPREUVE RESTE UNE LECTURE DE SOURCE, ET DANS LES DEUX PACKS. Le
 * défaut qu'elle garde — « un fichier de l'archive qu'aucune ligne n'annonce
 * n'est pas lu » — se rejoue à l'identique si UN SEUL des deux packs oublie la
 * ligne: la moitié des utilisateurs recevrait alors un README qui ne nomme pas
 * le fichier où survit sa date de naissance.
 */
/**
 * ⟳ 2026-08-22 (`S5`) — L'ALLOWLIST DE COLONNES A DÉMÉNAGÉ, ET CES DEUX CAS
 * L'ONT DIT EN ROUGISSANT.
 *
 * Elle vivait dans `index.ts`; elle vit maintenant dans un module importable,
 * parce qu'`index.ts` est en `@ts-nocheck` et monte un serveur au premier
 * import — donc aucun test ne pouvait la LIRE autrement qu'en la parsant. Le
 * filet qui ÉNUMÈRE les colonnes (`keel_gdpr_lifecycle_test.ts`) avait besoin
 * de l'importer, et il a mesuré 145 colonnes hors allowlist le jour où il a
 * pu le faire.
 *
 * ⚠️ Les deux cas ci-dessous lisaient `index.ts` et ont échoué au déménagement.
 * C'est la preuve qu'ils lisent bien la source qui décide, et pas une copie.
 */
async function exportScopeSource(): Promise<string> {
  return await Deno.readTextFile(
    new URL("account-export-v1/export_scope.ts", FUNCTIONS_DIR),
  );
}

async function exportReadmeSource(): Promise<string> {
  return await Deno.readTextFile(
    new URL("account-export-v1/export_copy.ts", FUNCTIONS_DIR),
  );
}

Deno.test("C3 ③ — `household_members` EST DANS L'EXPORT, scopée à SA ligne", async () => {
  const src = await exportSource();
  const at = src.indexOf('"household_members"');
  assert(
    at >= 0,
    "la seule table dont des données personnelles survivent à la purge n'est " +
      "de nouveau exportée nulle part.",
  );
  const call = src.slice(at, at + 200);
  assert(
    call.includes('"user_id"'),
    "la lecture n'est plus scopée par `user_id`: l'export RGPD de l'un " +
      "divulguerait les autres bouches du foyer.",
  );
  // ⚠️ `joined_at`, PAS `created_at`. Cette table n'a pas de `created_at`, et un
  // tri sur une colonne inexistante ferait tomber la lecture dans le filet
  // `tables_indisponibles` — donc un export silencieusement VIDE sur la seule
  // table qui survit à la purge. Le pire des deux mondes: la clé est là, la
  // donnée n'y est pas.
  assert(
    call.includes('"joined_at"'),
    "le tri est revenu sur `created_at`, qui n'existe pas sur cette table: " +
      "l'export rend du vide sans le dire.",
  );
});

Deno.test("C3 ③ — LES DEUX CHAMPS QUI SURVIVENT SONT DANS L'ALLOWLIST", async () => {
  const src = await exportScopeSource();
  const at = src.indexOf("householdMembers:");
  assert(at >= 0, "l'allowlist de colonnes a disparu");
  const scope = src.slice(at, at + 300);
  for (const column of ["first_name", "birth_date", "goal", "away_days"]) {
    assert(
      scope.includes(column),
      `${column} n'est plus exportée. L'allowlist est PAR COLONNE: une colonne ` +
        `absente ne sort pas, et ce dépôt a déjà oublié neuf tables ici.`,
    );
  }
});

Deno.test("C3 ③ — L'EXPORT DIT CE QU'IL GARDE, pas seulement ce qu'il détient", async () => {
  // ⚠️ LA MOITIÉ QUI COMPTE. Rendre la ligne sans dire qu'elle survit à la
  // suppression ferait un export exact et une information manquante: la
  // personne saurait ce qu'on a, pas ce qu'on gardera.
  const src = await exportSource();
  assert(
    src.includes('"mon_foyer.json"'),
    "le fichier de foyer a disparu de l'archive",
  );
  assert(
    src.includes("ce_qui_survit_a_la_suppression"),
    "l'archive ne dit plus ce qui survit à la suppression du compte.",
  );
  assert(
    src.includes("champs_conserves"),
    "la liste des champs conservés a disparu: « on garde des choses » sans " +
      "dire lesquelles est pire que se taire.",
  );
  assert(
    src.includes("comment_les_effacer"),
    "l'archive ne dit plus comment effacer aussi la bouche (« retirer aussi " +
      "ma place dans ce foyer »): un droit qu'on ne nomme pas ne s'exerce pas.",
  );
  // Et le README de l'archive le nomme: un fichier qu'aucune ligne n'annonce
  // n'est pas lu. DANS LES DEUX PACKS — un README anglais qui l'oublierait
  // laisserait la moitié des utilisateurs sans mention du fichier où survit
  // leur date de naissance.
  const readme = await exportReadmeSource();
  assertEquals(
    readme.split("mon_foyer.json       :").length - 1,
    2,
    "le README de l'archive n'annonce plus ce fichier dans ses DEUX packs.",
  );
});

/**
 * LE CORPS DE LA PURGE **TELLE QU'ELLE TOURNE**, pas telle qu'elle a été écrite.
 *
 * ⚠️ CE LECTEUR A ÉTÉ RÉÉCRIT LE 2026-08-12, ET LE MOTIF EST LE DÉFAUT QU'IL
 * VENAIT DE PRENDRE. Il lisait `20260811040000_household_detachment.sql` en
 * dur — la migration qui a CRÉÉ `keel_household_purge_user`. Le lot du corps par
 * bouche (`20260812220000`) la REMPLACE (`create or replace`), donc le test
 * continuait d'asserter sur une définition que la base n'exécute plus: vert, et
 * aveugle à tout ce que la nouvelle version fait ou cesse de faire.
 *
 * Il balaie donc les migrations dans l'ORDRE et garde la DERNIÈRE définition.
 * C'est la seule forme qui suit la fonction quand elle déménage — et elle
 * déménagera encore.
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
    const at = sql.indexOf("create or replace function public.keel_household_purge_user");
    if (at < 0) continue;
    const end = sql.indexOf("comment on function public.keel_household_purge_user", at);
    body = sql.slice(at, end > at ? end : undefined);
    from = name;
  }
  assert(body !== "", "la purge a disparu de toutes les migrations — test à réviser");
  // Nommée dans la sortie: quand ce test rougit, la première question est
  // « quelle version lisait-il ? ».
  console.log(`[household_export_test] purge lue dans ${from}`);
  return body;
}

Deno.test("C3 ③ — LE DÉTACHEMENT RESTE LA RÈGLE (D3), et la purge ne l'a pas changée", async () => {
  // Le cas qui PASSE de l'autre côté: si un jour quelqu'un décide d'effacer la
  // date, c'est ici que ça se verra — et le texte d'export ci-dessus deviendra
  // faux au même instant.
  const body = await latestPurgeBody();
  assert(
    body.includes("set user_id = null"),
    "la purge ne DÉTACHE plus: D3 est renversé, et la phrase d'export ment.",
  );
  assertEquals(
    body.includes("birth_date = null"),
    false,
    "la purge efface désormais la date de naissance: c'est peut-être juste, " +
      "mais alors `ce_qui_survit_a_la_suppression` doit être réécrit — cette " +
      "assertion est là pour que les deux ne puissent pas diverger en silence.",
  );
});

// ===========================================================================
// LE CORPS DANS LE FOYER (20260812220000) — la table la plus sensible du
// domaine, réclamée par l'export ET par la purge dès sa migration.
//
// Le trou n°10 du README portait sur six tables de foyer absentes de l'export.
// Celle-ci porte taille, poids et sexe — y compris de MINEURS, y compris de
// bouches qui n'ont jamais eu de compte. La laisser dehors aurait aggravé le
// trou au lieu de le fermer.
// ===========================================================================

Deno.test("RGPD — `household_member_bodies` EST DANS L'EXPORT", async () => {
  const src = await exportSource();
  assert(
    src.includes('"household_member_bodies"'),
    "la table qui porte taille, poids et sexe — mineurs compris — n'est " +
      "exportée nulle part. C'est le trou n°10, aggravé.",
  );
  const scopeSrc = await exportScopeSource();
  const at = scopeSrc.indexOf("householdMemberBody:");
  assert(at >= 0, "l'allowlist de colonnes du corps a disparu");
  const scope = scopeSrc.slice(at, at + 400);
  for (const column of ["height_cm", "weight_kg", "gender"]) {
    assert(
      scope.includes(column),
      `${column} n'est plus exportée. L'allowlist est PAR COLONNE: une colonne ` +
        `absente ne sort pas, en silence.`,
    );
  }
});

Deno.test("RGPD — le corps exporté est LE SIEN, jamais celui du foyer", async () => {
  // ⚠️ LA SEULE FAÇON DE RENDRE CE LOT PIRE QUE LE TROU QU'IL FERME. La table
  // n'a pas de `user_id`: elle est lue PAR `member_id`. Nourrir cette lecture
  // des `member_id` du ROSTER mettrait le poids de ses enfants et de son
  // conjoint dans SON archive — une divulgation médicale sur des tiers, servie
  // par le droit d'accès de quelqu'un d'autre.
  const src = await exportSource();
  const at = src.indexOf('"household_member_bodies"');
  assert(at >= 0, "la lecture du corps a disparu");
  // ⚠️ BORNÉ PAR LA FIN DE L'APPEL, pas par un nombre de caractères. Un
  // `at + 500` écrit à la main a déjà raté `"recorded_at"` ici dès qu'un
  // commentaire s'est allongé — c'est-à-dire qu'il aurait fini par rendre vert
  // un appel dont il ne lisait plus la moitié.
  const end = src.indexOf("\n  );", at);
  assert(end > at, "l'appel n'a plus la forme attendue — test à réviser");
  const call = src.slice(at, end);
  assert(
    call.includes('"member_id"'),
    "la lecture n'est plus faite par `member_id`.",
  );
  assert(
    call.includes("householdMembership"),
    "les identifiants ne viennent plus de `householdMembership` — c'est-à-dire " +
      "de la lecture DÉJÀ scopée sur `user_id = <lui>`. Toute autre source " +
      "(roster, foyer) exporte le corps d'autrui.",
  );
  assert(
    !call.includes("roster"),
    "un roster nourrit la liste d'identifiants: l'export d'une personne " +
      "divulgue le corps des autres bouches du foyer.",
  );
  // Cette table n'a pas de `created_at` — même piège que `joined_at`, déjà payé
  // une fois sur `household_members`.
  assert(
    call.includes('"recorded_at"'),
    "le tri est revenu sur `created_at`, qui n'existe pas sur cette table: " +
      "l'export rend du vide sans le dire, sur des données corporelles.",
  );
});

Deno.test("RGPD — LA PURGE EFFACE LE CORPS, dans les DEUX branches", async () => {
  // ⚠️ ARBITRAGE DIFFÉRENT DE CELUI DE `birth_date`, ET C'EST VOULU. Prénom et
  // date SURVIVENT (D3: ils répondent à « pour qui je cuisine », les effacer
  // dégraderait la composition d'un foyer que la personne quitte). Une taille et
  // un poids, non: ce sont des métriques d'une personne qui a quitté le produit.
  //
  // DEUX branches, parce que la purge en a deux — « je pars avec ma place » et
  // « ma bouche reste ». Un seul `delete` laisserait le corps derrière dans
  // l'autre, et c'est précisément la branche NOMINALE (le détachement).
  const body = await latestPurgeBody();
  const deletes = body.split("delete from public.household_member_bodies").length - 1;
  assertEquals(
    deletes,
    2,
    `la purge efface le corps ${deletes} fois au lieu de 2: une de ses deux ` +
      `branches laisse taille et poids derrière un compte supprimé.`,
  );
});

Deno.test("RGPD — L'EXPORT DIT AUSSI CE QU'IL EFFACE", async () => {
  // Un export qui n'énumère que ce qu'il GARDE laisse croire qu'il garde tout.
  // La taille et le poids sont le seul endroit du foyer où la réponse est
  // « non » — c'est la ligne qu'une personne inquiète vient chercher.
  const src = await exportSource();
  assert(
    src.includes("mon_corps_pour_les_parts"),
    "le corps n'est pas rendu dans `mon_foyer.json`.",
  );
  assert(
    src.includes("ce_qui_est_efface"),
    "l'archive dit ce qui survit et se tait sur ce qui est effacé: le lecteur " +
      "en déduit qu'on garde tout.",
  );
});
