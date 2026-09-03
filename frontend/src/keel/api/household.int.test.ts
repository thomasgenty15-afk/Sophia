import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  awayFrom,
  claimableMembers,
  goalForAge,
  goalsForAge,
  isDirectionalGoal,
  type HouseholdMemberView,
  type HouseholdView,
  MEMBER_GOALS,
  mergeCounterparts,
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
 * ⚠️ CE BLOC A ÉTÉ RETOURNÉ DEUX FOIS, ET IL GARDE LES DEUX DATES.
 *
 * Le 2026-08-18 il affirmait « la même liste pour un adulte et un enfant »
 * (renversement de la règle du 13/08, trois copies supprimées ensemble). Le
 * 2026-09-03 (chantier P3, décision D3.2) il affirme l'inverse — parce que la
 * BASE a changé d'avis entre les deux, le 2026-08-22 (`20260822041500`, lot
 * S4, « aucun objectif de poids sur un mineur »): les QUATRE portes d'écriture
 * refusent `fat_loss` et `muscle_gain` sur une bouche mineure, et pendant
 * douze jours l'écran a proposé à un enfant deux directions que la base
 * refusait, avec le refus en jeton brut.
 *
 * ⚠️ CE QUE LA LISTE D'UN MINEUR CONTIENT EST LU SUR LE DISQUE, DANS LA
 * MIGRATION — jamais recopié: ce qui lui est retiré est ce que la garde SQL
 * nomme. Un test qui recopierait `["maintenance"]` resterait vert le jour où
 * la base rouvrirait `muscle_gain` — la cicatrice
 * `test-parameterized-by-its-own-constant`, prise par l'autre bout.
 *
 * ⚠️ CE QUI PROTÈGE EN PLUS N'EST PAS UN REFUS D'OBJECTIF, et n'est donc pas
 * testable ici — l'énergie d'un mineur reste une maintenance calculée sur son
 * âge (`meal_envelope_test`), et son corps n'est jamais énoncé (FF-047,
 * `meal_body_test`).
 */
describe("les directions qu'un mineur porte, depuis le 2026-09-03", () => {
  const ROOT = resolve(__dirname, "../../../..");
  const S4 =
    "supabase/migrations/20260822041500_aucun_objectif_de_poids_sur_un_mineur.sql";

  it("un mineur ne voit que `maintenance`; un adulte ET un âge INCONNU voient les trois", () => {
    expect([...goalsForAge("minor")]).toEqual(["maintenance"]);
    expect([...goalsForAge("adult")]).toEqual([
      "fat_loss",
      "maintenance",
      "muscle_gain",
    ]);
    // ⚠️ `unknown` N'EST PAS `minor`: « je ne sais pas » n'est pas « c'est
    // un enfant ». Lire l'inconnu comme un mineur fermerait l'objectif de
    // tout adulte dont on n'a pas encore la date — le cas courant de
    // l'entonnoir. La migration le dit mot pour mot.
    expect([...goalsForAge("unknown")]).toEqual([
      "fat_loss",
      "maintenance",
      "muscle_gain",
    ]);
  });

  it("ce qui est retiré à un mineur est EXACTEMENT ce que la garde SQL refuse", () => {
    const sql = readFileSync(resolve(ROOT, S4), "utf8");
    // Les trois portes d'objectif nomment la même liste — deux formes, une
    // sur la variable d'entrée, une sur la ligne relue.
    const lists = [
      ...sql.matchAll(/(?:p_goal|v_target\.goal) in \(([^)]*)\)/g),
    ].map((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort());
    expect(lists.length, "la garde d'âge a disparu de la migration")
      .toBeGreaterThanOrEqual(3);
    for (const l of lists) expect(l).toEqual(lists[0]);
    const refused = lists[0];
    expect(refused.length).toBeGreaterThan(0);
    // Ce que l'écran propose à un mineur = le vocabulaire MOINS la garde.
    const kept = ["fat_loss", "maintenance", "muscle_gain"].filter((g) =>
      !refused.includes(g)
    );
    expect([...goalsForAge("minor")]).toEqual(kept);
    // Et « directionnel » est la même définition des deux côtés.
    for (const g of refused) expect(isDirectionalGoal(g), g).toBe(true);
    for (const g of kept) expect(isDirectionalGoal(g), g).toBe(false);
  });

  it("`goalForAge` plie une direction refusée à cet âge en `maintenance`, et rien d'autre", () => {
    expect(goalForAge("fat_loss", "minor")).toBe("maintenance");
    expect(goalForAge("muscle_gain", "minor")).toBe("maintenance");
    expect(goalForAge("maintenance", "minor")).toBe("maintenance");
    // « Rien de coché » reste rien de coché: le pli ne fabrique pas un choix.
    expect(goalForAge("", "minor")).toBe("");
    expect(goalForAge("fat_loss", "adult")).toBe("fat_loss");
    expect(goalForAge("fat_loss", "unknown")).toBe("fat_loss");
  });

  it("`isDirectionalGoal` — le CHECK, et rien pour un jeton hors vocabulaire", () => {
    expect(isDirectionalGoal("fat_loss")).toBe(true);
    expect(isDirectionalGoal("muscle_gain")).toBe(true);
    expect(isDirectionalGoal("maintenance")).toBe(false);
    expect(isDirectionalGoal(null)).toBe(false);
    // Retiré le 18/08: jamais écrit (`bad_goal`), donc jamais refusé pour l'âge.
    expect(isDirectionalGoal("recomposition")).toBe(false);
  });

  it("le moteur n'a plus AUCUNE liste d'objectifs interdits aux mineurs", () => {
    // La copie côté Deno est supprimée, pas vidée: une liste vide encore
    // consultée est une branche morte que le prochain lecteur reremplit au
    // hasard. Ce test lit le fichier SUR LE DISQUE, comme avant.
    const deno = readFileSync(
      resolve(ROOT, "supabase/functions/_shared/keel/household.ts"),
      "utf8",
    );
    // ⚠️ ON CHERCHE LA DÉCLARATION, PAS LE MOT. Le fichier NOMME encore la
    // constante disparue dans l'en-tête de `goalApplies` — c'est la trace de
    // ce qui a été levé et par quelle autorité, et une garde levée sans trace
    // est une garde que quelqu'un remettra au hasard.
    expect(deno).not.toContain("export const MINOR_FORBIDDEN_GOALS");
    expect(deno).toContain("2026-08-18");
  });

  it("la base a LEVÉ la garde le 18/08 sur LES DEUX portes, puis l'a REPOSÉE le 22/08 sur les QUATRE", () => {
    // ⚠️ LES DEUX MOITIÉS DE L'HISTOIRE, PARCE QU'ELLE SE RELIT MAL. Le 18/08
    // réécrit les deux portes SANS le refus (`p_goal not in (…)` deux fois,
    // jamais `goal_not_for_minor` en `return`); le 22/08 le repose sur trois
    // portes et pose `target_not_for_minor` sur la quatrième. Un test qui ne
    // lirait qu'un des deux fichiers conclurait le contraire de la vérité.
    const lifted = readFileSync(
      resolve(
        ROOT,
        "supabase/migrations/20260818100000_three_directions_and_a_collected_activity.sql",
      ),
      "utf8",
    );
    for (const door of [
      "keel_household_set_member_goal",
      "keel_household_add_member",
    ]) {
      expect(lifted).toContain(`create or replace function public.${door}`);
    }
    expect(lifted).not.toContain("'reason', 'goal_not_for_minor'");
    const doors = lifted.split("p_goal not in ('fat_loss', 'maintenance', 'muscle_gain')");
    expect(doors.length - 1).toBe(2);

    const reposed = readFileSync(resolve(ROOT, S4), "utf8");
    expect(reposed.split("'reason', 'goal_not_for_minor'").length - 1).toBe(3);
    expect(reposed.split("'reason', 'target_not_for_minor'").length - 1).toBe(1);
    for (const door of [
      "keel_household_add_member",
      "keel_household_set_member_goal",
      "keel_household_set_member_birth_date",
      "keel_household_set_member_target",
    ]) {
      expect(reposed).toContain(`create or replace function public.${door}`);
    }
  });
});

/**
 * ⚠️ LE VOCABULAIRE DU FRONT CONTRE CELUI DE LA BASE — trouvé rouge par la
 * vérification du lot socle le 2026-08-18.
 *
 * ── CE QUI A DÉRIVÉ, ET POURQUOI RIEN NE L'A DIT ──────────────────────────
 * Le lot socle a replié six objectifs sur trois: la migration réécrit les
 * lignes et les CHECK, et les deux portes RPC refusent les trois jetons
 * retirés par `bad_goal`. `MEMBER_GOALS` côté FRONT est resté à six, et c'est
 * cette liste-là que `SetupPage` et `HouseholdPage` déroulent — donc trois
 * `<option>` que la base refuse, mesurées au navigateur.
 *
 * Le seul test qui regardait cette liste comparait `goalsForAge("adult")` à
 * `MEMBER_GOALS`: il est PARAMÉTRÉ PAR SA PROPRE CONSTANTE et reste vert quoi
 * qu'elle contienne. C'est la cicatrice `test-parameterized-by-its-own-constant`,
 * et c'est elle qui a laissé passer la dérive.
 *
 * ── DEUX SOURCES ÉTRANGÈRES, PAS UNE ──────────────────────────────────────
 * On confronte la liste à `GOAL_TOKENS` (le vocabulaire du moteur) ET au
 * CHECK lu sur le disque (ce que la base accepte VRAIMENT à l'écriture).
 * Une seule des deux suffirait à attraper la dérive d'aujourd'hui; les deux
 * ensemble attrapent aussi le jour où le moteur et la base divergeraient
 * entre eux, ce qui est le mode d'échec qu'une troisième copie invite.
 */
describe("le vocabulaire d'objectifs du front est celui de la base", () => {
  const ROOT = resolve(__dirname, "../../../..");

  it("MEMBER_GOALS est EXACTEMENT `GOAL_TOKENS`, ordre compris", () => {
    // Import statique impossible en tête de fichier: le code de PRODUCTION du
    // front ne résout pas `supabase/functions/_shared` (Vite), seuls les tests
    // le peuvent. C'est précisément ce qui fait de `MEMBER_GOALS` une copie,
    // et d'un test la seule chose qui la tienne.
    expect([...MEMBER_GOALS]).toEqual(["fat_loss", "maintenance", "muscle_gain"]);
    expect([...goalsForAge("adult")]).toEqual([
      "fat_loss",
      "maintenance",
      "muscle_gain",
    ]);
    // Et l'âge INCONNU reçoit la même chose, littéralement — pas « la même
    // que l'adulte », qui resterait vrai si les deux devenaient fausses
    // ensemble. (L'enfant, lui, n'en reçoit qu'une depuis le 2026-09-03:
    // voir le bloc juste au-dessus.)
    expect([...goalsForAge("unknown")]).toEqual([
      "fat_loss",
      "maintenance",
      "muscle_gain",
    ]);
  });

  it("aucune option proposée n'est refusée par le CHECK de la base", () => {
    // Le CHECK est lu SUR LE DISQUE, dans la migration qui l'a posé: c'est la
    // seule source qui dise ce que la base accepte à l'écriture. Un jeton
    // proposé à l'écran et absent d'ici est un bouton mort — et sur
    // `setup-goal`, une violation de contrainte PostgreSQL dans un entonnoir
    // d'accueil.
    const sql = readFileSync(
      resolve(
        ROOT,
        "supabase/migrations/20260818100000_three_directions_and_a_collected_activity.sql",
      ),
      "utf8",
    );
    const check = sql.match(
      /add constraint student_goals_goal_check\s*\n\s*check \(goal = any \(array\[([^\]]*)\]\)\);/i,
    );
    expect(check, "le CHECK de `student_goals.goal` doit être lisible dans la migration")
      .not.toBeNull();
    const allowed = [...(check?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(allowed.length).toBeGreaterThan(0);
    for (const goal of MEMBER_GOALS) {
      expect(allowed, `« ${goal} » est proposé à l'écran mais refusé par la base`)
        .toContain(goal);
    }
    // Et l'inverse: un jeton que la base accepte et que l'écran ne propose pas
    // est une direction que personne ne peut plus choisir.
    expect([...allowed].sort()).toEqual([...MEMBER_GOALS].sort());
  });
});
