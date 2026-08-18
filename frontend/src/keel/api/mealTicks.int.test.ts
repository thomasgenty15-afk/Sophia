import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BARE_UNTICK_REASON,
  MEAL_UNTICK_FORM_REASONS,
  MEAL_UNTICK_REASONS,
} from "./mealTicks";

/**
 * FF-057 §3.A — LA LISTE DES MOTIFS EST ÉCRITE TROIS FOIS, ET LES TROIS SONT
 * TENUES ICI.
 *
 * Postgres (la CHECK et le trigger), Deno (les lanes edge) et le navigateur ne
 * partagent aucun module: `food_not_eaten`, `ordered`, `no_time` et
 * `ate_other` sont recopiés dans trois fichiers. La recopie est inévitable, la
 * dérive ne l'est pas.
 *
 * ⚠️ CE QUE COÛTERAIT LA DÉRIVE, ET POURQUOI ELLE SERAIT SILENCIEUSE À
 * L'ENDROIT LE PLUS CHER. Un motif que le front écrirait et que la base
 * refuserait rend une erreur PostgREST au moment exact où la personne dit ce
 * qui s'est vraiment passé — le geste que tout le produit cherche à rendre bon
 * marché. À l'inverse, un motif que la base accepterait et que le front
 * n'offrirait plus laisserait des lignes qu'aucun écran ne sait relire. Aucun
 * test de l'un ou l'autre côté ne rougirait: c'est la même faute que la charge
 * d'accident (`lib/accidentPayload.int.test.ts`), d'où le même remède — on lit
 * les deux autres sources sur le disque.
 */

const MEAL_TICK_SOURCE = new URL(
  "../../../../supabase/functions/_shared/keel/meal_tick.ts",
  import.meta.url,
);

const MIGRATION_SOURCE = new URL(
  "../../../../supabase/migrations/20260818170000_la_decoche_dit_pourquoi.sql",
  import.meta.url,
);

const denoSource = () => readFileSync(MEAL_TICK_SOURCE, "utf8");
const migrationSource = () => readFileSync(MIGRATION_SOURCE, "utf8");

/** Les jetons d'un tableau `const NOM = [ ... ] as const;` du module Deno. */
function denoReasons(name: string): string[] {
  const src = denoSource();
  const at = src.indexOf(`export const ${name} = [`);
  if (at < 0) return [];
  const body = src.slice(at, src.indexOf("] as const;", at));
  return [...body.matchAll(/^\s*"([a-z_]+)",$/gm)].map((m) => m[1]);
}

describe("les motifs de décoche ne peuvent pas diverger du serveur", () => {
  it("le front porte la MÊME liste, dans le MÊME ordre, que `meal_tick.ts`", () => {
    const declared = denoReasons("MEAL_UNTICK_REASONS");
    expect(declared, "`MEAL_UNTICK_REASONS` introuvable — test à réviser")
      .not.toEqual([]);
    expect(declared).toEqual([...MEAL_UNTICK_REASONS]);
  });

  it("la décoche NUE est la même des deux côtés", () => {
    // Elle précède le formulaire et survit à son oubli (fiche §7). Si les deux
    // côtés n'en nommaient pas la même, un plat décoché depuis l'écran et un
    // plat décoché depuis la bande du soir ne se liraient plus pareil.
    const declared = denoSource().match(
      /export const MEAL_UNTICK_REASON = "([a-z_]+)" as const;/,
    );
    expect(declared, "`MEAL_UNTICK_REASON` introuvable — test à réviser")
      .not.toBeNull();
    expect(declared![1]).toBe(BARE_UNTICK_REASON);
  });

  it("la CHECK de la table accepte exactement ces quatre motifs", () => {
    // ⛔ LA GARANTIE QUI TIENT LE GESTE. Un motif offert à l'écran et absent de
    // la CHECK fait échouer la décoche en base, sous les yeux de la personne.
    const sql = migrationSource();
    const at = sql.indexOf("add constraint protocol_events_disqualified_reason_check");
    expect(at, "la contrainte n'est plus dans la migration — test à réviser")
      .toBeGreaterThan(-1);
    const body = sql.slice(at, sql.indexOf(");", at));
    for (const reason of MEAL_UNTICK_REASONS) {
      expect(body, `« ${reason} » absent de la CHECK`).toContain(`'${reason}'`);
    }
  });

  it("le TRIGGER accepte exactement ces quatre motifs, et pas les verdicts de photo", () => {
    // La CHECK porte AUSSI `not_food` et `unreadable`, qui sont des verdicts
    // d'IMAGE. Sur une case cochée à la main ils n'ont aucun sens, et c'est le
    // trigger — pas la contrainte — qui le dit. Les deux listes sont donc
    // différentes exprès, et celle-ci ne doit pas glisser vers l'autre.
    const sql = migrationSource();
    const at = sql.indexOf("allowed constant text[] := array[");
    expect(at, "la liste du trigger est introuvable — test à réviser")
      .toBeGreaterThan(-1);
    const body = sql.slice(at, sql.indexOf("];", at));
    const declared = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(declared).toEqual([...MEAL_UNTICK_REASONS]);
    expect(declared).not.toContain("not_food");
    expect(declared).not.toContain("unreadable");
  });
});

describe("le formulaire a trois tuiles, et la décoche nue n'en est pas une", () => {
  it("trois motifs, pas quatre et pas deux", () => {
    // Fiche §9, « le formulaire qui devient un questionnaire »: un quatrième
    // cas se traite par « j'ai mangé autre chose », jamais par une branche
    // neuve. Le compte est ici pour qu'ajouter une tuile soit une décision
    // écrite, pas un réglage.
    expect(MEAL_UNTICK_FORM_REASONS).toEqual(["ordered", "no_time", "ate_other"]);
  });

  it("la décoche nue n'est jamais offerte comme un choix", () => {
    // Elle est déjà écrite quand le formulaire s'ouvre. L'offrir en tuile
    // demanderait à la personne de re-choisir « je ne dis pas pourquoi », ce
    // qui est exactement ce que la sortie du formulaire fait déjà, gratuitement.
    expect(MEAL_UNTICK_FORM_REASONS).not.toContain(BARE_UNTICK_REASON);
    // Et l'union des deux est la liste entière: aucun motif ne se perd entre
    // « ce que la base accepte » et « ce que l'écran sait produire ».
    expect([BARE_UNTICK_REASON, ...MEAL_UNTICK_FORM_REASONS].sort())
      .toEqual([...MEAL_UNTICK_REASONS].sort());
  });
});

describe("l'écriture d'une décoche ne touche qu'une colonne", () => {
  const apiSource = () =>
    readFileSync(new URL("./mealTicks.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("`untickMeal` n'écrit QUE `disqualified_reason`", () => {
    // ⛔ LA PORTE LA PLUS LARGE DU PRODUIT. La policy UPDATE ouverte pour la
    // décoche porte sur des LIGNES, pas sur des colonnes: un `update` qui
    // ajouterait `local_date`, `food_group_ref` ou `evidence_weight` passerait
    // la policy et se ferait refuser par le trigger — c'est-à-dire casserait la
    // décoche en production, pas ici. Le trigger reste le verrou; ce test dit
    // simplement que le client ne le provoque pas.
    const src = apiSource();
    const body = src.slice(src.indexOf("export async function untickMeal"));
    const update = body.slice(body.indexOf(".update("), body.indexOf(")", body.indexOf(".update(")) + 1);
    expect(update).toContain("disqualified_reason");
    for (
      const forbidden of [
        "local_date",
        "occurred_at",
        "slot_key",
        "food_group_ref",
        "substance_ref",
        "evidence_weight",
        "plan_relation",
        "student_note",
        "source_message_id",
        "user_id",
      ]
    ) {
      expect(update, `la décoche réécrit « ${forbidden} »`).not.toContain(forbidden);
    }
  });

  it("`untickMeal` compte les LIGNES touchées, pas le code HTTP", () => {
    // Cicatrice `rls-is-not-a-substitute-for-eq-user-id`: un `update` qui ne
    // touche aucune ligne rend 204 et ressemble à un succès. C'est le défaut
    // exact que `20260805090500` a été écrite pour corriger — « décocher
    // rapportait un SUCCÈS et ne changeait rien » — et rien côté client ne le
    // voyait alors.
    const src = apiSource();
    const body = src.slice(src.indexOf("export async function untickMeal"));
    expect(body).toContain('.select("id")');
    expect(body).toContain("length === 0");
  });
});

describe("la liaison unique porte le formulaire, pas les deux écrans", () => {
  const hookSource = () =>
    readFileSync(new URL("../lib/useMealTicks.ts", import.meta.url), "utf8");

  it("`useMealTicks` est le seul à ouvrir et fermer le formulaire", () => {
    // La raison d'être du fichier, écrite dans son en-tête: « deux écrans
    // montrent le même plat, la case doit être la MÊME case ». Le formulaire
    // suit la case; le câbler dans `/app/today` et dans `/app/plan` séparément
    // aurait introduit exactement la divergence que ce fichier empêche.
    expect(hookSource()).toContain("untickPrompt");
  });

  it("la décoche NUE part avant que le formulaire s'ouvre", () => {
    // Fiche §7: « la personne ignore le formulaire ⇒ la décoche reste écrite —
    // elle précède le formulaire ». C'est ce qui la rend gratuite à ignorer, et
    // c'est la contre-mesure de §10: si signaler déclenchait une procédure, les
    // gens cesseraient de signaler.
    const src = hookSource();
    const write = src.indexOf("reason: BARE_UNTICK_REASON,");
    const open = src.indexOf("setPromptKey(promptIdFor(key, onDate));");
    expect(write, "l'écriture de la décoche nue est introuvable").toBeGreaterThan(-1);
    expect(open, "l'ouverture du formulaire est introuvable").toBeGreaterThan(-1);
    expect(write).toBeLessThan(open);
    // ⚠️ ET L'ÉCRITURE EST `await`ÉE AVANT. Sans ça l'ordre des LIGNES serait un
    // ordre d'apparition dans le fichier, pas un ordre d'exécution — et le
    // formulaire s'ouvrirait sur une décoche qui n'a peut-être pas pris.
    expect(src.slice(write, open)).toContain("});");
  });

  it("les deux écrans passent par `bind`, aucun n'écrit lui-même", () => {
    for (const page of ["../pages/TodayPage.tsx", "../components/MealBuilder.tsx"]) {
      const src = readFileSync(new URL(page, import.meta.url), "utf8")
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(src, `${page} appelle untickMeal directement`).not.toContain(
        "untickMeal",
      );
      expect(src, `${page} rend le formulaire lui-même`).not.toContain(
        "meals.untick.",
      );
    }
  });
});
