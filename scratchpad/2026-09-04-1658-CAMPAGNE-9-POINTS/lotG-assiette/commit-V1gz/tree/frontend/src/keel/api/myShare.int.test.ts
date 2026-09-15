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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

/**
 * ══════════════════════════════════════════════════════════════════════════
 * A8.1 — LA CARTE GAGNE DES CASES, ET LA MÊME RÈGLE LES FERME AU MAÎTRE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `selectMyShare` est éprouvée plus haut, sur les vraies données: le maître
 * ne reçoit RIEN alors que sa ligne existe. Ce qui suit tient l'autre moitié —
 * que ce refus gouverne AUSSI les cases, et pas seulement le texte de la
 * carte. La distinction n'est pas théorique: une carte peut se taire pendant
 * qu'une case, montée à côté, écrirait quand même.
 *
 * Ces épreuves lisent la SOURCE, parce que ce dépôt ne monte pas de composants
 * en test (aucune dépendance de rendu). Elles tiennent donc un CÂBLAGE, pas un
 * pixel — et c'est exactement ce qui a manqué aux deux fois où un lecteur de
 * foyer a rendu la ligne de quelqu'un d'autre.
 */
describe("A8.1 — les cases de « ta part »", () => {
  const ROOT = resolve(__dirname, "../../../..");
  /**
   * ⚠️ COMMENTAIRES DÉPOUILLÉS, ET CE N'EST PAS UNE COMMODITÉ. Ce fichier
   * DÉCRIT dans ses commentaires les formes qu'il refuse d'écrire
   * (« `myDishes[dishIndex]` serait un AUTRE plat »). Une épreuve qui les lit
   * rougirait sur la phrase qui explique l'interdit — mesuré ici même, du
   * premier coup. Cicatrice `documented-constraints-outlive-their-cause`:
   * grep les commentaires avant de conclure.
   *
   * ⚠️ ET LES BLOCS D'ABORD, LES LIGNES ENSUITE. Un `{ /* … *\/ }` de JSX est
   * un cas du motif de bloc; l'ordre inverse laisserait des fragments.
   */
  const card = readFileSync(
    resolve(ROOT, "frontend/src/keel/components/plan/MyShareCard.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("LE CAS QUI PASSE — la carte lie bien des cases", () => {
    expect(card, "`MyShareCard` ne lie plus aucune case").toContain("bindTick={");
    expect(card, "elle ne passe plus par la liaison unique").toContain(
      "useMealTicks({",
    );
  });

  it("⛔ LA CASE EST FERMÉE AU MAÎTRE PAR LE MÊME `share` QUE LA CARTE", () => {
    // La carte rend `null` sur `!share`, et `share` vient de `sharePresentedTo`
    // — la garde d'identité. Comme les cases sont rendues DANS la carte, le
    // refus du maître (`selectMyShare` ⇒ `null` ⇒ `share` ⇒ `null`) les ferme
    // aussi, par construction. C'est ce qu'on épingle: l'absence d'une seconde
    // porte.
    //
    // MUTATION QUI DOIT ROUGIR: sortir la liste (et donc les cases) de la
    // carte, ou rendre la liste avant le `if (!share) return null;`.
    const guard = card.indexOf("if (!share) return null;");
    const list = card.indexOf("<DishListByDay");
    expect(guard, "la garde d'identité a disparu de la carte").toBeGreaterThan(-1);
    expect(list, "la liste a disparu de la carte").toBeGreaterThan(-1);
    expect(
      guard,
      "la liste (et ses cases) est rendue AVANT la garde d'identité: le " +
        "maître, ou quelqu'un dont la place n'est pas encore lue, verrait des " +
        "cases sur des plats qui ne sont pas les siens",
    ).toBeLessThan(list);
  });

  it("⛔ LES PLATS COCHABLES SONT LES SIENS — `dishIsFor`, pas un second filtre", () => {
    // La règle « ce plat est-il pour moi » vit à UN endroit
    // (`planByPersonModel.dishIsFor`). Un filtre réécrit ici divergerait, et
    // la divergence mettrait une case sous le plat dédié d'un autre.
    expect(card, "un second filtre a été écrit à côté de `dishIsFor`").toContain(
      "dishIsFor(d, share?.memberId ?? null)",
    );
    // ET L'IDENTITÉ VIENT DE `share`, PAS DE LA PROP BRUTE: `sharePresentedTo`
    // a déjà vérifié que la ligne tenue est bien la mienne.
    expect(card).not.toContain("dishIsFor(d, meMemberId)");
  });

  it("⛔ LA POSITION VIENT DU PLAN, JAMAIS DU RANG D'AFFICHAGE", () => {
    // `myDishes` est filtrée puis regroupée puis triée par moment:
    // `myDishes[dishIndex]` serait un AUTRE plat, et la coche porterait le
    // titre de quelqu'un d'autre dans une ligne datée.
    //
    // MUTATION QUI DOIT ROUGIR: `myDishes[dishIndex]` à la place du `find`.
    expect(card, "le plat n'est plus retrouvé par sa position dans le plan")
      .toContain("myDishes.find((d) => d.dishIndex === dishIndex)");
    expect(card, "le plat est repris par son rang d'affichage")
      .not.toMatch(/myDishes\[\s*dishIndex\s*\]/);
  });
});
