/**
 * A8.0 (2026-09-03) — L'AUDIENCE DU SOIR, ET CE QUI LA DÉFINIT.
 *
 * ══ LE DÉFAUT QUE CES ÉPREUVES FERMENT ═══════════════════════════════════
 *
 * `keel-daily-pulse-v1` balayait `profiles where keel_role = 'student'`. Un
 * profil RÉCLAMÉ porte `keel_role = NULL` — exprès (FF-048 R14: ce rôle décrit
 * une relation avec un coach qui n'existe pas). Le membre n'entrait donc
 * JAMAIS dans l'audience, et toute la bifurcation maître/membre de la bande du
 * soir (`respondsForHousehold`, `masterOnly`) était un lecteur sans écrivain.
 *
 * ══ LA RÉPARATION QU'ON REFUSE, ET C'EST ELLE QUE CES ÉPREUVES TIENNENT ══
 *
 * Écrire `keel_role = 'student'` sur un membre le ferait entrer dans
 * l'audience en une ligne — et en dix autres endroits qui ne l'attendent pas
 * (`/app/today`, les crons hebdo, la synthèse coach). L'audience s'élargit, le
 * rôle ne ment pas: la seconde requête ne porte JAMAIS `keel_role`. Une épingle
 * textuelle sur ce nom ne suffirait pas — ces épreuves exécutent le lecteur et
 * LISENT les filtres qu'il a posés.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  audiencesFrom,
  loadAudiencePage,
  parsePulseAudience,
  PULSE_AUDIENCES,
} from "./pulse_audience.ts";

const STUDENT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const MEMBER_B = "33333333-3333-4333-8333-333333333333";
/** Un élève qui a AUSSI rejoint un foyer: servi en phase 1, écarté en phase 2. */
const BOTH = "44444444-4444-4444-8444-444444444444";

interface SeenQuery {
  table: string;
  filters: Array<[string, string, unknown]>;
}

function recordingDb(rows: (q: SeenQuery) => Record<string, unknown>[]) {
  const seen: SeenQuery[] = [];
  const from = (table: string) => {
    const q: SeenQuery = { table, filters: [] };
    seen.push(q);
    // deno-lint-ignore no-explicit-any
    const b: any = {};
    for (const m of ["select", "order", "limit"]) b[m] = () => b;
    for (const m of ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike"]) {
      b[m] = (col: string, v?: unknown) => {
        q.filters.push([m, col, v]);
        return b;
      };
    }
    b.not = (col: string, op?: unknown, v?: unknown) => {
      q.filters.push(["not", col, `${op} ${v}`]);
      return b;
    };
    // deno-lint-ignore no-explicit-any
    b.then = (res: any, rej: any) =>
      Promise.resolve({ data: rows(q), error: null }).then(res, rej);
    return b;
  };
  return { db: { from }, seen };
}

function filterValue(q: SeenQuery, column: string): unknown {
  return q.filters.find(([, col]) => col === column)?.[2];
}

function profile(id: string, keelRole: string | null) {
  return {
    id,
    timezone: "Europe/Paris",
    proactive_muted_at: null,
    full_name: "X",
    locale: "fr-FR",
    birth_date: null,
    keel_role: keelRole,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// L'ORDRE, ET LE CURSEUR QUI PORTE SA PHASE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("⛔ LES MAÎTRES AVANT LES MEMBRES — l'ordre EST le produit", () => {
  // FF-061 §11: la cuisson que le maître déclare ratée à 20h05 doit amputer la
  // bande ③ du conjoint servie à 20h06. Inverser cet ordre ne casse aucune
  // épreuve de contenu — il fait juste servir au membre un plat que personne
  // n'a cuisiné, un soir sur deux. D'où une épreuve sur l'ORDRE lui-même.
  assertEquals([...PULSE_AUDIENCES], ["students", "members"]);
  assertEquals([...audiencesFrom("students")], ["students", "members"]);
  assertEquals(
    [...audiencesFrom("members")],
    ["members"],
    "reprendre en phase 2 ne rejoue PAS la phase 1: un second message partirait " +
      "au même élève dans le même tick",
  );
});

Deno.test("le curseur porte sa phase, et un mot inconnu retombe sur les élèves", () => {
  assertEquals(parsePulseAudience("members"), "members");
  assertEquals(parsePulseAudience(" members "), "members");
  assertEquals(parsePulseAudience("students"), "students");
  // Un appelant d'AVANT ce lot ne passe rien: il doit repartir des élèves,
  // comme il l'a toujours fait.
  assertEquals(parsePulseAudience(undefined), "students");
  assertEquals(parsePulseAudience(null), "students");
  assertEquals(parsePulseAudience("MEMBERS"), "students");
  assertEquals(parsePulseAudience(42), "students");
});

// ───────────────────────────────────────────────────────────────────────────
// CE QUI DÉFINIT CHAQUE AUDIENCE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("phase 1 — les élèves, par le rôle, inchangée", () => {
  const { db, seen } = recordingDb(() => [profile(STUDENT, "student")]);
  return loadAudiencePage(db, { audience: "students", afterUserId: "", page: 50 })
    .then((page) => {
      assertEquals(page.rows.map((r) => r.id), [STUDENT]);
      assertEquals(page.cursorEnd, STUDENT);
      const q = seen.find((s) => s.table === "profiles")!;
      assertEquals(filterValue(q, "keel_role"), "student");
      assertEquals(seen.some((s) => s.table === "household_members"), false);
    });
});

Deno.test(
  "⛔ phase 2 — l'APPARTENANCE définit l'audience, JAMAIS `keel_role`",
  async () => {
    const { db, seen } = recordingDb((q) =>
      q.table === "household_members"
        ? [{ user_id: MEMBER }, { user_id: MEMBER_B }]
        : [profile(MEMBER, null), profile(MEMBER_B, null)]
    );
    const page = await loadAudiencePage(db, {
      audience: "members",
      afterUserId: "",
      page: 50,
    });
    assertEquals(page.rows.map((r) => r.id), [MEMBER, MEMBER_B]);

    const membership = seen.find((s) => s.table === "household_members")!;
    assertEquals(filterValue(membership, "role"), "member");
    assertEquals(
      filterValue(membership, "user_id"),
      "is null",
      "`user_id is not null` EST la définition de « réclamé » (FF-048 R1: la " +
        "ligne existe avant le compte)",
    );

    // ── LA GARDE DU LOT ──────────────────────────────────────────────────
    // MUTATION QUI DOIT ROUGIR: ajouter `.eq("keel_role", …)` à la requête
    // d'appartenance, ou filtrer les profils dessus au lieu de les écarter.
    for (const q of seen) {
      assert(
        filterValue(q, "keel_role") === undefined,
        `phase 2: un filtre \`keel_role\` sur \`${q.table}\` referait le défaut ` +
          `exact que ce lot ferme — un membre porte NULL, exprès.`,
      );
    }
  },
);

Deno.test("un élève QUI A REJOINT un foyer n'est pas servi deux fois", async () => {
  // Il a été servi en phase 1. Le compter en phase 2 lui enverrait un second
  // message le même soir — `wasPulseSentToday` l'arrêterait, mais un repli
  // silencieux n'est pas une règle: on l'écarte, et on le COMPTE.
  const { db } = recordingDb((q) =>
    q.table === "household_members"
      ? [{ user_id: BOTH }, { user_id: MEMBER }]
      : [profile(BOTH, "student"), profile(MEMBER, null)]
  );
  const page = await loadAudiencePage(db, {
    audience: "members",
    afterUserId: "",
    page: 50,
  });
  assertEquals(page.rows.map((r) => r.id), [MEMBER]);
  assertEquals(page.skippedAlreadyStudent, 1);
});

Deno.test("⛔ LE CURSEUR AVANCE SUR CE QUI EST PARCOURU, pas sur ce qui est servi", async () => {
  // Toute la page est écartée (tous déjà élèves). Si le curseur restait au
  // dernier SERVI — c'est-à-dire nulle part — la même page se relirait à
  // l'infini et le tick brûlerait son budget sans envoyer un message.
  const { db } = recordingDb((q) =>
    q.table === "household_members"
      ? [{ user_id: MEMBER }, { user_id: BOTH }]
      : [profile(MEMBER, "student"), profile(BOTH, "student")]
  );
  const page = await loadAudiencePage(db, {
    audience: "members",
    afterUserId: "",
    page: 50,
  });
  assertEquals(page.rows, []);
  assertEquals(page.skippedAlreadyStudent, 2);
  assertEquals(
    page.cursorEnd,
    BOTH,
    "page entièrement écartée: le curseur doit quand même dépasser la page",
  );
});

Deno.test("plus aucune ligne d'appartenance ⇒ `cursorEnd` null ⇒ la phase se ferme", async () => {
  const { db, seen } = recordingDb(() => []);
  const page = await loadAudiencePage(db, {
    audience: "members",
    afterUserId: MEMBER,
    page: 50,
  });
  assertEquals(page, { rows: [], cursorEnd: null, skippedAlreadyStudent: 0 });
  assertEquals(
    filterValue(seen[0], "user_id"),
    "is null",
    "le curseur `gt` ne remplace pas le prédicat `user_id is not null`",
  );
  assert(
    seen[0].filters.some(([op, col, v]) => op === "gt" && col === "user_id" && v === MEMBER),
    "la reprise pagine bien sur `user_id`",
  );
});

Deno.test("une ligne d'appartenance SANS profil lisible est sautée, sans jeter", async () => {
  // Une bouche dont le compte a été supprimé de `profiles` mais dont la ligne
  // porte encore `user_id`: on n'a ni fuseau ni langue pour lui écrire.
  const { db } = recordingDb((q) =>
    q.table === "household_members"
      ? [{ user_id: MEMBER }, { user_id: MEMBER_B }]
      : [profile(MEMBER_B, null)]
  );
  const page = await loadAudiencePage(db, {
    audience: "members",
    afterUserId: "",
    page: 50,
  });
  assertEquals(page.rows.map((r) => r.id), [MEMBER_B]);
  assertEquals(page.cursorEnd, MEMBER_B);
});

Deno.test("une erreur de lecture REMONTE — un tick muet n'est pas un tick vide", async () => {
  const boom = {
    from: () => {
      // deno-lint-ignore no-explicit-any
      const b: any = {};
      for (const m of ["select", "eq", "gt", "order", "limit", "not"]) b[m] = () => b;
      // deno-lint-ignore no-explicit-any
      b.then = (res: any, rej: any) =>
        Promise.resolve({ data: null, error: { message: "boom" } }).then(res, rej);
      return b;
    },
  };
  for (const audience of PULSE_AUDIENCES) {
    let threw = false;
    try {
      await loadAudiencePage(boom, { audience, afterUserId: "", page: 50 });
    } catch {
      threw = true;
    }
    assert(threw, `${audience}: une panne doit remonter, pas rendre zéro ligne`);
  }
});
