import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  awayFrom,
  claimableMembers,
  goalsForAge,
  type HouseholdMemberView,
  type HouseholdView,
  MEMBER_GOALS,
  mergeCounterparts,
  MINOR_FORBIDDEN_GOALS,
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

/**
 * ══════════════════════════════════════════════════════════════════════════
 * `mergeCounterparts` — AVEC QUI UNE FUSION EST SEULEMENT CONCEVABLE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le MIROIR de `claimableMembers`, et les deux ne se recouvrent jamais: l'une
 * rend les bouches qui n'ont pas de compte, l'autre celles qui en ont un — sauf
 * le maître. C'est la condition de MONTAGE de la carte de proposition, pas un
 * filtre d'affichage: sur un foyer où personne n'a réclamé son profil, la carte
 * rendait un état vide, un plafond intact et le nom d'une bouche suivi d'un
 * reproche pour une chose qu'elle ne peut pas faire (mesuré le 2026-08-14).
 */
describe("mergeCounterparts — la fusion n'existe qu'entre profils réclamés", () => {
  it("le maître SEUL ne compte pas — sinon la garde ne garde rien", () => {
    // ⚠️ LE CAS QUI FAIT TOUT LE TEST. Le maître a TOUJOURS un compte: un
    // filtre qui oublierait `role !== "owner"` rendrait `[owner]` ici, donc
    // `true` pour n'importe quel foyer du produit, et la carte se remonterait
    // partout sans que rien ne le signale.
    expect(mergeCounterparts(household([OWNER, KID]))).toEqual([]);
  });

  it("une bouche sans compte ne compte pas", () => {
    // Elle ne compose rien: pas de plan à elle, donc rien à fusionner. Et
    // aucun geste du maître n'y changera quoi que ce soit.
    const hh = household([OWNER, KID, member("bebe", { userId: null })]);
    expect(mergeCounterparts(hh)).toEqual([]);
  });

  it("un second adulte AVEC COMPTE fait exister le bloc", () => {
    const hh = household([OWNER, ADULT, KID]);
    expect(mergeCounterparts(hh).map((m) => m.memberId)).toEqual(["adult"]);
  });

  it("un foyer absent ne fait pas exploser l'écran", () => {
    expect(mergeCounterparts(null)).toEqual([]);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CÂBLAGE — sans lui, les quatre tests d'au-dessus sont verts pour rien.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ils prouvent qu'une fonction rend la bonne liste; ils ne prouvent pas qu'un
 * écran l'APPELLE. C'est la cicatrice de `planRefusals.int.test.ts` (« deux
 * compositions parfaites de tables parfaites »), et elle vaut ici: le jour où
 * quelqu'un remonte `<HouseholdMergeCard isOwner={…} />` sans la garde, la
 * carte revient sur tous les foyers sans profil réclamé et rien ne le dit.
 *
 * ⚠️ COMMENTAIRES RETIRÉS. Ce dépôt a mesuré qu'un grep naïf compte les morts:
 * les trois fichiers touchés PARLENT de la règle en commentaire, et un
 * `includes` sur la source brute serait vert même le code retiré.
 */
describe("la carte de fusion est gatée sur un profil réclamé (câblage)", () => {
  const ROOT = resolve(__dirname, "../../../..");

  function code(rel: string): string {
    return readFileSync(resolve(ROOT, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .split("\n")
      .map((line) => {
        const at = line.indexOf("//");
        if (at < 0) return line;
        if (at > 0 && line[at - 1] === ":") return line;
        return line.slice(0, at);
      })
      .join("\n");
  }

  it("l'écran du foyer lit `mergeCounterparts` et le passe à la carte", () => {
    const src = code("frontend/src/keel/pages/HouseholdPage.tsx");
    expect(src, "la garde n'est plus lue").toContain("mergeCounterparts(household)");
    expect(src, "la carte se monte sans sa garde").toMatch(
      /hasCounterpart=\{mergeCounterparts\(household\)\.length > 0\}/,
    );
  });

  it("la carte se tait AVANT de lire, pas après", () => {
    const src = code("frontend/src/keel/components/HouseholdMergeCard.tsx");
    // La garde de rendu.
    expect(src, "le rendu n'est plus gaté").toMatch(
      /if \(!hasCounterpart\) return null;/,
    );
    // ET la garde de LECTURE: un appel edge par montage, pour une réponse
    // qu'on ne rendrait pas, est un coût sans lecteur.
    expect(src, "la lecture edge part quand même").toMatch(
      /if \(!isOwner \|\| !hasCounterpart\) return;/,
    );
  });

  it("aucune bouche n'est nommée pour une absence qu'elle ne peut pas combler", () => {
    const src = code("frontend/src/keel/components/HouseholdMergeCard.tsx");
    // « Christèle — cette personne n'a validé aucun plan à elle » explique une
    // absence à quelqu'un qui ne peut rien en faire: seul le titulaire peut
    // valider un plan à lui, et il ne lit pas cet écran-là.
    expect(src, "le reproche est revenu dans la liste « non proposés »")
      .toContain('s.reason !== "no_validated_plan"');
  });

  it("le plafond ne s'affiche qu'une fois entamé", () => {
    const src = code("frontend/src/keel/components/HouseholdMergeCard.tsx");
    // « il reste 4 fusions sur 4 » n'est pas un fait, c'est la définition du
    // plafond. `used > 0` est la condition, et pas `remaining < limit`: ce
    // fichier ne refait jamais l'arithmétique comptée en base.
    expect(src, "le plafond intact se raconte de nouveau")
      .toContain("quota && quota.used > 0");
  });
});

describe("awayFrom — les deux sources d'une absence, séparées (D14)", () => {
  /**
   * ⚠️ LE DÉFAUT QUE CES TESTS EXISTENT POUR ATTRAPER n'est pas visible à
   * l'écran: si la vue « marqué par le maître » contenait aussi ce que la
   * personne a déclaré, la grille — qui réécrit TOUJOURS ce qu'on lui donne —
   * recopierait sa déclaration dans la colonne du foyer au premier
   * enregistrement. L'absence survivrait alors à sa rétractation, et personne
   * ne saurait d'où elle vient.
   */
  const TAGGED = [
    { day: "sun", source: "self" },
    { day: "thu", slots: ["lunch"], source: "household" },
  ];

  it("ne rend que la source demandée", () => {
    expect(awayFrom(TAGGED, "household")).toEqual([
      { day: "thu", slots: ["lunch"] },
    ]);
    expect(awayFrom(TAGGED, "self")).toEqual([{ day: "sun", slots: [] }]);
  });

  it("une entrée sans source n'appartient à personne", () => {
    // Elle compte quand même côté MOTEUR (l'union se lit sur le tableau
    // entier); ce qu'on ne sait pas attribuer ne doit pas devenir modifiable
    // par le maître pour autant.
    expect(awayFrom([{ day: "fri" }], "household")).toEqual([]);
    expect(awayFrom([{ day: "fri" }], "self")).toEqual([]);
  });

  it("un jour inconnu tombe sans emporter les autres (FF-002 §7)", () => {
    expect(
      awayFrom(
        [
          { day: "caturday", source: "household" },
          { day: "wed", source: "household" },
        ],
        "household",
      ),
    ).toEqual([{ day: "wed", slots: [] }]);
  });

  it("une colonne illisible ne fait pas exploser l'écran", () => {
    expect(awayFrom(null, "household")).toEqual([]);
    expect(awayFrom("samedi", "self")).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LA DIRECTION D'UN ENFANT — trois copies d'une liste, confrontées sur le disque
// ───────────────────────────────────────────────────────────────────────────

/**
 * ── CE QUE CE BLOC GARDE, ET POURQUOI IL LIT DES FICHIERS ─────────────────
 * Décision humaine du 2026-08-13: un enfant PEUT porter une direction
 * nutritionnelle — mais jamais `fat_loss` ni `recomposition`, les deux du
 * registre qui RETIRE (PIVOT-FOYER §8.4: « jamais correctif sur le corps »).
 *
 * Cette règle vit à TROIS endroits, parce que le navigateur, Deno et SQL ne
 * partagent aucun module:
 *
 *   1. ici, pour ce que l'écran PROPOSE;
 *   2. `_shared/keel/household.ts#MINOR_FORBIDDEN_GOALS`, pour ce que le
 *      moteur APPLIQUE;
 *   3. la migration `20260813180000`, pour ce que la base ACCEPTE D'ÉCRIRE.
 *
 * Une liste recopiée trois fois dérive, et la dérive est MUETTE: rouvrir
 * `fat_loss` aux enfants d'un seul côté ne casse rien, ne se voit nulle part, et
 * se découvre le jour où un parent lit « perdre du poids » sous le prénom de son
 * fils. Ce test lit les deux autres copies SUR LE DISQUE — la même technique que
 * le catalogue de l'entonnoir, qui résout ses consommateurs de la même façon.
 */
describe("les directions qu'un mineur ne porte jamais", () => {
  const ROOT = resolve(__dirname, "../../../..");

  it("propose tout à un adulte, et retire les deux correctrices à un enfant", () => {
    expect([...goalsForAge("adult")]).toEqual([...MEMBER_GOALS]);
    expect([...goalsForAge("child")]).toEqual([
      "muscle_gain",
      "performance",
      "health",
      "maintenance",
    ]);
    // Ce que l'ouverture a rendu possible, dit explicitement: sans cette ligne,
    // un `goalsForAge` qui rendrait `[]` pour un enfant passerait le test
    // ci-dessus le jour où quelqu'un « restaure » l'ancienne règle.
    expect(goalsForAge("child").length).toBeGreaterThan(0);
  });

  it("dit la MÊME chose que le moteur (`_shared/keel/household.ts`)", () => {
    const deno = readFileSync(
      resolve(ROOT, "supabase/functions/_shared/keel/household.ts"),
      "utf8",
    );
    const block = deno.slice(deno.indexOf("MINOR_FORBIDDEN_GOALS"));
    for (const goal of MINOR_FORBIDDEN_GOALS) {
      expect(block.slice(0, block.indexOf("];"))).toContain(`"${goal}"`);
    }
    // Et l'inverse: aucune direction interdite côté moteur qui serait proposée
    // ici. C'est le sens qui compte — celui où l'écran est plus permissif.
    for (const goal of MEMBER_GOALS) {
      if (block.slice(0, block.indexOf("];")).includes(`"${goal}"`)) {
        expect(goalsForAge("child")).not.toContain(goal);
      }
    }
  });

  it("dit la MÊME chose que la base (migration 20260813180000)", () => {
    const sql = readFileSync(
      resolve(ROOT, "supabase/migrations/20260813180000_minor_may_carry_a_direction.sql"),
      "utf8",
    );
    // Le refus est nommé, et il porte sur exactement ces deux jetons — DEUX
    // fois, parce qu'il y a deux portes d'écriture et qu'une garde sur une
    // seule laisse l'autre ouverte.
    const guards = sql.split("goal_not_for_minor").length - 1;
    expect(guards).toBeGreaterThanOrEqual(2);
    for (const goal of MINOR_FORBIDDEN_GOALS) {
      expect(sql).toContain(`'${goal}'`);
    }
    for (const goal of goalsForAge("child")) {
      expect(sql).not.toContain(`in ('${goal}'`);
    }
  });
});
