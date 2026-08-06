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

let coachOutcome: CoachOutcome = { kind: "row", status: null };
let roleOutcome: RoleOutcome = { kind: "role", value: null };

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
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

  it("lu, mais ni coach ni élève: /account est une destination légitime", async () => {
    roleOutcome = { kind: "role", value: null };
    expect(await resolveHomePath(USER)).toBe("/account");
  });
});

describe("resolveHomePath — les branches qui ne savent pas", () => {
  it("ZÉRO lecture aboutie ne route nulle part", async () => {
    // LE BUG, en une assertion. Les deux appels tombent au transport: on ne
    // détient aucun fait sur cette personne. Avant, ce cas rendait `/account`
    // et déposait un élève dans l'ancien produit, vide.
    coachOutcome = { kind: "throw" };
    roleOutcome = { kind: "throw" };
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
    expect(await resolveHomePath(USER)).toBeNull();
  });
});
