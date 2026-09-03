import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { TRACKING_BASES } from "../api/tracking";

/**
 * A7 (2026-09-03, décisions D7.1 et D7.12) — `/app/progress` EST « LE SUIVI »,
 * ET L'ÉCRAN MORT QUI PORTAIT LE JOLI NOM EST PARTI.
 *
 * ── CE QUE CE FICHIER GARDE ──────────────────────────────────────────────
 * Deux écrans se disputaient le mot « progression »:
 *   • `pages/ProgressPage.tsx` — 393 lignes, 29 clés `progress.*`, et AUCUN
 *     importeur dans tout le dépôt depuis le pivot N3. Un écran qu'on ne peut
 *     pas atteindre;
 *   • `pages/StudentProgressPage.tsx` — l'écran vivant, monté sur
 *     `/app/progress`, sous le namespace `student_progress.*` qu'il a dû
 *     prendre parce que le premier squattait le nom.
 * Le mort est parti avec ses 36 clés. Le vivant garde son namespace: le
 * renommer aujourd'hui rebaptiserait 90 clés et tous leurs appelants pour
 * récupérer un mot.
 *
 * ⚠️ LE CHEMIN NE BOUGE PAS. Seuls les LIBELLÉS changent — `/app/progress`
 * s'annonce « Suivi » / « Tracking » et `/app/health` « Sécurité » / « Safety »
 * (D7.1: `/app/health` ne porte que les allergies, intolérances et
 * médicaments — c'est de la sécurité, pas de la santé). Renommer une route
 * casserait `mealIdeasRemoved.int.test.ts`, qui verrouille la liste des quatre
 * onglets du bas, et surtout les URL déjà en circulation. Le test ci-dessous
 * refait donc la vérification des CHEMINS ici, pour que le lien entre « on a
 * changé un mot » et « on n'a pas changé une adresse » soit lisible dans le
 * fichier qui change le mot.
 *
 * ── POURQUOI UN TEST DE SOURCE ───────────────────────────────────────────
 * Même raison que `routeGuards.int.test.ts` et `mealIdeasRemoved.int.test.ts`:
 * la suite tourne en environnement `node` et ne monte aucun composant. Une
 * absence de fichier se relit sur le disque, une absence de clé dans le pack,
 * un onglet dans la table `NAV`.
 */

const DEAD_PAGE = resolve(__dirname, "./ProgressPage.tsx");
const LIVE_PAGE = resolve(__dirname, "./StudentProgressPage.tsx");
const SHELL = resolve(__dirname, "../components/KeelAppShell.tsx");
/** Le module de poids que la courbe remplace, et son test. */
const OLD_WEIGHT = resolve(__dirname, "./studentProgressWeight.ts");
const OLD_WEIGHT_TEST = resolve(__dirname, "./studentProgressWeight.int.test.ts");

/** Même blanchiment que `pageSeams` / `mealIdeasRemoved`: une note n'est pas du code. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const shell = stripComments(readFileSync(SHELL, "utf8"));
const page = stripComments(readFileSync(LIVE_PAGE, "utf8"));

/** Le tableau `student: [ … ]` de `NAV`, jusqu'à `coach: [`. */
function studentNav(): string {
  const start = shell.indexOf("student: [");
  const end = shell.indexOf("coach: [", start);
  expect(start, "NAV.student a disparu de KeelAppShell").toBeGreaterThan(0);
  expect(end, "NAV.coach a disparu de KeelAppShell").toBeGreaterThan(start);
  return shell.slice(start, end);
}

/** Les chemins des onglets du bas (`bottom: true`), dans l'ordre du tableau. */
function bottomTabs(nav: string): string[] {
  const tabs: string[] = [];
  for (const m of nav.matchAll(/\{[^{}]*?\bto:\s*"([^"]+)"[^{}]*?\}/g)) {
    if (/\bbottom:\s*true\b/.test(m[0])) tabs.push(m[1]);
  }
  return tabs;
}

/**
 * LES 36 CLÉS, NOMMÉES UNE PAR UNE — et c'est le point du fichier.
 *
 * Le mandat en annonçait 32; le dépôt en portait 36. Chacune a été cherchée
 * comme LITTÉRAL dans tout `frontend/src`, `en.ts` / `fr.ts` / `catalog.ts` et
 * `ProgressPage.tsx` exclus: zéro fichier, pour les 36. Les seules
 * correspondances par sous-chaîne (`student_progress.title`,
 * `student_progress.loading`, `student_progress.error`) portent un AUTRE
 * préfixe — c'est le piège que `meals.loading` avait tendu à la lane RAPIDE, et
 * il est refermé ici par la liste explicite.
 *
 * 29 étaient lues par la page morte; 7 n'étaient lues nulle part, pas même par
 * elle: `adherence_core`, `adherence_overall`, `adherence_title`, `empty`,
 * `insufficient_data`, `insufficient_data_gate`, `insufficient_data_review`.
 */
const REMOVED_KEYS = [
  "progress.adherence_core",
  "progress.adherence_overall",
  "progress.adherence_title",
  "progress.day_value",
  "progress.days_value",
  "progress.empty",
  "progress.error",
  "progress.insufficient_data",
  "progress.insufficient_data_gate",
  "progress.insufficient_data_review",
  "progress.kept_caption",
  "progress.kept_title",
  "progress.kept_value",
  "progress.loading",
  "progress.obstacles_caption",
  "progress.obstacles_empty",
  "progress.obstacles_entry",
  "progress.obstacles_title",
  "progress.outcomes_caption",
  "progress.outcomes_empty",
  "progress.outcomes_hide",
  "progress.outcomes_show",
  "progress.outcomes_title",
  "progress.outcomes_weight",
  "progress.regularity_caption",
  "progress.regularity_days",
  "progress.regularity_title",
  "progress.streak_best",
  "progress.streak_current",
  "progress.streaks_title",
  "progress.subtitle",
  "progress.title",
  "progress.trend_title",
  "progress.week_current",
  "progress.week_label",
  "progress.week_title",
] as const;

/**
 * LES QUATRE QUI RESTENT, ET QUI RESSEMBLENT AUX PARTANTES.
 * `week.*` a hérité au lot 5 des quatre clés que `WeekView` empruntait; les
 * retirer « par motif de nom » casserait la fiche d'un élève chez son coach.
 */
const KEPT_WEEK_KEYS = [
  "week.adherence_overall",
  "week.adherence_core",
  "week.days_value",
  "week.day_value",
] as const;

describe("A7 — `/app/progress` s'appelle « Suivi », et l'écran mort est parti", () => {
  it("`pages/ProgressPage.tsx` n'existe plus, et l'écran vivant est toujours là", () => {
    expect(existsSync(DEAD_PAGE)).toBe(false);
    // LE CAS QUI PASSE: sans lui, ce test resterait vert si quelqu'un déplaçait
    // le dossier entier.
    expect(existsSync(LIVE_PAGE)).toBe(true);
  });

  it("les 36 clés `progress.*` ont quitté les DEUX packs", () => {
    const enKeys = new Set(Object.keys(en));
    const frKeys = new Set(Object.keys(fr));
    for (const key of REMOVED_KEYS) {
      expect(enKeys.has(key), `${key} survit dans en.ts`).toBe(false);
      expect(frKeys.has(key), `${key} survit dans fr.ts`).toBe(false);
    }
    // Et le préfixe entier, pour attraper une 37e qu'on aurait ajoutée depuis.
    for (const key of [...enKeys, ...frKeys]) {
      expect(key.startsWith("progress."), `${key} porte le préfixe mort`).toBe(
        false,
      );
    }
  });

  it("les quatre clés voisines de `week.*` et le namespace vivant sont intacts", () => {
    const enKeys = new Set(Object.keys(en));
    const frKeys = new Set(Object.keys(fr));
    for (const key of KEPT_WEEK_KEYS) {
      expect(enKeys.has(key), `${key} a été emporté`).toBe(true);
      expect(frKeys.has(key), `${key} a été emporté`).toBe(true);
    }
    expect(enKeys.has("student_progress.title")).toBe(true);
    expect(frKeys.has("student_progress.title")).toBe(true);
  });

  it("les libellés de nav disent « Suivi » et « Sécurité » dans les deux langues", () => {
    expect(en["app.nav.progress"]).toBe("Tracking");
    expect(fr["app.nav.progress"]).toBe("Suivi");
    expect(en["app.nav.health"]).toBe("Safety");
    expect(fr["app.nav.health"]).toBe("Sécurité");
    expect(en["health.title"]).toBe("Safety");
    expect(fr["health.title"]).toBe("Sécurité");
  });

  it("aucun CHEMIN n'a bougé: quatre onglets, et `/app/health` toujours dans la nav", () => {
    const nav = studentNav();
    expect(bottomTabs(nav)).toEqual([
      "/app/today",
      "/app/chat",
      "/app/plan",
      "/app/progress",
    ]);
    expect(nav).toContain('"/app/health"');
  });
});

describe("A7 — la ceinture TCA a changé de côté, et la courbe a remplacé le nombre", () => {
  it("la page ne lit plus `weekly_reviews.risk_band` — la colonne morte a quitté le client", () => {
    // ⛔ LE DÉFAUT QUE CE TEST FERME. La garde lisait `risk_band`, une colonne
    // SANS ÉCRIVAIN depuis le 2026-08-08: une ceinture armée sur un coffre
    // vide, qui ne s'est jamais levée pour personne et qui RESSEMBLAIT à une
    // garde qui marche. Les commentaires sont blanchis avant lecture — la note
    // qui raconte le retrait cite le nom de la colonne, et ne doit pas compter
    // comme une lecture.
    expect(page).not.toContain("risk_band");
    expect(page).not.toContain("weekly_reviews");
  });

  it("la page demande la porte au serveur, et le plancher vient de LÀ", () => {
    // LE CAS QUI PASSE: sans ces deux lignes, le test du dessus resterait vert
    // sur une page qui ne garde plus rien du tout.
    expect(page).toContain("loadTracking(");
    expect(page).toContain("report.floor");
  });

  it("la carte de poids d'avant est partie, avec son module et son test", () => {
    expect(page).not.toContain("displayWeights");
    expect(existsSync(OLD_WEIGHT)).toBe(false);
    expect(existsSync(OLD_WEIGHT_TEST)).toBe(false);
    // `datedMeasures` reste chez `api/bodyMeasures.ts`, avec la leçon
    // écrivain/lecteur de `outcomes.weight_7d_avg` — c'est le MODULE de
    // façade qui part, pas la connaissance.
    expect(
      existsSync(resolve(__dirname, "../api/bodyMeasures.ts")),
    ).toBe(true);
  });

  it("les quatre surfaces neuves sont montées par la page", () => {
    for (const mounted of [
      "<TrackingSummaryCard",
      "<TrackingObjectiveCard",
      "<WeightCurveCard",
      "<TrackingDescribeDialog",
    ]) {
      expect(page, `${mounted} n'est pas monté`).toContain(mounted);
    }
  });
});

describe("A7 — chaque base a sa phrase, dans les deux langues", () => {
  it("les cinq bases portent un total, et il n'en manque aucune", () => {
    // ⛔ LE DÉFAUT QUE CE TEST FERME: une base sans phrase rendrait un total
    // avec une clé manquante — c'est-à-dire un chiffre affiché sans sa base,
    // exactement ce que `CALORIE_REVERSAL.md` §5 interdit. Le total est nommé
    // PAR sa base, donc l'inventaire doit être complet des DEUX côtés.
    for (const [name, pack] of [["en", en], ["fr", fr]] as const) {
      for (const basis of TRACKING_BASES) {
        const key = `tracking.total.${basis}`;
        const value = (pack as Record<string, string>)[key];
        expect(value, `${name}/${key} manque`).toBeTruthy();
        expect(value, `${name}/${key} n'interpole pas le nombre`).toContain(
          "{kcal}",
        );
      }
      // Et l'estimation d'un créneau, la sixième phrase qui écrit un kcal.
      expect(
        (pack as Record<string, string>)["tracking.energy.slot_estimate"],
      ).toContain("{kcal}");
    }
  });

  it("aucune phrase du suivi n'affiche un pourcentage ni un reste-à-manger", () => {
    // FF-059 R10 (« sommer les comptes est un score d'adhérence déguisé ») et
    // l'interdit « il te reste X kcal ». Les deux se voient dans le PACK, où
    // ils survivraient à une refonte du composant.
    const offenders: string[] = [];
    for (const [name, pack] of [["en", en], ["fr", fr]] as const) {
      for (const [key, value] of Object.entries(pack)) {
        if (!key.startsWith("tracking.")) continue;
        if (typeof value !== "string") continue;
        if (/%|\bremaining\b|\bleft to eat\b|\bil te reste\b|\brestant/i.test(value)) {
          offenders.push(`${name}/${key}: ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
