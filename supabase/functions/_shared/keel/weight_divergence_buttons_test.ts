/**
 * FF-056 — LE TEST DU BRANCHEMENT PAR BOUTONS.
 *
 * Ce qu'il épingle, dans l'ordre d'importance:
 *
 *  1. L'ALLER-RETOUR EST EXACT. Chaque identifiant émis se relit en la MÊME
 *     branche. C'est la propriété qui remplace le tirage du dispatcher: si
 *     elle tient, la classification est constante par construction et il n'y a
 *     plus rien à mesurer trois fois.
 *  2. LA CEINTURE A UN CAS QUI PASSE. Les libellés RÉELS, tous, dans les deux
 *     langues, sont soumis au vérificateur. Une garde cassée bloque tout et
 *     ressemble à une garde qui marche (cicatrice `guards-need-a-passing-case`).
 *  3. LA CEINTURE MORD, famille par famille, EN FRANÇAIS ET EN ANGLAIS
 *     (cicatrice `guard-tested-in-one-language-only`: `\b` ne mord pas après
 *     « é », et `not` ne couvre pas `doesn't`).
 *  4. LES CHARGES FORGÉES NE DÉSIGNENT RIEN. Tronquée, mauvais jeton, mauvais
 *     UUID, segments en trop: `none`, jamais un repli sur le premier membre.
 *  5. LES CINQ VOCABULAIRES DÉTERMINISTES NE SE CROISENT PAS.
 *
 * ⚠️ LES COMPTES SONT LUS SUR LES LISTES DU CONTRAT, jamais recopiés. Un test
 * paramétré par sa propre constante reste vert quand la constante change
 * (cicatrice `test-parameterized-by-its-own-constant`): ici, ajouter un moment
 * au contrat sans lui donner de bouton fait TOMBER le test.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  acceptDivergenceText,
  buildDivergenceCauseStep,
  buildDivergenceOpening,
  buildDivergenceWhereStep,
  categoryOfReply,
  DIVERGENCE_BRANCHES,
  DIVERGENCE_BUTTON_PREFIX,
  DIVERGENCE_COPY_PACKS,
  divergenceActionProposal,
  divergenceCategoryId,
  divergenceSpotId,
  divergenceStepId,
  FORBIDDEN_SELF_BLAME_LABELS,
  readDivergenceReply,
  renderDivergenceNoted,
  renderDivergenceStaleAck,
  TAPPABLE_CATEGORIES,
  type DivergenceLanguage,
} from "./weight_divergence_buttons.ts";
import {
  WEIGHT_DIVERGENCE_CATEGORIES,
  WEIGHT_DIVERGENCE_SLOTS,
} from "../../sophia-brain/skills/weight_divergence/contract.ts";
import { RECOMMENDATION_BUTTON_PREFIX } from "./daily_recommendation.ts";
import { STRIP_BUTTON_PREFIX } from "./evening_strip.ts";
import { ACCIDENT_BUTTON_PREFIX } from "./accident.ts";
import { PULSE_BUTTON_PREFIX } from "./daily_pulse.ts";

const EP = "11111111-2222-3333-4444-555555555555";
const OTHER_EP = "99999999-8888-7777-6666-555555555555";
const LANGS: DivergenceLanguage[] = ["fr", "en"];

// ---------------------------------------------------------------------------
// ① L'ALLER-RETOUR
// ---------------------------------------------------------------------------

Deno.test("every emitted id reads back to the same branch", () => {
  for (const branch of DIVERGENCE_BRANCHES) {
    const reply = readDivergenceReply(divergenceStepId(EP, branch));
    assertEquals(reply.kind, "step");
    if (reply.kind !== "step") throw new Error("unreachable");
    assertEquals(reply.branch, branch);
    assertEquals(reply.episodeId, EP);
  }
  for (const category of TAPPABLE_CATEGORIES) {
    const reply = readDivergenceReply(divergenceCategoryId(EP, category));
    assertEquals(reply.kind, "category");
    if (reply.kind !== "category") throw new Error("unreachable");
    assertEquals(reply.category, category);
    assertEquals(categoryOfReply(reply), category);
  }
  for (const slot of WEIGHT_DIVERGENCE_SLOTS) {
    const reply = readDivergenceReply(divergenceSpotId(EP, slot));
    assertEquals(reply.kind, "spot");
    if (reply.kind !== "spot") throw new Error("unreachable");
    assertEquals(reply.slot, slot);
    // UN MOMENT EST TOUJOURS UN `named_spot`. C'est la seule façon d'y entrer.
    assertEquals(categoryOfReply(reply), "named_spot");
  }
});

Deno.test("the tappable set covers the closed set, minus the two by design", () => {
  const tappable = new Set<string>(TAPPABLE_CATEGORIES);
  const missing = WEIGHT_DIVERGENCE_CATEGORIES.filter((c) => !tappable.has(c));
  // `named_spot` passe par le MOMENT (sinon l'action tombe au mauvais endroit),
  // `other` est la soupape du texte libre. Toute autre absence est un trou.
  assertEquals([...missing].sort(), ["named_spot", "other"]);
});

Deno.test("the where step names every slot of the contract", () => {
  for (const language of LANGS) {
    const step = buildDivergenceWhereStep({
      episodeId: EP,
      language,
      restrictionFlag: false,
    });
    assert(step, `where step missing in ${language}`);
    // Compté sur la liste DU CONTRAT: un moment ajouté là-bas sans bouton ici
    // fait tomber ce test, ce qui est exactement le but.
    assertEquals(step.buttons.length, WEIGHT_DIVERGENCE_SLOTS.length);
    const slots = step.buttons.map((b) => {
      const reply = readDivergenceReply(b.id);
      return reply.kind === "spot" ? reply.slot : null;
    });
    assertEquals(slots, [...WEIGHT_DIVERGENCE_SLOTS]);
    // Aucun libellé vide, aucun doublon: deux boutons de même titre sont
    // indiscernables à l'écran et l'un des deux est inatteignable.
    const titles = step.buttons.map((b) => b.title);
    assertEquals(new Set(titles).size, titles.length);
    assert(titles.every((t) => t.trim().length > 0));
  }
});

Deno.test("the opening and the cause step together reach every tappable category", () => {
  for (const language of LANGS) {
    const opening = buildDivergenceOpening({
      episodeId: EP,
      language,
      restrictionFlag: false,
    });
    const cause = buildDivergenceCauseStep({
      episodeId: EP,
      language,
      restrictionFlag: false,
    });
    assert(opening && cause);
    const reached = new Set<string>();
    for (const button of [...opening.buttons, ...cause.buttons]) {
      const reply = readDivergenceReply(button.id);
      if (reply.kind === "category") reached.add(reply.category);
    }
    assertEquals(
      [...reached].sort(),
      [...TAPPABLE_CATEGORIES].sort(),
      `unreachable category in ${language}`,
    );
  }
});

// ---------------------------------------------------------------------------
// ② LA CEINTURE A UN CAS QUI PASSE — les libellés RÉELS
// ---------------------------------------------------------------------------

Deno.test("every real label and body passes the belt, in both languages", () => {
  for (const language of LANGS) {
    const steps = [
      buildDivergenceOpening({ episodeId: EP, language, restrictionFlag: false }),
      buildDivergenceWhereStep({ episodeId: EP, language, restrictionFlag: false }),
      buildDivergenceCauseStep({ episodeId: EP, language, restrictionFlag: false }),
    ];
    for (const step of steps) {
      assert(step, `a step was refused by its own belt in ${language}`);
      for (const text of [step.body ?? "", ...step.buttons.map((b) => b.title)]) {
        if (!text) continue;
        const verdict = acceptDivergenceText(text, true);
        assert(
          verdict.ok,
          `label refused (${language}): ${JSON.stringify(text)} → ${
            verdict.ok ? "" : `${verdict.reason}:${verdict.detail}`
          }`,
        );
      }
    }
    // Les textes hors boutons: l'accusé périmé, le « c'est noté », les deux
    // propositions durables. Chacun est un chemin de sortie réel.
    for (
      const text of [
        renderDivergenceStaleAck(language),
        renderDivergenceNoted(language),
      ]
    ) {
      assert(acceptDivergenceText(text, true).ok, `refused: ${text}`);
    }
    for (const actionId of ["add_breakfast", "add_afternoon_snack"] as const) {
      const proposal = divergenceActionProposal({
        actionId,
        proposalId: EP,
        language,
      });
      assert(proposal, `proposal refused (${language}, ${actionId})`);
      assert(acceptDivergenceText(proposal.body, true).ok);
    }
    // Tous les littéraux du pack, y compris ceux qu'aucun builder n'assemble
    // encore: un texte qu'on ne peut pas émettre est un texte qui n'existe pas.
    for (const [key, text] of Object.entries(DIVERGENCE_COPY_PACKS[language])) {
      const verdict = acceptDivergenceText(text, true);
      assert(verdict.ok, `pack literal ${language}.${key} refused`);
    }
  }
});

// ---------------------------------------------------------------------------
// ③ LA CEINTURE MORD — famille par famille, FR ET EN
// ---------------------------------------------------------------------------

Deno.test("the belt bites each forbidden family, in French and in English", () => {
  const cases: Array<[string, string]> = [
    // energy
    ["Il te manque environ trois cents calories", "energy"],
    ["You're short about three hundred calories", "energy"],
    // suspicion
    ["Tu es sûr de tout m'avoir dit ?", "suspicion"],
    ["Are you sure that's everything?", "suspicion"],
    // blame
    ["Il faut que tu tiennes ta discipline", "blame"],
    ["That's a willpower problem", "blame"],
    // weigh_in_link
    ["Puisque tu t'es pesé ce matin", "weigh_in_link"],
    ["Since you weighed yourself this morning", "weigh_in_link"],
    // plan_delivery
    ["la semaine prochaine que je te prépare", "plan_delivery"],
    ["the week I'm preparing your plan for", "plan_delivery"],
    // self_blame — LA FAMILLE NEUVE, propre aux libellés
    ["Je craque le soir", "self_blame"],
    ["I cheat in the evening", "self_blame"],
    ["Je me laisse aller le week-end", "self_blame"],
    ["I ate too much last week", "self_blame"],
    ["C'est ma faute", "self_blame"],
  ];
  for (const [text, rule] of cases) {
    const verdict = acceptDivergenceText(text, true);
    assert(!verdict.ok, `should have been refused: ${text}`);
    assertEquals(verdict.reason, rule, `wrong rule for: ${text}`);
  }
});

Deno.test("negation does not whitewash an insinuation", () => {
  // `allowNegatedMentions: false` — « je ne dis pas que tu triches » dit
  // « tu triches ». C'est le seul mode acceptable ici: on cherche une
  // INSINUATION, pas un aliment cité.
  for (
    const text of [
      "Je ne dis pas que c'est un manque de discipline",
      "I'm not saying it's willpower",
    ]
  ) {
    assert(!acceptDivergenceText(text, true).ok, `not caught: ${text}`);
  }
});

Deno.test("the belt does NOT bite legitimate circumstance wording", () => {
  // LE CAS QUI PASSE, écrit à la main et à côté des libellés: une garde qui
  // bloque tout ressemble à une garde qui marche.
  for (
    const text of [
      "Le soir",
      "Je mange dehors le midi",
      "Le plan n'est pas ce que je mange",
      "C'est une réponse honnête",
      "I eat out at midday",
      "In the evening",
      "That's an honest answer",
      "Sleep, stress",
    ]
  ) {
    const verdict = acceptDivergenceText(text, true);
    assert(verdict.ok, `false positive on: ${text}`);
  }
});

Deno.test("a number is refused, and the ban is required not optional", () => {
  assert(!acceptDivergenceText("Il reste 3 jours", true).ok);
  assertEquals(
    acceptDivergenceText("Il reste 3 jours", true),
    { ok: false, reason: "carries_a_number", detail: "3" },
  );
  // Le paramètre existe et il est REQUIS (pas de valeur par défaut): la
  // signature l'impose, ce test documente qu'il change réellement le verdict.
  assert(acceptDivergenceText("Il reste 3 jours", false).ok);
});

Deno.test("the new self-blame family is non-empty and bilingual", () => {
  // Une famille vide passerait tous les tests de « ne mord pas » et aucun de
  // ceux de « mord » — sauf qu'on ne les écrirait pas. On l'épingle.
  assert(FORBIDDEN_SELF_BLAME_LABELS.length >= 20);
  assert(FORBIDDEN_SELF_BLAME_LABELS.some((t) => t.startsWith("je ")));
  assert(FORBIDDEN_SELF_BLAME_LABELS.some((t) => t.startsWith("i ")));
});

// ---------------------------------------------------------------------------
// ④ LES CHARGES FORGÉES
// ---------------------------------------------------------------------------

Deno.test("malformed payloads designate nothing", () => {
  const bad = [
    "",
    "   ",
    "KEEL_WDIV_CAT",
    // TRONQUÉE — le piège de `Number("")` sous une autre forme: une chaîne vide
    // n'est membre d'aucune liste fermée, et on le vérifie plutôt que de le
    // supposer.
    `KEEL_WDIV_CAT|${EP}|`,
    `KEEL_WDIV_CAT|${EP}`,
    // SEGMENTS EN TROP — une charge qui porte un quatrième segment n'est pas
    // « la même avec du bruit »: elle vient d'ailleurs.
    `KEEL_WDIV_CAT|${EP}|unknown|extra`,
    // UUID cassé
    `KEEL_WDIV_CAT|not-a-uuid|unknown`,
    `KEEL_WDIV_CAT||unknown`,
    // JETON HORS LISTE — y compris une catégorie RÉELLE mais non tapable:
    // `declined` est tapable, `other` et `named_spot` ne doivent PAS l'être.
    `KEEL_WDIV_CAT|${EP}|other`,
    `KEEL_WDIV_CAT|${EP}|named_spot`,
    `KEEL_WDIV_CAT|${EP}|invented`,
    `KEEL_WDIV_SPOT|${EP}|lunchtime`,
    `KEEL_WDIV_STEP|${EP}|elsewhere`,
    // MAUVAIS VERBE
    `KEEL_WDIV_WHAT|${EP}|unknown`,
    // MAUVAIS PRÉFIXE
    `KEEL_RECO_ACCEPT_${EP}`,
    `WDIV|${EP}|unknown`,
  ];
  for (const payload of bad) {
    assertEquals(
      readDivergenceReply(payload).kind,
      "none",
      `should be none: ${JSON.stringify(payload)}`,
    );
  }
});

Deno.test("a payload citing another episode still parses — ownership is the caller's job", () => {
  // La FORME est valide: c'est voulu. L'appartenance se prouve en base, contre
  // l'épisode VIVANT du porteur du JWT (`.eq('user_id', …)`), jamais ici.
  // Confondre les deux serait valider une forme et croire avoir validé un état.
  const reply = readDivergenceReply(divergenceCategoryId(OTHER_EP, "unknown"));
  assertEquals(reply.kind, "category");
  if (reply.kind !== "category") throw new Error("unreachable");
  assertEquals(reply.episodeId, OTHER_EP);
});

Deno.test("an id builder refuses to mint a payload without a real episode id", () => {
  for (const bad of ["", "  ", "not-a-uuid", "1234"]) {
    let threw = false;
    try {
      divergenceCategoryId(bad, "unknown");
    } catch {
      threw = true;
    }
    assert(threw, `should have thrown for ${JSON.stringify(bad)}`);
  }
});

// ---------------------------------------------------------------------------
// ⑤ LES CINQ VOCABULAIRES
// ---------------------------------------------------------------------------

Deno.test("the five deterministic vocabularies do not collide", () => {
  const prefixes = [
    RECOMMENDATION_BUTTON_PREFIX,
    STRIP_BUTTON_PREFIX,
    ACCIDENT_BUTTON_PREFIX,
    DIVERGENCE_BUTTON_PREFIX,
    PULSE_BUTTON_PREFIX,
  ];
  assertEquals(new Set(prefixes).size, prefixes.length);
  for (const a of prefixes) {
    for (const b of prefixes) {
      if (a === b) continue;
      assert(!a.startsWith(b), `${a} starts with ${b}`);
    }
  }
  // Et dans l'autre sens: aucune charge de ce flow ne se lit comme une autre.
  const ours = [
    divergenceStepId(EP, "where"),
    divergenceCategoryId(EP, "unknown"),
    divergenceSpotId(EP, "morning"),
  ];
  for (const payload of ours) {
    for (const other of prefixes) {
      if (other === DIVERGENCE_BUTTON_PREFIX) continue;
      assert(!payload.startsWith(other), `${payload} collides with ${other}`);
    }
  }
});

// ---------------------------------------------------------------------------
// ⑥ LE PLANCHER
// ---------------------------------------------------------------------------

Deno.test("under the restriction floor there are no buttons at all", () => {
  for (const language of LANGS) {
    assertEquals(
      buildDivergenceOpening({ episodeId: EP, language, restrictionFlag: true }),
      null,
    );
    assertEquals(
      buildDivergenceWhereStep({ episodeId: EP, language, restrictionFlag: true }),
      null,
    );
    assertEquals(
      buildDivergenceCauseStep({ episodeId: EP, language, restrictionFlag: true }),
      null,
    );
  }
});

Deno.test("the two languages carry the same shape", () => {
  // Le repli monolingue français de `safety_crisis` est une cicatrice de ce
  // dépôt (un élève américain recevait du français). Ici les deux packs ont
  // exactement les mêmes clés, et le test le prouve plutôt que de l'espérer.
  assertEquals(
    Object.keys(DIVERGENCE_COPY_PACKS.fr).sort(),
    Object.keys(DIVERGENCE_COPY_PACKS.en).sort(),
  );
  for (const language of LANGS) {
    const opening = buildDivergenceOpening({
      episodeId: EP,
      language,
      restrictionFlag: false,
    });
    assertEquals(opening?.buttons.length, 5);
  }
});
