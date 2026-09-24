/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÉTAPE C5 — LE REFUS ET LE STATUT SONT BRANCHÉS JUSQU'À LA LIVRAISON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI DES ÉPINGLES DE SOURCE. `plan_validation.ts` est pur et
 * entièrement testé — et ça ne dit RIEN de l'endroit où il tourne. Or l'endroit
 * EST le lot : jusqu'au 2026-09-12, `FINAL_GATE_POLICY_LOT_4` était écrite et
 * sans appelant (`NON-BRANCHE.md` § ①), et la branche 422 était donc
 * INATTEIGNABLE. « Codé », « testé en isolation » et « branché jusqu'à la
 * livraison » sont trois états différents ; ce fichier éprouve le troisième.
 *
 * ⚠️ CHAQUE ÉPINGLE DE POSITION EST DOUBLÉE D'UNE COUPE : sans elle, ce sont
 * deux `indexOf` sur des chaînes qui pourraient disparaître ensemble.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { CALORIE_PROTECTED_CAUSES } from "./plan_validation.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const SRC = stripComments(
  await Deno.readTextFile(
    new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
  ),
);
const VALIDATION_SRC = await Deno.readTextFile(
  new URL("_shared/keel/plan_validation.ts", FUNCTIONS_DIR),
);
const FRONT_SRC = await Deno.readTextFile(
  new URL("../../frontend/src/keel/api/planValidation.ts", FUNCTIONS_DIR),
);
// ⟳ 2026-09-13 · LOT 2 § 2.3 — LE BLOC D'ORCHESTRATION EXTRAIT. On lit sa
// source pour épingler qu'aucun de ses paramètres de garde n'est devenu
// facultatif, et qu'il ne lit ni environnement ni en-tête.
const PUBLICATION_SRC = stripComments(
  await Deno.readTextFile(
    new URL("_shared/keel/plan_publication.ts", FUNCTIONS_DIR),
  ),
);

const GARDE = "const gate = finalPlanGate(asGatePlan(writePayload), gateContext);";
// ⟳ 2026-09-13 · LOT 2 § 2.3 — LA PORTE A CHANGÉ DE FORME, PAS DE PLACE. Les
// quatre refus sont maintenant des branches sur le verdict du bloc extrait
// (`decidePlanPublication`), et c'est LUI qui appelle la publication.
const PORTE = 'if (publication.kind === "not_deliverable") {';
const REFUS = 'error: "plan_not_deliverable"';
const BLOC = "const publication = await decidePlanPublication({";
const PUBLIER = "const publier = async (): Promise<Response> => {";
const MAGASIN = '"keel_household_complete_draft_generation"';
const ECRITURE = '"keel_household_publish_generation"';
/** La branche ① : le relevé final a jeté. */
const PORTE_OUTPUT_LOCK_UNAVAILABLE = 'publication.source === "output_lock"';
const RECORD = "const planValidation = gateOut === null || gateDelivery === null";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA POLITIQUE ARMÉE EST CELLE QUI TOURNE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C5 CÂBLAGE ① — la garde tourne sous le LOT 4, et le LOT 1 a disparu", () => {
  assertEquals(
    SRC.split("policy: FINAL_GATE_POLICY_LOT_4,").length - 1,
    1,
    "une seule politique passée à la garde finale",
  );
  // ⛔ LA MORSURE: tant que le lot 1 est encore passé quelque part, une partie
  // du plan sort d'une garde qui ne mord pas — et personne ne le verrait.
  assertEquals(
    SRC.split("policy: FINAL_GATE_POLICY_LOT_1,").length - 1,
    0,
    "aucun appel ne reste sous la politique qui ne mord pas",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA PORTE EST APRÈS LA RÉPARATION, ET AVANT TOUTE ÉCRITURE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C5 CÂBLAGE ② — le refus empêche l'aperçu ET l'écriture", () => {
  const publier = SRC.indexOf(PUBLIER);
  const bloc = SRC.indexOf(BLOC);
  const porte = SRC.indexOf(PORTE);
  const magasin = SRC.indexOf(MAGASIN);
  const ecriture = SRC.indexOf(ECRITURE);
  assert(publier > 0, "la fonction de publication a disparu");
  assert(bloc > publier, "le bloc extrait ne suit plus la publication");
  assert(porte > bloc, "la porte de refus ne lit plus le verdict du bloc");
  assert(magasin > 0 && ecriture > 0, "les deux écritures existent");
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 2 § 2.3 — « APRÈS DANS LE FICHIER » N'EST PLUS LA
  //                PREUVE, ET C'EST UN PROGRÈS
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ « AJOUTER UN MESSAGE OU COMPTER `blocking` NE SUFFIT PAS ». Ce qui est
  // éprouvé ici est que les DEUX écritures du fichier sont enfermées dans
  // `publier`, et que `publier` n'a qu'un seul lecteur: le paramètre `publish`
  // du bloc extrait. C'est `plan_publication_test.ts` qui compte les appels sur
  // une vraie exception; ici on épingle qu'il n'existe pas d'autre chemin.
  assert(
    magasin > publier && magasin < bloc,
    "le magasin d'aperçu est sorti de `publier`",
  );
  assert(
    ecriture > publier && ecriture < bloc,
    "l'écriture du plan est sortie de `publier`",
  );
  assertEquals(
    SRC.split("publier").length - 1,
    2,
    "`publier` est déclarée une fois et passée une fois — pas plus",
  );
  assert(SRC.includes("publish: publier,"), "le bloc extrait n'écrit plus rien");
  // ⛔ ET LE `return` EST DANS LA PORTE, pas ailleurs: une porte qui pousserait
  // une `issue` et laisserait couler est exactement ce que le lot E avait fait.
  const fin = SRC.indexOf("return publication.result;");
  assert(fin > porte, "la sortie du chemin publié ne suit plus la porte");
  const refus = SRC.indexOf(REFUS, porte);
  assert(refus > porte && refus < fin, "le 422 part depuis la porte");
  assert(SRC.slice(porte, fin).includes("status: 422"), "le refus sort en 422");
});

Deno.test("C5 CÂBLAGE ② — la porte est APRÈS la boucle de réparation", () => {
  // ⛔ LE PIÈGE QUE CE CAS FERME, ET IL A FAILLI ÊTRE LIVRÉ. La garde tourne à
  // CHAQUE tour de la boucle C4; un `return` posé à l'endroit de la garde
  // aurait refusé le PREMIER jet — donc armé le refus en DÉBRANCHANT la
  // réparation. Le plan ordonne l'inverse: « après épuisement … ou le refus si
  // aucune version n'est livrable ».
  const garde = SRC.indexOf(GARDE);
  const passe = SRC.indexOf("const c4Pass = collectPlanDefects({");
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — L'INDENTATION A CHANGÉ (la demande de
  // budget est passée SOUS la vérification du contexte). On épingle l'appel,
  // pas sa colonne: une garde qui rougit sur une indentation ne garde rien.
  const budget = SRC.indexOf("planBudget.askRepair(");
  const porte = SRC.indexOf(PORTE);
  assert(garde > 0 && passe > 0 && budget > 0 && porte > 0);
  assert(garde < passe, "la garde alimente la passe commune");
  assert(passe < budget, "la passe commune décide de l'appel de réparation");
  assert(budget < porte, "la porte ne se referme qu'après le budget");
  // ⟳ 2026-09-13 · LOT 2 § 2.3 — ET LE BLOC EXTRAIT EST APRÈS LE BUDGET. C'est
  // ce qui rend vraie la phrase « un refus ne consomme aucun appel de
  // réparation »: toutes les demandes sont déjà faites quand il décide, et il
  // ne reçoit aucun moyen d'en demander une (`plan_publication_test.ts` § CAS 3).
  assert(
    budget < SRC.indexOf(BLOC),
    "une demande de réparation est passée SOUS le bloc de publication",
  );
  // ⛔ ET IL N'Y A PAS DE SECOND REFUS RESTÉ EN AMONT: un `return` de refus à
  // l'intérieur du `try` de la garde rouvrirait le défaut en silence.
  //
  // ⟳ 2026-09-14 · BÊTA B4 — ILS SONT TROIS. L'identité de casserole ajoute
  // un refus déterministe après la réparation, avant les mêmes écritures.
  // Le second historique reste après la
  // BOUCLE LUI AUSSI. C'est la contrepartie de l'adoption interne d'une
  // candidate que le verrou de sortie a vidée: on la garde pour pouvoir la
  // réparer, et on REFUSE la livraison si une morsure survit
  // (`output_lock_violation`). Sans ce second refus, l'adoption serait une
  // ouverture.
  // ⟳ 2026-09-24 — ET QUATRE : la viande ou le poisson cru que rien ne cuit
  // (`raw_protein_uncooked`), chassé par la boucle, refusé APRÈS elle s'il
  // survit — le même placement que le verrou de sortie.
  assertEquals(
    SRC.split(REFUS).length - 1,
    4,
    "un des quatre refus `plan_not_deliverable` a été ajouté ou retiré",
  );
  const verrou = SRC.indexOf('tag: "keel.household_meal.output_lock_violation"');
  assert(verrou > 0, "le refus du verrou de sortie a disparu");
  assert(
    verrou > passe,
    "le refus du verrou de sortie est AVANT la passe de défauts: il refuserait " +
      "une morsure que la réparation sait fermer",
  );
  // ⛔ ET IL NE SORT AUCUN JETON. Ils nomment l'allergène de quelqu'un, et ce
  // journal se recopie dans un rapport.
  const bloc = SRC.slice(verrou, verrou + 700);
  assert(!bloc.includes("tokens:"), "les jetons du verrou sortent au journal");
});

Deno.test("C5 CÂBLAGE ② — l'unité de fusion est rendue avant le refus", () => {
  const porte = SRC.indexOf(PORTE);
  const fin = SRC.indexOf("return publication.result;");
  assert(porte > 0 && fin > porte, "la porte de refus a disparu");
  const bloc = SRC.slice(porte, fin);
  // Sans cette ligne, un refus coûterait au foyer une fusion pour un plan
  // qu'il n'a jamais reçu.
  assert(
    bloc.includes('await releaseMergeQuota("final_gate_blocking")'),
    "le refus rend l'unité de fusion",
  );
  // ⛔ ET LES QUATRE REFUS LA RENDENT, PAS UN SEUL. Un refus qui la garderait
  // facturerait une fusion pour un plan que personne n'a reçu.
  for (
    const motif of [
      "output_lock_unavailable",
      "output_lock_violation",
      "final_gate_unavailable",
      "final_gate_blocking",
    ]
  ) {
    assert(
      SRC.includes(`await releaseMergeQuota("${motif}")`),
      `le refus ${motif} garde l'unité de fusion`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE RÉSULTAT EST PERSISTÉ, PAS SEULEMENT RENDU
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C5 CÂBLAGE ③ — le statut est écrit dans `generated_from`", () => {
  assert(SRC.includes(RECORD), "le résultat de validation est construit");
  assert(
    SRC.includes(
      "(writePayload.generated_from as Record<string, unknown>).validation =",
    ),
    "il est posé sur le payload qui part en base",
  );
  // ⛔ APRÈS LA GARDE, ET C'EST OBLIGATOIRE: la garde tourne SUR
  // `writePayload`. Poser la clé avant lui ferait juger un plan qui porte déjà
  // son propre verdict, et le verdict d'un tour survivrait à la réparation.
  const garde = SRC.indexOf(GARDE);
  const pose = SRC.indexOf(
    "(writePayload.generated_from as Record<string, unknown>).validation =",
  );
  assert(garde > 0 && pose > garde, "la clé est posée APRÈS la garde");
});

Deno.test("C5 CÂBLAGE ③ — les trois sorties portent le MÊME objet", () => {
  // L'aperçu, le plan écrit et le refus. Trois formes voisines auraient donné
  // trois lecteurs côté écran, et c'est celui qu'on regarde le moins qui
  // garderait l'ancien comportement.
  assertEquals(
    SRC.split("validation: planValidation,").length - 1,
    3,
    "aperçu + plan écrit + corps 422",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA PORTE DES CHIFFRES PROTÉGÉS EST CELLE DU MODULE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C5 CÂBLAGE ④ — le corps 422 passe par `publicRefusals`", () => {
  const porte = SRC.indexOf(PORTE);
  const fin = SRC.indexOf("return publication.result;");
  assert(porte > 0 && fin > porte, "la porte de refus a disparu");
  const bloc = SRC.slice(porte, fin);
  assert(
    bloc.includes("refusals: publicRefusals(publication.delivery.blocking)"),
    "les motifs sortent par la porte, pas en clair",
  );
  // ⛔ LA MORSURE: un `.map((r) => ({ … detail: r.detail }))` remis à la main
  // rouvrirait la fuite sans toucher au module.
  assert(
    !bloc.includes("detail: r.detail"),
    "aucun `detail` n'est recopié à la main dans le corps 422",
  );
});

Deno.test("C5 CÂBLAGE ④ — les deux listes de causes protégées sont IDENTIQUES", () => {
  // ⛔ DEUX LISTES, DEUX CÔTÉS, ET LA DIVERGENCE SERAIT MUETTE — du côté qui
  // fuit. L'écran lit la sienne (`frontend/src/keel/api/planValidation.ts`);
  // ce cas la compare à la source de vérité serveur.
  // ⚠️ ON DÉCOUPE JUSQU'AU `;` DE LA DÉCLARATION, PAS JUSQU'AU PREMIER `]`.
  // Le type porte déjà des crochets (`readonly FinalGateCause[]`), et couper
  // dessus rendait une liste VIDE — c'est-à-dire un test vert des deux côtés
  // quelle que soit la vraie liste. Mesuré au premier lancement.
  const lire = (src: string): string[] => {
    const start = src.indexOf("export const CALORIE_PROTECTED_CAUSES");
    assert(start > 0, "la liste est exportée");
    const end = src.indexOf(";", start);
    assert(end > start, "la déclaration se termine");
    const noms = [...src.slice(start, end).matchAll(/"([a-z_]+)"/g)]
      .map((m) => m[1])
      .sort();
    assert(noms.length > 0, "la découpe a bien trouvé des causes");
    return noms;
  };
  const serveur = lire(VALIDATION_SRC);
  const ecran = lire(FRONT_SRC);
  assertEquals(serveur, [...CALORIE_PROTECTED_CAUSES].sort());
  assertEquals(ecran, serveur, "l'écran garde exactement les mêmes causes");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LA GARDE TOMBÉE NE SE LIT PAS « CONFORME »
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C5 CÂBLAGE ⑤ — garde tombée ⇒ `validation: null`, jamais un verdict", () => {
  const bloc = SRC.slice(SRC.indexOf(RECORD), SRC.indexOf(PORTE));
  assert(
    bloc.includes("gateOut === null || gateDelivery === null"),
    "une garde qui a jeté ne produit aucun verdict",
  );
  assert(bloc.includes("? null"), "elle rend `null`, pas `conforme`");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LES APPELS MORTS DU § 6 — CE QUI EST FERMÉ, ET COMMENT ON LE SAIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C5 ⑥ Z2 — `unmetDemand` ne peut PLUS être appelée sans son estimation", () => {
  // ⛔ LE DÉFAUT FERMÉ: `tubServed` portait `= new Map()`. Un défaut faisait de
  // « aucune journée de bac commun n'est estimable » la réponse SILENCIEUSE de
  // tout appelant qui l'oublie — cicatrice `optional-gate-params-are-disarmed-
  // gates`, et le jumeau exact de la note écrite en face pour `potShrink`.
  const POT = stripComments(
    Deno.readTextFileSync(new URL("_shared/keel/pot_demand.ts", FUNCTIONS_DIR)),
  );
  const signature = POT.slice(
    POT.indexOf("export function unmetDemand("),
    POT.indexOf("): UnmetDemand[] {"),
  );
  assert(signature.includes("tubServed:"), "le paramètre existe");
  assert(
    !signature.includes("tubServed: ReadonlyMap<string, { servedKcal: number | null; wantedKcal: number }> ="),
    "le paramètre n'a plus de valeur par défaut",
  );
  // LE CAS QUI PASSE — le seul appelant de production le passe vraiment.
  assert(
    SRC.includes("unmetDemand(mouthAnchors, dayEnergyRows, potShrink, tubServed)"),
    "le handler passe son estimation de bac",
  );
});

Deno.test("C5 ⑥ Z3 — `empty_intersection` a un producteur ET un agrégateur", () => {
  // ⛔ L'ENTRÉE `Z3` DISAIT « un rendu SANS producteur ». Elle est fausse
  // depuis le lot qui a agrégé les quatre compteurs: la cause est PRODUITE par
  // `mergeCorridors`, appelée par `slot_nutrition_contract.ts`, elle-même
  // importée par le handler — et le handler la SOMME dans son journal.
  const SIZING = stripComments(
    Deno.readTextFileSync(new URL("_shared/keel/portion_sizing.ts", FUNCTIONS_DIR)),
  );
  const CONTRAT = stripComments(
    Deno.readTextFileSync(
      new URL("_shared/keel/slot_nutrition_contract.ts", FUNCTIONS_DIR),
    ),
  );
  assert(
    SIZING.includes('(vide ? "empty_intersection" : null)'),
    "la cause est produite",
  );
  assert(CONTRAT.includes("mergeCorridors("), "le producteur a un appelant");
  assert(
    SRC.includes("../_shared/keel/slot_nutrition_contract.ts"),
    "cet appelant est dans la chaîne du handler",
  );
  assert(
    SRC.includes("densityCounters.empty_intersection += density.counters.empty_intersection"),
    "le handler AGRÈGE le compteur — un compteur non agrégé est un compteur mort",
  );
});

Deno.test("C5 ⑥ Z1 — la garde par LIBELLÉ reste morte, et on le PROUVE", () => {
  // ⛔ LE PLAN L'INTERDIT EN TOUTES LETTRES: « ne pas réactiver une ancienne
  // classification par libellé pour obtenir un compteur vert ». Ce cas est donc
  // une preuve d'ABSENCE, pas un branchement: il rougit le jour où quelqu'un
  // rebranche `scaleFactorsFor` (le seul consommateur de `scalingInputsFor`)
  // dans une fonction edge.
  //
  // ⚠️ `proteinFoodPredicate` résout par `resolveIngredient(index, term)` —
  // c'est-à-dire par le TERME, pas par l'identifiant `ref` que l'étape C3 a
  // rendu prioritaire partout ailleurs. Le rebrancher tel quel réintroduirait
  // la lecture que C3 vient de retirer.
  const edges: string[] = [];
  for (const entry of Deno.readDirSync(FUNCTIONS_DIR)) {
    if (!entry.isDirectory || entry.name.startsWith("_")) continue;
    const index = new URL(`${entry.name}/index.ts`, FUNCTIONS_DIR);
    try {
      edges.push(stripComments(Deno.readTextFileSync(index)));
    } catch { /* pas de handler dans ce dossier */ }
  }
  assert(edges.length > 0, "des fonctions edge ont été lues");
  for (const src of edges) {
    assert(!src.includes("scalingInputsFor"), "Z1 reste hors production");
    assert(!src.includes("proteinFoodPredicate"), "Z1 reste hors production");
    assert(!src.includes("scaleFactorsFor"), "son unique consommateur aussi");
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 § 2.3 — LA VALIDATION INDISPONIBLE, BRANCHÉE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUI A CHANGÉ LE 2026-09-13, ET IL FAUT LE DIRE ICI. Ce bandeau disait :
// « aucun harnais du dépôt ne sait provoquer ce refus », « le `catch` est lu
// par la source, jamais exécuté par un test ». Les deux `try` du handler ont
// été extraits dans `plan_publication.ts`, qui reçoit son contrôle EN
// PARAMÈTRE REQUIS — donc `plan_publication_test.ts` fait jeter le VRAI chemin
// (`finalPlanGate` et `collectOutputSurfaces` sur un plan illisible), parcourt
// le `catch`, la décision, le refus, et COMPTE les écritures.
//
// ⛔ ET IL N'Y A AUCUN INTERRUPTEUR EN PRODUCTION. La panne s'obtient en
// passant une autre fonction, pas en posant un drapeau : le handler ne lit
// aucune variable d'environnement, aucun en-tête et aucun secret sur ce
// chemin. Les trois cas ci-dessous l'épinglent.
//
// ⚠️ CE QUI RESTE ÉPINGLÉ PAR LA SOURCE, ET SEULEMENT PAR ELLE : que le
// handler passe bien le VRAI contrôle et la VRAIE publication au bloc extrait.
// Un test ne peut pas exécuter ce handler de 19 000 lignes.

const PORTE_INDISPO = 'if (publication.kind === "validation_unavailable") {';

Deno.test("§ 2.3 ① — la décision d'activation est prise par le bloc extrait, et par lui seul", () => {
  // ⛔ LE HANDLER NE LIT PLUS L'ÉTAT LUI-MÊME. Il le lisait 150 lignes au-dessus
  // du point d'écriture : deux blocs que rien n'obligeait à rester d'accord.
  assertEquals(
    SRC.split("candidateStateOf(").length - 1,
    0,
    "le handler relit l'état de la candidate hors du bloc extrait",
  );
  assertEquals(
    SRC.split("chooseReplacement({").length - 1,
    0,
    "le handler reprend la décision d'activation",
  );
  // ⛔ ET LE BLOC EXTRAIT EST LE SEUL LECTEUR DE CES DEUX FONCTIONS.
  assertEquals(PUBLICATION_SRC.split("candidateStateOf(").length - 1, 1);
  assertEquals(PUBLICATION_SRC.split("chooseReplacement({").length - 1, 1);
  // ⛔ UN SEUL POINT D'APPEL DANS LE HANDLER. Deux appels rouvriraient deux
  // décisions d'activation, et c'est celle qu'on regarde le moins qui garderait
  // l'ancien comportement.
  assertEquals(SRC.split(BLOC).length - 1, 1);
});

Deno.test("§ 2.3 ① — le contrôle est REQUIS, et aucun drapeau ne peut le remplacer", () => {
  // ⛔ LA MÉTHODE EST IMPOSÉE PAR LE PLAN : « aucun drapeau HTTP, secret ou
  // variable de production permettant de désactiver le contrôle ». La panne
  // s'obtient en passant une autre FONCTION, donc il n'y a rien à désarmer.
  for (const champ of ["validate:", "publish:", "gateDelivery:", "previousIsUsable:"]) {
    assert(
      PUBLICATION_SRC.includes(`readonly ${champ}`),
      `le bloc extrait ne réclame plus ${champ}`,
    );
  }
  // ⛔ REQUIS, JAMAIS `?`. Un paramètre facultatif ferait de « pas de contrôle »
  // le défaut SILENCIEUX de tout appelant qui l'oublie.
  for (const champ of ["validate", "publish", "journal", "onJournalFailure", "gateDelivery"]) {
    assert(
      !PUBLICATION_SRC.includes(`readonly ${champ}?:`),
      `${champ} est devenu facultatif: la garde est désarmée par défaut`,
    );
  }
  // ⛔ ET AUCUNE LECTURE D'ENVIRONNEMENT NI D'EN-TÊTE DANS LE MODULE.
  for (const interdit of ["Deno.env", "process.env", "req.headers", "x-"]) {
    assert(
      !PUBLICATION_SRC.includes(interdit),
      `le bloc extrait lit ${interdit}: un interrupteur a été introduit`,
    );
  }
  // ⛔ ET LA PRODUCTION PASSE TOUJOURS LES VRAIS. Le contrôle du handler est le
  // relevé des surfaces finales, sa publication est `publier`.
  const i = SRC.indexOf(BLOC);
  const fin = SRC.indexOf(PORTE_OUTPUT_LOCK_UNAVAILABLE, i);
  assert(i > 0 && fin > i, "le bloc extrait a disparu");
  const bloc = SRC.slice(i, fin);
  assert(bloc.includes("const surfacesFinales = collectOutputSurfaces({"), bloc);
  assert(bloc.includes("localizeOutputLockBites({"), bloc);
  assert(bloc.includes("publish: publier,"), bloc);
  assert(bloc.includes("gateDelivery,"), bloc);
});

Deno.test("§ 2.3 ① — le refus technique n'active RIEN: ni aperçu, ni ligne de plan", () => {
  const porte = SRC.indexOf(PORTE_INDISPO);
  assert(porte > 0, "la branche `validation_unavailable` a disparu");
  const fin = SRC.indexOf(PORTE, porte);
  assert(fin > porte, "la porte des causes bloquantes ne suit plus");
  const bloc = SRC.slice(porte, fin);
  // ⛔ « AJOUTER UN MESSAGE OU COMPTER NE SUFFIT PAS ». Une `issue` poussée et
  // rien d'autre laisserait le plan partir en base sans qu'aucun contrôle final
  // ait tourné — c'est exactement le défaut que ce lot ferme.
  assert(bloc.includes("return jsonResponse("), bloc);
  assert(bloc.includes("status: 422"), bloc);
  // ⛔ UN MOTIF À PART: `plan_not_deliverable` accuse le plan de la personne;
  // celui-ci accuse notre contrôle, et l'écran peut proposer de relancer.
  assert(bloc.includes('error: "plan_validation_unavailable"'), bloc);
  // ⛔ ET AUCUN VERDICT N'EST RACONTÉ là où rien n'a tourné.
  assert(bloc.includes("validation: null"), bloc);
  assert(
    bloc.includes('await releaseMergeQuota("final_gate_unavailable")'),
    "le refus garde l'unité de fusion d'un plan jamais rendu",
  );
  // ⛔ LES DEUX ÉCRITURES SONT DANS `publier`, ET `publier` N'EST PAS APPELÉE.
  // C'est la propriété que `plan_publication_test.ts` mesure sur une vraie
  // exception; ici on épingle qu'aucun autre chemin d'écriture n'existe.
  const publier = SRC.indexOf(PUBLIER);
  assert(publier > 0 && SRC.indexOf(MAGASIN) > publier, "le magasin est sorti de `publier`");
  assert(SRC.indexOf(ECRITURE) > publier, "l'écriture est sortie de `publier`");
  assert(SRC.indexOf(MAGASIN) < SRC.indexOf(BLOC), "le magasin est sorti de `publier`");
  assert(SRC.indexOf(ECRITURE) < SRC.indexOf(BLOC), "l'écriture est sortie de `publier`");
});

Deno.test("§ 2.3 ① — le SECOND chemin technique rend le MÊME motif, et n'écrit pas plus", () => {
  // ⛔ IL Y EN A DEUX, ET ILS N'ONT PAS LA MÊME CAUSE. Celui-ci est le relevé
  // des surfaces finales: quand il JETTE, une liste vide se relirait « plan
  // sain ». On rend donc le même refus technique qu'une porte tombée.
  const releve = SRC.indexOf(PORTE_OUTPUT_LOCK_UNAVAILABLE);
  assert(releve > 0, "le refus du relevé final a disparu");
  const fin = SRC.indexOf('if (publication.kind === "output_lock_violation") {', releve);
  assert(fin > releve, "le refus du verrou ne suit plus le relevé");
  const bloc = SRC.slice(releve, fin);
  assert(bloc.includes('issues.push("output_lock_unavailable")'), bloc);
  assert(bloc.includes('error: "plan_validation_unavailable"'), bloc);
  assert(bloc.includes("validation: null"), bloc);
  assert(bloc.includes("status: 422"), bloc);
  assert(
    bloc.includes('await releaseMergeQuota("output_lock_unavailable")'),
    "le refus du relevé garde l'unité de fusion",
  );
  // ⛔ LES DEUX CHEMINS SORTENT SOUS LE MÊME MOTIF — et ils sont DEUX, pas un
  // de plus: un troisième site qui rendrait ce motif sans être compté ici
  // échapperait aux deux contrôles de position ci-dessus.
  assertEquals(
    SRC.split('error: "plan_validation_unavailable"').length - 1,
    2,
    "un chemin de refus technique a été ajouté ou retiré",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 § 2.3 — UNE PANNE DE JOURNAL N'EST PAS UNE PANNE DE
//                CONTRÔLE, ET LE HANDLER LES SÉPARE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§ 2.3 ① — le journal de la garde a son propre filet, et son propre motif", () => {
  // ⛔ LE DÉFAUT FERMÉ: `console.log(JSON.stringify(…))` vivait dans le MÊME
  // `try` que `finalPlanGate`. Un cycle, un `BigInt`, un `toJSON` hostile, et
  // une trace tombée se racontait « validation indisponible » — on refusait un
  // plan que la garde venait de juger propre.
  const i = SRC.indexOf("const gateRun = runValidation({");
  assert(i > 0, "la garde ne passe plus par le bloc extrait");
  const fin = SRC.indexOf("if (gateRun.ran) {", i);
  assert(fin > i, "la lecture du résultat de la garde a disparu");
  const bloc = SRC.slice(i, fin);
  assert(bloc.includes("validate: () => {"), "le contrôle n'est plus une fonction passée");
  assert(bloc.includes(GARDE), "ce n'est plus la vraie garde qui est passée");
  assert(bloc.includes("journal: ({ gate, delivery }) => {"), "le journal n'est plus à part");
  // ⛔ ET LES DEUX MOTIFS NE SE CONFONDENT PAS.
  assert(SRC.includes('issues.push("final_gate_journal_failed")'), SRC.slice(fin, fin + 900));
  assert(SRC.includes('issues.push(gateRun.reason)'), "le motif de panne de garde a disparu");
  // ⛔ ET UNE TRACE TOMBÉE NE MET PAS `gateDelivery` À `null`: le verdict est
  // lu depuis `gateRun.value`, pas depuis la réussite du journal.
  assert(SRC.includes("gateDelivery = gateRun.value.delivery;"), SRC.slice(fin, fin + 900));
});
