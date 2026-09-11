// KEEL — LES SIX CONSIGNES DE SERVICE, ÉPINGLÉES SUR LE MOTEUR.
//
// ── CE QUE CE TEST EMPÊCHE, ET POURQUOI IL EXISTE ──────────────────────────
// Deux pages de vente montrent au visiteur ce que son objectif change dans son
// assiette: `/meal-prep` (une assiette) et `/couples` (deux). Les phrases
// qu'elles affichent ne sont PAS de la copie — ce sont les six valeurs de
// `SERVING_DIRECTION` (`_shared/keel/household_portions.ts`), c'est-à-dire les
// consignes réelles que le générateur envoie au modèle.
//
// Une valeur figée dans une page survit à sa cause: c'est écrit noir sur blanc
// dans ce dépôt, et le module lui-même en porte la cicatrice — `health` a rendu
// EXACTEMENT la chaîne de `maintenance` pendant des semaines, donc « santé »
// servait l'assiette de qui n'a rien déclaré, et rien n'a échoué. Ce test est
// la seule chose qui fasse rougir une page quand le moteur change d'avis.
//
// ── POURQUOI LE MODULE EST LU COMME DU TEXTE ──────────────────────────────
// Il est écrit pour Deno (`import ... from "./household.ts"`, extensions en
// clair, `Deno.*` dans son voisinage). L'importer depuis le front ferait entrer
// tout `supabase/functions/` dans le graphe de vitest, pour trois constantes.
// On lit donc le FICHIER, et on extrait exactement ce qu'on vérifie.
//
// ── ⚠️ ET LA GRAMMAIRE, PAS SEULEMENT LES CHAÎNES ─────────────────────────
// Épingler les six phrases ne suffisait pas, et une review l'a PROUVÉ par
// mutation le 2026-08-13: changer `QUALIFIERS.generous` de `"larger"` à
// `"full"` dans le module laissait ce test VERT, pendant que les deux pages
// continuaient d'afficher l'ancienne lecture. Les chaînes étaient épinglées;
// la grammaire qui les LIT était recopiée à la main, deux fois, sans garde.
//
// C'est exactement la seconde définition que le §D6 du module refuse, un cran
// plus haut — et sa propre cicatrice (`health` rendant la chaîne de
// `maintenance`) dit ce qu'elle coûte. Les tests ci-dessous comparent donc
// aussi les trois tables portées dans les pages (`QUALIFIERS`, `AXIS_WORDS`,
// et le raccourci `component`) à celles du module.
//
// ⚠️ CE TEST NE PEUT PAS PROUVER QUE LES DEUX PORTAGES SE COMPORTENT PAREIL —
// il prouve qu'ils partent des mêmes tables. Un défaut d'algorithme y
// survivrait; un défaut de DONNÉE, qui est ce que le dépôt a déjà payé, non.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { en } from "./en";
import { fr } from "./fr";

const I18N_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(I18N_DIR, "..", "..", "..", "..");
const MODULE = path.join(
  REPO,
  "supabase/functions/_shared/keel/household_portions.ts",
);

/**
 * Le seed, lu par clé calculée.
 *
 * ⚠️ `string | undefined` ET PAS `string`: une clé absente doit rendre
 * `undefined` et FAIRE ÉCHOUER la comparaison. Typée `Record<string, string>`,
 * elle mentirait au compilateur et le test verdirait sur une page qui n'a
 * jamais écrit ces clés.
 */
const seed = en as Record<string, string | undefined>;

/** Le corps d'un `export const NOM = { … };` — commentaires compris. */
function block(source: string, declaration: string, close: string): string {
  const start = source.indexOf(declaration);
  expect(start, `${declaration} introuvable dans household_portions.ts`)
    .toBeGreaterThanOrEqual(0);
  const end = source.indexOf(close, start);
  expect(end, `fin de ${declaration} introuvable`).toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * Les identifiants d'objectif.
 *
 * ⚠️ ILS SE LISENT SUR `SERVING_DIRECTION` DEPUIS LE 2026-08-18, plus sur
 * `MEMBER_GOALS`. Ce dernier était une SECONDE liste recopiée à côté de
 * `GOAL_TOKENS`; le repli des six vers trois l'a rendue dérivée
 * (`export const MEMBER_GOALS = GOAL_TOKENS;`), donc il n'y a plus de bloc de
 * littéraux à y lire. `SERVING_DIRECTION` est de toute façon la meilleure
 * source pour ce test-ci: c'est la table dont il vérifie les traductions, et
 * une clé qui manquerait pour un objectif absent de cette table ne manquerait
 * à personne.
 */
function memberGoals(source: string): string[] {
  const body = block(source, "export const SERVING_DIRECTION", "};");
  return [...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
}

/**
 * Les six consignes, lues sur `SERVING_DIRECTION`.
 *
 * La valeur est sur la ligne du champ ou sur la suivante (le module coupe à
 * 80 colonnes), d'où le `\s*` qui traverse le retour à la ligne. Les
 * commentaires ne matchent pas: `//` n'est pas `\w+:`.
 */
function servingDirections(source: string): Record<string, string> {
  const body = block(
    source,
    "export const SERVING_DIRECTION: Record<MemberGoal, string> = {",
    "\n};",
  );
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^ {2}(\w+):\s*"((?:[^"\\]|\\.)*)",/gm)) {
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * Une table `mot → valeur`, lue partout de la même façon.
 *
 * Le module et les deux pages écrivent la MÊME forme
 * (`  generous: "larger",`), ce qui est ce qui rend la comparaison possible
 * sans importer quoi que ce soit. Les commentaires ne matchent pas.
 */

const source = fs.readFileSync(MODULE, "utf8");
const goals = memberGoals(source);
const directions = servingDirections(source);

/** Les deux pages qui portent la grammaire, et la forme exacte de leur table. */

describe("les consignes de service montrées sur la vitrine", () => {
  it("sont extraites du moteur, une par objectif", () => {
    // La ceinture de la ceinture: si l'extraction rendait zéro ligne, les deux
    // tests ci-dessous compareraient `undefined` à `undefined` et verdiraient.
    // ⚠️ TROIS DEPUIS LE 2026-08-18 — le repli des six objectifs. Le nombre
    // est écrit en dur EXPRÈS: dérivé de la même source que l'extraction, il
    // verdirait sur zéro ligne, ce qui est très exactement le défaut que ce
    // test existe pour attraper.
    expect(goals.length).toBe(3);
    expect(Object.keys(directions).sort()).toEqual([...goals].sort());
    for (const goal of goals) {
      expect(directions[goal], `direction vide pour ${goal}`).toBeTruthy();
    }
  });

  it("sont rendues MOT POUR MOT par `/` (`home.dir.*`)", () => {
    // ⚠️ `/meal-prep` et `/couples` ont été RETIRÉES le 2026-09-08; la seule
    // landing porte les consignes sous `home.dir.*`, et c'est elle qu'on
    // épingle. On boucle sur la constante réelle, pas sur une liste recopiée:
    // un objectif ajouté au moteur fait échouer ici.
    for (const goal of goals) {
      expect(seed[`home.dir.${goal}`], `home.dir.${goal}`).toBe(directions[goal]);
    }
  });

  it("existent dans le pack français, une par objectif, et ne recopient pas l'anglais", () => {
    // La ceinture de la ceinture: une clé absente rendrait `undefined` et la
    // page rendrait la clé nue. Et une copie de l'anglais serait la
    // « traduction » qui fait verdir la parité sans rien traduire.
    const p = fr as Record<string, string | undefined>;
    for (const goal of goals) {
      expect(p[`home.dir.${goal}`], `fr: home.dir.${goal} absente`).toBeTruthy();
      expect(p[`home.dir.${goal}`]).not.toBe(directions[goal]);
    }
  });
});

// ⚠️ « la grammaire qui lit ces consignes » A ÉTÉ RETIRÉ LE 2026-09-08 avec
// ses deux ports (`MealPrepPage.tsx`, `CouplesPage.tsx`): la landing unique
// AFFICHE la consigne traduite, elle ne la LIT plus en axes. Le jour où une
// page relit `QUALIFIERS`/`AXIS_WORDS`, ce bloc revient avec elle.
