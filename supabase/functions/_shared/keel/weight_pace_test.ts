import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  ceilingFromBounds,
  energyFloorFor,
  KCAL_PER_KG_BODY_MASS,
  MAX_KG_PER_WEEK,
  MAX_WEEKLY_BODY_FRACTION,
  MINOR_MAX_DAILY_DELTA_FRACTION,
  executedPaceFor,
  PACE_SATURATION_LABELS,
  PACE_SATURATIONS,
  PACE_WARN_UP_KG_PER_WEEK,
  PACE_WARNING_LABELS,
  PACE_WARNINGS,
  paceCeilingFor,
  paceSaturation,
  paceWarning,
  type PaceSubject,
  roundPace,
  scaleDirectionOf,
  targetWeightRefusal,
  weeksToTarget,
} from "./weight_pace.ts";
import { estimatedChildMaintenanceKcal, type MouthBody } from "./meal_envelope.ts";
import { GOAL_TOKENS } from "./tokens.ts";
import { ageBandOf } from "./student_age.ts";

// ---------------------------------------------------------------------------
// LES BANCS
// ---------------------------------------------------------------------------

function body(over: Partial<MouthBody> = {}): MouthBody {
  return {
    heightCm: 168,
    weightKg: 60,
    gender: "female",
    ageYears: 34,
    activityLevel: null,
    ...over,
  };
}

const adult = (over: Partial<MouthBody> = {}): PaceSubject => ({
  body: body(over),
  isMinor: false,
});
const minor = (over: Partial<MouthBody> = {}): PaceSubject => ({
  body: body({ heightCm: 150, weightKg: 40, gender: "male", ageYears: 12, ...over }),
  isMinor: true,
});

// ---------------------------------------------------------------------------
// LA DIRECTION — et le repli des deux champs du formulaire
// ---------------------------------------------------------------------------

Deno.test("chaque objectif a une direction NOMMÉE, et `maintenance` n'en a pas", () => {
  // R6: aucune valeur d'énumération sans branche nommée. La boucle porte sur la
  // constante du produit — un quatrième objectif ne compilerait pas.
  const seen = new Set<string>();
  for (const goal of GOAL_TOKENS) seen.add(String(scaleDirectionOf(goal)));
  assertEquals(seen, new Set(["down", "null", "up"]));

  // ⚠️ `null` N'EST PAS UN OUBLI, C'EST LE REPLI DES DEUX CHAMPS. « Maintenir »
  // ne déplie ni le poids visé ni le rythme: la balance ne bouge pas, donc il
  // n'y a rien à viser et rien à régler.
  assertEquals(scaleDirectionOf("maintenance"), null);
  assertEquals(scaleDirectionOf("fat_loss"), "down");
  assertEquals(scaleDirectionOf("muscle_gain"), "up");
});

// ---------------------------------------------------------------------------
// LE MIN DES TROIS — chaque borne a un cas où elle GAGNE
// ---------------------------------------------------------------------------
//
// ⚠️ POURQUOI CE BANC EST SUR DES NOMBRES NUS ET PAS SUR DES CORPS.
// « Une garde a besoin d'un cas qui passe »: cassée, elle bloque tout et
// ressemble à une garde qui marche. Sur un corps RÉEL, la troisième borne est
// presque toujours la plus serrée (elle intègre A1), donc les deux premières
// n'auraient aucun cas gagnant — et la tentation serait d'ouvrir une porte de
// test dans `paceCeilingFor`, c'est-à-dire une garde désarmée. Ici le MIN est
// une fonction pure de trois nombres: chaque borne y gagne pour de vrai.
// ---------------------------------------------------------------------------

Deno.test("le plafond ABSOLU gagne quand il est le plus petit", () => {
  assertEquals(ceilingFromBounds(1.0, 1.3, 1.7), {
    maxKgPerWeek: 1.0,
    bound: "absolute_cap",
  });
});

Deno.test("le GABARIT gagne quand il est le plus petit", () => {
  assertEquals(ceilingFromBounds(1.0, 0.85, 1.36), {
    maxKgPerWeek: 0.85,
    bound: "body_fraction",
  });
});

Deno.test("le PLANCHER D'ÉNERGIE gagne quand il est le plus petit", () => {
  assertEquals(ceilingFromBounds(1.0, 0.6, 0.45), {
    maxKgPerWeek: 0.45,
    bound: "energy_floor",
  });
});

Deno.test("à égalité, c'est la borne la plus PROTECTRICE qui est nommée", () => {
  // Nommer le plafond absolu sur une égalité ferait croire qu'une décision
  // produit sépare la personne de son rythme, alors que c'est son corps.
  assertEquals(ceilingFromBounds(1.0, 1.0, 1.0).bound, "energy_floor");
  assertEquals(ceilingFromBounds(0.5, 0.5, 0.9).bound, "body_fraction");
});

Deno.test("l'arrondi du cran va VERS LE BAS — un plafond ne s'arrondit pas en l'air", () => {
  // `Math.round(0.4750)` rendrait 0,50: un rythme que le calcul venait de
  // refuser. La contre-épreuve est sur la valeur, pas sur le nom de la
  // fonction.
  assertEquals(roundPace(0.4750), 0.45);
  assertEquals(roundPace(0.4545), 0.45);
  assertEquals(roundPace(1.0), 1.0);
  assertEquals(roundPace(0.04), 0);
});

// ---------------------------------------------------------------------------
// LE CAS DU DESIGN — « 600 kcal/jour », refusé par son nom
// ---------------------------------------------------------------------------

Deno.test("⛔ le cas de 60 kg du design ne produit JAMAIS une cible à 600 kcal", () => {
  // §Bloc 2 de la conception, mot pour mot: « sur une personne de 60 kg dont
  // l'entretien tourne autour de 1 700 kcal, [1 kg/semaine] pose une cible à
  // 600 kcal/jour. Aucun produit ne doit écrire ce nombre. »
  const c = paceCeilingFor("down", adult({ weightKg: 60 }));
  assert(c !== null);
  assert(
    c.maxKgPerWeek < MAX_KG_PER_WEEK,
    `le plafond absolu ne doit pas s'appliquer tel quel: ${c.maxKgPerWeek}`,
  );
  // L'écart quotidien du cran maximal, comparé au plancher: la journée reste
  // au-dessus. C'est la propriété, pas le nombre.
  const maintenance = 60 * 30; // ordre de grandeur, ~1 800
  assert(
    maintenance - c.dailyDeltaKcal > energyFloorFor("female"),
    `${maintenance - c.dailyDeltaKcal} kcal/j est sous le plancher`,
  );
});

Deno.test("le plafond s'ADAPTE: deux gabarits ne reçoivent pas le même cran", () => {
  // « Un slider dont le maximum s'adapte à la personne est plus crédible qu'un
  // slider qui promet la même chose à tout le monde. » Mesuré sur la VALEUR.
  const small = paceCeilingFor("down", adult({ weightKg: 48, heightCm: 155 }));
  const large = paceCeilingFor(
    "down",
    adult({ weightKg: 115, heightCm: 186, gender: "male" }),
  );
  assert(small !== null && large !== null);
  assert(
    small.maxKgPerWeek < large.maxKgPerWeek,
    `${small.maxKgPerWeek} devrait être sous ${large.maxKgPerWeek}`,
  );
  assert(large.maxKgPerWeek <= MAX_KG_PER_WEEK, "le plafond absolu tient encore");
});

Deno.test("aucun cran ne dépasse le plafond absolu, sur toute la plage de corps", () => {
  // La borne 1 est un ET, pas un OU: elle doit tenir même quand la borne 3 est
  // très lâche. Balayage large plutôt qu'un cas choisi.
  for (let w = 30; w <= 250; w += 5) {
    for (const g of ["male", "female", "other", null] as const) {
      const c = paceCeilingFor("down", adult({ weightKg: w, gender: g, heightCm: 180 }));
      if (c === null) continue;
      assert(c.maxKgPerWeek <= MAX_KG_PER_WEEK, `${w}kg/${g}: ${c.maxKgPerWeek}`);
      assert(
        c.maxKgPerWeek <= w * MAX_WEEKLY_BODY_FRACTION + 1e-9,
        `${w}kg/${g}: le gabarit est dépassé`,
      );
    }
  }
});

Deno.test("⚠️ une PRISE monte jusqu'à la borne DURE — le seuil de 0,5 kg n'en est pas une", () => {
  // ── LE TEST QUE CE FICHIER PORTAIT, ET QUI DISAIT L'INVERSE DE SA CITATION ─
  // Il citait le §Bloc 2 — « au-delà d'environ 0,5 kg/semaine le surplus part
  // surtout en gras » — puis affirmait `maxKgPerWeek <= 0.5`. La phrase citée
  // se termine par « le slider le DIT, il ne l'interdit pas ». Le test avait
  // donc gelé la moitié de la décision et jeté l'autre, et il gardait vert un
  // slider qui plafonnait un adulte de 70 kg à 0,30 kg/semaine.
  //
  // Les TROIS bornes du MIN sont dures. Le seuil de 0,5 kg est un
  // AVERTISSEMENT (`paceWarning`). Ce test tient la différence.
  const up = paceCeilingFor("up", adult({ weightKg: 70, gender: "male" }));
  assert(up !== null);
  assertEquals(up.maxKgPerWeek, 0.7);
  assertEquals(up.bound, "body_fraction");
  // Et il PARLE au lieu de refuser.
  assertEquals(paceWarning("up", up.maxKgPerWeek), "surplus_becomes_fat");
});

Deno.test("le plafond ABSOLU est le seul mur d'une prise, et il tient", () => {
  // Au-delà de 100 kg, le 1 % du poids dépasse le kilo: c'est LE cas — et le
  // seul du module — où `absolute_cap` gagne sur un corps réel. Avant
  // l'ouverture du 2026-08-18 il ne gagnait JAMAIS, sur aucun des 72 320 corps
  // balayés, et une phrase d'interface lui était pourtant destinée.
  for (const weightKg of [110, 150, 250]) {
    const up = paceCeilingFor("up", adult({ weightKg, gender: "male" }));
    assert(up !== null);
    assertEquals(up.bound, "absolute_cap", `à ${weightKg} kg`);
    assertEquals(up.maxKgPerWeek, MAX_KG_PER_WEEK);
  }
});

Deno.test("⚠️ l'ouverture de la prise ne touche PAS un mineur", () => {
  // L'ORDRE DES CAS DANS `paceCeilingFor` EST CE QUI LE TIENT. `isMinor` passe
  // devant `direction`: avant le 2026-08-18 c'était l'inverse, et sans
  // conséquence tant que la prise était bornée à +10 % de l'entretien. Ouvrir
  // la prise de l'adulte sans retourner l'ordre aurait porté un enfant à
  // 1 kg/semaine.
  //
  // La décision du §Bloc 2 porte sur quelqu'un QUI CHOISIT POUR LUI-MÊME. La
  // case d'un mineur est cochée par le compte maître.
  const child = minor({ weightKg: 40, ageYears: 11, heightCm: 145 });
  const up = paceCeilingFor("up", child);
  assert(up !== null);
  assert(
    up.maxKgPerWeek <= 0.5,
    `un mineur ne monte pas au-delà du seuil: ${up.maxKgPerWeek}`,
  );
  assertEquals(up.bound, "energy_floor");
  // Et il ne reçoit jamais la phrase, parce qu'il ne peut pas atteindre le
  // seuil qui la déclenche.
  assertEquals(paceWarning("up", up.maxKgPerWeek), null);
});

Deno.test("l'avertissement PARLE au-delà, se tait dessus, et jamais sur une perte", () => {
  // Le seuil est FRANCHI, pas atteint: à 0,50 pile on ne dit rien. Avertir
  // sur le cran qu'on vient de proposer ferait parler le produit contre
  // lui-même.
  assertEquals(paceWarning("up", 0.45), null);
  assertEquals(paceWarning("up", PACE_WARN_UP_KG_PER_WEEK), null);
  assertEquals(paceWarning("up", 0.55), "surplus_becomes_fat");
  assertEquals(paceWarning("up", 1.0), "surplus_becomes_fat");
  // Une PERTE est déjà tenue par trois bornes dures. Lui ajouter une phrase
  // ferait deux fois le même geste.
  assertEquals(paceWarning("down", 0.45), null);
  assertEquals(paceWarning("down", 1.0), null);
});

Deno.test("la phrase existe DANS LES DEUX LANGUES, et elle dit un fait", () => {
  for (const warning of PACE_WARNINGS) {
    const label = PACE_WARNING_LABELS[warning];
    assert(label, `${warning} n'a pas de phrase`);
    for (const lang of ["en", "fr"] as const) {
      const text = label[lang];
      assert(text.trim().length > 0, `${warning}.${lang} est vide`);
      // Le nombre du seuil est DANS la phrase: une phrase qui dirait « trop
      // vite » sans dire à partir de quoi n'est pas un fait, c'est un jugement.
      assert(
        text.includes("0.5") || text.includes("0,5"),
        `${warning}.${lang} ne nomme pas le seuil: ${text}`,
      );
    }
    // Les deux langues disent bien deux choses différentes — une table dont
    // les deux côtés sont identiques est une traduction oubliée.
    assert(label.en !== label.fr, `${warning} n'est pas traduit`);
  }
});

// ---------------------------------------------------------------------------
// ③ — LE CURSEUR SATURE, ET LA PHRASE LE DIT
// ---------------------------------------------------------------------------

Deno.test("③ le curseur SATURE sur une prise, et deux crans très différents rendent le même écart", () => {
  // ⚠️ LA MESURE D'ABORD, LA PHRASE ENSUITE. Sans cette assertion, la phrase
  // pourrait s'afficher sur un curseur qui, lui, bougerait encore — et personne
  // ne le saurait. Femme de 60 kg, 165 cm, 28 ans, sédentaire, en prise: son
  // curseur monte à 0,60 et les deux tiers de sa course ne changent RIEN.
  const her = adult({
    weightKg: 60,
    heightCm: 165,
    gender: "female",
    ageYears: 28,
    activityLevel: "sedentary",
  });
  const ceiling = paceCeilingFor("up", her);
  assert(ceiling !== null);
  assertEquals(ceiling.maxKgPerWeek, 0.6);

  const at = (kg: number) => executedPaceFor("up", her, kg);
  const low = at(0.15);
  const mid = at(0.2);
  const top = at(0.6);
  assert(low !== null && mid !== null && top !== null);

  // ── LE FAIT MESURÉ: 0,20 et 0,60 rendent le MÊME nombre ─────────────────
  assertEquals(mid.dailyDeltaKcal, top.dailyDeltaKcal);
  assertEquals(mid.clampedBy, "surplus_band");
  assertEquals(top.clampedBy, "surplus_band");
  // ⚠️ ET LE CAS QUI PASSE, sans lequel ce banc resterait vert si la borne
  // saturait TOUT LE MONDE: à 0,15 le cran est exécuté tel quel, et il rend un
  // écart STRICTEMENT plus petit. « Une garde a besoin d'un cas qui passe. »
  assertEquals(low.clampedBy, "chosen");
  assert(
    low.dailyDeltaKcal < mid.dailyDeltaKcal,
    `0,15 devrait rendre moins que 0,20: ${low.dailyDeltaKcal} vs ${mid.dailyDeltaKcal}`,
  );

  // ── LA PHRASE SUIT EXACTEMENT LA MESURE ─────────────────────────────────
  assertEquals(paceSaturation("up", her, 0.15), null);
  assertEquals(paceSaturation("up", her, 0.2), "plate_stops_changing");
  assertEquals(paceSaturation("up", her, 0.6), "plate_stops_changing");
  assertEquals(paceSaturation("up", her, 1.0), "plate_stops_changing");
});

Deno.test("③ une PERTE ne sature jamais, et un MINEUR non plus", () => {
  // Ce n'est pas de la dormance: sur une perte et sur un mineur,
  // `paceCeilingFor` borne le curseur EXACTEMENT là où `executedPaceFor`
  // plafonne — la même borne, lue deux fois. La phrase n'a donc rien à y dire,
  // et si elle s'y affichait ce serait le signe que les deux lectures ont
  // divergé.
  const her = adult({ weightKg: 60, heightCm: 165, gender: "female", ageYears: 28 });
  const down = paceCeilingFor("down", her);
  assert(down !== null);
  for (let kg = 0.05; kg <= down.maxKgPerWeek + 1e-9; kg += 0.05) {
    assertEquals(
      paceSaturation("down", her, Math.round(kg * 100) / 100),
      null,
      `perte à ${kg}`,
    );
  }
  const child = minor({ weightKg: 45, heightCm: 155, gender: "male", ageYears: 13 });
  for (const dir of ["up", "down"] as const) {
    const c = paceCeilingFor(dir, child);
    assert(c !== null);
    for (let kg = 0.05; kg <= c.maxKgPerWeek + 1e-9; kg += 0.05) {
      assertEquals(
        paceSaturation(dir, child, Math.round(kg * 100) / 100),
        null,
        `mineur ${dir} à ${kg}`,
      );
    }
  }
});

Deno.test("③ pas de corps, pas de phrase — et jamais sur un cran nul", () => {
  // On ne décrit pas l'assiette de quelqu'un qu'on ne sait pas estimer.
  assertEquals(paceSaturation("up", adult({ weightKg: null }), 1.0), null);
  assertEquals(paceSaturation("up", adult({ heightCm: null }), 1.0), null);
  assertEquals(paceSaturation("up", adult(), 0), null);
  assertEquals(paceSaturation("up", adult(), -1), null);
  assertEquals(paceSaturation("up", adult(), Number.NaN), null);
});

Deno.test("③ la phrase de saturation existe dans les DEUX langues, et ne cite aucun kcal", () => {
  for (const token of PACE_SATURATIONS) {
    const label = PACE_SATURATION_LABELS[token];
    assert(label, `${token} n'a pas de phrase`);
    for (const lang of ["en", "fr"] as const) {
      const text = label[lang];
      assert(text.trim().length > 0, `${token}.${lang} est vide`);
      // ⛔ CLAUSE C5. Le point de saturation est une grandeur d'énergie par
      // bouche; la nommer ici la ferait sortir à côté d'un curseur que le compte
      // maître règle pour QUELQU'UN D'AUTRE, sans avoir traversé la moindre
      // porte. La phrase parle de l'assiette, pas d'un nombre.
      const lowered = text.toLowerCase();
      for (const forbidden of ["kcal", "calorie", "calories"]) {
        assert(
          !lowered.includes(forbidden),
          `${token}.${lang} cite « ${forbidden} »: ${text}`,
        );
      }
      assert(
        !/\d/.test(text),
        `${token}.${lang} porte un chiffre, alors que le seuil dépend du corps: ${text}`,
      );
    }
    assert(label.en !== label.fr, `${token} n'est pas traduit`);
  }
  // ⚠️ DEUX VOCABULAIRES SÉPARÉS, et c'est la décision: les deux phrases sont
  // vraies EN MÊME TEMPS au-delà de 0,5 kg/semaine sur un grand corps. Fondre
  // ce jeton dans `PACE_WARNINGS` ferait rendre un seul des deux par
  // `paceWarning`, et ce serait celui qui parle du corps qu'on perdrait.
  for (const token of PACE_SATURATIONS) {
    assert(
      !(PACE_WARNINGS as readonly string[]).includes(token),
      `${token} ne doit pas être un avertissement de rythme`,
    );
  }
  // Et le cas qui le PROUVE: un grand corps à 0,7 kg/semaine reçoit les deux.
  const big = adult({ weightKg: 90, heightCm: 185, gender: "male", ageYears: 40 });
  assertEquals(paceWarning("up", 0.7), "surplus_becomes_fat");
  assertEquals(paceSaturation("up", big, 0.7), "plate_stops_changing");
});

Deno.test("un corps sans poids n'a PAS de plafond de secours", () => {
  // Un maximum deviné promettrait une date d'arrivée calculée sur quelqu'un qui
  // n'existe pas.
  assertEquals(paceCeilingFor("down", adult({ weightKg: null })), null);
  assertEquals(paceCeilingFor("down", adult({ heightCm: null })), null);
});

// ---------------------------------------------------------------------------
// LE MINEUR — ce qui protège APRÈS le renversement du 2026-08-18
// ---------------------------------------------------------------------------

Deno.test("⚠️ un mineur est borné sur SON besoin, pas sur le plafond de l'adulte", () => {
  // LA MOITIÉ QUI PROTÈGE. Le 2026-08-18 a ouvert les trois objectifs à un
  // mineur; ce qui remplace le refus est ici. Un enfant et un adulte du MÊME
  // poids ne reçoivent pas le même cran, parce que l'enfant est borné à 10 % de
  // son besoin estimé par Schofield — c'est-à-dire sur son ÂGE.
  const child = paceCeilingFor("down", minor({ weightKg: 40, ageYears: 12 }));
  const grown = paceCeilingFor(
    "down",
    adult({ weightKg: 40, ageYears: 24, heightCm: 150 }),
  );
  assert(child !== null && grown !== null);
  assert(
    child.maxKgPerWeek < grown.maxKgPerWeek,
    `enfant ${child.maxKgPerWeek} devrait être sous adulte ${grown.maxKgPerWeek}`,
  );
  assertEquals(child.bound, "energy_floor");
});

Deno.test("⚠️ ce qui borne un mineur est CALCULÉ SUR SON ÂGE", () => {
  // « Le plancher d'énergie et le plafond du slider restent armés pour un
  // mineur, et CALCULÉS SUR SON ÂGE. » La contre-épreuve porte sur le NOMBRE
  // dont le plafond est une fraction: à poids égal, un enfant de 8 ans et un
  // adolescent de 16 ans tombent dans deux bandes Schofield différentes et
  // n'ont pas le même besoin estimé.
  const eight = estimatedChildMaintenanceKcal({
    weightKg: 45,
    ageYears: 8,
    gender: "male",
    activityLevel: null,
  });
  const sixteen = estimatedChildMaintenanceKcal({
    weightKg: 45,
    ageYears: 16,
    gender: "male",
    activityLevel: null,
  });
  assert(eight !== null && sixteen !== null);
  assert(eight !== sixteen, "le besoin d'un mineur doit dépendre de son âge");

  // ⚠️ ET LE CRAN AFFICHÉ, LUI, PEUT NE PAS BOUGER — C'EST MESURÉ, PAS SUBI.
  // Le pas du slider est 0,05 kg/semaine, soit environ 55 kcal/jour; l'écart
  // entre ces deux besoins vaut 10 % de 116 kcal, donc il disparaît dans un
  // cran. Le dire ici évite qu'un lecteur croie la borne indépendante de
  // l'âge: elle en dépend, c'est l'AFFICHAGE qui est plus grossier que
  // l'écart. Un pas plus fin le rendrait visible — et rendrait aussi le
  // curseur inatteignable au doigt.
  const cEight = paceCeilingFor("down", minor({ weightKg: 45, ageYears: 8 }));
  const cSixteen = paceCeilingFor("down", minor({ weightKg: 45, ageYears: 16 }));
  assert(cEight !== null && cSixteen !== null);
  assertEquals(cEight.bound, "energy_floor");
  assertEquals(cSixteen.bound, "energy_floor");
});

Deno.test("⚠️ l'écart d'un mineur reste une FRACTION de son besoin", () => {
  // La contre-épreuve chiffrée de « ouvrir l'objectif sans ouvrir le régime ».
  const b = body({ weightKg: 45, ageYears: 14, gender: "male", heightCm: 160 });
  const need = estimatedChildMaintenanceKcal({
    weightKg: b.weightKg,
    ageYears: b.ageYears,
    gender: b.gender,
    activityLevel: b.activityLevel,
  });
  assert(need !== null);
  const c = paceCeilingFor("down", { body: b, isMinor: true });
  assert(c !== null);
  assert(
    c.dailyDeltaKcal <= Math.round(need * MINOR_MAX_DAILY_DELTA_FRACTION),
    `${c.dailyDeltaKcal} kcal/j dépasse ${MINOR_MAX_DAILY_DELTA_FRACTION * 100} % de ${need}`,
  );
});

// ---------------------------------------------------------------------------
// LE POIDS VISÉ — un refus NOMMÉ, jamais un bouton mort
// ---------------------------------------------------------------------------

Deno.test("chaque refus a son cas, et l'acceptation aussi", () => {
  const s = adult({ weightKg: 70, heightCm: 170, gender: "female" });
  // ⚠️ LE CAS QUI PASSE D'ABORD: une garde sans cas passant bloque tout et
  // ressemble à une garde qui marche.
  assertEquals(targetWeightRefusal("down", 70, 64, s), null);
  assertEquals(targetWeightRefusal("up", 70, 76, s), null);

  assertEquals(targetWeightRefusal("down", 70, 12, s), "implausible");
  assertEquals(targetWeightRefusal("down", 70, 900, s), "implausible");
  assertEquals(targetWeightRefusal("down", 70, 75, s), "wrong_direction");
  assertEquals(targetWeightRefusal("up", 70, 65, s), "wrong_direction");
  assertEquals(targetWeightRefusal("down", 70, 70, s), "wrong_direction");
});

Deno.test("`below_energy_floor` est un BACKSTOP, et il a un cas qui l'atteint", () => {
  // ⚠️ IL EST RARE, ET LE DIRE VAUT MIEUX QUE DE FABRIQUER UN CAS. Sur la
  // plupart des corps, `implausible` (sous 25 kg) attrape d'abord ce qu'il
  // faudrait attraper. Ce refus-ci mord quand la personne est PETITE: une
  // cible où simplement maintenir demanderait moins que le plancher n'est pas
  // une cible, c'est une contrainte qu'on ne saurait pas tenir une fois
  // arrivé.
  const petite: PaceSubject = {
    body: body({ heightCm: 150, weightKg: 45, gender: "female", ageYears: 50 }),
    isMinor: false,
  };
  assertEquals(targetWeightRefusal("down", 45, 26, petite), "below_energy_floor");
  // Et il ne mord PAS deux kilos plus haut: la garde discrimine, elle ne
  // refuse pas tout.
  assertEquals(targetWeightRefusal("down", 45, 30, petite), null);
});

Deno.test("le plancher se mesure AU POIDS VISÉ, pas au poids actuel", () => {
  // C'est le corps d'arrivée qui devra vivre avec. Mesurer au poids de départ
  // laisserait passer toute cible, puisque le départ est par définition
  // au-dessus.
  const s: PaceSubject = {
    body: body({ heightCm: 150, weightKg: 70, gender: "female", ageYears: 50 }),
    isMinor: false,
  };
  assertEquals(targetWeightRefusal("down", 70, 40, s), null);
  // Le poids de DÉPART est confortablement au-dessus du plancher; c'est le
  // corps d'arrivée qui ne l'est pas. Mesurer au départ laisserait passer
  // toute cible, puisque le départ est par définition au-dessus.
  assertEquals(targetWeightRefusal("down", 70, 26, s), "below_energy_floor");
});

Deno.test("⚠️ un MINEUR ne se voit pas opposer le plancher d'un adulte", () => {
  // 1 200 kcal opposés à un enfant de 25 kg refuseraient une cible parfaitement
  // ordinaire. Sa protection est le plafond de rythme, calculé sur son âge.
  const child = minor({ weightKg: 40, ageYears: 11, heightCm: 145 });
  assertEquals(targetWeightRefusal("down", 40, 37, child), null);
  // Et les deux autres refus mordent quand même sur lui.
  assertEquals(targetWeightRefusal("down", 40, 10, child), "implausible");
  assertEquals(targetWeightRefusal("down", 40, 42, child), "wrong_direction");
});

// ---------------------------------------------------------------------------
// LA DATE D'ARRIVÉE
// ---------------------------------------------------------------------------

Deno.test("la date d'arrivée s'arrondit VERS LE HAUT", () => {
  // Annoncée trop tôt, elle est une déception programmée; trop tard, une bonne
  // surprise. La direction de l'erreur est choisie.
  assertEquals(weeksToTarget(80, 74, 0.5), 12);
  assertEquals(weeksToTarget(80, 74.2, 0.5), 12);
  assertEquals(weeksToTarget(60, 65, 0.25), 20);
});

Deno.test("un rythme nul ou une cible atteinte ne fabriquent PAS de date", () => {
  // « Tu y es dans 0 semaine » et « ce rythme ne mène nulle part » ne se disent
  // pas de la même façon, et diviser par zéro produirait l'infini.
  assertEquals(weeksToTarget(80, 74, 0), null);
  assertEquals(weeksToTarget(80, 74, -1), null);
  assertEquals(weeksToTarget(80, 80, 0.5), null);
});

// ---------------------------------------------------------------------------
// L'INVARIANT QUI JUSTIFIE D'AVOIR MIS A1 DANS LE SLIDER
// ---------------------------------------------------------------------------

Deno.test("le cran maximal est EXÉCUTABLE: il ne promet jamais plus que A1", () => {
  // Un slider qui monterait au-dessus du plafond de déficit ferait une promesse
  // que l'enveloppe refuserait de tenir, et la date calculée dessus serait
  // fausse dès le premier jour.
  for (let w = 40; w <= 200; w += 10) {
    const c = paceCeilingFor("down", adult({ weightKg: w, heightCm: 180, gender: "male" }));
    if (c === null) continue;
    assert(
      c.dailyDeltaKcal <= 500,
      `${w} kg promet ${c.dailyDeltaKcal} kcal/j, au-dessus du plafond A1`,
    );
  }
});

Deno.test("l'écart rendu correspond AU CRAN rendu, pas à celui d'avant l'arrondi", () => {
  // Sinon le nombre que L8 traduira en grammages ne serait pas celui que la
  // personne a réglé au doigt.
  const c = paceCeilingFor("down", adult({ weightKg: 82, heightCm: 178, gender: "male" }));
  assert(c !== null);
  assertEquals(
    c.dailyDeltaKcal,
    Math.round((c.maxKgPerWeek * KCAL_PER_KG_BODY_MASS) / 7),
  );
});

Deno.test("⚠️ le plancher ADULTE est INATTEIGNABLE pour un mineur — deux ceintures", () => {
  // ── CE TEST EXISTE PARCE QU'UNE MUTATION N'A PAS MORDU ──────────────────
  // Retirer `if (subject.isMinor) return null;` de `targetWeightRefusal` ne
  // fait rougir AUCUN test, et il fallait comprendre pourquoi avant de
  // conclure à une garde inutile: `ageBandOf` rend `null` sous dix-huit ans,
  // donc `estimatedMaintenanceKcal` rend `null` pour tout mineur, donc la
  // comparaison au plancher adulte n'est jamais atteinte.
  //
  // La ceinture est donc DOUBLE, et les deux moitiés sont voulues:
  //   · la sortie explicite dit l'INTENTION — un mineur n'a pas de plancher
  //     fixe à franchir — et elle survivrait à un `ageBandOf` élargi (l'idée
  //     d'étendre `AgeBand` aux tranches pédiatriques a déjà été envisagée et
  //     écartée, mais elle revient);
  //   · `ageBandOf` la rend redondante AUJOURD'HUI, et c'est ce test qui le
  //     dit, pour qu'on ne « nettoie » pas la première en croyant retirer du
  //     code mort.
  for (const age of [2, 8, 12, 17]) {
    assertEquals(
      ageBandOf(age),
      null,
      `ageBandOf(${age}) doit rendre null — c'est la seconde ceinture`,
    );
  }
  assertEquals(ageBandOf(18), "18_29");
});
