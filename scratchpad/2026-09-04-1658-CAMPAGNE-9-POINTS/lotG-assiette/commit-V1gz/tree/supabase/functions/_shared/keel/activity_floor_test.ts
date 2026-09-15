import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  ACTIVITY_LEVELS,
  type ActivityInput,
  activitySectionFor,
  parseActivityLevel,
} from "./activity_floor.ts";
import {
  ACTIVITY_EMPHASES,
  MAX_ACTIVITY_EMPHASES,
  parseActivityStance,
  SILENT_STANCE,
  validateStanceForPublish,
} from "./activity_stance.ts";
import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import type { StudentGoal } from "./week_plan_generation.ts";

const GOALS: readonly StudentGoal[] = [
  "fat_loss",
  "muscle_gain",
  "maintenance",
  "maintenance",
  "maintenance",
  "maintenance",
];

function input(over: Partial<ActivityInput> = {}): ActivityInput {
  return {
    goal: "maintenance",
    stance: SILENT_STANCE,
    level: null,
    restrictionFlag: false,
    hasDeclaredCondition: false,
    isMinor: false,
    locale: "en",
    ...over,
  };
}

// ===========================================================================
// L'ACTIVITÉ — ce que ce fichier garde
//
//   1. LES QUATRE PORTES, qu'AUCUNE doctrine ne lève. La hiérarchie du produit
//      est plancher TCA > coach > Sophia, et elle se teste dans ce sens.
//   2. LA LIGNE PLANCHER/PROGRAMMATION, sur TOUTES les sorties possibles —
//      y compris le chemin coach.
//   3. LES DEUX VERSIONS: le coach REMPLACE le plancher, il ne fusionne pas ;
//      et un coach MUET ne se voit jamais attribuer un repère public.
// ===========================================================================

Deno.test("les quatre portes ferment la section — et elle est ABSENTE, pas vide", () => {
  // `null`, pas `{lines: []}`: une section vide occupe le rang d'une section et
  // invite à la commenter, après quoi l'élève lit « je ne peux rien te dire »,
  // soit exactement l'information qu'on refusait de donner.
  assertEquals(activitySectionFor(input({ restrictionFlag: true })), null);
  assertEquals(activitySectionFor(input({ hasDeclaredCondition: true })), null);
  assertEquals(activitySectionFor(input({ isMinor: true })), null);
  assertEquals(
    activitySectionFor(input({ stance: { mode: "off", emphases: [], beliefKey: null } })),
    null,
  );
});

Deno.test("AUCUNE doctrine ne lève une porte — plancher TCA > coach > Sophia", () => {
  // LE TEST QUI TIENT LA HIÉRARCHIE. Un coach gouverne sa méthode, pas les
  // gardes. Une posture `coach` pleinement remplie ne doit rien ouvrir.
  const loud = {
    mode: "coach" as const,
    emphases: ["strength", "cardio"] as const,
    beliefKey: "b1",
  };
  assertEquals(
    activitySectionFor(input({ stance: loud, restrictionFlag: true })),
    null,
    "une doctrine a levé le plancher TCA",
  );
  assertEquals(
    activitySectionFor(input({ stance: loud, hasDeclaredCondition: true })),
    null,
    "une doctrine a levé le silence sur maladie déclarée",
  );
  assertEquals(
    activitySectionFor(input({ stance: loud, isMinor: true })),
    null,
    "une doctrine a levé la règle du mineur",
  );
});

Deno.test("AUCUNE sortie ne contient de programmation — toutes langues, tous chemins", () => {
  // LA LIGNE DU CHANTIER. Testée sur le chemin maison ET sur le chemin coach,
  // parce que la garde doit tenir même quand un coach a parlé.
  //
  // ⚠️ LE MATCHER EST CELUI DU DÉPÔT, PAS UN `includes` MAISON. La première
  // version de ce test cherchait « rep » en sous-chaîne et mordait sur
  // « repères » — exactement le piège « laitue » ≠ « lait » que ce dépôt a
  // déjà mesuré. `findForbiddenMatches` matche des séquences de mots et
  // normalise les diacritiques, ce qu'un `includes` ne fera jamais bien.
  const banned: ForbiddenTerm[] = [
    // séries, charges, intensités
    "reps", "repetitions", "répétitions", "series", "séries", "sets",
    "1rm", "rpe", "failure", "echec", "échec", "superset", "amrap", "tempo",
    "fasted cardio", "cardio a jeun", "cardio à jeun", "drop set",
    // volumes chiffrés prescrits
    "10000 steps", "10000 pas", "10k steps", "10k pas",
  ].map((t, i) => ({ ruleId: `banned_${i}`, token: t }));

  const seen: string[] = [];
  for (const locale of ["en", "fr"] as const) {
    for (const goal of [...GOALS, null]) {
      // chemin maison
      const house = activitySectionFor(input({ goal, locale }));
      if (house) seen.push(...house.lines);
      // chemin coach, tous les accents, y compris en paire
      for (const e of ACTIVITY_EMPHASES) {
        const s = activitySectionFor(
          input({
            goal,
            locale,
            stance: { mode: "coach", emphases: [e], beliefKey: "b" },
          }),
        );
        if (s) seen.push(...s.lines);
      }
      // et toutes les lignes d'ouverture
      for (const level of ACTIVITY_LEVELS) {
        const s = activitySectionFor(input({ goal, locale, level }));
        if (s) seen.push(...s.lines);
      }
    }
  }
  assert(seen.length > 0, "rien n'a été produit, le test ne prouve rien");
  for (const line of seen) {
    const hits = findForbiddenMatches(line, banned);
    assertEquals(
      hits.map((h) => h.matchedText),
      [],
      `programmation détectée dans: ${line}`,
    );
    // Et aucun chiffre nulle part: un volume prescrit est un volume chiffré.
    assertEquals(/\d/.test(line), false, `chiffre prescrit dans: ${line}`);
  }

  // LA MUTATION QUI PROUVE QUE LE TEST MORD. Sans elle, une liste de termes
  // qui ne matche jamais rien passerait pour une garde.
  const canary = findForbiddenMatches("do 3 sets to failure", banned);
  assert(canary.length > 0, "le matcher ne mord sur rien — le test ne garde rien");
});

Deno.test("le coach REMPLACE le plancher, il ne fusionne pas", () => {
  const coach = activitySectionFor(
    input({
      goal: "fat_loss",
      stance: { mode: "coach", emphases: ["mobility"], beliefKey: "b" },
    }),
  );
  assert(coach);
  assert(coach.attributedToCoach);
  // `fat_loss` maison met `daily_movement` + `strength`. Aucun des deux ne doit
  // apparaître: le coach remplace, il ne s'ajoute pas.
  const house = activitySectionFor(input({ goal: "fat_loss" }));
  assert(house);
  const houseOnly = house.lines.slice(1);
  for (const l of houseOnly) {
    assertEquals(coach.lines.includes(l), false, `fusion détectée: ${l}`);
  }
});

Deno.test("un coach MUET ne se voit jamais attribuer le repère public", () => {
  // Fork F.1bis option A: le repère s'affiche, mais faire parler un coach à sa
  // place est exactement ce que le modèle interdit.
  const silent = activitySectionFor(input({ goal: "maintenance", stance: SILENT_STANCE }));
  assert(silent, "le repère public devrait s'afficher (option A)");
  assertEquals(silent.attributedToCoach, false, "attribué à un coach qui n'a rien dit");

  // Et `mode: "house"` explicite non plus: le coach a dit « sers le repère »,
  // pas « c'est ma méthode ».
  const house = activitySectionFor(
    input({ stance: { mode: "house", emphases: [], beliefKey: null } }),
  );
  assert(house);
  assertEquals(house.attributedToCoach, false);
});

Deno.test("chaque dynamique a sa branche, et `maintenance` est la plus légère", () => {
  for (const goal of GOALS) {
    const s = activitySectionFor(input({ goal }));
    assert(s, `${goal} ne rend aucune section`);
    assert(s.lines.length >= 2, `${goal} rend une section vide de contenu`);
  }
  // `maintenance` demande l'écart minimal: lui recommander d'ajouter quelque
  // chose contredirait sa définition.
  const maint = activitySectionFor(input({ goal: "maintenance" }))!;
  const gain = activitySectionFor(input({ goal: "muscle_gain" }))!;
  assert(
    maint.lines.length <= gain.lines.length,
    "maintenance devrait être au moins aussi légère",
  );
});

Deno.test("le niveau module l'ouverture, et son absence n'invente rien", () => {
  const openings = new Set<string>();
  for (const level of ACTIVITY_LEVELS) {
    const s = activitySectionFor(input({ level }))!;
    openings.add(s.lines[0]);
  }
  assertEquals(openings.size, ACTIVITY_LEVELS.length, "des niveaux partagent une ouverture");

  // Absent ⇒ ligne générique, JAMAIS une supposition: deviner « sédentaire »
  // chez quelqu'un qui n'a rien dit produirait un conseil condescendant et faux.
  const unknown = activitySectionFor(input({ level: null }))!;
  assertEquals(openings.has(unknown.lines[0]), false);
});

Deno.test("un niveau hors liste ne se devine pas", () => {
  assertEquals(parseActivityLevel("athlete"), null);
  assertEquals(parseActivityLevel(""), null);
  assertEquals(parseActivityLevel(null), null);
  assertEquals(parseActivityLevel("  ACTIVE "), "active");
});

Deno.test("la posture se lit strictement, et ce qui tombe est COMPTÉ", () => {
  const ok = parseActivityStance({ mode: "coach", emphases: ["strength"], belief_key: "b" });
  assertEquals(ok.stance.mode, "coach");
  assertEquals(ok.issues, []);

  // Un accent inconnu tombe SEUL et se dit.
  const partial = parseActivityStance({
    mode: "coach",
    emphases: ["strength", "crossfit"],
  });
  assertEquals(partial.stance.emphases, ["strength"]);
  assert(partial.issues.some((i) => i.includes("crossfit")));

  // Un mode inconnu ⇒ silence, ET compté. Jamais un repli muet: le dépôt a
  // déjà payé « le lecteur sait déjà réparer », où le repli ÉTAIT le cas
  // nominal et la QA restait verte.
  const bad = parseActivityStance({ mode: "whatever" });
  assertEquals(bad.stance, SILENT_STANCE);
  assert(bad.issues.length > 0);

  // Illisible ⇒ silence.
  assertEquals(parseActivityStance(null).stance, SILENT_STANCE);
  assertEquals(parseActivityStance("coach").stance, SILENT_STANCE);
});

Deno.test("`mode: coach` sans accent n'est pas une posture", () => {
  // Il dirait « ma méthode gouverne » sans rien à exécuter, et rendrait une
  // section vide — pire que le plancher, qui dit au moins quelque chose de vrai.
  const r = parseActivityStance({ mode: "coach", emphases: [] });
  assertEquals(r.stance.mode, "house");
  assert(r.issues.some((i) => i.includes("no emphasis")));
});

Deno.test("le plafond d'accents est une erreur BRUYANTE à la publication", () => {
  // Le parse tronque (il lit des lignes déjà en base); la publication refuse,
  // parce qu'un coach est devant l'écran et doit apprendre que son geste n'a
  // pas pris. Un troisième accent coupé en silence lui ferait croire le
  // contraire.
  const three = { mode: "coach", emphases: ["strength", "cardio", "mobility"] };
  const errors = validateStanceForPublish(three);
  assert(errors.some((e) => e.includes("at most")));

  const parsed = parseActivityStance(three);
  assertEquals(parsed.stance.emphases.length, MAX_ACTIVITY_EMPHASES);
  assert(parsed.issues.some((i) => i.includes("more than")));

  assertEquals(validateStanceForPublish({ mode: "coach", emphases: ["strength"] }), []);
  assert(validateStanceForPublish({ mode: "coach", emphases: [] }).length > 0);
  assert(validateStanceForPublish({ mode: "nope", emphases: [] }).length > 0);
});

Deno.test("désarmement : coach muet et rien de déclaré ⇒ sortie stable", () => {
  const a = activitySectionFor(input({ goal: null, stance: SILENT_STANCE, level: null }));
  const b = activitySectionFor(input({ goal: null, stance: SILENT_STANCE, level: null }));
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  assert(a);
  assertEquals(a.attributedToCoach, false);
});
