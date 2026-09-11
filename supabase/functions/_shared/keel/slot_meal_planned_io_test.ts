// ═══════════════════════════════════════════════════════════════════════════
// LE LECTEUR ET L'ÉCRIVAIN D'UNE COCHE LISENT LA MÊME COLONNE
//
// ⚠️ CE FICHIER EXISTE À CAUSE D'UN DÉFAUT MESURÉ EN RUN RÉEL LE 2026-09-08,
// ET IL N'AURAIT PAS PU ÊTRE ATTRAPÉ AUTREMENT.
//
// `answeredDishIndexes` interrogeait `protocol_events.key`. Cette colonne
// N'EXISTE PAS: la clé de coche vit dans `source_message_id`, parce que c'est
// là que `writeMealTick` (`evening_strip_io.ts`) l'écrit.
//
// Ce qui rend le défaut coûteux, c'est ce qui s'est passé ensuite. La requête
// levait, le fail-closed du lecteur tenait TOUT pour répondu — la bonne
// direction: une question qui manque plutôt qu'une question déjà répondue —
// et la question du créneau COMPOSÉ ne partait donc jamais. Elle était
// remplacée, en silence, par celle du créneau NON COUVERT: « rien n'était
// prévu ce soir » à quelqu'un dont le plan compose un dîner.
//
// ⛔ ET LE TEST UNITAIRE ÉTAIT VERT. Son stub répondait à `key`, parce que
// c'est ce que le code demandait. Un décor qui ment sur la FORME de la donnée
// cache très exactement le défaut qu'il devrait montrer — la cicatrice est
// déjà écrite dans `household_turn_context_test.ts` à propos de `plan_kind`,
// et elle vient d'être repayée.
//
// La garde ci-dessous ne peut donc PAS être un stub: elle compare le LECTEUR à
// l'ÉCRIVAIN, tous deux lus sur le disque. C'est la seule forme qui aurait
// rougi.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

const HERE = import.meta.url;
const read = async (rel: string) =>
  (await Deno.readTextFile(new URL(rel, HERE)))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

Deno.test("LA COLONNE DE LA COCHE — le lecteur lit ce que l'écrivain écrit", async () => {
  const writer = await read("./evening_strip_io.ts");
  const reader = await read("./slot_meal_planned_io.ts");

  // L'écrivain: `source_message_id: key`, où `key = mealTickKey(...)`.
  assert(
    /source_message_id:\s*key/.test(writer),
    "`writeMealTick` n'écrit plus la clé dans `source_message_id` — si elle a " +
      "déménagé, le lecteur doit déménager avec elle, dans le même commit.",
  );

  // Le lecteur: la MÊME colonne, dans le `select` ET dans le filtre.
  assert(
    reader.includes('.select("source_message_id")'),
    "`answeredDishIndexes` ne SÉLECTIONNE plus `source_message_id`",
  );
  assert(
    reader.includes('.in("source_message_id", keys)'),
    "`answeredDishIndexes` ne FILTRE plus sur `source_message_id`",
  );

  // ⛔ ET SURTOUT: il ne demande plus `key`. C'est la colonne inexistante qui a
  // fait taire la question pendant tout un lot.
  assertEquals(
    /\.(select|in)\(\s*"key"/.test(reader),
    false,
    "`protocol_events.key` N'EXISTE PAS. La requête lève, le fail-closed tient " +
      "tout pour répondu, et la question du créneau composé ne part jamais — " +
      "remplacée en silence par celle du créneau non couvert.",
  );
});

Deno.test("⛔ LE FAIL-CLOSED EST NOMMÉ, ET IL JOURNALISE LISIBLEMENT", async () => {
  const reader = await read("./slot_meal_planned_io.ts");

  // La direction est la bonne — mieux vaut une question qui manque qu'une
  // question déjà répondue (R2) — mais elle rend les pannes MUETTES. Le
  // journal est donc la seule chose qui les distingue d'une journée calme.
  assert(reader.includes("keel.slot_meal.ticks_unreadable"), "tag absent");
  assert(reader.includes("return new Set(wanted)"), "le fail-closed a changé");

  // ⚠️ ET IL DÉPLIE L'ERREUR. Une erreur PostgREST n'est pas une `Error`:
  // `String(...)` dessus rend `[object Object]`, et le journal ne dit alors PAS
  // que la colonne n'existe pas. C'est ce qui a fait chercher ailleurs pendant
  // le run du 2026-09-08.
  assert(
    reader.includes("errorText(error)"),
    "l'erreur n'est plus dépliée: `[object Object]` au moment où il faut tout dire",
  );
  assertEquals(
    /error:\s*error instanceof Error \? error\.message : String\(error\)/
      .test(reader),
    false,
    "le dépliage naïf est revenu",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LA MÊME FAUTE, UNE TABLE PLUS LOIN — MESURÉE LE 2026-09-09
//
// `memberIdOf` (`slot_meal_io.ts`) demandait `household_members.id`. Cette
// colonne n'existe pas: la table est clavetée `(household_id, user_id)` et
// l'identité d'une bouche s'appelle `member_id` depuis `20260810120000`.
// Vérifié contre la base locale:
//
//     select id from public.household_members limit 1;
//     ERROR: column "id" does not exist
//
// L'effet est le jumeau exact de celui du haut de ce fichier: PostgREST lève,
// `resolveMemberId` est attrapé, `memberId` vaut `null`, et `dishIsForMouth`
// écarte TOUT plat dédié. Or un plan de foyer ne porte que des plats dédiés —
// une boîte par bouche. La question du repas ne pouvait donc jamais nommer un
// plat de foyer, et le compte-rendu ressemblait à un canal qui se tait.
//
// ⛔ LA GARDE LIT LA MIGRATION, PAS UNE LISTE RECOPIÉE. Une liste de colonnes
// tapée ici serait une seconde source de vérité: elle resterait verte le jour
// où la colonne est renommée en base, c'est-à-dire au seul moment qui compte.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LA BOUCHE — `memberIdOf` nomme une colonne que la migration crée", async () => {
  const io = await read("./slot_meal_io.ts");

  // Ce que le module demande à `household_members`.
  const asked = [
    ...io.matchAll(
      /\.from\("household_members"\)\s*\.select\("([a-z_]+)"\)/g,
    ),
  ].map((m) => m[1]);
  assertEquals(
    asked.length,
    1,
    "`slot_meal_io.ts` ne lit plus exactement une fois `household_members` — " +
      "cette garde vise `memberIdOf` et doit être révisée avec lui.",
  );

  // Ce que la base porte vraiment. `20260810120000` est la migration qui donne
  // son identité à une bouche; c'est elle qu'on lit, jamais une liste à jour
  // « de mémoire ».
  const migration = await Deno.readTextFile(
    new URL(
      "../../../migrations/20260810120000_household_member_identity.sql",
      HERE,
    ),
  );
  assert(
    /add column if not exists member_id uuid/.test(migration),
    "`member_id` n'est plus créée par cette migration — la garde vise le " +
      "mauvais fichier, et il faut la repointer avant de la croire.",
  );

  assertEquals(
    asked[0],
    "member_id",
    `\`memberIdOf\` demande \`${asked[0]}\`. La colonne d'identité d'une ` +
      "bouche est `member_id`; `id` n'existe pas, et la demander fait lever " +
      "PostgREST, ce que le fail-closed de l'appelant transforme en « aucun " +
      "plat dédié » — silencieusement.",
  );
});
