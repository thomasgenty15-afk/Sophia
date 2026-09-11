/**
 * LES TREIZE APPELS DE PLAN SONT CONFIGURÉS AU MÊME ENDROIT — épingles (2026-09-10).
 *
 * Chantier: `docs/keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md`, lot 0.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE CES ÉPINGLES EMPÊCHENT, ET POURQUOI ELLES SONT DE POSITION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `planCallMeta` est pur et testé ailleurs; ça ne dit RIEN de l'endroit où il
 * tourne. Or l'endroit est tout le lot: avant lui, les deux lanes portaient
 * treize littéraux de méta recopiés à la main, et le défaut n'était pas qu'ils
 * DIVERGEAIENT — c'est qu'ils étaient tous d'accord sur les mêmes trois clés et
 * silencieux sur les quatre autres:
 *
 *   · aucun ne passait `maxRetries` ⇒ défaut **10** (`_shared/gemini.ts:1021`),
 *     multiplié par la chaîne de replis: jusqu'à trente appels HTTP pour UN
 *     appel logique, chacun à son plein timeout;
 *   · aucun ne bornait cette chaîne ⇒ elle finissait sur `gpt-5.4-mini`, le
 *     modèle que le banc du 2026-08-11 mesure comme le SEUL des cinq à servir
 *     des aliments interdits — et il partait sans que rien ne le dise;
 *   · aucun ne demandait de palier de service ⇒ `service_tier` n'a jamais été
 *     envoyé en vrai, malgré son lecteur, sa validation et ses tests;
 *   · aucun ne connaissait le temps dépensé par les douze autres.
 *
 * ⚠️ UNE CLÉ OUBLIÉE SUR UN SITE EST INVISIBLE: le site marche, il marche
 * simplement AUTREMENT. La seule garde possible est de compter — autant de
 * constructeurs que d'appels — et de refuser tout littéral qui reviendrait.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { planCallEffort, planCallMeta, PLAN_CALL_KINDS } from "./plan_budget.ts";
import {
  KEEL_GENERATION_FALLBACK_MODEL_DEFAULT,
  KEEL_GENERATION_MODEL_DEFAULT,
  PLAN_COMPOSITION_REASONING_EFFORT,
  PLAN_MODEL_MAX_RETRIES,
  PLAN_REASONING_EFFORT,
  PLAN_REPAIR_REASONING_EFFORT,
  PLAN_SERVICE_TIER,
} from "./generation_model.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const HOUSE = stripComments(
  await Deno.readTextFile(
    new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
  ),
);
// ⟳ 2026-09-11 · LOT 7 — LA LANE INDIVIDUELLE A ÉTÉ SUPPRIMÉE. Les cas qui
// n'éprouvaient qu'elle partent avec elle; la boucle reste sur un élément,
// exprès: la propriété est « sur CHAQUE lane », pas « sur celle-ci ».
const LANES: readonly [string, string][] = [
  ["generate-household-meal-v1", HOUSE],
];

function count(src: string, needle: string): number {
  return src.split(needle).length - 1;
}

/**
 * Le verdict de câblage d'une lane. Il rend la LISTE de ce qui manque, pas un
 * booléen: un test qui dit « faux » sans dire quoi envoie relire 14 000 lignes.
 */
export function laneConfigVerdict(src: string): string[] {
  const missing: string[] = [];
  const calls = count(src, "generateWithGemini(");
  const metas = count(src, "planCallMeta({");
  if (calls === 0) missing.push("aucun_appel_modele");
  if (metas !== calls) missing.push(`meta_manquante:${metas}/${calls}`);
  if (count(src, "model: keelGenerationModel()") > 0) missing.push("litteral_model");
  if (count(src, "reasoningEffort:") > 0) missing.push("litteral_effort");
  if (count(src, "httpTimeoutMs:") > 0) missing.push("litteral_timeout");
  if (count(src, "createPlanBudget({") !== 1) missing.push("budget_absent_ou_double");
  return missing;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① AUTANT DE CONSTRUCTEURS QUE D'APPELS, DANS LES DEUX LANES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ CÂBLAGE — chaque appel modèle d'une lane de plan passe par `planCallMeta`", () => {
  for (const [name, src] of LANES) {
    assertEquals(laneConfigVerdict(src), [], `${name} : câblage incomplet`);
  }
});

Deno.test("⛔ CÂBLAGE — le compte des appels est celui qu'on croit (8 pour le foyer)", () => {
  // Si ce nombre bouge, ce n'est pas ce test qu'on ajuste: c'est un appel
  // modèle de plus dans une requête dont le budget en autorise deux après la
  // composition. Il doit être vu.
  // ⟳ 2026-09-11 · LOT 7 — les 5 appels de la lane individuelle sont partis
  // avec elle. Le compte du foyer, lui, n'a pas bougé.
  assertEquals(count(HOUSE, "generateWithGemini("), 8);
});

Deno.test("⛔ CÂBLAGE — la MUTATION fait rougir : un littéral qui revient est détecté", () => {
  // Sans ça, ces `count` seraient des comparaisons de nombres qui pourraient
  // devenir vraies ensemble — le mode d'échec exact du gate du 2026-08-12.
  // ⟳ 2026-09-11 · LOT 7 — la mutation porte sur la lane qui reste. Elle
  // prouve la même chose: un littéral qui revient est DÉTECTÉ, et ces `count`
  // ne sont donc pas des comparaisons de nombres qui deviendraient vraies
  // ensemble — le mode d'échec exact du gate du 2026-08-12.
  const mute = HOUSE.replace(
    "planCallMeta({",
    "{\n          model: keelGenerationModel(),\n          reasoningEffort: PLAN_REASONING_EFFORT,\n          httpTimeoutMs: PLAN_HTTP_TIMEOUT_MS,",
  );
  const v = laneConfigVerdict(mute);
  assert(v.includes("litteral_model"), `la mutation n'est pas vue : ${v.join(",")}`);
  assert(v.includes("litteral_effort"));
  assert(v.includes("litteral_timeout"));
});

Deno.test("⛔ CÂBLAGE — retirer le budget d'une lane fait rougir", () => {
  const mute = HOUSE.replace("createPlanBudget({", "({");
  assert(laneConfigVerdict(mute).includes("budget_absent_ou_double"));
});

// ═══════════════════════════════════════════════════════════════════════════
// ② CE QUE LA MÉTA PORTE VRAIMENT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("la méta d'un appel de plan porte le palier, le modèle et les replis bornés", () => {
  const m = planCallMeta({
    source: "x",
    requestId: "r",
    userId: "u",
    kind: "composition",
    capMs: 120_000,
  });
  assertEquals(m.model, KEEL_GENERATION_MODEL_DEFAULT);
  assertEquals(m.serviceTier, PLAN_SERVICE_TIER);
  assertEquals(m.maxRetries, PLAN_MODEL_MAX_RETRIES);
  assertEquals(m.secondFallbackModel, KEEL_GENERATION_FALLBACK_MODEL_DEFAULT);
  assertEquals(m.thirdFallbackModel, KEEL_GENERATION_FALLBACK_MODEL_DEFAULT);
  assertEquals(m.httpTimeoutMs, 120_000);
  assertEquals(m.userId, "u");
});

Deno.test("⛔ LE REPLI N'EST JAMAIS `gpt-5.4-mini` — c'est le modèle mesuré qui sert des interdits", () => {
  // Banc du 2026-08-11, 180 générations, 5 modèles: `gpt-5.4-mini` est le SEUL
  // à servir `Greek yogurt` à un intolérant au lactose (3 fois sur 3), du
  // poulet et du bœuf à un végétarien, de la sauce soja à un foyer sans gluten.
  // Il occupait l'emplacement n° 2 de la chaîne de replis, en silence.
  for (const kind of PLAN_CALL_KINDS) {
    const m = planCallMeta({ source: "x", requestId: "r", kind, capMs: 1_000 });
    for (const v of [m.model, m.fallbackModel, m.secondFallbackModel, m.thirdFallbackModel]) {
      assert(
        !String(v ?? "").includes("gpt-5.4-mini"),
        `un repli pointe encore sur gpt-5.4-mini (${kind})`,
      );
    }
  }
});

Deno.test("l'effort dépend de la nature de l'appel, et de rien d'autre", () => {
  assertEquals(planCallEffort("composition"), PLAN_REASONING_EFFORT);
  assertEquals(planCallEffort("composition_household"), PLAN_COMPOSITION_REASONING_EFFORT);
  assertEquals(planCallEffort("repair"), PLAN_REPAIR_REASONING_EFFORT);
});

Deno.test("le vocabulaire des natures d'appel est FERMÉ", () => {
  assertEquals([...PLAN_CALL_KINDS], [
    "composition",
    "composition_household",
    "repair",
  ]);
});

Deno.test("sans budget, le timeout vaut le plafond — un appelant non câblé ne tombe pas à zéro", () => {
  const m = planCallMeta({ source: "x", requestId: "r", kind: "repair", capMs: 300_000 });
  assertEquals(m.httpTimeoutMs, 300_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE PALIER NE DÉBORDE PAS SUR LE RESTE DU PRODUIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ le palier `fast` ne déborde PAS sur le reste du produit", async () => {
  // Le poser globalement (`KEEL_OPENAI_SERVICE_TIER`) déplacerait le coût et la
  // latence du chat, du memorizer et des flows pour un besoin qui n'existe que
  // sur le chemin d'un PLAN. Aucune source de conversation ne demande de palier.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 — `composition_fill_io.ts` SORT DE CETTE LISTE, ET C'EST MESURÉ
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ IL Y ÉTAIT, ET LE CHANTIER DIT L'INVERSE. Le § 9 de
  // `PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md` demande d'« appliquer Fast AUSSI aux
  // appels auxiliaires OpenAI effectués pour un plan ». Le banc du lot 8 a
  // compté ce que ça coûtait: **19 transmissions sur 63 partaient sans
  // palier**, toutes des remplissages de composition. Un plan ATTEND ce
  // remplissage — le laisser en file standard allonge le plan par son maillon
  // le moins prioritaire pendant que tout le reste est prioritaire.
  //
  // ⚠️ ET LA PROPRIÉTÉ D'ORIGINE TIENT TOUJOURS, parce qu'elle a été VÉRIFIÉE
  // et pas supposée: `askCompositionFill` — le seul appel modèle de ce
  // module — n'est atteint que par `repairPlanComposition` et
  // `fillPlanComposition`, dont les seuls appelants sont les deux
  // générateurs. `tracking_v2_io.ts` et `meal-energy-v1` n'importent que
  // `indexForReading`, qui est une LECTURE. Le palier ne peut donc pas
  // atteindre une conversation.
  const suspects = ["sophia-brain/index.ts"];
  for (const rel of suspects) {
    let src: string;
    try {
      src = await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR));
    } catch {
      continue; // le fichier a bougé : ce n'est pas à ce test de le dire
    }
    assertEquals(
      count(stripComments(src), "serviceTier:"),
      0,
      `${rel} demande un palier de service — ce lot ne le prévoit pas`,
    );
  }

  // ⛔ LA MOITIÉ QUI REMPLACE L'INTERDICTION: le remplissage porte le palier,
  // et il sait le LÂCHER. Rien ici ne peut vérifier contre l'API réelle que
  // `compositionFillModel()` accepte `service_tier` (§ 10 du chantier: aucune
  // campagne payante); un refus du fournisseur ferait perdre le remplissage
  // entier, c'est-à-dire l'énergie d'un aliment inconnu.
  const fill = stripComments(
    await Deno.readTextFile(new URL("_shared/keel/composition_fill_io.ts", FUNCTIONS_DIR)),
  );
  assertEquals(count(fill, "serviceTier: PLAN_SERVICE_TIER"), 1, fill.slice(0, 0));
  assertEquals(count(fill, "appel(false)"), 1);
});

// ⛔ ET AUCUN AUTRE MODULE PARTAGÉ NE S'EN EST SAISI. Le palier vit sur trois
// fichiers, nommément; un quatrième qui apparaît sans être lu est le début
// d'un réglage global déguisé.
Deno.test("le palier vit sur DEUX fichiers de `_shared/keel`, et la liste ne grandit pas", async () => {
  const dir = new URL("_shared/keel/", FUNCTIONS_DIR);
  const porteurs: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith("_test.ts")) continue;
    const src = stripComments(await Deno.readTextFile(new URL(entry.name, dir)));
    if (src.includes("serviceTier")) porteurs.push(entry.name);
  }
  porteurs.sort();
  // ⚠️ `generation_model.ts` N'EST PAS DANS CETTE LISTE, ET CE N'EST PAS UN
  // OUBLI: il DÉFINIT `PLAN_SERVICE_TIER` mais ne nomme `serviceTier` que dans
  // sa prose, et `stripComments` retire la prose. La liste compte les
  // PORTEURS — ceux qui posent le champ sur un appel — pas ceux qui en
  // parlent. Le transport lui-même (`_shared/gemini.ts`) vit hors de ce
  // dossier, donc hors de ce balayage.
  assertEquals(porteurs, [
    // ⟳ 2026-09-10 · § 9 — l'appel auxiliaire d'un plan.
    "composition_fill_io.ts",
    // La table des natures d'appel de plan.
    "plan_budget.ts",
  ]);
});
