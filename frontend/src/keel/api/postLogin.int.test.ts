import { beforeEach, describe, expect, it, vi } from "vitest";

// CE QUE CE FICHIER PROTÈGE, ET POURQUOI ÇA VAUT UN TEST
//
// `resolveHomePath` décide où atterrit quiconque est connecté. Le défaut qu'il
// a eu n'était pas une mauvaise destination: c'était de DÉCIDER SANS SAVOIR.
// Backend injoignable, les deux lectures de rôle échouent, le `catch` avale
// tout et le repli envoie un élève sur `/account` — la page du produit grand
// public, qui a besoin du même backend et s'affiche donc vide. L'utilisateur
// voit un ancien produit aux champs morts et en conclut que son compte est
// cassé.
//
// La règle testée ici tient en une phrase: UNE LECTURE RÉUSSIE AUTORISE UN
// REPLI, ZÉRO LECTURE RÉUSSIE N'AUTORISE RIEN. Le dernier cas est le seul qui
// renvoie `null`, et c'est celui qui coûte le plus cher à re-perdre — il ne se
// manifeste qu'en panne, c'est-à-dire jamais pendant qu'on développe.
//
// Test unitaire à mocks: le point à asservir est l'ARBITRAGE, pas le SQL. Le
// nom en `.int.test.ts` suit le seul glob que le runner regarde
// (`vitest.config.ts` n'inclut que celui-là); un `.test.ts` ici ne serait
// exécuté par personne.

/** Ce que la lecture `coaches` a répondu. `throw` = échec de transport. */
type CoachOutcome =
  | { kind: "row"; status: string | null }
  | { kind: "error" }
  | { kind: "throw" };

/** Ce que `loadKeelRole` a répondu. Il THROW sur toute erreur, réseau inclus. */
type RoleOutcome = { kind: "role"; value: string | null } | { kind: "throw" };

/**
 * Ce que la lecture `household_members` a répondu (chantier 4).
 *
 * `rows: 0` est un FAIT — « je n'ai pas de foyer » — et pas une panne. La
 * distinction est la même que pour `coaches`, et elle décide de la même chose:
 * un repli légitime, ou `null`.
 */
type HouseholdOutcome =
  | { kind: "rows"; count: number }
  | { kind: "error" }
  | { kind: "throw" };

let coachOutcome: CoachOutcome = { kind: "row", status: null };
let roleOutcome: RoleOutcome = { kind: "role", value: null };
let householdOutcome: HouseholdOutcome = { kind: "rows", count: 0 };

vi.mock("../../lib/supabase", () => ({
  supabase: {
    // Deux tables, deux formes de requête: `coaches` finit sur `maybeSingle()`,
    // `household_members` sur `limit(1)`. Le mock DISPATCHE sur le nom de la
    // table plutôt que de rendre un objet qui satisfait les deux — sinon un
    // appel qui viserait la mauvaise table passerait le test.
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table !== "coaches") {
              throw new Error(`mock: eq().maybeSingle() inattendu sur ${table}`);
            }
            // Un échec de transport REJETTE la promesse; une erreur PostgREST
            // (RLS, cache de schéma cassé) revient dans `error`. Les deux sont
            // distingués parce que le second prouve que le serveur répond.
            if (coachOutcome.kind === "throw") {
              throw new TypeError("Failed to fetch");
            }
            if (coachOutcome.kind === "error") {
              return { data: null, error: { message: "permission denied" } };
            }
            return {
              data:
                coachOutcome.status === null ? null : { status: coachOutcome.status },
              error: null,
            };
          },
        }),
        limit: async () => {
          if (table !== "household_members") {
            throw new Error(`mock: select().limit() inattendu sur ${table}`);
          }
          if (householdOutcome.kind === "throw") {
            throw new TypeError("Failed to fetch");
          }
          if (householdOutcome.kind === "error") {
            return { data: null, error: { message: "permission denied" } };
          }
          return {
            data: Array.from({ length: householdOutcome.count }, () => ({
              member_id: "m",
            })),
            error: null,
          };
        },
      }),
    }),
  },
}));

vi.mock("./keelClient", () => ({
  loadKeelRole: async () => {
    if (roleOutcome.kind === "throw") {
      throw new Error("[keel/api] loadKeelRole failed: TypeError: Failed to fetch");
    }
    return roleOutcome.value;
  },
}));

const { resolveHomePath } = await import("./postLogin");

const USER = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  coachOutcome = { kind: "row", status: null };
  roleOutcome = { kind: "role", value: null };
  householdOutcome = { kind: "rows", count: 0 };
});

describe("resolveHomePath — les branches qui savent", () => {
  it("une ligne coach ACTIVE l'emporte sur tout le reste", async () => {
    coachOutcome = { kind: "row", status: "active" };
    // Le rôle dirait « élève »: on ne le lit même pas. L'ordre restitue
    // l'autorité des gardes de route, pas une préférence.
    roleOutcome = { kind: "role", value: "student" };
    expect(await resolveHomePath(USER)).toBe("/coach");
  });

  it("une ligne coach non active ne fait PAS un coach", async () => {
    coachOutcome = { kind: "row", status: "pending" };
    roleOutcome = { kind: "role", value: "student" };
    expect(await resolveHomePath(USER)).toBe("/app/today");
  });

  it("keel_role='student' envoie dans l'app élève", async () => {
    roleOutcome = { kind: "role", value: "student" };
    expect(await resolveHomePath(USER)).toBe("/app/today");
  });

  it("lu, mais ni coach ni élève ni foyer: /account reste légitime", async () => {
    roleOutcome = { kind: "role", value: null };
    householdOutcome = { kind: "rows", count: 0 };
    expect(await resolveHomePath(USER)).toBe("/account");
  });
});

// ── CHANTIER 4 — LA BRANCHE FOYER ─────────────────────────────────────────
//
// Le défaut qu'elle ferme: quelqu'un qui a RÉCLAMÉ son profil n'est l'élève de
// personne (`keel_role` reste NULL, exprès), donc il tombait sur `/account` —
// l'ancienne page grand public — à chaque connexion. L'écran de réclamation
// l'emmenait bien sur son foyer; la deuxième visite, elle, ne le savait pas.
describe("resolveHomePath — le foyer", () => {
  it("une ligne de foyer envoie sur /app/household", async () => {
    roleOutcome = { kind: "role", value: null };
    householdOutcome = { kind: "rows", count: 1 };
    expect(await resolveHomePath(USER)).toBe("/app/household");
  });

  it("`student` L'EMPORTE sur le foyer, et l'ordre n'est pas cosmétique", async () => {
    // Un élève qui rejoint le foyer de son conjoint garde le produit que son
    // coach paie. C'est la précédence de `recompute_profile_access_tier`
    // (20260811050000 §4), restituée ici: (2) avant (3).
    roleOutcome = { kind: "role", value: "student" };
    householdOutcome = { kind: "rows", count: 1 };
    expect(await resolveHomePath(USER)).toBe("/app/today");
  });

  it("un coach actif l'emporte aussi, même avec un foyer", async () => {
    coachOutcome = { kind: "row", status: "active" };
    householdOutcome = { kind: "rows", count: 1 };
    expect(await resolveHomePath(USER)).toBe("/coach");
  });

  it("zéro ligne de foyer est un FAIT: /account, pas null", async () => {
    // Les deux lectures ont abouti et disent « ni élève ni foyer ». C'est une
    // destination, pas une ignorance.
    coachOutcome = { kind: "error" };
    roleOutcome = { kind: "role", value: null };
    householdOutcome = { kind: "rows", count: 0 };
    expect(await resolveHomePath(USER)).toBe("/account");
  });

  it("le foyer illisible ne vaut PAS autorisation", async () => {
    // Une lecture qui échoue ne route pas vers `/app/household`: la garde
    // `KeelHouseholdRoute` re-poserait la même question et refuserait.
    roleOutcome = { kind: "role", value: null };
    householdOutcome = { kind: "error" };
    expect(await resolveHomePath(USER)).toBe("/account");
  });

  it("les TROIS lectures en panne ne routent toujours nulle part", async () => {
    coachOutcome = { kind: "throw" };
    roleOutcome = { kind: "throw" };
    householdOutcome = { kind: "throw" };
    expect(await resolveHomePath(USER)).toBeNull();
  });
});

describe("resolveHomePath — les branches qui ne savent pas", () => {
  it("ZÉRO lecture aboutie ne route nulle part", async () => {
    // LE BUG, en une assertion. Les trois appels tombent au transport: on ne
    // détient aucun fait sur cette personne. Avant, ce cas rendait `/account`
    // et déposait un élève dans l'ancien produit, vide.
    coachOutcome = { kind: "throw" };
    roleOutcome = { kind: "throw" };
    householdOutcome = { kind: "throw" };
    expect(await resolveHomePath(USER)).toBeNull();
  });

  it("le rôle illisible mais le coach lu garde le repli d'origine", async () => {
    // Le serveur répond (la lecture `coaches` a abouti, ligne absente), donc
    // l'échec sur `profiles` est un vrai échec de lecture, pas une panne. Le
    // « fail safe, not closed » d'origine tient: /account, pas un écran mort.
    coachOutcome = { kind: "row", status: null };
    roleOutcome = { kind: "throw" };
    expect(await resolveHomePath(USER)).toBe("/account");
  });

  it("une ERREUR PostgREST sur coaches compte comme une réponse", async () => {
    // RLS qui refuse, cache de schéma cassé: le serveur a parlé. Ce n'est pas
    // une panne, et si le rôle se lit ensuite il fait foi.
    coachOutcome = { kind: "error" };
    roleOutcome = { kind: "role", value: "student" };
    expect(await resolveHomePath(USER)).toBe("/app/today");
  });

  it("erreur PostgREST sur coaches + rôle illisible => on ne sait rien", async () => {
    // Le cas subtil: `coachRes.error` n'est PAS une lecture réussie. Deux
    // refus valent zéro fait, exactement comme deux pannes.
    coachOutcome = { kind: "error" };
    roleOutcome = { kind: "throw" };
    // ⚠️ CHANTIER 4: la lecture du foyer est le TROISIÈME candidat au fait. La
    // laisser aboutir ici testerait autre chose que ce que le titre annonce —
    // « zéro fait » exige que les trois échouent.
    householdOutcome = { kind: "throw" };
    expect(await resolveHomePath(USER)).toBeNull();
  });
});
