/**
 * LOT 8 · FAMILLE ② AUTORISATION — LA MOITIÉ QUI SE PROUVE SANS BASE.
 *
 * L'autre moitié est `lot8_autorisation_test.sql`: la RLS historique, les
 * identifiants falsifiés, les appels directs, et les LIGNES que la base rend
 * à chaque étape. Ici on éprouve ce que ces lignes DEVIENNENT — sur le vrai
 * module, `generation_context.ts`, jamais sur une copie de sa logique.
 *
 * ⛔ CE QUE CE FICHIER NE REJOUE PAS, PARCE QUE C'EST DÉJÀ COUVERT:
 *   · maître seul autorisé ............ `generation_context_test.ts` ①
 *   · maître de plusieurs autorisé .... `generation_context_test.ts` ②
 *   · secondaire refusé `not_owner` ... `generation_context_test.ts` ③
 *   · l'ordre des refus et le gel ..... `generation_context_test.ts`
 *   · l'admission avant le modèle ..... `generation_context_wiring_test.ts`
 *
 * CE QUI RESTAIT OUVERT, ET QUI EST ICI:
 *   ① la SÉQUENCE d'un même compte — maître, puis secondaire, puis maître de
 *      nouveau — sur les formes de lignes que le fichier SQL vient de mesurer;
 *   ② qu'AUCUN champ envoyé par le client n'entre dans le verdict;
 *   ③ que le roster n'accorde aucun droit, même s'il contient un autre maître;
 *   ④ que les QUATRE GESTES (brouillon, édition, adoption, remplacement)
 *      passent la même porte, avant même d'être lus;
 *   ⑤ l'ANCIEN ENDPOINT — et ce cas-là épingle un DÉFAUT, il ne le célèbre pas.
 *
 * ⚠️ CE QU'AUCUN TEST DE CE DÉPÔT NE PEUT FAIRE: lancer les fonctions edge.
 * Ni `Deno.serve` ni un handler ne sont exportés. Les cas ④ et ⑤ lisent donc la
 * SOURCE, et ils le disent — le chantier a raison, une recherche de chaîne ne
 * prouve pas une autorisation. Elle prouve un ORDRE et un IMBRIQUEMENT, et
 * c'est exactement ce que ces deux cas mesurent.
 */
// ⟳ 2026-09-11 · LOT 7 — LES CAS QUI N'ÉPROUVAIENT QUE `generate-meal-v1`
// SONT PARTIS AVEC ELLE. Aucune assertion métier n'a été retirée pour faire
// taire un rouge: chacun avait son jumeau FOYER, qui reste. Le détail de
// l'audit est dans `scratchpad/2026-09-11-LOT7-SUPPRESSION/`.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  contextForRoster,
  type GenerationAdmissionReads,
  resolveGenerationAdmission,
  type RosterSeat,
} from "./generation_context.ts";

const ALICE: string = "00000000-0000-4000-8000-000000000502";
const MAX: string = "00000000-0000-4000-8000-000000000501";
/** Le foyer personnel d'Alice, avant l'invitation. */
const FOYER_ALICE: string = "70925b1a-6121-4daf-91e2-93cbe8df6798";
/** Le foyer de Max, où elle entre. */
const FOYER_MAX: string = "48ce046d-39f2-4b1c-8feb-6640eb85da42";
/** Le foyer NEUF que le départ lui rend — ni l'un ni l'autre. */
const FOYER_RENDU: string = "d771f92e-422a-4a26-afb8-195c46faf86f";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

async function source(rel: string): Promise<string> {
  return stripComments(await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR)));
}

const FOYER = "generate-household-meal-v1/index.ts";
const SOLO = "generate-meal-v1/index.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA SÉQUENCE — le droit se perd à l'entrée, et revient au départ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① le MÊME compte: maître, puis secondaire, puis maître de nouveau", () => {
  // ⚠️ LES TROIS SIÈGES SONT CEUX QUE LA BASE REND VRAIMENT. Chacun a été lu
  // par `lot8_autorisation_test.sql` § ④, sur la requête exacte du générateur
  // (`household_id, role, member_id` pour `user_id = …`). Sans ce chaînage, la
  // décision serait juste sur des lignes qu'on aurait inventées à sa mesure.
  const etapes: Array<
    { nom: string; seat: GenerationAdmissionReads["seat"]; admis: boolean }
  > = [
    {
      nom: "avant l'invitation — maître de son foyer personnel",
      seat: { householdId: FOYER_ALICE, memberId: "m-alice", role: "owner" },
      admis: true,
    },
    {
      nom: "après l'invitation — secondaire chez Max",
      seat: {
        householdId: FOYER_MAX,
        memberId: "m-alice-chez-max",
        role: "member",
      },
      admis: false,
    },
    {
      nom: "après le départ — maître du foyer rendu",
      seat: {
        householdId: FOYER_RENDU,
        memberId: "m-alice-rendue",
        role: "owner",
      },
      admis: true,
    },
  ];

  for (const e of etapes) {
    const out = resolveGenerationAdmission({
      actorUserId: ALICE,
      seat: e.seat,
      covered: true,
    });
    assertEquals(out.ok, e.admis, `étape « ${e.nom} »`);
    if (!out.ok) {
      // ⛔ ET LE MOTIF EST CELUI DU DROIT, PAS CELUI DE LA FACTURATION. Le
      // foyer de Max est couvert: si ce refus devenait `household_frozen`,
      // Alice lirait l'état d'abonnement d'un foyer qu'elle ne gouverne pas.
      assertEquals(out.refusal, "not_owner", `étape « ${e.nom} »`);
      assertEquals(out.status, 403);
      continue;
    }
    // ⛔ LE FOYER RÉSOLU SUIT LE SIÈGE, ET LE PLAN S'ÉCRIT SUR ELLE.
    assertEquals(
      out.actor.householdId,
      e.seat!.householdId,
      `étape « ${e.nom} »`,
    );
    assertEquals(out.actor.planOwnerUserId, ALICE, `étape « ${e.nom} »`);
    assertEquals(out.actor.masterUserId, ALICE, `étape « ${e.nom} »`);
  }

  // ⚠️ ET LE FOYER RENDU N'EST NI L'UN NI L'AUTRE. Rendre l'ancien foyer
  // personnel rebrancherait le plan neuf sur celui qui porte encore
  // l'historique; rendre celui de Max laisserait une partante écrire chez lui.
  assert(FOYER_RENDU !== FOYER_ALICE && FOYER_RENDU !== FOYER_MAX);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② CE QUE LE CLIENT ENVOIE N'ENTRE PAS DANS LE VERDICT
// ═══════════════════════════════════════════════════════════════════════════

function readsMaitre(
  over: Partial<GenerationAdmissionReads> = {},
): GenerationAdmissionReads {
  return {
    actorUserId: MAX,
    seat: { householdId: FOYER_MAX, memberId: "m-max", role: "owner" },
    covered: true,
    ...over,
  };
}

/** Ce qu'un corps de requête peut porter, et qui ne doit rien ouvrir. */
const CE_QUE_LE_CLIENT_ENVOIE = {
  intent: "draft",
  operation: "edit_cells",
  household_id: FOYER_ALICE,
  householdId: FOYER_ALICE,
  member_ids: ["m-alice", "m-bebe"],
  servings: 12,
  role: "owner",
  is_owner: true,
  plan_owner_user_id: MAX,
};

Deno.test("② un secondaire qui s'annonce maître reste `not_owner`", () => {
  // ⛔ LE CAS QUI MORD. Le chantier l'écrit: « une liste de membres reçue du
  // client ne donne aucun droit ». Le type interdit déjà ces champs — ce test
  // existe pour le jour où quelqu'un en ajoute un « juste pour le journal ».
  const pollue = {
    ...readsMaitre({
      actorUserId: ALICE,
      seat: { householdId: FOYER_MAX, memberId: "m-alice", role: "member" },
    }),
    ...CE_QUE_LE_CLIENT_ENVOIE,
  } as unknown as GenerationAdmissionReads;

  const out = resolveGenerationAdmission(pollue);
  assertEquals(out.ok, false);
  if (out.ok) return;
  assertEquals(out.refusal, "not_owner");
});

Deno.test("② et sur un maître, le verdict est MOT POUR MOT le même", () => {
  // ⚠️ LA MOITIÉ QUI PASSE. Sans elle, le cas précédent serait aussi vert si
  // le résolveur refusait tout le monde.
  const propre = readsMaitre();
  const pollue = {
    ...propre,
    ...CE_QUE_LE_CLIENT_ENVOIE,
  } as unknown as GenerationAdmissionReads;
  assertEquals(
    resolveGenerationAdmission(pollue),
    resolveGenerationAdmission(propre),
  );
});

Deno.test("② un `household_id` client ne déplace pas le foyer résolu", () => {
  const pollue = {
    ...readsMaitre(),
    household_id: FOYER_ALICE,
    householdId: FOYER_ALICE,
  } as unknown as GenerationAdmissionReads;
  const out = resolveGenerationAdmission(pollue);
  assertEquals(out.ok, true);
  if (!out.ok) return;
  // ⛔ Le foyer vient du SIÈGE lu en base, jamais du corps de la requête.
  assertEquals(out.actor.householdId, FOYER_MAX);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE ROSTER N'ACCORDE AUCUN DROIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ un second `owner` dans le roster ne déplace pas le maître", () => {
  // ⛔ LE DÉFAUT QUE CE CAS FERME: le jour où quelqu'un fait venir
  // `masterUserId` du roster « pour être sûr », une ligne héritée d'un ancien
  // transfert (deux `owner` dans le même foyer) déciderait de qui écrit le
  // plan. Le siège de l'acteur est la source, et la seule.
  const admis = resolveGenerationAdmission(readsMaitre());
  assertEquals(admis.ok, true);
  if (!admis.ok) return;

  const roster: RosterSeat[] = [
    { memberId: "m-max", userId: MAX, role: "owner" },
    { memberId: "m-usurpateur", userId: ALICE, role: "owner" },
    { memberId: "m-bebe", userId: null, role: "member" },
  ];
  const ctx = contextForRoster(admis.actor, roster);
  assertEquals(ctx.masterUserId, MAX);
  assertEquals(ctx.planOwnerUserId, MAX);
  assertEquals(ctx.masterMemberId, "m-max");
  assertEquals(ctx.householdSize, 3);
  assertEquals(ctx.writeScope, "household");
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES QUATRE GESTES PASSENT LA MÊME PORTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ brouillon, édition, adoption, remplacement: une seule porte, et elle est AVANT", async () => {
  // ⛔ CE QUE CE CAS MESURE N'EST PAS UNE CHAÎNE, C'EST UN ORDRE. Les quatre
  // gestes du chantier vivent dans le MÊME handler, distingués par
  // `body.operation` et `body.intent`. Si l'admission passait après leur
  // lecture, il suffirait d'un geste oublié dans un `switch` pour ouvrir une
  // porte — c'est la faute la plus banale de ce genre de fonction.
  const src = await source(FOYER);
  const admission = src.indexOf("resolveGenerationAdmission(");
  assert(admission >= 0, "l'admission a disparu de la lane foyer");

  for (const lecture of ["body.operation", "body.intent"]) {
    const at = src.indexOf(lecture);
    assert(at >= 0, `\`${lecture}\` introuvable — test à réviser`);
    assert(
      admission < at,
      `\`${lecture}\` est lu AVANT l'admission: le droit dépendrait alors du ` +
        `geste demandé, et un geste neuf entrerait sans porte.`,
    );
  }

  // ⚠️ ET LES QUATRE GESTES EXISTENT BIEN DANS CE FICHIER — sinon l'ordre
  // ci-dessus serait vrai d'un fichier qui n'en porte aucun.
  for (
    const geste of [
      '=== "draft"',
      '=== "edit_cells"',
      "adoptingDraft",
      '=== "replace_current"',
    ]
  ) {
    assert(
      src.includes(geste),
      `le geste \`${geste}\` a quitté la lane foyer: si un autre endpoint le ` +
        `porte maintenant, il lui faut sa propre admission.`,
    );
  }
});

Deno.test("④ la lane foyer refuse SUR UNE PANNE de lecture du siège", async () => {
  // ⛔ C'EST UNE LECTURE D'AUTORITÉ, PAS DE FACTURATION. Se tromper de sens
  // laisse quelqu'un composer à la place du maître, et un plan écrit ne se
  // dé-écrit pas. Le fail-open est réservé à la couverture, et le résolveur le
  // porte explicitement (`covered === null`).
  // ⚠️ ON ANCRE SUR LES DEUX BORNES, PAS SUR UNE FENÊTRE DE CARACTÈRES: ce
  // fichier bouge tous les jours, et une fenêtre fixe finirait par mesurer
  // l'humeur d'un relecteur plutôt que l'ordre du code.
  const src = await source(FOYER);
  const lecture = src.indexOf("const meRes");
  const jette = src.indexOf("if (meRes.error) throw meRes.error;");
  const admission = src.indexOf("resolveGenerationAdmission(");
  assert(lecture >= 0, "la lecture du siège a disparu — test à réviser");
  assert(
    jette > lecture && jette < admission,
    "la lecture du siège est passée en fail-open dans la lane foyer: une " +
      "garde de droit qui laisse passer sur une panne ne garde rien.",
  );
});
