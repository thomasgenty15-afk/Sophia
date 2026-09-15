import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildHouseholdPromptBlocks,
  type HouseholdRestriction,
} from "./household_meal_generation.ts";
import { parseMemberAway, resolveWindowPresence } from "./household_presence.ts";

// ═══════════════════════════════════════════════════════════════════════════
// FF-A1 — LES FILS DE SÉCURITÉ DE LA LANE FOYER, TENUS PAR LE COMPORTEMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CE FICHIER REMPLACE, ET POURQUOI IL NE RESSEMBLE À AUCUN AUTRE.
//
// Les MOTEURS de sécurité de cette lane sont solides: 22 mutations de moteur,
// 22 rouges (régime, allergie, contamination croisée, condition médicale,
// grossesse, mineur). Ce ne sont pas eux qui manquaient. Ce qui manquait, ce
// sont les FILS — les POINTS D'APPEL qui portent le résultat du moteur
// jusqu'au message envoyé au modèle. Mesuré le 2026-08-23: sur 12 coupures au
// point d'appel, 10 ont laissé la suite ENTIÈREMENT VERTE — 4 419 épreuves,
// 0 échec.
//
// ⛔ ET DEUX DE CES FILS ÉTAIENT DÉJÀ « PROTÉGÉS », MAL.
// `dietary_regime_solo_lane_test.ts:442` et `household_regime_belt_test.ts:673`
// font un `assertStringIncludes` sur le TEXTE SOURCE de `index.ts`. La preuve
// que ça ne suffit pas tient en une phrase: couper `strictestRegimeAt(...)` en
// `strictestRegimeAt([])` désarme EXACTEMENT la hiérarchie que l'épingle
// prétend tenir — le littéral épinglé (`boxMemberDiets: members.map(...)`)
// reste intact, seul l'ARGUMENT change — et la suite passe VERTE.
//
// ⇒ AUCUNE ÉPREUVE DE CE FICHIER NE LIT UNE SOURCE. Chacune APPELLE la vraie
//   fonction avec de vraies entrées et asserte l'EFFET dans sa SORTIE:
//   le message réellement composé pour le modèle, et la trace réellement
//   écrite. Couper le fil ⇒ le texte disparaît ⇒ ROUGE.
//
// ── COMMENT ON APPELLE UNE FONCTION EDGE SANS RÉSEAU ET SANS GÉNÉRATION ────
//
// `generate-household-meal-v1/index.ts` n'exporte RIEN: il appelle
// `Deno.serve(handler)` au chargement. C'est précisément pour ça que tout le
// monde s'est rabattu sur la lecture de sa source. On ne s'y rabat pas ici:
//
//   · `Deno.serve` est remplacé LE TEMPS DU RUN — il ne lie aucun port, il
//     CAPTURE le handler;
//   · `globalThis.fetch` est remplacé LE TEMPS DU RUN — il joue PostgREST,
//     l'auth et le fournisseur de modèle. Aucun octet ne sort de ce processus,
//     et la suite tourne toujours sans `--allow-net`;
//   · l'appel modèle est REFUSÉ par le stub, et sa REQUÊTE est gardée: c'est
//     le prompt, capturé AVANT toute génération. RIEN N'EST GÉNÉRÉ, et rien
//     n'est écrit en base (`intent: "draft"` n'écrit aucune ligne).
//
// ⚠️ TOUT EST RESTAURÉ EN `finally`. `deno test` charge tous les fichiers de
// ce répertoire dans LE MÊME processus: un `globalThis.fetch` laissé en place,
// un `console.log` avalé ou une variable d'environnement semée empoisonneraient
// 4 419 épreuves voisines, et le poison ressemblerait à un bug ailleurs.
//
// ⚠️ `setTimeout` EST RAMENÉ À ZÉRO PENDANT LE RUN. Le stub refuse l'appel
// modèle; la chaîne de repli réessaie derrière des pauses. On ne mesure pas la
// patience de la chaîne de repli ici — sans ce clamp, chaque run coûte 85 s.

// ---------------------------------------------------------------------------
// LE BANC — un vrai handler, de vraies lignes, aucune sortie réseau
// ---------------------------------------------------------------------------

/** Une bouche du roster, telle que `keel_household_roster_for` la rend. */
interface BenchMouth {
  member_id: string;
  user_id: string | null;
  first_name: string;
  age_state: string;
  role: string;
  goal: string | null;
  /** Le régime déclaré, déjà tranché en base (R2). `null` = personne n'a dit. */
  diet: string | null;
}

interface BenchHousehold {
  mouths: BenchMouth[];
  /** Lignes de `household_member_allergies` — les bouches SANS compte. */
  allergies: Array<{ id: string; member_id: string; label: string }>;
  /** Lignes de `student_safety_constraints`, par `user_id`. */
  constraints: Record<string, Array<Record<string, unknown>>>;
}

interface BenchRun {
  status: number;
  /** Le message utilisateur RÉELLEMENT envoyé au modèle, au premier appel. */
  userMessage: string;
  /** Le prompt système RÉELLEMENT envoyé au modèle, au premier appel. */
  systemMessage: string;
  /** Les lignes de trace RÉELLEMENT écrites par ce run. */
  logs: string[];
}

const BENCH_SUPABASE_URL = "http://127.0.0.1:65432";

/** Les deux bouches nominales: un titulaire, une bouche sans compte. */
function twoMouths(over: Partial<BenchMouth>[] = []): BenchMouth[] {
  const base: BenchMouth[] = [
    {
      member_id: "m-1",
      user_id: "u-owner",
      first_name: "Ana",
      age_state: "adult",
      role: "owner",
      goal: "maintenance",
      diet: null,
    },
    {
      member_id: "m-2",
      user_id: null,
      first_name: "Bo",
      age_state: "adult",
      role: "member",
      goal: "maintenance",
      diet: null,
    },
  ];
  return base.map((m, i) => ({ ...m, ...(over[i] ?? {}) }));
}

/** Une ligne `student_safety_constraints` de condition déclarée. */
function conditionRow(userId: string, conditionRef: string) {
  return {
    id: `sc-${conditionRef}`,
    user_id: userId,
    kind: "condition",
    allergen_ref: null,
    substance_ref: null,
    medication_class: null,
    condition_ref: conditionRef,
    diet_ref: null,
    severity: "medical",
    declared_by: "student",
    notes: null,
    content_locale: "en-GB",
  };
}

// Le handler, capturé une seule fois: `index.ts` s'auto-enregistre au
// chargement, et un module ne se recharge pas.
let capturedHandler: ((req: Request) => Promise<Response>) | null = null;

// deno-lint-ignore no-explicit-any
const anyDeno = Deno as any;

async function runHouseholdLane(house: BenchHousehold): Promise<BenchRun> {
  const prompts: string[] = [];
  const logs: string[] = [];

  const savedEnv = new Map<string, string | undefined>();
  const setEnv = (k: string, v: string) => {
    savedEnv.set(k, Deno.env.get(k));
    Deno.env.set(k, v);
  };

  const origServe = anyDeno.serve;
  const origFetch = globalThis.fetch;
  const origLog = console.log;
  const origWarn = console.warn;
  const origSetTimeout = globalThis.setTimeout;

  try {
    setEnv("SUPABASE_URL", BENCH_SUPABASE_URL);
    setEnv("SUPABASE_ANON_KEY", "bench-anon");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", "bench-service");
    setEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173");
    setEnv("OPENAI_API_KEY", "bench-key");

    anyDeno.serve = (h: unknown) => {
      capturedHandler = h as (req: Request) => Promise<Response>;
      return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
    };

    const json = (value: unknown, status = 200): Response =>
      new Response(JSON.stringify(value), {
        status,
        headers: {
          "content-type": "application/json",
          "content-range": "0-0/*",
        },
      });

    // deno-lint-ignore no-explicit-any
    globalThis.fetch = (async (input: any, init?: any): Promise<Response> => {
      const url = typeof input === "string"
        ? input
        : (input?.url ?? String(input));
      let body = "";
      try {
        body = init?.body ? String(init.body) : "";
      } catch { /* un corps illisible n'est pas un prompt */ }

      // ⛔ TOUT CE QUI NE VA PAS À POSTGREST EST L'APPEL MODÈLE. On garde sa
      //    requête — c'est le prompt — et on REFUSE. Aucune génération.
      if (!url.startsWith(BENCH_SUPABASE_URL)) {
        prompts.push(body);
        return json({
          error: { message: "bench: no generation", type: "invalid_request_error" },
        }, 400);
      }

      const path = url.slice(BENCH_SUPABASE_URL.length);
      if (path.startsWith("/auth/v1/user")) {
        return json({ id: "u-owner", aud: "authenticated", email: "o@bench.tld" });
      }
      const matched = /^\/rest\/v1\/(rpc\/)?([a-z0-9_]+)/.exec(path);
      const name = matched
        ? (matched[1] ? `rpc:${matched[2]}` : matched[2])
        : "";

      switch (name) {
        case "household_members":
          return json([{ household_id: "h-bench", role: "owner" }]);
        case "rpc:keel_household_is_covered":
          return json(true);
        case "rpc:keel_household_roster_for":
          return json(house.mouths.map((m) => ({
            ...m,
            away_days: [],
            own_plans: [],
            eating_rhythm: null,
          })));
        case "profiles":
          return json([{
            id: "u-owner",
            timezone: "Europe/Paris",
            country: "FR",
            locale: "en-GB",
            birth_date: "1990-03-04",
            height_cm: 168,
            gender: "female",
            activity_level: "moderate",
          }]);
        case "student_goals":
          if (/select=goal(&|$)/.test(path)) return json([{ goal: "maintenance" }]);
          return json([{
            user_id: "u-owner",
            goal: "maintenance",
            situation: "I cook for my household.",
            practical_constraints: {
              cook_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
              cooking_time_min: "30_60",
            },
            content_locale: "en-GB",
          }]);
        case "households":
          return json([{ id: "h-bench", content_locale: "en-GB" }]);
        case "coach_clients":
          return json([{ coach_id: "c-bench" }]);
        case "household_member_allergies":
          return json(house.allergies);
        case "student_safety_constraints": {
          const who = /user_id=eq\.([^&]+)/.exec(path);
          const uid = who ? decodeURIComponent(who[1]) : "";
          return json(house.constraints[uid] ?? []);
        }
        case "household_member_bodies":
          return json([{
            member_id: "m-2",
            height_cm: 180,
            weight_kg: 75,
            gender: "male",
          }]);
        case "student_body_measures":
          return json([{
            local_date: "2026-08-20",
            kind: "weight",
            value_si: 62,
            measured_at: "2026-08-20T07:00:00Z",
          }]);
        default:
          // Tout le reste du foyer est VIDE, et c'est voulu: ce banc mesure
          // les fils de SÉCURITÉ, pas la richesse d'un foyer.
          return json([]);
      }
      // deno-lint-ignore no-explicit-any
    }) as any;

    const capture = (...parts: unknown[]) => {
      logs.push(
        parts.map((p) => typeof p === "string" ? p : JSON.stringify(p)).join(" "),
      );
    };
    console.log = capture;
    console.warn = capture;
    // deno-lint-ignore no-explicit-any
    globalThis.setTimeout = ((cb: any, _ms?: number, ...rest: any[]) =>
      // deno-lint-ignore no-explicit-any
      origSetTimeout(cb, 0, ...rest)) as any;

    if (capturedHandler === null) {
      await import("../../generate-household-meal-v1/index.ts");
    }
    assert(capturedHandler !== null, "le handler de la lane foyer n'a pas été capturé");

    const res = await capturedHandler(
      new Request("http://bench.local/generate-household-meal-v1", {
        method: "POST",
        headers: {
          Authorization: "Bearer bench",
          "content-type": "application/json",
          Origin: "http://localhost:5173",
        },
        // `draft` N'ÉCRIT RIEN. Le banc compose, il ne publie pas.
        body: JSON.stringify({ intent: "draft", window: { kind: "days", count: 2 } }),
      }),
    );
    await res.text();

    assert(prompts.length > 0, "aucun appel modèle: le prompt n'a jamais été composé");
    const first = JSON.parse(prompts[0]) as {
      input?: string;
      instructions?: string;
    };
    return {
      status: res.status,
      userMessage: String(first.input ?? ""),
      systemMessage: String(first.instructions ?? ""),
      logs,
    };
  } finally {
    anyDeno.serve = origServe;
    globalThis.fetch = origFetch;
    console.log = origLog;
    console.warn = origWarn;
    globalThis.setTimeout = origSetTimeout;
    for (const [k, v] of savedEnv) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

/** La ligne de trace portant ce tag, telle qu'elle a été écrite. */
function traceLine(run: BenchRun, tag: string): Record<string, unknown> {
  const line = run.logs.find((l) => l.includes(`"tag":"${tag}"`));
  assert(line !== undefined, `aucune trace \`${tag}\` dans ce run`);
  return JSON.parse(line) as Record<string, unknown>;
}

const bench = { sanitizeOps: false, sanitizeResources: false } as const;

// ---------------------------------------------------------------------------
// W10 — L'UNION DES ALLERGIES DU FOYER ATTEINT LE MESSAGE
// ---------------------------------------------------------------------------
//
// LE FIL: `index.ts:2371`, l'argument `allergies:` de `householdHardConstraints`.
// Coupé (`allergies: []`), l'union est vide: AUCUNE allergie du foyer n'atteint
// ni le prompt ni la ceinture. Le moteur, lui, va très bien — c'est tout le
// problème, et c'est ce qu'une épreuve de moteur ne peut pas voir.

Deno.test({
  name: "FF-A1 · W10 — l'allergie d'une bouche SANS COMPTE atteint le message",
  ...bench,
  fn: async () => {
    const run = await runHouseholdLane({
      mouths: twoMouths(),
      // Bo n'a pas de compte: sa ligne ne vit que dans
      // `household_member_allergies`, et c'est la population que ce fil sert.
      allergies: [{ id: "al-1", member_id: "m-2", label: "peanut" }],
      constraints: {},
    });
    // L'ALIMENT, ET LA BOUCHE QUI LE PORTE. « peanut » seul resterait vert si
    // la ligne partait détachée de son prénom — le défaut mesuré sur F1/F2.
    assertStringIncludes(run.userMessage, "Bo");
    assertStringIncludes(run.userMessage, "peanut");
    assertStringIncludes(run.userMessage, "severity=medical");
    // ET LA TRACE COMPTE CE QU'ELLE A ENVOYÉ, sinon un fil coupé et un foyer
    // sans allergie rendent le même journal.
    assertEquals(traceLine(run, "keel.household_meal.constraint_attribution").declared, 1);
  },
});

Deno.test({
  name: "FF-A1 · W10 — LE CAS QUI PASSE: sans allergie, aucun bloc d'allergène",
  ...bench,
  fn: async () => {
    const run = await runHouseholdLane({
      mouths: twoMouths(),
      allergies: [],
      constraints: {},
    });
    assert(
      !run.userMessage.includes("severity=medical"),
      "un foyer sans contrainte reçoit un bloc de contrainte",
    );
    assert(
      !run.userMessage.includes("peanut"),
      "le banc lui-même fabrique l'allergène qu'il croit mesurer",
    );
  },
});

// ---------------------------------------------------------------------------
// W1 — LA HIÉRARCHIE DE RÉGIME DE LA TABLE ATTEINT LE MESSAGE
// ---------------------------------------------------------------------------
//
// LE FIL: `index.ts:3436`, l'argument de `strictestRegimeAt`. Coupé
// (`strictestRegimeAt([])`), TOUTE la hiérarchie de régime du foyer devient
// `null`: la casserole commune cesse de suivre le plus restrictif de la table.
//
// ⛔ C'EST LA COUPURE QUI DISQUALIFIE L'ÉPINGLE DE CHAÎNE. Les deux épingles
//    existantes cherchent `boxMemberDiets: members.map((m) => ({` et
//    `regime: m.diet,` dans la source: les deux littéraux sont INTACTS sous
//    cette coupure, et la suite reste verte.

Deno.test({
  name: "FF-A1 · W1 — le régime le plus strict de la table atteint le message",
  ...bench,
  fn: async () => {
    const run = await runHouseholdLane({
      // Une seule bouche végane à une table de deux: la casserole descend
      // pour elle (D6, « une casserole peut toujours en donner moins »).
      mouths: twoMouths([{}, { diet: "vegan" }]),
      allergies: [],
      constraints: {},
    });
    assertStringIncludes(run.userMessage, "VEGAN");
    // ET LE CRAN EST NOMMÉ DANS LA TRACE: un plan qui sert de la viande à une
    // table végane et un plan correct ne doivent pas rendre le même journal.
    assertEquals(
      traceLine(run, "keel.household_meal.cooking_shape").strictest_regime,
      "vegan",
    );
  },
});

Deno.test({
  name: "FF-A1 · W1 — LE CAS QUI PASSE: aucun régime déclaré, pas un octet",
  ...bench,
  fn: async () => {
    const run = await runHouseholdLane({
      mouths: twoMouths(),
      allergies: [],
      constraints: {},
    });
    assert(
      !run.userMessage.includes("VEGAN"),
      "un foyer sans régime déclaré reçoit une consigne de régime",
    );
    assertEquals(
      traceLine(run, "keel.household_meal.cooking_shape").strictest_regime,
      null,
    );
  },
});

// ---------------------------------------------------------------------------
// W4 & W5 — L'ÉVICTION LISTERIA SORT, ET POUR LA BOUCHE ENCEINTE SEULE
// ---------------------------------------------------------------------------
//
// DEUX FILS, UN SEUL EFFET VISIBLE, ET C'EST VOULU:
//   · W5 (`index.ts:2475`) — la bouche n'est JAMAIS classée enceinte;
//   · W4 (`index.ts:2492`) — le suffixe est vidé après coup.
// Chacun, seul, fait disparaître le bloc du message. Une épreuve qui n'assertait
// que la population manquerait W4; une qui n'assertait que le suffixe manquerait
// W5. On asserte le TEXTE RENDU, qui est ce que le modèle reçoit.

Deno.test({
  name: "FF-A1 · W4+W5 — le bloc listeria sort pour la bouche enceinte, nommée",
  ...bench,
  fn: async () => {
    const run = await runHouseholdLane({
      mouths: twoMouths(),
      allergies: [],
      constraints: { "u-owner": [conditionRow("u-owner", "pregnancy")] },
    });
    // NOMMÉE, et pas « quelqu'un à cette table »: le bloc gouverne UNE
    // assiette, pas la casserole. Un bloc anonyme retirerait le fromage à
    // toute la maison, ou à personne.
    assertStringIncludes(run.userMessage, "LEAVE THESE OFF Ana's PLATE, AND ONLY THEIRS");
    assertStringIncludes(run.userMessage, "listeria");
    assertStringIncludes(run.userMessage, "raw cured charcuterie");
  },
});

Deno.test({
  name: "FF-A1 · W4+W5 — LE CAS QUI PASSE: aucune grossesse, aucun bloc listeria",
  ...bench,
  fn: async () => {
    const run = await runHouseholdLane({
      mouths: twoMouths(),
      allergies: [],
      constraints: {},
    });
    assert(
      !run.userMessage.includes("listeria"),
      "le bloc de grossesse sort sur un foyer qui n'en a pas déclaré",
    );
  },
});

Deno.test({
  name: "FF-A1 · W4+W5 — L'ALLAITEMENT NE REÇOIT PAS L'ÉVICTION",
  ...bench,
  fn: async () => {
    // Le second cas qui passe, et il tient la BORNE du fil: `evictsPregnancyFoods`
    // sépare les deux populations. Une coupure qui élargirait la garde à
    // `breastfeeding` passerait les deux épreuves du dessus.
    const run = await runHouseholdLane({
      mouths: twoMouths(),
      allergies: [],
      constraints: { "u-owner": [conditionRow("u-owner", "breastfeeding")] },
    });
    assert(
      !run.userMessage.includes("listeria"),
      "l'éviction de grossesse sort sur une bouche qui allaite",
    );
    assertEquals(traceLine(run, "keel.household_meal.condition_gate").breastfeeding, 1);
  },
});

// ---------------------------------------------------------------------------
// W11 — LE COMPTEUR `condition_gate` COMPTE LA VRAIE POPULATION
// ---------------------------------------------------------------------------
//
// LE FIL: `index.ts:2474`, `conditionGate[population]++`. Coupé
// (`conditionGate["none"]++`), le compteur écrit toujours `none`: « quatre
// personnes ont une condition et la garde les laisse passer » et « personne
// n'a rien déclaré » deviennent le même journal. Un compteur qui ment est pire
// qu'une absence de compteur: il fait croire la garde mesurée.

Deno.test({
  name: "FF-A1 · W11 — le compteur `condition_gate` compte la bouche enceinte",
  ...bench,
  fn: async () => {
    const run = await runHouseholdLane({
      mouths: twoMouths(),
      allergies: [],
      constraints: { "u-owner": [conditionRow("u-owner", "pregnancy")] },
    });
    const gate = traceLine(run, "keel.household_meal.condition_gate");
    assertEquals(gate.pregnancy, 1);
    // ET L'AUTRE BOUCHE RESTE `none`: c'est la colonne qui prouve que le
    // compteur NE MORD PAS TROP LARGE.
    assertEquals(gate.none, 1);
    assertEquals(gate.breastfeeding, 0);
    assertEquals(gate.other, 0);
  },
});

Deno.test({
  name: "FF-A1 · W11 — LE CAS QUI PASSE: rien de déclaré, deux `none` et zéro ailleurs",
  ...bench,
  fn: async () => {
    const run = await runHouseholdLane({
      mouths: twoMouths(),
      allergies: [],
      constraints: {},
    });
    const gate = traceLine(run, "keel.household_meal.condition_gate");
    assertEquals(gate.none, 2);
    assertEquals(gate.pregnancy, 0);
  },
});

// ---------------------------------------------------------------------------
// W7 — LE BLOC DE CONTAMINATION CROISÉE EST DANS LE PROMPT, PAS DANS UN OBJET
// ---------------------------------------------------------------------------
//
// LE FIL: `household_meal_generation.ts:1962`, `crossContact.block` dans
// `parts`. Coupé, le bloc est CALCULÉ (sa trace dit `emitted: true`) puis JETÉ:
// le compteur reste honnête, le modèle ne lit rien, et rien n'échoue.
//
// ⛔ C'EST POURQUOI ON N'ASSERTE PAS `outcome.emitted`. La trace et le texte
//    sortent du même objet EXPRÈS; asserter la trace laisserait exactement
//    cette coupure passer. On asserte le TEXTE, dans le suffixe rendu.

const W7_PRESENCE = resolveWindowPresence({
  members: [
    { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([]) },
    { memberId: "m-kid", displayName: "Léa", away: parseMemberAway([]) },
  ],
  rhythm: [
    { slot: "breakfast", size: null },
    { slot: "lunch", size: null },
    { slot: "dinner", size: null },
  ],
  windowDays: ["mon", "tue"],
});

function w7Blocks(over: {
  medicalMouths?: Array<{ memberId: string; displayName: string }>;
  dishBearers?: Array<{ memberId: string; displayName: string }>;
}) {
  const restrictions: HouseholdRestriction[] = [];
  return buildHouseholdPromptBlocks({
    ruleHolders: [],
    traditions: [],
    daysInWindow: ["mon", "tue"],
    members: [
      {
        memberId: "m-dad",
        displayName: "Marc",
        goal: "maintenance",
        ageState: "adult",
        body: null,
        eatingSlots: null,
        habits: [],
        habitNote: null,
      },
      {
        memberId: "m-kid",
        displayName: "Léa",
        goal: null,
        ageState: "minor",
        body: null,
        eatingSlots: null,
        habits: [],
        habitNote: null,
      },
    ],
    envyLine: null,
    restrictions,
    presence: W7_PRESENCE,
    merge: null,
    cooking: "one_session",
    divergingCount: 1,
    weightGroups: 2,
    dishBearers: over.dishBearers ?? [],
    dedicatedDishesAsked: over.dishBearers ? over.dishBearers.length : 0,
    medicalMouths: over.medicalMouths ?? [],
    crossContactUnnamedMedical: 0,
    kitchenEquipment: null,
    unmerge: null,
    dietBlock: "",
    notes: [],
    voices: [],
  });
}

Deno.test("FF-A1 · W7 — le bloc de contamination croisée est DANS le message rendu", () => {
  const { userSuffix } = w7Blocks({
    medicalMouths: [{ memberId: "m-kid", displayName: "Léa" }],
    dishBearers: [{ memberId: "m-dad", displayName: "Marc" }],
  });
  assertStringIncludes(userSuffix, "== THE SAME KITCHEN, TWO DISHES ==");
  // LA BOUCHE À RISQUE ET LA SECONDE POÊLE, toutes deux nommées: un bloc qui
  // sortirait sans les deux noms ne dit à personne quel plat se fait en premier.
  assertStringIncludes(userSuffix, "Léa");
  assertStringIncludes(userSuffix, "Marc");
  assertStringIncludes(userSuffix, "one serving spoon per dish");
});

Deno.test("FF-A1 · W7 — LE CAS QUI PASSE: une seule prémisse, pas un octet", () => {
  // Sans médical: rien.
  assert(
    !w7Blocks({ dishBearers: [{ memberId: "m-dad", displayName: "Marc" }] })
      .userSuffix.includes("THE SAME KITCHEN"),
    "le bloc sort sans la moindre contrainte médicale à cette table",
  );
  // Sans second plat: rien non plus — il n'y a alors qu'une poêle.
  assert(
    !w7Blocks({ medicalMouths: [{ memberId: "m-kid", displayName: "Léa" }] })
      .userSuffix.includes("THE SAME KITCHEN"),
    "le bloc sort sur un plan qui ne promet aucun second plat",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ W12 — LE FIL QUE CE LOT NE TIENT PAS, ET IL FAUT LE LIRE
// ═══════════════════════════════════════════════════════════════════════════
//
// LE FIL: `index.ts:2797`, l'argument population de `goalUnderConditionGate`.
// Coupé (`"none"`), un objectif de perte passe SOUS GROSSESSE.
//
// ⛔ AUCUNE ÉPREUVE DE CE FICHIER NE LE TIENT, ET CE N'EST PAS UN OUBLI.
// Mesuré sur ce banc le 2026-08-23, foyer identique, grossesse contre pas de
// grossesse, `goal: fat_loss` des deux côtés: les deux prompts sont
// RIGOUREUSEMENT identiques hors les blocs de grossesse eux-mêmes (W4/W5), et
// les deux traces d'avant-génération le sont aussi. La coercition ne nourrit
// que `envelopeFor`, et l'enveloppe ne gouverne le GRAMME qu'APRÈS la réponse
// du modèle. Il n'existe aucune sortie d'avant-génération qui la porte.
//
// ⚠️ ET LA MESURE A TROUVÉ PIRE QUE L'ABSENCE DE GARDE. Sur le foyer enceint,
// la ligne de part écrite au modèle reste, MOT POUR MOT:
//     `- Ana: generous vegetables, full protein share, smaller starch share`
// c'est-à-dire la forme de `fat_loss`, NON COERCÉE. La consigne visible dit
// donc à un modèle de restreindre l'amidon d'une femme enceinte, pendant que
// la coercition, invisible, agit ailleurs. Fiche:
// `docs/keel/fiches/` — voir le rapport du lot FF-A1.
//
// Tenir W12 par le comportement demande de piloter l'étape D'APRÈS la
// génération (pesée, ancrage), donc de fabriquer un plan entier valide. C'est
// un lot à part, et il n'est pas celui-ci. LE SEUIL DE FF-A1 EST DONC MANQUÉ:
// 6 fils sur 7.
