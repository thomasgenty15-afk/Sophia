// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA — LE CÂBLAGE DES LOTS 1A ET 1B, ÉPINGLÉ SUR LA SOURCE
//
// ⛔ POURQUOI UN TEST DE SOURCE ET PAS UN TEST DE COMPORTEMENT. Ces trois
// épingles portent sur des choses qu'aucun appel ne peut rendre visible sans
// un vrai tir de modèle: quelle expression le handler passe, et combien de
// fois une décision est écrite. Le lot interdit tout appel payé; ce qui reste
// vérifiable est la SOURCE, et c'est exactement ce que les tests de câblage de
// ce dépôt font déjà (`plan_validation_wiring_test.ts`).
//
// ⚠️ CE N'EST PAS UNE PREUVE DE FONCTIONNEMENT. Un test de présence de chaîne
// ne dit pas qu'un plan est juste; il dit qu'une décision n'a pas été écrite
// deux fois. Les preuves de comportement sont dans `final_plan_gate_test.ts`,
// `meal_generation_test.ts` et `household_diet_test.ts`.
// ══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
// La racine du dépôt — `supabase/functions/` remonte de deux crans de plus.
const REPO = new URL("../../", FUNCTIONS_DIR);
const HANDLER = await Deno.readTextFile(
  new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
);
const PROMPT = await Deno.readTextFile(
  new URL("_shared/keel/household_meal_generation.ts", FUNCTIONS_DIR),
);

Deno.test("BÊTA 1A ④ — le canal des boîtes est fermé par LA MÊME condition que son schéma", () => {
  // ⛔ LE DÉFAUT D'ORIGINE ÉTAIT EXACTEMENT CE DÉSACCORD: le schéma des
  // contenants ne partait pas sous `portion_v1`, et l'ordre de partage par
  // boîte partait quand même. Deux lectures du même chemin, à 5 000 lignes
  // d'écart.
  assert(
    PROMPT.includes('input.sizingPath === "portion_v1"\n    ? []\n    : boxSchemaBlock('),
    "le schéma des contenants ne se ferme plus sous portion_v1",
  );
  assert(
    HANDLER.includes('boxChannelOpen: sizing.path !== "portion_v1",'),
    "le bloc de régime ne lit plus le même chemin que le schéma",
  );
  assertEquals(
    HANDLER.split("boxChannelOpen:").length - 1,
    1,
    "une seule écriture de la décision dans le handler",
  );
});

Deno.test("BÊTA 1A — la garde finale reçoit les obligations de LA grille, pas une seconde lecture", () => {
  // ⛔ `householdGrid.cells` EST LA SEULE SOURCE. `dishBearingMembers`, le bloc
  // de régime du prompt et la liste fermée du parseur en descendent déjà; une
  // quatrième liste rouvrirait la porte fermée le 2026-09-14 (§ 2.2), où le
  // même message commandait un plat à part à la personne que la casserole
  // servait déjà.
  assert(
    HANDLER.includes("dedicated: householdGrid.cells.flatMap((c) =>"),
    "les obligations passées à la garde ne viennent plus de la grille",
  );
  assertEquals(
    HANDLER.split("dedicated: householdGrid.cells.flatMap").length - 1,
    1,
  );
});

Deno.test("BÊTA 1A ② — la case passée au parseur porte sa bouche", () => {
  // ⛔ SANS `memberId`, LA PORTE DE CASE EST GRANDE OUVERTE et le point ⑥ de la
  // clôture reste entier: un plat promis à Nils, adressé à Lea, accepté.
  assert(
    HANDLER.includes("c.dedicated.map((d) => ({\n        day: c.day,\n        slot: c.slot as EatingOccasion,\n        memberId: d.memberId,\n      }))"),
    "le budget de composition ne nomme plus la bouche de chaque case",
  );
  // ⚠️ ET LA FUSION GARDE SON `null`, EXPLICITEMENT: une reprise nomme UNE
  // personne, la case n'a personne à départager.
  assert(
    HANDLER.includes("mergedEaterCells.map((c) => ({ ...c, memberId: null }))"),
    "la fusion ne dit plus que sa case n'a pas de bouche à départager",
  );
});

Deno.test("BÊTA 1B ③ — la demande intenable est refusée AVANT le premier appel payé", () => {
  // ⛔ L'EXIGENCE EST ÉCRITE DANS LE PLAN: « vérifier zéro appel modèle sur une
  // impossibilité déjà établie avant composition ». Ce qui la tient est la
  // POSITION du refus dans le fichier — il est dans le corps principal, pas
  // dans un `catch`, et il précède les deux seuls sites d'appel au fournisseur.
  const refus = HANDLER.indexOf('error: "plan_demand_infeasible"');
  // ⟳ 2026-09-14 · BÊTA 2B — L'ANCRE A CHANGÉ: l'appel est enveloppé par
  // `appelModele` depuis que les pannes ont un jeton. C'est toujours le
  // PREMIER appel payé du fichier.
  const premierAppel = HANDLER.indexOf('await appelModele("composition"');
  assert(refus > 0, "le refus de demande intenable a disparu");
  assert(premierAppel > 0, "le site d'appel au fournisseur a changé de nom");
  assert(
    refus < premierAppel,
    "le refus passe APRÈS un appel payé: la garde ne protège plus rien",
  );
  // ⚠️ ET IL EST CALCULÉ SUR LES CONTRATS, pas sur une seconde lecture des
  // couloirs: `infeasibleDemands` lit le statut que `slotContractsFor` pose
  // APRÈS avoir tenté la relâche de la journée.
  assert(HANDLER.includes("const demandesIntenables = infeasibleDemands({"));
  assertEquals(HANDLER.split("infeasibleDemands({").length - 1, 1);
});

Deno.test("BÊTA 1B ③ — le refus ne porte AUCUN chiffre", () => {
  // ⛔ LES CALORIES ET L'OBJECTIF DE QUELQU'UN SONT PROTÉGÉS À L'ÉCRAN, et ce
  // corps y va. Le moteur dit QUOI CHANGER, jamais combien il manque — c'est
  // la même règle que `CALORIE_PROTECTED_CAUSES`, appliquée à un refus qui
  // n'existait pas encore quand cette liste a été écrite.
  const debut = HANDLER.indexOf('error: "plan_demand_infeasible"');
  const corps = HANDLER.slice(debut, debut + 900);
  for (const interdit of ["targetKcal", "composeKcal", "kcal", "densityMin", "per100"]) {
    assert(
      !corps.includes(interdit),
      `le corps du refus porte « ${interdit} »`,
    );
  }
});

Deno.test("BÊTA 1B ⑧ — la lane foyer EXIGE ses sept contrôles, et la publication lit l'état", () => {
  // ⛔ `[]` ICI SERAIT UNE GARDE DÉSARMÉE QUI RESSEMBLE À UNE GARDE QUI MARCHE:
  // la liste est construite, passée, et n'exige rien.
  assert(
    HANDLER.includes("delivery: finalGateDelivery(gate, HOUSEHOLD_BETA_ESSENTIALS),"),
    "la lane foyer n'exige plus ses contrôles essentiels",
  );
  const PUBLICATION = Deno.readTextFileSync(
    new URL("_shared/keel/plan_publication.ts", FUNCTIONS_DIR),
  );
  // ⛔ ET LA PUBLICATION LIT L'ÉTAT, PAS `blocking.length`. Les deux étaient
  // équivalents; ils ne le sont plus — un contrôle absent ne produit AUCUNE
  // bloquante, et lire `blocking` aurait publié ce plan-là.
  assert(
    PUBLICATION.includes('args.gateDelivery.state === "not_deliverable"'),
    "la publication ne lit plus l'état de livraison",
  );
  assert(
    !PUBLICATION.includes("args.gateDelivery.blocking.length > 0"),
    "la publication lit encore le nombre de bloquantes",
  );
});

Deno.test("BÊTA 1C ④⑪ — la casserole est réconciliée APRÈS les bornes et AVANT les courses", () => {
  // ⛔ C'EST UN TEST D'ORDRE, ET L'ORDRE EST LE DÉFAUT. `pot_shrink` existait,
  // tournait, et comptait — 400 lignes trop tôt, sur les tirages d'avant le
  // dimensionnement. Après le rabotage des bornes, 277 g restaient achetés,
  // cuisinés, servis à personne (`pot_attribution 1 → 0,85`, tir `sna1`).
  const bornes = HANDLER.indexOf("const portionBoundary = fitPortionsToBounds({");
  const reconcile = HANDLER.indexOf("const potReconcile = {");
  const courses = HANDLER.indexOf("const shoppingRebuild = (() => {");
  assert(bornes > 0 && reconcile > 0 && courses > 0, "un des trois blocs a disparu");
  assert(bornes < reconcile, "la réconciliation passe AVANT le rabotage: elle ne voit rien");
  assert(
    reconcile < courses,
    "la réconciliation passe APRÈS les courses: la liste garde ce qu'on ne cuit plus",
  );
});

Deno.test("BÊTA 1C ④ — la seconde passe ne REGRAMME pas: le rabotage survit", () => {
  // ⛔ LA MOITIÉ QUI POURRAIT TOUT DÉFAIRE. La PREMIÈRE passe appelle
  // `regramMeal` après avoir rétréci, pour que les boîtes suivent la
  // casserole. Ici c'est l'inverse: les boîtes sont définitives (arrondi,
  // bornes du repas, contrôle final) et c'est la casserole qui les suit. Un
  // `regramMeal` dans ce bloc réécrirait les grammes servis et effacerait le
  // rabotage que les bornes viennent d'écrire.
  const debut = HANDLER.indexOf("const potReconcile = {");
  const fin = HANDLER.indexOf("const shoppingRebuild = (() => {");
  const bloc = HANDLER.slice(debut, fin);
  assert(!bloc.includes("regramMeal("), "la seconde passe regramme: elle défait les bornes");
  // ⚠️ ET ELLE N'A PAS SON PROPRE BARÈME: la règle reste `potShrinkPlan`.
  assert(bloc.includes("potShrinkPlan("));
  assertEquals(HANDLER.split("potShrinkPlan(").length - 1, 2, "deux passes, une seule règle");
});

Deno.test("BÊTA 1C ⑤ — l'identité de la casserole est un NOMBRE, pas une phrase", () => {
  // ⛔ CE QUI MANQUAIT AUX TROIS RAPPORTS. « Ce qu'une casserole produit = ce
  // que les boîtes en prélèvent + ce qui reste » était écrit partout et mesuré
  // nulle part. Sur le parcours réel du 2026-09-14: produit 6 146 g, prélevé
  // 6 181 g — **-35 g**, sous la tolérance de `potShrinkPlan`, donc aucun
  // verdict ne mordait et rien ne le disait.
  const debut = HANDLER.indexOf("const potReconcile = {");
  const fin = HANDLER.indexOf("const shoppingRebuild = (() => {");
  assert(debut > 0 && fin > debut, "le bloc de réconciliation a disparu");
  const bloc = HANDLER.slice(debut, fin);
  assert(bloc.includes("reste: 0,"), "le compteur de reste n'est plus déclaré");
  // ⛔ ET IL SE CALCULE, SUR LES DEUX MASSES FINALES. Un compteur déclaré qui
  // ne bouge jamais est pire qu'un compteur absent: il ressemble à une mesure.
  assert(
    bloc.includes(
      "potReconcile.reste = potReconcile.ready_after - potReconcile.drawn_final;",
    ),
    "le reste ne se calcule plus, ou plus sur ces deux masses-là",
  );
  // ⚠️ APRÈS la réconciliation: calculé avant, il décrirait des casseroles que
  // le rabotage n'a pas encore touchées.
  const calcul = bloc.indexOf("potReconcile.reste =");
  const mesure = bloc.indexOf("potReconcile.ready_after +=");
  assert(mesure > 0 && calcul > mesure, "le reste se calcule avant d'avoir une masse finale");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 2B — DEUX CLICS NE PAIENT PLUS DEUX FOIS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("BÊTA 2B — le verrou est pris APRÈS l'admission et AVANT tout appel payé", () => {
  // ⛔ SA POSITION EST LA GARDE. Plus tôt, on verrouillerait le foyer d'un
  // appelant qui n'a pas le droit de composer; plus tard, on aurait déjà
  // dépensé — et c'est précisément la dépense en double qu'on ferme.
  const admission = HANDLER.indexOf("const admission = resolveGenerationAdmission({");
  const verrou = HANDLER.indexOf('await admin.rpc("keel_household_claim_generation"');
  // ⟳ 2026-09-14 · BÊTA 2B — L'ANCRE A CHANGÉ: l'appel est enveloppé par
  // `appelModele` depuis que les pannes ont un jeton. C'est toujours le
  // PREMIER appel payé du fichier.
  const premierAppel = HANDLER.indexOf('await appelModele("composition"');
  assert(admission > 0 && verrou > 0 && premierAppel > 0, "un des trois sites a disparu");
  assert(admission < verrou, "le verrou est pris avant de savoir qui appelle");
  assert(verrou < premierAppel, "le verrou est pris APRÈS un appel payé");
});

Deno.test("BÊTA 2B — le verrou se rend dans un `finally`, pas à chaque `return`", () => {
  // ⛔ CETTE FONCTION A PLUS DE QUARANTE SORTIES. En oublier une bloquerait le
  // foyer jusqu'à la péremption, et ce serait l'oubli qu'aucun test ne voit —
  // un `return` ajouté six mois plus tard.
  assert(
    HANDLER.includes('await releaseGenerationLock("request_end");'),
    "la libération a quitté le `finally`",
  );
  // ⚠️ TROIS OCCURRENCES: la déclaration, le corps de l'aide (dont le nom
  // apparaît dans sa propre trace) et l'unique appel du `finally`.
  assertEquals(
    HANDLER.split("await releaseGenerationLock(").length - 1,
    1,
    "la libération est appelée ailleurs que dans le `finally`",
  );
  const finallyAt = HANDLER.lastIndexOf("} finally {");
  const catchAt = HANDLER.lastIndexOf("} catch (error) {");
  assert(finallyAt > catchAt, "le `finally` ne ferme pas le `try` extérieur");
});

Deno.test("BÊTA 2B — la péremption du verrou n'est pas écrite deux fois", () => {
  // ⛔ « DEUX COPIES D'UN MÊME NOMBRE DIVERGENT » — la règle de `maxFridgeDays`
  // et de `p_local_date`. Le délai vient du budget de requête + sa marge, et la
  // migration n'en porte AUCUN défaut (`p_stale_after` est obligatoire).
  assert(
    HANDLER.includes("const lockTtlMs = PLAN_REQUEST_BUDGET_MS + GENERATION_LOCK_MARGIN_MS;"),
    "la péremption ne descend plus du budget de requête",
  );
  const sql = Deno.readTextFileSync(
    new URL("supabase/migrations/20260914100000_une_seule_generation_a_la_fois_par_foyer.sql", REPO),
  );
  assert(
    sql.includes("'stale_after_required'"),
    "la fonction SQL accepte un délai absent: la garde serait désarmée",
  );
  // ⚠️ ON LIT LES LIGNES DE CODE, PAS LES COMMENTAIRES: le pavé du paramètre
  // cite lui-même le geste interdit pour dire pourquoi il l'est. Un `includes`
  // sur tout le fichier rougirait sur sa propre explication.
  const codeSql = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"));
  assertEquals(
    codeSql.filter((l) => l.includes("coalesce(p_stale_after")),
    [],
    "un défaut SQL ferait diverger les deux délais",
  );
});

Deno.test("BÊTA 2B — l'aperçu et l'activation ont la MÊME borne client", () => {
  // ⛔ L'APERÇU N'EN AVAIT AUCUNE: `...(intent === "draft" ? {} : { timeout })`.
  // Le geste qui termine l'entonnoir attendait indéfiniment.
  const src = Deno.readTextFileSync(
    new URL("frontend/src/keel/api/planDraft.ts", REPO),
  );
  // ⟳ 2026-09-14 — LA BORNE EST DEVENUE NOTRE PROPRE `AbortController`, et
  // c'est ce qu'il faut épingler maintenant. L'option `timeout` de la
  // bibliothèque coupait à la même seconde, mais rendait un
  // `FunctionsFetchError` dont le message est IDENTIQUE à celui d'un réseau
  // coupé: l'écran ne pouvait pas distinguer « notre délai a expiré, le
  // serveur continue » de « la panne ». Mesuré le 2026-09-14 sur le parcours
  // réel — l'adoption affichait la chaîne anglaise de la bibliothèque.
  assert(
    src.includes("setTimeout(() => deadline.abort(), PLAN_CLIENT_TIMEOUT_MS)"),
    "la borne client a disparu",
  );
  assert(
    src.includes("signal: deadline.signal,"),
    "la borne n'est plus branchée sur l'appel",
  );
  assert(
    src.includes('if (recovered.kind === "in_flight") throw new Error("plan_still_composing");'),
    "un état réellement relu en vol n'a plus de motif à lui",
  );
  assert(src.includes("await settleInterruptedGeneration(requestId)"));
  // ⟳ 2026-09-15 · LOT E — Composer n'a plus de transport à lui : c'est une
  // façade sur `composeDraft` (202 + relecture de la ligne) puis
  // `writeFromDraft`. La borne et la reprise vivent une seule fois, dans
  // `planDraft.ts`, épinglées juste au-dessus.
  const foyer = Deno.readTextFileSync(
    new URL("frontend/src/keel/api/household.ts", REPO),
  );
  assert(
    !foyer.includes('functions.invoke("generate-household-meal-v1"'),
    "la lane du foyer a retrouvé un transport à elle",
  );
  assert(foyer.includes("await composeDraft(input, { onProgress: args.onProgress })"));
  assert(foyer.includes("await writeFromDraft(input, draftId, intent, args.replaces ?? null)"));
  assert(
    !src.includes('intent === "draft" ? {} : { timeout'),
    "une des deux intentions est encore sans borne",
  );
  const api = Deno.readTextFileSync(
    new URL("frontend/src/keel/api/mealGeneration.ts", REPO),
  );
  // ⛔ LA BORNE CLIENT DOIT RESTER STRICTEMENT SOUS LA PASSERELLE. Kong coupe à
  // 150 s (`read_timeout`, « to match hosted project »): au-dessus, la personne
  // reçoit une erreur de passerelle au lieu d'une phrase du produit. Et une
  // borne trop basse abandonnerait des générations qui reviennent — les durées
  // réelles de cette lane sont de 116 à 144 s.
  const borne = Number(
    /PLAN_CLIENT_TIMEOUT_MS = ([0-9_]+)/.exec(api)?.[1]?.replaceAll("_", "") ?? "0",
  );
  const passerelle = Number(
    /GATEWAY_READ_TIMEOUT_MS = ([0-9_]+)/.exec(api)?.[1]?.replaceAll("_", "") ?? "0",
  );
  assert(borne > 0 && passerelle > 0, "une des deux constantes a disparu");
  assert(borne < passerelle, `borne ${borne} >= passerelle ${passerelle}`);
  // ⟳ 2026-09-15 · LOT E — la relecture couvre DEUX baux et un tick de relance ;
  // 235 s s'arrêtait 60 s avant le bail, et `plan_expired` était inatteignable.
  assert(api.includes(
    "export const PLAN_RECOVERY_WAIT_MS = 2 * PLAN_LEASE_DEADLINE_MS + PLAN_RELAUNCH_GRACE_MS;",
  ));
  // ⚠️ ET PAS TROP BAS NON PLUS: sous 145 s, on renonce à des générations
  // mesurées entre 116 et 144 s.
  assert(borne >= 145_000, `borne ${borne} sous les durées réelles mesurées`);
  // ⚠️ LA PASSERELLE EST UN FAIT, PAS UN RÉGLAGE: `kong.yml` le porte, et ce
  // test le relit pour que la constante ne dérive pas toute seule.
  const kong = Deno.readTextFileSync(
    new URL("scripts/local_extend_kong_functions_timeout.sh", REPO),
  );
  assert(
    kong.includes("read_timeout: 150000ms to match hosted limits"),
    "la coupure de passerelle a changé: la borne client doit être relue",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 2C — UN FREIN QUI NE COUPE PAS LA LECTURE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("BÊTA 2C — le frein est lu à l'admission, avant le verrou et avant toute dépense", () => {
  // ⛔ SA PLACE EST LA MOITIÉ DE LA GARDE. Après l'admission, parce qu'un
  // membre secondaire doit lire `not_owner` avant d'apprendre qu'un incident
  // est en cours; avant le verrou, parce qu'une requête refusée ne doit rien
  // avoir pris.
  const admission = HANDLER.indexOf("const admission = resolveGenerationAdmission({");
  const frein = HANDLER.indexOf('await admin.rpc("keel_generation_pause_state")');
  const verrou = HANDLER.indexOf('await admin.rpc("keel_household_claim_generation"');
  // ⟳ 2026-09-14 · BÊTA 2B — L'ANCRE A CHANGÉ: l'appel est enveloppé par
  // `appelModele` depuis que les pannes ont un jeton. C'est toujours le
  // PREMIER appel payé du fichier.
  const premierAppel = HANDLER.indexOf('await appelModele("composition"');
  assert(frein > 0, "le frein a disparu du handler");
  assert(admission < frein, "le frein parle avant de savoir qui appelle");
  assert(frein < verrou, "le frein passe après la prise du verrou");
  assert(frein < premierAppel, "le frein passe après un appel payé");
});

Deno.test("BÊTA 2C — le frein échoue OUVERT, et c'est le SQL qui le dit", () => {
  // ⛔ UNE PANNE DE LECTURE DU FREIN NE DOIT PAS DEVENIR UNE PANNE DE SERVICE.
  // L'inverse ferait tomber le produit pour la raison exacte qui devait le
  // protéger. Le `coalesce` vit dans la fonction SQL: un seul lecteur, une
  // seule direction d'échec.
  const sql = Deno.readTextFileSync(
    new URL("supabase/migrations/20260914110000_un_frein_pour_la_beta_sans_couper_la_lecture.sql", REPO),
  );
  assert(sql.includes("'paused', false, 'reason', '', 'since', null"), "le repli a disparu");
  assert(HANDLER.includes('issues.push("generation_pause_unreadable")'), "la panne n'est plus comptée");
  // ⚠️ ET IL NE TOUCHE QU'UN SEUL POINT. Un frein posé à deux endroits en
  // laisserait un derrière au premier refactor.
  assertEquals(HANDLER.split("keel_generation_pause_state").length - 1, 1);
});

Deno.test("BÊTA 2C — le frein ne connaît aucune table de plan", () => {
  // ⛔ « SUSPENDRE LES NOUVELLES GÉNÉRATIONS TOUT EN LAISSANT LIRE LES PLANS
  // ENCORE VALIDES ». La preuve structurelle: la migration ne nomme aucune
  // table de lecture, ne pose aucune policy dessus, et ne révoque rien
  // ailleurs que sur la sienne.
  const sql = Deno.readTextFileSync(
    new URL("supabase/migrations/20260914110000_un_frein_pour_la_beta_sans_couper_la_lecture.sql", REPO),
  );
  const code = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  for (const table of ["student_meal_plans", "meal_plan_entries", "student_week_plans"]) {
    assert(!code.includes(table), `le frein touche « ${table} »`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 2B — UNE PANNE D'APPEL A UNE PHRASE, PAS UNE CHAÎNE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("BÊTA 2B — les deux appels au modèle sont marqués à leur SITE", () => {
  // ⛔ CLASSER « EST-CE UNE PANNE FOURNISSEUR ? » EN RELISANT LE MESSAGE serait
  // un matcher maison sur du texte que nous n'écrivons pas tous — la cicatrice
  // des 12 faux positifs sur 12. Le site d'appel, lui, SAIT.
  assert(HANDLER.includes('await appelModele("composition", () =>'));
  assert(HANDLER.includes('await appelModele("repair", () =>'));
  // ⚠️ ET AUCUN APPEL NU NE RESTE: un troisième site ajouté demain rendrait à
  // nouveau la chaîne anglaise du fournisseur.
  assertEquals(
    HANDLER.split("await generateWithGemini(").length - 1,
    0,
    "un appel au modèle n'est pas marqué",
  );
  assertEquals(HANDLER.split("generateWithGemini(").length - 1, 2);
});

Deno.test("BÊTA 2B — le `catch` rend un JETON, pas le message du fournisseur", () => {
  assert(HANDLER.includes('error: "composition_unavailable"'));
  // ⛔ ET IL PASSE AVANT LE 500 GÉNÉRIQUE: après, il ne serait jamais atteint.
  const jeton = HANDLER.indexOf('error: "composition_unavailable"');
  // ⛔ LE 500 GÉNÉRIQUE DU `catch` EXTÉRIEUR, pas un autre: on l'ancre sur son
  // `ok: false`, qui n'existe qu'à cette sortie-là.
  const generique = HANDLER.indexOf("      ok: false,\n      error: readableErrorMessage(error),");
  assert(jeton > 0 && generique > 0, "une des deux sorties a disparu");
  assert(jeton < generique, "le jeton passe après le 500 générique");
  // ⚠️ LE MESSAGE D'ORIGINE N'EST PAS PERDU: il vient d'être écrit au journal.
  const avant = HANDLER.lastIndexOf("await logEdgeFunctionError({", jeton);
  assert(avant > 0 && avant < jeton, "le message d'origine ne part plus au journal");
});

Deno.test("BÊTA 2B — la phrase existe dans les deux langues, et ne nomme aucun fournisseur", () => {
  const copy = Deno.readTextFileSync(
    new URL("frontend/src/keel/copy/planRefusals.ts", REPO),
  );
  assert(copy.includes('composition_unavailable: "plan.refusal.composition_unavailable"'));
  for (const lang of ["fr", "en"]) {
    const src = Deno.readTextFileSync(
      new URL(`frontend/src/keel/i18n/${lang}.ts`, REPO),
    );
    const at = src.indexOf('"plan.refusal.composition_unavailable":');
    assert(at > 0, `${lang}: la phrase manque`);
    const phrase = src.slice(at, at + 400);
    // ⛔ AUCUN NOM DE FOURNISSEUR NI DE MODÈLE SUR UNE SURFACE LUE.
    for (const interdit of ["OpenAI", "Gemini", "gpt-", "rate limit", "429"]) {
      assert(
        !phrase.includes(interdit),
        `${lang}: la phrase porte « ${interdit} »`,
      );
    }
  }
});

Deno.test("BÊTA 2B — une panne d'appel reste un INCIDENT, un refus de saisie non", () => {
  // ⛔ C'EST UN TEST DU DÉPÔT QUI ME L'A APPRIS. La première écriture de la
  // branche `composition_unavailable` posait `skipErrorLog: true`, par symétrie
  // avec les refus d'admission. `meal_plan_integrity_test.ts` (C5 ④) a rougi, et
  // son critère est le bon: « la saisie se tait, la panne PARLE ».
  const at = HANDLER.indexOf('error: "composition_unavailable"');
  assert(at > 0);
  const bloc = HANDLER.slice(at, at + 220);
  assert(
    !bloc.includes("skipErrorLog"),
    "une panne d'appel au modèle a été mise au silence",
  );
  // ⚠️ ET LES QUATRE REFUS DE SAISIE, EUX, SE TAISENT: un foyer gelé, un frein
  // tiré, une demande déjà en vol et une demande intenable sont des CHOIX, pas
  // des pannes. Les laisser parler noierait le journal où l'on cherche les
  // vraies.
  for (const jeton of ["generation_paused", "generation_in_flight", "household_frozen"]) {
    const i = HANDLER.indexOf(`error: "${jeton}"`);
    assert(i > 0, `le refus « ${jeton} » a disparu`);
    assert(
      HANDLER.slice(i, i + 400).includes("skipErrorLog: true"),
      `« ${jeton} » repart dans le journal d'incidents`,
    );
  }
});
