import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  assertNoMedicalConstraintViolation,
  findMedicalConstraintViolations,
  MedicalConstraintViolationError,
  medicalConstraintTokens,
  SAFETY_CONSTRAINT_SEVERITIES,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";

import {
  type CoachFoodRule,
  type CompiledCommitment,
  compileFoodRule,
  compileProtocol,
  compileTimingRule,
} from "./protocol_compiler.ts";

/**
 * ⚠️ UN « EXCLU » DE COACH N'EST PAS UNE ALLERGIE D'ÉLÈVE.
 * ==========================================================================
 *
 * C'est le point le plus important du lot, et le seul dont l'échec serait
 * dangereux plutôt que gênant. Si les deux mécanismes partagent un chemin, l'un
 * des deux défauts arrive:
 *
 *   - l'aversion du coach pour les laitages est appliquée avec la rigueur d'un
 *     risque anaphylactique (le produit devient inutilisable, et le coach perd
 *     la main sur sa propre méthode);
 *   - ou — BIEN PIRE — une allergie est ramollie au rang de préférence, et
 *     l'élève reçoit une suggestion qui peut l'envoyer aux urgences.
 *
 * Deux tables, deux sévérités, deux verrous. Ce fichier le prouve DANS LES DEUX
 * SENS. Il ne teste pas « le compilateur marche »; il teste que les deux
 * mécanismes ne se touchent pas, y compris quand ils parlent du MÊME aliment.
 *
 * Le scénario partagé ci-dessous est délibérément le pire cas: le coach a une
 * opinion sur les fruits à coque, et l'élève y est allergique au sens médical.
 */

const PEANUT_ALLERGY: StudentSafetyConstraint = {
  id: "sc-1",
  userId: "u-1",
  kind: "allergy",
  allergenRef: "peanut",
  substanceRef: null,
  medicationClass: null,
  severity: "medical",
  declaredBy: "student",
  notes: "choc anaphylactique en 2019",
  contentLocale: "fr-FR",
};

const ctx = { coachId: "c-1", contentLocale: "fr-FR", terms: [] };

function food(
  over: Partial<CoachFoodRule> & Pick<CoachFoodRule, "stance">,
): CoachFoodRule {
  return {
    food_group_ref: "nuts_seeds",
    goal_scope: [],
    rationale: null,
    ...over,
  };
}

// ===========================================================================
// SENS 1 — l'aversion du coach n'est JAMAIS durcie en risque vital
// ===========================================================================

Deno.test("sens 1: un 'excluded' de coach ne produit aucune severite medicale", () => {
  const line = compileFoodRule(food({ stance: "excluded" }), ctx);
  const serialized = JSON.stringify(line);

  // La ligne compilee ne porte AUCUN des mots par lesquels la sante s'exprime.
  for (const severity of SAFETY_CONSTRAINT_SEVERITIES) {
    assert(
      !serialized.includes(`"severity":"${severity}"`),
      `une ligne de methode porte une severite de securite: ${severity}`,
    );
  }
  assert(!("severity" in line), "plan_commitments n'a pas de colonne severity");
  assert(!("allergenRef" in line), "une ligne de methode ne porte pas d'allergene");
  assert(!("kind" in line), "une ligne de methode n'a pas de `kind` de contrainte");
});

Deno.test("sens 1: un 'excluded' de coach n'entre PAS dans le verrou deterministe", () => {
  // Le verrou post-generation rejette tout texte visible qui nomme un token de
  // severite 'medical'. Le coach a exclu les fruits a coque; l'eleve n'a
  // declare AUCUNE allergie. Un texte qui les mentionne doit passer.
  const line = compileFoodRule(food({ stance: "excluded" }), ctx);
  const sansAllergie: StudentSafetyConstraint[] = [];

  const texte = `On evite les ${line.food_group_ref} cette semaine, comme convenu.`;
  assertEquals(findMedicalConstraintViolations(texte, sansAllergie), []);
  // Et il ne throw pas: la methode du coach ne bloque pas la generation.
  assertNoMedicalConstraintViolation(texte, sansAllergie);
});

Deno.test("sens 1: la severite maximale d'une METHODE reste tres en deca d'une allergie", () => {
  // Ce que 'excluded' durcit, ce sont trois champs de methode — et rien d'autre.
  const soft = compileFoodRule(food({ stance: "discouraged" }), ctx);
  const hard = compileFoodRule(food({ stance: "excluded" }), ctx);

  assertEquals(hard.autonomy, "strict");
  assertEquals(hard.priority, "core");
  assertEquals(hard.flex_eligible, false);

  // Le durcissement s'arrete la. En particulier il ne rend PAS la preuve
  // obligatoire et ne sort PAS la ligne du calcul d'adherence: une methode
  // s'observe, elle n'interdit pas.
  assertEquals(hard.evidence_required, soft.evidence_required);
  assertEquals(hard.evidence_required, false);
  assertEquals(hard.counts_toward_adherence, true);
});

/**
 * Retire commentaires de bloc, commentaires de ligne et litteraux de chaine.
 *
 * SANS CETTE ETAPE, CE TEST EST UN FAUX POSITIF — et c'est un piege deja paye
 * cash dans ce depot: les en-tetes de ce projet CITENT les modules voisins par
 * leur nom pour documenter ce a quoi ils ne touchent pas. L'en-tete du
 * compilateur ecrit noir sur blanc « rien ici ne lit
 * `student_safety_constraints` » — un grep naif lit cette phrase comme la
 * preuve du contraire.
 *
 * On audite donc le CODE, jamais la prose qui l'entoure.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ") // blocs
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ") // lignes (sans casser les URL http://)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""') // chaines double
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''"); // chaines simples
}

Deno.test("sens 1: aucun chemin du compilateur ne lit une contrainte de securite", () => {
  // Preuve STRUCTURELLE, pas d'intention: le module ne connait meme pas le type.
  // Si quelqu'un cable un jour les deux couches, l'import apparait dans le code
  // et ce test devient rouge — c'est tout son interet.
  const source = Deno.readTextFileSync(
    new URL("./protocol_compiler.ts", import.meta.url),
  );
  const code = codeOnly(source);

  // Le nettoyage efface aussi les chemins d'import (ce sont des chaines). On
  // relit donc les imports sur la source BRUTE, ou seul le chemin compte — un
  // chemin d'import ne peut pas etre de la prose.
  const importPaths = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  for (const p of importPaths) {
    assert(
      !p.includes("safety_constraints"),
      `le compilateur importe la couche securite: ${p}`,
    );
    assert(!p.includes("allergen"), `le compilateur importe la couche allergenes: ${p}`);
  }

  // Et aucune mention de la table dans le CODE (la prose de l'en-tete, elle, a
  // parfaitement le droit de la nommer — c'est meme son travail).
  assert(
    !code.includes("student_safety_constraints"),
    "le compilateur de protocole nomme la table de securite dans son code",
  );
  assert(
    !/\bseverity\b/.test(code),
    "le compilateur de protocole manipule un champ `severity`",
  );
});

Deno.test("meta: le nettoyeur de commentaires fait bien son travail", () => {
  // Un test dont depend un autre test doit lui-meme etre teste, sinon la garde
  // ci-dessus peut passer au vert en n'auditant plus rien du tout.
  const echantillon = [
    "/* rien ici ne lit student_safety_constraints */",
    "// et surtout pas severity",
    'const chemin = "./safety_constraints.ts";',
    "const vrai = student_safety_constraints_reel;",
  ].join("\n");
  const out = codeOnly(echantillon);
  assertEquals(out.includes("rien ici ne lit"), false, "bloc non retire");
  assertEquals(out.includes("et surtout pas"), false, "ligne non retiree");
  assertEquals(out.includes("./safety_constraints.ts"), false, "chaine non retiree");
  // Le VRAI usage, lui, survit — sinon la garde ne garderait rien.
  assertEquals(out.includes("student_safety_constraints_reel"), true);
});

// ===========================================================================
// SENS 2 — une allergie n'est JAMAIS ramollie en preference
// ===========================================================================

Deno.test("sens 2: l'allergie garde son verrou meme quand le coach ENCOURAGE l'aliment", () => {
  // Le pire cas: le coach pousse les fruits a coque, l'eleve y est allergique.
  // La methode dit « encourage », la sante dit « jamais ». La sante gagne, et
  // elle gagne DETERMINISTIQUEMENT, pas par un prompt.
  const line = compileFoodRule(food({ stance: "encouraged" }), ctx);
  assertEquals(line.polarity, "do");
  assertEquals(line.autonomy, "flexible");

  const texte = "Ajoute une poignee de peanut au petit-dejeuner.";
  const err = assertThrows(
    () => assertNoMedicalConstraintViolation(texte, [PEANUT_ALLERGY]),
    MedicalConstraintViolationError,
  ) as MedicalConstraintViolationError;
  assertEquals(err.violations.length, 1);
  assertEquals(err.violations[0].token, "peanut");
});

Deno.test("sens 2: le protocole du coach ne peut pas retirer un token du verrou", () => {
  // medicalConstraintTokens est alimente par la SEULE table des contraintes.
  // Rien de ce que le coach ecrit n'y ajoute ni n'en retire quoi que ce soit.
  const avant = medicalConstraintTokens([PEANUT_ALLERGY]);

  const protocole = compileProtocol({
    coachId: "c-1",
    contentLocale: "fr-FR",
    foodRules: [
      food({ stance: "encouraged" }),
      food({ stance: "excluded", food_group_ref: "dairy_yogurt" }),
    ],
    timingRules: [{
      template: "group_every_meal",
      food_group_ref: "nuts_seeds",
      goal_scope: [],
      rationale: null,
    }],
    terms: [{ term: "cacahuete", food_group_ref: "nuts_seeds" }],
  }, "health");
  assert(protocole.length > 0, "le protocole de reference doit etre non vide");

  const apres = medicalConstraintTokens([PEANUT_ALLERGY]);
  assertEquals(apres, avant);
  assertEquals(apres, ["peanut"]);
});

Deno.test("sens 2: un terme de coach sur le groupe allergene ne masque pas l'allergene", () => {
  // Le coach appelle les fruits a coque « cacahuete ». Ce mot devient le TITRE
  // de sa ligne — et ne change rien au token medical, qui reste 'peanut' et
  // continue d'etre rejete.
  const line = compileFoodRule(food({ stance: "encouraged" }), {
    ...ctx,
    terms: [{ term: "cacahuete", food_group_ref: "nuts_seeds" }],
  });
  assertEquals(line.title, "cacahuete");
  assertEquals(line.food_group_ref, "nuts_seeds");

  assertThrows(
    () => assertNoMedicalConstraintViolation("une poignee de peanut", [PEANUT_ALLERGY]),
    MedicalConstraintViolationError,
  );
});

Deno.test("sens 2: une contrainte 'preference' ne devient pas medicale par la methode", () => {
  // Symetrie du sens 1: de meme que la methode ne durcit pas la sante, la
  // methode ne PROMEUT pas non plus une preference declaree en risque vital.
  // Un coach 'excluded' sur le meme aliment ne fait pas passer la contrainte
  // 'preference' de l'eleve dans le verrou deterministe.
  const gout: StudentSafetyConstraint = {
    ...PEANUT_ALLERGY,
    id: "sc-2",
    severity: "preference",
    kind: "dislike",
    notes: "j'aime pas ca",
  };
  compileFoodRule(food({ stance: "excluded" }), ctx);

  assertEquals(medicalConstraintTokens([gout]), []);
  // Aucun rejet: une preference n'arrete pas une generation.
  assertNoMedicalConstraintViolation("une poignee de peanut", [gout]);
});

// ===========================================================================
// LES DEUX SENS À LA FOIS — la scène complète
// ===========================================================================

Deno.test("scene complete: le coach exclut A, l'eleve est allergique a B; chacun garde sa severite", () => {
  const line = compileFoodRule(
    food({ stance: "excluded", food_group_ref: "alcohol" }),
    ctx,
  );

  // A (alcool) est exclu par METHODE: strict, mais rien ne le rejette au titre
  // de la sante — un texte qui le nomme sort normalement.
  assertEquals(line.autonomy, "strict");
  assertNoMedicalConstraintViolation(
    "pas d'alcohol cette semaine",
    [PEANUT_ALLERGY],
  );

  // B (arachide) n'est nulle part dans le protocole du coach, et pourtant il est
  // rejete — parce que la sante ne depend pas de ce que le coach a coche.
  assertThrows(
    () => assertNoMedicalConstraintViolation("un peu de peanut", [PEANUT_ALLERGY]),
    MedicalConstraintViolationError,
  );
});

Deno.test("scene complete: les deux couches n'ont AUCUN champ en commun", () => {
  // Le test qui casserait le jour ou quelqu'un fusionnerait les deux modeles
  // « pour simplifier ». Aucune cle d'une ligne de methode n'existe sur une
  // contrainte de securite, et reciproquement.
  const line: CompiledCommitment = compileFoodRule(food({ stance: "excluded" }), ctx);
  const methodKeys = new Set(Object.keys(line));
  const safetyKeys = Object.keys(PEANUT_ALLERGY);

  const shared = safetyKeys.filter((k) => methodKeys.has(k));
  assertEquals(
    shared,
    [],
    `champs partages entre methode et securite: ${shared.join(", ")}`,
  );
});

Deno.test("scene complete: une regle temporelle non plus ne porte rien de medical", () => {
  const line = compileTimingRule({
    template: "no_group_after",
    cutoff_local: "21:00",
    food_group_ref: "nuts_seeds",
    goal_scope: [],
    rationale: "ca te reveille la nuit",
  }, ctx);
  assert(!("severity" in line));
  assertEquals(line.autonomy, "strict"); // severite de METHODE
  assertNoMedicalConstraintViolation("plus de nuts_seeds apres 21h", []);
});
