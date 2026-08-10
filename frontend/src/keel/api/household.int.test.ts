import { describe, expect, it } from "vitest";

import {
  claimableMembers,
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
 * ── ET CE QU'IL NE TESTE PLUS DEPUIS LE LOT 5 ──────────────────────────────
 *
 * `envyRound` (quatre cas sur qui a parlé et qui s'est tu) est partie avec le
 * conseil de famille. Les envies sont UNE ligne écrite par le compte maître
 * pour tout le monde: il n'y a plus de tour de table à compter, donc plus rien
 * à décider au navigateur. Le refus d'écriture d'un non-maître est affirmé là
 * où il vit — en base, par `household_rls_test.sql` (assertions 30 à 34).
 *
 * Ce qui reste ici est ce que l'écran DÉCIDE encore vraiment: attribuer une
 * décision à un humain, et savoir quelle bouche reste à réclamer.
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
// `null`, et c'est ce qui fait d'elle la seule ligne encore RÉCLAMABLE du
// foyer (lot 6).
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

  it("un auteur EFFACÉ n'est attribué à personne — surtout pas à l'enfant", () => {
    // ⚠️ LE PIÈGE DU CHANTIER 2. Depuis que `created_by` peut être NULL (purge
    // RGPD du compte de l'auteur), un `find` naïf compare `null === null` et
    // rend la PREMIÈRE bouche sans compte du foyer — c'est-à-dire, ici,
    // l'enfant que la règle restreint. L'écran lui dirait alors « tu t'es
    // restreint toi-même », ce qui est faux et indémentable.
    //
    // Deux inconnues ne sont pas la même personne. On n'attribue rien.
    const hh = household([OWNER, KID], "kid");
    const got = restrictionNotice(hh, {
      id: "r1", memberId: "kid", label: "nutella", createdByUserId: null,
    });
    expect(got).toEqual({ kind: "set_by_owner", ownerName: "" });
  });

  it("et pas non plus à MOI quand je n'ai pas de compte sur ma ligne", () => {
    // Le miroir du cas précédent: la personne qui REGARDE est la bouche sans
    // compte. `me?.userId` vaut `null`, l'auteur aussi: un `me && …` absent
    // ferait dire « c'est toi qui l'as décidé » à un enfant de huit ans.
    const hh = household([OWNER, KID], "kid");
    const got = restrictionNotice(hh, {
      id: "r1", memberId: "kid", label: "nutella", createdByUserId: null,
    });
    expect(got.kind).toBe("set_by_owner");
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
