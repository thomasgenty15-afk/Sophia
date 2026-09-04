/**
 * ══════════════════════════════════════════════════════════════════════════
 * `D3′` — LA GARDE DU BLOC D'ARBITRAGE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno test supabase/functions/_shared/keel/precedence_tail_test.ts
 *
 * ⛔ CE FICHIER N'IMPORTE QUE `jsr:@std/assert` ET LE MODULE QU'IL GARDE, et
 * ce module n'importe RIEN (§⑨ n° 92). Vérifié depuis un `git archive HEAD`
 * extrait dans un arbre tiers — pas déduit. C'est la seule façon d'obtenir une
 * garde qu'un clone peut exécuter: neuf lots de cette campagne ont livré une
 * garde qui importait un fichier `M`, et le dépôt a gagné neuf gardes que
 * personne d'autre ne peut rejouer.
 *
 * ── ⛔ LE CAS QUI PASSE, ET POURQUOI IL EST ÉCRIT EN PREMIER ───────────────
 * Douze gardes de cette campagne étaient VERTES sur leur propre cas et
 * n'auraient rien attrapé. Une garde qui n'a que des cas d'échec est une garde
 * dont on ne sait pas si elle sait dire « oui ». `verdict_reconnait_les_deux`
 * couvre les DEUX: la forme d'AVANT rend `buried`, la forme d'APRÈS rend
 * `tail`. Si le module rendait `tail` toujours, la moitié « buried » rougit;
 * s'il rendait `buried` toujours, la moitié « tail » rougit.
 */

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  buildPrecedenceBlock,
  countPrecedenceRanks,
  HOUSEHOLD_LOCK_HEADERS,
  LANGUAGE_BLOCK_MARKER,
  lockHeadersNamed,
  movePrecedenceToTail,
  PRECEDENCE_HEADER,
  type PrecedenceLane,
  precedenceTailVerdict,
} from "./precedence_tail.ts";

// ---------------------------------------------------------------------------
// ① LE CAS QUI PASSE — et sa moitié qui échoue, dans le même test
// ---------------------------------------------------------------------------

Deno.test("① le verdict reconnaît les DEUX formes: enterré ET en queue", () => {
  const block = buildPrecedenceBlock("household");
  const langue = `${LANGUAGE_BLOCK_MARKER}\nWrite in French.`;

  // La forme d'AVANT: le bloc au milieu, deux blocs de foyer après lui.
  const avant = [
    "== WHAT TO COOK ==\nmode: cook",
    block,
    "== THE HOUSEHOLD ==\n- Malo = m-malo",
    "HOUSE RULES — foods this household does not serve to certain people.\n- Anouk: never serve nutella",
    langue,
  ].join("\n\n");
  const vAvant = precedenceTailVerdict(avant);
  assertEquals(vAvant.verdict, "buried");
  assertEquals(vAvant.contentBlocksAfter, 2);

  // La forme d'APRÈS: le même message, le bloc déplacé en queue.
  const apres = movePrecedenceToTail(
    [
      "== WHAT TO COOK ==\nmode: cook",
      "== THE HOUSEHOLD ==\n- Malo = m-malo",
      "HOUSE RULES — foods this household does not serve to certain people.\n- Anouk: never serve nutella",
      block,
    ].join("\n\n"),
    "household",
  );
  const vApres = precedenceTailVerdict(`${apres}\n\n${langue}`);
  // ⛔ LE CAS QUI PASSE.
  assertEquals(vApres.verdict, "tail");
  assertEquals(vApres.contentBlocksAfter, 0);
});

Deno.test("① bis — un bloc absent se dit `absent`, jamais `tail`", () => {
  // Le zéro ambigu, pris par le bon bout: un message sans bloc d'arbitrage ne
  // doit surtout pas rendre le même verdict qu'un message où il est en queue.
  const v = precedenceTailVerdict("== WHAT TO COOK ==\nmode: cook");
  assertEquals(v.verdict, "absent");
});

// ---------------------------------------------------------------------------
// ② LE CORRECTIF DE TEXTE — le rang 1 ne pointe plus là où le régime n'est pas
// ---------------------------------------------------------------------------

Deno.test("② la lane FOYER ne dit plus « at the VERY TOP »", () => {
  // C'est la découverte qui gouverne le lot: sur la lane foyer, le régime est
  // 63 à 101 lignes SOUS le bloc qui le déclare « tout en haut ».
  const foyer = buildPrecedenceBlock("household");
  assert(
    !foyer.includes("VERY TOP"),
    "le rang 1 du foyer ne doit plus désigner une position fausse",
  );
  assert(
    foyer.includes("WHEREVER"),
    "il doit dire que les verrous ne sont pas tous au même endroit",
  );
});

Deno.test("② bis — le rang 1 du foyer NOMME les trois en-têtes de verrou", () => {
  // ⛔ `3` EN LITTÉRAL, ET LES TROIS EN-TÊTES ÉCRITS ICI — jamais
  // `HOUSEHOLD_LOCK_HEADERS.length`.
  //
  // ⚠️ MESURÉ, PAS CRAINT: la première version de ce test écrivait
  // `assertEquals(lockHeadersNamed("household"), HOUSEHOLD_LOCK_HEADERS.length)`
  // et la mutation M7 — retirer « HOUSE RULES » de la liste — est passée
  // VERTE, 15/15. Les deux côtés de l'égalité rétrécissaient ensemble. C'est
  // la cicatrice « un test paramétré par sa propre constante », et elle vient
  // de se reproduire dans ce fichier.
  assertEquals(lockHeadersNamed("household"), 3);
  assertEquals(HOUSEHOLD_LOCK_HEADERS.length, 3);
  const foyer = buildPrecedenceBlock("household").replace(/\s+/g, " ");
  for (
    const h of [
      "WHAT THE SHARED BASE MUST RESPECT",
      "HOUSE RULES",
      "THE SAME KITCHEN, TWO DISHES",
    ]
  ) {
    assert(foyer.includes(h), `le rang 1 doit citer « ${h} »`);
    assert(
      HOUSEHOLD_LOCK_HEADERS.includes(h),
      `« ${h} » doit rester dans la liste publiée`,
    );
  }
  // La contre-épreuve: la lane solo n'en cite aucun, parce qu'aucun n'existe
  // là-bas. Un compteur qui rendrait 3 des deux côtés ne mesurerait rien.
  assertEquals(lockHeadersNamed("solo"), 0);
});

Deno.test("② ter — la lane SOLO est GELÉE, octet pour octet", () => {
  // ⛔ LE PÉRIMÈTRE DE `D3′` EST LE FOYER. Sur la lane solo la mesure rend 0
  // bloc après l'arbitrage, et « at the VERY TOP » y est vrai. Ce test existe
  // pour qu'une « harmonisation » future change le prompt solo EXPRÈS et pas
  // par symétrie.
  //
  // ⚠️ Le texte attendu est écrit ICI en littéral, jamais importé du module:
  // un test qui compare le module à lui-même reste vert quoi qu'il arrive.
  const attendu = [
    "-- WHEN TWO OF THE LINES ABOVE WANT DIFFERENT THINGS --",
    "They will. This order decides, and nothing in this message outranks it.",
    "1. The hard constraints and the diet at the VERY TOP of this message. They",
    "   are absolute. No craving, no coach line, no budget and no cooking time",
    '   ever touches them, and "a small amount" is not an exception.',
    "2. This coach's method and red lines.",
    "3. What this kitchen and this week can ACTUALLY do — the cooking days, the",
    "   equipment they do not have, the minutes, the money. A plan they cannot",
    "   execute is not a smaller plan, it is no plan. When the method asks for a",
    "   gesture this kitchen cannot make, keep the method's INTENT and change the",
    "   gesture, and say so.",
    "4. What they wrote themselves.",
    "5. What they feel like eating this time, what came up in conversation, and",
    "   the season. These RANK your choices among the dishes 1 to 4 already",
    "   allow. They never veto, and they never override.",
    "When something lower cannot be honoured because something higher forbids it,",
    "compose the nearest dish the higher rule DOES allow, and say what you did",
    'instead in that dish\'s "why". Never drop the meal, and never honour it',
    "quietly by halves.",
  ].join("\n");
  assertEquals(buildPrecedenceBlock("solo"), attendu);
});

// ---------------------------------------------------------------------------
// ③ LE BLOC NOMME DES OBJETS DU FOYER — le `pourquoi` de la fiche
// ---------------------------------------------------------------------------

Deno.test("③ la lane FOYER nomme des objets du foyer, la solo n'en nomme aucun", () => {
  const foyer = buildPrecedenceBlock("household");
  const solo = buildPrecedenceBlock("solo");
  const objets = ["member_portions", "shared dish", "second dish", "MOUTHS"];
  for (const o of objets) {
    assert(foyer.includes(o), `le bloc foyer doit nommer « ${o} »`);
    assert(!solo.includes(o), `le bloc solo ne doit PAS nommer « ${o} »`);
  }
});

Deno.test("③ bis — l'arbitrage INTER-BOUCHES existe, et il ne se règle pas par l'ordre", () => {
  const foyer = buildPrecedenceBlock("household");
  assert(foyer.includes("A rank 1 line of ANY mouth beats a rank 2 to 5 line"));
  assert(foyer.includes("Never average two mouths"));
  assert(foyer.includes("whose name came first"));
});

// ---------------------------------------------------------------------------
// ④ LA COLLISION AVEC LE BLOC DES `why` — ⛔ porte `G-disclosure`
// ---------------------------------------------------------------------------

Deno.test("④ la queue FOYER n'ordonne plus ce que le bloc des `why` interdit", () => {
  // ⛔ LA CONTRADICTION MESURÉE: l'ancienne queue disait « say what you did
  // instead in that dish's "why" ». Sur la lane foyer, quand la règle
  // supérieure est le régime ou l'allergie de quelqu'un, cette phrase DEMANDE
  // très exactement ce que `whyRuleBlock` INTERDIT — deux consignes opposées
  // dans le même message.
  const foyer = buildPrecedenceBlock("household");
  const solo = buildPrecedenceBlock("solo");
  const ordreAncien = 'say what you did\ninstead in that dish\'s "why"';
  assert(solo.includes(ordreAncien), "la lane solo garde sa queue d'origine");
  assert(!foyer.includes(ordreAncien), "la lane foyer ne peut plus l'ordonner");
  // Et elle dit ce qu'elle interdit, mot pour mot.
  assert(foyer.includes("not whose diet, whose allergy, whose medical list or"));
  assert(foyer.includes("not whose wish gave way"));
});

// ---------------------------------------------------------------------------
// ⑤ LA DERNIÈRE PLACE — prise à `crossContact.block`, et rendue par le contenu
// ---------------------------------------------------------------------------

Deno.test("⑤ le DERNIER paragraphe de contenu parle encore d'allergie et de médical", () => {
  // ⛔ C'EST L'ÉPREUVE DE L'ÉCHANGE. Ce bloc prend le cran de récence à
  // `crossContact.block`, qui l'avait réclamé avec trois raisons écrites dont
  // « la seule règle dont la violation envoie quelqu'un à l'hôpital ». Le seul
  // échange honnête est que la dernière chose lue parle ENCORE d'elle.
  const message = movePrecedenceToTail(
    "== WHAT TO COOK ==\nmode: cook\n\n== THE SAME KITCHEN, TWO DISHES ==\nwash the board",
    "household",
  );
  const v = precedenceTailVerdict(`${message}\n\n${LANGUAGE_BLOCK_MARKER}\nFrench.`);
  assertEquals(v.verdict, "tail");
  const last = v.lastContentBlock.toLowerCase();
  assert(last.includes("allerg"), `dernier paragraphe sans allergie: « ${v.lastContentBlock} »`);
  assert(last.includes("medical"), `dernier paragraphe sans médical: « ${v.lastContentBlock} »`);
});

// ---------------------------------------------------------------------------
// ⑥ DÉPLAÇABLE, PAS SEULEMENT IDEMPOTENT — la cicatrice de `locale.ts`
// ---------------------------------------------------------------------------

Deno.test("⑥ le déplacement retire l'occurrence antérieure des DEUX lanes", () => {
  // Le tronc (`buildMealPrompt`) pose la variante SOLO; la lane foyer doit
  // poser la sienne SANS laisser l'autre derrière. Deux blocs d'arbitrage,
  // c'est deux hiérarchies — contradictoires le jour où l'une change.
  const tronc = `== WHAT TO COOK ==\nmode: cook\n\n${
    buildPrecedenceBlock("solo")
  }\n\n== THE HOUSEHOLD ==\n- Malo = m-malo`;
  const out = movePrecedenceToTail(tronc, "household");
  assertEquals(out.split(PRECEDENCE_HEADER).length - 1, 1, "un seul bloc, pas deux");
  assert(!out.includes("VERY TOP"), "la variante solo doit avoir été retirée");
  assert(out.endsWith(buildPrecedenceBlock("household")));
});

Deno.test("⑥ bis — appliqué deux fois, le résultat est identique", () => {
  const une = movePrecedenceToTail("== WHAT TO COOK ==\nmode: cook", "household");
  const deux = movePrecedenceToTail(une, "household");
  assertEquals(deux, une);
});

// ---------------------------------------------------------------------------
// ⑦ LE COMPTEUR — deux populations, et il distingue les deux zéros
// ---------------------------------------------------------------------------

Deno.test("⑦ les deux populations somment toujours à cinq", () => {
  const tout = countPrecedenceRanks({
    locks: 3, coachLines: 2, kitchenAndWeek: 1, writtenBySelf: 4, wantedThisTime: 1,
  });
  assertEquals(tout.ranks, 5);
  assertEquals(tout.withObject, 5);
  assertEquals(tout.withoutObject, 0);

  const rien = countPrecedenceRanks({
    locks: 0, coachLines: 0, kitchenAndWeek: 0, writtenBySelf: 0, wantedThisTime: 0,
  });
  assertEquals(rien.withObject, 0);
  assertEquals(rien.withoutObject, 5);

  // ⛔ LE CAS QUI COMPTE — celui du corpus réel: quelques rangs servis, les
  // autres nommés par le bloc et sans aucun objet dans le message.
  const melange = countPrecedenceRanks({
    locks: 2, coachLines: 0, kitchenAndWeek: 1, writtenBySelf: 0, wantedThisTime: 0,
  });
  assertEquals(melange.withObject, 2);
  assertEquals(melange.withoutObject, 3);
  assertEquals(melange.byRank.rank_1, 2);
  assertEquals(melange.byRank.rank_4, 0);
});

Deno.test("⑦ bis — un compte non fini ou négatif compte pour ZÉRO, jamais pour présent", () => {
  // Cicatrice `L26-0`: un compteur qui MONTE pendant que le produit régresse.
  const c = countPrecedenceRanks({
    locks: Number.NaN, coachLines: -3, kitchenAndWeek: Number.POSITIVE_INFINITY,
    writtenBySelf: 0.5, wantedThisTime: 2,
  });
  assertEquals(c.byRank.rank_1, 0);
  assertEquals(c.byRank.rank_2, 0);
  assertEquals(c.byRank.rank_3, 0);
  assertEquals(c.byRank.rank_4, 0);
  assertEquals(c.byRank.rank_5, 2);
  assertEquals(c.withObject, 1);
  assertEquals(c.withoutObject, 4);
});

// ---------------------------------------------------------------------------
// ⑧ R6/R7 — une lane inconnue fait du bruit, jamais du silence
// ---------------------------------------------------------------------------

Deno.test("⑧ une lane inconnue JETTE au lieu de retomber sur l'autre texte", () => {
  assertThrows(() => buildPrecedenceBlock("weekly" as unknown as PrecedenceLane));
});

// ---------------------------------------------------------------------------
// ⑨ LE BLOC DE LANGUE A LE DROIT DE SUIVRE, et lui seul
// ---------------------------------------------------------------------------

Deno.test("⑨ le bloc de langue ne compte pas, un bloc de contenu compte", () => {
  const base = movePrecedenceToTail("== WHAT TO COOK ==\nmode: cook", "household");
  const avecLangue = `${base}\n\n${LANGUAGE_BLOCK_MARKER}\nFrench.`;
  assertEquals(precedenceTailVerdict(avecLangue).contentBlocksAfter, 0);

  // Et si quelqu'un colle un bloc de CONTENU après, la garde rougit — c'est
  // l'`armé par` de la fiche, mot pour mot: « un test d'ordre des blocs qui
  // ROUGIT si un bloc est inséré après ».
  const avecIntrus = `${avecLangue}\n\n== ONE MORE THING ==\ndo this too`;
  const v = precedenceTailVerdict(avecIntrus);
  assertEquals(v.verdict, "buried");
  assertEquals(v.contentBlocksAfter, 1);
  assertEquals(v.headersAfter[0], "== ONE MORE THING ==");
});
