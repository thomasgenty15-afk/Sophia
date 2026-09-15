/**
 * ⛔ S2 — L'ARME DE « LA CEINTURE DE SORTIE COUVRE `strict` ».
 *
 * ── CE QUE CE FICHIER PROUVE, ET POURQUOI IL EN FAUT TROIS + UN ───────────
 * Ce dépôt a livré, dans la seule vague 1, quatre gardes qui seraient passées
 * VERTES sur leur propre cas. Une garde qui mord n'est donc pas une preuve;
 * une garde qui mord ET une qui passe ET une identité octet pour octet, avec
 * une mutation qui rougit, en est une.
 *
 *   ① UN `strict` QUI MORD          — le comportement neuf, sur les SIX refs
 *                                     réellement en base le 2026-08-22.
 *   ② UN `preference` QUI RESTE     — la frontière. Sans elle, une ceinture
 *     DEHORS                          qui mord sur TOUT est indiscernable
 *                                     d'une ceinture qui marche.
 *   ③ UN PLAN SANS CONTRAINTE       — l'identité est vérifiée sur les OCTETS,
 *     SORT BYTE-IDENTIQUE             pas sur `===`: la ceinture peut rendre
 *                                     un texte « égal » et pourtant recomposé.
 *   ④ LE SECOND REPLI               — la contrainte d'implémentation du lot
 *                                     (plan §⑨ n° 4). Sans lui, `S2` sert
 *                                     « pose la question à un médecin » à un
 *                                     intolérant au lactose, ce qui est faux
 *                                     100 % des fois où ça sort.
 *
 * ⚠️ CHAQUE BALAYAGE PORTE UNE ASSERTION DE CARDINALITÉ. Une boucle sur zéro
 * cas est verte sans rien prouver — cicatrice `V0-B-bis`, payée deux fois.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  BELT_BLOCKING_SEVERITIES,
  findMedicalConstraintViolations,
  isBeltBlockingSeverity,
  medicalConstraintTokens,
  SAFETY_CONSTRAINT_SEVERITIES,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";
import {
  applyKeelOutputLocks,
  MEDICAL_BLOCK_FALLBACK_EN,
  STRICT_BLOCK_FALLBACK_EN,
} from "../../sophia-brain/skills/_shared/keel_output_locks.ts";

function constraint(
  patch: Partial<StudentSafetyConstraint> = {},
): StudentSafetyConstraint {
  return {
    id: "c1",
    userId: "u1",
    kind: "intolerance",
    allergenRef: null,
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity: "strict",
    declaredBy: "student",
    notes: null,
    contentLocale: "en",
    ...patch,
  };
}

/**
 * LES SIX, LUES EN BASE LE 2026-08-22 À 03:49 CEST.
 *
 *   select severity, kind, allergen_ref, substance_ref, count(*)
 *   from student_safety_constraints
 *   where retracted_at is null and severity = 'strict';
 *
 * → 14 lignes, dont **8** `kind='diet'` sans jeton (vegan 2, vegetarian 3,
 *   pescatarian 3) et **6** porteuses d'un jeton, listées ici. Le seuil du lot
 *   se lit sur ces 6, pas sur 14 — `safetyConstraintTokens` ne rend jamais
 *   `dietRef`, et c'est voulu (cicatrice `diabetes`).
 *
 * ⚠️ Elles sont écrites en dur PARCE QU'ELLES VIENNENT DE LA BASE, pas d'une
 * constante du code: si demain le produit cesse de couvrir l'une d'elles, ce
 * fichier rougit. Le compteur sur la population VIVANTE, lui, est la mesure
 * APRÈS de la fiche — un test ne doit pas dépendre d'une base.
 */
const STRICT_REFS_EN_BASE = [
  { ref: "dairy", champ: "allergenRef" },
  { ref: "lactose", champ: "substanceRef" },
  { ref: "gluten", champ: "substanceRef" },
  { ref: "fructose", champ: "allergenRef" },
  { ref: "fruits_de_mer", champ: "allergenRef" },
  { ref: "mustard", champ: "allergenRef" },
] as const;

function withRef(
  ref: string,
  champ: "allergenRef" | "substanceRef",
  severity: StudentSafetyConstraint["severity"],
): StudentSafetyConstraint {
  return constraint({ id: `c-${ref}`, severity, [champ]: ref });
}

/** Le texte-sonde est construit À PARTIR du ref, jamais d'un littéral gelé. */
function sonde(ref: string): string {
  return `Dinner tonight: a warm bowl with ${ref}. Good pick.`;
}

const DOCTRINE = {
  forbidden: [
    { token: "grazing", surfaceForms: [], reason: null, instead: null },
  ],
  foods: { discouraged: [] },
} as unknown as Parameters<typeof applyKeelOutputLocks>[0]["doctrine"];

// ═══════════════════════════════════════════════════════════════════════════
// ① LE CAS QUI MORD
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ ① les SIX `strict` de la base MORDENT, et la morsure porte `strict`", () => {
  let vus = 0;
  for (const { ref, champ } of STRICT_REFS_EN_BASE) {
    const c = withRef(ref, champ, "strict");
    const hits = findMedicalConstraintViolations(sonde(ref), [c]);
    assert(hits.length > 0, `${ref}: la ceinture reste muette`);
    // ⛔ L'ASSERTION EST SUR LA SÉVÉRITÉ PORTÉE, pas sur « il y a une
    // morsure ». C'est cette valeur qui choisit le texte que l'élève lit; un
    // test qui ne la regarde pas laisserait passer un repli médical servi pour
    // une intolérance, et le laisserait passer en vert.
    assertEquals(hits[0].severity, "strict", ref);
    assertEquals(hits[0].constraintId, `c-${ref}`, ref);
    vus += 1;
  }
  assertEquals(vus, 6, "cardinalité: le balayage n'a pas vu les six refs");
});

Deno.test("⛔ ① la ceinture ENTIÈRE bloque — le goulot que les trois points d'entrée partagent", () => {
  // Les trois appelants de production (`meal_generation`, `week_plan_generation`,
  // `router/run.ts`) passent tous par `applyKeelOutputLocks`. On mesure donc le
  // verrou, pas seulement le matcher qui l'alimente.
  //
  // ⚠️ CE TEST N'EXERCE PAS LES TROIS LANES, il exerce leur goulot commun. La
  // preuve qu'elles y passent VRAIMENT est le test de câblage juste en dessous:
  // une ceinture parfaite que personne n'appelle est le mode d'échec que ce
  // dépôt a déjà payé (`escalateMinorStudent`, 0 appelant, `S3`).
  let vus = 0;
  for (const { ref, champ } of STRICT_REFS_EN_BASE) {
    const out = applyKeelOutputLocks({
      text: sonde(ref),
      isKeelStudent: true,
      safetyConstraints: [withRef(ref, champ, "strict")],
      doctrine: DOCTRINE,
    });
    assertEquals(out.reason, "blocked_strict_constraint", ref);
    assertEquals(out.text, STRICT_BLOCK_FALLBACK_EN, ref);
    assert(out.tokens.includes(ref), `${ref}: le jeton n'est pas remonté`);
    vus += 1;
  }
  assertEquals(vus, 6, "cardinalité: le balayage n'a pas vu les six refs");
});

/**
 * LE CÂBLAGE — les TROIS lanes appellent le goulot, et lui passent la table.
 *
 * Sans ce test, `S2` livrerait une ceinture élargie dont on n'aurait mesuré
 * l'effet que sur une fonction pure. Le dépôt a la cicatrice exacte: une porte
 * corrigée dont l'appelant historique avait été retiré (`escalateMinorStudent`,
 * 0 appelant, réparé par `S3` le même jour).
 *
 * ⚠️ COMMENTAIRES RETIRÉS avant de chercher. Un grep naïf compte les
 * commentaires comme des appels — c'est écrit dans les règles du dépôt, et
 * `S3` l'a repayé (les 2 « appelants » survivants étaient deux commentaires).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

Deno.test("⛔ ① le CÂBLAGE: les trois lanes appellent le verrou, table en main", async () => {
  const lanes = [
    { fichier: "./meal_generation.ts", quoi: "la lane REPAS (solo + foyer)" },
    { fichier: "./week_plan_generation.ts", quoi: "la lane SEMAINE" },
    {
      fichier: "../../sophia-brain/router/run.ts",
      quoi: "la CONVERSATION (finalVisibleText)",
    },
  ];
  let vus = 0;
  for (const { fichier, quoi } of lanes) {
    const src = stripComments(
      await Deno.readTextFile(new URL(fichier, import.meta.url)),
    );
    const at = src.indexOf("applyKeelOutputLocks({");
    assert(at > 0, `${quoi}: n'appelle plus le verrou (${fichier})`);
    // La table doit être PASSÉE. Un appel sans elle laisse la moitié médicale
    // de la ceinture sans rien à quoi se confronter, et le verrou se déclare
    // `disarmed_constraints_unreadable` en silence.
    const appel = src.slice(at, at + 400);
    assert(
      appel.includes("safetyConstraints"),
      `${quoi}: appelle le verrou SANS lui passer les contraintes`,
    );
    vus += 1;
  }
  assertEquals(vus, 3, "cardinalité: les trois lanes n'ont pas été vues");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE CAS-FRONTIÈRE — CE QUI RESTE DEHORS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ ② `preference` reste DEHORS — les mêmes six refs, l'autre cran", () => {
  let vus = 0;
  for (const { ref, champ } of STRICT_REFS_EN_BASE) {
    const texte = sonde(ref);
    const c = withRef(ref, champ, "preference");
    assertEquals(
      findMedicalConstraintViolations(texte, [c]).length,
      0,
      `${ref}: une préférence a armé la ceinture`,
    );
    const out = applyKeelOutputLocks({
      text: texte,
      isKeelStudent: true,
      safetyConstraints: [c],
      doctrine: DOCTRINE,
    });
    assertEquals(out.reason, "clean", ref);
    assertEquals(out.text, texte, ref);
    vus += 1;
  }
  assertEquals(vus, 6, "cardinalité: le balayage n'a pas vu les six refs");
  // La base en porte 9 actives — `aubergine`, `beetroot`, `coriander`, `okra`,
  // `olive`, et un `fructose` déclaré en préférence par quelqu'un d'autre que
  // celui qui l'a déclaré `strict`. Le MÊME mot, deux crans, deux verdicts:
  // c'est la preuve que la ceinture lit la SÉVÉRITÉ et pas le jeton.
  const memeMot = "fructose";
  assert(
    findMedicalConstraintViolations(sonde(memeMot), [
      withRef(memeMot, "allergenRef", "strict"),
    ]).length > 0,
  );
  assertEquals(
    findMedicalConstraintViolations(sonde(memeMot), [
      withRef(memeMot, "allergenRef", "preference"),
    ]).length,
    0,
  );
});

Deno.test("⛔ ② les huit `diet` restent dehors — `dietRef` n'atteint jamais la ceinture", () => {
  // vegan 2, vegetarian 3, pescatarian 3 = les 8 autres `strict` de la base.
  // Armer sur le NOM d'un régime ferait rejeter la réponse qui l'explique;
  // c'est la cicatrice `diabetes`, et elle vaut aussi pour les régimes.
  let vus = 0;
  for (const regime of ["vegan", "vegetarian", "pescatarian"]) {
    const c = constraint({
      id: `c-${regime}`,
      kind: "diet",
      severity: "strict",
      dietRef: regime,
    });
    assertEquals(medicalConstraintTokens([c]), [], regime);
    assertEquals(
      findMedicalConstraintViolations(
        `A ${regime} bowl, and here is why ${regime} works for you.`,
        [c],
      ).length,
      0,
      regime,
    );
    vus += 1;
  }
  assertEquals(vus, 3, "cardinalité: les trois régimes n'ont pas été vus");
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ UN PLAN SANS CONTRAINTE SORT BYTE-IDENTIQUE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ ③ un plan SANS contrainte sort BYTE-IDENTIQUE", () => {
  const PLAN = [
    "Monday. Steamed rice, roasted carrots, a soft-boiled egg.",
    "Tuesday. Lentil soup with thyme.",
    "Wednesday. Baked potato, green salad.",
  ].join("\n");
  const out = applyKeelOutputLocks({
    text: PLAN,
    isKeelStudent: true,
    safetyConstraints: [],
    // La doctrine est là POUR QUE LA CEINTURE SOIT ARMÉE. Sans elle, le verrou
    // sort par `disarmed_no_constraints` et l'identité ne prouverait rien:
    // c'est le mode d'échec « ceinture armée sur coffre vide ».
    doctrine: DOCTRINE,
  });
  assertEquals(out.reason, "clean");
  const enc = new TextEncoder();
  const avant = enc.encode(PLAN);
  const apres = enc.encode(out.text);
  assertEquals(apres.length, avant.length, "la longueur en OCTETS a changé");
  for (let i = 0; i < avant.length; i += 1) {
    assertEquals(apres[i], avant[i], `octet ${i}`);
  }
  assert(avant.length > 0, "cardinalité: le plan témoin est vide");
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE SECOND REPLI
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ ④ un `strict` ne reçoit PAS « pose la question à un médecin »", () => {
  const out = applyKeelOutputLocks({
    text: "A pot of yogurt with the lactose still in it is a fine snack.",
    isKeelStudent: true,
    safetyConstraints: [withRef("lactose", "substanceRef", "strict")],
    doctrine: DOCTRINE,
  });
  assertEquals(out.reason, "blocked_strict_constraint");
  assertEquals(out.text, STRICT_BLOCK_FALLBACK_EN);
  assert(
    out.text !== MEDICAL_BLOCK_FALLBACK_EN,
    "le repli médical est servi pour une intolérance — le défaut que ce lot ferme",
  );
  // Ce qu'il ne doit PAS contenir, nommément: le renvoi au médecin est le mot
  // faux, et « coach » désignerait une porte qui n'existe pas (aucun canal 1:1).
  for (const interdit of ["doctor", "medical", "coach"]) {
    assert(
      !out.text.toLowerCase().includes(interdit),
      `le second repli dit « ${interdit} »`,
    );
  }
});

Deno.test("⛔ ④ un `medical` garde son texte, et il gagne quand les deux mordent", () => {
  const medicalSeul = applyKeelOutputLocks({
    text: "Add a spoon of peanut butter to your oats.",
    isKeelStudent: true,
    safetyConstraints: [withRef("peanut", "allergenRef", "medical")],
    doctrine: DOCTRINE,
  });
  assertEquals(medicalSeul.reason, "blocked_medical_constraint");
  assertEquals(medicalSeul.text, MEDICAL_BLOCK_FALLBACK_EN);

  // ⛔ LES DEUX À LA FOIS: le plus PROTECTEUR gagne, jamais le plus doux.
  const lesDeux = applyKeelOutputLocks({
    text: "Add a spoon of peanut butter, and a pot of yogurt with lactose.",
    isKeelStudent: true,
    safetyConstraints: [
      withRef("lactose", "substanceRef", "strict"),
      withRef("peanut", "allergenRef", "medical"),
    ],
    doctrine: DOCTRINE,
  });
  assertEquals(lesDeux.reason, "blocked_medical_constraint");
  assertEquals(lesDeux.text, MEDICAL_BLOCK_FALLBACK_EN);
  // ⚠️ `tokens` remonte la FORME DE SURFACE qui a matché, pas seulement le
  // slug — ici `butter` et `yogurt` en plus des deux refs. On assère donc la
  // PRÉSENCE des deux crans, jamais l'égalité d'une liste dont le contenu
  // exact appartient à `allergen_surface_forms.ts`.
  assert(lesDeux.tokens.includes("peanut"), "le jeton medical n'est pas remonté");
  assert(lesDeux.tokens.includes("lactose"), "le jeton strict n'est pas remonté");
});

Deno.test("⛔ ④ les deux replis sont distincts, et aucun ne nomme un jeton", () => {
  // ⚠️ ÉLARGIS À `string` À DESSEIN. Comparés tels quels, `deno check` REFUSE
  // le test (`TS2367: … have no overlap`) — c'est-à-dire que le compilateur
  // PROUVE déjà que les deux littéraux diffèrent, ce qui est plus fort que
  // l'assertion. On garde quand même l'épreuve au runtime: le jour où
  // quelqu'un fait pointer l'un sur l'autre par une variable, le type
  // n'attrape plus rien.
  const medical: string = MEDICAL_BLOCK_FALLBACK_EN;
  const strict: string = STRICT_BLOCK_FALLBACK_EN;
  assert(medical !== strict, "il n'y a toujours qu'un seul texte de repli");
  // Un repli qui mord lui-même serait un cul-de-sac: le verrou remplacerait
  // son propre remplacement au tour suivant.
  const toutes = STRICT_REFS_EN_BASE.map(({ ref, champ }) =>
    withRef(ref, champ, "strict")
  ).concat([
    withRef("peanut", "allergenRef", "medical"),
    withRef("sesame", "allergenRef", "medical"),
    withRef("shellfish", "allergenRef", "medical"),
  ]);
  assertEquals(toutes.length, 9, "cardinalité: la population témoin a changé");
  for (const repli of [MEDICAL_BLOCK_FALLBACK_EN, STRICT_BLOCK_FALLBACK_EN]) {
    assertEquals(findMedicalConstraintViolations(repli, toutes).length, 0, repli);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX SITES NE DIVERGENT PLUS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ les DEUX sites du fichier lisent la MÊME liste de sévérités", () => {
  // `medicalConstraintTokens` (l. 541 avant le lot) et
  // `findMedicalConstraintViolations` (l. 591) portaient chacun leur propre
  // `severity !== "medical"`. « Corriger l'une et laisser l'autre » est
  // exactement ce que la fiche appelle « deux copies divergent »: le second
  // site n'a AUCUN appelant de production, mais trois fichiers de test le
  // lisent comme « ce qui arme la ceinture ».
  let vus = 0;
  for (const severity of SAFETY_CONSTRAINT_SEVERITIES) {
    const c = withRef("peanut", "allergenRef", severity);
    const parLaListe = medicalConstraintTokens([c]).length > 0;
    const parLaGarde =
      findMedicalConstraintViolations("a spoon of peanut butter", [c]).length > 0;
    assertEquals(
      parLaListe,
      parLaGarde,
      `${severity}: la liste de diagnostic et la garde ne disent pas la même chose`,
    );
    assertEquals(parLaGarde, isBeltBlockingSeverity(severity), severity);
    vus += 1;
  }
  assertEquals(vus, 3, "cardinalité: les trois sévérités n'ont pas été vues");
  assertEquals([...BELT_BLOCKING_SEVERITIES].sort(), ["medical", "strict"]);
  assertEquals(isBeltBlockingSeverity("preference"), false);
  // Une valeur hors union arrive de la base par un `as`: elle ne doit pas
  // armer. Ne pas confondre « le compilateur l'interdit » et « le runtime le
  // refuse » — c'est la cicatrice `as` sur un type étranger.
  assertEquals(isBeltBlockingSeverity("critical"), false);
});
