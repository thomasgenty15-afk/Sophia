import { describe, expect, it } from "vitest";

import {
  canSeeGoalOf,
  envyRound,
  type HouseholdMemberView,
  type HouseholdView,
  isMinorBirthDate,
  restrictionBlock,
  restrictionNotice,
} from "./household";

const TODAY = new Date("2026-08-08T12:00:00Z");

function member(
  userId: string,
  opts: { role?: "owner" | "member"; minor?: boolean; consented?: boolean } = {},
): HouseholdMemberView {
  return {
    userId,
    displayName: userId,
    role: opts.role ?? "member",
    isMinor: opts.minor ?? false,
    restrictionConsentAt: opts.consented ? "2026-08-01T10:00:00Z" : null,
  };
}

const OWNER = member("owner", { role: "owner" });
const ADULT = member("adult");
const ADULT_OK = member("adult", { consented: true });
const KID = member("kid", { minor: true });

function household(
  kind: "family" | "shared",
  members: HouseholdMemberView[],
  meId = "owner",
): HouseholdView {
  return {
    id: "hh",
    kind,
    name: "Maison",
    members,
    me: members.find((m) => m.userId === meId) ?? null,
  };
}

describe("restrictionBlock — le motif est le sujet, pas le booléen", () => {
  it("hors mode famille, personne ne restreint personne — pas même un mineur", () => {
    // Tous les autres feux sont au vert. Un ordre de refus différent enverrait
    // un colocataire chercher un pouvoir qui n'existe pas dans son foyer.
    expect(restrictionBlock(household("shared", [OWNER, KID]), KID)).toBe("not_a_family");
  });

  it("un membre n'est pas un compte maître", () => {
    const hh = household("family", [OWNER, ADULT, KID], "adult");
    expect(restrictionBlock(hh, KID)).toBe("not_owner");
  });

  it("on ne se restreint pas soi-même par ce chemin", () => {
    expect(restrictionBlock(household("family", [OWNER]), OWNER)).toBe("self");
  });

  it("un mineur est restreignable", () => {
    expect(restrictionBlock(household("family", [OWNER, KID]), KID)).toBeNull();
  });

  it("un majeur SANS accord ne l'est pas — c'est le défaut", () => {
    expect(restrictionBlock(household("family", [OWNER, ADULT]), ADULT))
      .toBe("adult_without_consent");
  });

  it("un majeur qui a donné son accord l'est", () => {
    expect(restrictionBlock(household("family", [OWNER, ADULT_OK]), ADULT_OK)).toBeNull();
  });

  it("sans foyer chargé, le bouton reste fermé", () => {
    // Un écran qui rendrait `null` avant d'avoir lu afficherait un bouton actif
    // pendant le chargement, et le premier clic partirait dans le vide.
    expect(restrictionBlock(null, KID)).toBe("not_owner");
  });
});

describe("isMinorBirthDate — l'âge se relit, il ne se fige pas", () => {
  it("une date ABSENTE vaut majeur", () => {
    // LA DIRECTION CONTRE-INTUITIVE. « On ne sait pas » ne doit pas donner au
    // compte maître un pouvoir sur quelqu'un qui n'a rien renseigné. Jumeau de
    // `keel_household_is_minor` en base et de `student_age.ts` côté serveur.
    expect(isMinorBirthDate(null, TODAY)).toBe(false);
    expect(isMinorBirthDate("", TODAY)).toBe(false);
    expect(isMinorBirthDate("pas-une-date", TODAY)).toBe(false);
  });

  it("le jour des 18 ans, la restriction tombe", () => {
    expect(isMinorBirthDate("2008-08-08", TODAY)).toBe(false);
    expect(isMinorBirthDate("2008-08-09", TODAY)).toBe(true);
  });

  it("un enfant de douze ans est mineur", () => {
    expect(isMinorBirthDate("2014-03-20", TODAY)).toBe(true);
  });
});

describe("canSeeGoalOf — ce qu'un foyer partagé ne montre pas", () => {
  it("en colocation, l'objectif d'un autre ne se demande pas", () => {
    expect(canSeeGoalOf(household("shared", [OWNER, ADULT], "adult"), OWNER)).toBe(false);
  });

  it("chacun voit toujours le sien", () => {
    expect(canSeeGoalOf(household("shared", [OWNER, ADULT], "adult"), ADULT)).toBe(true);
  });

  it("en famille, l'objectif d'un autre se montre", () => {
    expect(canSeeGoalOf(household("family", [OWNER, KID]), KID)).toBe(true);
  });
});

describe("restrictionNotice — la décision est attribuée, jamais anonyme", () => {
  it("le restreint lit QUI a décidé", () => {
    // §8.5 règle 4: une restriction parentale présentée sans auteur se lit
    // comme un jugement du produit — et le jour où l'enfant découvre que
    // « ce n'est pas bon pour toi » voulait dire « ton père n'en veut pas »,
    // plus rien de ce que dit Sophia n'a de poids.
    const hh = household("family", [OWNER, KID], "kid");
    const got = restrictionNotice(hh, {
      id: "r1", memberUserId: "kid", label: "nutella", createdByUserId: "owner",
    });
    expect(got).toEqual({ kind: "set_by_owner", ownerName: "owner" });
  });

  it("le compte maître voit que c'est lui", () => {
    const hh = household("family", [OWNER, KID]);
    const got = restrictionNotice(hh, {
      id: "r1", memberUserId: "kid", label: "nutella", createdByUserId: "owner",
    });
    expect(got).toEqual({ kind: "set_by_me" });
  });

  it("un auteur qui a quitté le foyer ne casse pas l'affichage", () => {
    const hh = household("family", [OWNER, KID], "kid");
    const got = restrictionNotice(hh, {
      id: "r1", memberUserId: "kid", label: "nutella", createdByUserId: "parti",
    });
    expect(got).toEqual({ kind: "set_by_owner", ownerName: "" });
  });
});

describe("envyRound — le silence est un état, pas une attente", () => {
  it("sépare ceux qui ont parlé de ceux qui se sont tus", () => {
    const hh = household("family", [OWNER, ADULT, KID]);
    expect(envyRound(hh, [{ userId: "kid" }])).toEqual({
      spoken: ["kid"],
      silent: ["owner", "adult"],
    });
  });

  it("un foyer entièrement muet reste un foyer valide", () => {
    // Aucun statut « en attente » n'existe: si l'écran en inventait un, celui
    // qui tient le foyer se croirait obligé de relancer tout le monde — et on
    // aurait recréé la charge mentale qu'on promet de supprimer.
    const hh = household("family", [OWNER, ADULT]);
    expect(envyRound(hh, [])).toEqual({ spoken: [], silent: ["owner", "adult"] });
  });

  it("l'ordre suit le foyer, pas l'ordre d'arrivée", () => {
    const hh = household("family", [OWNER, ADULT, KID]);
    const got = envyRound(hh, [{ userId: "kid" }, { userId: "owner" }]);
    expect(got.spoken).toEqual(["owner", "kid"]);
  });
});
