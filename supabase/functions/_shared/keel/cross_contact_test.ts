import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  CROSS_CONTACT_NOT_GUARANTEED_LINE,
  CROSS_CONTACT_UNNAMED_MOUTH,
  type CrossContactCounts,
  crossContactBlock,
  crossContactSeen,
  emptyCrossContactCounts,
  tallyCrossContact,
} from "./cross_contact.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LOT `C1` — LA CONTAMINATION CROISÉE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CETTE SUITE DOIT TENIR, ET POURQUOI CHAQUE MOITIÉ EXISTE :
//
//   · un cas qui MORD  — les deux prémisses, le bloc sort, et il dit la chose ;
//   · deux cas qui PASSENT — chacune des deux prémisses seule, le bloc ne sort
//     PAS. « Une garde a besoin d'un cas qui passe » : cassée, une garde qui
//     bloque tout ressemble trait pour trait à une garde qui marche ;
//   · le COMPTEUR à trois populations, et la preuve que les TROIS sont
//     atteignables. Deux compteurs de cette session étaient structurellement
//     inatteignables — ils ne pouvaient QUE rendre zéro — et seule une mutation
//     l'a révélé ;
//   · la CARDINALITÉ : la somme des trois vaut le nombre de verdicts comptés.
//
// ⛔ AUCUN DE CES TESTS NE PROUVE QU'UNE POÊLE A ÉTÉ LAVÉE. Ils prouvent que la
// phrase part, et sur quelle population. C'est tout ce qu'un JSON peut dire.

const ANOUK = { memberId: "m-anouk", displayName: "Anouk" };
const MALO = { memberId: "m-malo", displayName: "Malo" };
const CAMILLE = { memberId: "m-camille", displayName: "Camille" };

// ───────────────────────────────────────────────────────────────────────────
// ① LE CAS QUI MORD
// ───────────────────────────────────────────────────────────────────────────

Deno.test("C1 ① — les DEUX prémisses: le bloc sort, et il nomme les deux bouches", () => {
  const out = crossContactBlock({
    medicalMouths: [ANOUK],
    unnamedMedical: 0,
    dishBearers: [MALO],
  });
  assertEquals(out.emitted, true);
  assertEquals(out.skipped, null);
  // Les deux prémisses sont RENDUES, chiffrées, par le module qui les a
  // évaluées: c'est ce que l'appelant journalise, au lieu de les recompter.
  assertEquals(out.medicalMouthsSeen, 1);
  assertEquals(out.dishBearersSeen, 1);
  assert(out.block.includes("== THE SAME KITCHEN, TWO DISHES =="), out.block);
  assert(out.block.includes("Anouk carries a medical-severity"), out.block);
  assert(out.block.includes("cooking session: Malo."), out.block);
  // Le geste, et il est ORDONNÉ: le plat protégé passe EN PREMIER. Une consigne
  // qui dirait seulement « lavez entre les deux » laisse la trace du plat
  // d'avant sur la planche du plat qu'on protège.
  assert(out.block.includes("boxed FIRST, before the other dish is started"), out.block);
  assert(out.block.includes("board, knife, pan and worktop are washed in between"), out.block);
  assert(out.block.includes("one serving spoon per dish"), out.block);
  assert(out.block.includes("topped up from the other pot"), out.block);
});

Deno.test("C1 ① bis — plusieurs bouches médicales: l'accord suit, la liste dédoublonne", () => {
  const out = crossContactBlock({
    medicalMouths: [ANOUK, CAMILLE, ANOUK],
    unnamedMedical: 0,
    dishBearers: [MALO],
  });
  assertEquals(out.emitted, true);
  assert(out.block.includes("Anouk and Camille carry a medical-severity"), out.block);
});

// ───────────────────────────────────────────────────────────────────────────
// ② LA PHRASE QUI DIT QUE LA CONSIGNE N'EST PAS GARANTIE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("C1 ② — la consigne DIT qu'elle n'est pas garantie, et elle est dans le bloc", () => {
  // ⛔ C'EST LA LIGNE QU'ON COUPERAIT « POUR GAGNER DU BUDGET ». La couper
  // transforme une consigne honnête en promesse: on ne prouve pas depuis un
  // JSON qu'une poêle a été lavée, et le produit ne doit pas laisser croire le
  // contraire. Elle est épinglée ICI, en littéral, pas via la constante seule.
  assertEquals(
    CROSS_CONTACT_NOT_GUARANTEED_LINE,
    "Nothing further down this pipeline can check a washed pan -- that " +
      "written step is the only part of this rule that reaches the person " +
      "cooking.",
  );
  const out = crossContactBlock({
    medicalMouths: [ANOUK],
    unnamedMedical: 0,
    dishBearers: [MALO],
  });
  assert(out.block.includes(CROSS_CONTACT_NOT_GUARANTEED_LINE), out.block);
  // Et la moitié qui la rend utile: la séparation entre dans les ÉTAPES du
  // plan, seul endroit de cette règle qui atteigne la personne qui cuisine.
  assert(out.block.includes("Put it in the plan, not only in your answer"), out.block);
});

// ───────────────────────────────────────────────────────────────────────────
// ③ LES DEUX CAS QUI PASSENT — et ils sont DISTINCTS
// ───────────────────────────────────────────────────────────────────────────

Deno.test("C1 ③ — un plat dédié SANS bouche médicale: rien, et la raison est `no_medical`", () => {
  const out = crossContactBlock({
    medicalMouths: [],
    unnamedMedical: 0,
    dishBearers: [MALO],
  });
  assertEquals(out.emitted, false);
  assertEquals(out.skipped, "no_medical");
  assertEquals(out.block, "");
});

Deno.test("C1 ③ bis — une bouche médicale SANS plat dédié: rien, raison `no_dedicated`", () => {
  // ⛔ CETTE POPULATION EST LA PLUS IMPORTANTE DES DEUX À DISTINGUER. Elle dit
  // « tout le monde mange la même casserole »: il n'y a pas de seconde poêle,
  // donc la règle n'a pas d'objet. La confondre avec `no_medical` ferait lire
  // « aucun foyer à risque » à un corpus qui en est plein.
  const out = crossContactBlock({
    medicalMouths: [ANOUK],
    unnamedMedical: 0,
    dishBearers: [],
  });
  assertEquals(out.emitted, false);
  assertEquals(out.skipped, "no_dedicated");
  assertEquals(out.block, "");
  // ⛔ ET LES PRÉMISSES SORTENT QUAND MÊME. Un « sauté » qui ne dit pas
  // combien de bouches médicales il a vues ne se distingue pas d'un module
  // qu'on n'a pas appelé.
  assertEquals(out.medicalMouthsSeen, 1);
  assertEquals(out.dishBearersSeen, 0);
});

Deno.test("C1 ③ ter — ni l'un ni l'autre: `no_medical`, et l'ordre est écrit", () => {
  const out = crossContactBlock({
    medicalMouths: [],
    unnamedMedical: 0,
    dishBearers: [],
  });
  assertEquals(out.skipped, "no_medical");
});

// ───────────────────────────────────────────────────────────────────────────
// ④ LA BOUCHE SANS PRÉNOM — la population qui ne peut pas se redéclarer
// ───────────────────────────────────────────────────────────────────────────

Deno.test("C1 ④ — une contrainte médicale NON ATTRIBUÉE arme quand même le bloc", () => {
  // ⛔ SANS CE CAS, LE BLOC SERAIT DÉSARMÉ POUR LA POPULATION QUI EN A LE PLUS
  // BESOIN: la bouche sans compte, cas nominal de `household_member_allergies`,
  // dont le prénom peut manquer au roster. Une allergie retirée pour cause de
  // prénom manquant est exactement le défaut que ce dépôt paie en boucle.
  const out = crossContactBlock({
    medicalMouths: [],
    unnamedMedical: 1,
    dishBearers: [MALO],
  });
  assertEquals(out.emitted, true);
  assert(out.block.includes(`${CROSS_CONTACT_UNNAMED_MOUTH} carries`), out.block);
});

Deno.test("C1 ④ bis — un prénom vide ne compte pas comme un prénom", () => {
  const out = crossContactBlock({
    medicalMouths: [{ memberId: "m-x", displayName: "   " }],
    unnamedMedical: 0,
    dishBearers: [MALO],
  });
  // Aucune bouche nommée, aucune non attribuée déclarée ⇒ la prémisse ① est
  // absente. Compter un blanc comme une bouche ferait sortir un bloc qui ne
  // nomme personne.
  assertEquals(out.emitted, false);
  assertEquals(out.skipped, "no_medical");
});

// ───────────────────────────────────────────────────────────────────────────
// ⑤ LE COMPTEUR — TROIS POPULATIONS, TOUTES ATTEIGNABLES, ET LA CARDINALITÉ
// ───────────────────────────────────────────────────────────────────────────

Deno.test("C1 ⑤ — les TROIS populations sont atteintes, et la somme fait le total", () => {
  const verdicts = [
    // deux fois la règle qui s'applique
    crossContactBlock({ medicalMouths: [ANOUK], unnamedMedical: 0, dishBearers: [MALO] }),
    crossContactBlock({ medicalMouths: [], unnamedMedical: 2, dishBearers: [CAMILLE] }),
    // trois fois « pas de bouche médicale »
    crossContactBlock({ medicalMouths: [], unnamedMedical: 0, dishBearers: [MALO] }),
    crossContactBlock({ medicalMouths: [], unnamedMedical: 0, dishBearers: [] }),
    crossContactBlock({ medicalMouths: [], unnamedMedical: 0, dishBearers: [CAMILLE] }),
    // une fois « pas de plat dédié »
    crossContactBlock({ medicalMouths: [ANOUK], unnamedMedical: 0, dishBearers: [] }),
  ];
  let counts: CrossContactCounts = emptyCrossContactCounts();
  for (const v of verdicts) counts = tallyCrossContact(counts, v);

  // ⛔ LES TROIS SONT NON NULS. C'est ce que la fiche exige, et c'est ce qui
  // sépare « la règle n'avait pas lieu d'être » de « la règle n'a pas tourné ».
  assertEquals(counts.emitted, 2);
  assertEquals(counts.skipped_no_medical, 3);
  assertEquals(counts.skipped_no_dedicated, 1);
  assert(counts.emitted > 0 && counts.skipped_no_medical > 0 &&
    counts.skipped_no_dedicated > 0);

  // ⛔ CARDINALITÉ. Trois compteurs dont la somme ne fait pas le dénominateur
  // sont trois compteurs dont l'un ne tourne pas — et un compteur cloué à zéro
  // se cache très bien derrière deux autres qui bougent.
  assertEquals(crossContactSeen(counts), verdicts.length);
});

Deno.test("C1 ⑤ bis — `emptyCrossContactCounts` part de zéro, `tally` n'écrit pas dans l'entrée", () => {
  const zero = emptyCrossContactCounts();
  assertEquals(zero, { emitted: 0, skipped_no_medical: 0, skipped_no_dedicated: 0 });
  assertEquals(crossContactSeen(zero), 0);
  const after = tallyCrossContact(
    zero,
    crossContactBlock({ medicalMouths: [ANOUK], unnamedMedical: 0, dishBearers: [MALO] }),
  );
  // L'entrée est intacte: un tableau partagé entre deux boucles ne doit pas
  // porter le compte de la précédente.
  assertEquals(zero.emitted, 0);
  assertEquals(after.emitted, 1);
});

// ───────────────────────────────────────────────────────────────────────────
// ⑥ L'ARME — ce test rougit dès qu'une prémisse est débranchée
// ───────────────────────────────────────────────────────────────────────────

Deno.test("C1 ⑥ MUTATION — le bloc sort SUR LES DEUX PRÉMISSES ET SUR ELLES SEULES", () => {
  // ⛔ C'EST L'ARME DU LOT. Elle rougit sous les deux sabotages qui comptent:
  //   · débrancher la prémisse médicale (« sortir toujours ») ⇒ les deux
  //     `false` ci-dessous deviennent `true`;
  //   · clouer le compteur à zéro ⇒ le test ⑤ tombe, et celui-ci reste vert:
  //     il faut donc LES DEUX tests, aucun ne couvre l'autre.
  const table: readonly [boolean, number, number, boolean][] = [
    // [bouche médicale nommée ?, non attribuées, plats dédiés, bloc attendu]
    [true, 0, 1, true],
    [false, 1, 1, true],
    [true, 0, 0, false],
    [false, 0, 1, false],
    [false, 0, 0, false],
    [true, 2, 3, true],
  ];
  let seen = 0;
  for (const [medical, unnamed, bearers, expected] of table) {
    const out = crossContactBlock({
      medicalMouths: medical ? [ANOUK] : [],
      unnamedMedical: unnamed,
      dishBearers: Array.from({ length: bearers }, (_, i) => ({
        memberId: `m-${i}`,
        displayName: `Bearer${i}`,
      })),
    });
    assertEquals(out.emitted, expected, JSON.stringify({ medical, unnamed, bearers }));
    assertEquals(out.block !== "", expected, "un bloc vide et un bloc émis ne se confondent pas");
    seen += 1;
  }
  // CARDINALITÉ du tableau: six cas, et retirer une ligne se voit.
  assertEquals(seen, 6);
});
