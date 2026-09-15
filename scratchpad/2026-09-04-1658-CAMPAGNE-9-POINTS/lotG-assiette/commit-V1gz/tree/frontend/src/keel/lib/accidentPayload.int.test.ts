import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ACCIDENT_SEP,
  ACCIDENT_SESSION_NO,
  sessionMissedPayload,
} from "./accidentPayload";

/**
 * FF-057 — LA DUPLICATION DU LITTÉRAL EST GARDÉE ICI.
 *
 * Deno (les fonctions edge) et le navigateur ne partagent aucun module: le
 * jeton `KEEL_FIX_SESSION_NO`, le séparateur et l'ordre des champs sont écrits
 * DEUX FOIS. La recopie est inévitable; la dérive ne l'est pas.
 *
 * ⚠️ CE QUE COÛTERAIT LA DÉRIVE, ET POURQUOI ELLE SERAIT SILENCIEUSE: un tap
 * dont la charge ne correspond plus à `readAccidentReply` retombe sur
 * `{ kind: "none" }`. Le serveur ne lève RIEN — il traite le tap comme un
 * message ordinaire. L'écran afficherait un bouton, la personne le presserait,
 * et Sophia répondrait à côté. Aucun test de l'un ou l'autre côté ne rougirait.
 * D'où la lecture de la source serveur, ici.
 */

const ACCIDENT_SOURCE = new URL(
  "../../../../supabase/functions/_shared/keel/accident.ts",
  import.meta.url,
);

const source = () => readFileSync(ACCIDENT_SOURCE, "utf8");

describe("la charge d'accident ne peut pas diverger du serveur", () => {
  it("le jeton est celui d'`ACCIDENT_KIND.sessionNo`", () => {
    // La forme exacte dans `accident.ts`:
    //   sessionNo: "KEEL_FIX_SESSION_NO",
    const declared = source().match(
      /sessionNo:\s*"([A-Z_]+)"/,
    );
    expect(declared, "`ACCIDENT_KIND.sessionNo` introuvable — test à réviser")
      .not.toBeNull();
    expect(declared![1]).toBe(ACCIDENT_SESSION_NO);
  });

  it("le séparateur est celui de `SEP`", () => {
    const declared = source().match(/const SEP = "(.+?)";/);
    expect(declared, "`SEP` introuvable — test à réviser").not.toBeNull();
    expect(declared![1]).toBe(ACCIDENT_SEP);
  });

  it("l'ordre des champs est celui d'`accidentSessionId`", () => {
    // Le serveur assemble `[kind, id, cookOn].join(SEP)`. Inverser `id` et
    // `cookOn` ici produirait une charge que `readAccidentReply` rejetterait
    // en silence — la date ne passerait pas `CALENDAR_DATE`.
    const body = source().slice(
      source().indexOf("export function accidentSessionId"),
    ).slice(0, 600);
    const joined = body.slice(body.indexOf("return ["), body.indexOf("].join"));
    const kindAt = joined.indexOf("ACCIDENT_KIND");
    const idAt = joined.indexOf("id,");
    const cookAt = joined.indexOf("cookOn,");
    expect(kindAt, "assemblage d'`accidentSessionId` introuvable").toBeGreaterThan(-1);
    expect(kindAt).toBeLessThan(idAt);
    expect(idAt).toBeLessThan(cookAt);

    expect(sessionMissedPayload("meal-1", "2026-08-18")).toBe(
      `${ACCIDENT_SESSION_NO}${ACCIDENT_SEP}meal-1${ACCIDENT_SEP}2026-08-18`,
    );
  });
});

describe("la porte est montée, et sur la bonne date", () => {
  const kitchenToday = () =>
    readFileSync(
      new URL("../components/KitchenToday.tsx", import.meta.url),
      "utf8",
    );

  it("`KitchenToday` monte le bouton dans le bloc de la cuisson du JOUR", () => {
    const src = kitchenToday();
    // ⚠️ IDIOME DU DÉPÔT (`planBoxes.int.test.ts`): quand la garantie est
    // « cet écran monte bien ça », c'est la source qui répond. Sans ce test, la
    // porte de FF-057 peut disparaître à la refonte suivante et rien ne
    // rougirait — c'est exactement comment elle est restée fermée jusqu'ici.
    expect(src).toContain("<SessionMissedButton");
    expect(src).toContain("mealId={meals.mealId}");

    // LA DATE PASSÉE EST `todayDate`, LA DATE CALENDAIRE DE LA PERSONNE — et
    // surtout PAS `day.cookToday.day`, qui est un jeton (« sun »). Le serveur
    // clé l'état de session sur une date, précisément parce qu'un jeton cesse
    // de désigner la même chose après un glissement.
    expect(src).toContain("cookOn={todayDate}");
    expect(src, "un jeton de jour passé comme date").not.toContain(
      "cookOn={day.cookToday.day}",
    );
  });

  it("le bouton vit SOUS le déroulé de la session, pas au-dessus", () => {
    const src = kitchenToday();
    const runThrough = src.indexOf("day.cookToday.run_through &&");
    const button = src.indexOf("<SessionMissedButton");
    expect(runThrough).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(-1);
    // « Voilà ce que tu cuisines, voilà l'ordre des gestes » — et SEULEMENT
    // après, « et si ça n'a pas eu lieu ». En tête, l'échec serait la première
    // chose qu'on lit sur sa propre cuisine.
    expect(button).toBeGreaterThan(runThrough);
  });

  it("l'écran ne rejoue AUCUNE branche de l'arbre serveur", () => {
    // ⚠️ COMMENTAIRES RETIRÉS AVANT L'AUDIT. Cicatrice du dépôt: « un audit
    // d'appelants par grep naïf compte les commentaires comme du code vivant ».
    // Ce fichier NOMME les quatre refus dans sa documentation, exprès — pour
    // dire au lecteur ce que le serveur décide à sa place. Une garde qui ne
    // sait pas distinguer une mention d'un appel rendrait ce commentaire
    // interdit, c'est-à-dire punirait le fait d'expliquer.
    const src = kitchenToday()
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // ⛔ LA GARANTIE CENTRALE DU LOT. Si un de ces noms apparaît ici un jour,
    // c'est que l'écran a commencé à décider — et deux implémentations de
    // l'arbre divergent au premier correctif, l'écran gardant l'ancienne règle.
    for (
      const forbidden of [
        "perishables_at_risk",
        "already_cooked",
        "outside_plan_window",
        "shift_dish",
        "no_cook",
        "shift_session",
        "nothing_to_change",
        "KEEL_FIX_SHIFT",
      ]
    ) {
      expect(src, `l'écran rejoue « ${forbidden} »`).not.toContain(forbidden);
    }
  });
});

describe("le bouton ne s'affiche pas quand il n'y a rien à taper", () => {
  it("sans identifiant de plan, aucune charge", () => {
    // `GeneratedMealResult.mealId` est `string | null`: un plan rendu sans
    // identifiant existe. Le bouton ne doit alors pas exister.
    expect(sessionMissedPayload(null, "2026-08-18")).toBeNull();
    expect(sessionMissedPayload("  ", "2026-08-18")).toBeNull();
  });

  it("une date qui n'est pas une date calendaire est refusée", () => {
    // ⚠️ LE PIÈGE NOMMÉ DANS `accident.ts`: un JETON DE JOUR ressemble à une
    // clé valide et n'en est pas une. « sun » cesse de désigner la même chose
    // dès que le glissement déplace la session.
    for (const bad of ["sun", "18/08/2026", "2026-8-18", ""]) {
      expect(sessionMissedPayload("meal-1", bad), `« ${bad} » accepté`)
        .toBeNull();
    }
  });
});
