import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

  it("le libellé de nav dit « Suivi » dans les deux langues", () => {
    expect(en["app.nav.progress"]).toBe("Tracking");
    expect(fr["app.nav.progress"]).toBe("Suivi");
  });

  // ⟳ 2026-09-09 — LA SECTION « SÉCURITÉ » EST PARTIE DE L'APP. Ce qui reste
  // gardé ici est la conséquence: aucune entrée de nav ne doit la faire
  // revenir, et les quatre onglets du bas n'ont pas bougé.
  it("quatre onglets, et plus aucune entrée « Sécurité » dans la nav", () => {
    const nav = studentNav();
    expect(bottomTabs(nav)).toEqual([
      "/app/today",
      "/app/chat",
      "/app/plan",
      "/app/progress",
    ]);
    expect(nav).not.toContain('"/app/health"');
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

  it("la page demande le journal versionné au serveur, et le plancher vient de LÀ", () => {
    // LE CAS QUI PASSE: sans ces deux lignes, le test du dessus resterait vert
    // sur une page qui ne garde plus rien du tout.
    expect(page).toContain("loadJournalTracking(");
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

  it("la page monte le journal, son éditeur et la courbe de poids", () => {
    for (const mounted of ["<DayPanel", "<MealEditor", "<WeightCurveCard"]) {
      expect(page, `${mounted} n'est pas monté`).toContain(mounted);
    }
  });

  it("les compteurs, le rythme, les points du soir et les séances ont quitté l'écran", () => {
    for (const removed of [
      "TrackingSummaryCard",
      "TrackingObjectiveCard",
      "TrackingDescribeDialog",
      "ActivitySessionsCard",
      "aggregateRhythm",
      "aggregateWeekInFood",
      "student_daily_checkins",
      "daily_pulses",
    ]) {
      expect(page, `${removed} est encore câblé`).not.toContain(removed);
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

describe("A7 — une clé du suivi qui n'est pas rendue est une clé qui peut mentir", () => {
  /** Tous les fichiers `.ts`/`.tsx` de `keel/`, hors packs et hors tests. */
  function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) sources(full, out);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  const CODE = sources(resolve(__dirname, ".."))
    .filter((f) => !/[\\/]i18n[\\/](en|fr|catalog)\.ts$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  it("chaque clé `tracking.*` a un appelant vivant", () => {
    // ⛔ LE DÉFAUT QUE CE TEST FERME, ET IL EST SUBTIL.
    // `tracking.describe.done` était déclarée dans les deux packs, JAMAIS
    // rendue, et son texte affirmait « ça compte dans ce jour, maintenant » —
    // l'inverse exact de ce que « Décrire » fait. Le journal de la lane pouvait
    // écrire « aucune copie ne prétend le contraire » et avoir raison PAR
    // ACCIDENT: la phrase ne mentait à personne parce que personne ne la
    // voyait. Le jour où quelqu'un la câblait, l'écran affirmait le contraire
    // du produit — et le commit qui la câblait n'aurait touché aucun pack.
    //
    // Une clé orpheline n'est donc pas de la dette morte: c'est une affirmation
    // ARMÉE. Ce namespace est jeune, il n'a aucune orpheline légitime, et c'est
    // le moment de fermer la porte.
    const orphans: string[] = [];
    for (const key of Object.keys(en)) {
      if (!key.startsWith("tracking.")) continue;
      // Les clés construites par famille (`tracking.total.<base>`,
      // `tracking.scope.<portée>`, `tracking.dish.<état>`,
      // `tracking.weight.period.<fenêtre>`) sont appelées par un gabarit; on
      // cherche donc le gabarit, puis la clé entière.
      const family = key.slice(0, key.lastIndexOf(".") + 1);
      if (CODE.includes(`"${key}"`)) continue;
      if (CODE.includes(`\`${family}`)) continue;
      orphans.push(key);
    }
    expect(orphans).toEqual([]);
  });

  it("les DEUX accusés de « Décrire » sont rendus, et chacun dit ce qui a été écrit", () => {
    // ⟳ 2026-09-09 — LE TROU EST BOUCHÉ, DONC CE TEST CHANGE DE CIBLE. Il
    // gardait la phrase « le chiffre du jour ne bouge pas encore », qui NOMMAIT
    // une non-livraison: `describeMissedSlot` n'écrivait aucune énergie. Il
    // délègue maintenant à l'écrivain du journal, qui lit la description et en
    // tire un `text_estimate`.
    //
    // ⛔ DEUX ISSUES, DONC DEUX PHRASES, ET LES DEUX DOIVENT ÊTRE RENDUES. Une
    // seule clé câblée sur deux ferait retomber le cas non rendu sur un texte
    // qui ment — c'est exactement le défaut que la version d'avant portait.
    const dialog = readFileSync(
      resolve(__dirname, "../components/TrackingDescribeDialog.tsx"),
      "utf8",
    );
    expect(dialog).toContain('t("tracking.describe.done")');
    expect(dialog).toContain('t("tracking.describe.done.estimated"');
    for (const [name, pack] of [["en", en], ["fr", fr]] as const) {
      const done = (pack as Record<string, string>)["tracking.describe.done"];
      const estimated =
        (pack as Record<string, string>)["tracking.describe.done.estimated"];
      // Les deux DISENT que le repas cesse d'être oublié — c'est vrai des deux.
      expect(done, name).toMatch(/no longer counts as missed|plus compté comme oublié/);
      expect(estimated, name).toMatch(
        /no longer counts as missed|plus compté comme oublié/,
      );
      // ⛔ CELLE QUI PORTE LE CHIFFRE LE DIT ESTIMÉ. « about {kcal} » /
      // « environ {kcal} »: un point sec annoncerait comme mesuré ce qui est lu
      // dans une phrase. La base est DANS la clé, le mot est dans le texte.
      expect(estimated, name).toMatch(/about \{kcal\}|environ \{kcal\}/);
      // ⛔ ET CELLE QUI N'EN PORTE PAS N'EN INVENTE AUCUN.
      expect(done, name).not.toContain("{kcal}");
    }
  });

  it("la phrase d'abstention ne nomme AUCUNE portée", () => {
    // Elle disait « sur ce jour » / « for this day » et s'affichait telle
    // quelle sous « Ces sept jours » et « Ce plan » — contredite deux fois sur
    // trois. La portée vit dans `tracking.scope.*`, juste au-dessus.
    for (const [name, pack] of [["en", en], ["fr", fr]] as const) {
      const line = (pack as Record<string, string>)["tracking.total.abstained"];
      expect(line, name).toBeTruthy();
      expect(line.toLowerCase(), name).not.toMatch(
        /this day|ce jour|this plan|ce plan|seven days|sept jours/,
      );
    }
  });
});
