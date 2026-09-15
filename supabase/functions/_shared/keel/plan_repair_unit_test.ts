/**
 * ══════════════════════════════════════════════════════════════════════════
 * L'UNITÉ DE RÉPARATION — CE QU'ELLE ADRESSE, ET CE QU'ELLE N'INVENTE PAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Les trois cas que la revue du 2026-09-12 a REPRODUITS avec les fonctions de
 * production, et qui ne trouvaient aucune adresse:
 *   · un déficit protéique d'une JOURNÉE (une date, aucun créneau);
 *   · DEUX PLATS DÉDIÉS au même jour et au même moment;
 *   · une PORTION ATTENDUE ET ABSENTE, qui n'existe dans aucun tableau.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildRepairUnits,
  REPAIR_SLOT_ORDER,
  unitOfDishIndex,
} from "./plan_repair_unit.ts";
import type { RepairExpectedCell, RepairUnitDish } from "./plan_repair_unit.ts";
import { EATING_OCCASIONS, MEAL_SLOTS } from "./meal_generation.ts";

function plat(
  day: string | null,
  slot: string,
  title: string,
  o: {
    memberId?: string | null;
    eaters?: readonly string[];
    uses?: readonly string[];
  } = {},
): RepairUnitDish {
  return {
    day,
    slot,
    title,
    memberId: o.memberId ?? null,
    boxes: (o.eaters ?? []).map((m, i) => ({ id: `b${i}`, memberIds: [m] })),
    uses: (o.uses ?? []).map((preparationId) => ({ preparationId })),
  };
}

function cell(
  memberId: string,
  dayToken: string,
  slot: string,
  date: string,
): RepairExpectedCell {
  return { memberId, dayToken, slot, date };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① L'ORDRE DES CRÉNEAUX EST CELUI DU MOTEUR — ÉPINGLÉ, PAS RECOPIÉ EN AVEUGLE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① l'ordre des créneaux recopié est EXACTEMENT celui de `MEAL_SLOTS`", () => {
  // ⛔ `plan_repair_unit.ts` NE PEUT PAS IMPORTER `meal_generation.ts` (10 300
  // lignes, un parseur, deux ceintures) sans devenir intestable. Il recopie
  // donc la liste — et cette comparaison est ce qui empêche la copie de
  // diverger en silence, ce qui rendrait les `unit_id` instables d'un tour à
  // l'autre.
  assertEquals([...REPAIR_SLOT_ORDER], [...MEAL_SLOTS]);
  assertEquals(REPAIR_SLOT_ORDER.length, EATING_OCCASIONS.length + 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② DEUX PLATS DÉDIÉS AU MÊME CRÉNEAU — DEUX UNITÉS, DEUX JETONS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② deux plats dédiés au même jour et au même moment font DEUX unités", () => {
  // ⛔ LE DÉFAUT ② DE LA REVUE. `cellAddress(day, slot)` rendait `sun/dinner`
  // pour les deux ; `candidateParCase` gardait le premier trouvé, et réparer
  // l'assiette de Zoé remplaçait la recette de Paul.
  const index = buildRepairUnits({
    dishes: [
      plat("sun", "dinner", "Poisson de Zoé", { memberId: "zoe" }),
      plat("sun", "dinner", "Poulet de Paul", { memberId: "paul" }),
    ],
    expected: [
      cell("zoe", "sun", "dinner", "2026-09-13"),
      cell("paul", "sun", "dinner", "2026-09-13"),
    ],
  });
  assertEquals(index.counts.present, 2);
  assertEquals(index.counts.reserved, 0);
  const ids = index.present.map((u) => u.unitId);
  assertEquals(new Set(ids).size, 2, "deux jetons distincts");
  assertEquals(
    index.present.map((u) => u.ownerId).sort(),
    ["paul", "zoe"],
  );
  // ⛔ ET LA DATE VIENT DE LA GRILLE, PAS DU PLAT: un plat ne porte qu'un jeton.
  assertEquals(index.present.every((u) => u.date === "2026-09-13"), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ UNE PORTION ATTENDUE ET ABSENTE A UN NOM
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ une bouche non nourrie à un créneau réserve une unité", () => {
  const index = buildRepairUnits({
    dishes: [
      // ⚠️ LE PLAT DE LA MAISON NE NOURRIT QUE ZOÉ: son couvercle ne nomme
      // qu'elle. Paul est attendu au même créneau et n'a rien.
      plat("sun", "dinner", "Gratin de la maison", { eaters: ["zoe"] }),
    ],
    expected: [
      cell("zoe", "sun", "dinner", "2026-09-13"),
      cell("paul", "sun", "dinner", "2026-09-13"),
    ],
  });
  assertEquals(index.counts.present, 1);
  assertEquals(index.counts.reserved, 1);
  const reservee = index.reserved[0];
  assertEquals(reservee.ownerId, "paul");
  assertEquals(reservee.slot, "dinner");
  assertEquals(reservee.dishIndex, null);
  assertEquals(reservee.title, null);
});

Deno.test("③ bis — sans grille attendue, AUCUNE unité réservée, et ça se compte", () => {
  // ⛔ LE CAS QUI PASSE, ET QUI DIT POURQUOI. Le chemin d'adoption relit une
  // ligne de base et n'a aucune demande sous la main: zéro case attendue est
  // légitime. Mais `expected_cells: 0` doit se lire, sinon une passe désarmée
  // rend la même chose qu'une passe complète.
  const index = buildRepairUnits({
    dishes: [plat("sun", "dinner", "Gratin", { eaters: ["zoe"] })],
    expected: [],
  });
  assertEquals(index.counts.expected_cells, 0);
  assertEquals(index.counts.reserved, 0);
  assertEquals(index.counts.present, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES JETONS SONT STABLES TANT QUE L'IDENTITÉ NE BOUGE PAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ réparer le CONTENU d'un plat ne change pas son `unit_id`", () => {
  // ⛔ C'EST TOUTE LA PROPRIÉTÉ DU JETON. S'il venait du titre ou de l'index du
  // tableau, il changerait au premier plat réparé — et le patch du tour suivant
  // s'appliquerait à côté.
  const avant = buildRepairUnits({
    dishes: [
      plat("sat", "lunch", "Pita au thon", { eaters: ["zoe"] }),
      plat("sat", "dinner", "Saumon", { eaters: ["zoe"] }),
    ],
    expected: [
      cell("zoe", "sat", "lunch", "2026-09-12"),
      cell("zoe", "sat", "dinner", "2026-09-12"),
    ],
  });
  const apres = buildRepairUnits({
    dishes: [
      plat("sat", "lunch", "TOUT AUTRE CHOSE", { eaters: ["zoe"], uses: ["p9"] }),
      plat("sat", "dinner", "Saumon", { eaters: ["zoe"] }),
    ],
    expected: [
      cell("zoe", "sat", "lunch", "2026-09-12"),
      cell("zoe", "sat", "dinner", "2026-09-12"),
    ],
  });
  assertEquals(
    avant.present.map((u) => `${u.unitId}@${u.slot}`),
    apres.present.map((u) => `${u.unitId}@${u.slot}`),
  );
  // ⛔ ET L'ORDRE SUIT LE CRÉNEAU, PAS L'ORDRE D'ÉCRITURE DU MODÈLE.
  assertEquals(avant.present.map((u) => u.slot), ["lunch", "dinner"]);
});

Deno.test("④ bis — un plat sans moment n'a pas d'adresse, et il se compte", () => {
  const index = buildRepairUnits({
    dishes: [plat("sat", "", "Plat sans moment"), plat("sat", "lunch", "Pita")],
    expected: [cell("zoe", "sat", "lunch", "2026-09-12")],
  });
  assertEquals(index.counts.unaddressed_dishes, 1);
  assertEquals(index.counts.present, 1);
  // ⚠️ ET L'INDEX DU PLAT GARDÉ EST LE VRAI: `1`, pas `0`. Un décalage ici
  // ferait poser un patch sur le plat d'à côté.
  assertEquals(index.present[0].dishIndex, 1);
  assertEquals(unitOfDishIndex(index, 1)?.title, "Pita");
  assertEquals(unitOfDishIndex(index, 0), null);
});

Deno.test("④ ter — un plan d'UN SEUL JOUR accepte un plat sans jeton de jour", () => {
  // ⚠️ LE CAS NOMINAL D'UNE FENÊTRE D'UN JOUR: le modèle omet `day`. Le
  // rattacher au jour unique de la demande est la seule lecture possible, et
  // elle ne devine rien — il n'y a qu'un candidat.
  const index = buildRepairUnits({
    dishes: [plat(null, "lunch", "Pita", { eaters: ["zoe"] })],
    expected: [cell("zoe", "sat", "lunch", "2026-09-12")],
  });
  assertEquals(index.counts.present, 1);
  assertEquals(index.counts.reserved, 0, "la case est servie, rien à réserver");
  assertEquals(index.present[0].date, "2026-09-12");
  assertEquals(index.counts.unaddressed_dishes, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ L'ENTRÉE DE DERNIER RECOURS — UNE UNITÉ POUR UN PLAT QUI S'AJOUTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑤ un COMPLÉMENT réserve une unité même quand la personne est servie", () => {
  // ⛔ LE CAS MESURÉ AU TIR FAST2 (2026-09-08): le dîner commun tire trois
  // casseroles partagées, deux adultes sont dans leurs bornes, et il n'y a NI
  // frais NI casserole réécrivable. On ne peut plus rien faire au plat; la
  // personne bloquée n'a qu'une sortie, un petit plat à elle au même moment.
  //
  // ⛔ ET ELLE N'A AUCUNE ADRESSE DANS `meal.dishes`: le plat n'existe pas
  // encore, et la case est déjà servie — donc aucune unité réservée ordinaire
  // ne la désigne.
  const index = buildRepairUnits({
    dishes: [plat("sun", "dinner", "Gratin de la maison", { eaters: ["zoe", "paul"] })],
    expected: [
      cell("zoe", "sun", "dinner", "2026-09-13"),
      cell("paul", "sun", "dinner", "2026-09-13"),
    ],
    complements: [cell("paul", "sun", "dinner", "2026-09-13")],
  });
  assertEquals(index.counts.present, 1);
  // ⛔ AUCUNE UNITÉ RÉSERVÉE ORDINAIRE: les deux bouches SONT servies.
  assertEquals(index.counts.reserved, 1);
  assertEquals(index.counts.complements, 1);
  const comp = index.reserved[0];
  assertEquals(comp.isComplement, true);
  assertEquals(comp.ownerId, "paul");
  assertEquals(comp.slot, "dinner");
  // ⛔ ET LE COMPLÉMENT PASSE APRÈS L'UNITÉ QU'IL COMPLÈTE. Les deux partagent
  // date, créneau et propriétaire: sans ce départage, leurs jetons
  // dépendraient de l'ordre d'arrivée des tableaux.
  assertEquals(index.units.map((u) => u.isComplement), [false, true]);
});

Deno.test("⑤ bis — sans complément demandé, AUCUNE unité de complément", () => {
  // ⛔ LA CONTRE-ÉPREUVE. Une unité de complément créée sans demande ferait
  // proposer un plat de plus à quelqu'un dont l'assiette va bien.
  const index = buildRepairUnits({
    dishes: [plat("sun", "dinner", "Gratin", { eaters: ["zoe"] })],
    expected: [cell("zoe", "sun", "dinner", "2026-09-13")],
  });
  assertEquals(index.counts.complements, 0);
  assertEquals(index.units.every((u) => !u.isComplement), true);
});
