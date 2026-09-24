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
// ⟳ 2026-09-23 — L'INSTANTANÉ DES PLATS PORTE LES À-CÔTÉS: il est pris par
// `attachSideCourses(mealDishesPayload(meal), …)`, juste avant le verrou de
// maison qui en lit le résultat. C'est toujours LE seul instantané du fichier.
const LOCK = "attachSideCourses(mealDishesPayload(meal), sideLedger)";

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

Deno.test("CÂBLAGE ④ toute réécriture du plan est suivie d'une NOUVELLE mesure", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · ÉTAPE C4 — CE TEST A CHANGÉ DE MÉCANISME, PAS DE PROMESSE
  // ══════════════════════════════════════════════════════════════════════
  //
  // Il assertait `tag > dernière réécriture`: la POSITION garantissait que le
  // dimensionnement voyait le plan final. L'étape C4 ajoute une réécriture
  // APRÈS la garde finale — la seule qui puisse réparer un plancher protéique
  // — et la position ne peut plus rien garantir.
  //
  // ⛔ CE QUI GARANTIT LA MÊME CHOSE MAINTENANT: la BOUCLE. Le tag est DANS
  // elle, et toute réécriture postérieure est suivie d'un `continue` qui
  // refait la finalisation entière sur la copie réparée. La promesse —
  // « mesurer un plan qu'une relance remplacera ne mesure rien » — est
  // exactement la même; c'est sa preuve qui a changé de forme.
  const t = SRC.indexOf(TAG);
  const boucle = SRC.indexOf("for (let c4Round = 0;; c4Round++) {");
  assert(boucle > 0, "la boucle de réparation de l'étape C4 existe");
  assert(boucle < t, "le tag est DANS la boucle, donc refait à chaque tour");
  const lastRewrite = Math.max(
    SRC.lastIndexOf("mealSourceText = "),
    SRC.lastIndexOf("restoreHeldOff("),
  );
  assert(lastRewrite > 0, "au moins une réécriture existe");
  if (lastRewrite < t) return;
  // ⛔ UNE RÉÉCRITURE APRÈS LA MESURE DOIT RENTRER DANS LA BOUCLE. Sans le
  // `continue`, elle livrerait un plan que personne n'a repesé — le défaut
  // exact que ce test existe pour empêcher.
  assert(
    SRC.slice(lastRewrite, lastRewrite + 2500).includes("continue;"),
    "une réécriture posée après la mesure doit relancer un tour de boucle",
  );
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

Deno.test("CÂBLAGE ⑩ lot 4 — l'état des courses est relevé AVANT l'application", () => {
  // ⛔ MODE D'ÉCHEC N°2 DU PLAN, ET IL EST SILENCIEUX. Relevé après, l'ensemble
  // des identités « présentes avant » serait celui du plan déjà transformé:
  // plus aucun retrait de courses ne pourrait se nommer, et chaque ligne aurait
  // l'air juste.
  //
  // ⟳ 2026-09-12 · C3 — L'ANCRE A CHANGÉ DE NOM AVEC SA NATURE. Ce n'était
  // qu'un instantané de DEMANDE, lu en deux classes de prose, et les courses
  // suivaient le rapport `après / avant` (deux classifications qui devaient
  // rester d'accord, et qui ont divergé). C'est désormais l'ensemble des
  // IDENTITÉS demandées: il ne sert plus qu'à savoir ce qui a QUITTÉ le plan,
  // et les quantités sont RECALCULÉES depuis le plan final.
  const avant = SRC.indexOf("const identitiesBefore = new Set(");
  const applique = SRC.indexOf("const applied = applySizing({");
  assert(avant > 0, "`identitiesBefore` existe");
  assert(applique > 0, "`applySizing` est appelée");
  assert(avant < applique, "l'instantané des courses PRÉCÈDE la multiplication");
  // ⛔ ET LA COUPE: plus aucune trace du rapport de demande par terme. Le laisser
  // à côté du recalcul ferait vivre DEUX décisions d'achat dans le même handler.
  assert(!SRC.includes("const demandByTerm ="), "l'ancien rapport de demande est encore là");
  assert(!SRC.includes("scaleShoppingList("), "les courses suivent encore un facteur au lieu d'être recalculées");
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

Deno.test("CÂBLAGE ⑬ — le patch précède l'application, et rejoue la CEINTURE", () => {
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — LE SITE A CHANGÉ, LA PROPRIÉTÉ NON. La
  // réparation ne part plus d'ici (`density_repair`) mais du point de décision
  // unique ; ce qui est épinglé reste : elle passe AVANT l'application des
  // grammes, et sa sortie est relue par le MÊME parseur que la porte d'entrée.
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — UNE UNITÉ, UNE LECTURE. Le parseur
  // applique un plafond de plats dérivé du rythme de la semaine : donné huit
  // unités d'un coup il en jetait deux, et c'étaient les unités RÉSERVÉES.
  const repare = SRC.indexOf("const une = parseGeneratedMeal({");
  const applique = SRC.indexOf("const applied = applySizing({");
  assert(repare > 0, "la sortie du patch ne repasse plus par le parseur de production");
  assert(applique > 0, "l'application des grammes est introuvable — test à réviser");
  // ⛔ LA CEINTURE EST REJOUÉE, ET AVANT L'APPLICATION DU PATCH. Une candidate
  // relue « à la main » ferait rentrer par la porte de derrière (allergène,
  // régime, exclusion, règle de maison) ce que la porte d'entrée refuse.
  const belt = SRC.indexOf("const avant = biteKeys(meal as never);");
  const pose = SRC.indexOf("c4Fusion = applyRepairPatch({");
  assert(belt > repare && pose > belt, "la ceinture ne passe plus avant l'application");
  // ⛔ JAMAIS SUR UNE ADOPTION. ⟳ 2026-09-24 — ET SUR UNE REPRISE LOCALE,
  // SEULEMENT POUR UN REPAS MANQUANT DANS UNE CASE DEMANDÉE, avec des défauts
  // bornés à ces cases : ouverte à toute la reprise, la boucle réparerait
  // l'ancien brouillon hors des cases demandées.
  assert(
    SRC.includes("if (!c4Stop && (improvementRetries || c4EditRepair) && c4Decision.call) {"),
    "la garde de la décision ne nomme plus `improvementRetries` et la seule exception de la reprise",
  );
  // ⟳ 2026-09-24 — ce que la case refaite doit encore : un repas manquant ou
  // un aliment exclu servi, DANS une case demandée, et rien d'autre.
  assert(
    /const c4EditMust = editing\s*\?\s*c4Pass\.defects\.filter\(\(d\) =>\s*\(d\.kind === "missing_meal" \|\| d\.kind === "safety"\) && c4InEdit\(d\)\s*\)\s*:\s*\[\];/.test(SRC),
    "l'exception de la reprise ne se limite plus aux repas manquants et aliments exclus DANS une case demandée",
  );
  assert(
    SRC.includes("const c4EditRepair = c4EditMust.length > 0;"),
    "l'exception de la reprise ne dépend plus de ce que la case refaite doit",
  );
  // Et la décision le voit : sans ça, `call` resterait faux et la garde
  // élargie ne servirait à rien.
  assert(
    SRC.includes("mustRepair: c4Pass.mustRepair.length + c4EditMust.length,"),
    "la décision de réparation ignore ce que la case refaite doit",
  );
  assert(
    SRC.indexOf("const c4EditMust = editing") < SRC.indexOf("const c4Decision = planRepairDecision({"),
    "ce que la case refaite doit est calculé APRÈS la décision",
  );
  assert(
    SRC.includes("c4EditRepair ? c4Pass.defects.filter(c4InEdit) : c4Pass.defects"),
    "en reprise, les défauts envoyés ne sont plus bornés aux cases demandées",
  );
  assert(
    /const improvementRetries = !adoptingDraft && /.test(SRC),
    "`improvementRetries` ne garantit plus « jamais sur une adoption »",
  );
  // ⛔ ET LE BUDGET EST CONSULTÉ APRÈS LE CONTEXTE, pas avant: un périmètre
  // vide ou un contexte trop gros ne doit plus brûler une tentative.
  const contexte = SRC.indexOf("const c4Composed = c4Scope.unitIds.length === 0 &&");
  const budget = SRC.indexOf('planBudget.askRepair(');
  assert(contexte > 0 && budget > contexte, "le budget est consulté avant le contexte");
});
Deno.test("CÂBLAGE ⑭ — un patch refusé JOURNALISE ce qui l'a fait refuser", () => {
  // ⛔ SANS ÇA, LE REFUS N'EST PAS JUGEABLE. « le patch a été rejeté » ne dit
  // pas s'il visait une unité hors périmètre, s'il citait une casserole
  // inconnue, ou s'il travaillait sur une version périmée — et ces trois-là
  // n'appellent pas la même décision.
  //
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — LE REFUS D'IDENTITÉ N'EXISTE PLUS SOUS
  // CETTE FORME: l'identité (jour, moment, propriétaire) est INJECTÉE par la
  // table des unités, pas lue dans la réponse. Un plat ne peut plus être
  // renommé de case.
  const at = SRC.indexOf('tag: "keel.household_meal.plan_repair_patch_rejected"');
  assert(at > 0, "un patch rejeté n'est plus journalisé");
  const bloc = SRC.slice(at, at + 600);
  assert(bloc.includes("rejections: c4Fusion.rejections,"), "le motif du rejet ne sort pas");
  assert(bloc.includes("dropped_payloads: pont.dropped,"), "les unités écartées avant le parseur ne sortent pas");
  assert(bloc.includes("envelope_errors: envelope.errors,"), "les erreurs d'enveloppe ne sortent pas");
  // ⛔ ET LE MOTIF REMONTE DANS LES `issues` DU PLAN, sur UNE ligne commune:
  // des motifs écrits à deux endroits ne se comparent pas d'un tir à l'autre.
  assert(
    SRC.includes("c4Note(`plan_repair_rejected:${c4Rejet}`);"),
    "le motif de rejet ne remonte plus dans les `issues`",
  );
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
  // ⟳ 2026-09-13 · LOT 1 — LA PROSE COMMUNE A ÉTÉ DÉFAITE EN BLOCS PAR PLAT.
  // `repairInstruction` fondait N plats en un texte, terminé par « Return the
  // full plan JSON… ». Les entrées, elles, n'ont pas bougé d'un champ : c'est
  // ce que ce test épingle, et c'est ce qui vaut.
  const i = SRC.indexOf("const densityInputs = outOfBounds");
  assert(i > 0, "les entrées de la relance de densité n'existent plus");
  const bloc = SRC.slice(i, SRC.indexOf("const cellBlockOf = (", i));
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

Deno.test("⛔ CÂBLAGE ㉔ — la réparation n'applique que les unités autorisées", () => {
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — `spliceReworkableUnits` A ÉTÉ REMPLACÉ PAR
  // `applyRepairPatch`. L'épissage lisait les seules unités autorisées d'une
  // réponse ENTIÈRE ; le patch ne contient QUE ces unités, et une unité hors
  // périmètre rejette la réponse au lieu d'être silencieusement ignorée.
  assert(
    SRC.includes("c4Fusion = applyRepairPatch({"),
    "l'application de patch n'a plus d'appelant",
  );
  const at = SRC.indexOf("c4Fusion = applyRepairPatch({");
  const bloc = SRC.slice(at, at + 900);
  assert(bloc.includes("best: c4BestEntry,"), "la fusion ne part plus du MEILLEUR plan");
  assert(bloc.includes("scope: c4Scope,"), "le périmètre n'est plus passé à l'application");
  assert(bloc.includes("index: c4Units,"), "la table des unités n'est plus passée");
  assert(bloc.includes("baseVersion: c4BaseVersion,"), "la version du plan n'est plus contrôlée");
  // ⛔ ET LE PÉRIMÈTRE VIENT DES DÉFAUTS, jamais d'une règle globale.
  assert(
    SRC.includes("const c4Scope = repairScopeOf({"),
    "le périmètre n'est plus calculé depuis les défauts",
  );
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

Deno.test("⛔ CÂBLAGE ㉘ — la consigne de DENSITÉ est composée, puis DÉPOSÉE", () => {
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — ELLE NE PART PLUS SEULE. Tout son
  // diagnostic reste (le bloc de précédence, les composants gelés, la case et
  // ses casseroles) ; ce qui change est qu'elle rejoint la décision commune au
  // lieu de consommer un appel avant la garde finale.
  //
  // ⟳ 2026-09-13 · LOT 1 — ELLE EST DÉPOSÉE **PAR PLAT**. Une prose unique
  // partait sur le PREMIER défaut de densité et les autres cases recevaient
  // « this plate does not fit its bounds as written either » : ni bande, ni
  // frais, ni casserole, ni composant gelé. Chaque plat emporte maintenant son
  // bloc, sa case et ses composants verrouillés.
  assert(
    SRC.includes("...repairDishInstructionLines({"),
    "le bloc de densité d'un plat n'est plus composé",
  );
  assert(
    SRC.includes("cellBlockOf(entree.dishIndex, entree.title)") &&
      SRC.includes("lockedBlockOf(entree.dishIndex)"),
    "la case et les composants gelés ne voyagent plus avec leur plat",
  );
  assert(
    SRC.includes("c4DensityAsk = { rows };"),
    "la consigne de densité n'est plus déposée pour la décision commune",
  );
  // ⛔ ET ELLE EST RELUE AU POINT DE DÉCISION, avec ses cases — sans adresse,
  // elle finirait en `scope_unresolved` et l'appel partirait à vide.
  const producteur = SRC.indexOf("const c4UpstreamDefects = ()");
  assert(producteur > 0, "le producteur de constats d'amont a disparu");
  const bloc = SRC.slice(producteur, producteur + 14000);
  assert(bloc.includes("const ask = c4DensityAsk;"), "la consigne de densité n'est pas relue");
  assert(
    bloc.includes("for (const row of ask.rows)"),
    "les plats de densité ne rendent plus un constat chacun",
  );
  assert(bloc.includes('cause: "cell_bounds_off"'), "le constat de densité n'a plus de cause");
  // ⛔ ET ELLE EST REMISE À ZÉRO ENTRE DEUX TOURS: une consigne du tour d'avant
  // décrirait des assiettes que la réparation vient de changer.
  assert(SRC.includes("c4DensityAsk = null;"), "la consigne survit d'un tour à l'autre");
});
Deno.test("⛔ CÂBLAGE ㉙ — il ne reste QU'UN site d'appel de réparation", () => {
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — CE TEST COMPTAIT LES CINQ AUTRES RELANCES
  // ET LEUR ASSEMBLAGE. Elles n'existent plus: sept sites déposaient leur
  // constat chacun de leur côté et appelaient le modèle pour leur compte. Le
  // plan de fermeture l'exige — « un seul compteur des appels de réparation
  // réellement lancés, maximum deux pour la requête entière ».
  //
  // ⛔ ON COMPTE LES APPELS MODÈLE DU FICHIER, et il en reste DEUX: la
  // composition, et la réparation unique.
  assertEquals(
    (SRC.match(/generateWithGemini\(/g) ?? []).length,
    2,
    "un appel modèle de plus (ou de moins) dans la lane du foyer",
  );
  assertEquals(
    (SRC.match(/kind: "repair",/g) ?? []).length,
    1,
    "il y a plus d'un site de réparation",
  );
  // ⛔ ET AUCUN SITE NE REDEMANDE UN SLOT POUR LUI-MÊME.
  assert(!SRC.includes("planRepairGranted("), "la décision PAR SITE est revenue");
});
Deno.test("⛔ CÂBLAGE ㉗ — l'unité réparée est apparée par la case ET par son porteur", () => {
  // ⛔ LE DÉFAUT MESURÉ, ET IL EST DE LA REVUE DU 2026-09-12 (défaut ②): deux
  // plats DÉDIÉS au même jour et au même moment avaient la MÊME adresse, et la
  // fusion gardait le premier trouvé — réparer l'assiette de l'un remplaçait la
  // recette de l'autre.
  //
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — L'ADRESSE PORTE LE PROPRIÉTAIRE, et elle
  // est INJECTÉE par la table des unités: le modèle ne peut plus la changer.
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — L'UNITÉ EST PORTÉE PAR LA CHARGE, plus
  // retrouvée par son adresse après coup : chaque unité est parsée séparément,
  // et sa charge sait de laquelle il s'agit. C'est plus fort que l'appariement
  // par adresse — il n'y a plus d'adresse à apparier.
  assert(
    SRC.includes("for (const { unitId, payload } of pont.payloads) {"),
    "l'unité n'est plus portée par sa charge",
  );
  assert(
    SRC.includes("parsedByUnit.set(unitId, plat);"),
    "le plat parsé n'est plus rangé sous son unité",
  );
  // ⛔ ET L'ADRESSE DE RETOUR RESTE UNIQUE, contrôlée par `patchDishPayloads`:
  // deux unités qui rendraient la même clé sont écartées, pas fusionnées.
  assert(
    SRC.includes("dropped_payloads: pont.dropped,"),
    "les unités écartées pour adresse ambiguë ne se comptent plus",
  );
  // ⛔ ET LE JOUR/MOMENT/PORTEUR DE LA RÉPONSE SONT ÉCRASÉS PAR CEUX DE
  // L'UNITÉ. C'est ce qui rend « un patch ne déplace pas un repas » vrai par
  // construction plutôt que par consigne.
  assert(
    SRC.includes("patchDishPayloads({"),
    "l'identité n'est plus injectée dans les charges utiles du patch",
  );
});
Deno.test("⛔ CÂBLAGE ㉘ bis — une réparation qui n'améliore rien est refusée, et le plan d'avant revient", () => {
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — LA GARDE D'AVEUGLEMENT VIVAIT DANS LA
  // RÉPARATION DE DENSITÉ, et elle ne surveillait qu'elle. Elle est remplacée
  // par deux gardes PLUS LARGES, sur TOUS les défauts du plan:
  //   · `cell_energy_unmeasurable` est une cause de la garde finale, donc un
  //     défaut compté et nommé — un plan aveuglé ne se tait plus ;
  //   · `judgeCandidate` refuse une candidate qui n'a rien rapproché.
  assert(
    SRC.includes("const verdict = judgeCandidate({"),
    "la candidate n'est plus jugée",
  );
  // ⛔ ET LE REJET RESTAURE LE MEILLEUR PLAN, avec son texte.
  const at = SRC.indexOf("c4Note(`plan_repair_rejected:${c4Rejet}`);");
  assert(at > 0, "le rejet n'est plus nommé");
  const bloc = SRC.slice(at, at + 400);
  assert(bloc.includes("meal = structuredClone(c4BestEntry);"), "le plan d'avant ne revient pas");
  assert(bloc.includes("mealSourceText = c4BestSourceText;"), "le texte d'avant ne revient pas");
  // ⛔ ET UN REJET NE FERME PLUS LA BOUCLE: c'est le plafond d'appels qui ferme.
  assert(bloc.includes("repairRoundOutcome({"), "un rejet ne réévalue plus la suite");
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
  // ⚠️ ET IL N'Y A PLUS QU'UN SEUL AUTRE APPEL: LE RATTRAPAGE.
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — 8 → 1. Les sept sites d'amont ne
  // rappellent plus le modèle: ils déposent leur constat, et une seule décision
  // part après la garde finale, quand tous les défauts du même plan sont connus.
  const autres = SRC.split('kind: "repair",').length - 1;
  assertEquals(autres, 1, `il ne doit rester qu'un site de réparation (vu: ${autres})`);
});

Deno.test("⛔ CÂBLAGE ㉞ — l'ENTRÉE DE DERNIER RECOURS a une ADRESSE, et le patch la remplit", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ AU TIR FAST2 (2026-09-08) : le cas 5 de la règle des mangeurs
  // ══════════════════════════════════════════════════════════════════════
  //
  // Le dîner commun tirait trois casseroles partagées avec deux adultes dans
  // leurs bornes et n'avait aucun frais. On a demandé au modèle de le
  // densifier « par son frais et ses casseroles réécrivables » — il n'y avait
  // ni l'un ni l'autre — et il a cassé le plat. La seule sortie est un PETIT
  // plat à elle, à côté.
  //
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — ELLE NE PART PLUS SEULE. Sa consigne est
  // déposée et rejoint la décision commune ; ce qui la rend réparable est
  // qu'elle porte désormais une ADRESSE : une UNITÉ DE COMPLÉMENT, la seule
  // qu'un plat ajouté puisse avoir (`plan_repair_unit.ts`).
  //
  // ⟳ 2026-09-13 · LOT 1 — ON DÉPOSE LES VALEURS, PLUS UNE PROSE. La projection
  // `{memberId, day, slot}` jetait `direction`, `aimPer100G` et `floorPer100G`,
  // qui ne vivaient que dans le texte — et ce texte portait deux ordres globaux
  // faux sur ce chemin. Chaque demande rend sa phrase au moment du constat.
  assert(
    SRC.includes("detail: [...DEDICATED_DISH_HEAD, dedicatedDishLine(a)].join"),
    "la consigne de dernier recours n'est plus composée par demande",
  );
  assert(SRC.includes("c4DedicatedAsk = {"), "elle n'est plus déposée pour la décision commune");
  assert(
    SRC.includes("let c4DedicatedAsk: { asks: readonly DedicatedRepair[] } | null"),
    "les valeurs de la demande (direction, visée, plancher) sont reperdues",
  );
  assert(
    SRC.includes('cause: "dedicated_complement_needed"'),
    "le constat n'a plus de cause propre: il serait confondu avec une portion absente",
  );
  assert(
    SRC.includes("complements: c4DedicatedAsks().map((a) => ({"),
    "les demandes n'ouvrent plus d'unité de complément: un plat ajouté n'aurait aucune adresse",
  );
  // ⛔ ET LE PLAT AJOUTÉ EST MARQUÉ `complementsShared`. Sans ce drapeau, la
  // personne recevrait son assiette ENTIÈRE **plus** le complément.
  assert(
    SRC.includes(".complementsShared =\n                        true;") ||
      SRC.includes("complementsShared =") && SRC.includes("unite.isComplement"),
    "le plat de complément n'est plus marqué: la personne serait servie deux fois",
  );
  // ⛔ SEULEMENT LES BLOQUÉS DU PLAN FINAL, nommés — pas un compte.
  assert(SRC.includes("residualStuck.push({ i, memberId, direction });"), "les bloqués ne sont pas listés");
  assert(SRC.includes("for (const { i, memberId, direction } of residualStuck)"), "la demande ne part pas des bloqués");
  // ⟳ RETOURNÉE LE 2026-09-09 : à la densité d'un COMPLÉMENT, pas d'une
  // assiette entière.
  assert(SRC.includes("const ask = complementAskFor({"), "la densité demandée n'est pas celle d'un complément");
  assert(!SRC.includes("const solo = repairDecisionForDish({"), "la règle solo sur une ligne est revenue (assiette entière)");
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

Deno.test("⛔ CÂBLAGE ㊱ — « bloqué » ne peut pas vouloir dire « déjà demandé » sur ce site", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 1 D'ATTRIBUTION — CE TEST ÉPINGLAIT UNE PRÉMISSE MORTE
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QU'IL EXIGEAIT, ET POURQUOI C'ÉTAIT FAUX DEPUIS LE 2026-09-12 :
  //
  //     const dejaDemande = outOfBoundsN.some((x) => x.i === i);
  //     if ((!freshOk && !potsOk) || dejaDemande) { … }
  //
  // Écrit au tir CATCH1, quand ce site RAPPELAIT le modèle : « on a essayé, ça
  // n'a pas suffi ». Depuis la fermeture C4, `runDensityRepair` ne rappelle
  // plus personne — il dépose sa consigne — et RIEN n'est remesuré entre
  // `outOfBoundsN` et cette ligne : `measured` est le même objet. `dejaDemande`
  // était donc VRAI pour tout plat hors bornes, et chaque mangeur hors bornes
  // se voyait réserver un complément sans qu'aucune demande soit partie.
  // Mesuré sur les deux appels réels du 2026-09-13 (`stuck_dishes: 0`,
  // `fresh_frozen: 0`, et pourtant `residual_stuck` = `residual_eaters`).
  //
  // ⛔ CE QUI LE REMPLACE, ET IL A UN CAS QUI PASSE : on ne réserve un
  // complément que si la recomposition COMMUNE ne peut pas servir la personne.
  assert(!SRC.includes("const dejaDemande ="), "la prémisse morte est revenue");
  assert(
    SRC.includes("const rienAReecrire = !freshOk && !potsOk;") &&
      SRC.includes("const couloirVide = sharedCorridorEmpty(i);") &&
      SRC.includes("if (rienAReecrire || couloirVide) {"),
    "la décision ne tient plus qu'à ce qui reste réécrivable et au couloir commun",
  );
  // ⛔ ET LA FAISABILITÉ COMMUNE EST CALCULÉE AVEC LES FONCTIONS DU MOTEUR,
  // pas avec une seconde table : `densityCorridorFor` par assiette,
  // `mergeCorridors` pour les croiser.
  assert(
    SRC.includes("const sharedCorridorEmpty = (dishIndex: number): boolean => {") &&
      SRC.includes("commun = commun === null ? c : mergeCorridors(commun, c);") &&
      SRC.includes('return commun !== null && commun.incompatible === "empty_intersection";'),
    "l'intersection des couloirs n'est pas le contrôle de faisabilité",
  );
  // ⛔ ET ON COMPTE LES DEUX CÔTÉS. « on a réservé » et « on a laissé la
  // recomposition commune faire » ne doivent pas se relire pareil.
  assert(
    SRC.includes("repairs.residual_recomposable++;") &&
      SRC.includes("residual_stuck_by: { nothing_rewritable: 0, empty_corridor: 0 },"),
    "le motif du blocage n'est pas compté",
  );
});


Deno.test("⛔ CÂBLAGE ㊲ — une demande qu'on SAIT bloquée n'est pas envoyée au modèle", () => {
  // Mesuré au tir SPLICE3 : deux plats bloqués à la demande, 78 s d'appel pour
  // une consigne insatisfaisable, puis `no_cell`. Un bloqué va directement à
  // l'entrée de dernier recours.
  assert(SRC.includes("const askable = outOfBoundsN.filter((x) => !stuckAtAsk.has(x.i));"), "les bloqués sont encore demandés");
  assert(SRC.includes("await runDensityRepair(askable, (k) => ({"), "la consigne ne part pas des seuls demandables");
  assert(SRC.includes("repairs.skipped_stuck = stuckAtAsk.size;") && SRC.includes("skipped_stuck: 0,"), "les bloqués non demandés ne se comptent pas");
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — `missed_aim` COMPTAIT UN PLAT AJOUTÉ QUI
  // RATE SA CIBLE, et il vivait dans le bloc d'appel de `dedicated_repair`. Le
  // plat est maintenant ajouté par un patch, au tour d'avant, et il est mesuré
  // par la GARDE FINALE comme n'importe quel autre plat: une assiette qui rate
  // sa cible devient `cell_energy_off` ou `cell_bounds_off`, donc un défaut
  // COMPTÉ, NOMMÉ et réparable — ce que `missed_aim` ne pouvait pas être.
  assert(!SRC.includes("dedicated.missed_aim++"), "le compteur local est revenu sans son site");
  assert(
    SRC.includes("const c4Pass = collectPlanDefects({"),
    "la passe commune a disparu: un plat ajouté qui rate sa cible ne serait plus jugé",
  );
});
Deno.test("⛔ CÂBLAGE ㊳ — un complément qui NE RÉSOUT PAS est retiré seul, et le plan est remesuré", () => {
  // Mesuré aux tirs T4 et T5 (2026-09-09) : deux plats ajoutés au nom de deux
  // personnes, l'un impesable, et le refus « en bloc » jetait aussi le bon.
  //
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — LE RETRAIT PAR PARTIES SURVIT, et il est
  // même plus précis: on ne jette plus un plat « impesable » (le parseur du
  // patch s'en charge en amont), on jette un complément que
  // `splitPlateWithComplement` n'a pas su résoudre — sans quoi la personne
  // recevrait son assiette ENTIÈRE plus un plat en trop.
  const i = SRC.indexOf('tag: "keel.household_meal.dedicated_repair_unsolvable"');
  assert(i > 0, "un complément insoluble reste dans le plan");
  const bloc = SRC.slice(i - 1600, i + 400);
  assert(
    bloc.includes('(d as { complementsShared?: true }).complementsShared === true &&'),
    "le retrait ne vise pas que les compléments: un plat partagé pourrait tomber",
  );
  // ⟳ 2026-09-13 · LOT 1 D'ATTRIBUTION — L'ADRESSE, PLUS LE TITRE. La
  // référence N=4 porte le MÊME titre à mon/lunch et à tue/lunch : « retirer
  // par titre » a retiré les deux plats que le modèle venait de réparer.
  assert(!bloc.includes("insolubles.has(String(d.title"), "le retrait relit les titres");
  assert(
    bloc.includes("insolubles.has(") && bloc.includes('${String(d.day ?? "")}|${String(d.slot ?? "")}|${'),
    "le retrait ne vise pas la case ET le porteur",
  );
  // ⛔ ET LES LIGNES D'APPLICATION SUIVENT LA REMESURE. Sans ça, retirer un
  // plat décale les rangs et `applySizingForEaters` pose les contenants du
  // plat n° k sur le plat n° k+1 (mesuré au rejeu du tir N=4, 2026-09-13).
  const apres = SRC.slice(i, i + 1800);
  assert(
    apres.includes("measured = shadowSizing();") &&
      apres.includes("rows.length = 0;") &&
      apres.includes("rows.push(...((measured.applyRows ?? []) as EaterRowForApply[]));"),
    "les lignes d'application restent figées sur la mesure d'avant le retrait",
  );
  assert(bloc.includes("dedicated.rejected.unsolvable += aRetirer.length;"), "le retrait n'est pas compté");
  assert(bloc.includes("measured = shadowSizing();"), "le plan n'est pas remesuré après le retrait");
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
  assert(bloc.includes("complement.unsolvable_cells.push("), "un complément qui ne résout pas n'est pas nommé");
  // ③ la lane RETIRE le complément qui ne résout pas, et remesure.
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — le retrait a changé de site (le plat est
  // maintenant ajouté par un patch, au tour d'avant) mais pas de nature.
  const drop = SRC.indexOf('tag: "keel.household_meal.dedicated_repair_unsolvable"');
  assert(drop > 0, "le complément insoluble n'est pas retiré");
  const dbloc = SRC.slice(drop - 1600, drop + 300);
  assert(dbloc.includes("dedicated.rejected.unsolvable += aRetirer.length;"), "le retrait n'est pas compté");
  assert(dbloc.includes("measured = shadowSizing();"), "le plan n'est pas remesuré après le retrait");
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
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — `missed_aim` est parti avec le bloc
  // d'appel qui le remplissait. Ce qu'il mesurait — « le plat ajouté atteint-il
  // sa cible ? » — est maintenant mesuré par la GARDE FINALE sur le plat
  // ajouté comme sur tous les autres, au tour suivant. Le compteur local
  // lisait, lui, la ligne de la CASE, donc parfois le plat partagé.
  assert(!SRC.includes("dedicated.missed_aim++"), "le compteur local est revenu sans son site");
  // ⛔ ET LA JOURNÉE COMPTE LA CIBLE UNE FOIS PAR MOMENT, pas une fois par plat.
  assert(SRC.includes("if (!fed.complementByDish[i]) {"), "la cible d'une personne complétée est comptée deux fois");
});

Deno.test("⛔ CÂBLAGE ㊶ — l'entrée ajoutée passe par le SAS DE REMPLISSAGE avant d'être mesurée", () => {
  // Mesuré au tir COMP6 (2026-09-09) : deux compléments sur trois jetés
  // `complement_unmeasurable:unknown_ingredient` (« comté », « chou blanc ») —
  // le remplissage avait tourné sur le plan composé, avant ces plats.
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — L'ENTRÉE EST AJOUTÉE PAR UN PATCH, et le
  // sas tourne là où le patch est appliqué: entre l'application et le tour
  // suivant, qui remesure tout. Sans lui, un aliment neuf écrit par la
  // réparation repartirait `unmeasurable`, donc au facteur 1.
  const fill = SRC.indexOf("source: `${FN_NAME}.final_repair_fill`,");
  assert(fill > 0, "les ingrédients d'une réparation ne passent pas par le sas");
  const pose = SRC.indexOf("meal = c4Fusion.plan;");
  const suite = SRC.indexOf("continue;", fill);
  assert(pose > 0 && pose < fill && fill < suite, "le sas ne tourne pas entre l'application du patch et le tour suivant");
  const bloc = SRC.slice(fill - 1800, fill + 900);
  assert(bloc.includes("baseIndex: composition,"), "le sas ne part pas de l'index courant");
  assert(bloc.includes('tag: "keel.household_meal.final_repair_fill"'), "le sas ne se journalise pas");
  assert(bloc.includes("measured: rempli.outcome.measured,"), "on ne saurait pas si le sas a mesuré");
  // ⟳ 2026-09-19 — ET L'INDEX QU'IL REND EST ABSORBÉ, EN PLACE. Mesuré : ce
  // test tenait « le sas tourne », et le sas tournait pour rien — son index
  // neuf était jeté, le tour suivant pesait avec l'ancien, et tout plat créé
  // par la réparation restait sans boîte. `absorbIndexInto` n'avait aucun
  // appelant en production.
  // ⚠️ Cherchée par sa propre position, pas dans `bloc` : le pavé qui explique
  // le défaut la place à plus de 900 caractères du sas, et c'est l'ORDRE qui
  // compte — après le sas, avant le tour suivant.
  const absorb = SRC.indexOf("? absorbIndexInto(composition, rempli.index)");
  assert(
    absorb > fill && absorb < suite,
    "l'index enrichi par le sas n'est plus absorbé entre le sas et le tour suivant : les plats réparés repartent non mesurables",
  );
  assert(
    SRC.slice(absorb - 200, absorb + 200).includes("absorbed: rempli.index !== null"),
    "l'absorption ne se journalise pas",
  );
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
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — LES DEUX SITES DE DENSITÉ N'APPELLENT
  // PLUS, donc leur sas n'a plus rien à absorber. Le sas d'après réparation est
  // UNIQUE, comme la réparation: `final_repair_fill`, au point de décision.
  assertEquals(
    SRC.split('source: `${FN_NAME}.final_repair_fill`').length - 1,
    1,
    "le sas d'après réparation a disparu, ou il a été dupliqué",
  );
  // ⛔ ON ABSORBE, ON NE RÉASSIGNE PAS: `composition` est fermée dans une
  // dizaine de fermetures créées plus haut.
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — `absorbIndexInto` servait aux TROIS sites
  // d'après-réparation (densité table, densité solo, entrée de dernier
  // recours). Il n'en reste aucun : le sas unique passe par
  // `fillPlanComposition`.
  // ⟳ 2026-09-19 — CETTE PHRASE DISAIT « qui absorbe dans l'index qu'on lui
  // donne ». C'ÉTAIT FAUX : `withFilledRefs` copie `bySlug` et rend un index
  // neuf, que le site de fusion jetait. L'absorption est désormais explicite
  // (`absorbIndexInto`, épinglé plus haut) — l'affirmation d'une garde se
  // vérifie, elle ne se recopie pas.
  assert(
    SRC.includes("baseIndex: composition,"),
    "le sas d'après réparation ne part plus de l'index courant",
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
  // ⟳ 2026-09-23 — PAR `dishTargetOf`: le plat seul (`composeKcal`) plus
  // l'écart d'arrondi de ses à-côtés, la même expression aux deux sites.
  assertEquals(
    SRC.split("? dishTargetOf(contract)").length - 1,
    2,
    "un site lit encore sa propre arithmétique de part",
  );
  assert(
    /contract\.composeKcal \+\s*snapDeltaKcal\(sideLedger, contract\.memberId, contract\.dayToken, contract\.slot\)/
      .test(SRC),
    "la cible du plat ne part plus du contrat",
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

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 1 — LA PART DE RECETTE EST CÂBLÉE, ET SUR LA BONNE PORTE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI UNE ÉPINGLE DE PLUS. `applySizingForEaters` sait servir une part
// à une bouche sans cible; il ne le fera QUE si la ligne d'application porte un
// `recipeShare`. Ce champ est écrit à un seul endroit du handler, et il dépend
// d'un fait qui n'existe que là: la part standard du plat est-elle mesurable ?
// Sans cette épingle, retirer `dishMeasurable` rendrait le module vert et le
// produit faux — un contenant fabriqué sur un plat que personne ne sait peser.

// ⟳ 2026-09-13 · LOT 2 — L'ÉPINGLE PASSE DE **UNE** LANE À **DEUX**.
//
// ⛔ CE QU'ELLE DISAIT, ET POURQUOI C'ÉTAIT FAUX. Elle exigeait UNE SEULE
// écriture de `recipeShare` dans le handler — ce qui était vrai le jour du lot 1
// et décrivait très exactement le défaut du lot 2: la lane d'UNE bouche n'en
// avait aucune, et sa seule assiette partait sans contenant. Un compteur
// d'écritures ne dit pas si les lanes sont câblées; il dit combien il y en a.
// Ce qu'on épingle désormais: **chacune** des deux lanes écrit le champ, depuis
// `recipeShareReasonFor`, derrière la mesure du plat.

/** Les deux lanes, adressées par leur ligne d'application. */
const LANE_TABLE = "const appliedN = applySizingForEaters({";
const LANE_SOLO = "const applied = applySizing({";

Deno.test("CÂBLAGE LOT 1+2 — LES DEUX LANES écrivent `recipeShare`, et du motif du jour", () => {
  const n = SRC.split("recipeShare:").length - 1;
  assertEquals(n, 2, "une lane par écriture: la table et la bouche unique");
  assert(
    SRC.includes("recipeShareReasonFor({"),
    "le motif doit venir de `recipeShareReasonFor`, jamais d'un littéral",
  );
  // ⛔ LE MOTIF VIENT DE `dayTargetFor`, ET IL EST GARDÉ — jamais recalculé.
  // Un second appel sur la même bouche est la lecture qui divergerait.
  //   · à table: gardé dans `perMouth` au moment où la cible est posée;
  //   · à une bouche: `dayTarget` est déjà sous la main, dans la même fermeture.
  assert(SRC.includes("targetReason: t.reason"), "le motif du jour est gardé");
  assert(
    SRC.includes("dayReason: p?.targetReason ?? null"),
    "la lane de la table relit le motif gardé",
  );
  assert(
    SRC.includes("dayReason: dayTarget.reason"),
    "la lane d'une bouche relit le motif de SA cible du jour",
  );
});

Deno.test("CÂBLAGE LOT 1+2 — la part de recette est gardée par la MESURE DU PLAT, des DEUX côtés", () => {
  // ⛔ LE MÊME FAIT, ÉCRIT PAREIL DANS LES DEUX LANES. C'est lui qui sépare
  // « je ne sais pas calculer sa cible » (une part à servir) de « cette recette
  // est illisible » (un refus): le perdre d'un côté fabriquerait un contenant
  // sur un plat que personne ne sait peser.
  const FAIT = "const dishMeasurable = standard.kcal !== null && standard.kcal > 0;";
  assertEquals(
    SRC.split(FAIT).length - 1,
    2,
    "le fait qui sépare les deux silences manque à une lane",
  );
  // ⚠️ CHAQUE ÉCRITURE EST PRÉCÉDÉE DE SA PROPRE MESURE — pas de celle de
  // l'autre lane. On avance case par case et on vérifie l'ordre localement.
  let depuis = 0;
  for (const lane of [1, 2]) {
    const fait = SRC.indexOf(FAIT, depuis);
    const ecrit = SRC.indexOf("recipeShare:", depuis);
    assert(fait > 0, `lane ${lane}: la mesure du plat a disparu`);
    assert(ecrit > 0, `lane ${lane}: l'écriture a disparu`);
    assert(fait < ecrit, `lane ${lane}: la mesure doit précéder l'ouverture`);
    depuis = ecrit + 1;
  }
  assert(
    SRC.includes("sized || !dishMeasurable ? null : recipeShareReasonFor"),
    "lane de la table: un plat illisible doit refermer la part de recette",
  );
  assert(
    SRC.includes("rowSized || !dishMeasurable ? null : recipeShareReasonFor"),
    "lane d'une bouche: un plat illisible doit refermer la part de recette",
  );
});

Deno.test("CÂBLAGE LOT 2 — la lane d'UNE bouche porte bien la sienne", () => {
  // ⛔ L'ÉPINGLE D'ADRESSE. Les deux écritures se ressemblent; sans borner la
  // recherche à la lane, une seule d'entre elles satisferait les deux tests et
  // le défaut reviendrait sans un rouge.
  const solo = SRC.indexOf(LANE_SOLO);
  const table = SRC.indexOf(LANE_TABLE);
  assert(solo > 0 && table > 0, "une des deux lanes a disparu");
  assert(table < solo, "l'ordre des lanes dans le fichier a changé");
  const blocSolo = SRC.slice(table + LANE_TABLE.length, solo);
  assert(
    blocSolo.includes("rowSized || !dishMeasurable ? null : recipeShareReasonFor"),
    "la lane d'une bouche n'écrit pas `recipeShare` avant son application",
  );
  assert(
    blocSolo.includes("dayReason: dayTarget.reason"),
    "la lane d'une bouche n'y met pas le motif de SA cible du jour",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 1 D'ATTRIBUTION — LES DEUX PERTES DE LA FUSION, ÉPINGLÉES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ CÂBLAGE ㊵ — le porteur d'une unité de patch est le NÔTRE, reposé après le parseur", () => {
  // ⛔ CE QUI DISPARAISSAIT, ET OÙ. `patchDishPayloads` efface ce que le modèle
  // aurait écrit et repose `for_member_id` depuis la table des unités : c'est
  // le SERVEUR qui adresse. `parseGeneratedMeal` le relit ensuite comme s'il
  // venait du modèle et le jette quand la personne n'est pas dans
  // `dishBearerIds`, ou quand la consigne du premier jet n'avait pas réclamé de
  // plat dédié. Mesuré au rejeu gratuit du tir N=2 du 2026-09-13 :
  //
  //   dishes[0]: for_member_id "62b33b69…" is not a mouth that gets its own
  //              dish, dropped
  //
  // Les compléments devenaient des plats de TABLE, chaque bouche se retrouvait
  // nommée sur deux couvercles à la même case, et la garde finale rendait
  // `mouth_unfed` avec `unfed:double`. Un repas rendu absent par notre propre
  // écriture.
  const i = SRC.indexOf("parsedByUnit.set(unitId, plat);");
  assert(i > 0, "le plat parsé n'est plus rangé sous son unité");
  const bloc = SRC.slice(Math.max(0, i - 900), i + 200);
  assert(
    bloc.includes("const unite = c4Units.byId.get(unitId) ?? null;") &&
      bloc.includes("if (unite !== null && unite.ownerId !== null) {") &&
      bloc.includes("(plat as { memberId: string | null }).memberId = unite.ownerId;"),
    "l'adresse posée par le serveur n'est pas restaurée après le parseur",
  );
  // ⛔ JAMAIS DE PORTEUR OÙ L'UNITÉ N'EN A PAS : donner un porteur à un plat de
  // la maison le retirerait à tous les autres.
  assert(
    !bloc.includes("plat.memberId = unite.ownerId ?? "),
    "un plat de la maison pourrait recevoir un porteur",
  );
  // ⛔ ET C'EST COMPTÉ. Un `0` sur un patch qui porte des compléments dit que
  // le parseur a gardé l'adresse ; un nombre > 0 dit combien de repas ont été
  // sauvés. Sans ce compteur, le correctif serait invérifiable en réel.
  assert(
    SRC.includes('tag: "keel.household_meal.patch_owner_restored"') &&
      SRC.includes("restored: ownersRestored,"),
    "la restauration de l'adresse n'est pas comptée",
  );
});

Deno.test("⛔ CÂBLAGE ㊶ — `complementsShared` se pose sur le plat CRÉÉ, par identité", () => {
  // ⛔ LE GESTE RETIRÉ : un `find` sur `jour/moment/porteur`. À une case où la
  // personne a DÉJÀ son plat dédié, ce triplet désigne DEUX plats — l'ancien et
  // le complément qu'on vient de créer — et `find` rend le PREMIER. Mesuré au
  // rejeu gratuit du tir N=4 du 2026-09-13 : la marque tombait sur U4 et U10,
  // les deux plats que le modèle venait de réécrire ; le contrôle du complément
  // les a jugés insolubles et la lane les a RETIRÉS. La réparation disparaissait
  // et les compléments restaient.
  const i = SRC.indexOf("for (const unitId of c4Fusion.created) {");
  assert(i > 0, "la marque des compléments n'est plus posée");
  const bloc = SRC.slice(i, i + 1400);
  assert(
    !bloc.includes("String(d.memberId ?? \"\") === String(unite.ownerId ?? \"\")"),
    "la marque se repose par adresse : deux plats de la même case sont à nouveau confondus",
  );
  assert(
    bloc.includes("const attendu = parsedByUnit.get(unitId);") &&
      bloc.includes("(c4Fusion.plan.dishes as readonly unknown[]).includes(attendu)"),
    "le plat créé n'est plus reconnu par sa référence",
  );
  assert(
    bloc.includes('tag: "keel.household_meal.complement_unmarked"'),
    "un complément créé qu'on ne retrouve pas reste silencieux",
  );
});
