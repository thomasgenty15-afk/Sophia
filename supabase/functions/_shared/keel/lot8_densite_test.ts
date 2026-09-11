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

/** Voir `lot8_allocation_test.ts` pour la dérivation de sa cible : 3 578. */
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
const CIBLE_GRAND = 3578;

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
  //   250 kcal, repas d'un adulte (table 250 – 700 g), appétit non renseigné :
  //     Gmax = min(250/1,0 ; 700) = 250
  //     Gmin = min(250/1,35 = 185,19 ; 250) = 185,19 → 185
  //     Dmin = ⌈100 × 250/250⌉ = 100      Dmax = ⌊25 000/185 = 135,13⌋ = 135
  //     Dpréf = arrondi(100 × 1,10) = 110
  const bounds = plateBoundsFor({
    ageYears: 35,
    slot: "lunch",
    slotTargetKcal: 250,
    light: false,
    appetite: null,
  });
  assertEquals([bounds.min, bounds.max], [185, 250]);
  const c = densityCorridorFor({ targetKcal: 250, bounds })!;
  assertEquals([c.minPer100G, c.maxPer100G, c.preferredPer100G], [
    100,
    135,
    110,
  ]);

  // ⛔ ET LE TEXTE PORTE LE 135. La borne basse n'ajoute rien au plancher
  // commun du bloc (100), donc la consigne s'écrit « au plus » — mais elle
  // S'ÉCRIT. C'est très exactement ce que l'ancien filtre `min > floor`
  // coûtait : il jetait la ligne entière, et le plafond partait avec elle.
  const rendu = densityFragment([commeLeMoteur("snack_pm", c, 100)]);
  assertEquals(
    rendu,
    " — dishes served here: up to 135 kcal per 100 g at snack_pm (aim 110)",
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
  //   cible 3 578 ; quatre moments, Σ des poids = 0,25 + 0,40 + 0,10 + 0,35 = 1,10
  //   déjeuner  3578 × 0,40/1,10 = 1 301,09 kcal
  //     Gmax = min(1 301,09 ; 700) = 700      ⇒ Dmin = ⌈130 109,09/700 = 185,87⌉ = 186
  //     Gmin = min(1 301,09/1,35 = 963,8 ; 250) = 250
  //                                           ⇒ Dmax = ⌊520,44⌋ = 520, rabattu à 250
  //     Dpréf = arrondi(185,87 × 1,10 = 204,46) = 204
  assertEquals(dayTargetFor(bouche(), "no_position").kcal, CIBLE_GRAND);
  const r = densite();
  const lunch = r.named.find((d) => d.slot === "lunch")!;
  assertEquals(
    [lunch.minPer100G, lunch.maxPer100G, lunch.preferredPer100G],
    [186, 250, 204],
  );
  assertEquals(
    lunch.redundantMin,
    false,
    "186 mord : la bande s'écrit en entier",
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
  assert(rendu.includes("186 to 250 at lunch (aim 204, not 274)"), rendu);
  assertEquals(
    (rendu.match(/over an average plate/g) ?? []).length,
    1,
    `l'explication des deux nombres se dit UNE fois: ${rendu}`,
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
  //   déjeuner  1 301,09 − 1 000 = 301,09 kcal ; A = 1,10
  //     Gmax = min(1,10 × min(301,09 ; 700) ; 700) = 331,2 → 331
  //     Gmin = min(1,10 × min(301,09/1,35 = 223,03 ; 250) ; 331,2) = 245,33 → 245
  //     Dmin = ⌈30 109,09/331 = 90,96⌉ = 91     Dmax = ⌊30 109,09/245 = 122,89⌋ = 122
  //     Dpréf = arrondi(90,96 × 1,10 = 100,06) = 100
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
    [91, 122, 100],
  );
  assertEquals(
    lunch.redundantMin,
    true,
    "91 n'ajoute rien au plancher commun de 100",
  );
  assertEquals(gros.counters.floor_min_kept, 1);

  assertEquals(
    densityFragment([lunch]),
    " — dishes served here: up to 122 kcal per 100 g at lunch (aim 100)",
  );
  // ⚠️ ET LA VISÉE EST DITE. « Au plus 122 » sans visée fait partir le modèle
  // vers le bas — l'erreur miroir de « au moins N », mesurée au tir SPLICE3
  // (un bouillon à 57,8).
  assert(densityFragment([lunch]).includes("aim 100"));
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LÉGER, 588 kcal, PLAFOND 700 g → MINIMUM 84
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ DENSITÉ — 588 kcal LÉGER sous un plafond de 700 g : minimum 84", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE CAS CHIFFRÉ DU CHANTIER, DÉRIVÉ À LA MAIN : 100 × 588 / 700 = 84.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ ET C'EST LE PREMIER TEST DU DÉPÔT QUI PASSE `light: true` À
  // `plateBoundsFor`. Le drapeau est requis par le type — il ne peut pas être
  // oublié par un appelant — mais sa CONSÉQUENCE, le plancher de densité à 0,6
  // au lieu de 1,0, n'était éprouvée nulle part.
  //
  //   588 kcal, dîner d'un adulte marqué léger (table 250 – 700 g), ρ = 0,6 :
  //     bmax brut = 588/0,6 = 980 ⇒ rabattu par la table à 700   (`boundSource: table`)
  //     Gmin = min(588/1,35 = 435,56 ; 250) = 250
  //     Gpréf = (250 + 700)/2 = 475
  //     Dmin = ⌈100 × 588/700⌉ = ⌈84⌉ = **84**
  //     Dmax = ⌊58 800/250 = 235,2⌋ = 235
  //     Dpréf = arrondi(84 × 1,10 = 92,4) = 92
  const leger = plateBoundsFor({
    ageYears: 35,
    slot: "dinner",
    slotTargetKcal: 588,
    light: true,
    appetite: null,
  });
  assertEquals(leger.densityFloorPerG, 0.6);
  assertEquals([leger.min, leger.max, leger.preferred], [250, 700, 475]);
  assertEquals(
    leger.boundSource,
    "table",
    "c'est bien la table qui a rabattu 980 à 700",
  );
  const c = densityCorridorFor({ targetKcal: 588, bounds: leger })!;
  assertEquals(c.minPer100G, 84);
  assertEquals([c.maxPer100G, c.preferredPer100G], [235, 92]);
  assertEquals(
    c.neededMinPer100G,
    84,
    "rien n'a été rabattu : le besoin EST 84",
  );
  assertEquals(c.incompatible, null);

  // ⛔ LA CONTRE-ÉPREUVE, SUR LE MÊME NOMBRE DE KCAL : sans le drapeau, le même
  // dîner reçoit 100. Un plat 19 % plus dense que nécessaire, c'est-à-dire une
  // assiette de 588 g au lieu de 700 — exactement ce que « léger » ne veut pas
  // dire. « Léger » borne le VOLUME d'un plat, pas sa portion.
  const ordinaire = plateBoundsFor({
    ageYears: 35,
    slot: "dinner",
    slotTargetKcal: 588,
    light: false,
    appetite: null,
  });
  assertEquals(ordinaire.densityFloorPerG, 1);
  assertEquals([ordinaire.min, ordinaire.max], [250, 588]);
  assertEquals(
    ordinaire.boundSource,
    "target",
    "ici la table ne mord pas : 588 < 700",
  );
  assertEquals(
    densityCorridorFor({ targetKcal: 588, bounds: ordinaire })!.minPer100G,
    100,
  );

  // ⚠️ ET 84 DÉPASSE LE PLANCHER DES MOMENTS LÉGERS (60) : la bande est donc
  // NOMMÉE en entier, pas résumée en « au plus 235 ».
  assertEquals(
    densityFragment([commeLeMoteur("dinner", c, 60)]),
    " — dishes served here: 84 to 235 kcal per 100 g at dinner (aim 92, not 124)" +
      ` (the "not N" numbers are the target spread over an average plate; ` +
      `we ask for the bigger plate, so aim for the first number)`,
    // ⟳ 2026-09-11 — `not 124` et sa note sont neufs: `100 × E / Gpréf` vaudrait
    // 124 ici contre une visée de 92. On ne substitue pas (arbitrage A15), on
    // NOMME les deux — c'est ce que le chantier demande par le mot
    // « silencieusement ».
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
  //     Dmin = 100 ; Dmax = ⌊200⌋ = 200 ; Dpréf = arrondi(110) = 110
  const b = plateBoundsFor({
    ageYears: 35,
    slot: "lunch",
    slotTargetKcal: 500,
    light: false,
    appetite: null,
  });
  assertEquals(b.boundSource, "target");
  const c = densityCorridorFor({ targetKcal: 500, bounds: b })!;
  assertEquals([c.minPer100G, c.maxPer100G, c.preferredPer100G], [
    100,
    200,
    110,
  ]);

  //   300 kcal, dîner LÉGER : Gmax = 300/0,6 = 500 ; Gmin = min(222,2 ; 250) = 222
  //     Dmin = ⌈30 000/500⌉ = 60 ; Dmax = ⌊30 000/222 = 135,14⌋ = 135
  const l = plateBoundsFor({
    ageYears: 35,
    slot: "dinner",
    slotTargetKcal: 300,
    light: true,
    appetite: null,
  });
  assertEquals(l.boundSource, "target");
  assertEquals(
    densityCorridorFor({ targetKcal: 300, bounds: l })!.minPer100G,
    60,
  );

  // ⛔ ET LA SORTIE PAR LE HAUT : dès que la table mord, Dmin monte, et
  // `boundSource` dit qui a décidé. 900 kcal au déjeuner d'un adulte :
  //     Gmax = min(900 ; 700) = 700 ⇒ Dmin = ⌈90 000/700 = 128,57⌉ = 129
  const gros = plateBoundsFor({
    ageYears: 35,
    slot: "lunch",
    slotTargetKcal: 900,
    light: false,
    appetite: null,
  });
  assertEquals(gros.boundSource, "table");
  assertEquals(
    densityCorridorFor({ targetKcal: 900, bounds: gros })!.minPer100G,
    129,
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
  //     Gmax = min(1,10 × 500 ; 700) = 550    Gmin = min(1,10 × 250 ; 550) = 275
  //     Dmin = ⌈50 000/550 = 90,91⌉ = 91      Dmax = ⌊50 000/275 = 181,8⌋ = 181
  //     Dpréf = arrondi(90,91 × 1,10 = 100,0) = 100
  const b = plateBoundsFor({
    ageYears: 35,
    slot: "breakfast",
    slotTargetKcal: 500,
    light: false,
    appetite: "large",
  });
  assertEquals([b.min, b.max, b.preferred], [275, 550, 413]);
  const c = densityCorridorFor({ targetKcal: 500, bounds: b })!;
  assertEquals([c.minPer100G, c.maxPer100G, c.preferredPer100G], [
    91,
    181,
    100,
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
  //   lundi    1 301,09 kcal → Gmax 700, Gmin 250 → [186, 520 ⇒ 250]  visée 204
  //   mardi    1 301,09 − 300 = 1 001,09 → Gmax 700, Gmin 250
  //                                      → [⌈143,01⌉ = 144, 400 ⇒ 250]  visée 157
  //   mercredi 1 301,09 − 800 = 501,09 → Gmax 501, Gmin min(371,2 ; 250) = 250
  //                                      → [⌈100,02⌉ = 101, ⌊200,44⌋ = 200]  visée 110
  //
  //   max(Dmin) = 186 (LUNDI)      min(Dmax) = 200 (MERCREDI)
  const r = densite({
    slotsByDay: new Map([["mon", QUATRE], ["tue", QUATRE], ["wed", QUATRE]]),
    slotFixedKcalByDay: new Map([
      ["tue", new Map([["lunch", 300]])],
      ["wed", new Map([["lunch", 800]])],
    ]),
  });
  const lunch = r.named.find((d) => d.slot === "lunch")!;
  assertEquals([lunch.minPer100G, lunch.maxPer100G], [186, 200]);
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
  // kcal/100 g servirait alors les 501 kcal du mercredi dans 200 g — sous les
  // 250 g de plancher d'assiette de cette personne.
  const lundiSeul = densite().named.find((d) => d.slot === "lunch")!;
  assertEquals(lundiSeul.maxPer100G, 250);
  assert(
    lunch.maxPer100G < lundiSeul.maxPer100G,
    "le plafond du mercredi n'a pas mordu : c'est le couloir d'un seul jour qui sort",
  );

  // ⚠️ ET LA VISÉE RESTE DANS LA BANDE COMMUNE. Elle est projetée, pas
  // recalculée : la plus haute des visées (204, lundi) rabattue au plafond
  // commun, donc 200.
  assertEquals(lunch.preferredPer100G, 200);
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
  //   lundi    déjeuner 1 301,09 kcal → Gmax 700, Gmin 250 → [186, 250]
  //   mardi    déjeuner 1 301,09 − 1 000 = 301,09 kcal
  //              Gmax = min(301,09 ; 700) = 301,09 → 301
  //              Gmin = min(301,09/1,35 = 223,03 ; 250) = 223,03 → 223
  //              Dmin = ⌈30 109,09/301 = 100,03⌉ = 101
  //              Dmax = ⌊30 109,09/223 = 135,02⌋ = 135          → [101, 135]
  //
  //   max(Dmin) = 186 > min(Dmax) = 135 ⇒ AUCUNE densité ne sert les deux jours.
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
  assertEquals([lundi.minPer100G, lundi.maxPer100G], [186, 250]);
  assertEquals([mardi.minPer100G, mardi.maxPer100G], [101, 135]);
  // ⛔ CHAQUE BANDE EST TENABLE CHEZ ELLE. C'est toute la différence avec la
  // ligne unique d'avant, dont aucun des deux jours ne pouvait rien faire.
  assertEquals(lundi.incompatible, null);
  assertEquals(mardi.incompatible, null);
  // ⚠️ (186 + 135)/2 = 160,5 : le nombre qu'une moyenne aurait rendu, et qu'on
  // ne rend toujours pas. Écrit ici pour qu'une régression soit lisible.
  assert(
    !midis.some((d) => d.minPer100G === 160 || d.minPer100G === 161),
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
  //   mardi 1 001,09 kcal → [144, 250]   ⊓ lundi [186, 250] = [186, 250]
  //   visée : la plus haute des deux (204, lundi), déjà dans la bande.
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
    186,
    250,
    204,
  ]);
  // ⚠️ ET UNE BANDE COMMUNE NE SE DATE PAS : elle vaut pour ses deux jours, et
  // les nommer ferait une phrase plus longue pour zéro information.
  assert(!densityFragment(croise.named).includes(" on "), "la bande commune se date");

  // ⚠️ ET L'ORDRE DE PRIORITÉ DES DEUX MOTIFS EST ÉPINGLÉ : un besoin au-dessus
  // du plafond de demande est un fait sur le BESOIN, il voyage avec la ligne du
  // jour qui le porte, et il n'empêche pas cette ligne d'être groupée avec une
  // autre dont la bande la croise.
  //
  //   lundi : rythme à un seul repas ⇒ 3 578 kcal sur le déjeuner, Gmax 700
  //           besoin = ⌈357 800/700⌉ = 511 > 250 ⇒ `above_askable_cap`, [250, 250]
  //   mardi : le même repas moins 3 400 kcal d'apport fixe = 178 kcal
  //             Gmax = min(178 ; 700) = 178
  //             Gmin = min(178/1,35 = 131,85 ; 250) = 131,85 → 132
  //             Dmin = ⌈17 800/178⌉ = 100     Dmax = ⌊17 800/132⌋ = 134
  //           ⇒ [100, 134], disjointe de [250, 250]
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
  assert(
    sizing.includes("relaxed?.get(slot) ?? planned"),
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
