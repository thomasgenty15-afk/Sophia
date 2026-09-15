import { describe, expect, it } from "vitest";

import {
  exitsOf,
  readMergeQuota,
  readNotice,
  readNoticesPayload,
} from "./householdMerge";

/**
 * L8 — CE QUE L'ÉCRAN A LE DROIT D'AFFICHER, ET RIEN DE PLUS.
 *
 * Tout ce qui est testé ici est une décision de LECTURE. L'arithmétique de la
 * fusion (fenêtre, pivot, plafond, phrase) est au serveur et n'a qu'un
 * exemplaire; ces tests gardent l'autre moitié — que le navigateur ne promette
 * rien que le serveur n'a offert.
 */

/** Une notice complète, telle que `household-merge-notices-v1` la rend. */
function noticePayload(over: Record<string, unknown> = {}) {
  return {
    kind: "merge_available",
    member_id: "m-zoe",
    user_id: "u-zoe",
    display_name: "Zoe",
    plan: {
      id: "p-zoe",
      starts_on: "2026-08-12",
      duration_days: 5,
      validated_at: "2026-08-12T04:29:47.614Z",
    },
    dismiss_validated_at: "2026-08-14T09:00:00.000Z",
    sentence: "Zoe's plan covers 3 days of this household's week.",
    mergeable: {
      window: { starts_on: "2026-08-14", duration_days: 3 },
      intersection: { starts_on: "2026-08-12", duration_days: 5 },
      pivot: "2026-08-14",
      days_already_past: 2,
      into_plan_id: "p-house",
    },
    mergeable_refusal: null,
    merged: null,
    exits: ["merge", "dismiss"],
    ...over,
  };
}

describe("les sorties offertes", () => {
  it("ne rend que les sorties que le serveur a nommées", () => {
    expect(exitsOf(["merge", "dismiss"])).toEqual(["merge", "dismiss"]);
  });

  it("n'invente PAS un bouton que le serveur a retiré", () => {
    // ⚠️ C'est la garde du lot. Le serveur retire `merge` quand le plafond de
    // D11 est atteint et `unmerge` quand le plan porteur n'a plus de queue:
    // afficher ces boutons quand même promettrait un 429 ou un 409. L5 a mesuré
    // exactement ça dans l'autre sens — le bouton offert pendant que le geste
    // refusait.
    const quotaFull = exitsOf(["unmerge", "dismiss"]);
    expect(quotaFull).not.toContain("merge");
    expect(quotaFull).toEqual(["unmerge", "dismiss"]);
  });

  it("laisse tomber une sortie hors vocabulaire", () => {
    // Un bouton dont ce navigateur ne sait pas ce qu'il déclenche est pire
    // qu'un bouton absent.
    expect(exitsOf(["merge", "teleport"])).toEqual(["merge"]);
  });

  it("rend une liste vide quand il n'y a rien, sans exploser", () => {
    expect(exitsOf(null)).toEqual([]);
    expect(exitsOf("merge")).toEqual([]);
  });
});

describe("une proposition, lue", () => {
  it("garde la phrase du serveur telle quelle", () => {
    // Les trois nombres de D16 viennent de `bestMergePair`. Les recomposer ici
    // ferait un second avis sur des jours, avec deux nombres plausibles.
    const notice = readNotice(noticePayload());
    expect(notice?.sentence).toBe("Zoe's plan covers 3 days of this household's week.");
  });

  it("SÉPARE la date de « refuser » de celle du plan montré", () => {
    // ⚠️ LE PIÈGE NOMMÉ AU REGISTRE. `keel_household_dismiss_merge_notice`
    // compare `p_validated_at` à la validation la PLUS RÉCENTE de la personne;
    // envoyer celle du plan qu'une fusion prendrait fait refuser
    // `notice_moved_on` en boucle, sans que rien ne l'explique.
    const notice = readNotice(noticePayload());
    expect(notice?.validatedAt).toBe("2026-08-12T04:29:47.614Z");
    expect(notice?.dismissValidatedAt).toBe("2026-08-14T09:00:00.000Z");
    expect(notice?.dismissValidatedAt).not.toBe(notice?.validatedAt);
  });

  it("rend `mergeable` nul quand plus rien n'est fusionnable", () => {
    // D8 avertit quand même: le plan du foyer porte une reprise périmée, et le
    // maître doit pouvoir la défaire. `mergeable: null` n'est donc pas une
    // notice à jeter.
    const notice = readNotice(noticePayload({
      kind: "merged_plan_revalidated",
      mergeable: null,
      mergeable_refusal: "merge_windows_disjoint",
      merged: {
        plan_id: "p-old",
        validated_at: "2026-08-10T08:00:00.000Z",
        household_plan_id: "p-house",
        unmerge_window: { starts_on: "2026-08-14", duration_days: 3 },
      },
      exits: ["unmerge", "dismiss"],
    }));
    expect(notice?.mergeable).toBeNull();
    expect(notice?.mergeableRefusal).toBe("merge_windows_disjoint");
    expect(notice?.merged?.unmergeWindow).toEqual({
      startsOn: "2026-08-14",
      durationDays: 3,
    });
    expect(notice?.exits).toEqual(["unmerge", "dismiss"]);
  });

  it("jette une notice dont la NATURE est inconnue", () => {
    // Les deux natures n'offrent pas les mêmes sorties: deviner ferait
    // promettre un geste. Le cas qui passe est juste au-dessus.
    expect(readNotice(noticePayload({ kind: "something_else" }))).toBeNull();
  });
});

describe("le plafond de la semaine", () => {
  it("prend les nombres du serveur sans en dériver un seul", () => {
    // ⚠️ AUCUN FICHIER TYPESCRIPT DE CE DÉPÔT NE CONNAÎT LE « N + 3 », et un
    // test de source le tient côté serveur. Recalculer `limit - used` ici
    // serait la première ligne d'un second plafond — celui qui ment le jour où
    // la définition en base bouge.
    const quota = readMergeQuota({
      used: 4,
      limit: 5,
      remaining: 1,
      exhausted: false,
      week_start: "2026-08-10",
      resets_on: "2026-08-17",
    });
    expect(quota).toEqual({
      used: 4,
      limit: 5,
      remaining: 1,
      exhausted: false,
      weekStart: "2026-08-10",
      resetsOn: "2026-08-17",
    });
  });

  it("ne recalcule PAS `remaining`, et le décor le prouve", () => {
    // ⚠️ SANS CE CAS, LE TEST AU-DESSUS EST FAUX-VERT: avec `used: 4, limit: 5,
    // remaining: 1`, une soustraction côté navigateur rend la même chose que
    // la lecture. Ce décor-ci est une réponse RÉELLE du serveur — la branche de
    // refus de `keel_household_merge_quota_state` rend `remaining: 0` avec le
    // `used` tel quel, donc `limit - used` y vaut -1. Les deux comportements
    // deviennent discernables.
    expect(readMergeQuota({
      used: 6,
      limit: 5,
      remaining: 0,
      exhausted: true,
      week_start: "2026-08-10",
      resets_on: "2026-08-17",
    })?.remaining).toBe(0);
  });

  it("rend `null` quand le plafond n'a pas pu être lu", () => {
    // `null` veut dire « on ne sait pas », jamais « pas de plafond »: la
    // fonction edge rend `merge_quota: null` avec une `issue` nommée.
    expect(readMergeQuota(null)).toBeNull();
  });
});

describe("la réponse entière", () => {
  it("lit le gel, les propositions, les motifs et les reprises", () => {
    const view = readNoticesPayload({
      ok: true,
      household: { id: "h-1", frozen: true },
      merge_quota: {
        used: 5,
        limit: 5,
        remaining: 0,
        exhausted: true,
        week_start: "2026-08-10",
        resets_on: "2026-08-17",
      },
      notices: [noticePayload({ exits: ["dismiss"] })],
      skipped: [
        { member_id: "m-tom", display_name: "Tom", reason: "no_validated_plan" },
      ],
      held: [
        {
          member_id: "m-lea",
          plan_id: "p-house",
          window: { starts_on: "2026-08-12", duration_days: 5 },
        },
      ],
      issues: ["settings_unreadable"],
    });
    expect(view.frozen).toBe(true);
    expect(view.quota?.exhausted).toBe(true);
    // Plafond atteint ⇒ le serveur a retiré `merge`, et l'écran ne le remet pas.
    expect(view.notices[0].exits).toEqual(["dismiss"]);
    expect(view.skipped[0].reason).toBe("no_validated_plan");
    // La PORTÉE d'une reprise voyage avec elle: hors de cette fenêtre, la
    // composition suivante ne re-reprend personne.
    expect(view.held[0].window).toEqual({ startsOn: "2026-08-12", durationDays: 5 });
    expect(view.issues).toEqual(["settings_unreadable"]);
  });

  it("rend un état VIDE lisible plutôt qu'une exception", () => {
    // « Personne n'a pris la main » doit être une phrase, pas un blanc — et
    // surtout pas une page qui tombe. Ce dépôt a mesuré qu'un écran qui se vide
    // est son pire échec.
    const view = readNoticesPayload({});
    expect(view.notices).toEqual([]);
    expect(view.skipped).toEqual([]);
    expect(view.held).toEqual([]);
    expect(view.quota).toBeNull();
    expect(view.frozen).toBe(false);
  });
});
