/**
 * LA PART DU RÉCLAMÉ — LES CAS QUI EXISTENT VRAIMENT.
 *
 * Ce test n'épingle pas « la fonction trouve un élément dans un tableau ». Il
 * épingle les états que le produit produit réellement, chacun avec la raison
 * qui rend sa réponse obligatoire. Une garde a besoin d'un cas qui PASSE, sinon
 * elle bloque tout en ressemblant à une garde qui marche.
 *
 * ── LES DONNÉES VIENNENT DE LA BASE, PAS D'UNE IDÉE DE FOYER ──────────────
 * Les lignes ci-dessous sont recopiées du foyer « Bramble »
 * (`80e9af4c-50f0-4f86-b55d-f6812e19aabc`), plan `household`
 * `ddfd02b4-d9c3-4347-94ea-b6e47311b8b2`, lu le 2026-08-13: Paul (maître, sans
 * objectif), Lea (mineure, sans compte), Zoe (réclamée, `muscle_gain`). Les
 * `member_id` et les `portion_note` sont les vrais — une fixture inventée
 * n'aurait pas montré que Zoe est TROISIÈME dans le tableau, ce qui est
 * exactement ce qui distingue « trouve ma ligne » de « rend la première ».
 */

import { describe, expect, it } from "vitest";

import type { MemberPortionView } from "./household";
import { selectMyShare, sharePresentedTo } from "./myShare";

const PAUL = "ccd60869-fd8f-4e2c-a404-6a72196beec6";
const LEA = "fb50c0f7-03e4-40e8-8857-f7f5f3c72775";
const ZOE = "1c5f728d-dce4-4642-ac99-50732c837914";
/** Nina est réclamée elle aussi, mais elle n'est PAS dans ce plan-ci. */
const NINA = "65f72624-1d0f-4382-84ea-4cb666d71375";

const PORTIONS: readonly MemberPortionView[] = [
  {
    memberId: PAUL,
    displayName: "Paul",
    portionNote:
      "Serve one balanced plate: a standard share of the protein, starch and vegetables, with the side included as listed.",
    shares: [{
      preparationId: "prep_traybake",
      note: "One standard serving of chicken, potatoes and courgettes.",
    }],
  },
  {
    memberId: LEA,
    displayName: "Lea",
    portionNote:
      "Serve a child-size plate: a smaller scoop of the main components, with the same vegetables as everyone else.",
    shares: [{
      preparationId: "prep_traybake",
      note: "A smaller serving from the traybake, with fewer potatoes and chicken.",
    }],
  },
  {
    memberId: ZOE,
    displayName: "Zoe",
    portionNote:
      "Serve a larger plate: extra chicken and potatoes, with the same vegetables as everyone else.",
    shares: [{
      preparationId: "prep_traybake",
      note: "A larger serving from the traybake, with extra chicken and potatoes.",
    }],
  },
];

describe("quelle ligne de `member_portions` est la mienne", () => {
  it("un secondaire réclamé retrouve SA ligne, où qu'elle soit dans le tableau", () => {
    // LE CAS QUI PASSE. Zoe est la TROISIÈME entrée: une implémentation qui
    // rendrait `portions[0]` passerait tous les autres cas de ce fichier et
    // servirait à Zoe l'assiette de Paul.
    const mine = selectMyShare({ portions: PORTIONS, meMemberId: ZOE, isOwner: false });
    expect(mine?.memberId).toBe(ZOE);
    expect(mine?.displayName).toBe("Zoe");
    expect(mine?.shares).toHaveLength(1);
  });

  it("le maître ne reçoit RIEN, alors que sa ligne existe", () => {
    // ⚠️ CE N'EST PAS UNE ABSENCE DE DONNÉE. Paul EST dans `member_portions`,
    // avec une part calculée comme celle des autres — le premier élément du
    // tableau ci-dessus. Ce qu'il n'a pas, c'est une part à VALIDER: il a le
    // plan. Une carte « Ta part / Je valide » sous le formulaire qu'il vient
    // d'envoyer lui demanderait de valider son propre geste.
    expect(PORTIONS.some((p) => p.memberId === PAUL)).toBe(true);
    expect(selectMyShare({ portions: PORTIONS, meMemberId: PAUL, isOwner: true })).toBeNull();
  });

  it("une place non lue ferme la carte", () => {
    // `meMemberId === null` = « on ne sait pas encore de qui est cette
    // ligne ». Un défaut permissif afficherait la part de quelqu'un d'autre
    // pendant le temps d'un chargement, et un temps de chargement suffit à
    // lire une phrase.
    expect(selectMyShare({ portions: PORTIONS, meMemberId: null, isOwner: false })).toBeNull();
  });

  it("un membre absent du plan n'a rien à voir, et rien à valider", () => {
    // ÉTAT RÉEL, MESURÉ: le plan de foyer vivant le plus récent de « Bramble »
    // (`38f60307`, fenêtre du 19 août) ne porte QU'UNE ligne — celle de Nina.
    // Zoe, réclamée elle aussi, n'y est pas. La carte se tait plutôt que
    // d'inventer une part standard: « pas de part » et « une part ordinaire »
    // ne sont pas la même phrase.
    expect(selectMyShare({ portions: PORTIONS, meMemberId: NINA, isOwner: false })).toBeNull();
  });

  it("un plan sans aucune part ne rend rien à personne", () => {
    // Il en existe en base: `3fca2ea0`, plan `household` du 1er août, zéro
    // `member_portions`.
    expect(selectMyShare({ portions: [], meMemberId: ZOE, isOwner: false })).toBeNull();
  });
});

describe("la garde d'identité — jamais la part d'un autre", () => {
  it("laisse passer MA ligne", () => {
    const row = PORTIONS[2];
    expect(sharePresentedTo({ mine: row, meMemberId: ZOE })).toBe(row);
  });

  it("REFUSE une ligne qu'on lui tend au nom de quelqu'un d'autre", () => {
    // LE CAS QUI MORD, et c'est le seul qui compte: les deux lignes ont
    // exactement la même forme, et une instruction de service est plausible
    // pour n'importe qui. Rien à l'écran ne trahirait la substitution — la
    // seule chose qui distingue les deux lignes est `member_id`.
    expect(sharePresentedTo({ mine: PORTIONS[0], meMemberId: ZOE })).toBeNull();
  });

  it("se tait tant que la bouche n'est pas connue", () => {
    expect(sharePresentedTo({ mine: PORTIONS[2], meMemberId: null })).toBeNull();
    expect(sharePresentedTo({ mine: PORTIONS[2], meMemberId: "" })).toBeNull();
  });

  it("se tait quand il n'y a pas de ligne", () => {
    expect(sharePresentedTo({ mine: null, meMemberId: ZOE })).toBeNull();
  });
});
