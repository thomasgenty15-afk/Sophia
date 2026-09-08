// FF-062 — LES DEUX JETONS NEUFS, ET LEUR CONTRAT AVEC LE DENO.
//
// ══ POURQUOI CE FICHIER LIT DES SOURCES SUR LE DISQUE ══════════════════════
//
// Le front est en Vite/TS, le back en Deno: aucun import n'est possible entre
// les deux runtimes. Les deux lecteurs de jetons sont donc DUPLIQUÉS — et une
// duplication non gardée, sur une reconnaissance de forme, produit exactement
// le défaut le plus difficile à voir: le bouton s'affiche, l'élève tape, et
// rien ne se passe. Ou pire, le mauvais formulaire s'ouvre.
//
// C'est le même patron que `weeklyCheckIn.int.test.ts`, pour la même raison.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isWeighInToken, buildWeighInSubmission } from "./weighIn";
import { isWeeklyCheckInToken } from "./weeklyCheckIn";
import {
  forcedSlotFromPhotoTap,
  forcedSlotLabel,
  parseSlotMealButton,
} from "./slotMeal";

const ROOT = resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("C2 — le jeton de pesée", () => {
  it("⛔ NE SE CONFOND PAS AVEC CELUI DU DIMANCHE, dans les deux sens", () => {
    // LES DEUX PARTAGENT `KEEL_WE`. Un `startsWith` ouvrirait le mauvais
    // formulaire: l'élève noterait son poids dans le point du dimanche, ou
    // remplirait six axes en croyant se peser.
    expect(isWeighInToken("KEEL_WEIGHIN_2026-03-10")).toBe(true);
    expect(isWeighInToken("KEEL_WEEKLY_2026-03-08")).toBe(false);
    expect(isWeeklyCheckInToken("KEEL_WEIGHIN_2026-03-10")).toBe(false);
    expect(isWeeklyCheckInToken("KEEL_WEEKLY_2026-03-08")).toBe(true);
  });

  it("refuse ce qui n'est pas exactement un jeton", () => {
    for (
      const bad of [
        "KEEL_WEIGHIN_",
        "KEEL_WEIGHIN_2026-3-10",
        "KEEL_WEIGHIN_2026-03-10-extra",
        "keel_weighin_2026-03-10",
        "",
      ]
    ) {
      expect(isWeighInToken(bad), bad).toBe(false);
    }
  });

  it("porte la MÊME forme que le lecteur Deno", () => {
    // La forme, pas la ligne: les deux fichiers l'écrivent différemment (une
    // fonction `test` ici, un `exec` capturant là-bas). Ce qui doit coïncider
    // est le motif.
    const deno = read("supabase/functions/_shared/keel/weigh_in.ts");
    expect(deno).toContain("KEEL_WEIGHIN_(\\d{4}-\\d{2}-\\d{2})");
    expect(read("frontend/src/keel/api/weighIn.ts"))
      .toContain("KEEL_WEIGHIN_\\d{4}-\\d{2}-\\d{2}");
  });
});

describe("C2 — R8, le champ vide n'écrit rien", () => {
  it("⛔ VALIDER SANS SAISIR EST UN REFUS NOMMÉ", () => {
    // La moitié client de R8. L'autre moitié est que le champ n'est jamais
    // pré-rempli: un champ pré-rempli se valide sans être lu, et on
    // enregistrerait la valeur de l'avant-veille comme une pesée d'aujourd'hui.
    const out = buildWeighInSubmission("");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.kind).toBe("empty");
  });

  it("hors bornes = refusé et NOMMÉ, jamais ramené au bord", () => {
    // Un 500 kg ramené à 400 produit une donnée fausse qui a l'air vraie — et
    // cette donnée arme la ceinture de restriction.
    const out = buildWeighInSubmission("500");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.kind).toBe("out_of_range");
  });

  it("la virgule décimale passe: c'est ce que tape la moitié de l'Europe", () => {
    expect(buildWeighInSubmission("78,4")).toEqual({
      ok: true,
      values: { weight_kg: 78.4 },
    });
  });

  it("ce qui n'est pas un nombre est refusé, pas ignoré", () => {
    const out = buildWeighInSubmission("beaucoup");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.kind).toBe("not_a_number");
  });
});

// ⟳ LE BLOC R11 — LE JETON DE CORRECTION DU CHIFFRE — A ÉTÉ RETIRÉ LE
// 2026-09-07 avec sa lane. `KEEL_KCAL_` reste dans la matrice de
// disjonction plus bas: le vocabulaire est DÉSARMÉ, pas libéré, et il doit
// continuer de ne collider avec aucun autre tant que des bulles en portent.

describe("C1 — le jeton du repas d'un créneau", () => {
  it("⛔ SEULE « PHOTO » ARME UN CRÉNEAU FORCÉ", () => {
    // Armer sur « Décrire » ou « Passer » ferait porter le créneau du midi à
    // une photo envoyée trois heures plus tard pour une tout autre raison.
    expect(forcedSlotFromPhotoTap("KEEL_SLOTMEAL_photo|2026-03-10|lunch"))
      .toBe("lunch");
    expect(forcedSlotFromPhotoTap("KEEL_SLOTMEAL_describe|2026-03-10|lunch"))
      .toBeNull();
    expect(forcedSlotFromPhotoTap("KEEL_SLOTMEAL_skip|2026-03-10|lunch"))
      .toBeNull();
    expect(forcedSlotFromPhotoTap("KEEL_PULSE_HARD")).toBeNull();
  });

  it("⛔ UN CRÉNEAU QU'ON NE SAIT PAS NOMMER N'EST PAS FORCÉ", () => {
    // Le créneau forcé doit s'AFFICHER: un jeton sans libellé produirait soit
    // un slug brut sous les yeux de l'élève, soit — pire — une contrainte
    // invisible qui range sa photo sans qu'il l'ait vue.
    expect(forcedSlotFromPhotoTap("KEEL_SLOTMEAL_photo|2026-03-10|brunch"))
      .toBeNull();
    expect(forcedSlotLabel("brunch")).toBeNull();
  });

  it("les SIX moments du vocabulaire fermé ont un nom", () => {
    for (
      const slot of [
        "breakfast",
        "snack_am",
        "lunch",
        "snack_pm",
        "dinner",
        "before_bed",
      ]
    ) {
      expect(forcedSlotLabel(slot), slot).toBeTruthy();
      expect(forcedSlotFromPhotoTap(`KEEL_SLOTMEAL_photo|2026-03-10|${slot}`))
        .toBe(slot);
    }
  });

  it("le lecteur rend `null` sur une charge tronquée", () => {
    for (
      const bad of [
        "KEEL_SLOTMEAL_photo|2026-03-10",
        "KEEL_SLOTMEAL_photo",
        "KEEL_SLOTMEAL_eat|2026-03-10|lunch",
        "KEEL_SLOTMEAL_photo|10/03/2026|lunch",
      ]
    ) {
      expect(parseSlotMealButton(bad), bad).toBeNull();
    }
  });

  it("porte la MÊME forme que le lecteur Deno", () => {
    const deno = read("supabase/functions/_shared/keel/slot_meal_ask.ts");
    const shape = "KEEL_SLOTMEAL_(photo|describe|skip|mute)";
    expect(deno).toContain(shape);
    expect(read("frontend/src/keel/api/slotMeal.ts")).toContain(shape);
  });

  it("les NEUF vocabulaires restent DISJOINTS", () => {
    // ⚠️ LA PROPRIÉTÉ QUI REND L'ORDRE DE LECTURE SANS CONSÉQUENCE. Chaque
    // lecteur rend « rien » sur ce qui ne le concerne pas — et ça ne tient que
    // si les préfixes ne se contiennent pas l'un l'autre.
    const prefixes = [
      "KEEL_KCAL_",
      "KEEL_RECO_",
      "KEEL_STRIP_",
      "KEEL_FIX_",
      "KEEL_WDIV_",
      "KEEL_PULSE_",
      "KEEL_FEEDBACK_",
      "KEEL_SLOTMEAL_",
      // Les TROIS jetons de FORMULAIRE. Ils ne passent pas par le dispatcher de
      // boutons, mais ils voyagent dans le même champ `payload`: une collision
      // avec un préfixe de bouton serait le même défaut.
      "KEEL_WEIGHIN_",
      "KEEL_WEEKLY_",
    ];
    const collisions: string[] = [];
    for (const a of prefixes) {
      for (const b of prefixes) {
        if (a !== b && (a.startsWith(b) || b.startsWith(a))) {
          collisions.push(`${a} / ${b}`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });
});
