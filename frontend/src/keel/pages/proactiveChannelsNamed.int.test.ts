import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « LES NOUVELLES DE SOPHIA » DOIT NOMMER CE QUI PART VRAIMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'interrupteur des relances portait cette phrase: *« Le point du soir, le
 * bilan du dimanche, et un mot si tu disparais. »* Sur les trois, un seul
 * partait encore.
 *
 *   · LE POINT DU SOIR n'a plus d'ÉCRIVAIN. `keel_daily_pulse` est déclaré dans
 *     `daily_pulse_io.ts`, et la seule référence hors de ce module est
 *     `loadLatestPulse` — un LECTEUR, dans `sophia-brain/router/run.ts`. Aucun
 *     pas de cron ne l'envoie.
 *   · LE BILAN DU DIMANCHE dépend du cron `keel-weekly-flow`, désactivé.
 *   · pendant ce temps le rappel de PESÉE et le rappel de DÉCONGÉLATION, eux,
 *     partent tous les jours — et la phrase ne les nommait pas.
 *
 * Un réglage qui nomme en premier ce qu'il ne gouverne plus est faux, et
 * indémentable pour qui le lit: on ne peut pas vérifier depuis l'écran qu'un
 * message n'arrive plus.
 *
 * ── CE QUE CE FICHIER TIENT ──────────────────────────────────────────────
 * ① les canaux que la phrase nomme sont RÉELLEMENT branchés dans le balayage;
 * ② le point du soir n'a toujours pas d'écrivain — le jour où il en retrouve
 *   un, ce test rougit et la phrase doit reprendre sa clause.
 *
 * ⚠️ IL LIT `supabase/functions` DEPUIS LA SUITE FRONT, comme
 * `edge/coverage-guard.int.test.ts`: la jointure qu'on garde est précisément
 * celle qui traverse les deux runtimes, et aucun des deux ne peut la tenir
 * seul.
 */

const fromRoot = (...parts: string[]) => path.join(process.cwd(), "..", ...parts);
const FUNCTIONS = fromRoot("supabase", "functions");

const PROACTIVE = fs.readFileSync(
  path.join(FUNCTIONS, "keel-proactive-v1", "index.ts"),
  "utf8",
);

/** Tous les `.ts` de `supabase/functions`, hors tests. */
function edgeSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".ts") && !name.includes("_test")) out.push(full);
    }
  };
  walk(FUNCTIONS);
  return out;
}

describe("① la phrase nomme des canaux branchés", () => {
  it.each([
    ["le suivi du poids", "runWeighInStep"],
    ["le rappel de décongélation", "runThawReminderStep"],
    ["le retour de fin de plan", "runPlanFeedbackStep"],
  ])("%s est appelé par le balayage horaire", (_label, step) => {
    // ⛔ APPELÉ, pas seulement importé: un import sans appel est exactement la
    // classe de défaut que ce dépôt appelle « module non câblé ».
    expect(PROACTIVE, `${step} n'est plus appelé`).toContain(`${step}(`);
  });

  it("et la relance après silence a son cron à elle", () => {
    expect(fs.existsSync(path.join(FUNCTIONS, "keel-reengage-v1", "index.ts")))
      .toBe(true);
  });
});

describe("② le point du soir n'a toujours pas d'écrivain", () => {
  it("`keel_daily_pulse` n'est nommé que par son module et la politique de livraison", () => {
    const writers = edgeSources().filter((f) => {
      if (f.endsWith("daily_pulse_io.ts")) return false;
      // La politique de livraison NOMME tous les purposes connus, vivants ou
      // non: c'est un vocabulaire, pas un envoi.
      if (f.endsWith("delivery_policy.ts")) return false;
      // Le lecteur d'adhérence relit ce qui a été envoyé AUTREFOIS.
      if (f.endsWith("daily_practice_adherence_io.ts")) return false;
      return fs.readFileSync(f, "utf8").includes('"keel_daily_pulse"');
    });
    expect(
      writers.map((f) => path.relative(FUNCTIONS, f)),
      "le point du soir a retrouvé un écrivain — « Les nouvelles de Sophia » doit le renommer",
    ).toEqual([]);
  });

  it("la phrase ne le promet donc pas, dans les deux packs", () => {
    // ⚠️ ON TESTE L'ABSENCE DU MOT, pas la présence d'une formulation: une
    // phrase se réécrit, une promesse morte ne doit pas revenir.
    expect(fr["chat.settings.checkins.help"]).not.toContain("point du soir");
    expect(en["chat.settings.checkins.help"]).not.toContain("evening check-in");
  });
});
