import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  boxNotesByDish,
  boxStillWaiting,
  resolveShareOutcomes,
  SHARE_OUTCOMES,
  type ShareOutcomeRow,
} from "./shareOutcomes";

/**
 * A8.3 — LE JUMEAU DU NAVIGATEUR NE PEUT PAS DÉRIVER DU SERVEUR.
 *
 * Postgres, Deno et le navigateur ne partagent aucun module: le vocabulaire des
 * sorts et les deux règles de lecture (D8.3, « encore au frigo a une fin »)
 * existent en deux exemplaires. La recopie est inévitable, la dérive ne l'est
 * pas — c'est la situation exacte de `mealTicks.int.test.ts`, et le remède est
 * le même: on lit les autres sources SUR LE DISQUE.
 *
 * ⚠️ CE QUE COÛTERAIT LA DÉRIVE. Un sort que la base écrirait et que l'écran ne
 * saurait pas lire ferait DISPARAÎTRE une boîte de la vue de la part — sans
 * erreur, sans trace, et au moment exact où la personne cherche ce qui lui
 * reste. Un sort que l'écran croirait vivant et que la base ne produit plus
 * annoncerait une boîte qui n'existe pas: le mensonge que FF-057 corrige.
 */

const DENO_SOURCE = new URL(
  "../../../../supabase/functions/_shared/keel/meal_share_outcome.ts",
  import.meta.url,
);
const MIGRATION_SOURCE = new URL(
  "../../../../supabase/migrations/20260903172000_la_boite_du_membre_est_un_fait_par_bouche.sql",
  import.meta.url,
);

describe("le vocabulaire des sorts ne peut pas diverger", () => {
  it("le front porte la MÊME liste, dans le MÊME ordre, que `meal_share_outcome.ts`", () => {
    const src = readFileSync(DENO_SOURCE, "utf8");
    const at = src.indexOf("export const SHARE_OUTCOMES = [");
    expect(at, "`SHARE_OUTCOMES` introuvable — test à réviser").toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("] as const;", at));
    const declared = [...body.matchAll(/^\s*"([a-z_]+)",$/gm)].map((m) => m[1]);
    expect(declared).toEqual([...SHARE_OUTCOMES]);
  });

  it("et la MÊME que le `check` de la table", () => {
    const sql = readFileSync(MIGRATION_SOURCE, "utf8");
    const at = sql.indexOf("check (outcome in (");
    expect(at, "le CHECK du vocabulaire est introuvable — test à réviser")
      .toBeGreaterThan(-1);
    const body = sql.slice(at, sql.indexOf("))", at));
    const declared = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    // ⚠️ TRIÉS DES DEUX CÔTÉS: le SQL n'a aucune raison de porter l'ordre du
    // TypeScript, et exiger un ordre commun ferait échouer ce test pour une
    // raison qui n'est pas une divergence de vocabulaire.
    expect([...declared].sort()).toEqual([...SHARE_OUTCOMES].sort());
  });
});

const MEAL = "11111111-2222-3333-4444-555555555555";
const ME = "mem-bo";
const KID = "mem-cy";

function row(over: Partial<ShareOutcomeRow>): ShareOutcomeRow {
  return {
    generatedMealId: MEAL,
    dishIndex: 0,
    memberId: ME,
    declaredBy: "user-bo",
    outcome: "frozen",
    shiftedToDay: null,
    ...over,
  };
}

describe("D8.3 — la ligne de la personne gagne sur celle du maître", () => {
  it("⚠️ PAR AUTORITÉ, ET PAS PAR ORDRE: les deux ordres de tableau donnent la même réponse", () => {
    const master = row({ declaredBy: "user-owner", outcome: "discarded" });
    const self = row({ declaredBy: "user-bo", outcome: "frozen" });
    // Un test à un seul ordre resterait vert sur un « le dernier gagne »
    // déguisé — c'est la même précaution que côté serveur.
    for (const rows of [[master, self], [self, master]]) {
      const resolved = resolveShareOutcomes({
        rows,
        mouthOwner: { [ME]: "user-bo" },
      });
      expect(resolved).toHaveLength(1);
      expect(resolved[0].outcome).toBe("frozen");
      expect(resolved[0].authority).toBe("self");
    }
  });

  it("⛔ RIEN N'EST CORRIGÉ: le tableau d'entrée n'est pas muté", () => {
    const rows = [
      row({ declaredBy: "user-owner", outcome: "discarded" }),
      row({ declaredBy: "user-bo", outcome: "frozen" }),
    ];
    const before = JSON.stringify(rows);
    resolveShareOutcomes({ rows, mouthOwner: { [ME]: "user-bo" } });
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("⛔ D6 — deux boîtes d'une MÊME personne restent DEUX", () => {
    // Regrouper sur la bouche seule ferait s'effondrer la boîte de mardi et
    // celle de jeudi l'une dans l'autre: la vue de la part ne pourrait
    // structurellement pas les rendre côte à côte.
    const resolved = resolveShareOutcomes({
      rows: [
        row({ dishIndex: 3, outcome: "shifted", shiftedToDay: "2026-09-04" }),
        row({ dishIndex: 9, outcome: "frozen" }),
      ],
      mouthOwner: { [ME]: "user-bo" },
    });
    expect(resolved.map((r) => [r.dishIndex, r.outcome])).toEqual([
      [3, "shifted"],
      [9, "frozen"],
    ]);
  });

  it("une bouche inconnue ne devient pas `self` par accident", () => {
    // Deviner par `declaredBy === memberId` serait faux: un compte et une
    // bouche sont deux espaces d'identifiants différents.
    const resolved = resolveShareOutcomes({
      rows: [row({ memberId: "mem-ghost", declaredBy: "mem-ghost" })],
      mouthOwner: { [ME]: "user-bo" },
    });
    expect(resolved[0].authority).toBe("owner");
  });
});

describe("« encore au frigo » a une fin", () => {
  it("congelée: elle attend. Reportée à aujourd'hui ou après: elle attend.", () => {
    expect(boxStillWaiting({ outcome: "frozen", shiftedToDay: null }, "2026-09-03"))
      .toBe(true);
    expect(
      boxStillWaiting({ outcome: "shifted", shiftedToDay: "2026-09-03" }, "2026-09-03"),
    ).toBe(true);
    expect(
      boxStillWaiting({ outcome: "shifted", shiftedToDay: "2026-09-04" }, "2026-09-03"),
    ).toBe(true);
  });

  it("⛔ reportée à un jour DÉPASSÉ, jetée, ou sans suite: elle ne s'annonce pas", () => {
    // Une boîte reportée à hier n'est plus une boîte: c'est une part perdue, et
    // l'annoncer serait le mensonge exact que FF-057 existe pour corriger.
    expect(
      boxStillWaiting({ outcome: "shifted", shiftedToDay: "2026-09-02" }, "2026-09-03"),
    ).toBe(false);
    expect(boxStillWaiting({ outcome: "discarded", shiftedToDay: null }, "2026-09-03"))
      .toBe(false);
    // « on ne sait pas » n'est pas « elle t'attend ».
    expect(boxStillWaiting({ outcome: "not_eaten", shiftedToDay: null }, "2026-09-03"))
      .toBe(false);
  });
});

describe("ce que la vue de la part reçoit, plat par plat", () => {
  it("⚠️ LE CAS QUI PASSE — la boîte est rangée SOUS SON plat, sans prénom", () => {
    const notes = boxNotesByDish({
      rows: [row({ dishIndex: 4, outcome: "frozen" })],
      mouthOwner: { [ME]: "user-bo" },
      names: {},
      meMemberId: ME,
      today: "2026-09-03",
    });
    // La position est la clé: une boîte est le reste d'UN plat.
    expect([...notes.keys()]).toEqual([4]);
    // `name: null` = « ta boîte ». Nommer quelqu'un pour sa propre boîte
    // ferait lire « Bo — boîte de mardi » à Bo lui-même.
    expect(notes.get(4)).toEqual([{ memberId: ME, name: null }]);
  });

  it("⛔ LE CAS QUI REFUSE — la boîte disparaît quand la ligne est RÉSOLUE", () => {
    // C'est l'épreuve du mandat: « encore au frigo » disparaît quand la ligne
    // est résolue. Trois façons dont elle l'est, et aucune ne s'affiche.
    for (
      const resolvedRow of [
        row({ dishIndex: 4, outcome: "discarded" }),
        row({ dishIndex: 4, outcome: "not_eaten" }),
        row({ dishIndex: 4, outcome: "shifted", shiftedToDay: "2026-09-01" }),
      ]
    ) {
      const notes = boxNotesByDish({
        rows: [resolvedRow],
        mouthOwner: { [ME]: "user-bo" },
        names: {},
        meMemberId: ME,
        today: "2026-09-03",
      });
      expect(notes.size, JSON.stringify(resolvedRow)).toBe(0);
    }
  });

  it("⛔ ET LA LIGNE DE LA PERSONNE DÉCIDE DE L'AFFICHAGE, pas celle du maître", () => {
    // Le maître a dit « jetée », la personne a dit « congelée ». D8.3: la
    // sienne gagne, donc la boîte S'AFFICHE. Trancher dans l'autre sens la
    // ferait disparaître de sa propre vue sur la déclaration d'un autre.
    const notes = boxNotesByDish({
      rows: [
        row({ dishIndex: 4, declaredBy: "user-owner", outcome: "discarded" }),
        row({ dishIndex: 4, declaredBy: "user-bo", outcome: "frozen" }),
      ],
      mouthOwner: { [ME]: "user-bo" },
      names: {},
      meMemberId: ME,
      today: "2026-09-03",
    });
    expect(notes.get(4)).toEqual([{ memberId: ME, name: null }]);
  });

  it("la boîte d'une AUTRE bouche porte son prénom", () => {
    // Le maître ne lit que les bouches SANS COMPTE (la RLS le garantit); sans
    // le prénom, il rangerait une boîte sans savoir laquelle — deux enfants
    // ont deux boîtes.
    const notes = boxNotesByDish({
      rows: [row({ dishIndex: 2, memberId: KID, declaredBy: "user-owner" })],
      mouthOwner: { [KID]: null },
      names: { [KID]: "Cy" },
      meMemberId: ME,
      today: "2026-09-03",
    });
    expect(notes.get(2)).toEqual([{ memberId: KID, name: "Cy" }]);
  });
});
