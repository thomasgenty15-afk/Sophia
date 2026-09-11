/**
 * LE DIMENSIONNEMENT EST BRANCHÉ AU BON ENDROIT — épingles (2026-09-07).
 *
 * Chantier: `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`, lot 2.
 *
 * ⛔ POURQUOI DES ÉPINGLES DE POSITION, ET PAS SEULEMENT DES TESTS DE MODULE.
 * `portion_sizing.ts` est pur et entièrement testé; ça ne dit RIEN de l'endroit
 * où il tourne. Or l'endroit est la moitié du lot:
 *
 *   ① `sizingPathFor` doit précéder `buildHouseholdPromptBlocks`. Le prompt du
 *      lot 3 change de forme selon le verdict; le calculer après ferait
 *      promettre au modèle une recette standard pendant qu'un moteur attend des
 *      boîtes — les deux moitiés d'un même lot, désaccordées, en production.
 *   ② le bloc doit s'exécuter AVANT
 *      `applyHouseRuleLock(mealDishesPayload(meal)`, qui prend l'INSTANTANÉ des
 *      plats. Au lot 4 les boîtes autorées doivent être DANS cet instantané:
 *      les poser après demanderait un « recollage », c'est-à-dire une seconde
 *      source de vérité sur ce que le plan contient.
 *   ③ et APRÈS la dernière réécriture du plan (`mealSourceText =`,
 *      `restoreHeldOff(`): mesurer un plan qu'une relance va remplacer, c'est
 *      mesurer un plan qui ne partira pas.
 *
 * ⚠️ CHAQUE ÉPINGLE EST DOUBLÉE D'UNE COUPE. Sans elle, ces tests seraient des
 * `indexOf` sur des chaînes qui pourraient disparaître ensemble.
 */
// ⟳ 2026-09-11 · LOT 7 — LES CAS QUI N'ÉPROUVAIENT QUE `generate-meal-v1`
// SONT PARTIS AVEC ELLE. Aucune assertion métier n'a été retirée pour faire
// taire un rouge: chacun avait son jumeau FOYER, qui reste. Le détail de
// l'audit est dans `scratchpad/2026-09-11-LOT7-SUPPRESSION/`.
import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const REL = "generate-household-meal-v1/index.ts";
const SRC = stripComments(await Deno.readTextFile(new URL(REL, FUNCTIONS_DIR)));

const GUARD = "const sizing = sizingPathFor({";
const PROMPT = "buildHouseholdPromptBlocks(";
const TAG = '"keel.household_meal.portion_sizing"';
const LOCK = "applyHouseRuleLock(\n      mealDishesPayload(meal),";

Deno.test("CÂBLAGE ① la garde est calculée UNE FOIS", () => {
  const n = SRC.split(GUARD).length - 1;
  assertEquals(n, 1, "un second calcul du chemin laisserait deux états diverger");
});

Deno.test("CÂBLAGE ② la garde précède la construction du prompt", () => {
  const g = SRC.indexOf(GUARD);
  const p = SRC.indexOf(PROMPT);
  assert(g > 0 && p > 0, "les deux ancres existent");
  assert(g < p, "le prompt doit lire un verdict déjà calculé");
});

Deno.test("CÂBLAGE ③ le tag précède le verrou de maison", () => {
  const t = SRC.indexOf(TAG);
  const l = SRC.indexOf(LOCK);
  assert(t > 0, "le tag `portion_sizing` existe");
  assert(l > 0, "`applyHouseRuleLock(mealDishesPayload(meal)` existe");
  assert(
    t < l,
    "le dimensionnement doit tourner AVANT l'instantané des plats — sinon le " +
      "lot 4 devra recoller ses boîtes après coup",
  );
});

Deno.test("CÂBLAGE ④ le tag suit la dernière réécriture du plan", () => {
  const t = SRC.indexOf(TAG);
  const lastRewrite = Math.max(
    SRC.lastIndexOf("mealSourceText = "),
    SRC.lastIndexOf("restoreHeldOff("),
  );
  assert(lastRewrite > 0, "au moins une réécriture existe");
  assert(t > lastRewrite, "mesurer un plan qu'une relance remplacera ne mesure rien");
});

Deno.test("CÂBLAGE ⑤ le retrait des APPORTS FIXES est câblé par (bouche, jour)", () => {
  // ⟳ 2026-09-10 — CE CAS GARDAIT LE HISSAGE DE `extrasFor`, supprimée avec les
  // extras. Ce qui reste à garder est le SEUL retrait vivant: le shaker, lu par
  // bouche ET par jour. Une liste à plat dirait le shaker de Marc dans la cible
  // de Julie, et une lecture hors de la boucle des jours l'appliquerait un jour
  // où il n'a pas lieu.
  const e = SRC.indexOf("fixedIntakeSlotKcal({");
  const t = SRC.indexOf(TAG);
  assert(e > 0, "le retrait des apports fixes existe");
  assert(e < t, "il doit être calculé avant d'être journalisé par le bloc");
  assert(
    SRC.includes("slotFixedKcal: p.fixedByDay.get(day)"),
    "la carte lue est celle de CETTE bouche, pour CE jour",
  );
});

Deno.test("CÂBLAGE ⑥ le journal est écrit dans TOUS les cas, motif compris", () => {
  // ⛔ Un tag qui n'apparaîtrait que sur le chemin armé ne permettrait pas de
  // distinguer « ce foyer a deux bouches » de « le bloc n'est pas branché ».
  const bloc = SRC.slice(SRC.indexOf("const portionSizing = await"), SRC.indexOf(LOCK));
  assert(bloc.includes("sizing_path:"), "le chemin est journalisé");
  assert(bloc.includes("reason:"), "le motif est journalisé");
  assert(bloc.includes("applied: false"), "le lot 2 n'applique RIEN, et le dit");
});

// ---------------------------------------------------------------------------
// LES COUPES — sans elles, les épingles seraient des `indexOf` sur du vide
// ---------------------------------------------------------------------------

Deno.test("COUPE — retirer le tag fait rougir", () => {
  const mute = SRC.replace(TAG, '"keel.household_meal.autre_chose"');
  assertEquals(mute.indexOf(TAG), -1);
  // C'est exactement ce que l'épingle ③ lit: si le tag disparaît, elle tombe.
  assert(SRC.indexOf(TAG) > 0 && mute.indexOf(TAG) === -1);
});

Deno.test("COUPE — déplacer le bloc APRÈS le verrou fait rougir", () => {
  // On simule l'inversion et on vérifie que l'ordre lu s'inverse aussi.
  const t = SRC.indexOf(TAG);
  const l = SRC.indexOf(LOCK);
  assert(t < l);
  const inverse = SRC.slice(0, t) + SRC.slice(l);
  assert(
    inverse.indexOf(TAG) === -1 || inverse.indexOf(TAG) > inverse.indexOf(LOCK),
    "l'épingle ③ doit tomber quand l'ordre s'inverse",
  );
});

Deno.test("CÂBLAGE ⑦ le tag porte un `user_id` — sinon le banc ne le voit pas", () => {
  // ⚠️ MESURÉ AU PREMIER TIR DU LOT 2: le tag était écrit, correct, et ABSENT
  // du journal capturé. Le journal du runtime est partagé entre les sessions,
  // et le banc filtre sur le `user_id` — une ligne sans identifiant se rattache
  // à aucun run, donc disparaît. Tous les autres tags de ce fichier en portent
  // un; celui-ci l'avait oublié.
  //
  // ⛔ ET IL EST DANS L'ENVELOPPE, PAS DANS LES `rows`. La règle de vie privée
  // porte sur la ligne PAR PLAT (jour, créneau, kcal): elle ne doit désigner
  // personne. Précédent: `residualGaps`, retiré du journal pour avoir porté un
  // `member_id` à côté de trois kcal.
  const i = SRC.indexOf(TAG);
  const fin = SRC.indexOf("}));", i);
  const enveloppe = SRC.slice(i, fin);
  assert(enveloppe.includes("user_id: userId,"), "l'enveloppe porte le user_id");
  const bloc = SRC.slice(SRC.indexOf("const portionSizing = await"), SRC.indexOf(LOCK));
  const rows = bloc.slice(bloc.indexOf("rows.push({"), bloc.indexOf("});", bloc.indexOf("rows.push({")));
  assert(!rows.includes("member_id"), "aucune ligne par plat ne désigne quelqu'un");
  assert(!rows.includes("user_id"), "aucune ligne par plat ne désigne quelqu'un");
});

Deno.test("CÂBLAGE ⑧ v33 — le verdict atteint le PROMPT et le PARSEUR", () => {
  // ⛔ LES DEUX MOITIÉS D'UN MÊME LOT. Le prompt demande une recette standard;
  // le parseur doit relire cette forme-là. Si l'une passe et l'autre non, les
  // casseroles d'une portion — cas NOMINAL de v33 — sont jetées en silence, et
  // les plats qui les citent deviennent « unknown preparation, dropped ». C'est
  // le défaut déjà mesuré une fois (`prep_zoe_tuna_pasta`, run réel du
  // 2026-08-12), et il ne laisse aucune trace lisible dans l'assiette.
  assert(
    SRC.includes("sizingPath: sizing.path,"),
    "le prompt reçoit le verdict, jamais un second calcul",
  );
  assert(
    SRC.includes('standardRecipe: sizing.path === "portion_v1",'),
    "le parseur reçoit le MÊME verdict, dérivé du même objet",
  );
  // ⛔ ET IL EST DÉRIVÉ, PAS RECOPIÉ. Un `standardRecipe: true` en dur passerait
  // ce test si on le cherchait par sa valeur; on le cherche par sa DÉRIVATION.
  assert(!SRC.includes("standardRecipe: true"), "aucun littéral en dur");
});

Deno.test("CÂBLAGE ⑩ lot 4 — `demandBefore` est capturé AVANT l'application", () => {
  // ⛔ MODE D'ÉCHEC N°2 DU PLAN, ET IL EST SILENCIEUX. Capturé après, le
  // rapport après/avant vaudrait 1 pour chaque terme: la liste de courses
  // resterait celle du modèle pendant que le plan a changé de taille, et
  // chaque ligne aurait l'air juste.
  const avant = SRC.indexOf("const demandBefore = demandByTerm();");
  const applique = SRC.indexOf("const applied = applySizing({");
  assert(avant > 0, "`demandBefore` existe");
  assert(applique > 0, "`applySizing` est appelée");
  assert(avant < applique, "l'instantané des courses PRÉCÈDE la multiplication");
});

Deno.test("CÂBLAGE ⑪ lot 4 — l'application précède le verrou et le rétrécissement", () => {
  const applique = SRC.indexOf("const applied = applySizing({");
  // ⛔ AVANT L'INSTANTANÉ DES PLATS: sinon les boîtes autorées n'y sont pas.
  assert(applique < SRC.indexOf(LOCK), "avant `applyHouseRuleLock(mealDishesPayload)`");
  // ⛔ AVANT `drawnByPot`: mode d'échec n°1 du plan — sans boîtes, `potShrinkPlan`
  // conclut que toutes les casseroles sont de trop et les RETIRE.
  const shrink = SRC.indexOf("const drawnByPot");
  assert(shrink > 0 && applique < shrink, "avant le rétrécissement des casseroles");
});

Deno.test("CÂBLAGE ⑫ lot 4 — le re-pesage suit l'application, et les courses s'ouvrent", () => {
  const applique = SRC.indexOf("const applied = applySizing({");
  // ⚠️ IL Y A DEUX `regramMeal(meal, composition)` DANS CE FICHIER — un dans la
  // relecture d'avant le lot, un dans le bloc L9. Un `indexOf` trouvait le
  // PREMIER, qui précède l'application, et le test rougissait sur une vérité.
  // On cherche donc un appel APRÈS l'application, pas « le » premier.
  const apres = SRC.slice(applique);
  assert(
    apres.includes("regramMeal(meal, composition)"),
    "`gramsRaw` est recalculé APRÈS la multiplication — c'est un CACHE",
  );
  // ⛔ Sans cette condition, les trois compteurs legacy valent zéro sur ce
  // chemin (la casserole n'a ni grossi ni rétréci du fait du LEGACY) et la
  // liste resterait celle du modèle.
  assert(
    SRC.includes("portionSizing.applied"),
    "la porte des courses lit `portionSizing.applied`",
  );
});

Deno.test("CÂBLAGE ⑬ lot 5 — la réparation précède l'application, et rejoue la CEINTURE", () => {
  const repare = SRC.indexOf("const instruction = repairInstruction(");
  const applique = SRC.indexOf("const applied = applySizing({");
  assert(repare > 0 && applique > 0);
  // ⛔ RÉPARER APRÈS AVOIR MULTIPLIÉ reviendrait à multiplier deux fois: une
  // fois la recette d'origine, une fois celle qui la remplace.
  assert(repare < applique, "on répare AVANT de multiplier");
  // ⛔ LA CEINTURE EST REJOUÉE PAR LE MÊME PARSEUR. Une relance relue « à la
  // main » ferait rentrer par la porte de derrière (allergène, régime,
  // exclusion, règle de maison) ce que la porte d'entrée refuse.
  const bloc = SRC.slice(repare, applique);
  assert(
    bloc.includes("parseGeneratedMeal(retryResult, parseArgs)"),
    "la sortie de la relance repasse par le parseur de production",
  );
  // ⟳ RETOURNÉE LE 2026-09-08 : la réparation ne fusionne plus par cellules,
  // elle ÉPISSE les seules unités autorisées (décision du propriétaire —
  // « on sait d'avance ce qu'il peut changer »). La relecture par le MÊME
  // parseur reste la ceinture ; ce qui a changé, c'est ce qu'on lit ensuite.
  assert(
    SRC.includes("const splice = spliceReworkableUnits({ base: meal, retry: retried, asks: spliceAsks });"),
    "la réparation ne lit plus les seules unités autorisées",
  );
  // ⛔ JAMAIS SUR UNE ADOPTION: rejouer un brouillon déjà validé par quelqu'un
  // en y glissant un appel modèle rendrait un plan qu'il n'a pas vu.
  // ⟳ RETOURNÉE LE 2026-09-09 : l'autre session a remplacé `!adoptingDraft` par
  // `improvementRetries` (= `!adoptingDraft && !editing`) sur toutes les
  // relances. La propriété « jamais sur une adoption » tient par la
  // DÉFINITION du drapeau, qu'on épingle ici plutôt que le littéral.
  // ⟳ 2026-09-10 — LA GARDE PORTE MAINTENANT UN TROISIÈME TERME: le budget
  // commun. `&&` court-circuite, donc l'ordre compte et il est le bon —
  // `improvementRetries` est évalué AVANT `planRepairGranted`, et une adoption
  // ne consomme donc aucun rattrapage.
  // ⟳ 2026-09-11 · LOT E — LA GARDE LIT `instructionWithCells`, ET C'EST LE
  // LOT. La consigne de `repairInstruction` nomme chaque plat par son SEUL
  // TITRE; le modèle a déplacé des plats d'une case à l'autre (PERTE 2ᵉ appel,
  // GAIN 1ᵉʳ), et la fusion recollait alors un titre sur les casseroles d'une
  // autre case. `cellBlock` ajoute le jour, le moment et les identifiants de
  // casserole de chaque plat demandé. Les trois termes de la garde, leur ordre
  // et leur sens n'ont pas bougé — seul le nom de la variable a changé.
  assert(
    bloc.includes(
      'if (instructionWithCells && improvementRetries && planRepairGranted("density_repair")) {',
    ),
    "aucune relance sur une adoption, ou le budget n'est plus consulté",
  );
  assert(
    /const improvementRetries = !adoptingDraft && /.test(SRC),
    "`improvementRetries` ne garantit plus « jamais sur une adoption »",
  );
});

Deno.test("CÂBLAGE ⑭ lot 5 — un refus d'identité JOURNALISE les deux titres", () => {
  // ⛔ SANS EUX, LE REFUS N'EST PAS JUGEABLE. « le modèle a renommé le plat » ne
  // dit pas s'il a ajusté deux mots ou remplacé la soupe par un gratin, et ces
  // deux-là n'appellent pas la même décision. Mesuré le 2026-09-07: le premier
  // tir a rendu « Thon, haricots blancs… » pour « Poulet rôti, quinoa… », le
  // second « Poulet, riz, laitue et avocat » pour « Poulet, riz, tomate et
  // concombre ». C'est ce journal qui a permis de le voir.
  assert(SRC.includes('"keel.household_meal.density_repair_titles"'));
  const i = SRC.indexOf('"keel.household_meal.density_repair_titles"');
  const bloc = SRC.slice(i, i + 900);
  assert(bloc.includes("before:") && bloc.includes("after:"), "les deux titres");
  assert(bloc.includes("cell:"), "et la cellule qui les situe");
});

Deno.test("CÂBLAGE ⑮ lot 6 — sous plancher TCA, AUCUN kcal ne sort du journal", () => {
  // ⛔ LA GARDE DE FUITE DU CHANTIER. v33 a retiré le corps du prompt, le lot 6
  // fait dimensionner l'assiette sans ouvrir d'objectif — et il resterait un
  // chemin par lequel un nombre de calories atteint une personne sous plancher:
  // le JOURNAL. « Pas montré aujourd'hui » n'est pas une propriété du produit:
  // un journal se copie dans un rapport, s'exporte, se relit au support.
  const i = SRC.indexOf("const sousPlancher = dayTarget.gapClosed");
  assert(i > 0, "le verdict de plancher est lu à l'écriture de la ligne");
  const bloc = SRC.slice(i, SRC.indexOf("});", i));
  // Les quatre champs de kcal sont DANS la branche conditionnelle.
  for (const champ of ["standard_kcal", "density", "target_kcal", "unmet_kcal"]) {
    const pos = bloc.indexOf(champ);
    assert(pos > bloc.indexOf("sousPlancher ? {} : {"), `${champ} doit être omis sous plancher`);
  }
  // Et ce qui RESTE ne compte aucune calorie: des grammes, un facteur, un verdict.
  assert(bloc.includes("person_cooked_g:"), "les grammes restent — ils servent à déboguer");
  assert(bloc.includes("floored:"), "et la ligne DIT qu'elle est amputée");
});

Deno.test("CÂBLAGE ⑯ lot 6 — l'AFFICHAGE n'est pas touché", () => {
  // ⛔ LE LOT OUVRE UNE SEULE PORTE: le dimensionnement. `decideBoxEnergy` et
  // `canShowEnergy` décident ce qui se MONTRE, et ils restent fermés — la boîte
  // se dimensionne, son chiffre ne s'affiche pas. Les confondre ferait passer un
  // lot de mesure pour un lot d'affichage.
  const i = SRC.indexOf("const dayTarget = dayTargetFor({");
  const bloc = SRC.slice(i, SRC.indexOf("const draws = drawsByPreparation", i));
  assert(!bloc.includes("decideBoxEnergy"), "l'affichage n'est pas touché ici");
  assert(!bloc.includes("canShowEnergy"), "ni la porte d'affichage");
  // Et `dayTargetFor` a bien remplacé `mouthTargetKcal` À CET ENDROIT-LÀ SEUL.
  assert(SRC.includes("const dayTarget = dayTargetFor({"));
});

// ═══════════════════════════════════════════════════════════════════════════
// LA DENSITÉ REQUISE, DITE AVANT LA COMPOSITION — 2026-09-08
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("CÂBLAGE ⑰ — la densité se calcule APRÈS le référentiel et AVANT le prompt", () => {
  // ⛔ CES TROIS POSITIONS SONT LE LOT. Trop tôt, `composition` est nulle et
  // toutes les bouches tombent dans `no_composition` — un lot désarmé qui
  // ressemble trait pour trait à un lot qui marche. Trop tard, le prompt est
  // déjà construit et le champ ne part pas.
  // ⟳ 2026-09-11 · LOT E — L'ANCRE CHANGE PARCE QUE L'APPEL A GAGNÉ UN
  // ARGUMENT: le chargeur reçoit désormais la LANGUE du plan
  // (`loadCompositionIndex(admin, { lang: compositionLang })`). Sans elle, un
  // plan anglais lisait `raisins` comme du raisin frais — le faux ami du lot A,
  // à l'envers. Ce que ce cas tient (les trois positions) n'a pas bougé; on
  // ancre donc sur la partie stable de l'appel.
  const referentiel = SRC.indexOf("composition = await loadCompositionIndex(admin");
  const grille = SRC.indexOf("const householdGrid = householdCells({");
  const densite = SRC.indexOf("const requiredDensityByMember");
  const prompt = SRC.indexOf("const householdPromptInput = {");
  assert(referentiel > 0 && grille > 0 && densite > 0 && prompt > 0, "les quatre points existent");
  assert(densite > referentiel, "la densité lit le référentiel, donc elle vient après");
  assert(densite > grille, "et la grille, qui fait autorité sur les moments");
  assert(densite < prompt, "et elle est posée avant que le prompt soit construit");
});

Deno.test("CÂBLAGE ⑱ — AUCUN RETRAIT D'EXTRAS NE SURVIT DANS LA LANE", () => {
  // ⟳ 2026-09-10 — CE CAS A CHANGÉ DE SUJET, PAS DE RÔLE. Il gardait le
  // HISSAGE de `extrasFor` au-dessus du bloc de densité; le bloc lui-même a été
  // supprimé (décision produit: le plan ne réserve plus d'énergie pour ce qui
  // est pris à côté). Il garde désormais son ABSENCE.
  //
  // ⛔ UNE ÉPREUVE D'ABSENCE EST LE SEUL TEST POSSIBLE ICI: un symbole
  // supprimé ne s'importe pas, donc rien d'autre ne peut dire « il est bien
  // parti ». Et le remettre ne casserait pas la compilation — il faut donc
  // que quelque chose le refuse par son nom.
  for (const token of [
    "extrasFor",
    "slotExtraKcal",
    "resolveSlotExtras",
    "parseMemberExtras",
    "mealExtras",
    "takes_bread",
    "takes_cheese",
    "takes_dessert",
    "already eats aside",
  ]) {
    assertEquals(
      SRC.split(token).length - 1,
      0,
      `« ${token} » est revenu dans ${REL}`,
    );
  }
});

Deno.test("CÂBLAGE ⑲ — `requiredDensity` n'a QU'UN point d'écriture non nul", () => {
  // ⛔ `null` VEUT DIRE « PERSONNE N'A CALCULÉ ». Deux écrivains rendraient
  // l'oubli indiscernable de l'abstention — et `roster.map` en pose justement
  // un `null` à la construction, 3 000 lignes plus haut.
  // ⟳ RETOURNÉE LE 2026-09-08. Elle épinglait le NOMBRE d'occurrences (deux), et
  // le brief du foyer en a légitimement ajouté une troisième: les cartes v34
  // portent maintenant la densité, qu'elles ne recevaient pas. Compter les
  // occurrences aurait forcé à affaiblir la garde ou à ne pas brancher la carte.
  //
  // ⛔ LA PROPRIÉTÉ, ELLE, NE BOUGE PAS ET SE DURCIT: **un seul** `null` nu, et
  // tout autre écrivain lit `requiredDensityByMember`. Deux poseurs de `null`
  // rendraient l'oubli indiscernable de l'abstention — et `roster.map` en pose
  // justement un à la construction, 3 000 lignes plus haut.
  const ecrits = [...SRC.matchAll(/requiredDensity:\s*([^\n,]+)/g)]
    .map((m) => m[1].trim())
    // La DÉCLARATION de type n'est pas une écriture.
    .filter((e) => !e.startsWith("RequiredDensity"));
  assert(ecrits.length >= 2, `au moins deux écritures attendues, vu: ${ecrits.join(" | ")}`);
  assertEquals(
    ecrits.filter((e) => e === "null").length,
    1,
    `un seul \`null\` nu, vu: ${ecrits.join(" | ")}`,
  );
  for (const e of ecrits) {
    if (e === "null") continue;
    assert(
      e.startsWith("requiredDensityByMember.get("),
      `un écrivain qui ne lit pas la carte calculée: ${e}`,
    );
  }
  // Et elle est DANS la tranche qui construit les membres du prompt.
  const debut = SRC.indexOf("members: platedMembers.map((m) => {");
  const fin = SRC.indexOf("daysInWindow: daysToFill", debut);
  const tranche = SRC.slice(debut, fin);
  assert(tranche.includes("requiredDensity: requiredDensityByMember.get("), "posée au bon endroit");

  // ⛔ ET LES CARTES DU FOYER LA PORTENT AUSSI (2026-09-08). Sans elle, le brief
  // v34 ne servait que les DEUX planchers génériques du bloc de recette. Mesuré
  // sur `quatre`: l'ado a besoin de 151 kcal/100 g au déjeuner, le modèle a
  // écrit 116 — au-dessus du plancher qu'on lui donnait — et l'assiette est
  // sortie à 850 g pour des calories pourtant justes.
  const cartes = SRC.indexOf("const v34CardFacts: Record<");
  assert(cartes > 0, "les faits de carte v34 ont disparu");
  assert(
    SRC.slice(cartes, SRC.indexOf("const householdPromptInput", cartes))
      .includes("requiredDensity: requiredDensityByMember.get("),
    "les cartes du foyer ne portent pas la densité requise",
  );
});

Deno.test("CÂBLAGE ⑳ — le plancher du bloc SUIT les bouches, il n'est plus constant", () => {
  // ⛔ SANS CE CÂBLAGE, UNE BOUCHE SOUS PLANCHER TCA EST SOUS-NOURRIE POUR LA
  // PROTÉGER D'UN CHIFFRE: sa densité ne peut pas être nommée sur sa ligne, et
  // si le plancher commun reste à 100, personne ne la transmet.
  const gen = Deno.readTextFileSync(
    new URL("./household_meal_generation.ts", import.meta.url),
  );
  assert(
    gen.includes("standardRecipeBlock(densityFloorsOf(input.members, {"),
    "le bâtisseur v33 calcule ses planchers",
  );
  // Et l'alias garde les valeurs de base — v34 et les tests le lisent.
  assert(gen.includes("export const STANDARD_RECIPE_BLOCK: readonly string[] = standardRecipeBlock({"));
});

Deno.test("⛔ CÂBLAGE ㉑ — sous plancher TCA, la densité NE SORT PAS du journal", () => {
  // ⛔ MÊME GARDE QUE ⑮, ET LE MÊME RAISONNEMENT. Une densité par moment est une
  // lecture du corps de quelqu'un à un facteur près: 201 kcal/100 g au déjeuner
  // ne se lit pas « ce plat est dense », ça se lit « cette personne vise gros ».
  // Un journal se copie dans un rapport, s'exporte, se relit au support.
  const i = SRC.indexOf("if (density.gapClosed !== \"restriction_floor\" && density.named.length > 0)");
  assert(i > 0, "le verdict de plancher garde l'écriture du journal");
  // Et les compteurs, eux, sortent toujours — ils comptent des BOUCHES, pas des
  // calories: `folded` doit rester lisible, sinon on ne saurait pas que le
  // silence a été appliqué.
  // ⟳ 2026-09-11 · LOT B — le journal porte en plus `by_case` (la grille avec
  // ses clés jour/moment). La garde ne change pas: aucun `member_id`, et les
  // compteurs restent lisibles.
  assert(SRC.includes("by_slot: densityBySlot,"));
  assert(SRC.includes("by_case: densityByCase,"), "la grille ne sort pas avec ses clés");
  assert(SRC.includes("folded:"), "combien de bouches sont fondues dans le plancher");
  // ⛔ ET AUCUN `member_id` EN CLÉ DU JOURNAL. Mesuré au tir du 2026-09-08:
  // `by_slot` sortait indexé par bouche, c'est-à-dire un identifiant à côté de
  // quatre densités. C'est la faute exacte pour laquelle `residualGaps` a été
  // retiré du journal — une densité par moment est une lecture du corps de
  // quelqu'un à un facteur près.
  const i2 = SRC.indexOf("for (const d of density.named) {");
  assert(i2 > 0, "l'écriture du journal agrège par MOMENT");
  const bloc2 = SRC.slice(i2, i2 + 400);
  assert(!bloc2.includes("m.memberId"), "aucun identifiant en clé");
  assert(bloc2.includes("Math.max(seen, d.kcalPer100G)"), "le max par moment, toutes bouches");
});

Deno.test("CÂBLAGE ㉒ — la relance récite la RECETTE, quantités comprises", () => {
  // ⛔ LE DÉFAUT MESURÉ LE 2026-09-07, ET SA FERMETURE. Le message de relance
  // est `built.systemPrompt + household.systemSuffix` et `householdUserMessage`
  // — c'est-à-dire le prompt d'ORIGINE plus la consigne. Le modèle n'y relit
  // nulle part le plan qu'il vient d'écrire: nommer ses ingrédients sans leurs
  // quantités lui demandait de re-proportionner de mémoire, et il s'arrêtait à
  // mi-chemin (142 rendus pour 182 demandés, deux fois sur deux).
  const i = SRC.indexOf("const instruction = repairInstruction(");
  assert(i > 0, "la relance de densité existe");
  const bloc = SRC.slice(i, SRC.indexOf("if (instruction && !adoptingDraft)", i));
  assert(bloc.includes("fresh: r.fresh.map("), "le frais du plat part avec ses quantités");
  assert(bloc.includes("quantity: g.quantity"), "et c'est la chaîne du modèle");
  assert(bloc.includes("pots: r.pots.map("), "chaque casserole aussi");
  assert(bloc.includes("repairability: reworkable.has(pot.id)"), "avec son verrou");
  // ⛔ ET UNE SEULE DÉRIVATION DE LA RECETTE. `componentsOf`, qui sert la garde
  // d'identité, LIT `recipeOf` — deux listes séparées permettraient de demander
  // une chose et d'en vérifier une autre.
  assert(SRC.includes("const componentsOf = (i: number)"), "la garde a sa liste");
  const ci = SRC.indexOf("const componentsOf = (i: number)");
  assert(
    SRC.slice(ci, ci + 400).includes("const r = recipeOf(i);"),
    "et elle la dérive de la recette, pas d'un second parcours",
  );
});

Deno.test("CÂBLAGE ㉓ — la règle des mangeurs est une ENTRÉE, et les deux chemins la fournissent", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-08 — CE TEST S'EST RETOURNÉ, ET IL AVAIT PRÉDIT LE JOUR.
  // ══════════════════════════════════════════════════════════════════════
  // Sa rédaction d'origine épinglait le littéral `eaters: new Set([mouth.memberId])`
  // à l'intérieur de la machinerie, en écrivant: « le jour où `platedMembers`
  // en portera plusieurs, le changement doit être une ENTRÉE (`eaters`) et pas
  // du code ». C'est exactement ce qui vient d'arriver: la machinerie est
  // devenue `runDensityRepair(outOfBounds, verdictsOf)`, et les deux chemins
  // l'appellent. La propriété gardée n'a pas bougé d'un mot — elle se vérifie
  // maintenant sur les DEUX appelants au lieu d'un littéral.
  const i = SRC.indexOf("const unitesReparables = potRepairability({");
  assert(i > 0, "la règle des casseroles n'est plus appelée");
  const bloc = SRC.slice(i, SRC.indexOf("repairs.pots_frozen = potsFrozen;", i));
  assert(bloc.includes("eaters: verdictsOf(i).eaters"), "les mangeurs ne sont plus une entrée");
  assert(bloc.includes("verdicts: verdictsOf(i).verdicts"), "les verdicts ne sont plus une entrée");
  assert(bloc.includes("repairabilityOf(unit, direction)"), "et la règle décide");
  assert(bloc.includes("reworkable.add(id)"), "ce qui bouge est nommé");

  // ⛔ UNE SEULE MACHINERIE, DEUX APPELANTS. Une seconde copie pour la table
  // divergerait au premier ajustement, et c'est celle qu'on relit le moins qui
  // servirait les grammes.
  assertEquals(
    SRC.split("const runDensityRepair = async").length - 1,
    1,
    "la réparation de densité est écrite deux fois",
  );
  assertEquals(
    SRC.split("await runDensityRepair(").length - 1,
    2,
    "les deux chemins n'appellent pas la même réparation",
  );
  // ⚠️ LE SOLO FOURNIT SA BOUCHE UNIQUE, la table ses verdicts par plat.
  assert(
    SRC.includes("eaters: new Set([mouth.memberId]),"),
    "le chemin d'une bouche ne fournit plus la sienne",
  );
  assert(
    SRC.includes("eaters: new Set(verdictByDish.get(k)?.keys() ?? []),"),
    "la table ne fournit pas les mangeurs de chaque plat",
  );
  // ⛔ ET ELLE RÉPARE AVANT D'APPLIQUER: poser les grammes du plan d'AVANT
  // ferait servir une assiette et en mesurer une autre.
  assert(
    SRC.indexOf("await runDensityRepair(outOfBoundsN") <
      SRC.indexOf("const appliedN = applySizingForEaters({"),
    "la table applique avant de réparer",
  );
});

Deno.test("⛔ CÂBLAGE ㉔ — la réparation de densité n'ÉPISSE que les unités autorisées : plus de fusion de case, plus de défourchage", () => {
  // ⟳ RETOURNÉE LE 2026-09-08. Elle tenait `unforkReworkedPots` APRÈS
  // `mergeRetryCells` : la casserole réécrite renommée `__r` retrouvait son
  // nom. Décision du propriétaire : « si c'est nous qui donnons les
  // instructions, pourquoi il change les plats si on sait d'avance ce qu'il
  // peut changer ? » On ne lit plus la case : on ne lit que le frais et les
  // casseroles autorisées, par identifiant — la casserole garde son id, rien
  // n'est renommé, rien n'est à défourcher.
  const D = SRC.indexOf("const runDensityRepair = async");
  const E = SRC.indexOf("      return merged;\n    };", D);
  const machinerie = SRC.slice(D, E);
  assert(machinerie.includes("const splice = spliceReworkableUnits({ base: meal, retry: retried, asks: spliceAsks });"), "la réparation ne passe plus par l'épissage");
  assert(!machinerie.includes("mergeRetryCells({ base: meal, retry: retried, cells: keptCells })"), "la réparation fusionne encore la case entière");
  assert(!machinerie.includes("unforkReworkedPots("), "la réparation défourche encore : elle a donc importé des casseroles renommées");
  // ⛔ ET SEULES LES UNITÉS AUTORISÉES SONT DEMANDÉES À L'ÉPISSAGE.
  assert(machinerie.includes("freshReworkable: allowedByDish.get(i)?.freshReworkable ?? false,"), "le frais épissé n'est pas celui qu'on a autorisé");
  assert(machinerie.includes("reworkablePotIds: allowedByDish.get(i)?.reworkablePotIds ?? [],"), "les casseroles épissées ne sont pas celles qu'on a autorisées");
  // ⛔ ET L'IDENTITÉ RESTE LA PORTE : un plat qui n'a pas gardé sa nourriture n'est pas épissé.
  assert(machinerie.includes(".filter((i) => identity.get(i)?.held === true)"), "l'identité ne filtre plus ce qu'on épisse");
});

Deno.test("CÂBLAGE ㉕ — les trois compteurs neufs sont écrits À ZÉRO", () => {
  // ⛔ UN COMPTEUR ABSENT ET UN COMPTEUR À ZÉRO NE SE LISENT PAS PAREIL. Le
  // premier dit « ce lot n'existe pas dans cette version », le second dit « il
  // existe et il n'a rien eu à faire ». Sur un tir ordinaire, c'est le second
  // qu'on veut lire — sinon un lot désarmé ressemble à un lot qui marche.
  const i = SRC.indexOf("const repairs = {");
  const bloc = SRC.slice(i, SRC.indexOf("};", i));
  for (
    const champ of [
      "pots_frozen: 0",
      "pot_unforked: 0",
      "pot_forked: 0",
      "recipe_terms: 0",
      "recipe_quantified: 0",
    ]
  ) {
    assert(bloc.includes(champ), `${champ} manque à l'initialisation`);
  }
  // ⛔ ET LE COMPTEUR COMPTE, IL NE RECOPIE PAS. Le prompt de relance porte la
  // recette d'une personne; un journal se copie dans un rapport et se relit au
  // support. `recipe_terms` répond à « la recette est-elle partie ? » sans
  // écrire ce qu'elle contient — et sans lui, un lot désarmé ressemble trait
  // pour trait à un lot qui marche.
  const j = SRC.indexOf("repairs.recipe_terms += cites.length;");
  assert(j > 0, "le compteur est alimenté à la construction de l'instruction");
  const bloc2 = SRC.slice(j, j + 300);
  assert(bloc2.includes("g.quantity !== null"), "et il distingue ce qui porte une quantité");
  assert(!bloc2.includes("term:"), "aucun terme ne part au journal");
});

Deno.test("⛔ CÂBLAGE ㉖ — le JOUR DE CUISINE n'attend aucun repas", () => {
  // ⛔ LE DÉFAUT, MESURÉ LE 2026-09-08. La personne demande UN jour; le moteur
  // recule la fenêtre d'un jour pour que les courses et la cuisson tiennent la
  // veille. Cette veille entrait dans ce qu'on ATTEND: `mealsDelivered`
  // annonçait « 4 repas manquants » sur un plan complet, et la relance des
  // bouches non nourries partait pour les réparer — un appel modèle payé pour
  // un jour que personne n'a demandé.
  //
  // ⚠️ LA SIGNATURE DU DÉFAUT ÉTAIT QUE LE CHIFFRE BOUGEAIT AVEC L'HEURE: à
  // 15 h trois moments de la veille étaient déjà passés et il en restait un; à
  // 4 h du matin, quatre. Le plan était le même.
  const i = SRC.indexOf("const mouthCells = cookOnlyDay === null");
  assert(i > 0, "les cases attendues sont filtrées sur le jour de cuisine");
  const bloc = SRC.slice(i, i + 400);
  assert(bloc.includes("c.day !== cookOnlyDay"), "et c'est bien ce jour-là qui sort");
  // ⛔ LA GRILLE GARDE SES CASES: le prompt doit savoir que la veille existe
  // (on y cuisine), et l'écran doit pouvoir l'afficher. Seule l'ATTENTE change.
  assert(
    SRC.includes("const mouthCells = cookOnlyDay === null\n      ? householdGrid.byMouth"),
    "`householdGrid` n'est pas muté — c'est une projection",
  );
  // Et le retrait se COMPTE, à zéro quand la fenêtre n'a pas reculé.
  assert(SRC.includes("cook_day_cells_dropped: cookDayCellsDropped,"));
  assert(SRC.includes("const cookDayCellsDropped = cookOnlyDay === null ? 0"));
});

Deno.test("⛔ CÂBLAGE ㉗ — la DENSITÉ non plus ne compte pas le jour de cuisine", () => {
  // ⛔ LA MÊME FAUTE, À UN AUTRE ENDROIT, ET ELLE SE VOIT À L'HEURE DU TIR.
  // La densité requise d'un moment vient de sa PART de la journée. Sur le jour
  // de cuisine, les moments déjà passés ne comptent plus: à 15 h il ne reste
  // que le dîner de la veille, qui porte alors la journée ENTIÈRE.
  //
  // Mesuré le 2026-09-08, même corps, même demande, deux heures différentes:
  //   · 3 cases de la veille passées ⇒ dîner exigé à 389 (raboté à 250)
  //   · 0 case passée                ⇒ dîner exigé à 159
  //
  // On demandait au modèle une densité calculée sur un jour où il ne compose
  // rien, et le chiffre changeait avec l'horloge.
  const i = SRC.indexOf("const cells = (householdGrid.byMouth.find((r) => r.memberId === m.memberId)?.cells ?? [])");
  assert(i > 0, "les moments qui servent la densité sont filtrés");
  const bloc = SRC.slice(i, i + 200);
  assert(
    bloc.includes("cookOnlyDay === null || c.day !== cookOnlyDay"),
    "et c'est le jour de cuisine qui sort",
  );
  // ⛔ LES DEUX FILTRES LISENT LA MÊME VARIABLE. Deux notions de « le jour de
  // cuisine » finiraient par diverger, et c'est celle qu'on regarde le moins
  // qui déciderait.
  assertEquals(SRC.split("cookOnlyDay").length - 1 >= 4, true, "une seule source du jour de cuisine");
});

Deno.test("⛔ CÂBLAGE ㉘ — la relance de DENSITÉ parle APRÈS le bloc de précédence", () => {
  // ⛔ ELLE EST LA SEULE DES SIX À DEMANDER DE NE PAS COMPOSER. Les cinq autres
  // demandent de RECOMPOSER (protéine, exclusion, échange, séparation, bouche
  // non nourrie): le bloc d'arbitrage après elles est cohérent. Celle-ci dit
  // « ne recompose rien, réécris les quantités » — et le bloc final dit
  // « nothing in this message outranks it » puis « compose the nearest dish the
  // higher rule DOES allow ».
  //
  // Mesuré le 2026-09-08: le dîner à densifier est revenu en « Poulet, pommes
  // de terre, poivron et salade au yaourt », 111 g de survie sur 1 341. Le
  // modèle a obéi — au dernier bloc lu.
  assert(
    SRC.includes("const householdRepairMessage = (instruction: string): string =>"),
    "un assembleur dédié existe",
  );
  const i = SRC.indexOf("const householdRepairMessage");
  assert(
    SRC.slice(i, i + 220).includes('`${householdUserMessage("")}'),
    "il part du message complet, précédence comprise, et AJOUTE après",
  );
  // ⛔ ET IL NE SERT QU'À LA RELANCE DE DENSITÉ. Un second appelant lui ferait
  // porter une relance qui, elle, demande bien de composer.
  // ⚠️ UNE seule occurrence de `householdRepairMessage(`: la déclaration
  // s'écrit `= (instruction: string) =>`, sans parenthèse collée au nom. C'est
  // donc bien le nombre d'APPELS qu'on compte ici.
  // ⟳ 2026-09-08 — RETOURNÉE. Elle épinglait « un seul appelant » ; l'entrée
  // de dernier recours (cas 5) en ajoute légitimement un second. La propriété
  // qui compte n'a pas bougé : TOUT message de réparation passe par le même
  // assembleur, donc hérite du bloc de précédence en queue. Deux appelants,
  // deux relances nommées, aucun message de réparation construit à côté.
  const appelants = SRC.split("householdRepairMessage(").length - 1;
  assertEquals(appelants, 2, "les relances de réparation ne passent pas toutes par l'assembleur");
  // ⟳ 2026-09-11 · LOT E — `instructionWithCells` ET PLUS `instruction`. La
  // consigne de densité porte désormais, en plus, la CASE et les CASSEROLES de
  // chaque plat demandé (`cellBlock`): `repairInstruction` ne nommait les plats
  // que par leur titre, et le modèle a déplacé des plats d'une case à l'autre.
  // Ce que ce cas tient — « tout message de réparation passe par le même
  // assembleur, donc hérite du bloc de précédence en queue » — n'a pas bougé.
  assert(SRC.includes("householdRepairMessage(instructionWithCells)"), "la relance de densité ne passe plus par l'assembleur");
  assert(SRC.includes("householdRepairMessage(dedicatedInstruction)"), "l'entrée de dernier recours ne passe pas par l'assembleur");
  const appel = SRC.lastIndexOf("householdRepairMessage(instructionWithCells)");
  const tag = SRC.indexOf("density_repair", appel);
  assert(tag > appel && tag - appel < 2000, "et son appel est celui de `density_repair`");
});

Deno.test("⛔ CÂBLAGE ㉙ — les CINQ autres relances gardent leur assemblage", () => {
  // ⛔ LA CONTRE-ÉPREUVE, ET ELLE EST LA MOITIÉ QUI COMPTE. Le bloc de
  // précédence porte le plancher de sécurité du produit (allergies, régimes,
  // lignes médicales); sa place en queue est ce qui le rend opérant. On ajoute
  // UN chemin, pas une nouvelle règle d'assemblage.
  const attendus = [
    "proteinAnchorRetryInstruction(",
    "exclusionRetryInstruction(",
    "swapRetryInstruction(",
    "preferenceSplitRetryInstruction(",
    "unfedRetryInstruction(",
  ];
  for (const nom of attendus) {
    const i = SRC.indexOf(nom);
    assert(i > 0, `${nom} existe`);
  }
  // Les cinq passent encore par `householdUserMessage(\n\n${…})`.
  assertEquals(
    SRC.split("householdUserMessage(`\\n\\n${").length - 1,
    5,
    "cinq relances gardent l'assemblage d'origine",
  );
});

Deno.test("⛔ CÂBLAGE ㉗ — le plat revenu est apparié par la case ET par son porteur", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ AU TIR `BASCULE` DU 2026-09-08 (foyer `quatre`, 4 bouches)
  // ══════════════════════════════════════════════════════════════════════
  //
  // La garde d'identité de la réparation cherchait « le plat revenu dans cette
  // case » par la CASE SEULE. Sur le chemin d'une bouche il n'y a qu'un plat par
  // case et le `find` tombait juste. À la table, une case porte le plat COMMUN
  // **et** le plat DÉDIÉ, et leurs titres se ressemblent (« Ragoût de lentilles,
  // riz, citron » / « … riz, tofu »): on comparait les composants de l'un à
  // ceux de l'autre.
  //
  // Résultat mesuré: 2 cellules demandées, **4 plats refusés `title_changed`**,
  // 0 accepté, six assiettes sur douze restées hors bornes. Et les tirs
  // précédents ne passaient que par CHANCE, selon l'ordre où le modèle rendait
  // les deux plats d'une case.
  //
  // ⚠️ `for_member_id` FAIT PARTIE DE L'IDENTITÉ D'UN PLAT, pas seulement de son
  // attribution. C'est ce qui distingue deux plats d'une même case.
  const i = SRC.indexOf("const owner = meal.dishes[i].memberId ?? null;");
  assert(i > 0, "le porteur du plat réparé n'est plus lu");
  const bloc = SRC.slice(i, i + 900);
  assert(
    bloc.includes("(d.memberId ?? null) === owner"),
    "l'appariement ne compare plus les porteurs: un plat de table peut être relu comme le dédié de sa case",
  );

  // ⛔ ET LE JOURNAL DOIT APPARIER PAREIL, sans quoi il nommerait un autre plat
  // que celui qu'on vient de refuser — un compteur qui ment sur QUI a bougé.
  const j = SRC.indexOf("after: retried.dishes.find((d) =>");
  assert(j > 0, "le journal des titres ne cherche plus le plat revenu");
  assert(
    SRC.slice(j, j + 400).includes("(d.memberId ?? null) === (meal.dishes[i].memberId ?? null)"),
    "le journal apparie autrement que la garde",
  );
});

Deno.test("⛔ CÂBLAGE ㉘ — une réparation qui AVEUGLE le moteur est refusée, et le plan d'avant revient", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ AU TIR `IDENTITE` DU 2026-09-08 (foyer `quatre`)
  // ══════════════════════════════════════════════════════════════════════
  //
  // La réparation a rendu QUATRE COMPTEURS AU VERT: `over_max: 3 → 0`,
  // `still_out: 0`, `rejected` tout à zéro, `accepted: 2 / asked: 2`. Et le
  // plan était pire:
  //
  //     avant : { in_bounds: 9, over_max: 3, unmeasurable: 0 }
  //     après : { in_bounds: 4, over_max: 0, unmeasurable: 8 }
  //
  // Les trois assiettes qui dépassaient n'avaient pas été corrigées: elles
  // étaient devenues IMMESURABLES. Une assiette immesurable part au facteur 1,
  // c'est-à-dire à la recette du modèle telle quelle — 1 121 g au déjeuner.
  //
  // ⚠️ « MOINS DE DÉPASSEMENTS » N'EST PAS LE CRITÈRE. Le critère est: le
  // moteur peut-il encore PESER ce plat ?
  // ⟳ 2026-09-09 — LA CEINTURE D'EXCLUSION A REJOINT LES DEUX AUTRES MOTIFS.
  // Avant, `bitesOf` tournait 2 400 lignes plus haut, sur le plan d'AVANT la
  // réparation: un allergène que la réparation faisait entrer n'était vu par
  // personne, et `repairs.rejected.belt` valait toujours zéro — pas parce que
  // rien ne mordait, parce que personne ne regardait.
  const i = SRC.indexOf(
    "const blinded = unmeasAfter > unmeasBefore || degraded || bitAdded;",
  );
  assert(i > 0, "la réparation n'est plus jugée sur ce qu'elle rend mesurable");
  // ⟳ 2026-09-10 — PAR IDENTITÉ, PLUS PAR NOMBRE. `dishBitesExclusion` rend AU
  // PLUS UNE morsure par plat, donc `bitesOf(...).length` compte des PLATS
  // MORDUS: une substitution d'allergène — arachide retirée, gluten ajouté,
  // dans le même plat ou d'un plat à l'autre — laissait le compte INCHANGÉ et
  // passait la garde. On compare des ENSEMBLES de `(jour, moment, plat, terme,
  // règle)`, et toute morsure AJOUTÉE fait refuser, même si une autre a
  // disparu au même instant.
  assert(
    SRC.includes("const bitesBeforeRepair = biteKeys(meal as never);"),
    "la morsure d'AVANT est prise au même instant que les verdicts",
  );
  assert(
    SRC.includes("const bitesAfterRepair = biteKeys(meal as never);"),
    "la morsure d'APRÈS n'est plus prise sur l'état réparé",
  );
  assert(
    SRC.includes("const bitAdded = bitesAdded.length > 0;"),
    "on refuse ce que la réparation AJOUTE, pas une morsure héritée",
  );
  // ⛔ ET LA COMPARAISON EST BIEN UNE DIFFÉRENCE D'ENSEMBLES, pas un `>` sur
  // deux tailles: sans cette ligne, revenir à des cardinaux passerait inaperçu.
  assert(
    SRC.includes("!bitesBeforeRepair.has(k)"),
    "la comparaison est redevenue une comparaison de nombres",
  );
  assert(SRC.includes("if (bitAdded) repairs.rejected.belt++;"), "et c'est compté à part");
  // ⛔ LA FERMETURE EST HISSÉE, PAS RECOPIÉE. Une seconde détection d'allergène
  // écrite à côté finirait par diverger, et c'est celle qu'on regarde le moins
  // qui laisserait passer l'arachide.
  assertEquals(
    SRC.split("const bitesOf = (m: ParsedMeal) =>").length - 1,
    1,
    "une seule détection d'exclusion dans tout le fichier",
  );

  // ══════════════════════════════════════════════════════════════════════
  // ⛔ ET SUR CE QU'ELLE AMÉLIORE — MESURÉ AU TIR `MAXDENSITE` (2026-09-08)
  // ══════════════════════════════════════════════════════════════════════
  //
  //     avant : { in_bounds: 10, over_max: 2 }
  //     après : { in_bounds:  9, over_max: 3 }
  //
  // Aucun aveuglement, aucun refus, `accepted: 2` — et une assiette de plus
  // hors bornes. La garde d'aveuglement ne voyait rien: elle ne surveillait que
  // `unmeasurable`.
  assert(
    SRC.includes("const degraded = partBefore !== null && partAfter !== null &&"),
    "une réparation qui rend le plan moins bon est encore gardée",
  );
  // ⚠️ ON COMPARE DES PROPORTIONS, PAS DES COMPTES. Le nombre de lignes par
  // mangeur CHANGE quand la relance redistribue les plats — mesuré au tir
  // `INVARIANT`: 12 avant, 16 après. Comparer 10 à 9 sur des dénominateurs
  // différents ferait refuser des réparations qui aidaient.
  assert(
    SRC.includes("return total > 0 ? Number(v.in_bounds ?? 0) / total : null;"),
    "la comparaison porte sur des comptes bruts, pas sur des parts",
  );
  // ⛔ ET LES DEUX MOTIFS SE LISENT À PART: « a aveuglé » et « a rendu moins
  // bon » n'appellent pas la même correction.
  assert(SRC.includes("if (degraded) repairs.rejected.degraded++;"), "les deux motifs se confondent");

  // ⛔ IL FAUT UNE COPIE D'AVANT, sans quoi le refus est impossible à tenir.
  assert(
    SRC.lastIndexOf("dishes: structuredClone(meal.dishes),", i) > 0,
    "le plan d'avant n'est pas gardé: on ne pourrait que constater les dégâts",
  );
  const bloc = SRC.slice(i, i + 2600);
  assert(bloc.includes("meal.dishes.push(...(before.dishes"), "les plats ne reviennent pas");
  assert(
    bloc.includes("meal.preparations.push("),
    "les casseroles ne reviennent pas: le plan restauré citerait des recettes réécrites",
  );
  // ⚠️ ET LE TEXTE SOURCE AVEC EUX: `reconcilePortions` le relit, et le laisser
  // sur la relance réconcilierait les parts d'un plan qu'on vient de jeter.
  assert(
    bloc.includes("mealSourceText = before.sourceText;"),
    "le texte source reste sur la relance rejetée",
  );
  // ⟳ 2026-09-08 — ET LES DEUX CHAMPS QUE L'AUDIT A TROUVÉS. La fusion mute
  // `cooking_sessions` (défourchage) et `shopping_list` (réclamation des
  // termes) ; un refus qui ne les restaure pas sert les sessions et les courses
  // de la relance JETÉE sur les plats d'AVANT.
  assert(bloc.includes("meal.cooking_sessions = before.cookingSessions;"), "les sessions de cuisine restent celles de la relance jetée");
  assert(bloc.includes("meal.shopping_list = before.shoppingList;"), "la liste de courses reste celle de la relance jetée");
  assert(bloc.includes("repairs.rejected.unmeasurable ="), "le refus n'est pas compté");
  assert(bloc.includes("repairs.accepted = 0;"), "la réparation refusée compte encore comme acceptée");

  // ⛔ ET ON REMESURE LE PLAN RESTAURÉ. Garder la mesure d'après ferait SERVIR
  // le plan d'avant en JOURNALISANT celui d'après.
  assert(
    bloc.indexOf("const restored = shadowSizing();") > 0,
    "le plan restauré n'est pas remesuré: le journal décrirait un autre plan que celui servi",
  );
});

Deno.test("⛔ CÂBLAGE ㉙ — une casserole citée ne peut plus disparaître : on ne remplace que des INGRÉDIENTS, par identifiant", () => {
  // ⟳ RETOURNÉE LE 2026-09-08. Elle tenait le refus d'un plan dont un plat
  // citait une casserole absente — un artefact de la fusion de case, qui
  // renommait et retirait des casseroles. L'épissage ne touche ni aux `uses`
  // ni aux identifiants : une casserole réécrite garde son `id` et son
  // `servingsMade`, seuls ses ingrédients changent. Le compteur `missing_pot`
  // reste écrit, à zéro, pour que sa disparition se lise.
  const m = Deno.readTextFileSync(new URL("./retry_merge.ts", import.meta.url));
  const i = m.indexOf("export function spliceReworkableUnits(");
  const fn = m.slice(i, m.indexOf("\n}\n", i));
  assert(fn.includes("target.ingredients = structuredClone(fresh.ingredients);"), "la casserole n'est plus remplacée par ses seuls ingrédients");
  assert(!fn.includes(".id = "), "l'épissage renomme une casserole");
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT E — L'ÉPISSAGE LIT `uses`, ET C'EST LE CORRECTIF
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE CAS INTERDISAIT LE MOT `uses` DANS LA FONCTION. L'intention était
  // juste — « l'épissage ne touche pas aux citations de casseroles » — mais
  // l'épreuve était un `includes` de chaîne, et elle interdisait donc aussi de
  // les LIRE. Or ne pas les lire est très exactement le défaut mesuré: la
  // fusion appariait par case et copiait titre + méthode + ingrédients sans
  // regarder ce que le plat PUISE, et le plan GAIN `a18f522e` a été écrit avec
  // « Saumon avec couscous » posé sur `prep_lentil_ratatouille` — sans saumon.
  //
  // L'épreuve devient donc: l'épissage ne ÉCRIT jamais `uses`. Il les lit pour
  // refuser une case dont l'ensemble de casseroles a changé (`uses_mismatch`).
  assert(!/\.uses\s*=/.test(fn), "l'épissage ÉCRIT les citations de casseroles");
  assert(!/\buses:\s/.test(fn), "l'épissage compose un nouvel objet `uses`");
  assert(
    fn.includes("usesKeyOf(back) !== usesKeyOf(base)"),
    "l'épissage ne vérifie plus que le plat rendu puise les MÊMES casseroles",
  );
  assert(SRC.includes("missing_pot: 0"), "le compteur missing_pot n'est plus écrit");
});

Deno.test("⛔ CÂBLAGE ㉚ — un plat dédié ne peut plus être perdu : les autres plats d'une case ne sont jamais lus", () => {
  // ⟳ RETOURNÉE LE 2026-09-08. Elle tenait le refus d'une case revenue sans
  // son plat dédié (tir INVARIANT : la végane avait perdu son plat). Avec
  // l'épissage, les autres plats de la case ne sont jamais importés : le plat
  // dédié est celui de la base, octet pour octet. La clé `dedicated_lost`
  // reste écrite, à zéro.
  const D = SRC.indexOf("const runDensityRepair = async");
  const E = SRC.indexOf("      return merged;\n    };", D);
  const machinerie = SRC.slice(D, E);
  assert(!machinerie.includes("const porteursAttendus"), "la garde des porteurs est encore là : on importe donc encore des cases");
  assert(SRC.includes("dedicated_lost: 0"), "le compteur dedicated_lost n'est plus écrit");
  // ⛔ L'ÉPISSAGE N'ÉCRIT QUE SUR LE PLAT DEMANDÉ (`meal.dishes[ask.dishIndex]`).
  const m = Deno.readTextFileSync(new URL("./retry_merge.ts", import.meta.url));
  const i = m.indexOf("export function spliceReworkableUnits(");
  const fn = m.slice(i, m.indexOf("\n}\n", i));
  assert(fn.includes("const base = meal.dishes[ask.dishIndex];"), "l'épissage ne cible pas le plat demandé");
  assert(!fn.includes("meal.dishes.push(") && !fn.includes("meal.dishes = "), "l'épissage ajoute ou remplace des plats");
});

Deno.test("⛔ CÂBLAGE ㉛ — la table sert le facteur NU, et le journal le dit", () => {
  // ══════════════════════════════════════════════════════════════════════
  // LA DIVERGENCE ENTRE LES DEUX CHEMINS, RENDUE LISIBLE (2026-09-08)
  // ══════════════════════════════════════════════════════════════════════
  //
  // Le chemin d'UNE bouche sert `bounded.factor`: une assiette trop grosse est
  // rabotée et la personne perd les kcal correspondantes. La table sert
  // `r.factor` NU: la personne reçoit 100 % de sa cible, sur une assiette qui
  // peut dépasser la borne de masse.
  //
  // ⛔ ET `clamped` RESTAIT À ZÉRO SUR CE CHEMIN, structurellement — il n'est
  // incrémenté que dans la branche d'une bouche. On y lisait « aucune assiette
  // n'a eu besoin d'être rabotée » là où la phrase vraie est « aucune ne PEUT
  // l'être ici ».
  assertEquals(
    SRC.split("counters.clamped.max++").length - 1,
    1,
    "le rabotage est écrit à deux endroits, ou nulle part",
  );
  assert(
    SRC.includes("factor: bounded.factor,"),
    "le chemin d'une bouche ne sert plus le facteur raboté",
  );
  assert(
    SRC.includes("bounds_applied: false,") && SRC.includes("served_over_max: servedOverMax,"),
    "le journal de la table ne dit plus que la borne n'y est pas appliquée",
  );
  // ⚠️ ET LE CHIFFRE VIENT DE LA MESURE FINALE, pas d'un compteur d'avant
  // réparation: c'est le nombre d'assiettes RÉELLEMENT servies au-dessus.
  assert(
    SRC.includes("((measured.verdicts ?? {}) as Record<string, number>).over_max ?? 0,"),
    "le compte des assiettes trop grosses ne vient pas de la mesure finale",
  );
});

Deno.test("⛔ CÂBLAGE ㉜ — le FRAIS passe par la règle des mangeurs, il n'est plus réécrivable en dur", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ TROUVÉ LE 2026-09-08 EN RELISANT LA RÈGLE ÉCRITE PAR LE PROPRIÉTAIRE
  // ══════════════════════════════════════════════════════════════════════
  //
  // « Une unité, c'est soit les ingrédients frais d'un plat, soit une
  // casserole. Les deux se traitent pareil. » La lane ne traitait que les
  // casseroles: le frais était déclaré `freshRepairability: "reworkable"` EN
  // DUR, quelle que soit la table.
  //
  // Sur un plat partagé, le frais est mangé par tout le monde: le densifier
  // pour celui qui dépasse enrichit l'assiette de celui qui était dans ses
  // bornes, et celui-là ne le saura jamais — sa boîte est juste plus riche.
  // C'est très exactement le défaut que cette règle existe pour empêcher.
  assertEquals(
    SRC.split('freshRepairability: "reworkable" as const').length - 1,
    0,
    "le frais est encore déclaré réécrivable sans regarder qui le mange",
  );
  const i = SRC.indexOf("freshRepairability: (() => {");
  assert(i > 0, "le frais ne passe plus par la règle");
  const bloc = SRC.slice(i, i + 700);
  // ⚠️ SES MANGEURS SONT CEUX DU PLAT, ET RIEN D'AUTRE — c'est ce qui le
  // distingue d'une casserole, tirée par plusieurs plats et donc mangée par
  // leur union.
  assert(
    bloc.includes("repairabilityOf(freshUnitOf(verdictsOf(i)), ask.direction)"),
    "le frais n'est pas jugé sur les mangeurs de SON plat, dans la direction demandée",
  );
  // ⛔ ET C'EST COMPTÉ: sans compteur, « le frais est gelé » et « le frais n'a
  // jamais été testé » se relisent pareil dans le journal.
  assert(bloc.includes("repairs.fresh_frozen++"), "un gel de frais ne se compte pas");
  assert(SRC.includes("fresh_frozen: 0,"), "le compteur n'est pas écrit à zéro");

  // ⛔ UNE SEULE RÈGLE POUR LES DEUX SORTES D'UNITÉ. Le frais et la casserole
  // lisent `repairabilityOf`; une seconde rédaction divergerait au premier
  // ajustement, et c'est celle qu'on relit le moins qui écrirait les recettes.
  assert(
    SRC.includes("repairabilityOf(unit, direction).repairability === \"reworkable\""),
    "les casseroles ne passent plus par la même règle",
  );
});

Deno.test("⛔ CÂBLAGE ㉝ — la COMPOSITION du foyer garde son effort et son timeout propres", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ LE 2026-09-08, foyer `quatre`, même prompt, deux séries
  // ══════════════════════════════════════════════════════════════════════
  //
  //     medium   91 · 75 · 91 · 83 · 66 %   — réparation demandée à chaque tir
  //     high    100 · 100 %                 — AUCUNE réparation demandée
  //
  // Le compromis entre quatre personnes est ce que `high` sert.
  //
  // ⟳ 2026-09-10 — CE TEST A ÉTÉ RÉÉCRIT, ET LA MOITIÉ QU'IL ÉPINGLAIT A
  // CHANGÉ. Il disait « les relances restent à `medium` ». Elles sont passées
  // à `high` le même jour, parce qu'elles ont cessé d'être indépendantes: le
  // budget commun (`PLAN_MODEL_REPAIR_BUDGET = 2`) leur retire le droit de
  // rater. Ce qui reste vrai, et que ce test garde, c'est que la composition
  // du foyer a son effort et son timeout à elle. Le reste vit dans
  // `plan_call_wiring_test.ts`.
  const compo = SRC.indexOf('kind: "composition_household",');
  assert(compo > 0, "la composition ne part plus à l'effort qui lui est propre");
  assertEquals(
    SRC.split('kind: "composition_household",').length - 1,
    1,
    "l'effort de composition est lu à plusieurs sites : une relance l'a pris",
  );
  // ⛔ LE TIMEOUT SUIT L'EFFORT, AU MÊME SITE. 300 s laissait vingt secondes
  // de marge à un appel mesuré à 281 : un tir lent aurait échoué en silence
  // sous une allure de panne.
  const bloc = SRC.slice(compo, compo + 400);
  assert(
    bloc.includes(": PLAN_COMPOSITION_HTTP_TIMEOUT_MS,"),
    "la composition à `high` garde le timeout de `medium`",
  );
  // ⚠️ ET TOUS LES AUTRES APPELS SONT DES RATTRAPAGES.
  const autres = SRC.split('kind: "repair",').length - 1;
  assertEquals(autres, 7, `les sept rattrapages ne sont pas tous nommés (vu: ${autres})`);
});

Deno.test("⛔ CÂBLAGE ㉞ — l'ENTRÉE DE DERNIER RECOURS a un appelant, après la réparation, avant l'application", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ AU TIR FAST2 (2026-09-08) : le cas 5 de la règle des mangeurs
  // ══════════════════════════════════════════════════════════════════════
  //
  // Le dîner commun tirait trois casseroles partagées avec deux adultes dans
  // leurs bornes et n'avait aucun frais. On a demandé au modèle de le
  // densifier « par son frais et ses casseroles réécrivables » — il n'y avait
  // ni l'un ni l'autre — et il a cassé le plat. `dedicatedDishInstruction`
  // existait, testée, sans appelant.
  const call = SRC.indexOf("source: `${FN_NAME}.dedicated_repair`,");
  assert(call > 0, "l'entrée de dernier recours n'est pas appelée");
  assertEquals(SRC.split("source: `${FN_NAME}.dedicated_repair`,").length - 1, 1, "appelée deux fois");
  // ⛔ APRÈS la réparation de densité (acceptée, refusée ou absente), AVANT de
  // poser les grammes : un plat ajouté après l'application ne serait jamais pesé.
  assert(SRC.indexOf("await runDensityRepair(outOfBoundsN") < call, "appelée avant la réparation");
  assert(call < SRC.indexOf("const appliedN = applySizingForEaters({"), "appelée après l'application");
  // ⛔ SEULEMENT LES BLOQUÉS DU PLAN FINAL, nommés — pas un compte.
  assert(SRC.includes("residualStuck.push({ i, memberId, direction });"), "les bloqués ne sont pas listés");
  assert(SRC.includes("for (const { i, memberId, direction } of residualStuck)"), "la demande ne part pas des bloqués");
  // ⟳ RETOURNÉE LE 2026-09-09 : à la densité d'un COMPLÉMENT, pas d'une
  // assiette. `repairDecisionForDish` sur sa seule ligne rendait la densité
  // qu'il faudrait à l'assiette ENTIÈRE (cible ÷ plafond) ; pour une entrée
  // qui s'ajoute au plat partagé raboté, c'est `complementAskFor`.
  const bloc = SRC.slice(call - 6000, call);
  assert(bloc.includes("const ask = complementAskFor({"), "la densité demandée n'est pas celle d'un complément");
  assert(!bloc.includes("const solo = repairDecisionForDish({"), "la règle solo sur une ligne est revenue (assiette entière)");
  // ⛔ LA LISTE DES PORTEURS EST FERMÉE : ouverte d'exactement les nommés, pour
  // cette relecture seule, et le compte de plats dédiés suit.
  const after = SRC.slice(call, call + 12000);
  assert(after.includes("dishBearerIds: [...new Set([...eaterBudget.dishBearerIds, ...newBearers])],"), "le porteur nouveau serait refusé par le parseur");
  assert(after.includes("dedicatedDishesAsked: eaterBudget.dedicatedDishesAsked + dedicatedAsks.length,"), "le plafond de plats dédiés ne suit pas");
  // ⛔ SIX CHAMPS RESTAURÉS — les deux que l'audit du soir a trouvés compris.
  for (const f of ["dishes", "preparations", "emptySlots", "cookingSessions", "shoppingList", "sourceText"]) {
    assert(bloc.includes(`${f}: `) || after.includes(`${f}: `), `l'instantané ne porte pas ${f}`);
  }
  // `restoreSnap` est défini AVANT l'appel modèle : on cherche dans tout le
  // fichier, et `snap.` le distingue du revert de densité (`before.`).
  assert(SRC.includes("meal.cooking_sessions = snap.cookingSessions;") && SRC.includes("meal.shopping_list = snap.shoppingList;"), "le revert oublie sessions ou courses");
  // ⛔ ET LE JOURNAL LE PORTE, zéros compris.
  assert(SRC.includes("dedicated_repair: dedicated,"), "le journal ne porte pas l'entrée de dernier recours");
  // ⟳ 2026-09-08 — ON N'IMPORTE QUE LES PLATS AJOUTÉS, JAMAIS LA CASE. Mesuré
  // au tir CATCH3 : le modèle avait rendu la case sans le plat de la végane.
  assert(after.includes("const append = appendDedicatedDishes({"), "l'entrée de dernier recours fusionne encore la case entière");
  assert(!after.slice(0, after.indexOf("const appliedN")).includes("mergeRetryCells({ base: meal, retry: retried, cells: kept })"), "mergeRetryCells encore utilisé pour l'entrée de dernier recours");
  // ⟳ 2026-09-09 : `kept` — les plats ajoutés MOINS ceux retirés (impesable, insoluble).
  assert(after.includes("dedicated.accepted = kept;"), "l'acceptation ne compte pas les plats ajoutés gardés");
});


Deno.test("⛔ CÂBLAGE ㉟ — une casserole GELÉE réécrite n'est plus refusée : elle n'est jamais LUE", () => {
  // ⟳ RETOURNÉE LE 2026-09-08. Elle tenait le refus quand le modèle réécrivait
  // une casserole FROZEN (quatre tirs sur quatre). C'était une garde sur une
  // porte qu'on n'aurait jamais dû ouvrir : l'épissage ne lit que les
  // casseroles de `reworkablePotIds`. La version réécrite d'une gelée reste
  // dans la réponse, et personne ne la regarde.
  const D = SRC.indexOf("const runDensityRepair = async");
  const E = SRC.indexOf("      return merged;\n    };", D);
  const machinerie = SRC.slice(D, E);
  assert(!machinerie.includes("if (unfork.forked.length > 0) {"), "le refus de gel rompu est encore là : on lit donc encore les casseroles gelées");
  assert(SRC.includes("frozen_rewritten: 0"), "le compteur frozen_rewritten n'est plus écrit");
  const m = Deno.readTextFileSync(new URL("./retry_merge.ts", import.meta.url));
  const i = m.indexOf("export function spliceReworkableUnits(");
  const fn = m.slice(i, m.indexOf("\n}\n", i));
  assert(fn.includes("for (const id of ask.reworkablePotIds) {"), "l'épissage ne boucle pas sur les seules casseroles autorisées");
  assert(!fn.includes("retry.preparations.map((p) => p)") && !fn.includes("preparations = args.retry"), "l'épissage importe des casseroles non autorisées");
});

Deno.test("⛔ CÂBLAGE ㊱ — « bloqué » inclut le plat DÉJÀ réparé une fois sans effet", () => {
  // Mesuré au tir CATCH1 : le frais restait réécrivable à la lettre, mais le
  // budget d'une relance par plat était épuisé et l'assiette restait dehors.
  // Sans cette clause, l'entrée de dernier recours ne part jamais sur le cas
  // qui la justifie : « on a essayé, ça n'a pas suffi ».
  assert(SRC.includes("const dejaDemande = outOfBoundsN.some((x) => x.i === i);"), "un plat déjà demandé n'est pas reconnu");
  assert(SRC.includes("if ((!freshOk && !potsOk) || dejaDemande) {"), "le budget épuisé ne rend pas la personne bloquée");
});


Deno.test("⛔ CÂBLAGE ㊲ — une demande qu'on SAIT bloquée n'est pas envoyée au modèle", () => {
  // Mesuré au tir SPLICE3 : deux plats bloqués à la demande, 78 s d'appel pour
  // une consigne insatisfaisable, puis `no_cell`. Un bloqué va directement à
  // l'entrée de dernier recours.
  assert(SRC.includes("const askable = outOfBoundsN.filter((x) => !stuckAtAsk.has(x.i));"), "les bloqués sont encore demandés");
  assert(SRC.includes("await runDensityRepair(askable, (k) => ({"), "la réparation ne part pas des seuls demandables");
  assert(SRC.includes("repairs.skipped_stuck = stuckAtAsk.size;") && SRC.includes("skipped_stuck: 0,"), "les bloqués non demandés ne se comptent pas");
  // ⛔ ET UN PLAT AJOUTÉ QUI RATE SA CIBLE SE COMPTE : « accepté » ≠ « atteint ».
  assert(SRC.includes("if (miss) dedicated.missed_aim++;") && SRC.includes("missed_aim: 0,"), "un plat dédié qui rate sa cible passe pour réussi");
});

Deno.test("⛔ CÂBLAGE ㊳ — un plat de dernier recours IMPESABLE est retiré seul ; les autres plats ajoutés restent", () => {
  // Mesuré aux tirs T4 et T5 (2026-09-09) : deux plats ajoutés au nom de deux
  // personnes, l'un impesable, et le refus « en bloc » jetait aussi le bon. Des
  // plats ajoutés sont indépendants : on retire le seul impesable, on remesure,
  // et on juge le reste.
  const i = SRC.indexOf("const dropTitles = [...blindTitles].filter((t) => addedTitles.has(t));");
  assert(i > 0, "un plat ajouté impesable fait encore tout jeter");
  const bloc = SRC.slice(i, i + 1200);
  // ⟳ 2026-09-09 : `kept`, pas `append.added.length` — un complément qui ne
  // résout pas a pu être retiré avant, et le dénominateur doit le savoir.
  assert(bloc.includes("dropTitles.length < kept"), "le retrait partiel ne s'applique que s'il reste au moins un plat");
  assert(bloc.includes("meal.dishes = meal.dishes.filter((d) => !dropTitles.includes(String(d.title ?? \"\")));"), "le plat impesable n'est pas retiré");
  assert(bloc.includes("const again = shadowSizing();"), "le plan n'est pas remesuré après le retrait");
  assert(bloc.includes("dedicated_repair_partial"), "le retrait partiel n'est pas journalisé");
  // ⛔ ET LE JUGEMENT FINAL SE FAIT SUR LA MESURE D'APRÈS RETRAIT.
  assert(bloc.includes("const stillBlind = Number(vNow.unmeasurable ?? 0) > Number(snap.verdicts.unmeasurable ?? 0);"), "le verdict lit encore la mesure d'avant retrait");
});

Deno.test("⛔ CÂBLAGE ㊴ — le complément : la part gelée est RABOTÉE à la borne et l'entrée porte la différence", () => {
  // ⟳ 2026-09-09 — décision du propriétaire : « dans le cas où tout est gelé,
  // on diminue la portion et on ajoute de la calorie dans l'entrée ». Avant :
  // la table ne rabotait jamais, et le plat ajouté REMPLAÇAIT la personne à
  // la table, dimensionné à sa cible entière.
  // ① le drapeau atteint la grille : le porteur RESTE mangeur du plat partagé.
  assert(SRC.includes("complementsShared: d.complementsShared === true,"), "le drapeau n'atteint pas `eatersByDish`");
  // ② le partage d'assiette réécrit les deux lignes AVANT casseroles et couvercles.
  const split = SRC.indexOf("splitPlateWithComplement({");
  assert(split > 0, "le partage d'assiette n'est pas appelé");
  const potsAfter = SRC.indexOf("const list = potFactors.get(p.id) ?? [];");
  assert(potsAfter > split, "les casseroles sont lues avant le rabotage");
  const bloc = SRC.slice(split - 2000, split + 4000);
  assert(bloc.includes("if (!fed.complementByDish[c.i]) continue;"), "le passage ne part pas des compléments de la grille");
  assert(bloc.includes('Object.assign(sRow, { factor: split.sharedFactor, personCookedG: split.sharedG, verdict: "in_bounds", unmetKcal: 0 });'), "la part partagée n'est pas rabotée");
  assert(bloc.includes('Object.assign(cRow, { factor: split.complementFactor, personCookedG: split.complementG, verdict: "in_bounds", unmetKcal: 0 });'), "le complément n'est pas dimensionné à la différence");
  assert(bloc.includes("complement.unsolvable_titles.push("), "un complément qui ne résout pas n'est pas nommé");
  // ③ la lane RETIRE le complément qui ne résout pas, et remesure.
  const drop = SRC.indexOf("dedicated_repair_unsolvable");
  assert(drop > 0, "le complément insoluble n'est pas retiré");
  const dbloc = SRC.slice(drop - 1200, drop + 200);
  assert(dbloc.includes("dedicated.rejected.unsolvable += drop.length;"), "le retrait n'est pas compté");
  assert(dbloc.includes("after = shadowSizing();"), "le plan n'est pas remesuré après le retrait");
  // ④ la borne compte ENFIN à la table, pour les parts complétées.
  assert(SRC.includes("counters.clamped.max += dedicated.complement.clamped_max;"), "`clamped` reste structurellement à zéro");
  assert(SRC.includes("complement: { solved: 0, clamped_max: 0, clamped_min: 0, moved_kcal: 0, unsolvable_by: {} as Record<string, number> },"), "le journal ne porte pas le complément à zéro");
  assert(SRC.includes("tag: \"keel.household_meal.complement_unsolvable\","), "un complément insoluble n'est pas expliqué");
});

Deno.test("⛔ CÂBLAGE ㊵ — l'assiette TROP GROSSE passe avant, et « atteint sa cible » se lit sur le plat AJOUTÉ", () => {
  // Mesuré au tir COMP2 (2026-09-09) : le budget servait deux « trop petit »
  // dans l'ordre des plats et laissait 1 021 g à l'adulte en prise ; et
  // `missed_aim 2` était lu sur la densité du plat PARTAGÉ de la case.
  const sort = SRC.indexOf('(a.direction === "densify" ? 0 : 1) - (b.direction === "densify" ? 0 : 1)');
  const asks = SRC.indexOf("const stuckAsks = (() => {");
  assert(sort > 0 && asks > sort, "les bloqués ne sont pas triés « trop gros » d'abord avant la demande");
  const aim = SRC.indexOf("const title = addedNow.get(`${a.day}/${a.slot} ${a.memberId}`);");
  assert(aim > 0, "`missed_aim` ne cherche pas la ligne du plat ajouté");
  const bloc = SRC.slice(aim, aim + 600);
  assert(bloc.includes('String(x.dish_title ?? "") === title'), "`missed_aim` lit encore n'importe quelle ligne de la case");
  // ⛔ ET LA JOURNÉE COMPTE LA CIBLE UNE FOIS PAR MOMENT, pas une fois par plat.
  assert(SRC.includes("if (!fed.complementByDish[i]) {"), "la cible d'une personne complétée est comptée deux fois");
});

Deno.test("⛔ CÂBLAGE ㊶ — l'entrée ajoutée passe par le SAS DE REMPLISSAGE avant d'être mesurée", () => {
  // Mesuré au tir COMP6 (2026-09-09) : deux compléments sur trois jetés
  // `complement_unmeasurable:unknown_ingredient` (« comté », « chou blanc ») —
  // le remplissage avait tourné sur le plan composé, avant ces plats.
  const fill = SRC.indexOf("source: `${FN_NAME}.dedicated_repair_fill`,");
  assert(fill > 0, "les ingrédients de l'entrée ne passent pas par le sas");
  const append = SRC.indexOf("const append = appendDedicatedDishes({");
  const measure = SRC.indexOf("let after = shadowSizing();");
  assert(append < fill && fill < measure, "le sas ne tourne pas entre l'ajout et la mesure");
  const bloc = SRC.slice(fill - 1500, fill + 1400);
  assert(bloc.includes("absorbIndexInto(composition, filledIndex)"), "l'index réparé n'est pas absorbé en place");
  assert(bloc.includes("regramMeal(meal, composition);"), "l'entrée n'est pas repesée sur l'index réparé");
  assert(bloc.includes("d.complementsShared === true &&"), "le sas relit tout le plan au lieu des seuls plats ajoutés");
  assert(SRC.includes("fill_unknowns: null as number | null,"), "les inconnus restants ne sont pas journalisés");
});

Deno.test("⛔ CÂBLAGE ㊷ — la journée de CHAQUE bouche porte son pourcentage, sans nommer personne", () => {
  // Demande du propriétaire (2026-09-09) : « je veux le % par rapport aux
  // cibles caloriques sur chaque journée ». `within_5pct` dit combien de
  // bouches-jours tiennent, jamais de combien.
  assert(SRC.includes("per_mouth: [] as { day: string; eater_bucket: string; n: number; served: number; target: number; pct: number }[],"), "le journal ne porte pas le détail par bouche");
  const i = SRC.indexOf("dayKcal.per_mouth.push({");
  assert(i > 0, "le détail par bouche n'est jamais rempli");
  const bloc = SRC.slice(i - 700, i + 400);
  assert(bloc.includes("pct: Math.round((acc.engine / acc.target) * 1000) / 10,"), "le pourcentage n'est pas calculé");
  // ⛔ ET IL NE NOMME PERSONNE : un seau et un rang, jamais un `member_id`.
  assert(!bloc.includes("member_id: memberId") && !bloc.includes("memberId,\n"), "une ligne de journal porte un member_id");
  assert(bloc.includes("eater_bucket: bucket,") && bloc.includes("n,"), "le seau et le rang manquent");
});

Deno.test("⛔ CÂBLAGE ㉚ — le second essai, et il ne tourne jamais à vide", () => {
  // ⛔ MESURÉ SUR R1/R4/R7/R8/R10 (2026-09-10): `attempts: 2` avec `asked: 0`.
  // Aucun appel modèle n'était parti — le bloc de relance est gardé — mais le
  // compteur disait « il a fallu insister » sur un plan qui n'avait rien à
  // réparer. Un compteur qui ment sur un plan sain fait douter de celui qui
  // parle d'un plan malade.
  assertEquals(
    SRC.split("if (repairs.asked === 0) break;").length - 1,
    2,
    "les DEUX sites d'appel sortent quand il n'y a rien à demander",
  );
  // ⟳ 2026-09-10 — LE CRITÈRE D'ARRÊT A CHANGÉ SUR LA LANE D'UNE BOUCHE, et
  // c'est la correction qui compte. S'arrêter au premier SUCCÈS était le mauvais
  // critère: « accepté » veut dire « on garde la réécriture », pas « l'assiette
  // est rentrée dans ses bornes ». Mesuré sur les dix tirs du 2026-09-10: zéro
  // refus, donc le second appel ne partait jamais — alors que trois plans
  // gardaient un plat hors bornes. On reboucle désormais sur ce qui RESTE.
  assert(
    SRC.includes("if (horsBornes.length === 0) break;"),
    "la lane d'une bouche recalcule les demandes et s'arrête quand il n'en reste plus",
  );
  assert(
    SRC.includes("if (manqueTotal < REPAIR_RETRY_MIN_UNMET_KCAL) {"),
    "et elle ne rappelle pas le modèle pour un gramme (R5: 2 kcal sur 3 080)",
  );
  assert(SRC.includes("repairs.retry_skipped_small = Math.round(manqueTotal);"));
  // Le site de la table garde son arrêt au premier succès — sa remesure vit
  // dans un autre bloc, et la reboucler demande le refactoring nommé au
  // JOURNAL. À ne pas confondre avec un oubli.
  assert(SRC.includes("essai <= REPAIR_CALLS_PER_DISH && !repaired;"));
  // ⛔ ET LES REFUS DU PREMIER ESSAI SONT ARCHIVÉS, PAS EMPILÉS. Sans ça, un
  // plan réparé au second coup porterait « accepté » ET « title_changed », et
  // aucune requête ne saurait dire s'il a échoué.
  assertEquals(
    SRC.split("repairs.retried_after = { ...repairs.rejected };").length - 1,
    2,
  );
});

Deno.test("⛔ CÂBLAGE ㉛ — le référentiel se complète sur les DEUX lanes", () => {
  // ⛔ DÉCISION DU PROPRIÉTAIRE: « de la même manière que quand on génère un
  // plan, il devrait y avoir le système qui permet de faire un appel IA et de
  // l'ajouter au référentiel ». Le sas existait — 1 600 lignes plus haut, sur
  // le plan initial. La réparation écrit de la nourriture APRÈS lui.
  //
  // ⚠️ ET IL A D'ABORD ÉTÉ CÂBLÉ SUR UNE SEULE LANE. Mesuré `fill_absorbed:
  // null` sur les dix tirs solo du 2026-09-10, réparations acceptées comprises.
  assertEquals(
    SRC.split('source: `${FN_NAME}.density_repair_fill`').length - 1,
    2,
    "le sas tourne sur le site de la table ET sur celui d'une bouche",
  );
  // ⛔ ON ABSORBE, ON NE RÉASSIGNE PAS: `composition` est fermée dans une
  // dizaine de fermetures créées plus haut.
  assertEquals(
    SRC.split("absorbIndexInto(composition,").length - 1,
    3,
    "les deux réparations + l'entrée de dernier recours",
  );
  // ⚠️ UNE SEULE RÉASSIGNATION DE `composition`, ET ELLE EST LÉGITIME: le sas
  // du plan initial tourne AVANT que `shadowSizing` et les demandes ne ferment
  // la variable. Les deux réparations, elles, tournent après — d'où
  // `absorbIndexInto`. Ce test refuse une SECONDE réassignation, qui ferait
  // perdre son rétrécissement à toutes les fermetures créées entre-temps.
  const reassignations = SRC.split("composition = filled").length - 1;
  assertEquals(reassignations, 1, "seul le sas du plan initial réassigne");
  assert(
    SRC.indexOf("composition = filledComposition.index;") <
      SRC.indexOf("const shadowSizing"),
    "et il le fait AVANT la première fermeture",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · LOT B — LE CONTRAT EST CONSTRUIT AVANT LE PROMPT, ET RELU
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ CÂBLAGE ㉓ — le contrat d'une case est construit AVANT le prompt", () => {
  // ⛔ LE DÉFAUT QUE CECI ÉPINGLE, MESURÉ LE 2026-09-11. La même case recevait
  // DEUX budgets — `PERTE / 2026-09-11 / dinner` valait **858,90 kcal** pour
  // `measureDish` et **2 454,00** pour le couloir du prompt, facteur **2,86** —
  // parce que les deux moitiés appelaient `slotPlanTargets` de leur côté, avec
  // deux dénominateurs différents.
  const construit = SRC.indexOf("const contracts = slotContractsFor({");
  assert(construit > 0, "le contrat n'est plus construit");
  const prompt = SRC.indexOf("const householdPromptInput");
  assert(prompt > 0, "l'entrée du prompt a disparu");
  assert(construit < prompt, "le contrat est construit APRÈS le prompt");
  // ⛔ ET C'EST LE CONTRAT QUI ALIMENTE LA CARTE, pas un second calcul.
  assert(
    SRC.includes("requiredDensityFromContracts(contracts, {"),
    "la densité de la carte ne descend plus du contrat",
  );
});

Deno.test("⛔ CÂBLAGE ㉔ — les DEUX sites de dimensionnement relisent le contrat", () => {
  // ⛔ DEUX SITES, ET C'EST LE PIÈGE DE CE FICHIER: `measureDish` (une bouche)
  // et le bloc `atDish` (N ≥ 2) portaient LA MÊME écriture fautive, ligne 11994
  // et ligne 8217. Réparer l'un et pas l'autre laisserait la moitié du produit
  // avec deux budgets par case.
  assertEquals(
    SRC.split("const contract = contractAt(").length - 1,
    2,
    "les deux sites de dimensionnement ne lisent pas le contrat",
  );
  // ⛔ ET LA CIBLE VIENT DE LUI. Un `contractAt` appelé sans être lu serait le
  // patron `optional-gate-params-are-disarmed-gates` sur un lot entier.
  assertEquals(
    SRC.split("? contract.composeKcal").length - 1,
    2,
    "un site lit encore sa propre arithmétique de part",
  );
  // ⛔ ET LES BORNES AUSSI: les recalculer ferait deux écritures d'une même
  // décision, et c'est celle qu'on relit le moins qui garderait l'ancienne règle.
  assertEquals(
    SRC.split("contract?.bounds ?? plateBoundsFor({").length - 1,
    2,
    "un site recalcule ses bornes au lieu de lire celles du contrat",
  );
  // ⚠️ ET LE REPLI EST COMPTÉ. Une case composée hors grille n'a pas de
  // contrat: son budget sort d'un calcul local, et `contract_missing` le dit.
  assert(SRC.includes("contract_missing: contractMisses.size"));
  assert(SRC.includes("contract_missing: contractMissesAtTable.size"));
});

Deno.test("⛔ CÂBLAGE ㉕ — le rythme d'une journée s'écrit UNE fois, et il a son repli", () => {
  // ⛔ LA RÈGLE : « rien de déclaré » vaut les TROIS REPAS DE LA MAISON, jamais
  // la grille. Elle était recopiée à la main, et deux sites l'oubliaient — d'où
  // la journée entière servie au dernier repas restant.
  assertEquals(
    SRC.split("...(declaredSlots.length > 0 ? declaredSlots : composedSlots)").length - 1,
    0,
    "un site déduit encore le rythme de ce qui a été composé",
  );
  assertEquals(
    SRC.split("...(p.declaredSlots.length > 0 ? p.declaredSlots : composedSlots)").length - 1,
    0,
    "le site à N bouches déduit encore le rythme de ce qui a été composé",
  );
  // ⛔ ET LES DEUX REPLIS PASSENT PAR `wholeDaySlots`.
  assertEquals(SRC.split("wholeDaySlots(").length - 1, 2);
});
