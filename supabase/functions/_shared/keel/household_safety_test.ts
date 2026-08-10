import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import {
  HouseholdAllergiesLoadError,
  householdAllergenRefs,
  householdAllergyConstraints,
  householdHardConstraints,
  loadHouseholdAllergies,
} from "./household_safety.ts";
import {
  medicalConstraintTokens,
  findMedicalConstraintViolations,
  safetyConstraintsPromptBlock,
} from "./safety_constraints.ts";
import { applyHouseRuleLock } from "./household_restriction_lock.ts";

// ---------------------------------------------------------------------------
// 1. LA RÉSOLUTION D'UN MOT VERS DES IDENTIFIANTS
// ---------------------------------------------------------------------------

Deno.test("householdAllergenRefs — le slug canonique est retrouvé sous son nom", () => {
  assertEquals(householdAllergenRefs("peanut"), ["peanut"]);
  // Le libellé peut porter plus que le slug: c'est encore le slug qui gouverne.
  assertEquals(householdAllergenRefs("peanut oil"), ["peanut", "peanut_oil"]);
});

Deno.test("householdAllergenRefs — une allergie déclarée EN FRANÇAIS trouve le slug anglais", () => {
  // LE CŒUR DU MODULE. Sans ce cran, « arachide » ne mordrait que sur le mot
  // « arachide » — et le produit sort en anglais par défaut côté génération.
  // C'est la faute « garde testée dans une seule langue », déjà payée deux fois
  // sur ce même matcher.
  assertEquals(householdAllergenRefs("arachide"), ["peanut", "arachide"]);
  // Les diacritiques sont retirés par la même normalisation que le matcher.
  assertEquals(householdAllergenRefs("cacahuète"), ["peanut", "cacahuete"]);
  assertEquals(householdAllergenRefs("fruits à coque"), [
    "tree_nut",
    "fruits_a_coque",
  ]);
});

Deno.test("householdAllergenRefs — une ambiguïté rend LES DEUX slugs, elle n'en choisit pas un", () => {
  // « nut butter » est une forme de surface de `peanut` ET de `tree_nut`. En
  // garder un seul déciderait, à la place d'un parent, laquelle des deux
  // allergies compte.
  const refs = householdAllergenRefs("nut butter");
  assert(refs.includes("peanut"), `peanut absent de ${refs.join(",")}`);
  assert(refs.includes("tree_nut"), `tree_nut absent de ${refs.join(",")}`);
});

Deno.test("householdAllergenRefs — un mot inconnu garde le mot, jamais rien", () => {
  // La propriété qui rend cette fonction incapable de RÉDUIRE la couverture:
  // le pire cas est exactement le comportement naïf.
  assertEquals(householdAllergenRefs("kiwi"), ["kiwi"]);
  assertEquals(householdAllergenRefs("fraise"), ["fraise"]);
  assertEquals(householdAllergenRefs("   "), []);
  assertEquals(householdAllergenRefs(""), []);
});

Deno.test("householdAllergenRefs — les valeurs FRANÇAISES sont pinnées, pas dérivées", () => {
  // ⚠️ ÉPINGLÉ EN DUR, ET C'EST LE SUJET. Une assertion écrite avec un appel à
  // la fonction testée (« refs.slice(0,-1) ») reste verte quand la table des
  // formes de surface change: elle compare la fonction à elle-même. Ces
  // valeurs-ci sont celles que le générateur recevra, relues une par une.
  assertEquals(householdAllergenRefs("lait de vache"), [
    "lactose",
    "dairy",
    "milk",
    "casein",
    "lait_de_vache",
  ]);
  assertEquals(householdAllergenRefs("oeuf"), ["egg", "eggs", "oeuf"]);
  assertEquals(householdAllergenRefs("crevettes"), [
    "shellfish",
    "crustacean",
    "shrimp",
    "crevettes",
  ]);
  assertEquals(householdAllergenRefs("poisson"), ["fish", "poisson"]);
});

Deno.test("householdAllergenRefs — le cran 1 gagne sur le cran 2, et ce n'est pas cosmétique", () => {
  // MUTATION: si l'ordre s'inversait, « milk chocolate » remonterait `lactose`,
  // `dairy` et `casein` (tous portent « milk » en forme de surface) au lieu du
  // seul `milk` nommé. Trois lignes de prompt pour une allergie, et un lecteur
  // qui ne saurait plus laquelle le parent a écrite.
  assertEquals(householdAllergenRefs("milk chocolate"), [
    "milk",
    "milk_chocolate",
  ]);
});

// ---------------------------------------------------------------------------
// 2. L'ENTRÉE DANS L'UNION DE SÉCURITÉ
// ---------------------------------------------------------------------------

Deno.test("householdAllergyConstraints — une bouche SANS COMPTE arme la ceinture médicale", () => {
  const constraints = householdAllergyConstraints(
    [{ id: "a1", memberId: "m-lea", label: "arachide" }],
    "fr-FR",
  );
  // `medicalConstraintTokens` est ce qui arme la ceinture de sortie. Un jeton
  // absent d'ici = un allergène qui peut sortir dans un texte visible.
  const tokens = medicalConstraintTokens(constraints);
  assert(tokens.includes("peanut"), `peanut absent de ${tokens.join(",")}`);

  // Et la ceinture mord VRAIMENT, dans les deux langues, y compris sur les
  // formes de surface que le slug canonique débloque.
  for (const text of [
    "A spoon of peanut butter works well.",
    "Satay sauce over chicken.",
    "Une sauce aux arachides.",
  ]) {
    const violations = findMedicalConstraintViolations(text, constraints);
    assert(violations.length > 0, `pas de morsure sur: ${text}`);
  }
});

Deno.test("householdAllergyConstraints — la négation reste licite, sinon aucun plan n'existe", () => {
  const constraints = householdAllergyConstraints(
    [{ id: "a1", memberId: "m-lea", label: "peanut" }],
    "en-GB",
  );
  // Un plan écrit POUR un allergique est fait d'évictions. Rejeter « sans
  // arachide » rejetterait tous les dîners corrects.
  assertEquals(
    findMedicalConstraintViolations("A peanut-free sauce.", constraints).length,
    0,
  );
  assertEquals(
    findMedicalConstraintViolations("Sans arachide.", constraints).length,
    0,
  );
});

Deno.test("householdAllergyConstraints — le bloc de prompt nomme l'allergène", () => {
  const block = safetyConstraintsPromptBlock(
    householdAllergyConstraints(
      [{ id: "a1", memberId: "m-lea", label: "arachide" }],
      "fr-FR",
    ),
  );
  assert(block !== null, "aucun bloc de contraintes dures");
  assert(block!.includes("peanut"), block!);
  assert(block!.includes("severity=medical"), block!);
});

Deno.test("householdAllergyConstraints — aucune ligne ⇒ aucune contrainte, et c'est une réponse", () => {
  assertEquals(householdAllergyConstraints([], "en-GB"), []);
  assertEquals(safetyConstraintsPromptBlock([]), null);
});

Deno.test("householdAllergyConstraints — le member_id n'entre JAMAIS dans le champ de compte", () => {
  // Une fixture qui range un identifiant de MEMBRE dans un champ de COMPTE rend
  // la fonctionnalité verte sans qu'elle marche: le premier lecteur qui
  // joindrait dessus trouverait zéro ligne, sans rien dire.
  const constraints = householdAllergyConstraints(
    [{ id: "a1", memberId: "m-lea", label: "peanut" }],
    "en-GB",
  );
  assertEquals(constraints[0].userId, "");
  assert(!constraints.some((c) => c.userId === "m-lea"));
});

// ---------------------------------------------------------------------------
// 3. LA SÉPARATION — c'est la garde du lot
// ---------------------------------------------------------------------------

Deno.test("householdHardConstraints — une RÈGLE DE MAISON ne devient jamais une allergie", () => {
  const split = householdHardConstraints({
    allergies: [{ id: "a1", memberId: "m-lea", label: "peanut" }],
    houseRules: [{ memberId: "m-lea", label: "nutella" }],
    contentLocale: "en-GB",
  });

  // La règle de maison n'arme AUCUN jeton médical. Si elle en armait un, le
  // produit rejetterait un dîner parce qu'un parent a interdit une pâte à
  // tartiner — et le refus aurait l'autorité d'une raison de santé.
  const tokens = medicalConstraintTokens(split.safetyConstraints);
  assert(!tokens.includes("nutella"), tokens.join(","));
  assertEquals(split.safetyConstraints.every((c) => c.notes === "peanut"), true);
});

Deno.test("householdHardConstraints — une ALLERGIE n'entre jamais dans le verrou qui tait le pourquoi", () => {
  const split = householdHardConstraints({
    allergies: [{ id: "a1", memberId: "m-lea", label: "peanut" }],
    houseRules: [{ memberId: "m-tom", label: "nutella" }],
    contentLocale: "en-GB",
  });
  assertEquals(split.houseRuleLabels, ["nutella"]);

  // LA CONSÉQUENCE, JOUÉE. Le verrou EFFACE le « pourquoi » d'un plat qui
  // commente un libellé qu'on lui donne. Un plat qui explique qu'il évite
  // l'arachide doit GARDER son explication — c'est une raison médicale, et la
  // taire est précisément ce que ce lot refuse.
  const lock = applyHouseRuleLock(
    [{
      title: "Poulet rôti",
      why: "Sans arachide, pour Lea.",
      method: "Rôtir",
      ingredients: [{ term: "poulet" }],
    }],
    split.houseRuleLabels,
  );
  assertEquals(lock.scrubbed, []);
  assertEquals(lock.dishes[0].why, "Sans arachide, pour Lea.");

  // Contre-épreuve dans le même test: la RÈGLE DE MAISON, elle, est bien tue.
  const commented = applyHouseRuleLock(
    [{
      title: "Pâtes",
      why: "Honore la demande de pâtes, sans nutella.",
      method: "Cuire",
      ingredients: [{ term: "pates" }],
    }],
    split.houseRuleLabels,
  );
  assertEquals(commented.dishes[0].why, null);
  assertEquals(commented.scrubbed.length, 1);
});

Deno.test("householdHardConstraints — un libellé vide ne devient pas un terme de verrou", () => {
  // Un terme vide dans `applyHouseRuleLock` construirait un motif qui matche
  // tout, et jetterait le dîner entier.
  const split = householdHardConstraints({
    allergies: [],
    houseRules: [{ memberId: "m", label: "   " }, { memberId: "m", label: "" }],
    contentLocale: "en-GB",
  });
  assertEquals(split.houseRuleLabels, []);
});

// ---------------------------------------------------------------------------
// 4. LE FAIL-CLOSED DE LA LECTURE
// ---------------------------------------------------------------------------

function fakeDb(
  outcome: { rows?: unknown[]; error?: unknown; throws?: boolean },
): { db: Parameters<typeof loadHouseholdAllergies>[0]; calls: string[] } {
  const calls: string[] = [];
  const query = {
    eq(column: string, value: string) {
      calls.push(`${column}=${value}`);
      return query;
    },
    then(resolve: (v: unknown) => unknown) {
      if (outcome.throws) throw new Error("connection reset");
      return Promise.resolve({
        data: outcome.rows ?? null,
        error: outcome.error ?? null,
      }).then(resolve);
    },
  };
  const db = {
    from(table: string) {
      calls.push(`from:${table}`);
      return {
        select(columns: string) {
          calls.push(`select:${columns}`);
          return query as never;
        },
      };
    },
  };
  return { db: db as never, calls };
}

Deno.test("loadHouseholdAllergies — lit la table du foyer, scopée", async () => {
  const { db, calls } = fakeDb({
    rows: [{ id: "a1", member_id: "m1", label: "arachide" }],
  });
  const rows = await loadHouseholdAllergies(db, "hh-1");
  assertEquals(rows, [{ id: "a1", memberId: "m1", label: "arachide" }]);
  assert(calls.includes("from:household_member_allergies"), calls.join(" "));
  assert(calls.includes("household_id=hh-1"), calls.join(" "));
});

Deno.test("loadHouseholdAllergies — une panne LÈVE, jamais « aucune allergie »", async () => {
  // Le fail-closed du lot: une liste vide et une requête ratée sont
  // indiscernables pour un appelant qui avale l'erreur, et la différence est
  // médicale. Ici elle s'applique à toute une tablée, enfants compris.
  await assertRejects(
    () => loadHouseholdAllergies(fakeDb({ error: { message: "boom" } }).db, "hh"),
    HouseholdAllergiesLoadError,
  );
  await assertRejects(
    () => loadHouseholdAllergies(fakeDb({ throws: true }).db, "hh"),
    HouseholdAllergiesLoadError,
  );
  // Un foyer sans identifiant est une panne, pas un foyer sans allergie.
  await assertRejects(
    () => loadHouseholdAllergies(fakeDb({ rows: [] }).db, ""),
    HouseholdAllergiesLoadError,
  );
});

Deno.test("loadHouseholdAllergies — un ensemble vide est une réponse légitime", async () => {
  assertEquals(await loadHouseholdAllergies(fakeDb({ rows: [] }).db, "hh"), []);
});
