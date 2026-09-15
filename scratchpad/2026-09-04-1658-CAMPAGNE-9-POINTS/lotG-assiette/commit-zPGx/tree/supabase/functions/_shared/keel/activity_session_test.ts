// LE LOG DE SÉANCE — activity_session.ts.
//
// Les quatre tests qui portent la décision produit, et qu'il faut relire avant
// de toucher au module:
//   * "aucune énergie ne sort de ce module"
//     -- décision du 2026-08-18, chiffrée: déficit visé 400-500 kcal/j, erreur
//        d'une dépense déclarée ±30-50 %. La soustraire AUGMENTE l'incertitude.
//   * "zéro séance ne s'imprime jamais"
//     -- un décompte à zéro se lit comme un échec, et le dépôt a déjà payé
//        cette phrase exacte sur « 0 des 5 jours que j'ai vus ».
//   * "`null` n'est pas zéro"
//     -- une lecture en panne ne doit pas geler « aucune séance ».
//   * "le vocabulaire est celui d'ACTIVITY_EMPHASES"
//     -- une quatrième liste d'activité dans ce dépôt serait la faute.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ACTIVITY_INTENSITIES,
  ACTIVITY_SESSION_KINDS,
  ACTIVITY_SESSION_MAX_MINUTES,
  ACTIVITY_SESSION_SOURCES,
  type ActivitySessionInput,
  parseActivityIntensity,
  parseActivitySessionKind,
  parseWeekActivity,
  renderWeekActivityFact,
  summarizeWeekActivity,
} from "./activity_session.ts";

const WEEK = [
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
  "2026-08-15",
  "2026-08-16",
] as const;

function session(
  localDate: string,
  over: Partial<ActivitySessionInput> = {},
): ActivitySessionInput {
  return {
    localDate,
    kind: "cardio",
    durationMin: 30,
    intensity: "moderate",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// LE VOCABULAIRE
// ---------------------------------------------------------------------------

Deno.test("le vocabulaire des séances est celui d'ACTIVITY_EMPHASES, pas un quatrième", () => {
  // La liste EXACTE d'`activity_stance.ts#ACTIVITY_EMPHASES`, recopiée ici
  // parce que ce fichier-là n'est pas dans HEAD au moment du lot (voir la
  // condition de retrait dans l'en-tête du module). Si l'un des deux bouge, ce
  // test tombe — c'est tout ce qu'on lui demande.
  assertEquals(
    [...ACTIVITY_SESSION_KINDS],
    ["daily_movement", "strength", "cardio", "recovery", "mobility"],
  );
  // Aucun `other`: la valeur vient d'un choix entre cinq tuiles, et un `other`
  // deviendrait la tuile la plus cliquée.
  assert(!(ACTIVITY_SESSION_KINDS as readonly string[]).includes("other"));
});

Deno.test("l'intensité est en crans, jamais un nombre", () => {
  assertEquals([...ACTIVITY_INTENSITIES], ["easy", "moderate", "hard"]);
  for (const numeric of ["7", "10", "3/10", 5]) {
    assertEquals(
      parseActivityIntensity(numeric),
      null,
      `un RPE chiffré (${numeric}) ne doit jamais devenir une intensité`,
    );
  }
});

Deno.test("les sources sont les jetons déjà portés par le dépôt", () => {
  assertEquals([...ACTIVITY_SESSION_SOURCES], ["app", "chat"]);
});

Deno.test("un jeton inconnu est écarté, il ne fait pas tomber le bilan", () => {
  assertEquals(parseActivitySessionKind("crossfit"), null);
  assertEquals(parseActivitySessionKind(null), null);
  assertEquals(parseActivitySessionKind("strength"), "strength");
});

// ---------------------------------------------------------------------------
// LE COMPTE
// ---------------------------------------------------------------------------

Deno.test("trois séances sur deux jours se comptent comme trois séances et deux jours", () => {
  const summary = summarizeWeekActivity(
    [session(WEEK[0]), session(WEEK[0]), session(WEEK[3])],
    WEEK,
  );
  assertEquals(summary.sessions, 3);
  assertEquals(summary.days, 2, "deux séances le même jour font UN jour");
});

Deno.test("une séance hors fenêtre ne compte pas", () => {
  const summary = summarizeWeekActivity(
    [session(WEEK[0]), session("2026-08-09"), session("")],
    WEEK,
  );
  assertEquals(summary.sessions, 1);
});

Deno.test("les minutes portent leur dénominateur, et une durée absente ne compte pas zéro", () => {
  const summary = summarizeWeekActivity(
    [
      session(WEEK[0], { durationMin: 45 }),
      session(WEEK[1], { durationMin: null }),
      session(WEEK[2], { durationMin: 30 }),
    ],
    WEEK,
  );
  assertEquals(summary.minutes, 75);
  assertEquals(
    summary.minutesFrom,
    2,
    "la somme doit dire sur combien de séances elle a été faite",
  );
  assertEquals(summary.sessions, 3, "la séance sans durée reste une séance");
});

Deno.test("une durée impossible est écartée de la somme, pas ajoutée à zéro", () => {
  const summary = summarizeWeekActivity(
    [
      session(WEEK[0], { durationMin: ACTIVITY_SESSION_MAX_MINUTES + 1 }),
      session(WEEK[1], { durationMin: 0 }),
      session(WEEK[2], { durationMin: 60 }),
    ],
    WEEK,
  );
  assertEquals(summary.minutes, 60);
  assertEquals(summary.minutesFrom, 1);
  assertEquals(summary.sessions, 3);
});

Deno.test("l'intensité non déclarée est un compte, pas un trou", () => {
  const summary = summarizeWeekActivity(
    [
      session(WEEK[0], { intensity: "hard" }),
      session(WEEK[1], { intensity: null }),
      session(WEEK[2], { intensity: "easy" }),
      session(WEEK[3], { intensity: "easy" }),
    ],
    WEEK,
  );
  assertEquals(summary.byIntensity, {
    easy: 2,
    moderate: 0,
    hard: 1,
    undeclared: 1,
  });
});

Deno.test("aucun champ d'énergie ne sort de ce module", () => {
  const summary = summarizeWeekActivity([session(WEEK[0])], WEEK);
  const keys = JSON.stringify(summary).toLowerCase();
  for (const forbidden of ["kcal", "calorie", "energy", "burn", "kilojoule", "met"]) {
    assert(
      !keys.includes(forbidden),
      `le résumé porte « ${forbidden} » — la décision du 2026-08-18 est « le fait, jamais le dérivé »`,
    );
  }
  assertEquals(Object.keys(summary).sort(), [
    "byIntensity",
    "days",
    "minutes",
    "minutesFrom",
    "sessions",
  ]);
});

// ---------------------------------------------------------------------------
// LA PHRASE
// ---------------------------------------------------------------------------

Deno.test("zéro séance ne s'imprime JAMAIS", () => {
  assertEquals(renderWeekActivityFact(summarizeWeekActivity([], WEEK)), null);
});

Deno.test("`null` (pas lu) ne s'imprime pas non plus, et n'est pas zéro", () => {
  assertEquals(renderWeekActivityFact(null), null);
});

Deno.test("une séance se dit au singulier, sans compte de jours", () => {
  const text = renderWeekActivityFact(
    summarizeWeekActivity([session(WEEK[0])], WEEK),
  );
  assertEquals(text, "You also logged 1 training session.");
});

Deno.test("la phrase porte le compte et les jours, et aucun déictique temporel", () => {
  const text = renderWeekActivityFact(
    summarizeWeekActivity(
      [session(WEEK[0]), session(WEEK[0]), session(WEEK[4])],
      WEEK,
    ),
  ) as string;
  assert(text.includes("3 training sessions"), text);
  assert(text.includes("2 days"), text);
  // « cette semaine » serait faux dès que le formulaire revient le mardi.
  assert(!/\bthis week\b/i.test(text), text);
  // Et surtout: aucune énergie.
  assert(!/\b(kcal|calorie|burn)/i.test(text), text);
});

Deno.test("trois séances sur un seul jour ne disent pas « 1 days »", () => {
  const text = renderWeekActivityFact(
    summarizeWeekActivity(
      [session(WEEK[0]), session(WEEK[0]), session(WEEK[0])],
      WEEK,
    ),
  ) as string;
  assert(text.includes("across 1 day."), text);
});

// ---------------------------------------------------------------------------
// L'ALLER-RETOUR JSONB
// ---------------------------------------------------------------------------

Deno.test("le résumé relu est le résumé calculé", () => {
  const summary = summarizeWeekActivity(
    [
      session(WEEK[0], { durationMin: 45, intensity: "hard" }),
      session(WEEK[2], { durationMin: null, intensity: null }),
    ],
    WEEK,
  );
  assertEquals(parseWeekActivity(JSON.parse(JSON.stringify(summary))), summary);
});

Deno.test("un résumé absent rend null — jamais un objet à zéro", () => {
  assertEquals(parseWeekActivity(null), null);
  assertEquals(parseWeekActivity(undefined), null);
  assertEquals(parseWeekActivity("3"), null);
  assertEquals(parseWeekActivity([]), null);
});

// ---------------------------------------------------------------------------
// LA BORNE NE SE TESTE PAS CONTRE ELLE-MÊME
// ---------------------------------------------------------------------------
//
// Le test « une durée impossible est écartée » ci-dessus est écrit avec
// `ACTIVITY_SESSION_MAX_MINUTES + 1`. Il reste donc VERT quel que soit le
// nombre — mesuré le 2026-08-18: passer la constante de 600 à 6000 laissait
// les 3322 tests verts. Un test paramétré par sa propre constante ne teste que
// l'arithmétique de l'addition.
//
// Or la valeur est écrite DEUX FOIS: ici, et en dur dans la CHECK de
// `20260818180000`. La migration se donne elle-même l'invariant — « un écran
// qui accepterait ce que la base refuse ferait saisir dans le vide » — et rien
// ne le tenait. Ce test lit donc la MIGRATION SUR LE DISQUE, comme la ceinture
// des motifs de décoche: c'est la seule forme qui rougit quand une seule des
// deux copies bouge.
Deno.test("la borne de durée du module est celle de la CHECK en base", async () => {
  const sql = await Deno.readTextFile(
    new URL(
      "../../../migrations/20260818180000_a_session_is_a_fact_not_an_energy.sql",
      import.meta.url,
    ),
  );
  const check = sql.match(
    /duration_min\s+integer\s+check\s*\(\s*duration_min\s*>=\s*(\d+)\s+and\s+duration_min\s*<=\s*(\d+)\s*\)/,
  );
  assert(
    check,
    "la CHECK de duration_min a changé de forme: relire la migration avant de relâcher ce test",
  );
  assertEquals(
    Number(check![2]),
    ACTIVITY_SESSION_MAX_MINUTES,
    "le plafond du module et celui de la base ont divergé",
  );
  assertEquals(Number(check![1]), 1, "le plancher de la base a bougé");
});
