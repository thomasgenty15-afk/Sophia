/**
 * LE MAGASIN DES BROUILLONS EST-IL BRANCHÉ ? — 2026-09-08
 *
 * ⛔ CE FICHIER EXISTE PARCE QUE LE MAGASIN A VÉCU UN JOUR SANS APPELANT.
 * `draft_store.ts` et `draft_adopt.ts` ont été livrés le 2026-09-07 avec 1 175
 * lignes de tests unitaires verts, une migration appliquée, et **aucun
 * écrivain**: aucun `index.ts` de générateur ne le nommait. Des tests
 * unitaires prouvent qu'un module fait ce qu'il dit;
 * ils ne prouvent jamais que quelqu'un l'appelle.
 *
 * Les tests unitaires du magasin vivent dans `draft_store_test.ts`. Celui-ci ne
 * teste QUE la jointure avec la lane du foyer.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

const SRC = Deno.readTextFileSync(
  new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
);

/**
 * ⟳ 2026-09-08 — LA LANE INDIVIDUELLE, ET POURQUOI ELLE EST DANS CE FICHIER.
 *
 * Le magasin a d'abord été câblé sur la lane du foyer SEULE. La vérification au
 * navigateur a montré qu'un compte **seul dans son foyer** n'y passe jamais:
 * `chooseGenerator` (`frontend/src/keel/api/planRouting.ts`) finit par
 * `otherMouths >= 1 ? "household" : "personal"`. Une bouche ⇒ l'écran appelle
 * `generate-meal-v1`, et l'aperçu n'avait alors pas d'identifiant — donc pas de
 * chiffre. La moitié de la population aurait vu une fonctionnalité que l'autre
 * moitié n'a pas.
 *
 * ⛔ LES DEUX LANES SONT TESTÉES PAR LES MÊMES ASSERTIONS, dans une boucle. Deux
 * blocs recopiés divergeraient au premier ajustement, et c'est celui qu'on
 * regarde le moins qui laisserait passer le trou.
 */
// ⟳ 2026-09-11 · LOT 7 — LA LANE INDIVIDUELLE A ÉTÉ SUPPRIMÉE. Les cas qui
// n'éprouvaient qu'elle partent avec elle; la boucle reste sur un élément,
// exprès: la propriété est « sur CHAQUE lane », pas « sur celle-ci ».
const LANES: readonly { nom: string; src: string; lane: string; kind: string }[] = [
  { nom: "foyer", src: SRC, lane: '"household_meal"', kind: '"household"' },
];

Deno.test("BROUILLON ① — la ligne s'ouvre AVANT l'appel modèle", () => {
  // ⛔ L'INDEX UNIQUE `student_meal_drafts_one_inflight_per_user` ARBITRE DANS
  // L'INSERTION, et c'est ce qui rend le plafond « une composition en vol par
  // personne » réel. Ouvrir après le modèle le rendrait décoratif: deux taps à
  // 80 ms d'écart lanceraient deux appels facturés, dont un dont personne
  // n'attend plus la réponse.
  const ouverture = SRC.indexOf("const opened = await openDraft(admin, {");
  const modele = SRC.indexOf("result = await generateWithGemini(");
  assert(ouverture > 0, "l'ouverture existe");
  assert(modele > 0, "l'appel modèle existe");
  assert(ouverture < modele, "et l'ouverture le précède");
  // Et la ligne passe en `running` avant, pas après.
  const running = SRC.indexOf("await markRunning(admin, draftId);");
  assert(running > ouverture && running < modele, "`markRunning` est entre les deux");
});

Deno.test("BROUILLON ② — un conflit REFUSE, il ne double pas l'appel modèle", () => {
  const i = SRC.indexOf('if ("conflict" in opened)');
  assert(i > 0, "le conflit est lu");
  assert(SRC.includes('error: "draft_in_flight"'), "et il refuse avec son vocabulaire");
  assert(SRC.includes("}, { status: 409 });"), "en 409");
  // ⛔ AVANT L'APPEL MODÈLE. Un refus rendu après aurait déjà payé l'appel.
  const refus = SRC.indexOf('error: "draft_in_flight"');
  assert(refus < SRC.indexOf("result = await generateWithGemini("));
});

Deno.test("⛔ BROUILLON ③ — ce qu'on RANGE est ce qu'on REND, et le payload est l'EXACT", () => {
  // ⛔ TOUTE LA PROPRIÉTÉ DU MAGASIN TIENT ICI: « adopter, c'est rejouer le plan
  // relu ». Mesuré avant lui: aperçu = 6 boîtes, ligne écrite = 0 boîte, HTTP
  // 200 — personne n'avait menti, c'étaient deux plans. Ranger une forme
  // VOISINE du corps rendu recréerait exactement ce défaut, en silence.
  assert(SRC.includes("const draftBody = {"), "le corps rendu est nommé");
  assert(SRC.includes("return jsonResponse(req, draftBody);"), "et c'est LUI qu'on rend");
  const i = SRC.indexOf("const stored = await completeDraft(admin, draftId, {");
  assert(i > 0, "la ligne est complétée");
  const bloc = SRC.slice(i, i + 400);
  assert(bloc.includes("response: draftBody,"), "on range le corps rendu, pas une copie");
  // ⛔ `writePayload` EST LE `p_payload` DE `write_student_meal_plan`, la même
  // variable que l'écriture — pas une reconstruction.
  assert(bloc.includes("writePayload,"), "et le payload d'écriture exact");
  const rpc = SRC.indexOf("p_payload: writePayload,");
  assert(rpc > 0, "et c'est bien la variable que la RPC reçoit");
});

Deno.test("BROUILLON ④ — la réponse porte `draft_id`", () => {
  // Sans lui, l'écran ne peut rien demander: `meal-energy-v1` lit une LIGNE, il
  // ne chiffre pas des grammes qu'un client lui enverrait.
  assert(SRC.includes("draft_id: draftId,"));
});

Deno.test("⛔ BROUILLON ⑤ — une panne marque `failed`, elle ne laisse pas `running`", () => {
  // ⛔ UNE LIGNE RESTÉE `running` OCCUPE L'INDEX ET REFUSE LE BROUILLON SUIVANT
  // jusqu'à la balayeuse — `DRAFT_STUCK_AFTER_MS` vaut sept minutes. Pour une
  // panne d'une seconde, le bouton ne répond plus pendant sept minutes.
  assert(SRC.includes("await failDraft(adminClient(), draftId, {"));
  assert(SRC.includes('errorCode: "compose_failed"'));
  // ⛔ ET `draftId` VIT HORS DU `try`, sinon le catch global ne le verrait pas.
  const decl = SRC.indexOf("let draftId: string | null = null;");
  const tryStart = SRC.indexOf("  try {\n    const admin = adminClient();");
  assert(decl > 0 && tryStart > 0 && decl < tryStart, "déclaré avant le `try`");
  // Et une seule déclaration: une seconde, dans le `try`, masquerait la première.
  assertEquals(SRC.split("let draftId: string | null = null;").length - 1, 1);
});

Deno.test("BROUILLON ⑥ — le rangement ne peut pas refuser la composition", () => {
  // ⚠️ LE MAGASIN SERT L'APERÇU. Une panne de rangement doit coûter le CHIFFRE,
  // pas le plan: quelqu'un qui attend son brouillon depuis quarante secondes ne
  // doit pas le perdre parce qu'une ligne n'a pas pu s'écrire.
  const i = SRC.indexOf("const opened = await openDraft(admin, {");
  const bloc = SRC.slice(SRC.lastIndexOf("try {", i), SRC.indexOf("if (draftConflict !== null)", i));
  assert(bloc.includes("console.warn(`[${FN_NAME}] draft store open failed`"), bloc.slice(0, 200));
  assert(!bloc.includes("return jsonResponse"), "aucun refus dans le catch d'ouverture");
});

// ═══════════════════════════════════════════════════════════════════════════
// ET LE CHIFFRE SUIT — `meal-energy-v1` accepte un brouillon
// ═══════════════════════════════════════════════════════════════════════════

const ENERGY = Deno.readTextFileSync(
  new URL("../../meal-energy-v1/index.ts", import.meta.url),
);

Deno.test("⛔ BROUILLON ⑦ — la lecture porte le PROPRIÉTAIRE, l'état et l'expiration", () => {
  // ⛔ `.eq("user_id", …)` N'EST PAS UNE PRÉCAUTION. Le client est en
  // `service_role`: RLS ne le contraint pas, et la policy de la migration ne
  // protège que le port `authenticated`. Sans lui, un identifiant de brouillon
  // volé rendrait l'assiette de quelqu'un d'autre — cicatrice
  // `rls-is-not-a-substitute-for-eq-user-id`.
  const i = ENERGY.indexOf('.from("student_meal_drafts")');
  assert(i > 0, "les brouillons sont lus");
  const bloc = ENERGY.slice(i, i + 400);
  assert(bloc.includes('.eq("user_id", userId)'), "le propriétaire borne la lecture");
  assert(bloc.includes('.eq("status", "done")'), "une ligne sans plan ne se chiffre pas");
  assert(bloc.includes('.gt("expires_at"'), "ni une ligne que la balayeuse va effacer");
});

Deno.test("BROUILLON ⑧ — les quatre portes ne bougent pas", () => {
  // ⛔ ELLES PORTENT SUR LE LECTEUR, PAS SUR LA LIGNE LUE. Un brouillon n'ouvre
  // donc rien qu'un plan écrit n'ouvrirait: plancher TCA, âge, doctrine du
  // coach, interrupteur.
  //
  // ⚠️ LA DÉCISION EST PRISE PAR `loadEnergyGate` (`energy_gate_io.ts`), PAS
  // ICI. Elle y est descendue le 2026-09-01 pour que le chemin PHOTO lise la
  // même porte: deux fonctions edge qui liraient chacune `profiles` + la
  // doctrine + le plancher finiraient par le faire différemment, sur la garde
  // la plus sensible du produit. Ce test épingle donc l'appel unique, et son
  // ORDRE par rapport à la lecture des brouillons.
  assertEquals(
    ENERGY.split("await loadEnergyGate(admin, { userId })").length - 1,
    1,
    "un seul assemblage de la porte",
  );
  const porte = ENERGY.indexOf("await loadEnergyGate(admin, { userId })");
  const brouillons = ENERGY.indexOf('.from("student_meal_drafts")');
  assert(porte > 0 && brouillons > porte, "les portes décident AVANT toute lecture de plat");
});

Deno.test("BROUILLON ⑨ — le plafond de coût est COMMUN aux deux", () => {
  // Quatre objets à chiffrer, plans et brouillons confondus. Deux plafonds de
  // quatre en feraient huit, et le plafond existe pour qu'un appelant ne puisse
  // pas demander le recalcul de toute l'histoire d'un compte.
  assert(ENERGY.includes(".slice(0, Math.max(0, 4 - planIds.length))"));
  assert(
    ENERGY.includes("if (planIds.length === 0 && draftIds.length === 0)"),
    "et `no_plan` demande les deux",
  );
});

Deno.test("⛔ BROUILLON ⑩ — le brouillon est lu comme un PLAN, sans traduction", () => {
  // ⛔ `write_payload` EST le `p_payload` de `write_student_meal_plan`: ses clés
  // SONT celles de la ligne écrite. Le lire comme un `PlanRow` sans traduire est
  // ce qui garantit que l'aperçu et le plan adopté se chiffrent pareil — une
  // traduction serait précisément l'endroit où les deux se mettraient à
  // diverger, et c'est le défaut que le magasin existe pour fermer.
  const i = ENERGY.indexOf("      rows.push({");
  assert(i > 0, "les brouillons entrent dans la même liste que les plans");
  const bloc = ENERGY.slice(i, i + 500);
  for (const champ of ["dishes: payload.dishes", "preparations: payload.preparations"]) {
    assert(bloc.includes(champ), `${champ} vient du payload, pas d'une reconstruction`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX LANES, LES MÊMES ASSERTIONS — 2026-09-08
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ BROUILLON ⑪ — les DEUX lanes rangent leur aperçu", () => {
  // ⛔ CE TEST EST LA RÉPONSE À UN TROU MESURÉ, pas une symétrie de confort.
  // Câblé sur une seule lane, le chiffre du brouillon n'existait que pour les
  // foyers d'au moins deux bouches — et rien ne le disait.
  for (const { nom, src, lane, kind } of LANES) {
    assert(src.includes("await openDraft(admin, {"), `${nom}: la ligne s'ouvre`);
    assert(src.includes(`lane: ${lane},`), `${nom}: sa lane est ${lane}`);
    assert(src.includes(`planKind: ${kind},`), `${nom}: sa nature est ${kind}`);
    assert(src.includes("await markRunning(admin, draftId);"), `${nom}: elle passe en cours`);
    assert(src.includes("await completeDraft(admin, draftId, {"), `${nom}: elle se complète`);
    assert(src.includes("draft_id: draftId,"), `${nom}: la réponse porte l'identifiant`);
    assert(src.includes("const draftBody = {"), `${nom}: le corps rendu est nommé`);
    assert(src.includes("return jsonResponse(req, draftBody);"), `${nom}: et c'est lui qu'on rend`);
    assert(src.includes("response: draftBody,"), `${nom}: on range le corps rendu`);
    assert(src.includes("writePayload,"), `${nom}: et le payload d'écriture EXACT`);
    assert(src.includes("await failDraft(adminClient(), draftId, {"), `${nom}: une panne marque failed`);
    assert(src.includes('error: "draft_in_flight"'), `${nom}: un conflit refuse`);
  }
});

Deno.test("⛔ BROUILLON ⑫ — sur les DEUX lanes, l'ouverture précède l'appel modèle", () => {
  // L'index unique arbitre DANS l'insertion: ouvrir après le modèle le rendrait
  // décoratif, et deux taps à 80 ms d'écart paieraient deux appels.
  for (const { nom, src } of LANES) {
    const ouverture = src.indexOf("const opened = await openDraft(admin, {");
    const modele = src.indexOf("result = await generateWithGemini(");
    assert(ouverture > 0 && modele > 0, `${nom}: les deux points existent`);
    assert(ouverture < modele, `${nom}: l'ouverture précède le modèle`);
    // Et le refus de conflit aussi — sinon il se paierait au prix d'un appel.
    const refus = src.indexOf('error: "draft_in_flight"');
    assert(refus > 0 && refus < modele, `${nom}: le refus est avant le modèle`);
  }
});

Deno.test("⛔ BROUILLON ⑬ — sur les DEUX lanes, `draftId` vit HORS du `try`", () => {
  // Une ligne restée `running` occupe l'index et refuse le brouillon suivant
  // jusqu'à la balayeuse (sept minutes). Le catch global doit pouvoir la
  // marquer, donc voir la variable.
  for (const { nom, src } of LANES) {
    const decl = src.indexOf("let draftId: string | null = null;");
    const tryStart = src.indexOf("  try {\n    const admin = adminClient();");
    assert(decl > 0 && tryStart > 0, `${nom}: les deux points existent`);
    assert(decl < tryStart, `${nom}: déclaré avant le \`try\``);
    assertEquals(
      src.split("let draftId: string | null = null;").length - 1,
      1,
      `${nom}: une seule déclaration — une seconde masquerait la première`,
    );
  }
});
