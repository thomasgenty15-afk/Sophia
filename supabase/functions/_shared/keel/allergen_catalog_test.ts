// LE CATALOGUE ET LA TABLE QUI DÉCIDE — le test de dérive.
//
// Le catalogue est ce qu'un formulaire PROPOSE; `ALLERGEN_SURFACE_FORMS` est ce
// que le verrou SAIT TENIR. Le jour où les deux divergent, le produit propose un
// allergène en promettant une protection forte qu'il n'a pas — c'est-à-dire le
// pire des deux mondes, et en silence.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ALLERGEN_CATALOG,
  hasSurfaceFormCoverage,
  normalizeAllergenRef,
} from "./allergen_catalog.ts";
import { ALLERGEN_SURFACE_FORMS } from "./allergen_surface_forms.ts";
// LA CEINTURE ELLE-MÊME, et pas une reconstitution. Le catalogue ne PROTÈGE
// rien: il propose. Ce qui protège est `findMedicalConstraintViolations`, qui
// lit la table des formes de surface. Les tests du lot du 2026-08-19
// interrogent donc la ceinture — un test qui n'aurait relu que la table aurait
// été vert le jour où la ceinture cesse de la lire.
import {
  findMedicalConstraintViolations,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";

Deno.test("tout ce que le catalogue propose est couvert par des formes de surface", () => {
  // C'est LA promesse du catalogue: choisir dans la liste = être reconnu sous
  // ses autres noms. Une entrée sans formes de surface la romprait en silence.
  for (const entry of ALLERGEN_CATALOG) {
    assert(
      hasSurfaceFormCoverage(entry.slug),
      `'${entry.slug}' est proposé mais n'a aucune forme de surface — la ` +
        `protection promise serait plus faible que ce que l'écran dit`,
    );
  }
});

Deno.test("le catalogue n'invente aucun slug hors de la table", () => {
  for (const entry of ALLERGEN_CATALOG) {
    assert(
      entry.slug in ALLERGEN_SURFACE_FORMS,
      `'${entry.slug}' n'existe pas dans ALLERGEN_SURFACE_FORMS`,
    );
  }
});

Deno.test("aucun doublon de slug, et aucun libellé vide", () => {
  const slugs = ALLERGEN_CATALOG.map((e) => e.slug);
  assertEquals(
    slugs.length,
    new Set(slugs).size,
    "deux entrées pour le même slug donneraient deux cases pour un danger",
  );
  for (const entry of ALLERGEN_CATALOG) {
    assert(entry.label.trim() !== "", `'${entry.slug}' n'a pas de libellé`);
    // R1: le slug est de la donnée ASCII, le libellé est de la prose.
    assertEquals(entry.slug, entry.slug.toLowerCase());
    assert(/^[a-z0-9_]+$/.test(entry.slug), `'${entry.slug}' n'est pas un slug`);
  }
});

Deno.test("les alias du même danger ne sont pas proposés deux fois", () => {
  // `dairy` / `milk` / `lactose` / `casein` portent les mêmes formes de surface.
  // En proposer plusieurs demanderait à l'élève un arbitrage clinique qui n'est
  // pas le sien.
  const proposed = new Set(ALLERGEN_CATALOG.map((e) => e.slug));
  for (
    const family of [
      ["dairy", "milk", "lactose", "casein"],
      ["egg", "eggs"],
      ["soy", "soya"],
      // Les familles du lot du 2026-08-19. `celeriac` est une clé PARCE QUE des
      // lignes réelles la portent en texte libre; elle ne doit pas devenir une
      // quatorzième case à côté de « Celery », qui est le même danger.
      ["celery", "celeriac"],
      // Les deux graphies du même additif. Une case « Sulphites » et une case
      // « Sulfites » demanderaient à l'élève de choisir un pays.
      ["sulphite", "sulfite"],
      // Vérifiée ici pour la première fois: elle passait déjà, et rien ne la
      // tenait. `shellfish` est proposé, ses trois alias ne le sont pas.
      ["shellfish", "crustacean", "shrimp"],
    ]
  ) {
    const shown = family.filter((slug) => proposed.has(slug));
    assertEquals(
      shown.length,
      1,
      `la famille ${family.join("/")} est proposée ${shown.length} fois: ${shown.join(", ")}`,
    );
  }
});

Deno.test("aucune clé vide: la CLÉ suffit à décider de la couverture", () => {
  // LE PONT AVEC LE MIROIR NAVIGATEUR. `frontend/src/keel/copy/allergens.ts`
  // ne peut mirroir que les CLÉS de la table (il ne charge pas ce module
  // Deno/JSR), alors que `hasSurfaceFormCoverage` exige AUSSI un tableau non
  // vide. Les deux prédicats ne coïncident que tant qu'aucune clé n'est vide —
  // sinon le front dirait « reconnu sous ses autres noms » là où le moteur dit
  // non, c'est-à-dire une promesse de protection que le verrou ne tient pas.
  for (const [slug, forms] of Object.entries(ALLERGEN_SURFACE_FORMS)) {
    assert(forms.length > 0, `'${slug}' est une clé sans aucune forme de surface`);
    assertEquals(
      hasSurfaceFormCoverage(slug),
      true,
      `'${slug}' est une clé de la table mais n'est pas rendu couvert`,
    );
  }
});

Deno.test("hasSurfaceFormCoverage dit la couverture, jamais « protégé »", () => {
  assertEquals(hasSurfaceFormCoverage("peanut"), true);
  // Un slug hors table: le matcher le trouve toujours sur son propre mot, mais
  // pas sous un autre nom. La fonction rend `false`, et l'appelant doit dire
  // « reconnu seulement sous ce mot », pas « non protégé ».
  assertEquals(hasSurfaceFormCoverage("kiwi"), false);
  assertEquals(hasSurfaceFormCoverage(""), false);
  assertEquals(hasSurfaceFormCoverage("   "), false);
  assertEquals(hasSurfaceFormCoverage("PEANUT"), true, "la casse ne décide pas");
});

Deno.test("la normalisation du formulaire est celle de la conversation", () => {
  // Divergence = deux contraintes pour un mot, et un verrou qui n'en connaît
  // qu'une. Ces cas étaient ceux de `declare_safety_constraint/intake.ts ::
  // normalizeRef`, qui portait sa propre copie identique; l'intake IMPORTE
  // maintenant cette fonction-ci, donc ces assertions pinnent la seule règle
  // qui reste côté moteur.
  // ⚠️ DEUX ATTENTES ONT CHANGÉ LE 2026-08-19, ET C'EST VOULU. L'INVARIANT de
  // ce test — une seule règle, partagée par le formulaire et la conversation —
  // est intact: c'est LA fonction commune qui a bougé, donc les deux appelants
  // continuent de s'accorder. Ce qui a changé, c'est la règle elle-même:
  //   · « Fruits de mer » se ramène désormais sur le jeton `shellfish` (table
  //     d'alias fermée) au lieu de rester un slug sans aucune couverture;
  //   · « café » garde son `e` au lieu de le perdre (les accents sont REPLIÉS,
  //     plus supprimés).
  assertEquals(normalizeAllergenRef("Fruits de mer"), "shellfish");
  assertEquals(normalizeAllergenRef("  tree-nut "), "tree_nut");
  assertEquals(normalizeAllergenRef("Peanut!"), "peanut");
  assertEquals(normalizeAllergenRef("café  au lait"), "cafe_au_lait");
  assertEquals(normalizeAllergenRef(""), null);
  assertEquals(normalizeAllergenRef("   "), null);
  assertEquals(normalizeAllergenRef("!!!"), null);
  assertEquals(normalizeAllergenRef(null), null);
  assertEquals(normalizeAllergenRef(undefined), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// LE LOT DU 2026-08-19 — LES QUATRE MAJEURS RÉGLEMENTAIRES QUI MANQUAIENT
// ═══════════════════════════════════════════════════════════════════════════
//
// Ces trois tests ne vérifient pas le catalogue « en général »: ils rejouent
// LE DÉFAUT MESURÉ. Une allergie hors catalogue est du texte libre apparié
// littéralement — la contrainte disait `celeriac`, le plan écrivait « celery »,
// et la ceinture ne bronchait pas. C'est la ceinture qu'on interroge ici, pas
// la table.

Deno.test("les quatre majeurs réglementaires qui manquaient sont catalogués", () => {
  const proposed = new Set(ALLERGEN_CATALOG.map((e) => e.slug));
  for (const slug of ["celery", "mustard", "sulphite", "lupin"]) {
    assert(
      proposed.has(slug),
      `'${slug}' est un des quatorze allergènes majeurs UE/UK et il n'est pas ` +
        `proposé: une allergie qui l'est ne serait reconnue que sous le mot ` +
        `exact que l'élève a tapé`,
    );
  }
});

Deno.test("une ligne DÉJÀ EN BASE en texte libre gagne la couverture — le run mesuré", () => {
  // Trois contraintes réelles de la base locale portent `celeriac`, saisi en
  // texte libre bien avant ce lot. Ajouter `celery` au catalogue ne les
  // toucherait PAS: `surfaceFormsFor` lit par clé EXACTE. C'est la clé
  // `celeriac` qui les répare, et c'est elle que ce test tient.
  const celeriac: StudentSafetyConstraint = {
    id: "c_celeriac",
    userId: "u1",
    kind: "allergy",
    allergenRef: "celeriac",
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity: "medical",
    declaredBy: "student",
    notes: null,
    contentLocale: "en-GB",
  };

  // LA PHRASE DU RUN RÉEL: le plan nomme l'aliment sous son AUTRE nom.
  const bites = findMedicalConstraintViolations(
    "Celery and walnut salad with a lemon dressing.",
    [celeriac],
  );
  assert(
    bites.length > 0,
    "le plan écrit « Celery », la contrainte dit « celeriac » — la ceinture " +
      "doit mordre; c'est le défaut mesuré du 2026-08-19",
  );

  // ET LA NÉGATION RESTE TOLÉRÉE, par le même moteur et sans règle nouvelle.
  // Sans ça, le plan d'un allergique — littéralement fait d'évictions — serait
  // rejeté à chaque tour.
  assertEquals(
    findMedicalConstraintViolations(
      "Salad without celery, dressed with lemon.",
      [celeriac],
    ).length,
    0,
    "« without celery » retire l'aliment; le refuser viderait le plan de " +
      "l'élève qu'il protège",
  );
});

Deno.test("les nouveaux jetons mordent sous leurs autres noms, jamais sur un homonyme", () => {
  const of = (ref: string): StudentSafetyConstraint => ({
    id: `c_${ref}`,
    userId: "u1",
    kind: "allergy",
    allergenRef: ref,
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity: "medical",
    declaredBy: "student",
    notes: null,
    contentLocale: "en-GB",
  });

  // CE QUE LE CATALOGUE PROMET: reconnu SOUS SES AUTRES NOMS.
  const covered: ReadonlyArray<[string, string]> = [
    ["celery", "Sweat the mirepoix for ten minutes."],
    ["celery", "Remoulade de celeri-rave en entree."],
    ["mustard", "Whisk the dijon into the vinaigrette."],
    ["mustard", "Une remoulade maison pour lier."],
    ["sulphite", "Contains sulfur dioxide."],
    ["sulphite", "Additif E220 dans les abricots secs."],
    ["sulfite", "Declared sulphites on the label."],
    ["lupin", "Lupine flour in the gluten-free loaf."],
    ["lupin", "Grilled lupini beans as a starter."],
  ];
  for (const [ref, prose] of covered) {
    assert(
      findMedicalConstraintViolations(prose, [of(ref)]).length > 0,
      `'${ref}' devrait mordre sur « ${prose} »`,
    );
  }

  // ⛔ ET CE QU'IL NE FAIT PAS. Le motif de `tokenPattern` ancre sur des
  // frontières de mot: aucun de ces jetons ne doit mordre à l'intérieur d'un
  // mot qui les contient. C'est la cicatrice « laitue ≠ lait », prise à
  // l'avance sur les quatre jetons neufs.
  const innocent: ReadonlyArray<[string, string]> = [
    ["celery", "Celeriac is out, but the celebration cake stays."],
    ["mustard", "He mustered the rest of the vegetables."],
    ["lupin", "A bunch of lupins in the garden is not a food."],
  ];
  for (const [ref, prose] of innocent) {
    const hits = findMedicalConstraintViolations(prose, [of(ref)]);
    // `celery`/`lupin` mordent bien sur leur VRAI nom dans ces phrases; ce
    // qu'on interdit est la morsure sur le mot ÉTRANGER. On vérifie donc
    // qu'aucune correspondance ne porte sur lui.
    for (const hit of hits) {
      assert(
        !/celebration|mustered/i.test(hit.matchedText),
        `'${ref}' a mordu dans un mot étranger: « ${hit.matchedText} »`,
      );
    }
  }
});

// ===========================================================================
// LES ALLERGIES DÉCLARÉES EN FRANÇAIS — le produit est en `fr-FR` par défaut
//
// Deux défauts mesurés le 2026-08-19, l'un derrière l'autre:
//   ① `normalizeAllergenRef` SUPPRIMAIT le caractère accentué au lieu de le
//      replier — « œuf » → `uf`, « blé » → `bl`, « céleri » → `cleri`.
//   ② replier ne suffisait pas: `oeuf` est un slug propre que le catalogue ne
//      connaît pas, donc **0 forme de surface** — la même absence de
//      protection, avec un identifiant plus joli.
//
// La contre-épreuve compte ce qui protège vraiment: le NOMBRE DE FORMES DE
// SURFACE. Un test qui se contenterait de comparer des slugs serait resté vert
// à l'étape ②, c'est-à-dire sur un allergène toujours sans couverture.
// ===========================================================================
Deno.test("un allergène majeur déclaré en français est COUVERT", () => {
  const attendu: ReadonlyArray<readonly [string, string]> = [
    ["œuf", "egg"],
    ["blé", "wheat"],
    ["moutarde", "mustard"],
    ["céleri", "celery"],
    ["fruits de mer", "shellfish"],
    ["arachide", "peanut"],
    ["crustacés", "shellfish"],
    ["soja", "soy"],
  ];
  for (const [saisi, jeton] of attendu) {
    const slug = normalizeAllergenRef(saisi);
    assertEquals(slug, jeton, `« ${saisi} » doit se ramener sur ${jeton}`);
    // CE QUI COMPTE: la protection, pas le nom.
    assertEquals(
      hasSurfaceFormCoverage(String(slug)),
      true,
      `« ${saisi} » doit avoir une couverture de formes de surface`,
    );
  }
});

Deno.test("⛔ la table d'alias ne VOLE aucune couverture à un nom inconnu", () => {
  // Un nom hors table reste lui-même: il ne gagne rien, il ne détourne rien.
  for (const inconnu of ["okra", "beetroot", "aubergine", "fructose"]) {
    assertEquals(normalizeAllergenRef(inconnu), inconnu);
  }
  // Et l'ASCII déjà canonique ne bouge pas d'un caractère.
  for (const canon of ["peanut", "tree_nut", "celeriac", "sesame"]) {
    assertEquals(normalizeAllergenRef(canon), canon);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LE LOT `S1b` DU 2026-08-22 — `fruits_de_mer` : L'INTAKE ET LA SORTIE
// ═══════════════════════════════════════════════════════════════════════════
//
// Le test juste au-dessus (« un allergène majeur déclaré en français est
// COUVERT ») était VERT sur « fruits de mer » AVANT ce lot, et il l'était pour
// une raison qui ne protégeait personne: il interroge `normalizeAllergenRef`,
// c'est-à-dire la règle des ÉCRITURES FUTURES. Les deux lignes réelles de la
// base sont du 2026-08-04, écrites AVANT l'alias, et portent le slug
// `fruits_de_mer` en toutes lettres.
//
// Ces trois tests-ci interrogent donc la CEINTURE, sur le slug tel qu'il est
// EN BASE, et dans les DEUX LANGUES — parce que la mesure a montré que la
// ceinture n'était morte que dans une seule.

const CONTRAINTE_BASE = {
  userId: "u1",
  kind: "allergy",
  substanceRef: null,
  medicationClass: null,
  conditionRef: null,
  dietRef: null,
  severity: "medical",
  declaredBy: "student",
  notes: null,
  contentLocale: "en-GB",
} as const;

Deno.test("S1b — la ligne `fruits_de_mer` DÉJÀ EN BASE mord enfin en ANGLAIS", () => {
  // ⛔ LA MESURE DU 2026-08-22, avant la première ligne de correctif:
  //     « des fruits de mer ce soir » -> 1 morsure
  //     « seafood platter »           -> 0
  //     « a shrimp and crab platter » -> 0
  // La ceinture cherchait une chaîne FRANÇAISE dans un texte ANGLAIS. Elle
  // n'était donc pas morte tout court: elle était morte dans la langue par
  // défaut de la génération, et elle ne le disait pas.
  const enBase: StudentSafetyConstraint = {
    ...CONTRAINTE_BASE,
    id: "c_fdm",
    allergenRef: "fruits_de_mer",
  };
  for (
    const phrase of [
      "Seafood platter to share.",
      "A shrimp and crab platter.",
      "Grilled shellfish with lemon.",
    ]
  ) {
    assert(
      findMedicalConstraintViolations(phrase, [enBase]).length > 0,
      `« ${phrase} » doit mordre sur une contrainte 'fruits_de_mer'`,
    );
  }
  // ET LA MOITIÉ QUI MARCHAIT DÉJÀ NE RÉGRESSE PAS. Sans cette assertion,
  // remplacer les formes au lieu de les ajouter passerait inaperçu.
  assert(
    findMedicalConstraintViolations("Des fruits de mer ce soir.", [enBase])
      .length > 0,
    "la morsure française mesurée AVANT le lot doit survivre au lot",
  );
});

Deno.test("S1b — le jeton du catalogue `shellfish` couvre le mot de la CATÉGORIE", () => {
  // L'autre moitié du défaut, et elle vaut pour TOUTE ligne `shellfish` —
  // 4 actives en base, écrites par le chemin nominal. La table portait neuf
  // ANIMAUX et aucun des deux mots collectifs sous lesquels un menu s'écrit.
  const shellfish: StudentSafetyConstraint = {
    ...CONTRAINTE_BASE,
    id: "c_shellfish",
    allergenRef: "shellfish",
  };
  for (const phrase of ["Seafood risotto.", "Une assiette de fruits de mer."]) {
    assert(
      findMedicalConstraintViolations(phrase, [shellfish]).length > 0,
      `« ${phrase} » doit mordre sur une contrainte 'shellfish'`,
    );
  }
});

Deno.test("S1b — LE CAS QUI PASSE: la ceinture ne mord pas sur un plat sans danger", () => {
  // ⛔ SANS CE TEST, une ceinture cassée-fermée (« tout mord ») serait verte sur
  // les deux tests du dessus et ressemblerait trait pour trait à une ceinture
  // qui marche. C'est la cicatrice « une garde a besoin d'un cas qui passe ».
  const enBase: StudentSafetyConstraint = {
    ...CONTRAINTE_BASE,
    id: "c_fdm",
    allergenRef: "fruits_de_mer",
  };
  for (
    const phrase of [
      "Roast chicken with green beans.",
      "Un poulet roti et des haricots verts.",
      // « mer » seul ne suffit pas: la forme est « fruits de mer », entière.
      "Une salade de fruits.",
    ]
  ) {
    assertEquals(
      findMedicalConstraintViolations(phrase, [enBase]).length,
      0,
      `« ${phrase} » ne doit PAS mordre`,
    );
  }
});
