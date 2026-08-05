import { describe, expect, it } from "vitest";

import { GOAL_TOKENS } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import {
  AXES_BY_GOAL,
  type CoachTerm,
  type FoodGroupRow,
  compileProtocol,
  groupByClass,
  matchesSearch,
  nextStance,
  orderClasses,
  previewSentence,
  publishImpact,
  type StanceOrNeutral,
  suggestAttachment,
  toProtocolInput,
} from "./coachProtocol";

import { en } from "../i18n/en";

/**
 * `/coach/protocol` — les décisions de l'écran, testées sans monter React.
 *
 * Le critère d'acceptation du lot est un CHRONOMÈTRE: un coach neuf doit
 * exprimer sa méthode entière en moins de trois minutes. Ce fichier ne mesure
 * pas le temps — il verrouille les choix qui le rendent possible, et ceux dont
 * l'échec rendrait l'écran menteur plutôt que lent.
 */

const ROWS: FoodGroupRow[] = [
  { slug: "lean_protein", class: "protein", label_i18n_key: "food_group.lean_protein" },
  { slug: "poultry", class: "protein", label_i18n_key: "food_group.poultry" },
  { slug: "leafy_greens", class: "vegetable", label_i18n_key: "food_group.leafy_greens" },
  { slug: "other_added_fat", class: "fat", label_i18n_key: "food_group.other_added_fat" },
  { slug: "alcohol", class: "beverage", label_i18n_key: "food_group.alcohol" },
];

const label = (slug: string) =>
  (en as Record<string, string>)[`food_group.${slug}`] ?? slug;

describe("la pastille tri-etat", () => {
  it("un tap fait defiler, et le cycle se REFERME sur neutre", () => {
    // Sans retour au neutre, un coach qui se trompe est coince et doit chercher
    // un geste d'annulation ailleurs — c'est la que se perdent les minutes.
    let s: StanceOrNeutral = undefined;
    s = nextStance(s);
    expect(s).toBe("encouraged");
    s = nextStance(s);
    expect(s).toBe("discouraged");
    s = nextStance(s);
    expect(s).toBe("excluded");
    s = nextStance(s);
    expect(s).toBeUndefined();
  });

  it("quatre taps ramenent a l'etat de depart, quel qu'il soit", () => {
    for (const start of [undefined, "encouraged", "discouraged", "excluded"] as const) {
      expect(nextStance(nextStance(nextStance(nextStance(start))))).toBe(start);
    }
  });
});

describe("le regroupement par classe", () => {
  it("suit l'ordre dans lequel un coach pense, pas l'alphabet", () => {
    const out = groupByClass(ROWS).map((g) => g.className);
    expect(out).toEqual(["protein", "vegetable", "fat", "beverage"]);
  });

  it("une classe INCONNUE est rendue a la fin, jamais masquee", () => {
    // Un groupe neuf ajoute par migration doit apparaitre meme si personne n'a
    // pense a mettre a jour CLASS_ORDER. Masquer serait perdre silencieusement
    // une partie du vocabulaire — et le coach ne saurait pas qu'il lui manque
    // quelque chose.
    expect(orderClasses(["fat", "seaweed", "protein"])).toEqual([
      "protein",
      "fat",
      "seaweed",
    ]);
  });

  it("les groupes d'une classe sont ordonnes de facon stable", () => {
    const protein = groupByClass(ROWS).find((g) => g.className === "protein")!;
    expect(protein.groups.map((g) => g.slug)).toEqual(["lean_protein", "poultry"]);
    const reversed = groupByClass([...ROWS].reverse()).find(
      (g) => g.className === "protein",
    )!;
    expect(reversed.groups.map((g) => g.slug)).toEqual(["lean_protein", "poultry"]);
  });
});

describe("la recherche", () => {
  const terms: CoachTerm[] = [{ term: "seed oils", food_group_ref: "other_added_fat" }];

  it("trouve par slug et par libelle traduit", () => {
    const greens = ROWS[2];
    expect(matchesSearch(greens, label(greens.slug), [], "leafy")).toBe(true);
    expect(matchesSearch(greens, label(greens.slug), [], "greens")).toBe(true);
    expect(matchesSearch(greens, label(greens.slug), [], "alcohol")).toBe(false);
  });

  it("trouve par le MOT DU COACH", () => {
    // Quelqu'un qui a ecrit « seed oils » doit le retrouver en tapant « seed »,
    // pas en devinant `other_added_fat`.
    const fat = ROWS[3];
    expect(matchesSearch(fat, label(fat.slug), terms, "seed")).toBe(true);
    expect(matchesSearch(fat, label(fat.slug), [], "seed")).toBe(false);
  });

  it("une recherche vide ne cache RIEN", () => {
    // La recherche est un complement, jamais un remplacement: le debutant ne
    // doit jamais tomber sur une page blanche.
    for (const row of ROWS) {
      expect(matchesSearch(row, label(row.slug), [], "   ")).toBe(true);
    }
  });
});

describe("l'apercu", () => {
  it("chaque descripteur du compilateur a une phrase, et chaque cle existe", () => {
    // Une cle manquante fait THROW t() en dev. Un apercu qui plante est pire
    // qu'un apercu absent: il emmene l'ecran entier avec lui.
    const compiled = compileProtocol(
      toProtocolInput(
        {
          stances: {
            leafy_greens: "encouraged",
            alcohol: "discouraged",
            other_added_fat: "excluded",
          },
          timingRules: [
            {
              id: "1",
              rule: {
                template: "portions_per_period",
                direction: "at_least",
                portions: 2,
                period: "day",
                food_group_ref: "leafy_greens",
                goal_scope: [],
                rationale: null,
              },
            },
            {
              id: "2",
              rule: {
                template: "portions_per_period",
                direction: "at_most",
                portions: 3,
                period: "week",
                food_group_ref: "alcohol",
                goal_scope: [],
                rationale: null,
              },
            },
            {
              id: "3",
              rule: {
                template: "group_every_meal",
                food_group_ref: "lean_protein",
                goal_scope: [],
                rationale: null,
              },
            },
            {
              id: "4",
              rule: {
                template: "no_group_after",
                cutoff_local: "21:00",
                food_group_ref: "alcohol",
                goal_scope: [],
                rationale: null,
              },
            },
            {
              id: "5",
              rule: {
                template: "group_at_slot",
                slot_key: "breakfast",
                food_group_ref: "lean_protein",
                goal_scope: [],
                rationale: null,
              },
            },
          ],
          terms: [],
        },
        "c-1",
        "en-GB",
      ),
      null,
    );

    expect(compiled.length).toBe(8);
    const kinds = new Set<string>();
    for (const line of compiled) {
      const sentence = previewSentence(line.preview, label);
      kinds.add(line.preview.kind);
      expect(en).toHaveProperty(sentence.key);
      // Tout placeholder du gabarit doit etre fourni, sinon t() throw en dev.
      const template = (en as Record<string, string>)[sentence.key];
      for (const [, name] of template.matchAll(/\{(\w+)\}/g)) {
        expect(sentence.params).toHaveProperty(name);
      }
    }
    // Les 7 formes d'apercu sont couvertes.
    expect(kinds.size).toBe(7);
  });

  it("l'apercu porte le MOT DU COACH quand il en a pose un", () => {
    const compiled = compileProtocol(
      toProtocolInput(
        {
          stances: { other_added_fat: "excluded" },
          timingRules: [],
          terms: [{ term: "seed oils", food_group_ref: "other_added_fat" }],
        },
        "c-1",
        "en-GB",
      ),
      null,
    );
    // Le titre porte le mot du coach…
    expect(compiled[0].title).toBe("seed oils");
    // …et la jointure garde le slug. C'est ce qui fait tenir la FK, le prompt
    // de vision et l'analyse photo.
    expect(compiled[0].food_group_ref).toBe("other_added_fat");
  });
});

describe("le diff de publication", () => {
  const base = { timingRules: [], terms: [] };

  it("dit ce qui change ET pour combien d'eleves", () => {
    const published = compileProtocol(
      toProtocolInput({ ...base, stances: { leafy_greens: "encouraged" } }, "c", "en-GB"),
      null,
    );
    const draft = compileProtocol(
      toProtocolInput(
        { ...base, stances: { leafy_greens: "encouraged", alcohol: "excluded" } },
        "c",
        "en-GB",
      ),
      null,
    );
    const impact = publishImpact(published, draft, 47);
    expect(impact).toEqual({
      added: 1,
      removed: 0,
      changed: 0,
      students: 47,
      noop: false,
    });
  });

  it("un brouillon identique au publie est un NOOP explicite", () => {
    // Sans ce cas, le coach publie « quelque chose » qui ne change rien et
    // apprend a cliquer sans lire — exactement ce que l'ecran doit empecher.
    const same = compileProtocol(
      toProtocolInput({ ...base, stances: { leafy_greens: "encouraged" } }, "c", "en-GB"),
      null,
    );
    expect(publishImpact(same, same, 47).noop).toBe(true);
  });

  it("la phrase d'impact a tous ses parametres", () => {
    const template = en["coach.protocol.publish.impact"];
    const impact = publishImpact([], [], 0);
    for (const [, name] of template.matchAll(/\{(\w+)\}/g)) {
      expect(impact).toHaveProperty(name);
    }
  });
});

describe("les termes du coach", () => {
  it("propose un rattachement, et l'ecran l'affichera", () => {
    expect(suggestAttachment("leafy greens", ROWS, label)).toBe("leafy_greens");
    expect(suggestAttachment("POULTRY", ROWS, label)).toBe("poultry");
  });

  it("rend null quand rien ne convient — ce n'est PAS un echec", () => {
    // null est le cas qui ouvre une demande d'extension du vocabulaire
    // partage. Deviner un rattachement ici serait mentir au coach sur ce que
    // Sophia verifiera vraiment.
    expect(suggestAttachment("bone broth", ROWS, label)).toBeNull();
    expect(suggestAttachment("   ", ROWS, label)).toBeNull();
  });
});

describe("les axes suggeres", () => {
  it("ne proposent que des CLASSES a deplier, jamais un aliment avec une posture", () => {
    // Si KEEL livre des contenus nutritionnels tout faits, KEEL devient
    // l'autorite nutritionnelle. Ce test est ce qui empeche un futur « juste
    // pre-cocher deux trois trucs pour aider ».
    const classes = new Set(ROWS.map((r) => r.class));
    for (const [goal, axes] of Object.entries(AXES_BY_GOAL)) {
      expect(axes.length, `${goal} sans axe`).toBeGreaterThan(0);
      for (const axis of axes) {
        expect(en).toHaveProperty(axis.labelKey);
        for (const c of axis.classes) {
          // Une CLASSE, jamais un slug: deplier « les matieres grasses » ne dit
          // pas quoi en penser.
          expect(
            typeof c === "string" && !ROWS.some((r) => r.slug === c),
            `${goal}: l'axe pointe un aliment (${c}) et non une classe`,
          ).toBe(true);
        }
      }
    }
    expect(classes.size).toBeGreaterThan(0);
  });

  it("CHAQUE objectif du vocabulaire a des axes, et aucun n'en a zéro", () => {
    // Les cinq jetons étaient recopiés ici. Un sixième est arrivé
    // (`muscle_gain`), et ce test tombait en disant « il y en a un de trop » —
    // alors que le défaut qu'il doit attraper est l'INVERSE: un objectif du
    // vocabulaire à qui l'écran ne pose aucune question, donc un coach qui ne
    // peut rien écrire pour cette cohorte-là.
    //
    // Dérivé de `GOAL_TOKENS`, il attrape maintenant le vrai défaut, et il
    // l'attrapera pour le septième objectif sans qu'on y repense.
    expect(Object.keys(AXES_BY_GOAL).sort()).toEqual([...GOAL_TOKENS].sort());
    for (const goal of GOAL_TOKENS) {
      expect(AXES_BY_GOAL[goal].length, goal).toBeGreaterThan(0);
    }
  });
});

describe("le protocole vide", () => {
  it("compile en zero ligne, sans erreur", () => {
    // Un coach qui decouvre l'ecran n'a rien ecrit. L'etat lisible, pas le
    // plantage.
    const input = toProtocolInput(
      { stances: {}, timingRules: [], terms: [] },
      "c-1",
      "en-GB",
    );
    expect(compileProtocol(input, null)).toEqual([]);
    expect(compileProtocol(input, "fat_loss")).toEqual([]);
  });

  it("l'ecran a une phrase pour le dire", () => {
    expect(en["coach.protocol.preview.empty"]).toBeTruthy();
    expect(en["coach.protocol.never_published"]).toBeTruthy();
  });
});
