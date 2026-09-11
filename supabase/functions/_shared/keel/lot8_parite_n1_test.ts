/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOT 8 · FAMILLE « PARITÉ N = 1 »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le chantier demande: « toutes les fonctionnalités du lot 0, dont garde-manger,
 * repas isolé, fenêtre partielle, coach, adoption et édition de cases ».
 *
 * ⛔ CE QUE CE FICHIER GARDE, ET POURQUOI IL EXISTE MAINTENANT.
 * `generate-meal-v1` a été supprimée le 2026-09-11 (5 755 lignes). Six champs
 * n'existaient QUE chez elle (inventaire du lot 0,
 * `scratchpad/2026-09-10-MOTEUR-UNIQUE/01-parite.md`). Les perdre serait retirer
 * du produit six choses que personne n'a décidé de retirer — et la perte serait
 * SILENCIEUSE: aucune erreur, aucun test rouge, juste un plan qui ne sait plus
 * quelque chose.
 *
 * ⚠️ CE SONT DES TESTS DE SOURCE, ET C'EST NÉCESSAIRE. Les tests de fonction
 * prouvent que le CONSTRUCTEUR DE PROMPT sait rendre un champ; ils ne peuvent
 * pas prouver que la lane le lui PASSE. C'est très exactement le trou par lequel
 * `kitchenEquipment` était entré: le champ était collecté, stocké, lu — et
 * jamais dit au modèle. Le plan rendu ouvrait par « Heat the oven » à quelqu'un
 * qui n'avait coché que plaque, micro-ondes et blender (run `798c5cd6-…`).
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
const FOYER = "generate-household-meal-v1/index.ts";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

const SRC = stripComments(
  await Deno.readTextFile(new URL(FOYER, FUNCTIONS_DIR)),
);
const PROMPT = stripComments(
  await Deno.readTextFile(
    new URL("_shared/keel/meal_generation.ts", FUNCTIONS_DIR),
  ),
);

/**
 * Ce que la lane passe au constructeur de prompt, sous la forme `clé:`.
 *
 * ⚠️ ON CHERCHE DANS LA SOURCE PRIVÉE DE SES COMMENTAIRES. Un `grep` naïf
 * compterait les pavés qui NOMMENT un champ pour expliquer pourquoi il n'y est
 * pas — c'est la cicatrice « audit d'appelants: retirer les commentaires ».
 */
function passe(cle: string): boolean {
  return new RegExp(`(?:^|[\\s{,])${cle}[,:]`, "m").test(SRC);
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES SIX CHAMPS DE L'INVENTAIRE DU LOT 0
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("PARITÉ ① — les quatre constantes en dur sont devenues des LECTURES", () => {
  // ⛔ CE QU'ELLES ÉTAIENT: `mode: "to_shop"`, `pantry: []`, `slot: null` —
  // trois valeurs écrites en dur qui rendaient trois fonctionnalités
  // inatteignables depuis le foyer, alors que le tronc les recevait déjà.
  assert(
    SRC.includes("const askedMode: MealMode ="),
    "le mode n'est plus lu du corps",
  );
  assert(
    SRC.includes("const askedSlot: MealSlot | null ="),
    "le moment n'est plus lu",
  );
  assert(
    SRC.includes("const askedPantry = readPantry("),
    "le garde-manger n'est plus lu",
  );

  // ⛔ ET AUCUNE DES TROIS N'EST RÉÉCRITE EN DUR AILLEURS. Une seule résolution,
  // partagée par la consigne, le parseur et la ligne écrite: « la consigne le
  // dit, le parseur le tient » est la règle du dépôt.
  assert(
    !/pantry:\s*\[\],/.test(SRC),
    "un garde-manger vide est réécrit en dur",
  );
  assert(!/mode:\s*"to_shop",/.test(SRC), "`to_shop` est réécrit en dur");
  assertEquals(
    SRC.split("askedMode").length - 1 >= 3,
    true,
    "le mode n'atteint plus les trois sites (consigne, parseur, ligne écrite)",
  );
});

Deno.test("PARITÉ ② — `servings` NE vient PAS du client, et c'est une décision", () => {
  // ⚠️ CE N'EST PAS UN OUBLI DE PARITÉ. Un client qui enverrait 2 pour un foyer
  // de quatre ferait cuisiner la moitié du dîner, sans erreur. Le chantier le
  // dit aussi: « une liste de membres reçue du client ne donne aucun droit ».
  assert(
    SRC.includes("servings: Math.min(12, Math.max(1, presence.servings))"),
    "le nombre de parts a cessé de venir des présences LUES",
  );
  assert(
    !/servings:\s*Number\(body\.servings\)/.test(SRC),
    "le nombre de parts vient du client: un plan pour quatre se cuisinerait pour deux",
  );
});

Deno.test("PARITÉ ③ — LES MOYENS DE CUISSON ATTEIGNENT LE MODÈLE", () => {
  // ⛔ LE DÉFAUT EST MESURÉ, ET IL A UN RUN. `798c5cd6-…`: « plaque,
  // micro-ondes, blender » cochés, et le plan ouvre par « Heat the oven » avec
  // des « roast potatoes ». Le champ était collecté, stocké, LU par cette
  // lane — et jamais passé.
  assert(
    SRC.includes("readKitchenEquipment("),
    "l'inventaire de cuisine n'est plus lu",
  );
  assert(
    passe("kitchenEquipment"),
    "l'inventaire de cuisine n'atteint plus la consigne",
  );
  // ⛔ ET LE CONSTRUCTEUR SAIT LE RENDRE. Un champ passé à un constructeur qui
  // l'ignore est un lot désarmé qui ressemble à un lot qui marche.
  assert(
    PROMPT.includes("kitchenEquipmentPromptLines(args.kitchenEquipment"),
    "le constructeur de prompt n'écrit plus les moyens de cuisson",
  );
});

Deno.test("PARITÉ ④ — L'ASPIRATION EST SÉLECTIONNÉE, PUIS PASSÉE", () => {
  // ⛔ « Ce qu'ils veulent vraiment, dans leurs mots ». Écrite par `/app/plan`,
  // elle n'était même pas dans le `select` de cette lane.
  //
  // ⚠️ LES DEUX MOITIÉS SONT NÉCESSAIRES: sélectionner sans passer laisse la
  // colonne dormir, passer sans sélectionner rend `undefined` en silence.
  assert(
    /\.select\(\s*[\s\S]{0,400}?aspiration/.test(SRC),
    "`aspiration` n'est plus dans le `select` du foyer",
  );
  assert(
    SRC.includes("aspiration: goalRow.aspiration"),
    "`aspiration` est lue mais n'atteint plus la consigne",
  );
  assert(
    PROMPT.includes("args.aspiration"),
    "le constructeur de prompt n'écrit plus l'aspiration",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LES GESTES QUE LE CHANTIER NOMME
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("PARITÉ ⑤ — LE REPAS ISOLÉ: un moment nommé, vocabulaire FERMÉ", () => {
  // ⚠️ `slot` est une INDICATION au modèle, pas un interrupteur de structure:
  // il ne change qu'une ligne de la consigne. Un « repas isolé » se demande par
  // une fenêtre d'un jour. Ce qui compte ici, c'est qu'un moment inconnu ne
  // fabrique pas un créneau — il vaut `null`, « whichever fits ».
  assert(
    SRC.includes("MEAL_SLOTS"),
    "le moment n'est plus borné à son vocabulaire",
  );
  const at = SRC.indexOf("const askedSlot");
  assert(at >= 0, "`askedSlot` a disparu");
  const bloc = SRC.slice(at, at + 300);
  assert(
    bloc.includes(": null"),
    "un moment hors vocabulaire ne retombe plus sur `null`",
  );
  assert(
    PROMPT.includes(
      'args.slot ? `meal: ${args.slot}` : "meal: whichever fits"',
    ),
    "le constructeur ne distingue plus un moment nommé d'un moment libre",
  );
});

Deno.test("PARITÉ ⑥ — LE GARDE-MANGER: le mode et la liste voyagent ENSEMBLE", () => {
  // ⛔ UN MODE SANS LISTE EST PIRE QUE PAS DE MODE. `from_pantry` ferait écrire
  // « voici tes placards » au-dessus d'une liste vide, et le parseur
  // recalculerait la liste de courses comme « ce qui manque » — c'est-à-dire
  // tout.
  assert(passe("pantry"), "le garde-manger n'atteint plus la consigne");
  assert(
    PROMPT.includes('args.mode === "from_pantry"'),
    "le constructeur ne distingue plus les deux modes",
  );
  // ⛔ ET LE PARSEUR TIENT CE QUE LA CONSIGNE DIT: en `from_pantry`, c'est LUI
  // qui recalcule la liste comme « ce qui manque ». Un mode dit au modèle et tu
  // au parseur rendrait la liste complète quand même.
  const modes = SRC.split("askedMode").length - 1;
  assert(modes >= 3, `le mode n'atteint que ${modes} site(s) au lieu de trois`);
});

Deno.test("PARITÉ ⑦ — LA FENÊTRE PARTIELLE: de 1 à 7 jours, et la base l'impose", () => {
  // ⚠️ LA FENÊTRE N'EST PAS UNE CONSTANTE DE LANE. `MAX_WINDOW_DAYS` est imposé
  // par la base; la lane lit `duration_days` du corps et le tronc reçoit
  // `daysToFill`. Une lane qui fixerait 7 en dur rendrait la fenêtre partielle
  // inatteignable — c'est la même forme de perte que `pantry: []`.
  assert(
    SRC.includes("const durationDays"),
    "la durée n'est plus lue de la demande",
  );
  assert(
    SRC.includes("windowDayOrder(startsOn, durationDays)"),
    "les jours ne sont plus dérivés de la fenêtre",
  );
  assert(
    !/duration_days:\s*7,/.test(SRC),
    "une fenêtre de sept jours est écrite en dur: la fenêtre partielle est perdue",
  );
});

Deno.test("PARITÉ ⑧ — LE COACH: doctrine, note et protocole atteignent la consigne", () => {
  // ⛔ LA RÈGLE DU PRODUIT: le coach écrit une DOCTRINE, l'élève compose à
  // partir d'elle. Si le bloc n'atteint pas le message, le coach est décoratif —
  // et le dépôt a déjà mesuré ce défaut sur six lanes.
  for (
    const bloc of [
      "doctrineBlock",
      "coachNoteBlock",
      "protocolBlock",
      "beliefKeys",
    ]
  ) {
    assert(passe(bloc), `\`${bloc}\` n'atteint plus la consigne du foyer`);
  }
});

Deno.test("PARITÉ ⑨ — L'ADOPTION ET L'ÉDITION DE CASES existent sur la lane qui reste", async () => {
  // ⚠️ CES DEUX GESTES N'ONT JAMAIS EXISTÉ SUR LA LANE SUPPRIMÉE (inventaire du
  // lot 0, § ③). Ce cas ne garde donc pas une parité — il garde que la
  // suppression ne les a pas emportés par effet de bord.
  assert(SRC.includes("adopting_draft"), "l'adoption d'un aperçu a disparu");
  assert(
    SRC.includes("const editDraftId"),
    "l'édition de cases ne lit plus son brouillon",
  );
  assert(
    SRC.includes("loadDraftForAdoption("),
    "le brouillon n'est plus relu pour l'adoption",
  );
  // ⛔ ET LE BROUILLON RESTE CLÉ SUR SON COMPTE. C'est ce qui empêche quelqu'un
  // d'adopter le brouillon d'autrui en devinant un identifiant.
  const io = stripComments(
    await Deno.readTextFile(
      new URL("_shared/keel/draft_store.ts", FUNCTIONS_DIR),
    ),
  );
  const at = io.indexOf("export async function loadDraftForAdoption");
  assert(at >= 0, "`loadDraftForAdoption` a disparu");
  const corps = io.slice(at, at + 700);
  assert(
    corps.includes('.eq("user_id", userId)'),
    "un brouillon s'adopte sans être le sien",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA GARDE QUI EMPÊCHE UNE PERTE FUTURE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("PARITÉ ⑩ — L'INVENTAIRE DU LOT 0 EST COUVERT EN ENTIER", () => {
  // ⛔ CE CAS EST LA LISTE, ET IL EST NOMMÉ. `01-parite.md` a recensé ce que la
  // lane supprimée savait faire. Un champ qui sort de cette liste sans qu'on
  // le décide est exactement la perte silencieuse que le chantier interdit:
  // « un champ ne disparaît pas au motif que le foyer ne le lit pas ».
  const INVENTAIRE = [
    // les quatre du corps de la requête
    "mode",
    "slot",
    "pantry",
    "servings",
    // les deux que seule la lane supprimée passait
    "kitchenEquipment",
    "aspiration",
    // et le tronc commun que les deux partageaient
    "goal",
    "situation",
    "context",
    "preferences",
    "eatingRhythm",
    "fixedIntakes",
    "daysToFill",
    "todayToken",
    "hasFreezer",
    "oneCookingSession",
    "foodPreferences",
    "safetyConstraints",
    "memo",
    "scope",
  ];
  const manquants = INVENTAIRE.filter((c) => !passe(c));
  assertEquals(
    manquants,
    [],
    "ces champs de l'inventaire du lot 0 n'atteignent plus la consigne. Un " +
      "champ collecté, stocké, et jeté avant le calcul est le mode d'échec " +
      "n° 1 de ce dépôt.",
  );
});

Deno.test("PARITÉ ⑪ — LA MUTATION FAIT ROUGIR: retirer un champ est VU", () => {
  // ⛔ SANS CE CAS, `passe()` pourrait être une fonction qui rend toujours vrai
  // — et les dix cas ci-dessus seraient verts sur un fichier vide. Une garde a
  // besoin d'un cas qui MORD.
  const absent = "unChampQuiNExistePas";
  assert(!passe(absent), "`passe()` trouve un champ qui n'existe pas");
  assert(
    passe("kitchenEquipment"),
    "`passe()` ne trouve pas un champ qui existe",
  );
});
