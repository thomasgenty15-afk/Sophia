import { describe, expect, it } from "vitest";

import {
  claimableMembers,
  envyRound,
  type HouseholdMemberView,
  type HouseholdView,
  restrictionNotice,
} from "./household";

/**
 * ── CE QUE CE FICHIER NE TESTE PLUS (lots 1 et 2, 2026-08-10) ───────────────
 *
 * Il couvrait `restrictionBlock` (sept cas sur le pouvoir de restreindre),
 * `isMinorBirthDate` (quatre cas sur l'âge relu au navigateur) et
 * `canSeeGoalOf` (trois cas sur la visibilité en colocation). Les trois
 * fonctions sont parties avec leur sujet:
 *
 *   — le CONSENTEMENT du majeur n'existe plus (le compte maître gouverne, et la
 *     contrepartie est que qui a posé la règle reste affiché — c'est
 *     `restrictionNotice`, toujours testée plus bas);
 *   — la COLOCATION est sortie du produit;
 *   — l'ÂGE est dérivé EN BASE, à trois états. Une seconde définition au
 *     navigateur divergerait au premier ajustement, et personne ne saurait
 *     alors laquelle ment.
 *
 * Ce qui reste ici est ce que l'écran DÉCIDE encore vraiment: attribuer une
 * décision à un humain, et compter qui a parlé cette semaine.
 */

/**
 * ⚠️ L'IDENTIFIANT DE MEMBRE DIFFÈRE DE L'IDENTIFIANT DE COMPTE, ET C'EST LE
 * POINT DE CETTE FIXTURE (corrigé au lot 6).
 *
 * La rédaction précédente écrivait `userId = memberId`. Une fonction qui aurait
 * confondu les deux — rendre un `memberId` là où un `userId` est attendu,
 * chercher une restriction par le mauvais identifiant — passait tous les tests
 * de ce fichier sans exception. Depuis le lot 1 les deux clés coexistent sur la
 * même ligne, et c'est exactement la classe d'erreur qu'un décor doit rendre
 * impossible plutôt que probable.
 */
function member(
  memberId: string,
  opts: {
    role?: "owner" | "member";
    /** `null` = bouche sans compte. C'est le cas nominal d'un enfant. */
    userId?: string | null;
    ageState?: "minor" | "adult" | "unknown";
  } = {},
): HouseholdMemberView {
  return {
    memberId,
    userId: opts.userId === undefined ? `acct-${memberId}` : opts.userId,
    displayName: memberId,
    role: opts.role ?? "member",
    ageState: opts.ageState ?? "adult",
    goal: null,
  };
}

function household(
  members: HouseholdMemberView[],
  meId = "owner",
): HouseholdView {
  return {
    id: "hh",
    name: "Maison",
    members,
    me: members.find((m) => m.memberId === meId) ?? null,
  };
}

const OWNER = member("owner", { role: "owner" });
// LÉA N'A PAS DE COMPTE — le cas nominal depuis le lot 1. Son `userId` est
// `null`, et c'est ce qui fait qu'elle ne compte ni parmi ceux qui ont parlé ni
// parmi les silencieux: on ne reproche pas un silence à qui n'a pas de voix.
const KID = member("kid", { ageState: "minor", userId: null });
const ADULT = member("adult");

describe("restrictionNotice — la décision est attribuée, jamais anonyme", () => {
  it("le restreint lit QUI a décidé", () => {
    // §8.5 règle 4: une restriction parentale présentée sans auteur se lit
    // comme un jugement du produit — et le jour où l'enfant découvre que
    // « ce n'est pas bon pour toi » voulait dire « ton père n'en veut pas »,
    // plus rien de ce que dit Sophia n'a de poids.
    const hh = household([OWNER, KID], "kid");
    const got = restrictionNotice(hh, {
      // L'AUTEUR EST UN COMPTE, pas une bouche: `restrictionNotice` cherche
      // dans `members` par `userId`. Avec l'ancienne fixture (userId ===
      // memberId) une implémentation qui aurait cherché par `memberId` passait.
      id: "r1", memberId: "kid", label: "nutella", createdByUserId: "acct-owner",
    });
    expect(got).toEqual({ kind: "set_by_owner", ownerName: "owner" });
  });

  it("le compte maître voit que c'est lui", () => {
    const hh = household([OWNER, KID]);
    const got = restrictionNotice(hh, {
      id: "r1", memberId: "kid", label: "nutella", createdByUserId: "acct-owner",
    });
    expect(got).toEqual({ kind: "set_by_me" });
  });

  it("un auteur qui a quitté le foyer ne casse pas l'affichage", () => {
    const hh = household([OWNER, KID], "kid");
    const got = restrictionNotice(hh, {
      id: "r1", memberId: "kid", label: "nutella", createdByUserId: "parti",
    });
    expect(got).toEqual({ kind: "set_by_owner", ownerName: "" });
  });
});

describe("envyRound — le silence est un état, pas une attente", () => {
  it("sépare ceux qui ont parlé de ceux qui se sont tus", () => {
    const hh = household([OWNER, ADULT, KID]);
    // Les deux listes sont des identifiants de COMPTE — c'est ce que la table
    // des envies porte (`household_envy_submissions.user_id`).
    expect(envyRound(hh, [{ userId: "acct-adult" }])).toEqual({
      spoken: ["acct-adult"],
      silent: ["acct-owner"],
    });
  });

  it("⚠️ une bouche SANS COMPTE n'est ni parlante ni silencieuse", () => {
    // Léa a huit ans: elle n'a pas de compte, donc aucun moyen de soumettre une
    // envie. La compter parmi les silencieux reprocherait un silence à
    // quelqu'un qui n'a pas de voix — et gonflerait un compteur que celui qui
    // tient le foyer lit comme « il en reste trois à relancer ». C'est
    // exactement la charge mentale que le produit promet de supprimer.
    const hh = household([OWNER, ADULT, KID]);
    const got = envyRound(hh, []);
    expect(got.silent).toEqual(["acct-owner", "acct-adult"]);
    expect(got.spoken).toEqual([]);
    expect([...got.spoken, ...got.silent]).not.toContain("kid");
    expect([...got.spoken, ...got.silent]).not.toContain("acct-kid");
  });

  it("un foyer entièrement muet reste un foyer valide", () => {
    // Aucun statut « en attente » n'existe: si l'écran en inventait un, celui
    // qui tient le foyer se croirait obligé de relancer tout le monde — et on
    // aurait recréé la charge mentale qu'on promet de supprimer.
    const hh = household([OWNER, ADULT]);
    expect(envyRound(hh, [])).toEqual({
      spoken: [],
      silent: ["acct-owner", "acct-adult"],
    });
  });

  it("l'ordre suit le foyer, pas l'ordre d'arrivée", () => {
    const hh = household([OWNER, ADULT]);
    const got = envyRound(hh, [{ userId: "acct-adult" }, { userId: "acct-owner" }]);
    expect(got.spoken).toEqual(["acct-owner", "acct-adult"]);
  });
});

describe("claimableMembers — on n'invite que ce qui reste à réclamer (lot 6)", () => {
  it("ne propose que les bouches SANS COMPTE", () => {
    // ⚠️ LA FIXTURE DISTINGUE MEMBRE ET COMPTE. `member("kid", {userId: null})`
    // porte un `memberId` et pas de `userId`: c'est exactement l'état d'une
    // bouche saisie par le maître, et c'est le seul cas que la base accepte
    // d'inviter (`already_claimed` sinon).
    const hh = household([OWNER, ADULT, KID]);
    expect(claimableMembers(hh).map((m) => m.memberId)).toEqual(["kid"]);
  });

  it("un foyer entièrement réclamé ne propose personne", () => {
    // Ce cas N'EST PAS théorique: c'est l'état d'un couple où les deux ont un
    // compte. L'écran doit alors DIRE qu'il n'y a personne à inviter plutôt que
    // d'ouvrir un menu vide — un sélecteur sans option se lit comme une panne.
    const hh = household([OWNER, ADULT]);
    expect(claimableMembers(hh)).toEqual([]);
  });

  it("un foyer absent ne fait pas exploser l'écran", () => {
    expect(claimableMembers(null)).toEqual([]);
  });
});
