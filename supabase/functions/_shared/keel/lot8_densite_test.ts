/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 8 · LA FAMILLE « DENSITÉ » DU TABLEAU DES TESTS OBLIGATOIRES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier : `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md`, lot 8, ligne
 * « Densité » — *250 kcal → couloir conservé ; léger 588 kcal avec plafond
 * 700 g → minimum 84 ; Dmin = plancher générique ; couloir trop haut/bas,
 * vide, sans arrondi représentable ; recette partagée et répétée avec Dmax
 * différent selon jour.*
 *
 * ── CE QUI N'EST PAS ICI, ET OÙ IL EST ────────────────────────────────────
 * Le couloir [100, 135] d'un goûter de 250 kcal est déjà éprouvé par
 * `moteur_unique_contre_exemples_test.ts` (CE-1, retourné le 2026-09-10). Les
 * quatre couloirs de GRAND, l'ordre de la journée, `redundantMin`, le moment
 * léger jugé contre son plancher, le plancher TCA, le max sur les jours et le
 * plafond de demande (`capped`) sont éprouvés par `portion_sizing_test.ts`
 * (bloc ⑩). Le RENDU d'une borne basse redondante est éprouvé par
 * `redistribution_test.ts`. Ce fichier ne porte que ce qu'aucun test ne
 * portait — et ce que le chantier demande de vérifier À LA PLACE de ce qui est
 * déjà fermé : que le couloir **voyage** jusqu'à la consigne sans perdre sa
 * borne haute.
 *
 * ⛔ LES NOMBRES SONT DÉRIVÉS À LA MAIN. L'arithmétique du couloir est écrite
 * au-dessus de chaque assertion :
 *
 *     Gmax = min(A × min(E/ρ ; table.max) ; table.max)    ρ = 1,0, ou 0,6 si léger
 *     Gmin = min(A × min(E/1,35 ; table.min) ; Gmax)
 *     Dmin = ⌈100 × E / Gmax⌉        Dmax = ⌊100 × E / Gmin⌋, rabattu à 250
 *     Dpréf = arrondi(Dmin × 1,10), projeté dans [Dmin, Dmax]
 *
 * ⟳ 2026-09-23 — chantier « assiettes normales » (flux B, puis T pour les
 * nombres de ce fichier) :
 *   · la table d'un repas d'adulte passe de 250 – 700 g à 250 – 550 g ;
 *   · la VISÉE d'un repas (petit-déjeuner, déjeuner, dîner) devient la densité
 *     du gabarit de recette, 125, ou le besoin s'il est plus haut :
 *         Dpréf repas    = arrondi(max(125 ; 100 × E / Gmax)), projeté dans [Dmin, Dmax]
 *         Dpréf collation = arrondi(Dmin × 1,10), projeté (inchangé) ;
 *   · la cible de GRAND se calcule à l'âge exact (28 ans), plus au milieu de
 *     la tranche 18-29 : 3 542 au lieu de 3 578 ;
 *   · le cas « léger 588 kcal sous 700 g » devient « léger 462 kcal sous
 *     550 g », même minimum de 84 (② dit pourquoi) ; le shaker du mercredi de
 *     ⑤ passe de 800 à 680 kcal pour que les trois bandes se croisent encore.
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE CAMPAGNE. § 10 du plan.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  dayTargetFor,
  densityCorridorFor,
  MAX_ASKABLE_DENSITY_PER_100G,
  plateBoundsFor,
  type SlotDensity,
} from "./portion_sizing.ts";
import {
  // ⟳ 2026-09-11 · LOT B — `requiredDensityFor` A DÉMÉNAGÉ dans le module du
  // contrat, avec un paramètre de plus: `rhythmSlots`, le rythme alimentaire
  // COMPLET de la bouche. Elle déduisait ce rythme de la GRILLE, ce qui donnait
  // la journée entière au dernier repas restant (facteur 2,86 mesuré).
  requiredDensityFor,
} from "./slot_nutrition_contract.ts";
import { densityFragment } from "./household_portions.ts";
import type { AnchorMouth } from "./mouth_anchor.ts";
import type { AppetiteLevel } from "./tokens.ts";

/** Voir `lot8_allocation_test.ts` pour la dérivation de sa cible : 3 542
 * (⟳ 2026-09-23 — âge exact 28 ans ; 3 578 au milieu de la tranche). */
const GRAND = {
  heightCm: 187,
  weightKg: 72,
  gender: "male" as const,
  ageYears: 28,
  activityLevel: "trains_some" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null as AppetiteLevel | null,
};
const QUATRE = ["breakfast", "lunch", "snack_pm", "dinner"];
const CIBLE_GRAND = 3542;

function bouche(over: Partial<AnchorMouth> = {}): AnchorMouth {
  return {
    memberId: "m-solo",
    ageState: "adult",
    restriction: "clear",
    body: GRAND,
    direction: "up",
    paceKgPerWeek: 0.35,
    declaredSlots: QUATRE,
    conditionRefs: [],
    ...over,
  } as AnchorMouth;
}

function densite(
  over: Partial<Parameters<typeof requiredDensityFor>[0]> = {},
) {
  return requiredDensityFor({
    mouth: bouche(),
    coachCounting: "no_position",
    slotsByDay: new Map([["mon", QUATRE]]),
    // ⟳ 2026-09-11 · LOT B — LE RYTHME COMPLET DE LA BOUCHE, pas sa grille.
    // ⛔ Les tests qui rétrécissent `slotsByDay` sans toucher à celui-ci
    // décrivent une FENÊTRE PARTIELLE — et c'est là que le lot B mord.
    rhythmSlots: QUATRE,
    lightSlots: [],
    slotFixedKcalByDay: new Map(),
    ageYears: 28,
    floors: { normal: 100, light: 60 },
    ...over,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ① 250 kcal — LE COULOIR VOYAGE JUSQU'À LA CONSIGNE, PLAFOND COMPRIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le passage `DensityCorridor` → `SlotDensity`, tel que `requiredDensityFor`
 * l'écrit. ⛔ IL EST RECOPIÉ ICI PARCE QUE LA RÈGLE `redundantMin` EST LE
 * SUJET : ce qui est éprouvé, c'est que la borne HAUTE traverse ce passage.
 * Une divergence avec l'original ferait rougir le cas nominal, qui passe par
 * la vraie fonction.
 */
function commeLeMoteur(
  slot: string,
  c: NonNullable<ReturnType<typeof densityCorridorFor>>,
  floor: number,
): SlotDensity {
  return {
    slot,
    // ⟳ 2026-09-11 · LOT B — le moteur y met les jours de la grappe; ce décor
    // n'a qu'un jour, et le dit.
    days: ["mon"],
    kcalPer100G: c.minPer100G,
    minPer100G: c.minPer100G,
    maxPer100G: c.maxPer100G,
    preferredPer100G: c.preferredPer100G,
    neededMinPer100G: c.neededMinPer100G,
    incompatible: c.incompatible,
    redundantMin: !(c.minPer100G > floor),
    occurrences: 1,
    light: false,
    // ⟳ 2026-09-11 — le témoin voyage aussi: ce décor REPRODUIT la projection
    // du moteur, il doit donc porter ce que le moteur y met.
    targetAnchoredPer100G: c.targetAnchoredPer100G,
  };
}

Deno.test("DENSITÉ — 250 kcal : la borne HAUTE survit jusqu'au texte de la consigne", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // CE QUE LE CHANTIER DEMANDE DE VÉRIFIER ICI. Le couloir lui-même est déjà
  // éprouvé (CE-1). Ce qui ne l'était pas, c'est le DERNIER mètre : le seul
  // test du rédacteur de consigne monte un `SlotDensity` à la main, donc rien
  // ne dit qu'un couloir CALCULÉ arrive entier jusqu'au texte.
  //
  //   250 kcal, repas d'un adulte (table 250 – 550 g), appétit non renseigné :
  //     Gmax = min(250/1,0 ; 550) = 250
  //     Gmin = min(250/1,35 = 185,19 ; 250) = 185,19 → 185
  //     Dmin = ⌈100 × 250/250⌉ = 100      Dmax = ⌊25 000/185 = 135,13⌋ = 135
  //     Dpréf = arrondi(max(125 ; 100)) = 125, déjà dans [100, 135]
  //     (⟳ 2026-09-23 — 110 avant : `Dmin × 1,10`, la visée d'avant le gabarit)
  const bounds = plateBoundsFor({
    ageYears: 35,
    slot: "lunch",
    slotTargetKcal: 250,
    light: false,
    appetite: null,
    personal: null,
  });
  assertEquals([bounds.min, bounds.max], [185, 250]);
  const c = densityCorridorFor({ targetKcal: 250, bounds })!;
  assertEquals([c.minPer100G, c.maxPer100G, c.preferredPer100G], [
    100,
    135,
    125,
  ]);

  // ⛔ ET LE TEXTE PORTE LE 135. La borne basse n'ajoute rien au plancher
  // commun du bloc (100), donc la consigne s'écrit « au plus » — mais elle
  // S'ÉCRIT. C'est très exactement ce que l'ancien filtre `min > floor`
  // coûtait : il jetait la ligne entière, et le plafond partait avec elle.
  const rendu = densityFragment([commeLeMoteur("snack_pm", c, 100)]);
  assertEquals(
    rendu,
    " — dishes served here: up to 135 kcal per 100 g at snack_pm (aim 125)",
  );

  // ⚠️ ET LA MOITIÉ QUI COÛTE, redite en une ligne : sans ce 135, une barre à
  // 400 kcal/100 g passe le contrôle de ce moment — et l'assiette qui la porte
  // ne pèse plus que 62 g.
  assert(c.maxPer100G < MAX_ASKABLE_DENSITY_PER_100G);
});

Deno.test("DENSITÉ — le voyage COMPLET : `requiredDensityFor` → la consigne, les deux bornes", () => {
  // ⛔ LA CHAÎNE ENTIÈRE, SANS AUCUN OBJET MONTÉ À LA MAIN. C'est la seule
  // épreuve du dépôt où le couloir écrit dans le prompt a été CALCULÉ par le
  // moteur : le test du brief v34 injecte un `requiredDensity` fabriqué, donc
  // il resterait vert si `requiredDensityFor` cessait de rendre un plafond.
  //
  //   ⟳ 2026-09-23 — cible 3 542 (âge exact), table 550 g, visée du gabarit :
  //   cible 3 542 ; quatre moments, Σ des poids = 0,25 + 0,40 + 0,10 + 0,35 = 1,10
  //   déjeuner  3542 × 0,40/1,10 = 1 288 kcal
  //     Gmax = min(1 288 ; 550) = 550         ⇒ Dmin = ⌈128 800/550 = 234,18⌉ = 235
  //     Gmin = min(1 288/1,35 = 954,1 ; 250) = 250
  //                                           ⇒ Dmax = ⌊515,2⌋ = 515, rabattu à 250
  //     Dpréf = arrondi(max(125 ; 234,18)) = 234, projeté dans [235, 250] = 235
  assertEquals(dayTargetFor(bouche(), "no_position").kcal, CIBLE_GRAND);
  const r = densite();
  const lunch = r.named.find((d) => d.slot === "lunch")!;
  assertEquals(
    [lunch.minPer100G, lunch.maxPer100G, lunch.preferredPer100G],
    [235, 250, 235],
  );
  assertEquals(
    lunch.redundantMin,
    false,
    "235 mord : la bande s'écrit en entier",
  );

  const rendu = densityFragment(r.named);
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 — « not 274 » EST NEUF, ET CE N'EST PAS UN DÉTAIL DE TEXTE
  // ══════════════════════════════════════════════════════════════════════
  //
  // La visée `204` vient du BAS du couloir (`Dmin × 1,10`), pas de la cible.
  // `100 × E / Gpréf` donnerait `274`. Le chantier du 2026-09-11 demande que
  // cette substitution cesse d'être SILENCIEUSE — pas qu'elle soit annulée:
  // l'arbitrage A15 tient (`100 × E / Gpréf` a rendu 389 demandés pour 126,7
  // servis). La ligne nomme donc LES DEUX.
  //
  // ⚠️ ET L'ÉCART EST SYSTÉMATIQUE, pas exceptionnel: il vaut à peu près
  // `(Gmax / Gpréf) / 1,10`, donc ~1,34 sur les quatre moments de ce tir.
  // C'est pourquoi l'EXPLICATION se dit une seule fois en queue de phrase et
  // pas sur chaque moment.
  // ⟳ 2026-09-23 — « not 274 » ET SA NOTE SONT RETIRÉS (flux C du chantier
  // « assiettes normales »): la note disait au modèle « we ask for the bigger
  // plate », c'est-à-dire la grosse assiette que l'audit du 2026-09-23 a
  // mesurée. La visée ne change pas de source (A15 tient); la ligne ne nomme
  // plus que la visée. ⚠️ Seule la FORME du texte est tenue ici par le flux C;
  // les nombres suivent le flux T.
  // ⟳ 2026-09-23 (flux T) — les nombres du paragraphe ci-dessus (204, 274)
  // sont ceux d'avant : la visée d'un repas est maintenant celle du gabarit,
  // rabattue ici sur le plancher du couloir (235).
  assert(rendu.includes("235 to 250 at lunch (aim 235)"), rendu);
  assert(!rendu.includes(", not "), rendu);
  assertEquals(
    (rendu.match(/over an average plate|bigger plate/g) ?? []).length,
    0,
    `la note des deux nombres est revenue: ${rendu}`,
  );
  // ⛔ L'UNITÉ N'EST ÉCRITE QU'UNE FOIS — c'est la garde de forme du dépôt : un
  // test lit le prompt entier et refuse tout `kcal` qui ne soit pas suivi de
  // `per 100 g`.
  assertEquals(rendu.split("kcal per 100 g").length - 1, 1, rendu);
  // ⚠️ ET LES QUATRE MOMENTS SONT LÀ, DANS L'ORDRE DE LA JOURNÉE.
  assertEquals(
    r.named.map((d) => d.slot),
    ["breakfast", "lunch", "snack_pm", "dinner"],
  );
});

Deno.test("DENSITÉ — quand la borne basse est redondante, c'est le PLAFOND qui voyage", () => {
  // ⛔ LA VARIANTE QUI FERME LE DERNIER TROU DU VOYAGE. Le cas ci-dessus passe
  // par la branche « bande entière » ; celui-ci passe par la branche
  // « au plus N », et c'est LUI qui perdrait tout si le plafond se perdait :
  // il n'a rien d'autre à dire.
  //
  // Un gros appétit ouvre la masse de 10 %, donc il fait DESCENDRE la densité
  // requise sous le plancher commun du bloc — 100/1,10 = 90,9. Un shaker de
  // 1 000 kcal au déjeuner ramène la part dans la table.
  //
  //   ⟳ 2026-09-23 — cible 3 542, table 550 g, visée du gabarit :
  //   déjeuner  1 288 − 1 000 = 288 kcal ; A = 1,10
  //     Gmax = min(1,10 × min(288 ; 550) ; 550) = 316,8 → 317
  //     Gmin = min(1,10 × min(288/1,35 = 213,33 ; 250) ; 316,8) = 234,67 → 235
  //     Dmin = ⌈28 800/317 = 90,85⌉ = 91     Dmax = ⌊28 800/235 = 122,55⌋ = 122
  //     Dpréf = arrondi(max(125 ; 90,85)) = 125, projeté dans [91, 122] = 122
  const gros = densite({
    mouth: bouche({ body: { ...GRAND, appetite: "large" } }),
    slotFixedKcalByDay: new Map([["mon", new Map([["lunch", 1000]])]]),
  });
  // ⛔ PRÉMISSE : l'appétit n'a PAS déplacé la cible du jour. S'il la déplaçait,
  // les nombres ci-dessous ne mesureraient plus ce qu'ils prétendent.
  assertEquals(
    dayTargetFor(
      bouche({ body: { ...GRAND, appetite: "large" } }),
      "no_position",
    ).kcal,
    CIBLE_GRAND,
  );
  const lunch = gros.named.find((d) => d.slot === "lunch")!;
  assertEquals(
    [lunch.minPer100G, lunch.maxPer100G, lunch.preferredPer100G],
    [91, 122, 122],
  );
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · ÉTAPE C4 — CE TEST A CHANGÉ DE VERDICT, ET C'EST LE
  //                CORRECTIF QU'IL ÉPINGLE
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ IL ASSERTAIT `redundantMin === true` ET LE RENDU « up to 122 » — c'est-
  // à-dire une consigne qui TAISAIT le 91 pendant que le bloc de recette
  // promettait « a normal dish carries at least 100 ». Le modèle lisait 100,
  // la garde acceptait 91. C'est exactement le défaut de contrat que l'étape
  // C0 a nommé, et la campagne du 2026-09-11 l'a payé en fausses violations:
  // les petits-déjeuners du tir n° 3 à 94 et 99 kcal/100 g ont été comptés
  // comme deux manquements alors que leur minimum réel valait 91.
  //
  // ⛔ ET LE PLAN INTERDIT L'AUTRE CORRECTIF: « ne pas réparer ces recettes sur
  // la base du faux seuil de 100 ». Le contrat ne remonte donc pas; c'est la
  // consigne qui dit la bande vraie.
  assertEquals(
    lunch.redundantMin,
    false,
    "91 est SOUS le plancher commun de 100: il n'est pas redondant, il corrige",
  );
  assertEquals(gros.counters.floor_min_kept, 0);
  assertEquals(gros.counters.below_floor, 1, "le moment sous plancher est COMPTÉ");
  assertEquals(gros.counters.above_floor, 3, "les trois autres restent au-dessus");

  assertEquals(
    densityFragment([lunch]),
    " — dishes served here: 91 to 122 kcal per 100 g at lunch (aim 122)",
  );
  // ⚠️ ET LA VISÉE EST DITE. Une bande sans visée fait partir le modèle vers un
  // bord — mesuré dans les deux sens (tir SPLICE3, un bouillon à 57,8).
  // ⟳ 2026-09-23 — la visée du gabarit (125) est au-dessus du plafond de ce
  // moment : elle est rabattue sur le plafond (122), jamais au-delà.
  assert(densityFragment([lunch]).includes("aim 122"));
});

Deno.test("DENSITÉ — un minimum ÉGAL au plancher reste redondant: le PLAFOND seul voyage", () => {
  // ⛔ LE CAS QUI PASSE, en face de celui qui mord juste au-dessus. L'étape C4
  // resserre `redundantMin` sur l'ÉGALITÉ; elle ne la supprime pas. Un moment
  // qui demande exactement ce que le bloc promet déjà n'a aucune raison de le
  // répéter en face d'un nom — « un brief qui répète cesse d'être lu » — et
  // c'est son PLAFOND, que rien d'autre ne porte, qui doit voyager.
  //
  // ⚠️ LE DÉCOR EST UN LITTÉRAL, et c'est volontaire: faire tomber un contrat
  // réel sur `min === plancher` à l'unité près demanderait d'accorder quatre
  // nombres, et le test mesurerait alors l'accordage, pas la règle.
  const egal = {
    slot: "snack_pm",
    days: ["mon"],
    kcalPer100G: 100,
    minPer100G: 100,
    maxPer100G: 135,
    preferredPer100G: 112,
    neededMinPer100G: 100,
    incompatible: null,
    redundantMin: true,
    targetAnchoredPer100G: null,
    occurrences: 1,
    light: false,
  };
  assertEquals(
    densityFragment([egal]),
    " — dishes served here: up to 135 kcal per 100 g at snack_pm (aim 112)",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LÉGER, 462 kcal, PLAFOND 550 g → MINIMUM 84
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ DENSITÉ — 462 kcal LÉGER sous un plafond de 550 g : minimum 84", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE CAS CHIFFRÉ DU CHANTIER, DÉRIVÉ À LA MAIN : 100 × 462 / 550 = 84.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⟳ 2026-09-23 — LE CAS D'ORIGINE ÉTAIT 588 kcal SOUS 700 g (100 × 588/700 =
  // 84). La table d'un repas d'adulte passe à 550 g : 588 kcal dépassent alors
  // 550 même SANS le drapeau léger, la table mord des deux côtés, et la
  // contre-épreuve ci-dessous ne distinguait plus rien (107 contre 107). Le cas
  // est donc déplacé à 462 kcal, qui refait EXACTEMENT la même figure sous la
  // nouvelle table : léger rabattu par la table, ordinaire borné par la cible,
  // et le même minimum de 84.
  //
  // ⛔ ET C'EST LE PREMIER TEST DU DÉPÔT QUI PASSE `light: true` À
  // `plateBoundsFor`. Le drapeau est requis par le type — il ne peut pas être
  // oublié par un appelant — mais sa CONSÉQUENCE, le plancher de densité à 0,6
  // au lieu de 1,0, n'était éprouvée nulle part.
  //
  //   462 kcal, dîner d'un adulte marqué léger (table 250 – 550 g), ρ = 0,6 :
  //     bmax brut = 462/0,6 = 770 ⇒ rabattu par la table à 550   (`boundSource: table`)
  //     Gmin = min(462/1,35 = 342,22 ; 250) = 250
  //     Gpréf = (250 + 550)/2 = 400
  //     Dmin = ⌈100 × 462/550⌉ = ⌈84⌉ = **84**
  //     Dmax = ⌊46 200/250 = 184,8⌋ = 184
  //     Dpréf = arrondi(max(125 ; 84)) = 125 (visée du gabarit, dans la bande)
  const leger = plateBoundsFor({
    ageYears: 35,
    slot: "dinner",
    slotTargetKcal: 462,
    light: true,
    appetite: null,
    personal: null,
  });
  assertEquals(leger.densityFloorPerG, 0.6);
  assertEquals([leger.min, leger.max, leger.preferred], [250, 550, 400]);
  assertEquals(
    leger.boundSource,
    "table",
    "c'est bien la table qui a rabattu 770 à 550",
  );
  const c = densityCorridorFor({ targetKcal: 462, bounds: leger })!;
  assertEquals(c.minPer100G, 84);
  assertEquals([c.maxPer100G, c.preferredPer100G], [184, 125]);
  assertEquals(
    c.neededMinPer100G,
    84,
    "rien n'a été rabattu : le besoin EST 84",
  );
  assertEquals(c.incompatible, null);

  // ⛔ LA CONTRE-ÉPREUVE, SUR LE MÊME NOMBRE DE KCAL : sans le drapeau, le même
  // dîner reçoit 100. Un plat 19 % plus dense que nécessaire, c'est-à-dire une
  // assiette de 462 g au lieu de 550 — exactement ce que « léger » ne veut pas
  // dire. « Léger » borne le VOLUME d'un plat, pas sa portion.
  const ordinaire = plateBoundsFor({
    ageYears: 35,
    slot: "dinner",
    slotTargetKcal: 462,
    light: false,
    appetite: null,
    personal: null,
  });
  assertEquals(ordinaire.densityFloorPerG, 1);
  assertEquals([ordinaire.min, ordinaire.max], [250, 462]);
  assertEquals(
    ordinaire.boundSource,
    "target",
    "ici la table ne mord pas : 462 < 550",
  );
  assertEquals(
    densityCorridorFor({ targetKcal: 462, bounds: ordinaire })!.minPer100G,
    100,
  );

  // ⚠️ ET 84 DÉPASSE LE PLANCHER DES MOMENTS LÉGERS (60) : la bande est donc
  // NOMMÉE en entier, pas résumée en « au plus 184 ».
  assertEquals(
    densityFragment([commeLeMoteur("dinner", c, 60)]),
    " — dishes served here: 84 to 184 kcal per 100 g at dinner (aim 125)",
    // ⟳ 2026-09-23 — `not 124` et sa note (« we ask for the bigger plate »)
    // sont retirés: la visée reste celle du couloir (arbitrage A15), la ligne
    // ne la justifie plus par la grosse assiette.
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ Dmin = LE PLANCHER GÉNÉRIQUE — et les deux façons d'en sortir
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("DENSITÉ — Dmin retombe EXACTEMENT sur le plancher générique quand la table ne mord pas", () => {
  // ⛔ CE N'EST PAS UNE COÏNCIDENCE, C'EST L'ARITHMÉTIQUE. Tant que la capacité
  // d'estomac ne borne rien, `Gmax = E/ρ`, donc `Dmin = 100 × E / (E/ρ) = 100ρ`
  // — 100 pour un repas ordinaire, 60 pour un moment léger. Le couloir ne peut
  // donc JAMAIS descendre sous le plancher commun du bloc par ce chemin-là, et
  // c'est ce qui rend `redundantMin` lisible : il ne dit pas « ce moment n'a
  // pas d'exigence », il dit « la table n'a pas mordu ici ».
  //
  //   500 kcal, déjeuner d'adulte : Gmax = 500, Gmin = min(370,37 ; 250) = 250
  //     Dmin = 100 ; Dmax = ⌊200⌋ = 200 ; Dpréf = arrondi(max(125 ; 100)) = 125
  //     (⟳ 2026-09-23 — 110 avant, `Dmin × 1,10`)
  const b = plateBoundsFor({
    ageYears: 35,
    slot: "lunch",
    slotTargetKcal: 500,
    light: false,
    appetite: null,
    personal: null,
  });
  assertEquals(b.boundSource, "target");
  const c = densityCorridorFor({ targetKcal: 500, bounds: b })!;
  assertEquals([c.minPer100G, c.maxPer100G, c.preferredPer100G], [
    100,
    200,
    125,
  ]);

  //   300 kcal, dîner LÉGER : Gmax = 300/0,6 = 500 ; Gmin = min(222,2 ; 250) = 222
  //     Dmin = ⌈30 000/500⌉ = 60 ; Dmax = ⌊30 000/222 = 135,14⌋ = 135
  const l = plateBoundsFor({
    ageYears: 35,
    slot: "dinner",
    slotTargetKcal: 300,
    light: true,
    appetite: null,
    personal: null,
  });
  assertEquals(l.boundSource, "target");
  assertEquals(
    densityCorridorFor({ targetKcal: 300, bounds: l })!.minPer100G,
    60,
  );

  // ⛔ ET LA SORTIE PAR LE HAUT : dès que la table mord, Dmin monte, et
  // `boundSource` dit qui a décidé. 900 kcal au déjeuner d'un adulte :
  //     Gmax = min(900 ; 550) = 550 ⇒ Dmin = ⌈90 000/550 = 163,64⌉ = 164
  //     (⟳ 2026-09-23 — table 550 g ; 129 sous l'ancienne table de 700 g)
  const gros = plateBoundsFor({
    ageYears: 35,
    slot: "lunch",
    slotTargetKcal: 900,
    light: false,
    appetite: null,
    personal: null,
  });
  assertEquals(gros.boundSource, "table");
  assertEquals(
    densityCorridorFor({ targetKcal: 900, bounds: gros })!.minPer100G,
    164,
  );
});

Deno.test("⛔ DENSITÉ — « trop bas » : un GROS APPÉTIT fait passer Dmin SOUS le plancher commun", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE CAS « COULOIR TROP BAS » DU CHANTIER, ET IL EST ATTEIGNABLE.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // L'appétit multiplie la MASSE autorisée sans toucher l'énergie : `Gmax`
  // passe à `1,10 × E`, donc `Dmin = 100/1,10 = 90,9`. La densité requise
  // descend SOUS le plancher générique de 100 que le bloc de recette répète à
  // tout le monde.
  //
  // ⚠️ CE N'EST PAS UNE ERREUR, ET C'EST POUR ÇA QUE LE CAS EST ÉCRIT. La
  // consigne qui atteint le modèle reste « au moins 100 » par le plancher
  // commun ; ce que ce moment-ci ajoute, c'est UNIQUEMENT son plafond. Un
  // lecteur qui verrait 91 dans un journal et conclurait « le moteur demande un
  // plat moins dense que son propre plancher » lirait mal : il demande une
  // assiette PLUS GRANDE, ce qui est exactement ce qu'un gros appétit a
  // déclaré.
  //
  //   500 kcal, petit-déjeuner d'adulte, A = 1,10 :
  //     Gmax = min(1,10 × 500 ; 550) = 550    Gmin = min(1,10 × 250 ; 550) = 275
  //     Dmin = ⌈50 000/550 = 90,91⌉ = 91      Dmax = ⌊50 000/275 = 181,8⌋ = 181
  //     Dpréf = arrondi(max(125 ; 90,91)) = 125, dans la bande
  //     (⟳ 2026-09-23 — la table passe à 550 g sans changer Gmax ici ; la
  //     visée d'un repas devient celle du gabarit : 100 avant)
  const b = plateBoundsFor({
    ageYears: 35,
    slot: "breakfast",
    slotTargetKcal: 500,
    light: false,
    appetite: "large",
    personal: null,
  });
  assertEquals([b.min, b.max, b.preferred], [275, 550, 413]);
  const c = densityCorridorFor({ targetKcal: 500, bounds: b })!;
  assertEquals([c.minPer100G, c.maxPer100G, c.preferredPer100G], [
    91,
    181,
    125,
  ]);

  // ⛔ ET LE PLANCHER NE REMONTE PAS LE NOMBRE EN SILENCE. `densityCorridorFor`
  // ne connaît pas le plancher du bloc : il rend ce que la masse exige, et
  // c'est le rédacteur qui décide de ne pas le répéter. Si le calcul rabattait
  // 91 à 100 « pour être cohérent », le PLAFOND bougerait avec (la visée est
  // projetée dans la bande), et on perdrait l'information pour sauver une
  // apparence.
  assertEquals(c.neededMinPer100G, 91);
  assertEquals(c.incompatible, null);

  // ⚠️ ET LE MÊME MOMENT SANS APPÉTIT DÉCLARÉ REND 100 : la contre-épreuve qui
  // attribue les 9 points à l'appétit, et à rien d'autre.
  const neutre = plateBoundsFor({
    ageYears: 35,
    slot: "breakfast",
    slotTargetKcal: 500,
    light: false,
    appetite: null,
    personal: null,
  });
  assertEquals(
    densityCorridorFor({ targetKcal: 500, bounds: neutre })!.minPer100G,
    100,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ COULOIR TROP HAUT — on demande ce qui est tenable, on GARDE le besoin
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ DENSITÉ — au-dessus du plafond de demande, le besoin est NOMMÉ, pas raboté", () => {
  // ⚠️ CE QUE `portion_sizing_test.ts` MESURE DÉJÀ : que `requiredDensityFor`
  // compte un `capped` et rende 250. Ce qui n'était éprouvé nulle part, ce sont
  // les deux champs qui portent la DIFFÉRENCE entre « on demande 250 » et « il
  // en faudrait 300 » : `incompatible` et `neededMinPer100G`.
  //
  // ⛔ SANS EUX, UN MINIMUM TRONQUÉ EN SILENCE apprendrait au modèle que ces
  // nombres-là sont décoratifs — c'est mesuré : 389 demandés, 126,7 rendus.
  //
  //   900 kcal sur une COLLATION d'adulte (table 80 – 300 g) :
  //     Gmax = min(900 ; 300) = 300   ⇒ besoin = 100 × 900/300 = 300 > 250
  //     Gmin = min(900/1,35 = 666,7 ; 80) = 80
  //     demandé : min = max = 250 (le plafond des deux côtés), visée 250
  const b = plateBoundsFor({
    ageYears: 35,
    slot: "snack_pm",
    slotTargetKcal: 900,
    light: false,
    appetite: null,
    personal: null,
  });
  assertEquals([b.min, b.max], [80, 300]);
  const c = densityCorridorFor({ targetKcal: 900, bounds: b })!;
  assertEquals(c.incompatible, "above_askable_cap");
  assertEquals(
    c.neededMinPer100G,
    300,
    "le besoin réel doit survivre au rabattement",
  );
  assertEquals(
    [c.minPer100G, c.maxPer100G, c.preferredPer100G],
    [250, 250, 250],
  );
  assertEquals(MAX_ASKABLE_DENSITY_PER_100G, 250);

  // ⛔ LA CONTRE-ÉPREUVE, SUR LE MÊME MOMENT : 700 kcal au lieu de 900, et
  // l'incompatibilité disparaît. Une garde qui poserait `above_askable_cap`
  // partout aurait exactement la même allure que celle-ci sans cette ligne.
  //     Gmax = min(700 ; 300) = 300 ⇒ besoin = ⌈233,33⌉ = 234 ≤ 250
  const sous = densityCorridorFor({
    targetKcal: 700,
    bounds: plateBoundsFor({
      ageYears: 35,
      slot: "snack_pm",
      slotTargetKcal: 700,
      light: false,
      appetite: null,
      personal: null,
    }),
  })!;
  assertEquals(sous.incompatible, null);
  assertEquals(sous.minPer100G, 234);
  assertEquals(
    sous.neededMinPer100G,
    234,
    "sans rabattement, besoin et demande coïncident",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ RECETTE PARTAGÉE ET RÉPÉTÉE — max(Dmin), min(Dmax) sur TOUTES les occurrences
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("DENSITÉ — trois jours : le PLANCHER vient d'un jour, le PLAFOND d'un autre", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LA RÈGLE DU CHANTIER : « prendre max(Dmin) et min(Dmax) sur toutes ses
  // occurrences et tous ses mangeurs ».
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QUE CE CAS PROUVE ET QU'UN CAS À DEUX JOURS NE PROUVE PAS : que la
  // bande commune n'est le couloir d'AUCUN jour. Avec deux jours, « garder le
  // plus exigeant en entier » et « intersecter » peuvent rendre le même
  // plafond ; à trois, ils divergent, et on voit lequel est câblé.
  //
  // Un shaker différent chaque jour fait varier la part du déjeuner :
  //
  // ⟳ 2026-09-23 — cible 3 542, table 550 g, visée du gabarit ; le shaker du
  // mercredi passe de 800 à 680 : avec 800, le mercredi (488 kcal) plafonnait
  // à 195, sous le plancher du lundi (235), et les trois bandes ne se
  // croisaient plus — le cas aurait mesuré ⑥, pas ⑤.
  //
  //   lundi    1 288 kcal → Gmax 550, Gmin 250 → [⌈234,18⌉ = 235, 515 ⇒ 250]  visée 235
  //   mardi    1 288 − 300 = 988 → Gmax 550, Gmin 250
  //                              → [⌈179,64⌉ = 180, 395 ⇒ 250]  visée 180
  //   mercredi 1 288 − 680 = 608 → Gmax 550, Gmin min(450,4 ; 250) = 250
  //                              → [⌈110,55⌉ = 111, ⌊243,2⌋ = 243]  visée 125
  //
  //   max(Dmin) = 235 (LUNDI)      min(Dmax) = 243 (MERCREDI)
  const r = densite({
    slotsByDay: new Map([["mon", QUATRE], ["tue", QUATRE], ["wed", QUATRE]]),
    slotFixedKcalByDay: new Map([
      ["tue", new Map([["lunch", 300]])],
      ["wed", new Map([["lunch", 680]])],
    ]),
  });
  const lunch = r.named.find((d) => d.slot === "lunch")!;
  assertEquals([lunch.minPer100G, lunch.maxPer100G], [235, 243]);
  assertEquals(lunch.occurrences, 3);
  assertEquals(lunch.incompatible, null, "les trois bandes se croisent bien");
  assertEquals(
    r.counters.days_varied,
    1,
    "seul le déjeuner varie d'un jour à l'autre",
  );
  assertEquals(r.counters.slots, 12, "quatre moments × trois jours");

  // ⛔ LA LIGNE QUI DISTINGUE LES DEUX RÈGLES. Le jour dont le PLANCHER commande
  // (lundi) a un plafond de 250 ; si le moteur gardait « le jour le plus
  // exigeant » en entier, la consigne dirait « jusqu'à 250 ». Un plat à 250
  // kcal/100 g servirait alors les 608 kcal du mercredi dans 243 g — sous les
  // 250 g de plancher d'assiette de cette personne.
  const lundiSeul = densite().named.find((d) => d.slot === "lunch")!;
  assertEquals(lundiSeul.maxPer100G, 250);
  assert(
    lunch.maxPer100G < lundiSeul.maxPer100G,
    "le plafond du mercredi n'a pas mordu : c'est le couloir d'un seul jour qui sort",
  );

  // ⚠️ ET LA VISÉE RESTE DANS LA BANDE COMMUNE. Elle est projetée, pas
  // recalculée : la plus haute des visées (235, lundi), projetée dans la bande
  // commune [235, 243], donc 235.
  // ⟳ 2026-09-23 — avant, la plus haute visée (204) dépassait le plafond
  // commun (200) et était rabattue. Pour un repas, la visée vaut maintenant
  // max(125 ; Dmin) : dès que le plancher commun dépasse 125, la plus haute
  // visée EST ce plancher, donc toujours dans la bande. La projection reste
  // vérifiée par l'assertion d'appartenance ci-dessous.
  assertEquals(lunch.preferredPer100G, 235);
  assert(
    lunch.preferredPer100G >= lunch.minPer100G &&
      lunch.preferredPer100G <= lunch.maxPer100G,
    "la visée sort de la bande commune",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ COULOIR VIDE — deux occurrences sans aucune densité commune
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ DENSITÉ — deux jours SANS densité commune : DEUX BANDES DATÉES, jamais une moyenne", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT B — CE TEST CHANGE DE SORTIE, PAS DE RÈGLE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QUE LE CODE FAISAIT JUSQU'AU 2026-09-11. Deux jours sans densité
  // commune rendaient UNE ligne, rabattue sur son plancher (`min === max`),
  // portant `empty_intersection` et la phrase « these days need different
  // recipes ». Le modèle recevait donc un POINT au lieu d'une bande, pour DEUX
  // jours, sans aucun moyen de savoir lequel demandait quoi.
  //
  // ⛔ CE QUE LE CHANTIER EXIGE, mot pour mot : « ne pas fusionner tous les
  // dîners par leur valeur maximale ; une consigne commune n'est possible que
  // si les contrats sont EFFECTIVEMENT COMPATIBLES et les cases concernées
  // restent IDENTIFIABLES ». Deux bandes disjointes ne sont pas compatibles :
  // elles sortent SÉPARÉES, chacune avec ses jours.
  //
  // ⚠️ LA RÈGLE D'ORIGINE RESTE ENTIÈRE ET C'EST CE QUE CE TEST DÉFEND : on ne
  // referme JAMAIS l'intersection en moyenne, et on ne rabote aucun des deux
  // jours. Ce qui change, c'est qu'on ne perd plus non plus la bande de chacun.
  //
  //   ⟳ 2026-09-23 — cible 3 542, table 550 g :
  //   lundi    déjeuner 1 288 kcal → Gmax 550, Gmin 250 → [235, 250]
  //   mardi    déjeuner 1 288 − 1 000 = 288 kcal
  //              Gmax = min(288 ; 550) = 288
  //              Gmin = min(288/1,35 = 213,33 ; 250) = 213,33 → 213
  //              Dmin = ⌈28 800/288⌉ = 100
  //              Dmax = ⌊28 800/213 = 135,21⌋ = 135             → [100, 135]
  //
  //   max(Dmin) = 235 > min(Dmax) = 135 ⇒ AUCUNE densité ne sert les deux jours.
  const r = densite({
    slotsByDay: new Map([["mon", QUATRE], ["tue", QUATRE]]),
    slotFixedKcalByDay: new Map([["tue", new Map([["lunch", 1000]])]]),
  });
  const midis = r.named.filter((d) => d.slot === "lunch");
  assertEquals(midis.length, 2, "les deux jours sont fondus en une seule bande");
  // ⛔ ET LE COMPTEUR GARDE SON SENS : « combien de moments n'ont aucune densité
  // commune sur tous leurs jours ». Son commentaire d'origine annonçait déjà
  // cette sortie — « s'il grimpe, la sortie est une recette SÉPARÉE ».
  assertEquals(r.counters.empty_intersection, 1);

  const lundi = midis.find((d) => d.days.includes("mon"))!;
  const mardi = midis.find((d) => d.days.includes("tue"))!;
  assertEquals([lundi.minPer100G, lundi.maxPer100G], [235, 250]);
  assertEquals([mardi.minPer100G, mardi.maxPer100G], [100, 135]);
  // ⛔ CHAQUE BANDE EST TENABLE CHEZ ELLE. C'est toute la différence avec la
  // ligne unique d'avant, dont aucun des deux jours ne pouvait rien faire.
  assertEquals(lundi.incompatible, null);
  assertEquals(mardi.incompatible, null);
  // ⚠️ (235 + 135)/2 = 185 : le nombre qu'une moyenne aurait rendu, et qu'on
  // ne rend toujours pas. Écrit ici pour qu'une régression soit lisible.
  assert(
    !midis.some((d) => d.minPer100G === 185),
    "une moyenne est réapparue",
  );
  // ⛔ ET LES DEUX LIGNES SE DISTINGUENT DANS LA CONSIGNE. Sans les jours, elles
  // se lisent comme une contradiction.
  const phrase = densityFragment(r.named);
  assert(phrase.includes("at lunch on mon"), phrase);
  assert(phrase.includes("at lunch on tue"), phrase);

  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ LE CAS QUI PASSE, SUR LA MÊME MÉCANIQUE : un shaker de 300 au lieu de
  // 1 000, et les deux bandes se croisent. Sans lui, une fonction qui séparerait
  // toute fenêtre de deux jours aurait la même allure.
  //
  //   ⟳ 2026-09-23 — mardi 988 kcal → [180, 250]   ⊓ lundi [235, 250] = [235, 250]
  //   visée : la plus haute des deux (235, lundi), déjà dans la bande.
  // ══════════════════════════════════════════════════════════════════════════
  const croise = densite({
    slotsByDay: new Map([["mon", QUATRE], ["tue", QUATRE]]),
    slotFixedKcalByDay: new Map([["tue", new Map([["lunch", 300]])]]),
  });
  const ok = croise.named.filter((d) => d.slot === "lunch");
  assertEquals(ok.length, 1, "deux jours compatibles font UNE consigne");
  assertEquals(ok[0].incompatible, null);
  assertEquals(croise.counters.empty_intersection, 0);
  assertEquals(ok[0].occurrences, 2);
  assertEquals([ok[0].minPer100G, ok[0].maxPer100G, ok[0].preferredPer100G], [
    235,
    250,
    235,
  ]);
  // ⚠️ ET UNE BANDE COMMUNE NE SE DATE PAS : elle vaut pour ses deux jours, et
  // les nommer ferait une phrase plus longue pour zéro information.
  assert(!densityFragment(croise.named).includes(" on "), "la bande commune se date");

  // ⚠️ ET L'ORDRE DE PRIORITÉ DES DEUX MOTIFS EST ÉPINGLÉ : un besoin au-dessus
  // du plafond de demande est un fait sur le BESOIN, il voyage avec la ligne du
  // jour qui le porte, et il n'empêche pas cette ligne d'être groupée avec une
  // autre dont la bande la croise.
  //
  //   ⟳ 2026-09-23 — cible 3 542, table 550 g :
  //   lundi : rythme à un seul repas ⇒ 3 542 kcal sur le déjeuner, Gmax 550
  //           besoin = ⌈354 200/550⌉ = 644 > 250 ⇒ `above_askable_cap`, [250, 250]
  //   mardi : le même repas moins 3 400 kcal d'apport fixe = 142 kcal
  //             Gmax = min(142 ; 550) = 142
  //             Gmin = min(142/1,35 = 105,19 ; 250) = 105,19 → 105
  //             Dmin = ⌈14 200/142⌉ = 100     Dmax = ⌊14 200/105⌋ = 135
  //           ⇒ [100, 135], disjointe de [250, 250]
  const deux = densite({
    rhythmSlots: ["lunch"],
    slotsByDay: new Map([["mon", ["lunch"]], ["tue", ["lunch"]]]),
    slotFixedKcalByDay: new Map([["tue", new Map([["lunch", 3400]])]]),
  });
  const cumul = deux.named.filter((d) => d.slot === "lunch");
  assertEquals(cumul.length, 2, "les deux bandes sont disjointes, elles se séparent");
  const capee = cumul.find((d) => d.days.includes("mon"))!;
  assertEquals(capee.incompatible, "above_askable_cap");
  assertEquals(deux.counters.capped, 1);
  assertEquals(
    deux.counters.empty_intersection,
    1,
    "le moment a dû être séparé, et ça se compte",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ SANS ARRONDI REPRÉSENTABLE — ⛔ DÉFAUT ÉPINGLÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ DÉFAUT ÉPINGLÉ — un intervalle SANS entier est rabattu en silence, pas déclaré incompatible", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // CE QUE LE CHANTIER EXIGE (lot 4) : « L'arrondi final doit produire des
  // grammes représentables dans les bornes ; un intervalle sans valeur
  // représentable est explicitement incompatible. »
  //
  // CE QUE LE CODE FAIT : `maxPer100G = Math.max(minPer100G, …)`. Quand
  // `⌊Dmax⌋ < ⌈Dmin⌉` — c'est-à-dire quand l'intervalle vrai ne contient aucun
  // entier — le plafond est REMONTÉ au plancher et `incompatible` reste `null`.
  // La sortie est une bande d'un seul point, SITUÉE HORS de l'intervalle
  // qu'elle prétend décrire.
  // ══════════════════════════════════════════════════════════════════════════
  //
  //   bornes d'assiette 300 – 301 g, part de 362 kcal :
  //     Dmin brut = 100 × 362/301 = 120,265      Dmax brut = 100 × 362/300 = 120,667
  //     aucun entier entre les deux.
  //     rendu : ⌈120,265⌉ = 121, et ⌊120,667⌋ = 120 remonté à 121.
  //
  //   Conséquence servie : 362 kcal à 121 kcal/100 g pèsent 299,2 g — SOUS le
  //   plancher de 300 g. La consigne est tenable au gramme près et le plat
  //   qu'elle décrit est hors bornes, sans qu'un mot le dise.
  const c = densityCorridorFor({
    targetKcal: 362,
    bounds: {
      min: 300,
      max: 301,
      preferred: 300,
      appetiteFactor: 1,
      densityFloorPerG: 1,
      band: "adult",
      slotClass: "meal",
      source: "age_known",
      boundSource: "target",
      physicalMax: 700,
    },
  })!;
  assertEquals([c.minPer100G, c.maxPer100G], [121, 121]);
  // ⛔ L'ASSERTION QUI PORTE LE DÉFAUT. Le jour où le lot le ferme, elle rougit,
  // et celui qui le ferme vient la retourner : il ne peut pas ne pas la voir.
  assertEquals(
    c.incompatible,
    null,
    "⟳ l'intervalle sans entier est désormais NOMMÉ : viens retourner ce test",
  );
  // ⚠️ ET LA MESURE DU PRIX, en clair : la masse servie à la borne rendue.
  assertEquals(Math.round((362 / 121) * 100 * 10) / 10, 299.2);
});

Deno.test("DENSITÉ — la chaîne de PRODUCTION n'atteint jamais ce cas au-dessus de 50 kcal", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // L'AUTRE MOITIÉ DU DÉFAUT ÉPINGLÉ, ET ELLE CHANGE SA GRAVITÉ.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA RAISON EST STRUCTURELLE, PAS STATISTIQUE. `Gmin` descend de `E/1,35`
  // et `Gmax` de `E/ρ` avec ρ ≤ 1,0 ; les deux tables et l'appétit s'appliquent
  // aux deux bornes. Le rapport `Gmax/Gmin` vaut donc au moins 1,35, donc la
  // largeur du couloir vaut au moins 35 % de son plancher — soit plus d'un
  // entier dès que `Dmin ≥ 3`. Un moment à 50 kcal a déjà `Dmin ≥ 60`.
  //
  // ⚠️ CE QUE ÇA NE DIT PAS : que la garde est inutile. `densityCorridorFor`
  // est exportée, elle prend des bornes qu'on lui donne, et le test ci-dessus
  // montre ce qu'elle rend quand on l'appelle hors de la chaîne. Ce que ça dit,
  // c'est que le défaut n'est pas en train de servir des assiettes fausses
  // aujourd'hui — et qu'il n'y a donc pas d'urgence à le fermer dans la
  // précipitation.
  let examinés = 0;
  for (const ageYears of [3, 9, 14, 35, null]) {
    for (const slot of ["breakfast", "lunch", "dinner", "snack_pm"]) {
      for (const light of [false, true]) {
        for (const appetite of [null, "small", "average", "large"] as const) {
          for (let E = 50; E <= 2000; E += 10) {
            const bounds = plateBoundsFor({
              ageYears,
              slot,
              slotTargetKcal: E,
              light,
              appetite,
              personal: null,
            });
            const c = densityCorridorFor({ targetKcal: E, bounds });
            if (c === null) continue;
            examinés++;
            const dminBrut = (E / bounds.max) * 100;
            const dmaxBrut = (E / bounds.min) * 100;
            assert(
              c.incompatible === "above_askable_cap" ||
                Math.floor(dmaxBrut) >= Math.ceil(dminBrut),
              `${ageYears}/${slot}/léger=${light}/${appetite}/E=${E} : aucun entier dans [${dminBrut}, ${dmaxBrut}]`,
            );
            // ⛔ ET LE PLAFOND RENDU N'A PAS ÉTÉ REMONTÉ : il est bien ≤ au
            // plafond brut (ou au plafond de demande). C'est la même propriété,
            // dite sur la sortie plutôt que sur l'entrée.
            assert(
              c.maxPer100G <=
                Math.max(MAX_ASKABLE_DENSITY_PER_100G, Math.floor(dmaxBrut)),
              `${slot}/E=${E} : le plafond rendu dépasse le plafond brut`,
            );
          }
        }
      }
    }
  }
  // ⛔ LA PRÉMISSE : une boucle qui n'aurait rien examiné passerait toutes les
  // assertions ci-dessus sans rien prouver.
  assert(examinés > 10000, `la sonde n'a examiné que ${examinés} cas`);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ ⛔ DÉFAUT ÉPINGLÉ — L'INCOMPATIBILITÉ EST ÉCRITE, ET PERSONNE NE LA LIT
// ═══════════════════════════════════════════════════════════════════════════

function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1 ",
  );
}
Deno.test("⟳ FERMÉ — `incompatible` A UN LECTEUR, et la relâche est branchée", async () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 — CE CAS ÉPINGLAIT UN DÉFAUT. IL EST FERMÉ.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // CE QU'IL DÉCRIVAIT: `above_askable_cap` et `empty_intersection` étaient
  // calculés, nommés, éprouvés — et **rien ne lisait le champ**. La consigne
  // envoyée au modèle pour une intersection vide était indistinguable d'une
  // bande parfaitement tenable: on lui demandait de viser un point qui n'existe
  // pas, et on comptait son échec comme une désobéissance.
  //
  // Et les quatre compteurs du lot 4 n'atteignaient aucun journal — alors que
  // le commentaire d'`empty_intersection` dit « IL DOIT RESTER RARE. S'il
  // grimpe, la sortie est une recette SÉPARÉE ». Personne ne pouvait savoir.
  //
  // CE QUI L'A FERMÉ, dans cet ordre: le rendu lit le champ, les compteurs
  // remontent, et `redistributeDayBudget` — écrite au lot 4, éprouvée à onze
  // cas, **sans aucun appelant** — est branchée par `relaxDayForCorridors`.
  // ══════════════════════════════════════════════════════════════════════════
  const rendu = sansCommentaires(
    await Deno.readTextFile(
      new URL("./household_portions.ts", import.meta.url),
    ),
  );
  // ⛔ ① LA BANDE INTENABLE SE DIT. Le nombre RESTE — une case sans chiffre se
  // compose au hasard — mais on écrit qu'il est hors de portée.
  assert(
    rendu.includes("d.incompatible !== null"),
    "`densityFragment` a cessé de lire `incompatible`: une intersection vide " +
      "repart au modèle comme une cible tenable.",
  );
  assert(
    rendu.includes("above_askable_cap"),
    "les deux causes ne sont plus distinguées dans la consigne",
  );

  const handler = sansCommentaires(
    await Deno.readTextFile(
      new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
    ),
  );
  // ⛔ ② LES QUATRE COMPTEURS DU LOT 4 REMONTENT. Un compteur qu'on n'agrège
  // pas est un compteur mort.
  for (
    const compteur of [
      "density.counters.capped",
      "density.counters.fixed_covered",
      "density.counters.floor_min_kept",
      "density.counters.empty_intersection",
    ]
  ) {
    assert(
      handler.includes(compteur),
      `le handler n'agrège plus \`${compteur}\`: le lot 4 redevient muet.`,
    );
  }
  // ⚠️ LA CONTRE-ÉPREUVE, GARDÉE: deux compteurs étaient DÉJÀ lus. Sans elle,
  // un chemin de fichier faux rendrait « tout est lu » pour de mauvaises
  // raisons.
  assert(
    handler.includes("density.counters.above_floor") &&
      handler.includes("density.counters.days_varied"),
    "le lecteur ne lit rien: l'audit ci-dessus ne prouve rien",
  );

  // ⛔ ③ LA REDISTRIBUTION A UN APPELANT DE PRODUCTION. C'était le défaut le
  // plus embarrassant du lot: un module complet, testé, que rien n'appelait.
  // ⟳ 2026-09-11 · LOT B — LE LECTEUR A DÉMÉNAGÉ. `requiredDensityFor` et la
  // relâche vivent dans le module du contrat; `relaxDayForCorridors` et
  // `redistributeDayBudget`, elles, sont restées dans `portion_sizing.ts`. Un
  // grep resté sur l'ancien fichier aurait rendu « plus aucun appelant » alors
  // que l'appelant a simplement changé d'adresse — le faux rouge symétrique du
  // faux vert que ce test existe pour empêcher.
  const sizing = sansCommentaires(
    await Deno.readTextFile(
      new URL("./slot_nutrition_contract.ts", import.meta.url),
    ),
  );
  assert(
    sizing.includes("relaxDayForCorridors({"),
    "`redistributeDayBudget` n'a de nouveau aucun appelant: le couloir vide " +
      "n'a plus de sortie.",
  );
  // ⚠️ LA CONTRE-ÉPREUVE DE L'ADRESSE: la fonction appelée est bien celle de
  // `portion_sizing.ts`, pas une seconde écriture dans le module du contrat.
  const moteur = sansCommentaires(
    await Deno.readTextFile(new URL("./portion_sizing.ts", import.meta.url)),
  );
  assert(
    moteur.includes("export function relaxDayForCorridors("),
    "la relâche a été recopiée au lieu d'être appelée",
  );
  // ⛔ ET LE RECALCUL SUIT LE DÉPLACEMENT. Une relâche sans recalcul rendrait
  // des couloirs calculés sur une journée qui n'existe plus — le défaut exact
  // que le lot 5 vient de fermer en aval.
  // ⟳ 2026-09-23 — l'expression a changé de forme, pas de sens : le contrat
  // lit maintenant la table relâchée ou, à défaut, la table des PLATS (la part
  // du moment moins son à-côté), `(relaxed ?? targets).get(slot)`. Un retour à
  // `targets.get(slot)` seul refait le défaut, et ce test rougit.
  assert(
    sizing.includes("(relaxed ?? targets).get(slot)"),
    "la cible relâchée n'est plus reprise: les couloirs décrivent la journée " +
      "d'avant le déplacement.",
  );
  // ⚠️ ET UN CONFLIT QUI NE SE RÉSOUT PAS RESTE EXPLICITE. Pas de rabotage,
  // pas de moyenne, pas de journée baissée en silence.
  assert(
    sizing.includes("relax_refused"),
    "un refus de relâche ne se compte plus: le conflit disparaît en silence.",
  );
});
