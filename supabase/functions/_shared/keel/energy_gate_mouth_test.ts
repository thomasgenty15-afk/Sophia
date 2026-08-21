// L4 — LA GARDE TCA, ARMÉE JUSQU'AU MOTEUR ET JUSQU'À LA TABLE.
//
// `CALORIE_REVERSAL.md` §0 déclare ce lot BLOQUANT, et la raison n'est pas
// technique: Levinson 2017 — 73 % des patients TCA déclarent qu'un tracker de
// calories a contribué à leur trouble. (Le « 83 % » de la revue 2025 est une
// erreur de citation; ne pas la propager.)
//
// CE QUE CE BANC PROTÈGE, DANS L'ORDRE DE CE QUE ÇA COÛTE QUAND ÇA CASSE:
//
//   * LA CHAÎNE DE SÉCURITÉ N'A QU'UNE ÉCRITURE. `canShowEnergy` a été coupée
//     en `energySafetyGates` (①②③) + ④. Deux écritures de ①②③ finiraient par
//     diverger, et c'est la garde la plus sensible du produit. Le test
//     d'ACCORD ci-dessous compare les deux sorties sur la table entière.
//   * LE MOTEUR NE DIMENSIONNE PAS SOUS PLANCHER. `canSizeFromTarget` est la
//     seule porte du chantier de la cible. Mesuré avant d'écrire: les mots
//     `restriction` et `floor` n'apparaissent pas UNE FOIS dans
//     `household_portions.ts` — le foyer dimensionne aujourd'hui sans savoir
//     qu'un plancher TCA existe.
//   * UN CHIFFRE NE SORT QUE POUR LA BOUCHE QUI LE DEMANDE. `other_mouth`
//     répond à la question §11 n°4 de FF-059, restée ouverte depuis le 12/08.
//   * AUCUN PARAMÈTRE OPTIONNEL. « Un paramètre de garde optionnel est une
//     garde désarmée » (`safetyBand: null` de `keel-reengage-v1`). Les tests
//     de source refusent un `?` dans les trois entrées neuves.
//   * CHAQUE GARDE A SON CAS QUI PASSE. Une garde qui refuse tout bloque tout
//     et ressemble trait pour trait à une garde qui marche.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

import {
  canEmitMouthEnergy,
  canShowEnergy,
  canShowTarget,
  canSizeFromTarget,
  COUNTING_STANCES,
  type CountingStance,
  ENERGY_GATE_REASONS,
  ENERGY_SAFETY_INPUT_KEYS,
  ENERGY_SAFETY_REASONS,
  energySafetyGates,
  type EnergyGateReason,
  type EnergySafetyInput,
  MOUTH_ENERGY_REASONS,
  TARGET_GATE_REASONS,
} from "./energy_gate.ts";
import { assessBirthDate, type BirthDateVerdict } from "./student_age.ts";

const TODAY = "2026-08-18";

/**
 * Les six verdicts d'âge, construits par la vraie fonction. Un littéral
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

const ADULT = AGE_VERDICTS[0].verdict;

const SAFE: EnergySafetyInput = {
  restrictionFlag: false,
  ageVerdict: ADULT,
  coachCounting: "no_position",
};

// ---------------------------------------------------------------------------
// ①②③ — LA CHAÎNE DE SÉCURITÉ, SEULE
// ---------------------------------------------------------------------------

/**
 * LE MOTIF ATTENDU, RÉÉCRIT EN TOUTES LETTRES.
 *
 * ⚠️ N'appelle NI `energySafetyGates` NI `canShowEnergy`: un test paramétré par
 * le code qu'il teste reste vert quand ce code change
 * (`test-parameterized-by-its-own-constant`).
 */
function expectedSafetyReason(
  restrictionFlag: boolean,
  ageLabel: string,
  coachCounting: CountingStance,
): EnergyGateReason {
  if (restrictionFlag) return "restriction_floor";
  if (ageLabel === "minor") return "minor";
  // ⟳ S3 (2026-08-22) — LA PORTE ②bis. Seul un ADULTE AVÉRÉ passe l'âge: les
  // quatre autres statuts sont quatre façons de ne pas savoir, et « on ne sait
  // pas » n'ouvre pas un déficit sur un corps peut-être en croissance. C'est
  // la règle que `household_portions.ts` applique depuis toujours par bouche
  // (`noSizing("age_unknown")`); elle vit désormais dans la chaîne elle-même.
  if (ageLabel !== "adult") return "age_unknown";
  if (coachCounting === "no_counting") return "doctrine_no_counting";
  return "open";
}

Deno.test("L4 — table de vérité EXHAUSTIVE de la chaîne de sécurité (2 × 6 × 2)", () => {
  let rows = 0;
  let opened = 0;
  const seen = new Set<EnergyGateReason>();

  for (const restrictionFlag of [true, false]) {
    for (const age of AGE_VERDICTS) {
      for (const coachCounting of COUNTING_STANCES) {
        rows++;
        const result = energySafetyGates({
          restrictionFlag,
          ageVerdict: age.verdict,
          coachCounting,
        });
        const want = expectedSafetyReason(restrictionFlag, age.label, coachCounting);
        const where =
          `restriction=${restrictionFlag} age=${age.label} coach=${coachCounting}`;
        assertEquals(result.reason, want, where);
        assertEquals(result.open, want === "open", where);
        seen.add(result.reason);
        if (result.open) opened++;
      }
    }
  }

  assertEquals(rows, 2 * 6 * 2);
  // ⟳ S3 — les CINQ motifs de cette chaîne sont atteignables, et `student_off`
  // n'en fait toujours pas partie: elle ne lit aucun interrupteur.
  assertEquals([...seen].sort(), [...ENERGY_SAFETY_REASONS].sort());
  // ⟳ S3 — ~~Cinq verdicts non-mineurs~~ **UN SEUL**: l'adulte avéré × un
  // coach sans position × plancher baissé. Le passage de 5 à 1 EST la mesure
  // du lot: quatre statuts d'âge ont cessé de produire un chiffre.
  assertEquals(opened, 1);
});

Deno.test("L4 — la chaîne de sécurité ne rend JAMAIS `student_off` ni `target_off`", () => {
  // La preuve que la coupure passe au bon endroit. Si un interrupteur entrait
  // ici, masquer un chiffre changerait le dîner.
  for (const reason of ENERGY_SAFETY_REASONS) {
    assert(
      (ENERGY_GATE_REASONS as readonly string[]).includes(reason),
      `${reason} n'est pas un motif de la chaîne A/B`,
    );
  }
  assert(!(ENERGY_SAFETY_REASONS as readonly string[]).includes("student_off"));
  assert(!(ENERGY_SAFETY_REASONS as readonly string[]).includes("target_off"));
});

Deno.test("L4 — ACCORD: `canShowEnergy` EST la chaîne de sécurité, plus ④", () => {
  // Le test qui empêche la coupure de dériver. Il tourne sur les 48 lignes de
  // la table complète: si un jour `canShowEnergy` réécrit ①②③ chez elle, ou si
  // `energySafetyGates` gagne une branche que l'autre n'a pas, une ligne au
  // moins désaccorde.
  let checked = 0;
  for (const restrictionFlag of [true, false]) {
    for (const age of AGE_VERDICTS) {
      for (const coachCounting of COUNTING_STANCES) {
        for (const studentSwitch of [true, false]) {
          checked++;
          const safety = energySafetyGates({
            restrictionFlag,
            ageVerdict: age.verdict,
            coachCounting,
          });
          const full = canShowEnergy({
            restrictionFlag,
            ageVerdict: age.verdict,
            coachCounting,
            studentSwitch,
          });
          const where =
            `restriction=${restrictionFlag} age=${age.label} coach=${coachCounting} switch=${studentSwitch}`;
          if (!safety.open) {
            // Une porte de sécurité fermée ferme la chaîne entière, AVEC son
            // motif. Jamais `student_off` sur quelqu'un que le plancher protège.
            assertEquals(full, { show: false, reason: safety.reason }, where);
          } else {
            assertEquals(
              full,
              studentSwitch
                ? { show: true, reason: "open" }
                : { show: false, reason: "student_off" },
              where,
            );
          }
        }
      }
    }
  }
  assertEquals(checked, 2 * 6 * 2 * 2);
});

Deno.test("L4 — chaque clé de la chaîne de sécurité est REQUISE", () => {
  // Prémisse fausse d'abord: l'entrée complète passe.
  assertEquals(energySafetyGates({ ...SAFE }), { open: true, reason: "open" });

  for (const key of ENERGY_SAFETY_INPUT_KEYS) {
    const partial = { ...SAFE } as Record<string, unknown>;
    delete partial[key];
    assertThrows(
      () => energySafetyGates(partial as unknown as EnergySafetyInput),
      Error,
      key,
    );
    assertThrows(
      () => energySafetyGates({ ...SAFE, [key]: undefined } as EnergySafetyInput),
      Error,
      key,
    );
  }
});

Deno.test("L4 — une entrée de sécurité mal typée LÈVE plutôt que de se lire « faux »", () => {
  const bad: Array<[string, unknown]> = [
    ["restrictionFlag", "false"],
    ["restrictionFlag", 0],
    ["restrictionFlag", null],
    ["ageVerdict", "adult"],
    ["ageVerdict", null],
    ["coachCounting", "counts"],
    ["coachCounting", ""],
  ];
  for (const [key, value] of bad) {
    assertThrows(
      () =>
        energySafetyGates({ ...SAFE, [key]: value } as unknown as EnergySafetyInput),
      Error,
      undefined,
      `${key}=${JSON.stringify(value)} aurait dû lever`,
    );
  }
  assertThrows(() => energySafetyGates(null as unknown as EnergySafetyInput), Error);
  assertThrows(
    () => energySafetyGates("open" as unknown as EnergySafetyInput),
    Error,
  );
});

// ---------------------------------------------------------------------------
// LA PORTE DU DIMENSIONNEMENT — celle que le chantier de la cible devra passer
// ---------------------------------------------------------------------------

Deno.test("L4 — dimensionnement: LE CAS QUI PASSE, et il est le cas nominal", () => {
  // Un foyer ordinaire — pas de plancher, un adulte, pas de coach qui interdit
  // — dimensionne. Sans cette ligne, une garde cassée qui refuse tout serait
  // indiscernable d'une garde qui marche.
  assertEquals(
    canSizeFromTarget({ safety: energySafetyGates(SAFE) }),
    { size: true, reason: "open" },
  );
});

Deno.test("L4 — dimensionnement: chaque porte de sécurité ferme le MOTEUR, avec son motif", () => {
  const cases: Array<[Partial<EnergySafetyInput>, EnergyGateReason]> = [
    [{ restrictionFlag: true }, "restriction_floor"],
    [{ ageVerdict: AGE_VERDICTS[1].verdict }, "minor"],
    [{ coachCounting: "no_counting" }, "doctrine_no_counting"],
  ];
  for (const [over, reason] of cases) {
    assertEquals(
      canSizeFromTarget({ safety: energySafetyGates({ ...SAFE, ...over }) }),
      { size: false, reason },
      reason,
    );
  }
});

Deno.test("L4 — dimensionnement: le PLANCHER gagne contre tout le reste", () => {
  // L'angle adversarial prioritaire, rejoué sur la porte du moteur: il n'existe
  // aucune combinaison où le plancher est levé et où le moteur dimensionne.
  for (const age of AGE_VERDICTS) {
    for (const coachCounting of COUNTING_STANCES) {
      const out = canSizeFromTarget({
        safety: energySafetyGates({
          restrictionFlag: true,
          ageVerdict: age.verdict,
          coachCounting,
        }),
      });
      assertEquals(out, { size: false, reason: "restriction_floor" });
    }
  }
});

Deno.test("L4 — dimensionnement: on n'entre PAS avec un résultat fabriqué à la main", () => {
  // Le point de la signature: le seul argument est la SORTIE de ①②③. Un
  // appelant qui veut sauter la chaîne doit forger un objet, et la validation
  // d'exécution le refuse — y compris la forme la plus tentante, `{open:true}`
  // avec un motif d'une AUTRE chaîne.
  const bad: unknown[] = [
    undefined,
    null,
    {},
    { safety: null },
    { safety: undefined },
    { safety: { open: true } },
    { safety: { open: "true", reason: "open" } },
    { safety: { open: true, reason: "student_off" } },
    { safety: { open: true, reason: "target_off" } },
    { safety: { open: true, reason: "" } },
    { safety: { show: true, reason: "open" } },
  ];
  for (const args of bad) {
    assertThrows(
      () => canSizeFromTarget(args as Parameters<typeof canSizeFromTarget>[0]),
      Error,
      undefined,
      `${JSON.stringify(args)} aurait dû lever`,
    );
  }
});

// ---------------------------------------------------------------------------
// LA PORTE DE L'ÉMISSION PAR BOUCHE — FF-059 §11 n°4, tranchée
// ---------------------------------------------------------------------------

function readerGate(over: Partial<Parameters<typeof canShowEnergy>[0]> = {}) {
  return canShowEnergy({
    restrictionFlag: false,
    ageVerdict: ADULT,
    coachCounting: "no_position",
    studentSwitch: true,
    ...over,
  });
}

Deno.test("L4 — émission: LE CAS QUI PASSE — sa propre bouche, chaîne ouverte", () => {
  assertEquals(
    canEmitMouthEnergy({ reader: readerGate(), mouthIsReader: true }),
    { emit: true, reason: "open" },
  );
  // Et il passe aussi au niveau C, sur le résultat de `canShowTarget`.
  assertEquals(
    canEmitMouthEnergy({
      reader: canShowTarget({ energy: readerGate(), targetSwitch: true }),
      mouthIsReader: true,
    }),
    { emit: true, reason: "open" },
  );
});

Deno.test("L4 — émission: la bouche d'un AUTRE ne sort jamais, chaîne ouverte ou non", () => {
  assertEquals(
    canEmitMouthEnergy({ reader: readerGate(), mouthIsReader: false }),
    { emit: false, reason: "other_mouth" },
  );
});

Deno.test("L4 — émission: le motif du LECTEUR survit, et il précède `other_mouth`", () => {
  // L'ordre est le contrat, comme sur la chaîne A/B: un lecteur sous plancher
  // qui demande la part d'un autre lit `restriction_floor`. Attribuer son refus
  // à « c'est la part de quelqu'un d'autre » ferait chercher la réparation du
  // mauvais côté, et masquerait le seul motif qui compte.
  const cases: Array<[Partial<Parameters<typeof canShowEnergy>[0]>, string]> = [
    [{ restrictionFlag: true }, "restriction_floor"],
    [{ ageVerdict: AGE_VERDICTS[1].verdict }, "minor"],
    [{ coachCounting: "no_counting" }, "doctrine_no_counting"],
    [{ studentSwitch: false }, "student_off"],
  ];
  for (const [over, reason] of cases) {
    for (const mouthIsReader of [true, false]) {
      assertEquals(
        canEmitMouthEnergy({ reader: readerGate(over), mouthIsReader }),
        { emit: false, reason },
        `${reason} / mouthIsReader=${mouthIsReader}`,
      );
    }
  }
  // Et `target_off` aussi, quand le lecteur vient du niveau C.
  assertEquals(
    canEmitMouthEnergy({
      reader: canShowTarget({ energy: readerGate(), targetSwitch: false }),
      mouthIsReader: true,
    }),
    { emit: false, reason: "target_off" },
  );
});

Deno.test("L4 — émission: les entrées sont REQUISES et validées", () => {
  const bad: unknown[] = [
    undefined,
    null,
    {},
    { reader: readerGate() },
    { mouthIsReader: true },
    { reader: readerGate(), mouthIsReader: undefined },
    { reader: undefined, mouthIsReader: true },
    { reader: readerGate(), mouthIsReader: "true" },
    { reader: readerGate(), mouthIsReader: 1 },
    { reader: { show: true }, mouthIsReader: true },
    { reader: { show: true, reason: "other_mouth" }, mouthIsReader: true },
    { reader: { show: "true", reason: "open" }, mouthIsReader: true },
    { reader: { emit: true, reason: "open" }, mouthIsReader: true },
  ];
  for (const args of bad) {
    assertThrows(
      () => canEmitMouthEnergy(args as Parameters<typeof canEmitMouthEnergy>[0]),
      Error,
      undefined,
      `${JSON.stringify(args)} aurait dû lever`,
    );
  }
});

Deno.test("L4 — le vocabulaire de l'émission EST celui de la chaîne, plus UN motif", () => {
  // Un motif de plus qui ne serait pas dans la chaîne serait un refus que
  // l'écran ne sait pas dire; un motif de la chaîne qui manquerait ici serait
  // un refus qui se perd en route.
  assertEquals(
    [...MOUTH_ENERGY_REASONS].sort(),
    [...TARGET_GATE_REASONS, "other_mouth"].sort(),
  );
  for (const reason of TARGET_GATE_REASONS) {
    assert((MOUTH_ENERGY_REASONS as readonly string[]).includes(reason), reason);
  }
});

// ---------------------------------------------------------------------------
// LA GARDE CONTRE LE PARAMÈTRE OPTIONNEL — elle lit la source
// ---------------------------------------------------------------------------

const GATE_SOURCE = Deno.readTextFileSync(
  fromFileUrl(new URL("./energy_gate.ts", import.meta.url)),
);

/** Retire les commentaires: un « ? » de prose ferait rougir un test correct. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function bodyAfter(marker: string, closer = "\n}"): string {
  const start = GATE_SOURCE.indexOf(marker);
  assert(start > 0, `${marker} a été renommé`);
  const end = GATE_SOURCE.indexOf(closer, start);
  assert(end > start, `${marker}: fin introuvable`);
  return stripComments(GATE_SOURCE.slice(start, end));
}

Deno.test("L4 — les trois entrées neuves ne portent AUCUN champ optionnel", () => {
  // Le typecheck ne sait pas exprimer « cette interface n'a pas de `?` ». On lit
  // donc la source: un `safety?: EnergySafetyResult` compilerait, tous les
  // appelants existants continueraient de passer, et le premier qui l'oublie
  // ouvrirait la porte sans qu'un test rougisse.
  const zones = [
    bodyAfter("export interface EnergySafetyInput {"),
    bodyAfter("export function canSizeFromTarget(args: {", "\n}): "),
    bodyAfter("export function canEmitMouthEnergy(args: {", "\n}): "),
  ];
  for (const code of zones) {
    assert(!/\w\s*\?\s*:/.test(code), `champ optionnel:\n${code}`);
    assert(!/\bundefined\b/.test(code), `« undefined » admis:\n${code}`);
  }
});

/**
 * LA FONCTION ENTIÈRE — signature ET corps.
 *
 * ⚠️ NE PAS REVENIR À `bodyAfter` ICI. Mesuré le 2026-08-18 (L4-B): son closer
 * par défaut `"\n}"` tombe sur l'accolade qui ferme l'objet d'ARGUMENTS
 * (`\n}): { size... }`), donc il rendait TROIS LIGNES — la liste de paramètres,
 * et rien du corps. La garde ci-dessous cherchait `studentSwitch` dans un
 * fragment où il ne pouvait pas être: un `const studentSwitch = true` posé dans
 * le corps passait vert. Une garde cassée bloque tout et ressemble à une garde
 * qui marche; celle-ci ne bloquait rien et lui ressemblait quand même.
 *
 * Le closer est `"\n}\n"`: un accolade en colonne 0 SUIVIE D'UNE FIN DE LIGNE.
 * `\n}): ` ne matche pas, donc on saute bien la fin de l'objet d'arguments.
 */
function functionSource(name: string): string {
  const marker = `export function ${name}(`;
  const start = GATE_SOURCE.indexOf(marker);
  assert(start > 0, `${name} a été renommée`);
  const end = GATE_SOURCE.indexOf("\n}\n", start);
  assert(end > start, `${name}: fin de fonction introuvable`);
  return stripComments(GATE_SOURCE.slice(start, end + 2));
}

Deno.test("L4 — le dimensionnement ne lit NI ④ NI ⑤, et la source le prouve", () => {
  // L'arbitrage écrit dans le module: masquer un chiffre ne change pas le
  // dîner. Il tient tant que ces deux mots n'entrent pas dans cette fonction —
  // et « ajouter la porte ④ qui manque » est exactement le geste qu'une session
  // future croira réparateur.
  const body = functionSource("canSizeFromTarget");

  // ── LA PRÉMISSE DE LA GARDE, VÉRIFIÉE AVANT LA GARDE ────────────────────
  // Sans ces deux lignes, un extracteur cassé rend `""`, les quatre `assert`
  // ci-dessous passent, et le banc reste vert en ne regardant RIEN. C'est
  // exactement le défaut que L4-B a mesuré. On exige donc que le fragment
  // contienne le corps réel: la lecture de la porte de sécurité, et le retour
  // ouvert.
  assert(body.includes("args.safety.open"), `le corps n'a pas été lu:\n${body}`);
  assert(
    body.includes('return { size: true, reason: "open" }'),
    `le corps n'a pas été lu jusqu'au bout:\n${body}`,
  );

  assert(!body.includes("studentSwitch"), body);
  assert(!body.includes("targetSwitch"), body);
  assert(!body.includes("energy_display_enabled"), body);
  assert(!body.includes("energy_target_enabled"), body);
});

Deno.test("L4 — l'ordre des portes tient dans la SOURCE, chaîne coupée comprise", () => {
  // Même propriété que `no_calorie_to_student_property_test.ts`, rejouée ici
  // parce que la coupure ①②③ / ④ est neuve: si quelqu'un remonte ④ au-dessus du
  // plancher, l'écran dirait « tu as éteint » à quelqu'un que le plancher
  // protège, et le motif serait faux dans le journal comme à l'écran.
  const code = stripComments(GATE_SOURCE);
  const floor = code.indexOf("input.restrictionFlag)");
  const minor = code.indexOf("weekPlanAgeGate(");
  const doctrine = code.indexOf('input.coachCounting === "no_counting"');
  const student = code.indexOf("!input.studentSwitch");
  assert(floor >= 0, "la porte ① a changé de forme");
  assert(minor > floor, "② est passée avant ①");
  assert(doctrine > minor, "③ est passée avant ②");
  assert(student > doctrine, "④ est passée avant ③");
});

Deno.test("L4 — les trois portes neuves n'ont QUE les appelants qu'on a relus", () => {
  // Même mécanique que la propriété « une porte, un appelant » de
  // `no_calorie_to_student_property_test.ts`: chaque appelant supplémentaire est
  // un endroit de plus où la chaîne peut être assemblée de travers.
  //
  // ⚠️ LA LISTE ÉTAIT VIDE JUSQU'AU 2026-08-18, ET C'ÉTAIT LE POINT. Le chantier
  // de la cible (L8) s'y est inscrit À LA MAIN — le banc était rouge tant qu'il
  // ne l'avait pas fait, et il l'a été (`AssertionError: appelant non relu de
  // energySafetyGates(`). C'est-à-dire qu'aucun lot ne peut se brancher sur
  // cette garde sans qu'un humain relise l'endroit exact où il l'appelle.
  //
  // ── L'ENDROIT RELU, ET CE QU'ON Y A VÉRIFIÉ ────────────────────────────
  // `_shared/keel/household_portions.ts`, deux fonctions et deux seulement:
  //
  //   · `mouthTargetFactor` — la porte du dimensionnement, appelée UNE fois par
  //     bouche, avec l'âge de CETTE bouche (`mouthAgeVerdict(member.ageState)`,
  //     jumeau de `keel_household_member_age`) et son plancher TCA à elle,
  //     fail-closed. C'est la clause C8 réécrite par L4-B: sans l'âge par
  //     bouche, une cible dimensionnerait les grammages d'un enfant de douze ans
  //     parce que son parent est adulte.
  //   · `memberTargetFactor` — le raccourci d'appel; il évalue la MÊME chaîne
  //     avant de renoncer pour absence de corps, pour que le motif rendu reste
  //     celui de la première porte fermée.
  //
  // Ni l'une ni l'autre ne lit ④ ou ⑤ — le test de source ci-dessus le tient sur
  // `canSizeFromTarget`, et le conseil chiffré du midi (②), qui LUI se lit et
  // traverse donc les interrupteurs, entre par `canShowTarget` chez son
  // appelant, jamais par cette chaîne-ci.
  // ── LE SECOND ENDROIT RELU (2026-08-20, LOT 2 du chantier grammage) ────
  // `_shared/keel/mouth_anchor.ts`, une fonction et une seule:
  // `mouthTargetKcal`, qui rend une cible en kcal/jour au lieu d'un facteur
  // sans unité. Ce qui a été vérifié à l'endroit exact de l'appel:
  //
  //   · DEUX PASSES, ET LA SECONDE NE DESSERRE QUE ② ET ③. La première évalue
  //     la chaîne entière avec l'âge de CETTE bouche et la position du coach;
  //     la seconde la rejoue avec `ageVerdict: "adult"` et
  //     `coachCounting: "no_position"` LITTÉRAUX. C'est le geste exact de
  //     `bodyShareFactors`, copié dans sa forme (rejouer la chaîne) et pas dans
  //     son contenu (aucun `if` de `energy_gate.ts` n'est recopié).
  //   · ① GAGNE DANS LES DEUX PASSES, et c'est ce qui rend le dépassement sûr:
  //     `restrictionFlag` est passé INCHANGÉ aux deux appels, donc un plancher
  //     levé sort `restriction_floor` à la première ET à la seconde. Une
  //     mutation qui désarme ce refus fait rougir `mouth_anchor_test.ts`
  //     (« ① le plancher TCA ferme TOUT, et il gagne contre ② et ③ »).
  //   · CE QUE CHAQUE PASSE ACHÈTE, ET C'EST LA FINESSE DU LOT: la seconde
  //     n'ouvre QUE l'entretien — ce que ce corps dépense, qui n'est pas une
  //     cible. L'ÉCART (déficit/surplus) reste gouverné par la PREMIÈRE passe,
  //     donc par ② et ③ en entier. Un coach qui ne compte pas garde exactement
  //     ce qu'il a demandé; ce qu'il perd est seulement le droit de faire
  //     manger à un enfant la part d'un adulte.
  //   · NI ④ NI ⑤ ne sont lus, comme chez `household_portions.ts`.
  //
  // ⚠️ `pot_demand.ts` et `mouth_energy.ts` du même chantier n'appellent AUCUNE
  // de ces trois portes — ils ne produisent pas de cible — et n'ont donc rien à
  // faire dans cette liste.
  const ALLOWED: Record<string, string[]> = {
    "energySafetyGates(": [
      "keel/household_portions.ts",
      "keel/mouth_anchor.ts",
    ],
    "canSizeFromTarget(": [
      "keel/household_portions.ts",
      "keel/mouth_anchor.ts",
    ],
    "canEmitMouthEnergy(": [],
  };

  const roots = [
    new URL("./", import.meta.url),
    new URL("../../", import.meta.url),
  ];
  const found: Record<string, string[]> = {
    "energySafetyGates(": [],
    "canSizeFromTarget(": [],
    "canEmitMouthEnergy(": [],
  };

  for (const dir of roots) {
    for (const entry of Deno.readDirSync(fromFileUrl(dir))) {
      const path = fromFileUrl(new URL(entry.name, dir));
      const files = entry.isDirectory
        ? (() => {
          try {
            return [...Deno.readDirSync(path)]
              .filter((f) => f.isFile && f.name.endsWith(".ts"))
              .map((f) => `${path}/${f.name}`);
          } catch {
            return [];
          }
        })()
        : entry.isFile && entry.name.endsWith(".ts")
        ? [path]
        : [];
      for (const file of files) {
        // La garde elle-même, et les TESTS: un test ne met aucun chiffre devant
        // personne, et les compter ferait rougir ce banc à chaque test ajouté
        // — c'est-à-dire qu'on finirait par le désarmer pour avoir la paix.
        if (file.endsWith("energy_gate.ts") || file.endsWith("_test.ts")) continue;
        let text: string;
        try {
          text = stripComments(Deno.readTextFileSync(file));
        } catch {
          continue;
        }
        for (const symbol of Object.keys(found)) {
          if (text.includes(symbol)) {
            found[symbol].push(file.split("/").slice(-2).join("/"));
          }
        }
      }
    }
  }

  for (const symbol of Object.keys(ALLOWED)) {
    assertEquals(
      [...new Set(found[symbol])].sort(),
      ALLOWED[symbol].slice().sort(),
      `appelant non relu de ${symbol} — inscris-le dans ALLOWED, ou n'appelle ` +
        `pas la garde depuis là`,
    );
  }
});
