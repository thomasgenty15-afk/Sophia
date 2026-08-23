/**
 * ══════════════════════════════════════════════════════════════════════════
 * `D3′-c` — LA GARDE QUI RELIE LE TEXTE D'ARBITRAGE À SON MILLÉSIME.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno test --allow-read --allow-env \
 *     supabase/functions/_shared/keel/precedence_binding_test.ts
 *
 * ── ⛔ CE QUE CETTE GARDE ATTRAPE, ET QU'AUCUNE AUTRE N'ATTRAPAIT ──────────
 * `D3′` a réécrit le bloc d'arbitrage de la lane foyer sans bumper
 * `HOUSEHOLD_PROMPT_VERSION`. Douze lignes en base disent `v21` et n'ont PAS
 * vu ce texte. Aucun test du dépôt ne reliait les deux: `precedence_tail_test`
 * garde le TEXTE, `householdEnvyWiring.int.test` garde le JETON (par un regex
 * `v1[89]|v[2-9]\d` qui reste vert sur n'importe quel bump), et personne ne
 * gardait l'ACCORD.
 *
 * ── ⚠️ POURQUOI L'ÉPREUVE ② EST ÉCRITE SUR UNE TABLE INJECTÉE ─────────────
 * §⑨ n° 105 — « un test paramétré par sa propre constante reste vert quand on
 * change la constante ». Une garde qui ne ferait que
 * `assertEquals(digest(), PIN)` serait exactement ça: elle passerait pour
 * n'importe quelle paire (texte, pin) mise à jour ensemble. Les cas qui
 * ROUGISSENT sont donc joués sur des tables SYNTHÉTIQUES, où le texte bouge
 * pendant que le jeton ne bouge pas — la situation réelle du 2026-08-22.
 *
 * ── LE CAS QUI PASSE ──────────────────────────────────────────────────────
 * L'épreuve ① est l'état du dépôt: le millésime vivant est inscrit, et son
 * empreinte est celle du texte que la lane foyer sert aujourd'hui. Si le
 * module rendait `text_moved_without_bump` toujours, ① rougit; s'il rendait
 * `ok` toujours, ② et ③ rougissent.
 */

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import { buildPrecedenceBlock } from "./precedence_tail.ts";
import {
  HOUSEHOLD_ARBITRATION_BY_VERSION,
  precedenceBindingVerdict,
  precedenceDigest,
  readHouseholdPromptVersion,
  sha256Hex,
} from "./precedence_binding.ts";

/**
 * ⛔ LE JETON SE LIT DANS LA SOURCE, IL NE S'IMPORTE PAS — et ce n'est pas un
 * scrupule, c'est une mesure. `household_meal_generation.ts` importe
 * `@supabase/supabase-js`; la première version de cette garde l'importait et
 * MOURAIT dans un arbre extrait de `git archive` sur
 * « Could not find a matching package for 'npm:@supabase/realtime-js' ». §⑨
 * n° 92: une garde qu'un clone ne peut pas rejouer n'est pas une garde.
 */
const SOURCE_FOYER = new URL("./household_meal_generation.ts", import.meta.url);
const HOUSEHOLD_PROMPT_VERSION = readHouseholdPromptVersion(
  await Deno.readTextFile(SOURCE_FOYER),
);

// ---------------------------------------------------------------------------
// ① LE CAS QUI PASSE — l'état du dépôt, texte vivant contre jeton vivant
// ---------------------------------------------------------------------------

Deno.test("① le millésime vivant est inscrit, et son empreinte est le texte servi", async () => {
  const digest = await precedenceDigest("household");
  const v = precedenceBindingVerdict(HOUSEHOLD_PROMPT_VERSION, digest);
  assertEquals(
    v.verdict,
    "ok",
    `HOUSEHOLD_PROMPT_VERSION = « ${HOUSEHOLD_PROMPT_VERSION} » et le bloc d'arbitrage ` +
      `foyer ne s'accordent pas (${JSON.stringify(v)}). Si tu viens de changer le TEXTE: ` +
      `bump HOUSEHOLD_PROMPT_VERSION *et* ajoute son empreinte dans ` +
      `HOUSEHOLD_ARBITRATION_BY_VERSION. N'ÉDITE PAS une entrée existante: elle décrit ` +
      `des lignes déjà écrites en base.`,
  );
});

// ---------------------------------------------------------------------------
// ② LE CAS QUI ROUGIT — le texte bouge, le jeton ne bouge pas
// ---------------------------------------------------------------------------

Deno.test("② un texte déplacé sous un jeton immobile rend `text_moved_without_bump`", async () => {
  // La situation EXACTE du 2026-08-22 18:51: le bloc foyer réécrit, le jeton
  // laissé sur `v21`. Table synthétique — le jeton `v21` y porte l'empreinte
  // du texte d'AVANT (la lane solo, mesurée sur 243 prompts archivés).
  const table = {
    v21_one_box_per_group: await sha256Hex(buildPrecedenceBlock("solo")),
  };
  const apresD3 = await precedenceDigest("household");
  const v = precedenceBindingVerdict("v21_one_box_per_group", apresD3, table);
  assertEquals(v.verdict, "text_moved_without_bump");
  assert(v.verdict === "text_moved_without_bump" && v.recorded !== v.found);
});

Deno.test("② bis — UN SEUL caractère de différence suffit à faire rougir", async () => {
  // ⛔ L'ÉPREUVE DE SENSIBILITÉ. Une garde qui ne bouge que sur une réécriture
  // massive laisserait passer « on a juste retiré une virgule » — or c'est
  // précisément une virgule dans un prompt qui change une assiette.
  const vrai = buildPrecedenceBlock("household");
  const mute = vrai.replace("Never average two mouths", "Never average two mouth");
  assert(mute !== vrai, "la mutation de contrôle n'a rien changé: le texte cible a bougé");
  const table = { v22_precedence_in_tail: await sha256Hex(vrai) };
  assertEquals(
    precedenceBindingVerdict("v22_precedence_in_tail", await sha256Hex(vrai), table).verdict,
    "ok",
    "la copie NON MUTÉE doit passer, sinon le rouge de la mutation ne prouve rien",
  );
  assertEquals(
    precedenceBindingVerdict("v22_precedence_in_tail", await sha256Hex(mute), table).verdict,
    "text_moved_without_bump",
  );
});

// ---------------------------------------------------------------------------
// ③ BUMPER SANS INSCRIRE EST ROUGE AUSSI — le geste est « bump ET inscris »
// ---------------------------------------------------------------------------

Deno.test("③ un millésime jamais inscrit rend `unknown_version`, pas `ok`", async () => {
  const v = precedenceBindingVerdict(
    "v23_un_millesime_que_personne_n_a_inscrit",
    await precedenceDigest("household"),
  );
  assertEquals(v.verdict, "unknown_version");
});

// ---------------------------------------------------------------------------
// ④ LA TABLE EST UN JOURNAL, PAS UN PIN — l'entrée du passé reste vraie
// ---------------------------------------------------------------------------

Deno.test("④ `v21` porte l'empreinte de la lane SOLO, et c'est une mesure", async () => {
  // Les 243 `user_message` archivés de `generate-household-meal-v1` qui portent
  // l'en-tête d'arbitrage portent `buildPrecedenceBlock("solo")` octet pour
  // octet (mesuré le 2026-08-23, 243/243). Cette égalité est donc une
  // affirmation VÉRIFIÉE sur une population en base, pas une commodité.
  assertEquals(
    HOUSEHOLD_ARBITRATION_BY_VERSION["v21_one_box_per_group"],
    await sha256Hex(buildPrecedenceBlock("solo")),
    "l'empreinte inscrite pour `v21` n'est plus celle du texte SOLO: ou bien le texte " +
      "solo a bougé — et `MEAL_PROMPT_VERSION` doit bumper — ou bien quelqu'un a édité " +
      "une entrée du journal.",
  );
  // Et les deux lanes ne portent pas la même empreinte: sans ça, ① passerait
  // pour une raison qui n'est pas la bonne.
  assert(
    (await precedenceDigest("solo")) !== (await precedenceDigest("household")),
    "les deux lanes rendent le même texte: la variante foyer a disparu",
  );
});

// ---------------------------------------------------------------------------
// ⑤ LE LECTEUR DE JETON — il fait du bruit, il ne s'abstient jamais en silence
// ---------------------------------------------------------------------------

Deno.test("⑤ le lecteur trouve le jeton vivant, et JETTE sur zéro ou deux", () => {
  // Le cas qui PASSE: la source réelle, déjà lue en tête de fichier.
  assert(
    /^v\d+_[a-z0-9_]+$/.test(HOUSEHOLD_PROMPT_VERSION),
    `jeton illisible: « ${HOUSEHOLD_PROMPT_VERSION} »`,
  );

  const ligne = `export const HOUSEHOLD_PROMPT_VERSION = "v42_essai";`;
  assertEquals(readHouseholdPromptVersion(`// blabla\n${ligne}\n`), "v42_essai");

  // ⛔ UN JETON CITÉ DANS UN COMMENTAIRE N'EN EST PAS UN — cicatrice
  // `caller-audit-must-strip-comments`: le bloc de journal au-dessus de la
  // constante NOMME `HOUSEHOLD_PROMPT_VERSION` et `v21_one_box_per_group` en
  // prose, et un grep naïf y verrait deux porteurs.
  assertEquals(
    readHouseholdPromptVersion(
      `// voir HOUSEHOLD_PROMPT_VERSION = "v21_one_box_per_group" plus bas\n${ligne}\n`,
    ),
    "v42_essai",
  );

  assertThrows(() => readHouseholdPromptVersion("rien ici"), Error, "0 déclaration");
  assertThrows(() => readHouseholdPromptVersion(`${ligne}\n${ligne}\n`), Error, "2 déclaration");
});
