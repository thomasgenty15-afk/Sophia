// FF-059 — LA CHAÎNE DE GARDES. Ce que ces tests protègent, dans l'ordre de ce
// que ça coûte quand ça casse:
//
//   * LA PORTE ① NON CONTOURNABLE — un chiffre chez un élève sous plancher TCA
//     est le seul défaut de ce chantier qui blesse quelqu'un. Il se prouve par
//     l'ABSENCE DE CHEMIN, pas par l'absence d'intention: la table de vérité
//     ci-dessous est EXHAUSTIVE (2 × 6 × 2 × 2 = 48 lignes), et chaque ligne où
//     le plancher est levé exige `restriction_floor`;
//   * L'ORDRE DES PORTES — il est le contrat. Deux portes fermées ensemble
//     nomment la PREMIÈRE, sinon l'écran dit « ton coach ne compte pas » à
//     quelqu'un que le plancher protège;
//   * LE PARAMÈTRE OPTIONNEL — « un paramètre de garde optionnel est une garde
//     désarmée ». Un test lit la SOURCE et refuse un `?` dans l'entrée;
//   * LE JETON PARTAGÉ — la porte ③ cherche `count_calories`. Si
//     `doctrine_starter.ts` renomme sa position, la porte cesse de mordre sans
//     qu'une seule assertion ne bouge. On lie les deux ici.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

import {
  canShowEnergy,
  COUNTING_STANCES,
  type CountingStance,
  ENERGY_GATE_INPUT_KEYS,
  ENERGY_GATE_REASONS,
  ENERGY_SWITCH_INPUT_KEYS,
  ENERGY_SWITCH_SOURCES,
  type EnergyGateInput,
  type EnergyGateReason,
  energySwitchFrom,
  countingStanceFrom,
  NO_COUNTING_TOKEN,
} from "./energy_gate.ts";
import { assessBirthDate, type BirthDateVerdict } from "./student_age.ts";
import { STARTER_FORKS } from "./doctrine_starter.ts";

const TODAY = "2026-08-12";

/**
 * LES SIX VERDICTS D'ÂGE, tels que `assessBirthDate` sait les produire.
 *
 * Construits par la vraie fonction plutôt qu'écrits à la main: un littéral
 * `{ status: "minor" }` resterait vert le jour où le verdict gagne un champ que
 * la garde lit.
 */
const AGE_VERDICTS: ReadonlyArray<{ label: string; verdict: BirthDateVerdict }> = [
  { label: "adult", verdict: assessBirthDate("1990-01-01", TODAY) },
  { label: "minor", verdict: assessBirthDate("2015-01-01", TODAY) },
  { label: "absent", verdict: assessBirthDate(null, TODAY) },
  { label: "unreadable", verdict: assessBirthDate("hier", TODAY) },
  { label: "future", verdict: assessBirthDate("2030-01-01", TODAY) },
  { label: "implausible", verdict: assessBirthDate("1800-01-01", TODAY) },
];

Deno.test("FF-059 — les six verdicts d'âge du banc sont bien les six statuts", () => {
  assertEquals(
    AGE_VERDICTS.map((a) => a.verdict.status).sort(),
    ["absent", "adult", "future", "implausible", "minor", "unreadable"],
  );
});

// ---------------------------------------------------------------------------
// LA TABLE DE VÉRITÉ — exhaustive, et c'est le test qui fait le lot
// ---------------------------------------------------------------------------

/**
 * LE MOTIF ATTENDU, RÉÉCRIT EN TOUTES LETTRES.
 *
 * ⚠️ Cette fonction ne doit surtout PAS appeler `canShowEnergy`, ni partager
 * une ligne avec elle: un test paramétré par le code qu'il teste reste vert
 * quand ce code change (cicatrice `test-parameterized-by-its-own-constant`).
 * C'est une seconde écriture de la règle, en cascade explicite, et l'accord des
 * deux est ce qui prouve quelque chose.
 */
function expectedReason(
  restrictionFlag: boolean,
  ageLabel: string,
  coachCounting: CountingStance,
  studentSwitch: boolean,
): EnergyGateReason {
  if (restrictionFlag) return "restriction_floor";
  if (ageLabel === "minor") return "minor";
  // ⟳ S3 — LA PORTE ②bis, RÉÉCRITE ICI EN TOUTES LETTRES. Seul un ADULTE
  // AVÉRÉ passe l'âge. Les quatre autres statuts (absente, illisible, future,
  // aberrante) sont quatre façons de ne pas savoir, et « on ne sait pas »
  // n'ouvre pas un déficit sur un corps peut-être en croissance.
  if (ageLabel !== "adult") return "age_unknown";
  if (coachCounting === "no_counting") return "doctrine_no_counting";
  if (!studentSwitch) return "student_off";
  return "open";
}

Deno.test("FF-059 — table de vérité EXHAUSTIVE des quatre portes", () => {
  let rows = 0;
  let opened = 0;
  const seen = new Set<EnergyGateReason>();

  for (const restrictionFlag of [true, false]) {
    for (const age of AGE_VERDICTS) {
      for (const coachCounting of COUNTING_STANCES) {
        for (const studentSwitch of [true, false]) {
          rows++;
          const result = canShowEnergy({
            restrictionFlag,
            ageVerdict: age.verdict,
            coachCounting,
            studentSwitch,
          });
          const want = expectedReason(
            restrictionFlag,
            age.label,
            coachCounting,
            studentSwitch,
          );
          const where =
            `restriction=${restrictionFlag} age=${age.label} coach=${coachCounting} switch=${studentSwitch}`;
          assertEquals(result.reason, want, where);
          assertEquals(result.show, want === "open", where);
          seen.add(result.reason);
          if (result.show) opened++;
        }
      }
    }
  }

  assertEquals(rows, 2 * 6 * 2 * 2);
  // Les SIX motifs sont atteignables. Un motif jamais produit est une branche
  // morte, et une branche morte dans une garde est une garde qu'on croit avoir.
  assertEquals([...seen].sort(), [...ENERGY_GATE_REASONS].sort());
  // ⟳ S3 — ~~Cinq verdicts d'âge non-mineurs~~ **UN SEUL**: l'adulte avéré ×
  // un coach sans position × interrupteur allumé × plancher baissé. Le chemin
  // n'est plus étroit, il est unique. ⚠️ CE NOMBRE EST LA MESURE DU LOT: il est
  // passé de 5 à 1 parce que quatre statuts d'âge ont cessé de produire un
  // chiffre — et c'est 1 193 profils sur 1 313 qui vivent dans ces quatre-là.
  assertEquals(opened, 1);
});

Deno.test("FF-059 — porte ① : le plancher gagne contre les TROIS autres", () => {
  // Le scénario nommé §7 de la fiche: plancher levé, coach qui compte, élève
  // majeur, interrupteur allumé. Tout est vert sauf le plancher.
  for (const age of AGE_VERDICTS) {
    for (const coachCounting of COUNTING_STANCES) {
      for (const studentSwitch of [true, false]) {
        const result = canShowEnergy({
          restrictionFlag: true,
          ageVerdict: age.verdict,
          coachCounting,
          studentSwitch,
        });
        assertEquals(result.show, false);
        // Et il se NOMME. Un refus attribué au coach sur un élève sous plancher
        // ferait chercher la réparation du mauvais côté.
        assertEquals(result.reason, "restriction_floor");
      }
    }
  }
});

Deno.test("FF-059 — porte ② : un mineur ne voit rien, même tout ouvert par ailleurs", () => {
  const minor = assessBirthDate("2015-01-01", TODAY);
  assertEquals(
    canShowEnergy({
      restrictionFlag: false,
      ageVerdict: minor,
      coachCounting: "no_position",
      studentSwitch: true,
    }),
    { show: false, reason: "minor" },
  );
});

Deno.test("FF-059 ⟳ S3 — un âge INCONNU ferme le chiffre, et ne s'appelle PAS `minor`", () => {
  // ⟳ ── L'HYPOTHÈSE D'ORIGINE, GARDÉE PARCE QU'ELLE A ÉTÉ RÉFUTÉE ─────────
  // ~~« la porte ② reprend `weekPlanAgeGate`, dont la seule condition de
  // morsure est `status === "minor"`. Une date absente laisse donc passer.
  // C'est un arbitrage, pas un oubli: le durcir éteindrait le chiffre pour la
  // quasi-totalité de la base, ce qui serait indiscernable d'une panne. »~~
  //
  // ⛔ **RÉFUTÉE le 2026-08-22 par le lot `S3`, et la moitié fausse est la
  // conclusion, pas la prémisse.** Le raisonnement confondait deux choses que
  // ce module sépare exprès (voir sa coupure ①②③ / ④): éteindre le CHIFFRE
  // n'est pas éteindre le SERVICE. `weekPlanAgeGate().allowed` reste `true` sur
  // une date absente — le plan sort, le repas sort, la conversation continue —
  // et seul `numberAllowed` se ferme. Rien ici n'est « indiscernable d'une
  // panne »: c'est le comportement que la lane FOYER a depuis toujours
  // (`noSizing("age_unknown")`), et la lane solo en était la seule exception.
  //
  // CE QUE ÇA COÛTAIT, MESURÉ LE 2026-08-22: `{open:true, reason:"open"}` sur
  // **1 193 profils de 1 313** (90,9 %), dont **17 mineurs avérés** — et tous
  // ceux que l'absence de date cache.
  //
  // ⚠️ LE MOTIF EST LA MOITIÉ DU TEST. Rendre `minor` ici dirait à 91 % de la
  // base qu'on les a pris pour des enfants, et enverrait chercher la
  // réparation du côté du coach au lieu du côté de la date manquante.
  for (const label of ["absent", "unreadable", "future", "implausible"]) {
    const age = AGE_VERDICTS.find((a) => a.label === label)!;
    assertEquals(
      canShowEnergy({
        restrictionFlag: false,
        ageVerdict: age.verdict,
        coachCounting: "no_position",
        studentSwitch: true,
      }),
      { show: false, reason: "age_unknown" },
      label,
    );
  }
});

Deno.test("FF-059 ⟳ S3 — LE CAS QUI PASSE: l'adulte avéré reçoit son chiffre", () => {
  // ⛔ SANS CE CAS, LE LOT SERAIT UNE GARDE QUI BLOQUE TOUT ET QUI RESSEMBLE À
  // UNE GARDE QUI MARCHE. `S3` ferme quatre statuts d'âge sur six; la preuve
  // qu'il n'a pas fermé les six est ici, et elle est le seul chemin ouvert de
  // la table de vérité (`opened === 1`).
  assertEquals(
    canShowEnergy({
      restrictionFlag: false,
      ageVerdict: assessBirthDate("1990-01-01", TODAY),
      coachCounting: "no_position",
      studentSwitch: true,
    }),
    { show: true, reason: "open" },
  );
});

// ---------------------------------------------------------------------------
// LA PORTE ③ — la position du coach
// ---------------------------------------------------------------------------

Deno.test("FF-059 — porte ③ : le jeton d'interdit ferme, son absence ouvre", () => {
  assertEquals(
    countingStanceFrom({
      hasCoach: true,
      doctrineReadable: true,
      forbiddenTokens: ["cheat_meal", NO_COUNTING_TOKEN],
    }),
    "no_counting",
  );
  assertEquals(
    countingStanceFrom({
      hasCoach: true,
      doctrineReadable: true,
      forbiddenTokens: ["cheat_meal"],
    }),
    "no_position",
  );
});

Deno.test("FF-059 — pas de coach (méthode maison) : le chiffre s'affiche", () => {
  const stance = countingStanceFrom({
    hasCoach: false,
    doctrineReadable: false,
    forbiddenTokens: [],
  });
  assertEquals(stance, "no_position");
  assertEquals(
    canShowEnergy({
      restrictionFlag: false,
      ageVerdict: assessBirthDate("1990-01-01", TODAY),
      coachCounting: stance,
      studentSwitch: true,
    }),
    { show: true, reason: "open" },
  );
});

Deno.test("FF-059 — coach dont la doctrine est ILLISIBLE : fail-closed", () => {
  // Une panne de lecture ne doit pas contredire la méthode d'un coach devant
  // son élève. Se taire coûte un chiffre; parler coûte la promesse vendue.
  assertEquals(
    countingStanceFrom({
      hasCoach: true,
      doctrineReadable: false,
      forbiddenTokens: [],
    }),
    "no_counting",
  );
});

Deno.test("FF-059 — le jeton de la porte ③ EST celui de doctrine_starter", () => {
  // Sans ce test, renommer la position dans `doctrine_starter.ts` désarmerait
  // la porte ③ en silence: aucune assertion de ce fichier ne bougerait, et un
  // coach « on ne compte pas » verrait des calories chez ses élèves.
  const counting = STARTER_FORKS.find((f) => f.key === "counting");
  assert(counting, "l'axe `counting` a disparu de doctrine_starter.ts");
  const noCounting = counting.positions.find((p) => p.key === "no_counting");
  assert(noCounting, "la position `no_counting` a disparu");
  assertEquals(noCounting.forbidden?.token, NO_COUNTING_TOKEN);
});

// ---------------------------------------------------------------------------
// L'ENTRÉE INCOMPLÈTE LÈVE — jamais `show: true`
// ---------------------------------------------------------------------------

const FULL: EnergyGateInput = {
  restrictionFlag: false,
  ageVerdict: assessBirthDate("1990-01-01", TODAY),
  coachCounting: "no_position",
  studentSwitch: true,
};

Deno.test("FF-059 — chaque clé manquante LÈVE (aucune ne vaut « pas de garde »)", () => {
  // Prémisse fausse d'abord: l'entrée complète passe. Une garde qui refuse tout
  // ressemble à une garde qui marche (`guards-need-a-passing-case`).
  assertEquals(canShowEnergy({ ...FULL }).show, true);

  for (const key of ENERGY_GATE_INPUT_KEYS) {
    const partial = { ...FULL } as Record<string, unknown>;
    delete partial[key];
    assertThrows(
      () => canShowEnergy(partial as unknown as EnergyGateInput),
      Error,
      key,
    );
    // `undefined` explicite est le cas le plus courant en pratique (un champ
    // lu d'une ligne absente), et il ne doit pas passer par la porte de service
    // d'un `Object.hasOwn` satisfait.
    assertThrows(
      () => canShowEnergy({ ...FULL, [key]: undefined } as EnergyGateInput),
      Error,
      key,
    );
  }
});

Deno.test("FF-059 — une entrée mal typée LÈVE plutôt que de se lire « faux »", () => {
  const bad: Array<[string, unknown]> = [
    ["restrictionFlag", "false"],
    ["restrictionFlag", 0],
    ["restrictionFlag", null],
    ["studentSwitch", 1],
    ["ageVerdict", "adult"],
    ["ageVerdict", null],
    ["coachCounting", "counts"],
    ["coachCounting", ""],
  ];
  for (const [key, value] of bad) {
    assertThrows(
      () => canShowEnergy({ ...FULL, [key]: value } as unknown as EnergyGateInput),
      Error,
      undefined,
      `${key}=${JSON.stringify(value)} aurait dû lever`,
    );
  }
  assertThrows(() => canShowEnergy(null as unknown as EnergyGateInput), Error);
  assertThrows(
    () => canShowEnergy("open" as unknown as EnergyGateInput),
    Error,
  );
});

// ---------------------------------------------------------------------------
// LA GARDE CONTRE LE PARAMÈTRE OPTIONNEL — elle lit la source
// ---------------------------------------------------------------------------

const GATE_SOURCE = Deno.readTextFileSync(
  fromFileUrl(new URL("./energy_gate.ts", import.meta.url)),
);

Deno.test("FF-059 — `EnergyGateInput` ne porte AUCUN champ optionnel", () => {
  // Le typecheck ne peut pas exprimer « cette interface n'a pas de `?` ». On lit
  // donc le fichier. C'est grossier et c'est le seul mécanisme qui morde: un
  // `restrictionFlag?: boolean` compilerait, tous les appelants existants
  // continueraient de passer, et le premier appelant futur qui l'oublie
  // ouvrirait la porte ① sans qu'un test rougisse.
  const start = GATE_SOURCE.indexOf("export interface EnergyGateInput {");
  assert(start > 0, "l'interface EnergyGateInput a été renommée");
  const end = GATE_SOURCE.indexOf("\n}", start);
  assert(end > start);
  const body = GATE_SOURCE.slice(start, end);
  // On retire les commentaires avant de chercher: `grep` naïf = faux positifs
  // (cicatrice `caller-audit-must-strip-comments`). Ici c'est l'inverse — un
  // « ? » de prose ferait rougir un test correct.
  const code = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert(
    !/\w\s*\?\s*:/.test(code),
    `champ optionnel dans EnergyGateInput:\n${code}`,
  );
  assert(
    !/\bundefined\b/.test(code),
    `« undefined » admis dans EnergyGateInput:\n${code}`,
  );
});

Deno.test("FF-059 — `canShowEnergy` prend UN argument, sans défaut", () => {
  // `Function.length` ne compte ni les paramètres à valeur par défaut ni le
  // reste. Un second paramètre optionnel (`options: { skipFloor?: boolean }`)
  // laisserait donc cette longueur à 1 — d'où la lecture de source qui suit.
  assertEquals(canShowEnergy.length, 1);
  const sig = GATE_SOURCE.slice(
    GATE_SOURCE.indexOf("export function canShowEnergy("),
  ).slice(0, 200);
  assertEquals(
    sig.startsWith("export function canShowEnergy(input: EnergyGateInput): EnergyGateResult {"),
    true,
    `signature modifiée:\n${sig.split("\n")[0]}`,
  );
});

Deno.test("FF-059 — la porte ① n'est conjuguée à rien dans le code", () => {
  // L'angle adversarial prioritaire, testé sur la source: le `if` du plancher
  // ne doit contenir NI `&&` NI `||`. Une conjonction y serait, littéralement,
  // le paramètre qui rouvre la porte que personne ne peut rouvrir.
  const line = GATE_SOURCE.split("\n").find((l) =>
    l.includes("if (input.restrictionFlag)")
  );
  assert(line, "le `if` du plancher a changé de forme — relire cette garde");
  assert(!line.includes("&&") && !line.includes("||"), line);
});

// ===========================================================================
// ⟳ LOT 4 (2026-09-01) — LA DIRECTION OUVRE LA PORTE ④, ET RIEN D'AUTRE
//
// Ce que ces tests protègent, dans l'ordre de ce que ça coûte quand ça casse:
//
//   * L'EXTINCTION QUI TIENT — R7: « un chiffre qu'on ne peut pas faire taire
//     est un tracker ». Un `false` explicite doit gagner contre la direction
//     POUR TOUJOURS. Si cette ligne casse, changer d'objectif rallume les
//     calories chez quelqu'un qui les avait coupées, et il ne le saura qu'en
//     les revoyant;
//   * `null` N'EST PAS `false` — c'est tout le lot. Un `=== true` posé chez un
//     appelant referme le chiffre à tous ceux que leur objectif devait ouvrir,
//     en silence et sans qu'aucun type ne bronche;
//   * LA DÉRIVATION N'EST PAS UNE DÉROGATION — elle entre en QUATRIÈME
//     position. La table ci-dessous le prouve sur les trois portes d'avant.
// ===========================================================================

const SWITCH_STORED: ReadonlyArray<{ label: string; stored: boolean | null }> = [
  { label: "explicitement allumé", stored: true },
  { label: "explicitement éteint", stored: false },
  { label: "jamais choisi", stored: null },
];

const SWITCH_DIRECTIONS: ReadonlyArray<{ label: string; direction: "up" | "down" | null }> = [
  { label: "perte", direction: "down" },
  { label: "prise", direction: "up" },
  { label: "aucune", direction: null },
];

Deno.test("FF-059 lot 4 — table de vérité EXHAUSTIVE de l'interrupteur (3 × 3)", () => {
  const seen: string[] = [];
  for (const s of SWITCH_STORED) {
    for (const d of SWITCH_DIRECTIONS) {
      const got = energySwitchFrom({ stored: s.stored, direction: d.direction });
      const row = `${s.label} + ${d.label}`;
      seen.push(row);

      // ① LE CHOIX EXPLICITE GAGNE, DANS LES DEUX SENS ET CONTRE TOUT.
      if (s.stored === true) {
        assertEquals(got, { on: true, source: "explicit_on" }, row);
        continue;
      }
      if (s.stored === false) {
        // ⛔ LA LIGNE QUI COMPTE LE PLUS DE CE FICHIER. Une extinction que le
        // prochain changement d'objectif rallumerait ne serait pas une
        // extinction, et R7 tomberait sans qu'aucun écran ne le montre.
        assertEquals(got, { on: false, source: "explicit_off" }, row);
        continue;
      }
      // ② PERSONNE N'A CHOISI: la direction décide, et elle seule.
      assertEquals(
        got,
        d.direction === null
          ? { on: false, source: "no_direction" }
          : { on: true, source: "direction" },
        row,
      );
    }
  }
  assertEquals(seen.length, 9, "la table n'est plus exhaustive");
});

Deno.test("FF-059 lot 4 — `maintenance` n'ouvre RIEN, et c'est la décision", () => {
  // `scaleDirectionOf("maintenance")` rend `null`, et cette fonction traite
  // `null` comme « aucune direction ». Viser la stabilité n'est pas demander à
  // compter — la décision du 2026-09-01 parle de gagner ou de perdre du poids.
  assertEquals(
    energySwitchFrom({ stored: null, direction: null }),
    { on: false, source: "no_direction" },
  );
});

Deno.test("FF-059 lot 4 — la dérivation n'ouvre AUCUNE des trois portes d'avant", () => {
  // ⛔ L'ANGLE ADVERSARIAL DE CE LOT. Quelqu'un qui vise une perte de gras a
  // `studentSwitch: true` par dérivation. Les portes ①, ② et ③ doivent
  // continuer de le refuser, chacune avec SON motif — sinon un objectif
  // deviendrait une dérogation au plancher TCA.
  const derived = energySwitchFrom({ stored: null, direction: "down" });
  assertEquals(derived.on, true, "prérequis du test: la dérivation ouvre bien ④");

  const adult = assessBirthDate("1990-01-01", TODAY);
  const minor = assessBirthDate("2015-01-01", TODAY);
  const absent = assessBirthDate(null, TODAY);

  assertEquals(
    canShowEnergy({
      restrictionFlag: true,
      ageVerdict: adult,
      coachCounting: "no_position",
      studentSwitch: derived.on,
    }),
    { show: false, reason: "restriction_floor" },
  );
  assertEquals(
    canShowEnergy({
      restrictionFlag: false,
      ageVerdict: minor,
      coachCounting: "no_position",
      studentSwitch: derived.on,
    }),
    { show: false, reason: "minor" },
  );
  assertEquals(
    canShowEnergy({
      restrictionFlag: false,
      ageVerdict: absent,
      coachCounting: "no_position",
      studentSwitch: derived.on,
    }),
    { show: false, reason: "age_unknown" },
  );
  assertEquals(
    canShowEnergy({
      restrictionFlag: false,
      ageVerdict: adult,
      coachCounting: "no_counting",
      studentSwitch: derived.on,
    }),
    { show: false, reason: "doctrine_no_counting" },
  );
  // ET LE CAS QUI PASSE — sans lui, les quatre assertions ci-dessus resteraient
  // vertes si `energySwitchFrom` rendait toujours `false`. « Une garde a besoin
  // d'un cas qui passe. »
  assertEquals(
    canShowEnergy({
      restrictionFlag: false,
      ageVerdict: adult,
      coachCounting: "no_position",
      studentSwitch: derived.on,
    }),
    { show: true, reason: "open" },
  );
});

Deno.test("FF-059 lot 4 — chaque clé de l'interrupteur est REQUISE", () => {
  const full = { stored: null, direction: "down" as const };
  for (const key of ENERGY_SWITCH_INPUT_KEYS) {
    const partial = { ...full } as Record<string, unknown>;
    delete partial[key];
    assertThrows(
      () => energySwitchFrom(partial as never),
      Error,
      key,
      `la clé ${key} est devenue facultative`,
    );
    assertThrows(
      () => energySwitchFrom({ ...full, [key]: undefined } as never),
      Error,
      key,
      `${key}: undefined ne lève plus`,
    );
  }
});

Deno.test("FF-059 lot 4 — une direction hors vocabulaire LÈVE, elle ne se lit pas « aucune »", () => {
  // Se taire sur un jeton inconnu refermerait le chiffre en silence le jour où
  // un quatrième objectif arrive dans `GOAL_TOKENS` sans passer par
  // `scaleDirectionOf`. On veut le bruit, pas le repli.
  assertThrows(
    () => energySwitchFrom({ stored: null, direction: "sideways" as never }),
    Error,
    "unknown scale direction",
  );
  assertThrows(
    () => energySwitchFrom({ stored: 1 as never, direction: null }),
    Error,
    "stored must be a boolean or null",
  );
});

Deno.test("FF-059 lot 4 — l'interrupteur n'a AUCUN paramètre optionnel", () => {
  // Même garde que `EnergyGateInput`: un `?` ferait de `no_direction` la
  // réponse SILENCIEUSE de tout appelant qui oublierait de brancher l'objectif.
  const start = GATE_SOURCE.indexOf("export function energySwitchFrom(");
  assert(start > 0, "`energySwitchFrom` a disparu ou changé de nom");
  const body = GATE_SOURCE.slice(start, GATE_SOURCE.indexOf("}", start + 200));
  assert(
    !/\b(stored|direction)\?\s*:/.test(body),
    `un paramètre de garde est devenu optionnel:\n${body}`,
  );
  assertEquals(energySwitchFrom.length, 1);
});

Deno.test("FF-059 lot 4 — les motifs de l'interrupteur sont TOUS atteignables", () => {
  // Un vocabulaire qui déclare un motif que rien ne produit est un compteur
  // désarmé qui ressemble à un compteur qui marche.
  const produced = new Set<string>();
  for (const s of SWITCH_STORED) {
    for (const d of SWITCH_DIRECTIONS) {
      produced.add(energySwitchFrom({ stored: s.stored, direction: d.direction }).source);
    }
  }
  assertEquals([...produced].sort(), [...ENERGY_SWITCH_SOURCES].sort());
});
