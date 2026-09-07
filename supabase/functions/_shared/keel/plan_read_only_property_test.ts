// ═══════════════════════════════════════════════════════════════════════════
// LOT D.3 — AUCUN RENDU DU BLOC DE PLAN NE SORT SANS SA CEINTURE
//
// ⚠️ POURQUOI UN TEST DE PROPRIÉTÉ, ET PAS TROIS CAS D'EXEMPLE.
//
// Le bloc de plan est la seule chose qui empêche le modèle d'affirmer qu'un
// plat a été mangé, d'inventer une liste de courses, ou de proposer une version
// modifiée d'un plan qu'il ne peut pas changer. Il se rend maintenant sous
// QUATRE axes — portée (foyer / solo), fenêtre (en cours / close), présence de
// plats, présence d'un mineur — et chacun a sa branche de rendu. Un test qui
// vérifie trois combinaisons laisse les autres libres, et c'est toujours celle
// qu'on n'a pas écrite qui part en production.
//
// ── OÙ IL VIT, ET POURQUOI CE N'EST PAS UN DÉTAIL ─────────────────────────
// `sophia-brain/test_harness/keel_properties/` porte les autres tests de
// propriété du produit et serait l'endroit « logique ». Le gate n'y touche
// pas: `check_tests` lance `deno test supabase/functions/_shared/keel/` et RIEN
// d'autre (portée volontairement étroite, le script l'explique). Un test posé
// là-bas serait COMPTÉ par `check_test_count` et JAMAIS exécuté — la forme la
// plus coûteuse d'un test, celle qui rassure sans rien garder.
//
// ── LA DISCIPLINE DES ATTENDUS ────────────────────────────────────────────
// On ne recopie JAMAIS le texte d'une règle dans ce fichier. On le demande à
// `planHardRules(...)`, c'est-à-dire à sa source. Une assertion qui recopie sa
// règle reste verte quand la règle change — elle vérifie que le test est
// d'accord avec lui-même. Le test ne pinne donc pas les MOTS: il pinne que
// chaque règle rendue par la source est PRÉSENTE dans le bloc, quelle que soit
// la combinaison, et qu'aucun réducteur de budget ne la mange.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  householdContextBlock,
  type HouseholdTurnContext,
  planHardRules,
  type PlanScope,
  type PlanWindow,
} from "./household_turn_context.ts";

const WINDOWS: readonly PlanWindow[] = Object.freeze([
  { state: "current" },
  { state: "ended", endedOn: "2026-09-01" },
]);
const SCOPES: readonly PlanScope[] = Object.freeze(["household", "personal"]);
const SHOPPING = ["none", "some", "truncated"] as const;

interface Shape {
  scope: PlanScope;
  window: PlanWindow;
  hasDishes: boolean;
  hasMinor: boolean;
  shopping: (typeof SHOPPING)[number];
}

function contextFor(shape: Shape): HouseholdTurnContext {
  const solo = shape.scope === "personal";
  const roster = solo ? [] : [
    {
      memberId: "m-me",
      userId: "u-me",
      firstName: "Ana",
      ageState: "adult" as const,
      role: "master" as const,
    },
    {
      memberId: "m-kid",
      userId: null,
      firstName: "Tom",
      ageState: (shape.hasMinor ? "minor" : "adult") as "minor" | "adult",
      role: "member" as const,
    },
  ];
  const shopping = shape.shopping === "none" ? [] : [
    { term: "cod", quantity: "600 g" },
    { term: "lentils", quantity: null },
  ];
  return {
    householdId: solo ? null : "h-1",
    scope: shape.scope,
    window: shape.window,
    viewerId: solo ? "u-me" : "m-me",
    roster,
    hasPlanToday: shape.hasDishes,
    todayDishes: shape.hasDishes
      ? [{ title: "Roast cod bowl", slot: "dinner", day: "wed" }]
      : [],
    preparations: [],
    portions: solo ? [] : [
      {
        memberId: "m-me",
        visible: true,
        line: { firstName: "Ana", note: "larger protein share", isMe: true },
      },
    ],
    myRestrictions: [],
    shopping,
    shoppingTruncated: shape.shopping === "truncated",
  } as unknown as HouseholdTurnContext;
}

function everyShape(): Shape[] {
  const out: Shape[] = [];
  for (const scope of SCOPES) {
    for (const window of WINDOWS) {
      for (const hasDishes of [true, false]) {
        for (const hasMinor of [true, false]) {
          for (const shopping of SHOPPING) {
            out.push({ scope, window, hasDishes, hasMinor, shopping });
          }
        }
      }
    }
  }
  return out;
}

const label = (s: Shape) =>
  `${s.scope}/${s.window.state}/dishes:${s.hasDishes}/minor:${s.hasMinor}/shopping:${s.shopping}`;

// ═══════════════════════════════════════════════════════════════════════════

Deno.test("P1 — la ceinture est ENTIÈRE dans chaque combinaison", () => {
  const shapes = everyShape();
  // 2 portées × 2 fenêtres × 2 plats × 2 mineurs × 3 courses = 48.
  assertEquals(shapes.length, 48);

  for (const shape of shapes) {
    const ctx = contextFor(shape);
    const block = householdContextBlock(ctx);
    // ⚠️ LA SOURCE, PAS UNE COPIE. Le mineur vient du roster, exactement comme
    // le rendu le calcule: demander autre chose ici ferait diverger le test du
    // produit sans que rien ne rougisse.
    const rules = planHardRules({
      scope: ctx.scope,
      window: ctx.window,
      hasMinor: ctx.roster.some((m) => m.ageState === "minor"),
    });
    assert(rules.length >= 6, `${label(shape)}: ceinture suspecte`);
    for (const rule of rules) {
      assert(
        block.includes(rule),
        `${label(shape)} — RÈGLE ABSENTE DU BLOC:\n${rule.slice(0, 120)}…`,
      );
    }
  }
});

Deno.test("P2 — sur un plan SOLO, pas un mot de foyer (R8)", () => {
  for (const shape of everyShape().filter((s) => s.scope === "personal")) {
    const block = householdContextBlock(contextFor(shape));
    assertEquals(
      /household/i.test(block),
      false,
      `${label(shape)}: le bloc parle de foyer à quelqu'un qui vit seul`,
    );
    assert(block.includes("WHAT THIS STUDENT PLANNED FOR THEMSELVES"));
  }
});

Deno.test("P3 — une fenêtre CLOSE ne se lit jamais comme aujourd'hui", () => {
  for (const shape of everyShape().filter((s) => s.window.state === "ended")) {
    const block = householdContextBlock(contextFor(shape));
    assert(
      block.includes("THIS PLAN IS OVER"),
      `${label(shape)}: la clôture n'est pas annoncée`,
    );
    assertEquals(
      block.includes("TODAY'S DISHES"),
      false,
      `${label(shape)}: un plan clos présente ses plats comme ceux du jour`,
    );
  }
  // Et l'inverse, pour que P3 discrimine: une fenêtre EN COURS ne porte jamais
  // l'annonce de clôture. Sans cette moitié, un bloc qui dirait toujours
  // « THIS PLAN IS OVER » passerait.
  for (const shape of everyShape().filter((s) => s.window.state === "current")) {
    const block = householdContextBlock(contextFor(shape));
    assertEquals(
      block.includes("THIS PLAN IS OVER"),
      false,
      `${label(shape)}: un plan EN COURS est annoncé clos`,
    );
  }
});

Deno.test("P4 — le plafond de budget ne mange JAMAIS la ceinture", () => {
  // ⚠️ LA PROPRIÉTÉ QUI COMPTE LE PLUS ICI. Le bloc est borné en caractères et
  // se réduit par vagues (courses, préparations d'un autre jour, parts des
  // autres, puis les prénoms). Un contexte assez gros pour déclencher les
  // quatre réducteurs ne doit pas faire disparaître une règle: un bloc tronqué
  // par la queue qui perdrait « READ-ONLY » serait pire que pas de bloc.
  for (const scope of SCOPES) {
    for (const window of WINDOWS) {
      const base = contextFor({
        scope,
        window,
        hasDishes: true,
        hasMinor: true,
        shopping: "truncated",
      });
      const obese = {
        ...base,
        roster: scope === "personal" ? [] : Array.from({ length: 20 }, (_, i) => ({
          memberId: `m-${i}`,
          userId: i === 0 ? "u-me" : null,
          firstName: `Member${i}`,
          ageState: (i % 3 === 0 ? "minor" : "adult") as "minor" | "adult",
          role: (i === 0 ? "master" : "member") as "master" | "member",
        })),
        preparations: Array.from({ length: 40 }, (_, i) => ({
          title: `Preparation number ${i} with a deliberately long title`,
          cookDate: `2026-09-${String((i % 27) + 1).padStart(2, "0")}`,
          isToday: false,
        })),
        portions: scope === "personal" ? [] : Array.from({ length: 20 }, (_, i) => ({
          memberId: `m-${i}`,
          visible: true,
          line: {
            firstName: `Member${i}`,
            note: "a serving note long enough to weigh on the budget",
            isMe: i === 0,
          },
        })),
        shopping: Array.from({ length: 200 }, (_, i) => ({
          term: `ingredient number ${i}`,
          quantity: `${i} g`,
        })),
        shoppingTruncated: true,
      } as unknown as HouseholdTurnContext;

      const block = householdContextBlock(obese);
      const rules = planHardRules({
        scope: obese.scope,
        window: obese.window,
        hasMinor: obese.roster.some((m) => m.ageState === "minor"),
      });
      for (const rule of rules) {
        assert(
          block.includes(rule),
          `${scope}/${window.state} OBÈSE — la réduction a mangé une règle:\n${
            rule.slice(0, 120)
          }…`,
        );
      }
    }
  }
});

Deno.test("P5 — la règle de l'hors-plan est TOUJOURS armée", () => {
  // ⛔ C'EST LA RÈGLE DU LOT, et elle n'a aucune condition: quelle que soit la
  // portée et quelle que soit la fenêtre, une réponse qui n'est pas dans les
  // lignes doit se NOMMER comme hors-plan. Sans elle, une substitution se lit
  // comme une consigne — et il n'existe alors aucun endroit où la personne la
  // retrouve: ni l'écran, ni la liste de courses, ni le bilan ne la connaissent.
  for (const scope of SCOPES) {
    for (const window of WINDOWS) {
      for (const hasMinor of [true, false]) {
        const rules = planHardRules({ scope, window, hasMinor });
        assertEquals(
          rules.filter((r) => r.includes("name it as off-plan")).length,
          1,
          `${scope}/${window.state}/minor:${hasMinor}: la règle hors-plan manque`,
        );
        assertEquals(
          rules.filter((r) => r.includes("never offer a modified version"))
            .length,
          1,
          `${scope}/${window.state}: rien n'interdit de proposer un plan modifié`,
        );
      }
    }
  }
});

Deno.test("P6 — la règle du PASSÉ n'existe QUE sur une fenêtre close", () => {
  // Une règle toujours armée ne discrimine rien: si « past tense » partait aussi
  // sur un plan en cours, le modèle parlerait au passé du dîner de ce soir.
  for (const scope of SCOPES) {
    const closed = planHardRules({
      scope,
      window: { state: "ended", endedOn: "2026-09-01" },
      hasMinor: false,
    });
    const open = planHardRules({
      scope,
      window: { state: "current" },
      hasMinor: false,
    });
    assertEquals(closed.filter((r) => r.includes("past tense")).length, 1);
    assertEquals(open.filter((r) => r.includes("past tense")).length, 0);
    assertEquals(closed.length, open.length + 1);
  }
});
