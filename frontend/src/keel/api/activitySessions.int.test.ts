import { beforeEach, expect, it, vi } from "vitest";

/**
 * L2b — LE LOG DE SÉANCE : SA LECTURE ET SON ÉCRITURE, GARDÉES.
 *
 * ── CE QUE CE FICHIER EXISTE POUR EMPÊCHER ─────────────────────────────────
 *
 * Le lot L2 a posé la table `student_activity_sessions` et l'a branchée sur le
 * bilan hebdomadaire — un consommateur dont le seul déclencheur comptait 270
 * exécutions et 270 échecs. Le lot L2b lui donne son consommateur vivant
 * (`/app/progress`) et sa surface de saisie. Les gardes ci-dessous couvrent les
 * trois cicatrices que ce chemin réveille, et rien d'autre.
 *
 * 1. **RLS NE REMPLACE PAS UN `.eq("user_id", …)`.** Les policies de la table
 *    sont propriétaire-seul, et le lecteur porte QUAND MÊME son filtre. Ce
 *    dépôt a déjà rendu la ligne d'un élève à un coach par cet oubli.
 * 2. **UNE ÉCRITURE QUI NE TOUCHE RIEN REND 204**, et l'écran dirait
 *    « enregistré ». Les deux modèles copiés sont `saveOwnProfile`
 *    (`onboarding.ts`) et `untickMeal` (`mealTicks.ts`).
 * 3. **UN TEST PARAMÉTRÉ PAR SA PROPRE CONSTANTE NE TESTE RIEN.** La
 *    vérification adversariale de L2 a mesuré exactement ça: porter
 *    `ACTIVITY_SESSION_MAX_MINUTES` de 600 à 6000 laissait les 3322 tests
 *    verts, parce que le seul cas qui la citait écrivait « borne + 1 ».
 *    ⚠️ CE TROU EST DÉJÀ FERMÉ CÔTÉ DENO — `activity_session_test.ts:264` lit
 *    la CHECK dans la MIGRATION SUR LE DISQUE, ce qui est la forme forte.
 *    Le cas d'ici n'est donc pas une redite gratuite: c'est le côté NAVIGATEUR
 *    qui a maintenant un lecteur de ces bornes (le `min`/`max` du champ de
 *    durée et le refus rendu à l'écran), et le mode d'échec propre à ce
 *    côté-là est qu'un écran accepte ce que la base refuse.
 *
 * ── LA FORME DU MOCK EST LA MOITIÉ DU TEST ────────────────────────────────
 *
 * Repris d'`ownActivityLevel.int.test.ts` et d'`ownBirthDate.int.test.ts`: le
 * faux PostgREST n'expose QUE les méthodes que ce module a le droit d'employer,
 * et il ENREGISTRE les filtres posés. Un mock permissif rendrait le même vert à
 * une lecture qui aurait perdu son `.eq("user_id", …)` — c'est-à-dire à une
 * lecture des séances de tout le monde.
 */

interface Recorded {
  table: string;
  op: "select" | "insert" | "delete";
  columns: string | null;
  /** Les `.eq()` / `.gte()` / `.lte()` posés, dans l'ordre. */
  filters: Array<{ op: string; column: string; value: unknown }>;
  payload: Record<string, unknown> | null;
}

let calls: Recorded[] = [];
/** Ce que le faux PostgREST rendra au PROCHAIN appel terminal. */
let reply: { data: unknown; error: { message: string } | null } = {
  data: [],
  error: null,
};

vi.mock("../../lib/supabase", () => {
  const build = (record: Recorded) => {
    const chain = {
      eq: (column: string, value: unknown) => {
        record.filters.push({ op: "eq", column, value });
        return chain;
      },
      gte: (column: string, value: unknown) => {
        record.filters.push({ op: "gte", column, value });
        return chain;
      },
      lte: (column: string, value: unknown) => {
        record.filters.push({ op: "lte", column, value });
        return chain;
      },
      order: async () => reply,
      select: async (columns: string) => {
        record.columns = columns;
        return reply;
      },
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: (columns: string) => {
          const record: Recorded = {
            table,
            op: "select",
            columns,
            filters: [],
            payload: null,
          };
          calls.push(record);
          return build(record);
        },
        insert: (payload: Record<string, unknown>) => {
          const record: Recorded = {
            table,
            op: "insert",
            columns: null,
            filters: [],
            payload,
          };
          calls.push(record);
          return build(record);
        },
        delete: () => {
          const record: Recorded = {
            table,
            op: "delete",
            columns: null,
            filters: [],
            payload: null,
          };
          calls.push(record);
          return build(record);
        },
      }),
      rpc: async () => {
        throw new Error("mock: activitySessions ne doit PAS passer par une RPC");
      },
    },
  };
});

const {
  deleteActivitySession,
  loadActivitySessions,
  logActivitySession,
  toSummaryInputs,
} = await import("./activitySessions");

const {
  ACTIVITY_SESSION_MAX_MINUTES,
  ACTIVITY_SESSION_MIN_MINUTES,
  renderWeekActivityFact,
  summarizeWeekActivity,
} = await import(
  "../../../../supabase/functions/_shared/keel/activity_session.ts"
);

const ME = "11111111-1111-1111-1111-111111111111";
const WEEK = [
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
  "2026-08-15",
  "2026-08-16",
  "2026-08-17",
  "2026-08-18",
];

beforeEach(() => {
  calls = [];
  reply = { data: [], error: null };
});

// ───────────────────────────────────────────────────────────────────────────
// 1. LA LECTURE
// ───────────────────────────────────────────────────────────────────────────

it("la lecture porte `.eq(user_id)` — RLS ne le remplace pas", async () => {
  reply = { data: [], error: null };
  await loadActivitySessions({ userId: ME, since: WEEK[0], until: WEEK[6] });

  expect(calls).toHaveLength(1);
  expect(calls[0].table).toBe("student_activity_sessions");
  // LE CŒUR. Sans ce filtre, le lecteur applicatif se repose sur RLS — et ce
  // dépôt a déjà rendu la ligne d'un élève à un coach exactement comme ça.
  expect(calls[0].filters).toContainEqual({ op: "eq", column: "user_id", value: ME });
});

it("la lecture est bornée DES DEUX CÔTÉS", async () => {
  await loadActivitySessions({ userId: ME, since: WEEK[0], until: WEEK[6] });

  // Un `.gte` seul laisserait entrer une ligne datée dans le futur: elle
  // compterait sans pouvoir s'afficher. C'est le défaut mesuré le 2026-08-05
  // sur les autres requêtes de cet écran.
  expect(calls[0].filters).toContainEqual({
    op: "gte",
    column: "local_date",
    value: WEEK[0],
  });
  expect(calls[0].filters).toContainEqual({
    op: "lte",
    column: "local_date",
    value: WEEK[6],
  });
});

it("la lecture rend les lignes, et JETTE quand PostgREST refuse", async () => {
  reply = {
    data: [{
      id: "s1",
      local_date: WEEK[1],
      kind: "cardio",
      duration_min: 40,
      intensity: "hard",
    }],
    error: null,
  };
  const rows = await loadActivitySessions({ userId: ME, since: WEEK[0], until: WEEK[6] });
  expect(rows).toHaveLength(1);
  expect(rows[0].kind).toBe("cardio");

  reply = { data: null, error: { message: "permission denied" } };
  await expect(
    loadActivitySessions({ userId: ME, since: WEEK[0], until: WEEK[6] }),
  ).rejects.toThrow(/permission denied/);
});

it("un jeton inconnu est ÉCARTÉ, jamais compté de travers", async () => {
  // La base a un CHECK; un jeton inconnu ne peut venir que d'une migration qui
  // aurait élargi la liste sans élargir le module. La ligne est écartée du
  // compte — et elle ne fait pas tomber l'écran.
  const inputs = toSummaryInputs([
    { id: "a", local_date: WEEK[0], kind: "strength", duration_min: 30, intensity: "easy" },
    { id: "b", local_date: WEEK[1], kind: "crossfit", duration_min: null, intensity: "brutal" },
  ]);
  expect(inputs[0].kind).toBe("strength");
  expect(inputs[0].intensity).toBe("easy");
  expect(inputs[1].kind).toBeNull();
  expect(inputs[1].intensity).toBeNull();
  expect(inputs[1].durationMin).toBeNull();
});

// ───────────────────────────────────────────────────────────────────────────
// 2. L'ÉCRITURE
// ───────────────────────────────────────────────────────────────────────────

it("le payload porte exactement ce qui a été déclaré, et `source: app`", async () => {
  reply = { data: [{ id: "new-1" }], error: null };
  const id = await logActivitySession({
    userId: ME,
    localDate: WEEK[3],
    kind: "strength",
    durationMin: 45,
    intensity: "moderate",
  });

  expect(id).toBe("new-1");
  expect(calls).toHaveLength(1);
  expect(calls[0].op).toBe("insert");
  expect(calls[0].table).toBe("student_activity_sessions");
  expect(calls[0].payload).toEqual({
    user_id: ME,
    local_date: WEEK[3],
    kind: "strength",
    duration_min: 45,
    intensity: "moderate",
    source: "app",
  });
  // ⚠️ LA CEINTURE: sans `.select(...)`, PostgREST rend 204 et l'écran dirait
  // « enregistré » sur une écriture partie nulle part.
  expect(calls[0].columns).toBe("id");
});

it("durée et intensité NON DÉCLARÉES partent en `null`, pas en valeur inventée", async () => {
  reply = { data: [{ id: "new-2" }], error: null };
  await logActivitySession({
    userId: ME,
    localDate: WEEK[3],
    kind: "daily_movement",
    durationMin: null,
    intensity: null,
  });

  // Les deux colonnes sont nullables POUR CETTE RAISON: déclarées, jamais
  // devinées. Un `0` ou une valeur « raisonnable » à la place d'une absence
  // détruirait le dénominateur `minutesFrom`.
  expect(calls[0].payload?.duration_min).toBeNull();
  expect(calls[0].payload?.intensity).toBeNull();
});

it("une écriture partie NULLE PART lève — elle ne rend pas un succès muet", async () => {
  // PostgREST rend 204 sur une écriture qui touche zéro ligne. Sans cette
  // ceinture, l'écran affiche « enregistré » sur un fait qui n'existe pas.
  reply = { data: [], error: null };
  await expect(
    logActivitySession({
      userId: ME,
      localDate: WEEK[3],
      kind: "cardio",
      durationMin: null,
      intensity: null,
    }),
  ).rejects.toThrow(/nothing was saved/);
});

it("une durée hors des bornes de la BASE est refusée AVANT la base", async () => {
  // Un écran qui accepterait ce que la base refuse ferait saisir dans le vide,
  // et l'erreur remontée serait un `23514` que personne ne sait lire.
  for (const bad of [0, -3, 601, 12.5]) {
    calls = [];
    reply = { data: [{ id: "x" }], error: null };
    await expect(
      logActivitySession({
        userId: ME,
        localDate: WEEK[3],
        kind: "cardio",
        durationMin: bad,
        intensity: null,
      }),
    ).rejects.toThrow(/outside/);
    // Et rien n'est parti: le refus précède l'écriture.
    expect(calls).toHaveLength(0);
  }
});

it("un `kind` hors vocabulaire est refusé, et rien ne part", async () => {
  calls = [];
  await expect(
    logActivitySession({
      userId: ME,
      localDate: WEEK[3],
      // Le type ne survit pas à un appelant qui reçoit une valeur d'un
      // `<select>`; le CHECK SQL, lui, refuserait — illisiblement.
      kind: "crossfit" as never,
      durationMin: null,
      intensity: null,
    }),
  ).rejects.toThrow(/unknown kind/);
  expect(calls).toHaveLength(0);
});

it("une date qui n'est pas un jour civil est refusée", async () => {
  calls = [];
  await expect(
    logActivitySession({
      userId: ME,
      localDate: "hier",
      kind: "cardio",
      durationMin: null,
      intensity: null,
    }),
  ).rejects.toThrow(/bad local date/);
  expect(calls).toHaveLength(0);
});

// ───────────────────────────────────────────────────────────────────────────
// 3. LE RETRAIT
// ───────────────────────────────────────────────────────────────────────────

it("le retrait porte `.eq(user_id)` ET `.eq(id)`, et compte ses lignes", async () => {
  reply = { data: [{ id: "s1" }], error: null };
  await deleteActivitySession({ userId: ME, id: "s1" });
  expect(calls[0].op).toBe("delete");
  expect(calls[0].filters).toContainEqual({ op: "eq", column: "user_id", value: ME });
  expect(calls[0].filters).toContainEqual({ op: "eq", column: "id", value: "s1" });
  expect(calls[0].columns).toBe("id");

  // Zéro ligne = la ligne n'était pas la sienne (ou n'existe plus). 204 muet
  // sinon, et la ligne réapparaîtrait au prochain chargement.
  reply = { data: [], error: null };
  await expect(deleteActivitySession({ userId: ME, id: "s1" }))
    .rejects.toThrow(/touched 0 rows/);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. CE QUE L'ÉCRAN AFFICHE — et les deux bornes, figées
// ───────────────────────────────────────────────────────────────────────────

it("ZÉRO SÉANCE NE S'IMPRIME JAMAIS, et `null` n'est pas zéro", async () => {
  // La porte de l'écran est CELLE DU MODULE, pas une seconde règle. Les deux
  // cas rendent `null` — et c'est ce qui interdit d'imprimer « 0 séance », que
  // le dépôt a déjà payé sous la forme « 0 des 5 jours que j'ai vus ».
  expect(renderWeekActivityFact(null)).toBeNull();
  expect(renderWeekActivityFact(summarizeWeekActivity([], WEEK))).toBeNull();

  const rows = toSummaryInputs([
    { id: "a", local_date: WEEK[1], kind: "cardio", duration_min: 30, intensity: "hard" },
    { id: "b", local_date: WEEK[1], kind: "mobility", duration_min: null, intensity: null },
    { id: "c", local_date: WEEK[4], kind: "strength", duration_min: 35, intensity: "easy" },
    // HORS FENÊTRE: comptée nulle part. Le compte doit borner la fenêtre qu'il
    // ANNONCE, sinon la carte porte un nombre que ses propres dates ne
    // justifient pas.
    { id: "d", local_date: "2026-08-04", kind: "cardio", duration_min: 20, intensity: "easy" },
  ]);
  const summary = summarizeWeekActivity(rows, WEEK);
  expect(summary.sessions).toBe(3);
  expect(summary.days).toBe(2);
  // La somme et SON DÉNOMINATEUR: 65 min déclarées sur 2 séances des 3.
  expect(summary.minutes).toBe(65);
  expect(summary.minutesFrom).toBe(2);
  expect(summary.byIntensity).toEqual({ easy: 1, moderate: 0, hard: 1, undeclared: 1 });
  expect(renderWeekActivityFact(summary)).not.toBeNull();
});

it("les deux bornes de minutes sont CELLES DU `CHECK` SQL, figées par leur littéral", () => {
  // ⚠️ CE CAS EXISTE PARCE QUE LA VÉRIFICATION ADVERSARIALE DE L2 A MESURÉ SON
  // ABSENCE: porter `ACTIVITY_SESSION_MAX_MINUTES` de 600 à 6000 laissait les
  // 3322 tests verts, parce que le seul cas qui citait la constante écrivait
  // « borne + 1 » — donc « borne + 1 » quelle que soit la borne.
  //
  // Le `CHECK` de `20260818180000_a_session_is_a_fact_not_an_energy.sql` est
  // `duration_min >= 1 and duration_min <= 600`, en littéraux figés en base.
  // Les faire diverger ferait accepter à l'écran ce que la base refuse.
  expect(ACTIVITY_SESSION_MIN_MINUTES).toBe(1);
  expect(ACTIVITY_SESSION_MAX_MINUTES).toBe(600);
});
