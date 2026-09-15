// FF-041 — LE DÉBAT DE COMPOSITION. Ce que ces tests protègent:
//
//   * LA LIGNE §3.0 — aucun nom d'axe du moteur ne doit atteindre un écran
//     coach. Le jour où « satiety_density » apparaît dans un libellé, le coach
//     configure un logiciel au lieu d'écrire une méthode;
//   * A1 — aucune position n'offre la sèche agressive, parce que le jeton
//     n'existe pas. Une position qui la proposerait serait une promesse que le
//     moteur ne peut pas tenir;
//   * LE REGISTRE DU RÉGIME dans ce que le COACH lit — la règle zéro-chiffre
//     est un plancher face à l'ÉLÈVE, mais le registre, lui, ne doit apparaître
//     nulle part dans ce que le produit écrit.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  COMPOSITION_FORKS,
  compositionForkByKey,
  deriveSteeringFromPositions,
  NO_STEERING,
} from "./composition_forks.ts";
import { parseCompositionSteering, STEERING_AXES } from "./composition_steering.ts";
import { findDietRegisterWord } from "./nutrition_lexicon.ts";

/**
 * ── QUELS AXES ON CHERCHE, ET POURQUOI PAS TOUS ──────────────────────────
 * « protein » et « energy » sont des noms d'axes ET des mots ordinaires qu'un
 * coach écrit tous les jours (« a protein food », « the energy it holds »). Les
 * interdire interdirait au produit de parler d'aliments — ce que ce test a
 * démontré en tombant dessus au premier passage.
 *
 * Ce que §3.0 protège vraiment, c'est le JARGON DU MOTEUR: les noms composés
 * qui n'existent que dans le code. Un coach qui lit « satiety_density » ou
 * « micro coverage » a cessé d'écrire une méthode et configure un logiciel.
 */
const ENGINE_JARGON = STEERING_AXES.filter((a) => a.includes("_"));

Deno.test("§3.0 — AUCUN jargon du moteur n'atteint le coach", () => {
  assert(ENGINE_JARGON.length >= 3, "la liste de jargon ne doit pas se vider");
  for (const fork of COMPOSITION_FORKS) {
    const visible = [fork.subject, ...fork.positions.flatMap((p) => [p.label, p.effect])];
    for (const text of visible) {
      for (const axis of ENGINE_JARGON) {
        assert(
          !text.toLowerCase().includes(axis.replace(/_/g, " ")) &&
            !text.toLowerCase().includes(axis),
          `« ${axis} » visible dans « ${text} »`,
        );
      }
      // Et jamais un slug brut, quel qu'il soit.
      for (const axis of STEERING_AXES) {
        assert(!text.includes(axis) || !axis.includes("_"), `slug « ${axis} » visible`);
      }
    }
  }
});

Deno.test("chaque position dit CE QU'ELLE PRODUIT, en plan et en aliment", () => {
  for (const fork of COMPOSITION_FORKS) {
    for (const p of fork.positions) {
      assert(p.effect.trim().length > 20, `${fork.key}/${p.key}: effet trop court`);
    }
  }
});

Deno.test("A1 — aucune position n'offre la sèche agressive", () => {
  const cut = compositionForkByKey("how_you_run_a_cut");
  assertEquals(cut.positions.length, 3, "gentle, standard, et pas de règle");
  for (const p of cut.positions) {
    assert(!/aggressiv|agressiv/i.test(p.label + p.effect), p.key);
  }
});

Deno.test("chaque débat porte la position « je ne fais pas de règle »", () => {
  for (const fork of COMPOSITION_FORKS) {
    assert(
      fork.positions.some((p) => p.key === NO_STEERING),
      `${fork.key} n'offre pas de sortie neutre`,
    );
  }
});

Deno.test("le registre du régime n'apparaît nulle part dans le débat", () => {
  for (const fork of COMPOSITION_FORKS) {
    for (const text of [fork.subject, ...fork.positions.flatMap((p) => [p.label, p.effect])]) {
      const word = findDietRegisterWord(text);
      // « calories » est autorisé UNIQUEMENT dans la position qui le refuse:
      // une liste qui nomme l'interdit contient l'interdit.
      if (word && text.toLowerCase().includes("counting calories is noise")) continue;
      assertEquals(word, null, `« ${word} » dans « ${text} »`);
    }
  }
});

Deno.test("la dérivation écrit DEUX choses: une conviction et un jeton", () => {
  const derived = deriveSteeringFromPositions({
    what_drives_a_plate: "calories_are_noise",
  });
  assertEquals(derived.entry?.off, ["energy"]);
  assertEquals(derived.beliefs.length, 1);
  // Le jeton POINTE vers la conviction, il ne la recopie pas.
  assertEquals(derived.entry?.belief_key, derived.beliefs[0].key);
  assert(derived.beliefs[0].claim.length > 0);
});

Deno.test("une position sans conviction laisse le chat MUET", () => {
  // « SILENCE IS NOT A POSITION »: le moteur exécute, le chat n'invente rien.
  const derived = deriveSteeringFromPositions({ how_much_protein: "protein_standard" });
  assertEquals(derived.beliefs, []);
  assertEquals(derived.entry?.belief_key, null);
  assertEquals(derived.entry?.protein_range, "standard");
});

Deno.test("« je ne fais pas de règle » partout ⇒ AUCUNE entrée", () => {
  const derived = deriveSteeringFromPositions(
    Object.fromEntries(COMPOSITION_FORKS.map((f) => [f.key, NO_STEERING])),
  );
  assertEquals(derived.entry, null);
  assertEquals(derived.beliefs, []);
  assertEquals(derived.issues, []);
});

Deno.test("une position inconnue est COMPTÉE et nommée", () => {
  const derived = deriveSteeringFromPositions({ what_drives_a_plate: "nonsense" });
  assertEquals(derived.entry, null);
  assert(derived.issues.some((i) => i.includes("unknown position")));
});

Deno.test("l'extinction gagne sur la priorité quand deux débats se contredisent", () => {
  const derived = deriveSteeringFromPositions({
    what_drives_a_plate: "calories_are_noise",
    how_much_protein: "protein_high",
  });
  assert(!derived.entry!.priorities.includes("energy"));
  assert(derived.entry!.off.includes("energy"));
  assertEquals(derived.entry!.protein_range, "high");
});

Deno.test("ce que la dérivation produit RETRAVERSE le parseur sans perte", () => {
  // La forme dérivée et la forme lue doivent être la MÊME. Deux formes pour une
  // donnée est la divergence silencieuse habituelle de ce dépôt.
  const derived = deriveSteeringFromPositions({
    what_drives_a_plate: "nutrients_first",
    how_much_protein: "protein_high",
    how_you_run_a_cut: "cut_gentle",
    does_the_engine_recalibrate: "no_recalibration",
  });
  const reparsed = parseCompositionSteering([derived.entry]);
  assertEquals(reparsed.issues, []);
  assertEquals(reparsed.entries[0].priorities, derived.entry!.priorities);
  assertEquals(reparsed.entries[0].deficit_style, "gentle");
  assertEquals(reparsed.entries[0].recalibration, "static");
  assertEquals(reparsed.entries[0].protein_range, "high");
});
