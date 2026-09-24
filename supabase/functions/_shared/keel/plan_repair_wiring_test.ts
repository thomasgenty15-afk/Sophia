/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÉTAPE C4 — LA BOUCLE DE RÉPARATION EST BRANCHÉE JUSQU'À LA LIVRAISON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI DES ÉPINGLES DE SOURCE ET PAS SEULEMENT DES TESTS DE MODULE.
 * `plan_defect_pass.ts`, `plan_repair_loop.ts` et `plan_budget.ts` sont purs et
 * entièrement testés — et ça ne dit RIEN de l'endroit où ils tournent. Or
 * l'endroit EST le lot : jusqu'au 2026-09-12, `defectsFromRefusals` et
 * `judgeCandidate` n'avaient **aucun appelant de production**
 * (`NON-BRANCHE.md` § ②), la garde finale s'exécutait 4 000 lignes APRÈS le
 * dernier rattrapage, et quatre plans sur six sortaient sous leur plancher
 * protéique sans que rien ne répare.
 *
 * ⛔ « Codé », « testé en isolation » et « branché jusqu'à la livraison » sont
 * TROIS ÉTATS DIFFÉRENTS. Ce fichier éprouve le troisième.
 *
 * ⚠️ CHAQUE ÉPINGLE EST DOUBLÉE D'UNE COUPE quand elle porte sur une position:
 * sans elle, ce sont des `indexOf` sur des chaînes qui pourraient disparaître
 * ensemble.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const REL = "generate-household-meal-v1/index.ts";
const SRC = stripComments(await sourceFamily(new URL(REL, FUNCTIONS_DIR)));
// ⚠️ LUES AU MODULE, PAS DANS UN TEST. Un `await` dans un cas de test le rend
// asynchrone pour rien, et ces trois fichiers ne changent pas entre deux cas.
const PASSE_SRC = stripComments(
  await Deno.readTextFile(
    new URL("_shared/keel/plan_defect_pass.ts", FUNCTIONS_DIR),
  ),
);
const V33_SRC = stripComments(
  await sourceFamily(
    new URL("_shared/keel/household_portions.ts", FUNCTIONS_DIR),
  ),
);
const V34_SRC = stripComments(
  await Deno.readTextFile(
    new URL("_shared/keel/household_prompt_v34.ts", FUNCTIONS_DIR),
  ),
);
/** ⟳ 2026-09-13 · LOT 2 § 2.3 ③ — la SIGNATURE de la décision, lue à la source. */
const BOUCLE_SRC = stripComments(
  await Deno.readTextFile(
    new URL("_shared/keel/plan_repair_loop.ts", FUNCTIONS_DIR),
  ),
);

const BOUCLE = "for (let c4Round = 0;; c4Round++) {";
// BÊTA 1A gèle d'abord le contexte complet pour que l'adoption rejoue la
// même garde. L'épingle suit donc l'appel vivant, pas l'ancien littéral inline.
const GARDE = "const gate = finalPlanGate(asGatePlan(writePayload), gateContext);";
const PASSE = "const c4Pass = collectPlanDefects({";
// ⟳ 2026-09-12 · FERMETURE LOT 1 — L'INDENTATION A CHANGÉ, ET LA RAISON EST
// LE LOT: la demande de budget est passée SOUS la vérification du contexte
// (« vérifier le contexte et construire l'instruction avant de consommer la
// tentative »), donc d'un niveau plus profond. On épingle l'appel, pas sa
// colonne — une garde qui rougit sur une indentation ne garde rien.
const BUDGET = 'planBudget.askRepair(';
/** ⟳ 2026-09-12 · LOT 2 — la décision unique, qui a remplacé `planRepairPass`. */
const DECISION = "const c4Decision = planRepairDecision({";
const JUGE = "const verdict = judgeCandidate({";
const APERCU = "if (isDraft) {";
const ECRITURE = '"keel_household_publish_generation"';

// ═══════════════════════════════════════════════════════════════════════════
// ① LA BOUCLE EXISTE, ET ELLE ENGLOBE LA FINALISATION ENTIÈRE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 CÂBLAGE ① — une seule boucle, et elle s'ouvre AVANT le dimensionnement", () => {
  assertEquals(SRC.split(BOUCLE).length - 1, 1, "une seule boucle de réparation");
  const boucle = SRC.indexOf(BOUCLE);
  const sizing = SRC.indexOf("const portionSizing = await (async () => {");
  assert(sizing > 0, "le bloc de dimensionnement existe");
  // ⛔ SI LA BOUCLE S'OUVRAIT APRÈS, une candidate réparée arriverait à la
  // finalisation SANS grammes: le moteur pose les boîtes dans ce bloc-là.
  // « Refaire TOUTE la finalisation » serait alors une phrase, pas un fait.
  assert(boucle < sizing, "la candidate réparée est redimensionnée");
});

Deno.test("C4 CÂBLAGE ② — la garde finale tourne DANS la boucle, avant l'aperçu ET l'écriture", () => {
  const boucle = SRC.indexOf(BOUCLE);
  const garde = SRC.indexOf(GARDE);
  const apercu = SRC.indexOf(APERCU, garde);
  const ecriture = SRC.indexOf(ECRITURE, garde);
  assert(garde > 0, "la garde finale a un appelant");
  assert(boucle < garde, "elle est refaite à chaque tour");
  // ⛔ C'EST LE DÉPLACEMENT DU LOT. La garde vivait APRÈS le retour d'aperçu:
  // un plan en `intent: draft` n'était donc contrôlé par personne, et le
  // verdict arrivait après le dernier point où une réparation était possible.
  assert(garde < apercu, "l'aperçu est contrôlé, lui aussi");
  assert(garde < ecriture, "le verdict précède l'écriture");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LES DÉFAUTS ATTEIGNENT LE BUDGET — LE PONT QUI MANQUAIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 CÂBLAGE ③ — la passe commune lit la garde, le contrat de sortie ET les quantités", () => {
  const i = SRC.indexOf(PASSE);
  assert(i > 0, "`collectPlanDefects` a un appelant de production");
  const bloc = SRC.slice(i, i + 1400);
  // Les six contrôles, dans un seul appel. ⛔ Un seul manquant et « tous ses
  // défauts applicables » redevient « ceux que ce site-là connaissait ».
  for (const clef of [
    "refusals: gateOut?.refusals",
    "outputContract: outputContractOf(meal)",
    "cells: auditCellRows",
    "days: auditDayRows",
    "roundedToZero:",
    "potsOverdrawn: potReconcile.overdrawn_after",
    "outOfBounds: finalSizing.out_of_bounds",
  ]) {
    assert(bloc.includes(clef), `la passe ne lit pas « ${clef} »`);
  }
});

Deno.test("C4 CÂBLAGE ④ — `defectsFromRefusals` a un appelant de production, par la passe", () => {
  // ⛔ `NON-BRANCHE.md` § ② : « le pont garde → budget de réparation qui
  // manquait : sans lui, un refus du portail final ne peut pas déclencher une
  // réparation ». Il est emprunté par `collectPlanDefects`, qui est appelé ici.
  assert(
    PASSE_SRC.includes("const fromGate = defectsFromRefusals("),
    "la passe commune n'emprunte pas le pont",
  );
  // ⟳ 2026-09-12 · LOT 2 — ET ELLE PASSE LES QUATRE ARGUMENTS. `measures` et
  // `details` sont facultatifs sur la signature (pour le chemin d'ADOPTION,
  // qui n'a aucun contrat en main); ici, le chemin armé, les omettre rendrait
  // des défauts sans mesure et des phrases françaises dans une instruction
  // anglaise, sans que rien ne devienne rouge.
  for (const arg of ["magnitudes,", "readout.measures,", "readout.details,"]) {
    assert(PASSE_SRC.includes(arg), `la passe ne passe pas « ${arg} »`);
  }
  assert(SRC.includes(PASSE), "et la passe a un appelant dans le handler");
});

Deno.test("C4 CÂBLAGE ⑤ — la décision consomme le budget PARTAGÉ, sans compteur à elle", () => {
  assert(SRC.indexOf(BUDGET) > 0, "le site de réparation demande au budget commun");
  // ⟳ 2026-09-12 · LOT 2 — L'ANCRE A CHANGÉ, PAS LA PROPRIÉTÉ. La décision
  // vient de `planRepairDecision` (qui, elle, connaît les appels DÉJÀ partis) et
  // non plus de `planRepairPass`. Ce test épinglait une DISTANCE en octets entre
  // `askRepair` et les deux lignes de budget ; un pavé d'explication inséré
  // entre les deux le rendait rouge sans qu'aucun compteur local n'apparaisse.
  // On épingle maintenant le bloc de la décision elle-même.
  const i = SRC.indexOf(DECISION);
  assert(i > 0, "`planRepairDecision` a un appelant de production");
  const bloc = SRC.slice(i, i + 1400);
  // ⛔ « Aucun troisième rappel caché » : les deux nombres passés à la passe
  // viennent du budget, pas d'un compteur local.
  assert(
    bloc.includes("attemptsUsed: planBudget.snapshot().repairs_used"),
    "un compteur local rouvrirait une réserve cachée",
  );
  assert(
    bloc.includes("maxAttempts: planBudget.snapshot().repairs_allowed"),
    "le plafond doit être celui du budget",
  );
  // ⚠️ `usableMs`, JAMAIS `remainingMs`: la réserve d'écriture reste due.
  assert(bloc.includes("remainingMs: planBudget.usableMs()"), bloc.slice(0, 200));
  // ⟳ 2026-09-12 · LOT 2 — LE PLAFOND D'APPELS RÉELS, ET LE VERDICT PRÉCÉDENT.
  // ⛔ Sans `callsMade`, la décision ignore les appels déjà partis: c'est le
  // défaut n° 3 de la revue (« le budget compte des tentatives ; un appel rejeté
  // en consomme bien une »), et rien ne portait le plafond des DEUX appels.
  assert(bloc.includes("callsMade: c4CallsMade"), "les appels PARTIS entrent dans la décision");
  assert(bloc.includes("maxCalls: PLAN_REPAIR_MAX_CALLS"), "le plafond du lot est celui du module");
  assert(bloc.includes("lastVerdict: c4LastVerdict"), "le verdict précédent part au modèle");
});

Deno.test("C4 CÂBLAGE ⑥ — on compte les appels PARTIS, et le compteur monte AVANT l'`await`", () => {
  // ⛔ « Compter les appels réellement effectués, pas seulement le nombre
  // demandé à la fonction de budget. » Un appel qui jette est un appel parti:
  // le compter au retour ferait dire « zéro appel » à une requête qui en a
  // payé deux.
  const i = SRC.indexOf("c4CallsMade += 1;");
  assert(i > 0, "le compteur d'appels réels existe");
  // ⟳ 2026-09-14 · BÊTA 2B — L'ANCRE A CHANGÉ, PAS LA POSITION. L'appel est
// enveloppé par `appelModele(…)` depuis que les pannes du fournisseur ont un
// jeton au lieu d'une chaîne anglaise. Le site est le même.
  const appel = SRC.indexOf("generateWithGemini(", i);
  assert(appel > i && appel - i < 400, "le compteur monte avant l'appel");
  assert(SRC.includes("calls_made: c4CallsMade"), "et il est journalisé");
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ CE QU'UNE CANDIDATE DOIT FRANCHIR AVANT D'ÊTRE GARDÉE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 CÂBLAGE ⑦ — une morsure AJOUTÉE rejette la candidate, par identité", () => {
  // ⛔ PAR IDENTITÉ, JAMAIS PAR COMPTE. Une substitution d'allergène laisse le
  // nombre inchangé: `biteKeys` porte la case, le plat, le terme mordu et la
  // règle qui a mordu.
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — LA CEINTURE SE LIT PAR UNITÉ. Le patch est
  // parsé UNE UNITÉ À LA FOIS (le plafond de plats du parseur amputait un patch
  // de huit unités) : les morsures s'accumulent donc unité par unité, et la
  // comparaison par identité est faite sur cet ensemble.
  const j = SRC.indexOf("for (const k of biteKeys(une as never)) bitesParUnite.add(k);");
  assert(j > 0, "la ceinture ne tourne plus sur chaque unité du patch");
  const i = SRC.indexOf("const avant = biteKeys(meal as never);");
  assert(i > j, "la comparaison passe avant le relevé: il n'y aurait rien à comparer");
  const bloc = SRC.slice(i, i + 700);
  assert(
    bloc.includes("const ajoutees = [...bitesParUnite].filter((k) => !avant.has(k));"),
    bloc,
  );
  assert(bloc.includes("!avant.has(k)"), "on refuse ce qui a été AJOUTÉ");
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — LE MOTIF EST POSÉ PLUS BAS, AVEC TOUS LES
  // AUTRES: un patch peut être rejeté par la ceinture OU par l'application
  // (`out_of_scope_unit`, `uses_out_of_scope`…). Une seule ligne écrit
  // `plan_repair_rejected:<motif>`, ce qui rend les motifs comparables.
  assert(bloc.includes('c4Rejet = "belt";'), bloc);
  assert(SRC.includes("c4Note(`plan_repair_rejected:${c4Rejet}`);"), SRC.slice(0, 0));
  // ⛔ ET ELLE PRÉCÈDE L'ADOPTION. Une ceinture qui parlerait après aurait
  // laissé l'allergène entrer.
  //
  // ⟳ 2026-09-12 · LOT 2 — L'ADOPTION S'APPELLE MAINTENANT LA FUSION.
  // `meal = candidate` prenait le plan ENTIER du modèle ; `meal = fusion.plan`
  // ne recopie que les cases autorisées par `repairScopeOf`. La propriété
  // épinglée est la même : la ceinture d'abord, le plan retenu ensuite.
  assert(
    !SRC.includes("meal = candidate;"),
    "l'adoption en bloc est revenue : une réparation reprendrait tout le plan",
  );
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — LA FUSION EST DEVENUE L'APPLICATION D'UN
  // PATCH. Même propriété épinglée : la ceinture d'abord, le plan retenu après.
  const adoption = SRC.indexOf("meal = c4Fusion.plan;", i);
  assert(adoption > i, "la ceinture passe avant l'application du patch");
});

Deno.test("C4 CÂBLAGE ⑧ — la candidate est jugée APRÈS sa propre finalisation", () => {
  const juge = SRC.indexOf(JUGE);
  const garde = SRC.indexOf(GARDE);
  assert(juge > 0, "`judgeCandidate` a un appelant de production");
  // ⛔ IL NE PEUT PAS SE FAIRE AU RETOUR DU MODÈLE. « Rejeter les régressions de
  // portions déjà conformes » demande de MESURER la candidate — donc de la
  // finaliser d'abord.
  assert(garde < juge, "le jugement lit le verdict de la garde");
  const bloc = SRC.slice(juge, juge + 500);
  assert(bloc.includes("beforeDefects: c4BestDefects"), bloc);
  assert(bloc.includes("afterDefects: c4Pass.defects"), bloc);
  assert(bloc.includes("beforeRefusals: c4BestRefusals"), bloc);
});

Deno.test("C4 CÂBLAGE ⑨ — une candidate rejetée REVIENT à la meilleure version, texte compris", () => {
  const i = SRC.indexOf("meal = structuredClone(c4BestEntry);");
  assert(i > 0, "le retour à la meilleure version existe");
  const bloc = SRC.slice(i, i + 300);
  // ⚠️ `mealSourceText` REVIENT AVEC: `reconcilePortions` le relit, et
  // réconcilier les parts d'un plan qu'on vient de jeter est un défaut que ce
  // fichier a déjà payé (`density_repair_blinded`).
  assert(bloc.includes("mealSourceText = c4BestSourceText;"), bloc);
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · LOT 2 — CE TEST ÉPINGLAIT LE DÉFAUT N° 3 DE LA REVUE
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ IL EXIGEAIT `c4Stop = true;` ICI — c'est-à-dire « une première candidate
  // rejetée ferme la boucle ». Les tirs 1 et 3 ont fait UNE réparation, l'ont
  // vue rejetée, et ont été refusés sans avoir épuisé leur budget. La revue :
  // « retirer l'arrêt systématique sur une première candidate rejetée, sous le
  // même plafond d'appels et de temps ».
  //
  // ⚠️ CE QUI REMPLACE N'EST PAS « ON RÉESSAIE TOUJOURS » : `repairRoundOutcome`
  // REDEMANDE au budget et au plafond, et quand il dit non, il dit POURQUOI.
  // ⚠️ FENÊTRE PLUS LARGE POUR LA SUITE : le retour à la meilleure version tient
  // en trois lignes, la RÉÉVALUATION en quinze. Les mesurer dans la même petite
  // tranche ferait rougir ce test au premier commentaire ajouté.
  const apres = SRC.slice(i, i + 1600);
  assert(
    !apres.includes("c4Stop = true;"),
    "l'arrêt sec au premier rejet est revenu : le budget ne sera plus épuisé",
  );
  assert(apres.includes("repairRoundOutcome({"), "la suite d'un rejet est RÉÉVALUÉE");
  assert(apres.includes("c4Stop = !suite.mayRetry;"), "et c'est cette réévaluation qui ferme");
  assert(
    SRC.includes("if (!suite.mayRetry) c4Note(`plan_repair_stop:${suite.reason}`);"),
    "un arrêt doit dire pourquoi il s'arrête",
  );
  assert(apres.includes("continue;"), "un tour de plus refinalise la meilleure");
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ APRÈS ÉPUISEMENT: CE QU'ON LIVRE EST DIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 CÂBLAGE ⑩ — le plan livré NOMME les défauts qui restent", () => {
  // ⛔ « Ne pas déclarer la campagne réussie parce que le système sait
  // désormais refuser tous les plans. » Cette ligne existe pour que « livré »
  // ne se lise jamais « conforme ».
  assert(SRC.includes("`plan_defects_at_delivery:${c4Pass.defects.length} `"), SRC.slice(0, 0));
  assert(SRC.includes('tag: "keel.household_meal.plan_repair_done"'), "le bilan de boucle est journalisé");
  // ⚠️ LE VERDICT DE LIVRAISON RESTE CELUI DE LA GARDE. Deux avis sur « ce plan
  // est-il livrable » finiraient par diverger.
  assert(SRC.includes("delivery: gateDelivery?.state ?? null"), "le verdict n'est pas recalculé");
});

Deno.test("C4 CÂBLAGE ⑪ — la boucle ne se quitte que par un `return`, et un garde-fou la borne", () => {
  const debut = SRC.indexOf(BOUCLE);
  assert(debut > 0);
  // ⛔ PAS DE `break` — chaque sortie du chemin de livraison est un `return`.
  // Un `break` rendrait la main à du code qui n'existe pas.
  const corps = SRC.slice(debut);
  assert(!/\n\s{4}break;/.test(corps), "un `break` laisserait tomber le plan");
  // ⛔ ET UNE BOUCLE INFINIE DANS UNE FONCTION EDGE EST UNE FACTURE.
  assert(SRC.includes("if (c4Round >= 5) c4Stop = true;"), "le garde-fou dur existe");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE PLANCHER PROTÉIQUE ATTEINT LE PREMIER JET — LES DEUX CONSTRUCTEURS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 CÂBLAGE ⑫ — le brief protéique est calculé AVANT le prompt, et posé UNE fois", () => {
  const calcul = SRC.indexOf("const brief = proteinBriefFor({");
  const prompt = SRC.indexOf("buildHouseholdPromptBlocks(");
  assert(calcul > 0, "le brief protéique a un appelant de production");
  assert(calcul < prompt, "il est calculé avant la construction du prompt");
  // ⛔ DEUX POINTS D'ÉCRITURE SUR UN CHAMP DONT `null` VEUT DIRE « personne
  // n'a calculé » FERAIENT DE L'OUBLI UN ÉTAT INDISCERNABLE. Un seul site pose
  // une valeur non nulle — la même règle que `requiredDensity`.
  const ecrits = [...SRC.matchAll(/proteinBrief:\s*([^\n,;]+)/g)]
    .map((m) => m[1].trim())
    // ⚠️ LA DÉCLARATION DE TYPE N'EST PAS UNE ÉCRITURE. `proteinBrief:
    // ProteinMouthBrief | null` décrit le champ; elle ne pose aucune valeur.
    .filter((e) => !e.includes("ProteinMouthBrief"));
  assertEquals(
    ecrits.filter((e) => e !== "null").length,
    2,
    `un seul chemin par constructeur de prompt (vu: ${ecrits.join(" | ")})`,
  );
  // ⛔ ET LES DEUX SONT LE MÊME CHEMIN, pas deux calculs. Deux résolutions du
  // même plancher finiraient par diverger, et c'est celle qu'on relit le moins
  // qui partirait au modèle.
  assertEquals(
    SRC.split("proteinBriefByMember.get(m.memberId) ?? null").length - 1,
    2,
  );
});

Deno.test("C4 CÂBLAGE ⑬ — les DEUX constructeurs de prompt servent la ligne protéique", () => {
  // ⛔ v33 ET v34, parce que le MÊME foyer peut recevoir l'un ou l'autre
  // (`PORTION_V34_MIN_MOUTHS = 2`). Ne brancher que v34 laisserait toute
  // personne seule — la moitié du marché B2C — sans sa cible protéique.
  assert(V33_SRC.includes("proteinFragment(m.proteinBrief ?? null)"), "v33 ne sert pas la ligne");
  assert(
    V34_SRC.includes("proteinFragment(input.cardFacts[m.memberId]?.proteinBrief ?? null)"),
    "v34 ne sert pas la ligne",
  );
  // ⚠️ ET LA CONSÉQUENCE EST GARDÉE PAR SON FAIT DANS LES DEUX.
  assert(V33_SRC.includes("anyProtein ? [...PROTEIN_CONSEQUENCE]"), "v33 sert la conséquence sans garde");
  assert(V34_SRC.includes("anyProtein ? [...PROTEIN_CONSEQUENCE]"), "v34 sert la conséquence sans garde");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 § 2.3 — CE QUE LES CAS ② ET ③ DEMANDENT DE LA SOURCE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§ 2.3 ② — LES DEUX retours à la meilleure version ramènent AUSSI son texte", () => {
  // ⛔ CE QUE LE CÂBLAGE ⑨ NE VOYAIT PAS. Il ancre sur le PREMIER
  // `meal = structuredClone(c4BestEntry);` — le rejet par `judgeCandidate`. Il
  // y en a un SECOND, celui du patch refusé par la ceinture ou par
  // l'application, et rien ne l'obligeait à ramener `mealSourceText`. Un texte
  // resté sur la candidate jetée fait réconcilier les parts d'un plan qu'on
  // vient de jeter: c'est `density_repair_blinded`, déjà payé ici.
  const sites = [...SRC.matchAll(/meal = structuredClone\(c4BestEntry\);/g)]
    .map((m) => m.index ?? -1);
  assertEquals(sites.length, 2, "un site de restauration a été ajouté ou retiré");
  for (const at of sites) {
    const bloc = SRC.slice(at, at + 200);
    assert(
      bloc.includes("mealSourceText = c4BestSourceText;"),
      `un retour à la meilleure version laisse le texte de la candidate jetée: ${bloc}`,
    );
    // ⛔ ET IL REPART POUR UN TOUR: sans `continue`, la version restaurée ne
    // serait jamais refinalisée, et c'est la candidate mutée qui sortirait.
    assert(
      SRC.slice(at, at + 1600).includes("continue;"),
      "la version restaurée n'est pas refinalisée",
    );
  }
});

Deno.test("§ 2.3 ② — la meilleure version est le plan ENTIER: recettes et sessions comprises", () => {
  // ⛔ UNE PROJECTION AURAIT L'AIR DE MARCHER. `c4BestEntry = { dishes }`
  // restaurerait des assiettes sans casserole ni déroulé de cuisson — un plan
  // que la garde suivante mesurerait comme neuf.
  assert(
    SRC.includes("let c4BestEntry: typeof meal = structuredClone(meal);"),
    "la meilleure version n'est plus une copie du plan entier",
  );
  assert(
    SRC.includes("const c4Entry: typeof meal = structuredClone(meal);"),
    "l'instantané d'entrée de tour n'est plus une copie du plan entier",
  );
  // ⛔ UN SEUL SITE LA PROMEUT. Deux écrivains sur « la meilleure version »
  // feraient deux définitions de « meilleure », et c'est celle qu'on relit le
  // moins qui gagnerait.
  assertEquals(
    SRC.split("c4BestEntry = ").length - 1,
    1,
    "un second écrivain de la meilleure version est apparu",
  );
  assert(SRC.includes("c4BestEntry = c4Entry;"), "la promotion a changé de source");
  // ⛔ ET LE TEXTE SOURCE SUIT LE MÊME OBJET, au même endroit.
  const at = SRC.indexOf("c4BestEntry = c4Entry;");
  assert(
    SRC.slice(at, at + 160).includes("c4BestSourceText = c4EntrySourceText;"),
    "le texte canonique ne suit plus la meilleure version",
  );
});

Deno.test("§ 2.3 ③ — UN SEUL compteur d'appels pour la demande, déclaré HORS de la boucle", () => {
  // ⛔ DÉCLARÉ DANS LA BOUCLE, IL REPARTIRAIT DE ZÉRO À CHAQUE TOUR — et
  // « deux appels » deviendrait « deux appels par tour ».
  assertEquals(SRC.split("let c4CallsMade = 0;").length - 1, 1, "un seul compteur");
  assertEquals(SRC.split("c4CallsMade += 1;").length - 1, 1, "un seul incrément");
  const decl = SRC.indexOf("let c4CallsMade = 0;");
  const boucle = SRC.indexOf(BOUCLE);
  assert(decl > 0 && boucle > 0, "les deux repères existent");
  assert(decl < boucle, "le compteur est déclaré DANS la boucle");
  // ⛔ ET LE PLAFOND EST CELUI DU MODULE, jamais un nombre recopié à côté.
  assertEquals(
    SRC.split("maxCalls: PLAN_REPAIR_MAX_CALLS").length - 1,
    3,
    "un site de décision a perdu le plafond du module",
  );
  assert(!/maxCalls:\s*\d/.test(SRC), "un plafond en dur est revenu");
});

Deno.test("§ 2.3 ③ — la DÉCISION ne sait pas ce qu'est une bouche: le plafond ne se divise pas", () => {
  // ⛔ LA PREUVE STRUCTURELLE, ET C'EST LA SEULE QUI TIENNE. On peut toujours
  // écrire un cas « deux appels pour quatre bouches »; ce qui garantit que le
  // plafond ne se multipliera jamais, c'est que la fonction qui le lit ne reçoit
  // NI bouche, NI créneau, NI session — elle ne pourrait pas compter par
  // personne même si quelqu'un le lui demandait.
  const debut = BOUCLE_SRC.indexOf("export function planRepairDecision(args: {");
  assert(debut > 0, "`planRepairDecision` a disparu — test à réviser");
  const fin = BOUCLE_SRC.indexOf("}): RepairDecision {", debut);
  assert(fin > debut, "la signature ne se ferme plus comme attendu");
  const signature = BOUCLE_SRC.slice(debut, fin);
  for (const mot of ["memberId", "mouth", "slot", "session", "household", "perMember"]) {
    assert(
      !signature.includes(mot),
      `la décision reçoit \`${mot}\`: le plafond devient divisible — ${signature}`,
    );
  }
  assert(signature.includes("readonly callsMade: number;"), signature);
  assert(signature.includes("readonly maxCalls: number;"), signature);
});
