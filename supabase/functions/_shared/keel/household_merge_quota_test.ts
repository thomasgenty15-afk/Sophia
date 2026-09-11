/**
 * L7 — LE PLAFOND DE FUSIONS (D11): `N + 3` par foyer et par semaine ISO.
 *
 * ⚠️ CE FICHIER NE TESTE PAS L'ARITHMÉTIQUE DU PLAFOND, ET C'EST VOLONTAIRE.
 * `N`, le `+ 3` et le lundi ISO vivent en base (migration 20260812170000), qui
 * les exerce elle-même dans son bloc de contrôle: cinq réclamations qui
 * passent, la sixième qui mord, la semaine suivante qui repart. Les tester ici
 * demanderait de les RECOPIER en TypeScript — c'est-à-dire de fabriquer le
 * second plafond que ce lot existe pour ne pas avoir.
 *
 * Ce qui se teste ici, et qui ne se teste QUE ici:
 *   1. la relecture du verdict (`parseMergeQuota`), y compris ses refus;
 *   2. la phrase du refus — « rien n'est effacé », et quand ça repart;
 *   3. la POSITION et la FORME des deux points de contrôle dans le générateur;
 *   4. le fait que la lane individuelle n'y touche pas;
 *   5. le fait qu'aucun fichier du produit ne connaît le nombre.
 */
// ⟳ 2026-09-11 · LOT 7 — LES CAS QUI N'ÉPROUVAIENT QUE `generate-meal-v1`
// SONT PARTIS AVEC ELLE. Aucune assertion métier n'a été retirée pour faire
// taire un rouge: chacun avait son jumeau FOYER, qui reste. Le détail de
// l'audit est dans `scratchpad/2026-09-11-LOT7-SUPPRESSION/`.
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  MERGE_QUOTA_EXHAUSTED,
  type MergeQuotaState,
  mergeQuotaRefusalDetail,
  parseMergeQuota,
} from "./household_merge_quota.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function source(rel: string): Promise<string> {
  return stripComments(await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR)));
}

// ===========================================================================
// 1. RELIRE LE VERDICT DE LA BASE
// ===========================================================================

/**
 * ⚠️ RECOPIÉ DE LA MIGRATION, PAS DÉRIVÉ DU PARSEUR. Si ce décor était
 * construit à partir de `MergeQuotaState`, il resterait vrai le jour où la
 * forme rendue par `keel_household_merge_quota_state` change — c'est-à-dire
 * exactement quand il devrait tomber.
 */
const RPC_STATE = {
  ok: true,
  week_start: "2026-08-10",
  used: 2,
  limit: 5,
  remaining: 3,
  exhausted: false,
  resets_on: "2026-08-17",
};

Deno.test("LE CAS QUI PASSE: l'état rendu par la base se relit tel quel", () => {
  const state = parseMergeQuota(RPC_STATE);
  assert(state !== null);
  assertEquals(state.weekStart, "2026-08-10");
  assertEquals(state.used, 2);
  assertEquals(state.limit, 5);
  // RELU, PAS RECALCULÉ. `limit - used` serait une seconde arithmétique pour un
  // nombre que la base a déjà donné — et deux nombres plausibles ne se
  // départagent pas à l'œil.
  assertEquals(state.remaining, 3);
  assertEquals(state.resetsOn, "2026-08-17");
  assertEquals(state.exhausted, false);
});

Deno.test("la semaine PLEINE se relit pleine", () => {
  const state = parseMergeQuota({
    ...RPC_STATE,
    used: 5,
    remaining: 0,
    exhausted: true,
  });
  assertEquals(state?.exhausted, true);
  assertEquals(state?.remaining, 0);
});

Deno.test("le REFUS de la réclamation n'a pas d'`exhausted`, et se déduit", () => {
  // ⚠️ LES DEUX FONCTIONS SQL NE RENDENT PAS LA MÊME FORME: la LECTURE porte
  // `exhausted`, la RÉCLAMATION ne rend que son `reason`. Le générateur relit
  // donc son refus avec `ok: true` forcé, et c'est `used >= limit` qui tranche.
  // Sans ce repli, un refus de course arriverait à l'écran comme un état où il
  // reste de la place.
  const state = parseMergeQuota({
    ok: true,
    week_start: "2026-08-10",
    used: 5,
    limit: 5,
    remaining: 0,
    resets_on: "2026-08-17",
  });
  assertEquals(state?.exhausted, true);
});

Deno.test("un état ILLISIBLE rend `null`, jamais un plafond inventé", () => {
  // Chacun de ces cas a rendu un plafond faux dans une version précédente de ce
  // parseur, et le plus dangereux est le dernier: `limit` manquante devenait
  // « zéro », donc « toujours plein », donc plus une seule proposition.
  assertEquals(parseMergeQuota(null), null);
  assertEquals(parseMergeQuota("nope"), null);
  assertEquals(parseMergeQuota([1, 2]), null);
  assertEquals(parseMergeQuota({ ok: false, reason: "local_date_required" }), null);
  assertEquals(parseMergeQuota({ ...RPC_STATE, limit: undefined }), null);
  assertEquals(parseMergeQuota({ ...RPC_STATE, used: -1 }), null);
  assertEquals(parseMergeQuota({ ...RPC_STATE, week_start: "lundi" }), null);
  assertEquals(parseMergeQuota({ ...RPC_STATE, resets_on: null }), null);
});

// ===========================================================================
// 2. LA PHRASE DU REFUS — LE PATRON DE `household_frozen`
// ===========================================================================

const FULL: MergeQuotaState = {
  weekStart: "2026-08-10",
  used: 5,
  limit: 5,
  remaining: 0,
  resetsOn: "2026-08-17",
  exhausted: true,
};

Deno.test("le refus dit que RIEN N'EST EFFACÉ, et quand ça repart", () => {
  const detail = mergeQuotaRefusalDetail(FULL);
  // ⚠️ LES TROIS CHOSES QUE `household_frozen` DIT, et pour la même raison: un
  // refus qui ne les dit pas se lit comme une panne, et on ouvre un ticket au
  // lieu d'attendre lundi.
  assert(
    detail.includes("Nothing has been deleted"),
    `le refus ne dit plus que rien n'est effacé: « ${detail} »`,
  );
  assert(
    detail.includes("2026-08-17"),
    `le refus ne dit plus QUAND ça repart: « ${detail} »`,
  );
  assert(
    detail.includes("5"),
    `le refus ne dit plus combien de fusions ont été faites: « ${detail} »`,
  );
  assert(
    detail.includes("no merge was started"),
    `le refus ne dit plus que la fusion n'a pas commencé: « ${detail} »`,
  );
});

Deno.test("sans état lisible, le refus reste une phrase — pas un trou", () => {
  // Le fail-open laisse passer, donc ce cas est rare; il n'est pas impossible
  // (course perdue + payload illisible). Une phrase avec `undefined` dedans
  // serait pire qu'une phrase vague.
  const detail = mergeQuotaRefusalDetail(null);
  assert(!detail.includes("undefined"), detail);
  assert(!detail.includes("null"), detail);
  assert(detail.includes("Nothing has been deleted"), detail);
});

// ===========================================================================
// 3. LA POSITION — CE QUI NE SE PROUVE QUE PAR LA SOURCE
// ===========================================================================

Deno.test("LE PLAFOND SE REFUSE ET SE RÉCLAME AVANT TOUT APPEL MODÈLE", async () => {
  // ⚠️ EN HTTP, UN REFUS TARDIF EST INDISCERNABLE D'UN REFUS PRÉCOCE — il est
  // juste, et c'est ce qui le rend invisible. Une fusion coûte 20 à 67 s; un
  // plafond atteint doit coûter des millisecondes.
  const src = await source("generate-household-meal-v1/index.ts");
  const model = src.indexOf("generateWithGemini(");
  assert(model >= 0, "appel modèle introuvable — test à réviser");
  for (
    const marker of [
      "keel_household_merge_quota_state",
      "keel_household_claim_merge_quota",
    ]
  ) {
    const at = src.indexOf(marker);
    assert(at >= 0, `${marker} introuvable — test à réviser`);
    assert(
      at < model,
      `${marker} est APRÈS le premier appel modèle: le plafond se paierait ` +
        `au prix d'une génération complète.`,
    );
  }
});

Deno.test("AUCUNE PORTE DE SORTIE ENTRE LA RÉCLAMATION ET LA DÉPENSE", async () => {
  // ⚠️ LE DÉFAUT QUE CE TEST EMPÊCHE, ET IL EST SILENCIEUX: une réclamation
  // posée trop tôt fait consommer une unité de quota à une requête qui sort
  // ensuite sur `no_coach`, `doctrine_unreadable` ou `local_day_unresolved`.
  // Le foyer perd des fusions sans rien recevoir, et personne ne peut le voir
  // — le compteur ne dit pas ce qu'il a payé.
  //
  // La SEULE sortie autorisée entre les deux est le refus du plafond lui-même
  // (la course perdue), et elle ne coûte rien puisqu'elle n'a rien réclamé.
  const src = await source("generate-household-meal-v1/index.ts");
  const claim = src.indexOf("keel_household_claim_merge_quota");
  const model = src.indexOf("generateWithGemini(");
  assert(claim >= 0 && model > claim, "réclamation ou modèle introuvable");
  const between = src.slice(claim, model);
  const exits = between.split("return jsonResponse(").length - 1;
  assertEquals(
    exits,
    1,
    `il y a ${exits} sorties entre la réclamation et l'appel modèle, au lieu ` +
      `d'une seule (le refus du plafond). Chaque sortie de plus consomme une ` +
      `fusion et ne rend rien.`,
  );
  assert(
    between.includes(MERGE_QUOTA_EXHAUSTED),
    "la seule sortie entre la réclamation et le modèle n'est plus le refus du " +
      "plafond: elle consomme une fusion sans rien rendre.",
  );
});

Deno.test("LE PLAFOND EST UN 429 QUI NE FAIT PAS D'INCIDENT", async () => {
  // `skipErrorLog`: UN PLAFOND ATTEINT N'EST PAS UN INCIDENT, exactement comme
  // un impayé. L1 a mesuré 15 lignes de `system_error_logs` au niveau `error`
  // pour des refus de paiement en une seule session de test.
  const src = await source("generate-household-meal-v1/index.ts");
  const refusals = src.split(`error: MERGE_QUOTA_EXHAUSTED`).length - 1;
  assertEquals(
    refusals,
    2,
    "il n'y a plus exactement deux refus de plafond (le rapide et celui de la " +
      "course perdue) — l'un des deux a disparu, ou un troisième est apparu " +
      "sans être relu.",
  );
  for (const at of [...src.matchAll(/error: MERGE_QUOTA_EXHAUSTED/g)]) {
    const tail = src.slice(at.index ?? 0, (at.index ?? 0) + 900);
    assert(
      /status:\s*429/.test(tail),
      "un refus de plafond ne rend plus 429: le statut cesse de dire de quoi " +
        "il s'agit, et l'écran ne peut plus le distinguer d'une panne.",
    );
    assert(
      /skipErrorLog:\s*true/.test(tail),
      "un refus de plafond écrit dans `system_error_logs`: un plafond atteint " +
        "n'est pas un incident, et le bruit noie les vrais.",
    );
  }
});

Deno.test("LA DÉFUSION ET LA COMPOSITION NE PAIENT PAS LE PLAFOND", async () => {
  // D11 dit « N + 3 FUSIONS ». La défusion RÉPARE une fusion (D8, première
  // sortie): la taxer ferait payer deux fois la même erreur. La reprise
  // collante, elle, n'est même pas un geste du maître (L5) — la compter lui
  // facturerait une décision qu'il n'a pas prise.
  //
  // LA GARDE EST STRUCTURELLE, PAS CONDITIONNELLE: la réclamation vit sous
  // `if (merge !== null)`, et `unmerge` comme `compose` n'y entrent jamais.
  const src = await source("generate-household-meal-v1/index.ts");
  const claim = src.indexOf("keel_household_claim_merge_quota");
  assert(claim >= 0, "réclamation introuvable — test à réviser");
  const before = src.slice(Math.max(0, claim - 600), claim);
  assert(
    /if\s*\(\s*merge\s*!==\s*null\s*\)/.test(before),
    "la réclamation n'est plus gardée par `merge !== null`: une défusion ou " +
      "une composition ordinaire consommerait une fusion du foyer.",
  );
  // Et le paramètre passé est bien la personne fusionnée, pas la défusionnée:
  // les confondre rendrait toute lecture du compteur trompeuse.
  const call = src.slice(claim, claim + 400);
  assert(
    /p_member:\s*merge\.member\.member_id/.test(call),
    "la réclamation ne nomme plus la personne fusionnée: `last_member_id` " +
      "désignerait quelqu'un d'autre, et une semaine suspecte deviendrait " +
      "illisible.",
  );
});

Deno.test("AUCUN FICHIER DU PRODUIT NE CALCULE `N + 3`", async () => {
  // ⚠️ « Compté en base, jamais dans le client. » Un plafond récité en
  // TypeScript est un plafond qui dérive: le jour où le `+ 3` bouge en base,
  // l'écran continue d'annoncer l'ancien, et les deux nombres sont plausibles.
  for (
    const rel of [
      "_shared/keel/household_merge_quota.ts",
      "_shared/keel/household_merge_notice.ts",
      "household-merge-notices-v1/index.ts",
      "generate-household-meal-v1/index.ts",
    ]
  ) {
    const src = await source(rel);
    for (
      const forbidden of [
        // le `+ 3`, sous ses formes écrivables
        /\blimit\s*[:=]\s*\d/,
        /\+\s*3\b/,
        // le `N`, qui est une lecture de base et pas un `count()` de plus
        /keel_household_active_accounts/,
        /keel_household_merge_quota_slack/,
      ]
    ) {
      assert(
        !forbidden.test(src),
        `${rel} contient ${forbidden}: le plafond se calcule désormais des ` +
          `deux côtés, et rien ne dira lequel ment.`,
      );
    }
  }
});

Deno.test("LE LECTEUR DE PROPOSITIONS LIT LE MÊME PLAFOND QUE LA GARDE", async () => {
  // L5 avait laissé le point d'accroche en toutes lettres: « quand le plafond
  // sera posé, la proposition devra le lire — sinon elle proposera une fusion
  // que le quota refuse ». La lecture passe par la MÊME fonction SQL que le
  // refus rapide du générateur: un second calcul aurait promis des fusions que
  // la garde refuse, et les deux nombres auraient été plausibles.
  const reader = await source("household-merge-notices-v1/index.ts");
  assert(
    reader.includes("keel_household_merge_quota_state"),
    "le lecteur de propositions ne lit plus le plafond: il proposera des " +
      "boutons qui rendront un 429.",
  );
  assert(
    /^\s*quota,\s*$/m.test(reader),
    "le lecteur lit le plafond mais ne le passe plus à `buildMergeNotices`: " +
      "il le lit pour rien.",
  );
  // ET IL NE RÉCLAME RIEN. Un lecteur qui réclamerait viderait le quota d'un
  // foyer à chaque rechargement d'écran.
  assert(
    !reader.includes("keel_household_claim_merge_quota"),
    "le lecteur de propositions RÉCLAME: ouvrir l'écran consommerait une " +
      "fusion, et la semaine se viderait sans qu'aucun plan ne soit écrit.",
  );
});
