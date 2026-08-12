import { assert, assertEquals } from "jsr:@std/assert@1";

import { armPhotoInvitation } from "./keel_photo_invitation_lane.ts";
import { photoInvitationSentences } from "../../_shared/keel/photo_invitation.ts";

type Insert = Record<string, unknown>;

/**
 * Un faux client réduit à ce que la lane appelle: deux `select … head` (le
 * compte du jour, le « déjà invitée ») et un `insert`.
 */
function fakeDb(opts: {
  todayCount?: number;
  everCount?: number;
  insertError?: { code?: string; message: string };
  inserts?: Insert[];
  reads?: string[];
  // deno-lint-ignore no-explicit-any
}): any {
  return {
    from(_table: string) {
      // ⚠️ LE DISCRIMINANT EST `local_date`, PAS `ask_kind`.
      // Depuis que le compte du jour porte sur UN genre
      // (`countDailyAsksOfKind`), les deux lectures filtrent `ask_kind` — le
      // double les confondait et rendait le compte « déjà invitée » pour celui
      // du jour. Seul le compte du JOUR borne la journée locale.
      let sawLocalDate = false;
      const chain = {
        select(_c: string, _o?: unknown) {
          return chain;
        },
        eq(col: string, _v: unknown) {
          if (col === "local_date") sawLocalDate = true;
          return chain;
        },
        neq(_c: string, _v: unknown) {
          return chain;
        },
        insert(payload: Insert) {
          opts.inserts?.push(payload);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    error: opts.insertError ?? null,
                    data: opts.insertError ? null : { id: "row" },
                  });
                },
              };
            },
          };
        },
        then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
          const kind: "day" | "ever" = sawLocalDate ? "day" : "ever";
          opts.reads?.push(kind);
          return Promise.resolve({
            count: kind === "ever" ? (opts.everCount ?? 0) : (opts.todayCount ?? 0),
            error: null,
          }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

const OFF_PLAN = [{ protocol_event_id: "evt-1", plan_relation: "off_plan" }];

const BASE = {
  userId: "u-1",
  responseLocale: "en-GB",
  committed: OFF_PLAN,
  safetyBand: "none" as string | null | undefined,
  restrictionFlag: false,
  futureIntent: false,
  hasMedia: false,
  flowAlreadyOpen: false,
  localDate: "2026-08-08",
  sourceMessageId: "msg-1",
};

Deno.test("le cas nominal invite, inscrit, et vise le fait hors plan", async () => {
  const inserts: Insert[] = [];
  const result = await armPhotoInvitation({
    ...BASE,
    supabase: fakeDb({ inserts }),
  });
  assertEquals(result.reason_code, "invite");
  assertEquals(result.educating, true);
  assertEquals(result.invitedEventId, "evt-1");
  assertEquals(result.sentence, photoInvitationSentences("en-GB").educating);
  // LA PLACE EST PRISE, et elle porte le genre partagé.
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].ask_kind, "photo_invitation");
  assertEquals(inserts[0].axis, null);
  assertEquals(inserts[0].source, "chat");
  assertEquals(inserts[0].protocol_event_id, "evt-1");
});

Deno.test("un fait hors plan est CHOISI parmi plusieurs lignes committées", async () => {
  const result = await armPhotoInvitation({
    ...BASE,
    committed: [
      { protocol_event_id: "evt-a", plan_relation: null },
      { protocol_event_id: "evt-b", plan_relation: "off_plan" },
    ],
    supabase: fakeDb({}),
  });
  assertEquals(result.invitedEventId, "evt-b");
});

Deno.test("aucun fait hors plan: rien, et SANS toucher la base", async () => {
  const reads: string[] = [];
  const inserts: Insert[] = [];
  const result = await armPhotoInvitation({
    ...BASE,
    committed: [{ protocol_event_id: "evt-a", plan_relation: null }],
    supabase: fakeDb({ reads, inserts }),
  });
  assertEquals(result.reason_code, "not_off_plan");
  // Le refus bon marché ne coûte AUCUN aller-retour: c'est le cas majoritaire.
  assertEquals(reads.length, 0);
  assertEquals(inserts.length, 0);
});

Deno.test("une bande de sécurité ferme avant toute lecture", async () => {
  const reads: string[] = [];
  const result = await armPhotoInvitation({
    ...BASE,
    safetyBand: "medium",
    supabase: fakeDb({ reads }),
  });
  assertEquals(result.reason_code, "safety_band");
  assertEquals(reads.length, 0);
});

Deno.test("une ligne committée sans id ne compte pas comme un fait", async () => {
  const result = await armPhotoInvitation({
    ...BASE,
    committed: [{ protocol_event_id: "  ", plan_relation: "off_plan" }],
    supabase: fakeDb({}),
  });
  assertEquals(result.reason_code, "no_committed_fact");
});

Deno.test("le budget déjà consommé ferme, et la raison porte la source du compte", async () => {
  const inserts: Insert[] = [];
  const result = await armPhotoInvitation({
    ...BASE,
    supabase: fakeDb({ todayCount: 1, inserts }),
  });
  assert(result.reason_code.startsWith("budget_consumed"));
  assertEquals(result.sentence, null);
  // Rien n'est inscrit quand rien ne part.
  assertEquals(inserts.length, 0);
});

Deno.test("déjà invitée un jour: la variante nue part", async () => {
  const result = await armPhotoInvitation({
    ...BASE,
    supabase: fakeDb({ everCount: 3 }),
  });
  assertEquals(result.educating, false);
  assertEquals(result.sentence, photoInvitationSentences("en-GB").bare);
});

Deno.test("le rejeu du même message ne repart pas", async () => {
  const result = await armPhotoInvitation({
    ...BASE,
    supabase: fakeDb({ insertError: { code: "23505", message: "dup" } }),
  });
  assertEquals(result.reason_code, "already_asked_for_this_message");
  assertEquals(result.sentence, null);
});

Deno.test("une inscription en échec RETIRE l'invitation — pas de demande hors compteur", async () => {
  const result = await armPhotoInvitation({
    ...BASE,
    supabase: fakeDb({ insertError: { code: "42501", message: "denied" } }),
  });
  assertEquals(result.reason_code, "budget_record_failed");
  assertEquals(result.sentence, null);
});

// ── FF-021 R7 · LE PLANCHER DE RESTRICTION, AU NIVEAU DE LA LANE ────────────
//
// Le refus doit arriver AU GATE BON MARCHÉ, donc sans le moindre aller-retour
// en base: `reads` reste vide, et aucune place de budget n'est consommée. Un
// refus qui brûlerait la place du jour ferait taire la surface légitime du
// lendemain pour rien.
Deno.test("FF-021 — plancher levé: aucune invitation, aucune lecture, aucune place prise", async () => {
  const inserts: Insert[] = [];
  const reads: string[] = [];
  const result = await armPhotoInvitation({
    ...BASE,
    restrictionFlag: true,
    supabase: fakeDb({ inserts, reads }),
  });
  assertEquals(result.reason_code, "restriction_flag");
  assertEquals(result.sentence, null);
  assertEquals(result.invitedEventId, null);
  assertEquals(inserts.length, 0);
  assertEquals(reads.length, 0);
});
