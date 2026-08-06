// doctrine_starter.ts — livrer les débats, jamais les réponses.
//
// Les tests qui portent la doctrine:
//   * "aucun débat ne se lit comme une position"
//     -- si le SUJET porte déjà une réponse, KEEL affirme une position
//        nutritionnelle sous le nom du coach, et tout le raisonnement du
//        fichier s'effondre.
//   * "chaque débat offre « je ne fais pas de règle »"
//     -- sans elle, un coach coche une position qu'il ne tient pas pour
//        avancer, et son agent la servira à ses élèves.
//   * "changer de camp ne détruit JAMAIS une ligne retouchée"
//     -- c'est le seul travail d'écriture qu'il ait fait.
//   * "éditer une phrase la rend au coach ; changer une portée ne la rend pas"
//     -- le compteur promet « ces PHRASES sont encore les nôtres ». Un cliquet
//        qui se déclenche sur un geste qui n'a rien réécrit ment dans l'autre
//        sens.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  applyStarterChoices,
  claimOnEdit,
  countUntouchedStarter,
  forkByKey,
  NO_RULE,
  readStarterChoices,
  STARTER_FORKS,
} from "./doctrine_starter.ts";
import { parseCoachDoctrine } from "./doctrine.ts";
import { findDoctrineViolations } from "./doctrine.ts";

// ---------------------------------------------------------------------------
// LE CONTENU
// ---------------------------------------------------------------------------

Deno.test("aucun débat ne se lit comme une position", () => {
  // Le sujet est une chose dont on parle, pas un avis. Un sujet qui contient
  // « should », « must », « never » ou « best » a déjà répondu à la place du
  // coach.
  const verdictWords = /\b(should|must|never|always|best|worst|healthy|unhealthy)\b/i;
  for (const fork of STARTER_FORKS) {
    assert(
      !verdictWords.test(fork.subject),
      `fork ${fork.key} states a position instead of a subject: ${fork.subject}`,
    );
  }
});

Deno.test("chaque débat offre « je ne fais pas de règle », en dernier", () => {
  for (const fork of STARTER_FORKS) {
    const last = fork.positions[fork.positions.length - 1];
    assertEquals(last.key, NO_RULE, `fork ${fork.key} has no opt-out, or not last`);
    // Elle ne sème RIEN. Une position « pas de règle » qui écrirait une
    // croyance serait une règle.
    assert(!last.belief && !last.forbidden && !last.arbitration);
  }
});

Deno.test("chaque débat a au moins une vraie position, et des clés uniques", () => {
  const forkKeys = new Set<string>();
  for (const fork of STARTER_FORKS) {
    assert(!forkKeys.has(fork.key), `duplicate fork key ${fork.key}`);
    forkKeys.add(fork.key);
    assert(fork.positions.length >= 2, `fork ${fork.key} has no real position`);
    const positionKeys = new Set<string>();
    for (const p of fork.positions) {
      assert(!positionKeys.has(p.key), `duplicate position ${p.key} in ${fork.key}`);
      positionKeys.add(p.key);
      // R1: les jetons sont ASCII snake_case — du code branche dessus.
      assert(/^[a-z0-9_]+$/.test(p.key), `position key not snake_case: ${p.key}`);
    }
  }
});

Deno.test("un interdit semé porte TOUJOURS son `instead`", () => {
  // Sans lui le verrou dégrade en refus sec, et l'élève de masterclasse n'a
  // aucun canal pour demander mieux. Un préréglage qui livrerait un interdit
  // nu livrerait le pire des deux mondes: la règle sans la réponse.
  for (const fork of STARTER_FORKS) {
    for (const p of fork.positions) {
      if (!p.forbidden) continue;
      assert(p.forbidden.instead.trim().length > 20, `${p.key}: instead too thin`);
      assert(p.forbidden.surfaceForms.length >= 3, `${p.key}: not enough surface forms`);
      assert(/^[a-z0-9_]+$/.test(p.forbidden.token), `${p.key}: token not snake_case`);
    }
  }
});

Deno.test("les jetons d'interdit sont uniques sur TOUT le jeu", () => {
  // Deux débats qui sèmeraient le même jeton produiraient deux lignes que le
  // rapport de violation et l'écran « pourquoi ça a été régénéré » ne
  // sauraient pas distinguer.
  const tokens = new Set<string>();
  for (const fork of STARTER_FORKS) {
    for (const p of fork.positions) {
      if (!p.forbidden) continue;
      assert(!tokens.has(p.forbidden.token), `duplicate token ${p.forbidden.token}`);
      tokens.add(p.forbidden.token);
    }
  }
});

Deno.test("aucune position ne porte de cible chiffrée", () => {
  // Le produit refuse les cibles chiffrées par construction
  // (`meal_generation.ts`, garantie 1). Un préréglage qui en porterait une les
  // réintroduirait par la porte de côté.
  const numeric = /\b\d+\s*(g|kg|ml|cl|l|kcal|cal|calories|grams?|grammes?)\b/i;
  for (const fork of STARTER_FORKS) {
    for (const p of fork.positions) {
      const texts = [
        p.label,
        p.belief?.claim,
        p.belief?.rationale,
        p.forbidden?.instead,
        p.forbidden?.reason,
        p.arbitration?.coachAnswer,
      ].filter(Boolean) as string[];
      for (const t of texts) {
        assert(!numeric.test(t), `${fork.key}/${p.key} carries a numeric target: ${t}`);
      }
    }
  }
});

Deno.test("un `instead` semé ne déclenche pas son propre verrou", () => {
  // LE PIÈGE EXACT. `instead` est le texte SERVI À L'ÉLÈVE quand le verrou
  // attrape une réponse. S'il contient lui-même une formulation interdite sans
  // négation devant, le remplacement se ferait re-attraper — et le coach
  // verrait son agent bloquer sa propre réponse.
  for (const fork of STARTER_FORKS) {
    for (const p of fork.positions) {
      if (!p.forbidden) continue;
      const violations = findDoctrineViolations(p.forbidden.instead, {
        forbidden: [{
          token: p.forbidden.token,
          surfaceForms: p.forbidden.surfaceForms,
          instead: p.forbidden.instead,
        }],
        foods: { discouraged: [] },
      });
      assertEquals(
        violations.length,
        0,
        `${fork.key}/${p.key}: its own instead trips its own lock`,
      );
    }
  }
});

Deno.test("forkByKey jette sur une clé inconnue (R7)", () => {
  assertThrows(() => forkByKey("nope"));
  assertEquals(forkByKey("hunger").key, "hunger");
});

// ---------------------------------------------------------------------------
// APPLIQUER
// ---------------------------------------------------------------------------

Deno.test("un choix sème la croyance, l'interdit et l'arbitration, marqués starter", () => {
  const { draft } = applyStarterChoices(null, { off_plan_meals: "no_cheat_meal" });
  const beliefs = draft.beliefs as Record<string, unknown>[];
  const forbidden = draft.forbidden as Record<string, unknown>[];
  const arbitrations = draft.arbitrations as Record<string, unknown>[];

  assertEquals(beliefs.length, 1);
  assertEquals(forbidden.length, 1);
  assertEquals(arbitrations.length, 1);
  assertEquals(forbidden[0].token, "cheat_meal");
  for (const e of [beliefs[0], forbidden[0], arbitrations[0]]) {
    assertEquals(e.source, "starter");
  }
});

Deno.test("« je ne fais pas de règle » ne sème rien", () => {
  const { draft } = applyStarterChoices(null, { hunger: NO_RULE, breakfast: "" });
  assertEquals((draft.beliefs as unknown[]).length, 0);
  assertEquals((draft.forbidden as unknown[]).length, 0);
});

Deno.test("rejouer les mêmes choix rend le même brouillon", () => {
  const choices = { hunger: "hunger_is_information", counting: "no_counting" };
  const once = applyStarterChoices(null, choices).draft;
  const twice = applyStarterChoices(once, choices).draft;
  assertEquals(JSON.stringify(once), JSON.stringify(twice));
});

Deno.test("changer de camp retire les lignes JAMAIS retouchées", () => {
  const first = applyStarterChoices(null, { counting: "no_counting" }).draft;
  assertEquals((first.forbidden as unknown[]).length, 1);

  const second = applyStarterChoices(first, { counting: "count_briefly" }).draft;
  // `count_briefly` ne sème pas d'interdit: l'ancien disparaît.
  assertEquals((second.forbidden as unknown[]).length, 0);
  const claims = (second.beliefs as Record<string, unknown>[]).map((b) => String(b.claim));
  assertEquals(claims.length, 1);
  assert(claims[0].startsWith("Count for a couple of weeks"));
});

Deno.test("changer de camp ne détruit JAMAIS une ligne retouchée", () => {
  const first = applyStarterChoices(null, { counting: "no_counting" }).draft;
  // Le coach réécrit l'interdit: le cliquet lui rend la ligne.
  (first.forbidden as Record<string, unknown>[])[0] = {
    ...(first.forbidden as Record<string, unknown>[])[0],
    instead: "Chez moi on ne compte rien, et je te dirai pourquoi.",
    source: null,
  };

  const { draft, keptBecauseEdited } = applyStarterChoices(first, { counting: "count_briefly" });
  const forbidden = draft.forbidden as Record<string, unknown>[];
  assertEquals(forbidden.length, 1);
  assertEquals(forbidden[0].instead, "Chez moi on ne compte rien, et je te dirai pourquoi.");
  assertEquals(keptBecauseEdited, []);
});

Deno.test("une ligne du coach écrase la position quand les deux portent la même identité", () => {
  const mine = {
    forbidden: [{
      token: "cheat_meal",
      surface_forms: ["mon expression"],
      instead: "Ma phrase à moi.",
      source: null,
    }],
  };
  const { draft, keptBecauseEdited } = applyStarterChoices(mine, {
    off_plan_meals: "no_cheat_meal",
  });
  const forbidden = draft.forbidden as Record<string, unknown>[];
  assertEquals(forbidden.length, 1);
  assertEquals(forbidden[0].instead, "Ma phrase à moi.");
  assertEquals(keptBecauseEdited, ["cheat_meal"]);
});

Deno.test("les sections qu'aucun débat ne touche existent, vides", () => {
  const { draft } = applyStarterChoices(null, { hunger: "hunger_is_information" });
  assertEquals(draft.vocabulary, []);
  assertEquals(draft.qa, []);
  assertEquals(draft.foods, { discouraged: [] });
  assertEquals(draft.voice, {});
});

Deno.test("une position inconnue jette plutôt que d'être semée au mieux (R7)", () => {
  assertThrows(() => applyStarterChoices(null, { hunger: "hunger_is_purple" }));
});

Deno.test("le brouillon semé passe le parseur de production sans une seule issue", () => {
  const choices: Record<string, string> = {};
  for (const fork of STARTER_FORKS) {
    const real = fork.positions.find((p) => p.key !== NO_RULE);
    if (real) choices[fork.key] = real.key;
  }
  const { draft } = applyStarterChoices(null, choices);
  const { doctrine, issues } = parseCoachDoctrine({
    ...draft,
    coach_id: "c",
    version: 0,
    content_locale: "en",
  });
  assertEquals(issues, []);
  // Chaque débat qui porte une vraie position a produit sa croyance.
  assert(doctrine.beliefs.length >= STARTER_FORKS.length - 1);

  // LES TROIS SECTIONS, PAS DEUX. Ce test n'en vérifiait que deux, et le
  // troisième cas est passé: `parseCoachDoctrine` ramenait la provenance d'une
  // arbitration à `null` (elle n'était pas dans sa liste de jetons admis)
  // pendant que la même marque survivait sur une croyance. Mesuré à l'écran:
  // le compteur tombait de 2/3 à 1/3 au premier rechargement, c'est-à-dire
  // qu'il annonçait une appropriation qui n'avait pas eu lieu.
  for (const b of doctrine.beliefs) assertEquals(b.source, "starter");
  for (const f of doctrine.forbidden) assertEquals(f.source, "starter");
  assert(doctrine.arbitrations.length > 0, "no arbitration seeded — the case would go unchecked");
  for (const a of doctrine.arbitrations) assertEquals(a.source, "starter");
});

Deno.test("les trois sections semées survivent à un aller-retour par le parseur", () => {
  // LE DÉFAUT RÉEL, en test: l'éditeur relit la doctrine et le premier
  // « enregistrer » réécrit ce qu'il a relu. Une provenance perdue au passage
  // est effacée sans que personne ne l'ait décidé.
  const { draft } = applyStarterChoices(null, {
    meal_frequency: "three_meals",
    hunger: "hunger_is_information",
  });
  const before = countUntouchedStarter(draft);

  const { doctrine } = parseCoachDoctrine({
    ...draft,
    coach_id: "c",
    version: 0,
    content_locale: "en",
  });
  // Ce que le parseur rend, remis dans la forme de l'éditeur — le trajet exact
  // de `toEditorShape`.
  const roundTripped = {
    beliefs: doctrine.beliefs.map((b) => ({ claim: b.claim, source: b.source })),
    forbidden: doctrine.forbidden.map((f) => ({ token: f.token, source: f.source })),
    arbitrations: doctrine.arbitrations.map((a) => ({
      situation: a.situation,
      source: a.source,
    })),
  };
  assertEquals(countUntouchedStarter(roundTripped).total, before.total);
});

// ---------------------------------------------------------------------------
// LE COMPTEUR ET LE CLIQUET
// ---------------------------------------------------------------------------

Deno.test("le compteur dit combien de PHRASES sont encore les nôtres", () => {
  const { draft } = applyStarterChoices(null, {
    off_plan_meals: "no_cheat_meal",
    counting: "no_counting",
  });
  const before = countUntouchedStarter(draft);
  assertEquals(before.beliefs, 2);
  assertEquals(before.forbidden, 2);
  assertEquals(before.arbitrations, 1);
  assertEquals(before.total, 5);
  assertEquals(before.entries, 5);

  // Le coach réécrit une croyance.
  (draft.beliefs as Record<string, unknown>[])[0] = {
    ...(draft.beliefs as Record<string, unknown>[])[0],
    claim: "Ma conviction, dans mes mots",
    source: null,
  };
  assertEquals(countUntouchedStarter(draft).total, 4);
  assertEquals(countUntouchedStarter(draft).entries, 5);
});

Deno.test("un brouillon sans préréglage compte zéro, pas undefined", () => {
  assertEquals(countUntouchedStarter(null).total, 0);
  assertEquals(countUntouchedStarter({ beliefs: [{ claim: "x" }] }).total, 0);
});

Deno.test("éditer une phrase rend la ligne au coach", () => {
  const before: Record<string, unknown> = { claim: "Nos mots", source: "starter" };
  assertEquals(claimOnEdit(before, { claim: "Mes mots" }), { claim: "Mes mots", source: null });
});

Deno.test("changer une portée ne rend PAS la ligne — la phrase est toujours la nôtre", () => {
  const before: Record<string, unknown> = { claim: "Nos mots", goal_scope: [], source: "starter" };
  assertEquals(claimOnEdit(before, { goal_scope: ["fat_loss"] }), { goal_scope: ["fat_loss"] });
});

Deno.test("réécrire à l'identique ne rend pas la ligne", () => {
  const before: Record<string, unknown> = { claim: "Nos mots", source: "starter" };
  assertEquals(claimOnEdit(before, { claim: "Nos mots" }), { claim: "Nos mots" });
});

Deno.test("une ligne déjà au coach n'est pas re-marquée", () => {
  const before: Record<string, unknown> = { claim: "Mes mots", source: null };
  assertEquals(claimOnEdit(before, { claim: "Autres mots" }), { claim: "Autres mots" });
});

Deno.test("modifier les formulations de surface rend la ligne", () => {
  // Les `surface_forms` sont du texte que le coach écrit; les toucher est un
  // acte d'appropriation au même titre qu'une phrase.
  const before: Record<string, unknown> = {
    token: "t",
    surface_forms: ["a"],
    source: "starter",
  };
  assertEquals(claimOnEdit(before, { surface_forms: ["a", "b"] }), {
    surface_forms: ["a", "b"],
    source: null,
  });
});

// ---------------------------------------------------------------------------
// RELIRE LES CHOIX
// ---------------------------------------------------------------------------

Deno.test("l'écran rouvre coché sur ce qui a été choisi", () => {
  const choices = { hunger: "hunger_is_normal", evening: "no_cutoff" };
  const { draft } = applyStarterChoices(null, choices);
  assertEquals(readStarterChoices(draft), choices);
});

Deno.test("une position retouchée n'est plus revendiquée par son débat", () => {
  const { draft } = applyStarterChoices(null, { counting: "no_counting" });
  for (const list of ["beliefs", "forbidden"] as const) {
    draft[list] = (draft[list] as Record<string, unknown>[]).map((e) => ({ ...e, source: null }));
  }
  // Elle est devenue la sienne: le débat ne doit plus dire « voici ta position ».
  assertEquals(readStarterChoices(draft), {});
});
