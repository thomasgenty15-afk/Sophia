import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D18 (L9) — MA DATE DE NAISSANCE VA DANS MON PROFIL, ET PAS N'IMPORTE LAQUELLE.
 *
 * ── CE QUE CE FICHIER GARDE, ET POURQUOI ÇA NE SE GARDE PAS AILLEURS ────────
 *
 * `setOwnBirthDate` écrit `profiles.birth_date` en DIRECT (PostgREST), pas par
 * une RPC. Deux conséquences, et chacune a ses cas ici:
 *
 *   1. IL N'Y A AUCUN CHECK EN BASE sur cette colonne (vérifié le 2026-08-12:
 *      neuf contraintes sur `profiles`, aucune sur `birth_date`). La seule
 *      garde est celle du client. Une garde qu'on peut retirer sans qu'un test
 *      rougisse n'est pas une garde — d'où les cas 2 à 4.
 *
 *   2. RLS refuse le profil d'autrui SANS LEVER: l'update touche zéro ligne et
 *      PostgREST rend 204. Sans le cas 7, l'écran dirait « enregistré » sur une
 *      écriture partie nulle part. C'est la cicatrice `RLS ne remplace pas un
 *      .eq(user_id)`, mesurée deux fois dans ce dépôt.
 *
 * ── ET LE CAS QUI PASSE, QUI EST LE PLUS IMPORTANT DES SEPT ────────────────
 *
 * Une garde cassée bloque TOUT et ressemble trait pour trait à une garde qui
 * marche. Les cas 1, 5 et 6 sont ceux qui prouvent qu'elle laisse passer ce
 * qu'elle doit laisser passer — un adulte, UN MINEUR (sa date s'enregistre:
 * c'est justement ce qu'on veut savoir), et l'effacement.
 */

/** Ce que le faux PostgREST a reçu. Vidé avant chaque cas. */
let writes: Array<{
  table: string;
  patch: Record<string, unknown>;
  column: string;
  value: string;
}> = [];

/** Ce que le faux PostgREST répond. `rows: 0` = RLS a refusé sans le dire. */
let outcome: { rows: number } | { error: string } = { rows: 1 };

vi.mock("../../lib/supabase", () => ({
  supabase: {
    // LE MOCK N'ACCEPTE QUE LA FORME EXACTE `from().update().eq().select()`.
    // Un mock permissif rendrait le même vert à un appel qui aurait perdu son
    // `.eq()` — c'est-à-dire à une écriture sur tous les profils.
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (column: string, value: string) => ({
          select: async () => {
            writes.push({ table, patch, column, value });
            if ("error" in outcome) {
              return { data: null, error: { message: outcome.error } };
            }
            return {
              data: Array.from({ length: outcome.rows }, () => ({ id: value })),
              error: null,
            };
          },
        }),
      }),
    }),
    rpc: async () => {
      throw new Error("mock: setOwnBirthDate ne doit PAS passer par une RPC");
    },
  },
}));

const { birthDateDoor, setOwnBirthDate } = await import("./household");

const ME = "11111111-1111-1111-1111-111111111111";

/** Une date ISO à N années d'ici. Jamais une constante: le test vieillirait. */
function yearsAgo(n: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  writes = [];
  outcome = { rows: 1 };
});

describe("setOwnBirthDate — la date du maître, dans son propre profil", () => {
  it("1. écrit une date d'adulte sur SA ligne de `profiles`", async () => {
    const born = yearsAgo(30);
    const res = await setOwnBirthDate(ME, born);

    expect(res).toEqual({ ok: true, reason: "" });
    // LA TABLE, LA COLONNE ET LE FILTRE, tous les trois. `household_members`
    // serait l'ancien chemin (et l'âge y est désormais un REPLI, pas
    // l'autorité); un filtre absent serait une écriture sur tout le monde.
    expect(writes).toEqual([
      { table: "profiles", patch: { birth_date: born }, column: "id", value: ME },
    ]);
  });

  it("2. refuse une date FUTURE, et n'écrit rien du tout", async () => {
    const res = await setOwnBirthDate(ME, yearsAgo(-1));

    expect(res).toEqual({ ok: false, reason: "bad_birth_date" });
    // « N'ÉCRIT RIEN » EST LA MOITIÉ DE L'ASSERTION. Un refus rendu APRÈS
    // l'écriture laisserait la date en base — et `keel_age_state` la lirait
    // `unknown`, donc la personne perdrait sa direction d'objectif en croyant
    // l'avoir activée.
    expect(writes).toEqual([]);
  });

  it("3. refuse une date qui n'existe pas au calendrier (30 février)", async () => {
    // `new Date("2010-02-30")` rend le 2 mars sans se plaindre. C'est
    // exactement le cas que `assessBirthDate` attrape et qu'une comparaison de
    // chaînes laisserait passer.
    const res = await setOwnBirthDate(ME, "2010-02-30");

    expect(res).toEqual({ ok: false, reason: "bad_birth_date" });
    expect(writes).toEqual([]);
  });

  it("4. refuse un âge invraisemblable (130 ans)", async () => {
    const res = await setOwnBirthDate(ME, yearsAgo(130));

    expect(res).toEqual({ ok: false, reason: "bad_birth_date" });
    expect(writes).toEqual([]);
  });

  it("5. ENREGISTRE la date d'un mineur — la garde ne mange pas ce cas", async () => {
    // Le sens de la garde est « refuser ce qui est ILLISIBLE », pas « refuser
    // ce qui est gênant ». Un mineur qui a un compte doit avoir sa date écrite:
    // c'est ce qui fait mordre `weekPlanAgeGate` en aval, et ce qui lui donne
    // une part d'enfant à table plutôt qu'une part standard d'adulte.
    const born = yearsAgo(10);
    const res = await setOwnBirthDate(ME, born);

    expect(res.ok).toBe(true);
    expect(writes[0]?.patch).toEqual({ birth_date: born });
  });

  it("6. efface la date quand on lui passe `null`", async () => {
    // Geste légitime: « je m'étais trompé ». L'âge redevient `unknown`, donc la
    // direction d'objectif se retire — c'est le prix, et il est réversible.
    const res = await setOwnBirthDate(ME, null);

    expect(res.ok).toBe(true);
    expect(writes[0]?.patch).toEqual({ birth_date: null });
  });

  it("7. ZÉRO ligne touchée n'est PAS un succès (RLS a refusé en silence)", async () => {
    outcome = { rows: 0 };

    const res = await setOwnBirthDate(ME, yearsAgo(30));

    expect(res).toEqual({ ok: false, reason: "not_your_line" });
  });

  it("8. une erreur PostgREST remonte, elle ne devient pas un refus", async () => {
    // Un refus NOMMÉ dit « la règle t'a arrêté »; une panne dit « on ne sait
    // pas ». Les confondre ferait afficher « tu ne peux pas » sur une base
    // injoignable, et personne ne rejouerait le geste.
    outcome = { error: "permission denied" };

    await expect(setOwnBirthDate(ME, yearsAgo(30))).rejects.toThrow(
      "permission denied",
    );
  });
});

/**
 * `birthDateDoor` — LAQUELLE DES DEUX COLONNES, POUR QUI.
 *
 * L'écran du foyer propose le même champ sur trois cartes; ce qu'il en fait
 * dépend de la bouche. Se tromper de porte ne lève JAMAIS: on écrirait
 * simplement la date là où elle n'est plus l'autorité, et la personne verrait
 * « enregistré » sans que rien ne bouge dans son assiette.
 */
describe("birthDateDoor — la porte dépend de la bouche", () => {
  const AUTRE = "22222222-2222-2222-2222-222222222222";

  it("MA ligne va dans mon profil — c'est le cas D18", () => {
    expect(birthDateDoor({ userId: ME }, ME)).toBe("own_profile");
  });

  it("un TITULAIRE qui n'est pas moi passe par sa fiche (RLS interdit son profil)", () => {
    // Le repli SQL est fait pour ça: le maître peut dater son conjoint, et cette
    // date compte tant que le conjoint n'a rien rempli chez lui.
    expect(birthDateDoor({ userId: AUTRE }, ME)).toBe("member_row");
  });

  it("une bouche SANS COMPTE passe par sa fiche — sa seule source", () => {
    expect(birthDateDoor({ userId: null }, ME)).toBe("member_row");
  });

  it("session pas encore lue (`meUserId` vide): personne ne va au profil", () => {
    // L'écran calcule `user?.id ?? ""`. Ce cas ne SÉPARE aucune rédaction
    // plausible — il est ici comme documentation exécutable de ce que vaut la
    // chaîne vide, pas comme garde. La garde du cas jumeau — un appelant qui
    // passerait `null` et ferait matcher `null === null` sur un enfant — est
    // portée par le TYPE de `meUserId`, et par rien d'autre.
    expect(birthDateDoor({ userId: null }, "")).toBe("member_row");
    expect(birthDateDoor({ userId: ME }, "")).toBe("member_row");
  });
});
