/**
 * ══════════════════════════════════════════════════════════════════════════
 * § 2.3 — UNE VRAIE PANNE DE VALIDATION, ET CE QU'ELLE N'ÉCRIT PAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE FICHIER FERME. Jusqu'au 2026-09-13, le cas « validation
 * indisponible » n'était prouvé qu'au niveau des TYPES : `candidateStateOf(null)`
 * rend `validation_unavailable`, `chooseReplacement` rend `keep_previous`, plus
 * des épingles qui LISENT la source du handler. Aucune exception n'avait jamais
 * été levée dans ce chemin : le `catch` était lu, jamais exécuté. Un `catch`
 * jamais exécuté est indiscernable d'un `catch` cassé.
 *
 * ⛔ LES EXCEPTIONS D'ICI SONT RÉELLES, ET ELLES VIENNENT DES VRAIES FONCTIONS
 * DE PRODUCTION. Aucune des quatre fonctions du chemin ne porte de `throw` — on
 * ne peut donc pas « demander » à `finalPlanGate` d'échouer. On lui retire un
 * champ de CONTEXTE (`mouths`), et elle jette un vrai `TypeError` ; on retire
 * `dishes` au relevé de surfaces, et il jette le sien. C'est la panne telle
 * qu'elle arriverait en production, pas une simulation.
 *
 * ⛔ ET IL N'Y A AUCUN INTERRUPTEUR EN PRODUCTION. La panne s'obtient en
 * PASSANT UNE AUTRE FONCTION au bloc extrait, jamais en posant un drapeau, un
 * secret ou une variable d'environnement. Le handler, lui, passe toujours la
 * vraie — `plan_validation_wiring_test.ts` l'épingle.
 *
 * ⛔ CE QUI EST MESURÉ N'EST PAS « LE BON MOTIF SORT ». C'est : combien
 * d'écritures ont eu lieu (zéro), et ce que la base contient encore après
 * (l'ancien plan, relu, identique au caractère près). Un test qui n'assert que
 * `error === "plan_validation_unavailable"` ne prouve rien de l'écriture.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  decidePlanPublication,
  runValidation,
} from "./plan_publication.ts";
import {
  CLEAN_HOUSEHOLD_CONTEXT,
  CLEAN_HOUSEHOLD_PLAN,
} from "./final_plan_gate_fixtures.ts";
import {
  FINAL_GATE_POLICY_LOT_4,
  finalGateDelivery,
  finalPlanGate,
} from "./final_plan_gate.ts";
import { collectOutputSurfaces } from "./output_surfaces.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LE MAGASIN : CE QUI COMPTE LES ÉCRITURES, ET CE QUI SE RELIT
// ═══════════════════════════════════════════════════════════════════════════

interface LignePlan {
  readonly id: string;
  readonly payload: string;
  readonly active: boolean;
}

/**
 * ⛔ IL DISTINGUE « POSER LA SITUATION DE DÉPART » ET « ÉCRIRE ». `semer` ne
 * compte pas ; `ecrirePlan` et `rangerBrouillon` comptent. Sans cette
 * distinction, l'ancien plan lui-même ferait monter le compteur et « zéro
 * écriture » deviendrait invérifiable.
 */
class Magasin {
  readonly ecritures: string[] = [];
  private readonly plans = new Map<string, LignePlan>();
  private readonly brouillons = new Map<string, string>();

  semer(id: string, payload: string): void {
    this.plans.set(id, { id, payload, active: true });
  }

  ecrirePlan(id: string, payload: string, remplace: string | null): void {
    this.ecritures.push(`plan:${id}`);
    if (remplace !== null) {
      const ancien = this.plans.get(remplace);
      if (ancien !== undefined) {
        this.plans.set(remplace, { ...ancien, active: false });
      }
    }
    this.plans.set(id, { id, payload, active: true });
  }

  rangerBrouillon(id: string, corps: string): void {
    this.ecritures.push(`draft:${id}`);
    this.brouillons.set(id, corps);
  }

  /** LA RELECTURE. Une copie, jamais la ligne vivante. */
  relire(id: string): LignePlan | null {
    const l = this.plans.get(id);
    return l === undefined ? null : { ...l };
  }

  relireBrouillon(id: string): string | null {
    return this.brouillons.get(id) ?? null;
  }

  /** L'empreinte de TOUT le magasin : plans et brouillons. */
  empreinte(): string {
    return JSON.stringify({
      plans: [...this.plans.entries()].sort(([a], [b]) => a < b ? -1 : 1),
      brouillons: [...this.brouillons.entries()].sort(([a], [b]) => a < b ? -1 : 1),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX CONTRÔLES RÉELS — ET LEUR PANNE RÉELLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA VRAIE GARDE FINALE. `casse: true` lui retire `mouths` de son contexte —
 * elle jette alors un `TypeError` sur `.find`, comme le jour où la grille du
 * foyer manquera.
 */
function gardeReelle(casse: boolean) {
  return runValidation({
    reason: "final_gate_unavailable",
    validate: () => {
      const gate = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
        ...CLEAN_HOUSEHOLD_CONTEXT,
        mouths: casse ? (null as never) : CLEAN_HOUSEHOLD_CONTEXT.mouths,
        policy: FINAL_GATE_POLICY_LOT_4,
      });
      return { gate, delivery: finalGateDelivery(gate, []) };
    },
    journal: null,
  });
}

/**
 * LE VRAI RELEVÉ DES SURFACES FINALES. `casse: true` lui retire `dishes` — il
 * jette « args.dishes is not iterable », comme le jour où un plan arrivera sans
 * plats lisibles.
 */
function releveReel(casse: boolean) {
  return () => {
    const surfaces = collectOutputSurfaces({
      dishes: casse ? (undefined as never) : [],
      preparations: [],
      cookingSessions: [],
      portionNotes: [],
      shoppingTerms: [],
      explanationLines: [],
    });
    return { surfaces, bites: [] as readonly unknown[] };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE CONTRÔLE QUI JETTE, ET LE JOURNAL QUI JETTE — DEUX CHOSES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§ 2.3 ① — la VRAIE garde jette, et son `catch` est PARCOURU", () => {
  const run = gardeReelle(true);
  assertEquals(run.ran, false);
  if (run.ran) throw new Error("inatteignable");
  assertEquals(run.reason, "final_gate_unavailable");
  // ⛔ L'EXCEPTION EST RÉELLE, ET ELLE VIENT DE `finalPlanGate`. Ce n'est pas un
  // `throw new Error("boom")` de test: c'est la vraie fonction de production,
  // avec un champ de contexte manquant.
  assert(run.error instanceof TypeError, String(run.error));
  assert(
    String((run.error as Error).message).includes("find"),
    (run.error as Error).message,
  );
});

Deno.test("§ 2.3 ① — LE CAS QUI PASSE: la même garde, entière, rend un verdict", () => {
  // ⛔ UNE GARDE A BESOIN D'UN CAS QUI PASSE. Sans lui, une garde cassée qui
  // refuse TOUT ressemble à une garde qui marche.
  const run = gardeReelle(false);
  assertEquals(run.ran, true);
  if (!run.ran) throw new Error("inatteignable");
  assertEquals(run.value.delivery.state, "conforme");
  assertEquals(run.value.gate.ok, true);
  assertEquals(run.journal, "none");
});

Deno.test("§ 2.3 ① — un JOURNAL qui jette n'est PAS une validation indisponible", () => {
  // ⛔ LE DÉFAUT FERMÉ, ET IL ÉTAIT DANS LE HANDLER: le `console.log` vivait
  // dans le MÊME `try` que la garde. Un cycle, un `BigInt`, un `toJSON`
  // hostile, et une trace tombée se racontait « validation indisponible » —
  // donc on refusait un plan que la garde venait de juger propre.
  const run = runValidation({
    reason: "final_gate_unavailable",
    validate: () => {
      const gate = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
        ...CLEAN_HOUSEHOLD_CONTEXT,
        policy: FINAL_GATE_POLICY_LOT_4,
      });
      return { gate, delivery: finalGateDelivery(gate, []) };
    },
    // La panne de trace telle qu'elle arrive: `JSON.stringify` sur un cycle.
    journal: () => {
      const cycle: Record<string, unknown> = {};
      cycle.moi = cycle;
      JSON.stringify(cycle);
    },
  });
  // ⛔ LE CONTRÔLE A TOURNÉ, ET SON RÉSULTAT EST INTACT.
  assertEquals(run.ran, true);
  if (!run.ran) throw new Error("inatteignable");
  assertEquals(run.journal, "failed");
  assertEquals(run.value.delivery.state, "conforme");
  assert(run.journalError instanceof TypeError, String(run.journalError));
});

Deno.test("§ 2.3 ① — un contrôle qui jette ne journalise RIEN", () => {
  // ⛔ L'ORDRE EST LA GARDE: journaliser une valeur qui n'existe pas est la
  // façon la plus simple de transformer une panne en DEUXIÈME panne.
  let journaux = 0;
  const run = runValidation({
    reason: "final_gate_unavailable",
    validate: () => {
      throw new Error("le contrôle est tombé");
    },
    journal: () => {
      journaux += 1;
    },
  });
  assertEquals(run.ran, false);
  assertEquals(journaux, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LES CINQ CAS — ET CE QU'ILS N'ÉCRIVENT PAS
// ═══════════════════════════════════════════════════════════════════════════

/** Le corps de `publier` : les DEUX écritures du chemin, et rien d'autre. */
function publierVers(
  magasin: Magasin,
  opts: { readonly brouillon: boolean; readonly planId: string; readonly payload: string; readonly remplace: string | null },
) {
  const appels: string[] = [];
  const publish = (): Promise<string> => {
    appels.push("publish");
    if (opts.brouillon) {
      magasin.rangerBrouillon(opts.planId, opts.payload);
      return Promise.resolve("draft");
    }
    magasin.ecrirePlan(opts.planId, opts.payload, opts.remplace);
    return Promise.resolve("written");
  };
  return { appels, publish };
}

Deno.test("§ 2.3 ② CAS 1 — GÉNÉRATION, aucun plan existant: refus, ZÉRO écriture", async () => {
  const magasin = new Magasin();
  const avant = magasin.empreinte();
  const { appels, publish } = publierVers(magasin, {
    brouillon: false,
    planId: "plan-neuf",
    payload: "le plan du foyer",
    remplace: null,
  });
  const garde = gardeReelle(true); // la VRAIE garde, tombée
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: releveReel(false),
    journal: null,
    onJournalFailure: null,
    gateDelivery: garde.ran ? garde.value.delivery : null,
    previousIsUsable: true,
    publish,
  });
  assertEquals(verdict.kind, "validation_unavailable");
  if (verdict.kind !== "validation_unavailable") throw new Error("inatteignable");
  assertEquals(verdict.source, "final_gate");
  assertEquals(verdict.candidate, "validation_unavailable");
  // ⛔ ZÉRO ÉCRITURE, ZÉRO ACTIVATION — et ce sont des COMPTEURS, pas la
  // position des lignes dans un fichier.
  assertEquals(appels, []);
  assertEquals(magasin.ecritures, []);
  assertEquals(magasin.relire("plan-neuf"), null);
  assertEquals(magasin.empreinte(), avant);
});

Deno.test("§ 2.3 ② CAS 1 bis — SANS plan précédent, l'échec est EXPLICITE, et n'écrit pas plus", async () => {
  const magasin = new Magasin();
  const { appels, publish } = publierVers(magasin, {
    brouillon: false,
    planId: "plan-neuf",
    payload: "le plan du foyer",
    remplace: null,
  });
  const garde = gardeReelle(true);
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: releveReel(false),
    journal: null,
    onJournalFailure: null,
    gateDelivery: garde.ran ? garde.value.delivery : null,
    // ⚠️ `false` = aucune version valide en base. `chooseReplacement` rend
    // `fail_explicit` — et c'est toujours un refus, jamais une écriture.
    previousIsUsable: false,
    publish,
  });
  assertEquals(verdict.kind, "validation_unavailable");
  assertEquals(appels, []);
  assertEquals(magasin.ecritures, []);
});

Deno.test("§ 2.3 ② CAS 2 — BROUILLON: même refus, aucun aperçu adoptable rangé", async () => {
  const magasin = new Magasin();
  const { appels, publish } = publierVers(magasin, {
    brouillon: true,
    planId: "brouillon-1",
    payload: "l'aperçu que personne ne doit voir",
    remplace: null,
  });
  const garde = gardeReelle(true);
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: releveReel(false),
    journal: null,
    onJournalFailure: null,
    gateDelivery: garde.ran ? garde.value.delivery : null,
    previousIsUsable: true,
    publish,
  });
  assertEquals(verdict.kind, "validation_unavailable");
  // ⛔ LE MAGASIN D'APERÇU EST UNE ÉCRITURE, ET IL EST PROTÉGÉ COMME L'AUTRE.
  // Un refus posé entre l'aperçu et le plan laisserait une candidate
  // dangereuse s'afficher — et l'adoption rejoue le plan RANGÉ.
  assertEquals(appels, []);
  assertEquals(magasin.ecritures, []);
  assertEquals(magasin.relireBrouillon("brouillon-1"), null);
});

Deno.test("§ 2.3 ② CAS 3 — AVANT toute réparation: le refus ne peut consommer aucun appel", async () => {
  // ⛔ COMMENT ON LE SAIT, ET C'EST PLUS FORT QU'UN COMPTEUR: le bloc extrait
  // n'a AUCUN moyen de demander une réparation. Il ne reçoit ni budget, ni
  // numéro de tour, ni fonction de réparation — ses seuls effets injectés sont
  // le journal, l'avis de journal tombé, et la publication. Un refus ne peut
  // donc pas dépenser ce qu'il ne peut pas atteindre.
  //
  // ⚠️ ET L'ORDRE DU HANDLER EST ÉPINGLÉ AILLEURS: `plan_validation_wiring_test`
  // vérifie que `planBudget.askRepair(` est AVANT `decidePlanPublication(`.
  const SRC = await Deno.readTextFile(new URL("./plan_publication.ts", import.meta.url));
  const signature = SRC.slice(
    SRC.indexOf("export async function decidePlanPublication"),
    SRC.indexOf("}>): Promise<PlanPublicationOutcome<L, D, R>> {"),
  );
  assert(signature.length > 0, "la signature du bloc extrait a changé de forme");
  for (const mot of ["repair", "budget", "round", "attempt"]) {
    assert(
      !signature.toLowerCase().includes(mot),
      `le bloc extrait reçoit « ${mot} »: un refus pourrait dépenser une réparation`,
    );
  }
  // ET LA MESURE: un refus au tout premier tour n'appelle rien d'injectable.
  const magasin = new Magasin();
  const effets: string[] = [];
  const garde = gardeReelle(true);
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: releveReel(false),
    journal: () => effets.push("journal"),
    onJournalFailure: () => effets.push("journal_failed"),
    gateDelivery: garde.ran ? garde.value.delivery : null,
    previousIsUsable: true,
    publish: () => {
      effets.push("publish");
      magasin.ecrirePlan("p", "x", null);
      return Promise.resolve("written");
    },
  });
  assertEquals(verdict.kind, "validation_unavailable");
  // Le journal du RELEVÉ a tourné (le relevé, lui, est entier) ; la publication
  // n'a pas été appelée.
  assertEquals(effets, ["journal"]);
  assertEquals(magasin.ecritures, []);
});

Deno.test("§ 2.3 ② CAS 4 — APRÈS une candidate: la candidate n'est PAS publiée", async () => {
  // La candidate réparée existe, elle est complète, elle serait écrite — et le
  // relevé final jette. On ne sait RIEN de ses surfaces: une liste vide se
  // relirait « plan sain ».
  const magasin = new Magasin();
  magasin.semer("plan-actif", "l'ancien plan du foyer");
  const avant = magasin.empreinte();
  const { appels, publish } = publierVers(magasin, {
    brouillon: false,
    planId: "candidate-reparee",
    payload: "LA CANDIDATE REPAREE",
    remplace: "plan-actif",
  });
  const garde = gardeReelle(false); // la garde a bien tourné, elle dit `conforme`
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    // ⛔ LA VRAIE PANNE DU RELEVÉ: `collectOutputSurfaces` sur un plan sans
    // `dishes` lisibles jette « args.dishes is not iterable ».
    validate: releveReel(true),
    journal: null,
    onJournalFailure: null,
    gateDelivery: garde.ran ? garde.value.delivery : null,
    previousIsUsable: true,
    publish,
  });
  assertEquals(verdict.kind, "validation_unavailable");
  if (verdict.kind !== "validation_unavailable") throw new Error("inatteignable");
  assertEquals(verdict.source, "output_lock");
  assertEquals(verdict.reason, "output_lock_unavailable");
  assert(verdict.error instanceof TypeError, String(verdict.error));
  // ⛔ ET LE VERDICT DE LA GARDE N'EST PAS LU DU TOUT: le relevé est tombé
  // AVANT. `candidate: null` dit « on n'en est pas arrivé là », pas « conforme ».
  assertEquals(verdict.candidate, null);
  // ⛔ LA CANDIDATE N'EST NULLE PART.
  assertEquals(appels, []);
  assertEquals(magasin.ecritures, []);
  assertEquals(magasin.relire("candidate-reparee"), null);
  assertEquals(magasin.empreinte(), avant);
});

Deno.test("§ 2.3 ② CAS 5 — ANCIEN PLAN ACTIF: il reste, et on le RELIT pour le prouver", async () => {
  const magasin = new Magasin();
  magasin.semer("plan-actif", "l'ancien plan du foyer, semaine du 7");
  // La photo d'avant — relue depuis le magasin, pas reconstruite de mémoire.
  const avantLigne = magasin.relire("plan-actif");
  const avantEmpreinte = magasin.empreinte();
  assertEquals(avantLigne?.active, true);

  const { appels, publish } = publierVers(magasin, {
    brouillon: false,
    planId: "plan-neuf",
    payload: "le plan qui ne doit pas remplacer",
    remplace: "plan-actif",
  });
  const garde = gardeReelle(true);
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: releveReel(false),
    journal: null,
    onJournalFailure: null,
    gateDelivery: garde.ran ? garde.value.delivery : null,
    previousIsUsable: true,
    publish,
  });
  assertEquals(verdict.kind, "validation_unavailable");
  assertEquals(appels, []);
  assertEquals(magasin.ecritures, []);
  // ⛔ LA RELECTURE, PAS LE SOUVENIR. On redemande la ligne au magasin et on la
  // compare caractère par caractère à celle d'avant: ni son contenu, ni son
  // activation n'ont bougé, et le plan neuf n'existe pas.
  const apresLigne = magasin.relire("plan-actif");
  assertEquals(JSON.stringify(apresLigne), JSON.stringify(avantLigne));
  assertEquals(apresLigne?.active, true);
  assertEquals(magasin.relire("plan-neuf"), null);
  assertEquals(magasin.empreinte(), avantEmpreinte);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE CAS QUI PASSE — SANS LUI, UNE GARDE QUI REFUSE TOUT SEMBLE MARCHER
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§ 2.3 ③ — validateur normal: la publication a lieu, UNE fois, et remplace", async () => {
  const magasin = new Magasin();
  magasin.semer("plan-actif", "l'ancien plan du foyer");
  const { appels, publish } = publierVers(magasin, {
    brouillon: false,
    planId: "plan-neuf",
    payload: "le plan de la semaine",
    remplace: "plan-actif",
  });
  const garde = gardeReelle(false);
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: releveReel(false),
    journal: null,
    onJournalFailure: null,
    gateDelivery: garde.ran ? garde.value.delivery : null,
    previousIsUsable: true,
    publish,
  });
  assertEquals(verdict.kind, "published");
  if (verdict.kind !== "published") throw new Error("inatteignable");
  assertEquals(verdict.result, "written");
  assertEquals(verdict.candidate, "conforme");
  // ⛔ UNE FOIS, PAS DEUX.
  assertEquals(appels, ["publish"]);
  assertEquals(magasin.ecritures, ["plan:plan-neuf"]);
  assertEquals(magasin.relire("plan-neuf")?.active, true);
  // Et l'ancien est retiré, pas laissé actif à côté.
  assertEquals(magasin.relire("plan-actif")?.active, false);
});

Deno.test("§ 2.3 ③ — un JOURNAL tombé ne bloque pas la publication, et se compte AVANT", async () => {
  // ⛔ LA DISTINCTION, MESURÉE SUR LE CHEMIN COMPLET: le journal du relevé jette,
  // le relevé est entier, le plan part. Et l'avis arrive AVANT l'écriture, pour
  // que la trace `output_lock_journal_failed` voyage sur le plan qui part.
  const magasin = new Magasin();
  const ordre: string[] = [];
  const garde = gardeReelle(false);
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: releveReel(false),
    journal: () => {
      throw new Error("la trace est tombée");
    },
    onJournalFailure: () => ordre.push("journal_failed"),
    gateDelivery: garde.ran ? garde.value.delivery : null,
    previousIsUsable: true,
    publish: () => {
      ordre.push("publish");
      magasin.ecrirePlan("plan-neuf", "le plan de la semaine", null);
      return Promise.resolve("written");
    },
  });
  assertEquals(verdict.kind, "published");
  if (verdict.kind !== "published") throw new Error("inatteignable");
  assertEquals(verdict.journalFailed, true);
  assertEquals(ordre, ["journal_failed", "publish"]);
  assertEquals(magasin.ecritures, ["plan:plan-neuf"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES DEUX AUTRES SORTIES — ELLES N'ÉCRIVENT PAS NON PLUS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§ 2.3 ④ — une morsure qui survit refuse le PLAN, et n'écrit rien", async () => {
  const magasin = new Magasin();
  magasin.semer("plan-actif", "l'ancien plan du foyer");
  const avant = magasin.empreinte();
  const { appels, publish } = publierVers(magasin, {
    brouillon: false,
    planId: "plan-neuf",
    payload: "un plan qui sert un allergène",
    remplace: "plan-actif",
  });
  const garde = gardeReelle(false);
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: () => ({ surfaces: [], bites: [{ where: "dish" }] }),
    journal: null,
    onJournalFailure: null,
    gateDelivery: garde.ran ? garde.value.delivery : null,
    previousIsUsable: true,
    publish,
  });
  assertEquals(verdict.kind, "output_lock_violation");
  if (verdict.kind !== "output_lock_violation") throw new Error("inatteignable");
  assertEquals(verdict.survey.bites.length, 1);
  assertEquals(appels, []);
  assertEquals(magasin.ecritures, []);
  assertEquals(magasin.empreinte(), avant);
});

Deno.test("§ 2.3 ④ — l'ORDRE des quatre portes: la morsure passe AVANT la garde tombée", async () => {
  // ⛔ CE N'EST PAS UN DÉTAIL DE STYLE. Les deux refusent, mais pas sous le même
  // motif: l'un accuse le plan (« on ne sert pas ça »), l'autre accuse notre
  // instrument (« on n'a pas pu vérifier »). L'écran ne propose de relancer que
  // sur le second. Les intervertir ferait accuser la composition de quelqu'un
  // d'une exception de notre code.
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: () => ({ surfaces: [], bites: [{ where: "dish" }] }),
    journal: null,
    onJournalFailure: null,
    gateDelivery: null, // la garde a jeté
    previousIsUsable: true,
    publish: () => Promise.resolve("written"),
  });
  assertEquals(verdict.kind, "output_lock_violation");
});

Deno.test("§ 2.3 ④ — une garde qui MORD refuse le plan, et rend sa livraison telle quelle", async () => {
  const magasin = new Magasin();
  const { appels, publish } = publierVers(magasin, {
    brouillon: false,
    planId: "plan-neuf",
    payload: "un plan jugé non livrable",
    remplace: null,
  });
  const verdict = await decidePlanPublication({
    reason: "output_lock_unavailable",
    validate: releveReel(false),
    journal: null,
    onJournalFailure: null,
    // ⚠️ UNE LIVRAISON MESURÉE, pas une absence de mesure: c'est la différence
    // entre `not_deliverable` et `validation_unavailable`.
    gateDelivery: {
      state: "not_deliverable" as const,
      blocking: [{ cause: "allergen_served" }],
      unevaluated: [],
      incomplete: [],
    },
    previousIsUsable: true,
    publish,
  });
  assertEquals(verdict.kind, "not_deliverable");
  if (verdict.kind !== "not_deliverable") throw new Error("inatteignable");
  assertEquals(verdict.candidate, "not_deliverable");
  assertEquals(verdict.verdict, "keep_previous");
  // ⛔ LA LIVRAISON VOYAGE ENTIÈRE: c'est elle que le corps 422 rend, et elle
  // seule — deux lectures de « ce qui bloque » finiraient par diverger.
  assertEquals(verdict.delivery.blocking.length, 1);
  assertEquals(appels, []);
  assertEquals(magasin.ecritures, []);
});
