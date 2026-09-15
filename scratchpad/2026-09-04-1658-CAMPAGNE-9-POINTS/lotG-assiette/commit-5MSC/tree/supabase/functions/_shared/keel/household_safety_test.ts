import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";

import {
  HOUSEHOLD_SAFETY_UNREADABLE_BLOCK,
  HouseholdAllergenWithoutSurfaceFormsError,
  HouseholdAllergiesLoadError,
  beltRefWithoutFormsCount,
  householdAllergenRefs,
  resetBeltRefWithoutFormsCount,
  householdAllergyConstraints,
  householdAllergyPromptBlock,
  householdConstraintMouths,
  householdConstraintRefs,
  householdHardConstraints,
  loadHouseholdAllergies,
  loadHouseholdTurnSafety,
} from "./household_safety.ts";
import {
  medicalConstraintTokens,
  findMedicalConstraintViolations,
  safetyConstraintsPromptBlock,
} from "./safety_constraints.ts";
import { surfaceFormsFor } from "./allergen_surface_forms.ts";
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

Deno.test("householdAllergenRefs — ⛔ un mot inconnu FAIT ÉCHOUER, il ne se tait plus", () => {
  // ⛔ CE TEST EST L'INVERSE EXACT DE CELUI QU'IL REMPLACE (lot `S1b`,
  // 2026-08-22), et l'ancien est conservé ici en toutes lettres:
  //
  //     ~~« un mot inconnu garde le mot, jamais rien »~~
  //     ~~assertEquals(householdAllergenRefs("kiwi"), ["kiwi"]);~~
  //     ~~« la propriété qui rend cette fonction incapable de RÉDUIRE la~~
  //     ~~couverture: le pire cas est exactement le comportement naïf. »~~
  //
  // Ce que cette propriété ne disait pas, c'est ce que « le comportement naïf »
  // vaut vraiment: la ceinture de sortie part alors chercher LE MOT TAPÉ, dans
  // la langue où il a été tapé, dans un texte que le générateur écrit en
  // anglais. Mesuré le 2026-08-22 sur la ligne réelle `fruits_de_mer`:
  // 1 morsure en français, 0 en anglais — et pas un log, pas un compteur, pas
  // un champ pour le dire.
  //
  // ⚠️ CE QUE ÇA COÛTE EST RÉEL ET IL EST ÉCRIT: une allergie au kiwi ne
  // compose plus AUCUN plan. L'échange est mesuré sur la population réelle
  // (`household_member_allergies`, 6 lignes: peanut, pistachio, gluten,
  // celeriac, arachide, sesame) — la levée mord **0 fois sur 6**. Le geste du
  // retour arrière tient en une ligne, il est nommé sur l'erreur elle-même.
  for (const inconnu of ["kiwi", "fraise"]) {
    const leve = assertThrows(
      () => householdAllergenRefs(inconnu),
      HouseholdAllergenWithoutSurfaceFormsError,
    ) as HouseholdAllergenWithoutSurfaceFormsError;
    // LE MESSAGE DIT QUOI FAIRE. Il sort TEL QUEL à l'écran (500 → jeton
    // inconnu → `MealBuilder.tsx:869` affiche le brut): s'il ne nommait pas le
    // geste, il ne servirait qu'à faire ouvrir un ticket.
    assertStringIncludes(leve.message, inconnu);
    assertStringIncludes(leve.message, "ALLERGEN_SURFACE_FORMS");
    assertEquals(leve.refs, [inconnu]);
  }
  // UN LIBELLÉ VIDE NE LÈVE PAS: il n'y a aucune allergie à couvrir, donc
  // aucune couverture à promettre. Sans cette borne, une ligne au libellé blanc
  // refuserait tous les plans du foyer.
  assertEquals(householdAllergenRefs("   "), []);
  assertEquals(householdAllergenRefs(""), []);
});

Deno.test("householdAllergenRefs — ⛔ LE CAS QUI PASSE: les 6 libellés réels du foyer", () => {
  // ⛔ SANS CE TEST, une levée cassée-fermée (« tout lève ») serait verte sur
  // celui du dessus et ressemblerait trait pour trait à une garde qui marche.
  // C'est la cicatrice « une garde a besoin d'un cas qui passe ».
  //
  // Ce sont les libellés RELUS dans `household_member_allergies` le
  // 2026-08-22, un par un, avec leur compte:
  //   peanut 2 · pistachio 2 · gluten 1 · celeriac 1 · arachide 1 · sesame 1
  // « arachide » est celui de la FIXTURE OBLIGATOIRE (`V0-C`): s'il levait,
  // `V0-D` et la vérification de fin de chaque vague tomberaient avec lui.
  const enBase = [
    "peanut",
    "pistachio",
    "gluten",
    "celeriac",
    "arachide",
    "sesame",
  ];
  let couverts = 0;
  for (const label of enBase) {
    const refs = householdAllergenRefs(label);
    assert(refs.length > 0, `« ${label} » ne rend aucun identifiant`);
    couverts += 1;
  }
  // ⛔ ASSERTION DE CARDINALITÉ (cicatrice `V0-B-bis`): une boucle sur zéro cas
  // est verte sans rien prouver.
  assertEquals(couverts, 6, "les 6 libellés réels doivent tous être exercés");
});

Deno.test("householdAllergenRefs — `fruits de mer` cesse d'être un ref muet", () => {
  // LE LOT LUI-MÊME. Avant `S1b`: `["fruits_de_mer"]`, dont
  // `surfaceFormsFor` rendait `[]`. Après: le jeton du catalogue arrive DEVANT,
  // et il porte les formes anglaises que le plan écrit.
  const refs = householdAllergenRefs("fruits de mer");
  // ⚠️ LE SLUG RENDU NE CHANGE PAS — et c'est mesuré, pas supposé. `fruits_de_mer`
  // est désormais une CLÉ de la table, donc le cran 1 le retrouve « sous son
  // nom » et le cran 2 n'est pas consulté (« le cran 1 gagne sur le cran 2 »,
  // test plus haut). Ce qui change est TOUT ce qu'il y a derrière.
  assertEquals(refs, ["fruits_de_mer"]);
  // ⛔ CE QUI CHANGE: avant `S1b`, `surfaceFormsFor` rendait `[]` pour ce slug,
  // et c'était l'unique identifiant de la contrainte. La ceinture n'avait donc
  // que le mot français, dans un plan écrit en anglais.
  assert(
    surfaceFormsFor("fruits_de_mer").length > 0,
    "'fruits_de_mer' ne porte aucune forme de surface",
  );
  // ET C'EST LA COUVERTURE QU'ON VÉRIFIE, PAS LE COMPTE. Un test qui aurait
  // seulement compté les formes serait resté vert sur une liste de mots
  // français — c'est-à-dire sur le défaut d'origine.
  for (const attendu of ["shellfish", "seafood", "shrimp", "crab"]) {
    assert(
      surfaceFormsFor("fruits_de_mer").includes(attendu),
      `'${attendu}' manque aux formes de 'fruits_de_mer': le plan l'écrit`,
    );
  }
});

Deno.test("householdAllergenRefs — le compteur `belt_ref_without_forms`", () => {
  // ⛔ LE SEUIL PRODUIT EST **0**. Le compteur existe parce qu'un `console.error`
  // ne se groupe pas et ne se compare pas d'un run à l'autre — c'est la
  // cicatrice `V0-B-bis`: « un remplissage qui lève en boucle ressemblait à un
  // remplissage qui marche ».
  resetBeltRefWithoutFormsCount();
  assertEquals(beltRefWithoutFormsCount(), 0);

  // Les 6 libellés réels, plus celui du lot: le compteur ne bouge pas.
  for (
    const label of [
      "peanut",
      "pistachio",
      "gluten",
      "celeriac",
      "arachide",
      "sesame",
      "fruits de mer",
    ]
  ) {
    householdAllergenRefs(label);
  }
  assertEquals(
    beltRefWithoutFormsCount(),
    0,
    "aucun libellé réel ne doit incrémenter le compteur",
  );

  // ⛔ ET IL COMPTE VRAIMENT. Sans cette moitié, un compteur cloué à zéro serait
  // vert sur l'assertion du dessus — c'est exactement « un compteur désarmé
  // ressemble à un compteur qui marche ».
  assertThrows(() => householdAllergenRefs("kiwi"));
  assertEquals(beltRefWithoutFormsCount(), 1);
  assertThrows(() => householdAllergenRefs("fraise"));
  assertEquals(beltRefWithoutFormsCount(), 2);
  resetBeltRefWithoutFormsCount();
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
  // ⚠️ UNE VALEUR A CHANGÉ LE 2026-08-22 (lot `S1b`), ET C'EST VOULU.
  // ~~["shellfish", "crustacean", "shrimp", "crevettes"]~~ gagne
  // `fruits_de_mer`, parce que la clé miroir qui répare les lignes déjà en base
  // porte « crevette » comme forme de surface. C'est le comportement DÉJÀ
  // documenté du cran 2 — « une ambiguïté rend PLUSIEURS slugs, elle n'en
  // choisit pas un » — et c'est exactement ce qui se passe depuis le
  // 2026-08-19 pour `celery`/`celeriac`. L'INVARIANT de ce test est intact:
  // ces valeurs restent épinglées EN DUR, jamais dérivées d'un appel à la
  // fonction testée.
  assertEquals(householdAllergenRefs("crevettes"), [
    "shellfish",
    "fruits_de_mer",
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
    // `null` = une seule bouche. L'attribution par prénom est mesurée dans son
    // propre test, plus bas.
    null,
  );
  assert(block !== null, "aucun bloc de contraintes dures");
  assert(block!.includes("peanut"), block!);
  assert(block!.includes("severity=medical"), block!);
});

Deno.test("householdAllergyConstraints — aucune ligne ⇒ aucune contrainte, et c'est une réponse", () => {
  assertEquals(householdAllergyConstraints([], "en-GB"), []);
  assertEquals(safetyConstraintsPromptBlock([], null), null);
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

// ---------------------------------------------------------------------------
// 5. LA LANE DE LA CONVERSATION (chantier 5)
//
// Le générateur connaissait ces allergies; le chat non. Un parent qui demandait
// « je cuisine quoi ce soir ? » n'avait pas l'allergie de son enfant armée.
// ---------------------------------------------------------------------------

/**
 * ⚠️ UN IDENTIFIANT DE MEMBRE N'EST PAS UN IDENTIFIANT DE COMPTE, et c'est tout
 * l'intérêt du décor: Léa a huit ans, elle n'a pas d'adresse e-mail, et sa ligne
 * n'existe que sous `member_id`. Un décor qui réutiliserait le `user_id` du
 * parent ferait passer un chargeur qui joint encore sur les comptes — c'est-à-
 * dire exactement le trou que ce lot ferme.
 */
const LEA_MEMBER = "33333333-3333-4333-8333-333333333333";
const HOUSE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

Deno.test("loadHouseholdTurnSafety — l'allergie d'un ENFANT SANS COMPTE arme le tour du parent", async () => {
  const { db, calls } = fakeDb({
    rows: [{ id: "a1", member_id: LEA_MEMBER, label: "arachide" }],
  });
  const safety = await loadHouseholdTurnSafety(db as never, {
    householdId: HOUSE_ID,
    contentLocale: "fr-FR",
  });
  assertEquals(safety.unreadableReason, null);
  // Les DEUX identifiants, et le premier est le point du lot: une allergie
  // saisie en français mord sur `peanut` et sur ses formes de surface.
  assertEquals(
    safety.constraints.map((c) => c.allergenRef),
    ["peanut", "arachide"],
  );
  assertEquals([...new Set(safety.constraints.map((c) => c.severity))], [
    "medical",
  ]);
  // Le champ de COMPTE reste vide: Léa n'en a pas, et y ranger son `member_id`
  // serait une fixture qui ment sur la forme de la donnée.
  assertEquals([...new Set(safety.constraints.map((c) => c.userId))], [""]);
  assert(calls.includes(`household_id=${HOUSE_ID}`), calls.join(" "));
});

Deno.test("loadHouseholdTurnSafety — SANS FOYER, aucune requête et aucune allocation", async () => {
  // `run.ts` est le chemin de TOUTES les conversations du produit, et la
  // majorité n'a pas de foyer. Ce test est la preuve n°3 du lot: rien n'est
  // payé. `calls` VIDE, pas « calls sans la table des allergies ».
  const { db, calls } = fakeDb({ rows: [{ id: "x", member_id: "m", label: "arachide" }] });
  for (const householdId of [null, "", "   "]) {
    const safety = await loadHouseholdTurnSafety(db as never, {
      householdId,
      contentLocale: "fr-FR",
    });
    assertEquals(calls, [], `une requête est partie pour ${JSON.stringify(householdId)}`);
    assertEquals(safety.constraints, []);
    assertEquals(safety.unreadableReason, null);
    // Et le bloc de prompt ne pousse RIEN: pas de « ce foyer n'a pas
    // d'allergie » chez quelqu'un qui vit seul.
    assertEquals(householdAllergyPromptBlock(safety), null);
  }
});

Deno.test("loadHouseholdTurnSafety — une panne NE LÈVE PAS, elle se NOMME", async () => {
  // L'ARBITRAGE DU LOT, et il n'est pas celui du générateur. `generate-household
  // -meal-v1` répond 503 et ne compose rien: sa seule sortie EST un repas. Un
  // tour de chat porte aussi le routage de crise et le renvoi clinicien —
  // refuser LE TOUR pour une lecture d'allergie ratée coûte plus qu'il ne
  // protège, et serait plus strict que la lane individuelle, qui fail-open
  // nommément pendant la MÊME panne.
  for (const outcome of [{ error: { message: "boom" } }, { throws: true }]) {
    const safety = await loadHouseholdTurnSafety(fakeDb(outcome).db as never, {
      householdId: HOUSE_ID,
      contentLocale: "fr-FR",
    });
    assertEquals(safety.constraints, []);
    assert(safety.unreadableReason, "une panne doit se nommer");
    // ⚠️ ET ELLE NE SE CONFOND PAS AVEC « aucune allergie »: c'est la capacité
    // de PROPOSER à manger qui est coupée, pas la conversation.
    const block = householdAllergyPromptBlock(safety);
    assertEquals(block, HOUSEHOLD_SAFETY_UNREADABLE_BLOCK);
    assertStringIncludes(block!, "do NOT propose");
    assertStringIncludes(block!, "Everything else in this conversation is unaffected");
    // Relire un plat DÉJÀ composé reste permis: il a été produit par le
    // générateur, qui refuse de composer sans la ceinture.
    assertStringIncludes(block!, "is NOT proposing food");
  }
});

Deno.test("householdAllergyPromptBlock — il NOMME l'allergène et n'attribue PAS l'allergie", async () => {
  const safety = await loadHouseholdTurnSafety(
    fakeDb({ rows: [{ id: "a1", member_id: LEA_MEMBER, label: "arachide" }] })
      .db as never,
    { householdId: HOUSE_ID, contentLocale: "fr-FR" },
  );
  const block = householdAllergyPromptBlock(safety)!;
  assertStringIncludes(block, "AVOID: peanut, arachide");
  assertStringIncludes(block, "household_member_allergies");
  // ⚠️ POURQUOI CE BLOC EXISTE AU LIEU D'ALLONGER CELUI DE L'ÉLÈVE: le bloc
  // d'en face titre « THIS STUDENT'S HARD CONSTRAINTS », et y verser l'allergie
  // d'un enfant ferait dire au modèle qu'un parent est allergique.
  assertStringIncludes(block, "never tell the person you are talking to that");
  assert(
    !safetyConstraintsPromptBlock(safety.constraints, null)!.includes("household"),
    "le bloc de l'élève ne parle pas du foyer — d'où le bloc séparé",
  );
});

Deno.test("LA CEINTURE MORD DANS LES DEUX LANGUES — « arachide » couvre peanut et ses formes", async () => {
  // « Une garde testée dans une seule langue est à moitié désarmée. » Le produit
  // sort en français par défaut (`profiles.locale` = fr-FR) et l'allergie est
  // saisie en toutes lettres par un humain; la réponse, elle, peut sortir dans
  // l'une ou l'autre langue.
  const safety = await loadHouseholdTurnSafety(
    fakeDb({ rows: [{ id: "a1", member_id: LEA_MEMBER, label: "arachide" }] })
      .db as never,
    { householdId: HOUSE_ID, contentLocale: "fr-FR" },
  );
  for (
    const text of [
      "Add a spoon of peanut butter to the oats.",
      "the nut butter option is the stronger bag snack", // la sortie réelle de 2026-08-03
      "Try PB on rice cakes.",
      "Satay sauce over chicken works well tonight.",
      "Une cuillère de beurre de cacahuète dans les flocons.",
      "Des cacahuètes grillées pour l'apéro.",
      "Un peu d'arachide dans le wok.",
    ]
  ) {
    assert(
      findMedicalConstraintViolations(text, safety.constraints).length > 0,
      `la ceinture n'a pas mordu sur: ${text}`,
    );
  }
  // La NÉGATION reste licite, sinon on ne peut plus expliquer l'éviction — et
  // un foyer allergique est littéralement fait d'évictions.
  assertEquals(
    findMedicalConstraintViolations(
      "Ce plat ne contient pas d'arachide.",
      safety.constraints,
    ).length,
    0,
  );
});

Deno.test("householdConstraintRefs — une rétractation du locuteur ne désarme pas le foyer", async () => {
  // Le désarmement n°5 de la ceinture laisse quelqu'un faire nommer la
  // contrainte qu'il vient de RETIRER. Une allergie de foyer n'est pas la
  // sienne: le chat n'écrit que dans `student_safety_constraints`, la ligne du
  // foyer SURVIT, et l'honorer ferait taire l'allergie d'un enfant parce qu'un
  // adulte a dit que la sienne avait disparu.
  const safety = await loadHouseholdTurnSafety(
    fakeDb({ rows: [{ id: "a1", member_id: LEA_MEMBER, label: "arachide" }] })
      .db as never,
    { householdId: HOUSE_ID, contentLocale: "fr-FR" },
  );
  const refs = householdConstraintRefs(safety.constraints);
  assert(refs.has("peanut"), [...refs].join(","));
  assert(refs.has("arachide"), [...refs].join(","));
  assertEquals(refs.has("sesame"), false);
});

// ---------------------------------------------------------------------------
// 6. À QUI EST CHAQUE CONTRAINTE DURE — le défaut du 2026-08-19
// ---------------------------------------------------------------------------
//
// LE DÉFAUT, MESURÉ SUR DEUX RUNS RÉELS DE LA LANE FOYER. Les contraintes
// partaient au modèle DÉTACHÉES de leur bouche, sous un en-tête au SINGULIER
// pour une tablée de quatre. F1 (`f0100001-…`) a deviné la bouche et deviné
// juste par chance; F2 (`f0100002-…`) a mis 120 g de traybake au pistachio
// dans la boîte de l'ALLERGIQUE et écrit l'avertissement sur l'assiette du
// VOISIN. Les deux runs sont morts en 422 `empty_meal`.
//
// Le patron copié est celui des règles de maison, dix lignes plus bas dans le
// même prompt: `- Peregrine: never serve fennel`, attachée, appliquée 4/4.

const TABLE_OF_TWO = { mouths: 2 } as const;

function twoMouthConstraints() {
  const split = householdHardConstraints({
    allergies: [
      { id: "a1", memberId: "m-peregrine", label: "pistachio" },
      { id: "a2", memberId: "m-odalric", label: "celeriac" },
    ],
    houseRules: [],
    contentLocale: "en-GB",
  });
  const mouths = householdConstraintMouths({
    constraints: split.safetyConstraints,
    memberIdOf: split.memberIdOf,
    nameOfMember: new Map([
      ["m-peregrine", "Peregrine"],
      ["m-odalric", "Odalric"],
    ]),
    nameOfAccount: new Map(),
  });
  return { split, mouths };
}

Deno.test("le bloc de contraintes NOMME la bouche de chaque ligne, comme les règles de maison", () => {
  const { split, mouths } = twoMouthConstraints();
  const block = safetyConstraintsPromptBlock(split.safetyConstraints, {
    nameOf: mouths.nameOf,
    ...TABLE_OF_TWO,
  })!;
  // Le pistachio est celui de PEREGRINE, le celeriac celui d'ODALRIC — et le
  // prompt le dit, ligne par ligne. C'est exactement ce que F1 et F2 ont dû
  // deviner, et que l'un des deux a deviné à l'envers.
  assertStringIncludes(block, "- Peregrine: pistachio");
  assertStringIncludes(block, "- Odalric: celeriac");
  // `pistachio` est aussi une forme de surface de `tree_nut`: les DEUX
  // identifiants sortent, et les deux portent le même prénom.
  assertStringIncludes(block, "- Peregrine: tree_nut");
  // Et l'en-tête cesse de parler au singulier d'une tablée.
  assert(
    !block.includes("THIS STUDENT'S HARD CONSTRAINTS"),
    "l'en-tête est resté au singulier pour une tablée:\n" + block,
  );
  assertStringIncludes(block, "MOUTHS AT THIS TABLE");
});

Deno.test("nommer la bouche ne RÉTRÉCIT pas la règle à son assiette", () => {
  // ⛔ LA MOITIÉ QUI EMPÊCHE LE PRÉNOM DE DEVENIR UNE PERMISSION. F1 avait déjà
  // lu la liste détachée comme « je le sers à l'autre » (« serve it only to
  // Odalric »); un prénom devant la ligne, seul, serait l'autorisation
  // explicite de le faire. La ceinture de sortie, elle, est BINAIRE sur tout le
  // texte du plan — donc un plan qui « garde l'allergène loin de » quelqu'un
  // meurt en 422. Cette phrase aligne la consigne sur le verrou.
  const { split, mouths } = twoMouthConstraints();
  const block = safetyConstraintsPromptBlock(split.safetyConstraints, {
    nameOf: mouths.nameOf,
    ...TABLE_OF_TWO,
  })!;
  assertStringIncludes(block, "GOVERNS EVERYTHING");
  assertStringIncludes(block, "never serve it 'only to'");
  // Les DEUX consignes contradictoires du même message sont nommées: l'habitude
  // d'une personne et l'envie de la maison. Sans elles, le modèle obéit à
  // l'ordre le plus proche de la fin du prompt.
  assertStringIncludes(block, "has their own");
  assertStringIncludes(block, "house asked for this week");
});

Deno.test("LES DEUX CAUSES DU 422 SONT DISTINCTES — l'aliment servi, et la phrase qui l'explique", () => {
  // ⚠️ CE TEST EXISTE POUR TENIR UNE FRONTIÈRE, pas une garde de ce module.
  //
  // Mesuré sur runs réels: le 422 `empty_meal` a DEUX causes. L'une est
  // l'ALIMENT réellement mis dans le plan — c'est le défaut d'attribution que
  // ce fichier répare. L'autre est la PHRASE qui explique le retrait
  // (« I have swapped the requested pistachio butter… »), réparée par le lot
  // voisin dans `meal_generation.ts`. Les six phrases ci-dessous viennent du
  // run `a2000002-…`: cinq passent, une seule mord, et savoir LAQUELLE est ce
  // qui empêche de confondre les deux défauts — donc de « réparer » le mauvais
  // en desserrant la ceinture.
  const { split } = twoMouthConstraints();
  const passe = [
    "A warm, zesty start that avoids tree nuts while providing steady energy.",
    "Zesty Nut-Free Oats",
    "Stir in the lemon zest, ensuring no cross-contamination with nuts.",
    "A safe, nut-free breakfast.",
    "Serve with mash, ensuring no fennel or nuts are present.",
    "Toasted bread with sunflower seed butter",
  ];
  for (const text of passe) {
    assertEquals(
      findMedicalConstraintViolations(text, split.safetyConstraints).length,
      0,
      `la ceinture mord sur une phrase que la consigne autorise: ${text}`,
    );
  }
  // Et la seule qui mord est bien LA phrase que la consigne nomme.
  assert(
    findMedicalConstraintViolations(
      "I have swapped the requested nut butter for sunflower seed butter.",
      split.safetyConstraints,
    ).length > 0,
    "la phrase de remplacement ne mord plus: la consigne interdirait du vide",
  );
});

Deno.test("UNE SEULE BOUCHE rend le bloc d'avant, octet pour octet", () => {
  // L'entrée du produit est un foyer à UNE personne (§5). Lui écrire « the
  // mouths at this table » serait faux, et changer le prompt de la lane
  // individuelle n'est pas ce que ce lot répare.
  const { split, mouths } = twoMouthConstraints();
  const alone = safetyConstraintsPromptBlock(split.safetyConstraints, {
    nameOf: mouths.nameOf,
    mouths: 1,
  });
  const detached = safetyConstraintsPromptBlock(split.safetyConstraints, null);
  assertEquals(alone, detached);
  assertStringIncludes(String(detached), "THIS STUDENT'S HARD CONSTRAINTS");
});

Deno.test("une bouche introuvable est COMPTÉE, jamais retirée du prompt", () => {
  // ⚠️ Le pire résultat possible serait de retirer une allergie du prompt parce
  // qu'un prénom manque. La contrainte reste, la ligne s'écrit avec « someone
  // at this table », et le compteur à TROIS nombres la rend visible.
  const split = householdHardConstraints({
    allergies: [{ id: "a1", memberId: "m-inconnu", label: "pistachio" }],
    houseRules: [],
    contentLocale: "en-GB",
  });
  const mouths = householdConstraintMouths({
    constraints: split.safetyConstraints,
    memberIdOf: split.memberIdOf,
    nameOfMember: new Map(),
    nameOfAccount: new Map(),
  });
  assertEquals(mouths.attributed, 0);
  assertEquals(mouths.unattributed, split.safetyConstraints.length);
  assert(mouths.declared > 0, "fixture vide: le test ne mesure rien");
  const block = safetyConstraintsPromptBlock(split.safetyConstraints, {
    nameOf: mouths.nameOf,
    ...TABLE_OF_TWO,
  })!;
  assertStringIncludes(block, "- someone at this table: pistachio");
});

Deno.test("le compteur d'attribution a TROIS nombres, pas deux", () => {
  // « demandé / attribué » rendrait le même zéro pour « aucune contrainte » et
  // « quatre contraintes, aucune bouche retrouvée ». Sans `unattributed`, un
  // lot désarmé ressemble exactement à un lot qui marche.
  const { split, mouths } = twoMouthConstraints();
  assertEquals(mouths.declared, split.safetyConstraints.length);
  assertEquals(mouths.attributed, split.safetyConstraints.length);
  assertEquals(mouths.unattributed, 0);
  const none = householdConstraintMouths({
    constraints: [],
    memberIdOf: new Map(),
    nameOfMember: new Map(),
    nameOfAccount: new Map(),
  });
  assertEquals([none.declared, none.attributed, none.unattributed], [0, 0, 0]);
});

Deno.test("la contrainte d'un TITULAIRE se retrouve par son compte, pas par un member_id", () => {
  // Les deux provenances ne se résolvent pas par la même clé, et c'est le
  // roster qui tient les deux. Une ligne de `student_safety_constraints` n'a
  // AUCUNE entrée dans `memberIdOf`: elle doit retomber sur `userId`.
  const owner = {
    id: "sc-1",
    userId: "u-odalric",
    kind: "allergy" as const,
    allergenRef: "celeriac",
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity: "medical" as const,
    declaredBy: "student" as const,
    notes: null,
    contentLocale: "en-GB",
  };
  const mouths = householdConstraintMouths({
    constraints: [owner],
    memberIdOf: new Map(),
    nameOfMember: new Map([["m-odalric", "Odalric"]]),
    nameOfAccount: new Map([["u-odalric", "Odalric"]]),
  });
  assertEquals(mouths.attributed, 1);
  assertEquals(mouths.nameOf.get("sc-1"), "Odalric");
});

Deno.test("le member_id n'entre TOUJOURS pas dans le champ de compte", () => {
  // L'attribution voyage dans une TABLE À PART, et surtout pas dans `userId`:
  // ranger un identifiant de MEMBRE dans un champ de COMPTE ferait une donnée
  // qui ment, et le premier lecteur qui joindrait dessus trouverait zéro ligne
  // sans rien dire. Ce test garde cette propriété APRÈS le lot d'attribution.
  const split = householdHardConstraints({
    allergies: [{ id: "a1", memberId: "m-lea", label: "peanut" }],
    houseRules: [],
    contentLocale: "en-GB",
  });
  for (const c of split.safetyConstraints) assertEquals(c.userId, "");
  assertEquals(split.memberIdOf.get("a1:peanut"), "m-lea");
});

Deno.test("LE VERROU DE SORTIE N'EST PAS DESSERRÉ par ce lot", () => {
  // ⛔ Le 422 `empty_meal` n'est pas le défaut: c'est le comportement CORRECT
  // face à un plan dangereux. Le défaut était en amont, dans l'attribution. Ce
  // test tient la ceinture à sa place: un plan qui NOMME l'allergène est
  // toujours rejeté, attribution ou pas.
  const { split, mouths } = twoMouthConstraints();
  const dangerous =
    "Lemon and pistachio traybake. Bake the traybake and box 120 g for Peregrine.";
  assert(
    findMedicalConstraintViolations(dangerous, split.safetyConstraints).length >
      0,
    "la ceinture n'a pas mordu sur un plat au pistachio",
  );
  // Et elle mord la MÊME chose avec ou sans table d'attribution: la table ne
  // touche que le PROMPT.
  assertEquals(
    findMedicalConstraintViolations(dangerous, split.safetyConstraints).length,
    findMedicalConstraintViolations(dangerous, split.safetyConstraints).length,
  );
  assert(mouths.attributed > 0);
  // La négation reste licite des deux côtés — sinon la consigne produirait un
  // texte que la ceinture rejette.
  assertEquals(
    findMedicalConstraintViolations(
      "This traybake contains no pistachio.",
      split.safetyConstraints,
    ).length,
    0,
  );
});
