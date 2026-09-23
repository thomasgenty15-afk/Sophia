import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TargetAndPaceFields } from "../components/MouthFormDialog";
import { emptyMouthDraft, type MouthFormDraft } from "../lib/mouthForm";
import { PAGE_NAMESPACES } from "../i18n/catalog";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// LOT A2 (2026-09-22) — LE RYTHME SUR LA FICHE D'UNE BOUCHE DÉJÀ INSCRITE
//
// ── LES DEUX FAITS MESURÉS QUE CE FICHIER GARDE ───────────────────────────
//
//   ① LE CADRE « Informations personnelles » N'AVAIT NI POIDS VISÉ NI
//      CURSEUR. Le curseur existait à deux endroits (l'entonnoir, la fiche
//      d'ajout) et manquait exactement là où l'on corrige quelqu'un qui est
//      DÉJÀ inscrit. Conséquence sur le foyer de test: une bouche de 93 kg en
//      perte restait figée à 0,45 kg/semaine alors que sa borne était passée à
//      0,80, et aucun écran du produit ne pouvait l'y amener.
//
//   ② UN CRAN AU-DESSUS DU PLAFOND NE SE VOYAIT NULLE PART. `paceControlFor`
//      RABAT le cran sur le plafond de ce corps — c'est voulu, un curseur ne
//      doit pas montrer une butée qu'il n'a pas —, donc l'écran affichait 0,35
//      pendant que la base portait 0,45. Le moteur, lui, cuisine 0,35. Trois
//      nombres, aucune phrase pour les relier.
//
// ⚠️ ON MONTE `TargetAndPaceFields`, PAS LA PAGE. `HouseholdPage` ne se rend
// pas sous `renderToStaticMarkup` (session, routeur, six lectures) et la fiche
// vit dans un `Modal`, donc derrière `createPortal(…, document.body)` —
// `vitest.config.ts` tourne en environnement `node`, il n'y a pas de
// `document`. Ce que le rendu ne peut pas dire — QUELLE page monte ce bloc,
// sous QUELLES gardes, et vers QUELLE porte d'écriture — est lu dans la
// source, commentaires blanchis (cicatrice `caller-audit-must-strip-comments`:
// `HouseholdPage.tsx` PARLE longuement de ces portes, et un grep naïf
// compterait ces morts-là comme des vivants).
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ, donc un
// fichier entier de silence vert.
// ===========================================================================

const PATH = "/app/household";

/** 2026-09-22, le jour de la mesure. `ADULT_BIRTH` fait 36 ans ce jour-là. */
const TODAY = "2026-09-22";
const ADULT_BIRTH = "1990-05-04";

function onPage(locale: "fr" | "en"): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
}

function decode(markup: string): string {
  return markup
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
}

function text(markup: string): string {
  return decode(markup.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}

/**
 * 72 kg pour 187 cm, adulte, sédentaire — le corps du TITULAIRE du foyer de
 * test. Son plafond de PRISE vaut 0,5 kg/semaine (⟳ 2026-09-23; 0,35 du
 * 2026-09-21 au 2026-09-23).
 */
const TALL_LEAN_MAN: Partial<MouthFormDraft> = {
  firstName: "Tom",
  birthDate: ADULT_BIRTH,
  heightCm: "187",
  weightKg: "72",
  gender: "male",
  activityLevel: "sedentary",
};

/**
 * 93 kg pour 173 cm, adulte, sédentaire — la bouche sans compte du foyer de
 * test. Son plafond de PERTE vaut 0,80 kg/semaine.
 */
const HEAVY_MAN: Partial<MouthFormDraft> = {
  firstName: "Fab",
  birthDate: ADULT_BIRTH,
  heightCm: "173",
  weightKg: "93",
  gender: "male",
  activityLevel: "sedentary",
};

function render(
  patch: Partial<MouthFormDraft>,
  locale: "fr" | "en" = "fr",
): string {
  onPage(locale);
  return renderToStaticMarkup(
    createElement(TargetAndPaceFields, {
      draft: { ...emptyMouthDraft(), ...patch },
      onChange: () => {},
      todayLocalIso: TODAY,
      idPrefix: "member-TEST",
      voice: "other",
      who: "Fab",
    }),
  );
}

// ---------------------------------------------------------------------------
// ② LA LIGNE « choisi / exécuté »
// ---------------------------------------------------------------------------

describe("la ligne qui relie le cran enregistré au cran cuisiné", () => {
  it("⟳ 2026-09-23 — MORD: le 0,45 de Thomas est affiché tel quel, sans ligne, sous une butée à 0,5", () => {
    const html = render({
      ...TALL_LEAN_MAN,
      goal: "muscle_gain",
      targetWeightKg: "78",
      paceKgPerWeek: "0.45",
    });
    expect(html).toContain('max="0.5"');
    expect(text(html)).toContain("0,45");
    expect(text(html)).not.toContain(
      decode(fr["household.mouth.pace_executed"].split(" {chosen}")[0]),
    );
  });

  it("elle MORD: 0,70 en base (d'avant le 2026-09-23), 0,50 dans la casserole, les deux à l'écran", () => {
    const html = render({
      ...TALL_LEAN_MAN,
      goal: "muscle_gain",
      targetWeightKg: "78",
      paceKgPerWeek: "0.7",
    });
    const shown = text(html);
    // ⚠️ LES DEUX NOMBRES, PAS UN SEUL. Le curseur montre déjà 0,5; une
    // phrase qui ne dirait que « c'est le maximum » n'apprendrait rien à
    // quelqu'un qui croit avoir réglé 0,7.
    expect(shown, "la phrase ne nomme pas le cran ENREGISTRÉ").toContain("0,70");
    expect(shown, "la phrase ne nomme pas le cran CUISINÉ").toContain("0,50");
    expect(shown).toContain(
      decode(
        fr["household.mouth.pace_executed"]
          .replace("{chosen}", "0,70")
          .replace("{executed}", "0,50"),
      ),
    );
    // ⚠️ ET LE CURSEUR, LUI, EST BORNÉ — c'est ce qui rend la phrase lisible:
    // le lecteur voit la butée, et la phrase lui dit ce qu'il y avait avant.
    expect(html).toContain('max="0.5"');
  });

  // ── LE CAS QUI PASSE — « une garde a besoin d'un cas qui passe » ─────────
  it("elle se TAIT quand le cran passe tel quel", () => {
    const html = render({
      ...HEAVY_MAN,
      goal: "fat_loss",
      targetWeightKg: "80",
      paceKgPerWeek: "0.45",
    });
    expect(text(html), "une ligne s'affiche sur un cran exécuté tel quel")
      .not.toContain(
        decode(fr["household.mouth.pace_executed"].split(" {chosen}")[0]),
      );
    expect(html).toContain('max="0.8"');
  });

  it("elle sort aussi en anglais, et ce n'est pas le français recopié", () => {
    const html = render(
      {
        ...TALL_LEAN_MAN,
        goal: "muscle_gain",
        targetWeightKg: "78",
        paceKgPerWeek: "0.7",
      },
      "en",
    );
    const shown = text(html);
    // ⚠️ LA VIRGULE DÉCIMALE EST CELLE DE LA PAGE, PAS DU NAVIGATEUR. Le même
    // nombre s'écrit « 0,70 » en français et « 0.70 » en anglais — vingt-six
    // sites du produit ont déjà divergé sur `toLocaleString()` sans argument.
    expect(shown).toContain("0.70");
    expect(shown).toContain("0.50");
    expect(shown).not.toContain("0,70");
  });
});

// ---------------------------------------------------------------------------
// ① LE BLOC EST BIEN MONTÉ SUR LA FICHE D'UNE BOUCHE
// ---------------------------------------------------------------------------

/**
 * La source de la page, commentaires blanchis.
 *
 * ⛔ SANS CE BLANCHIMENT, CE FICHIER SERAIT VERT SUR DU CODE MORT:
 * `HouseholdPage.tsx` cite `setOwnTarget`, `student_goals` et
 * `TargetAndPaceFields` dans ses pavés d'explication.
 */
function page(): string {
  return readFileSync(new URL("./HouseholdPage.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("la fiche d'une bouche porte le curseur, et une seule porte l'écrit", () => {
  const src = page();

  it("`TargetAndPaceFields` est MONTÉ, pas recopié", () => {
    expect(src, "le bloc n'est pas monté sur cette page")
      .toContain("<TargetAndPaceFields");
    // ⛔ UNE SECONDE LECTURE DE `paceControlFor` SERAIT DEUX ÉCRANS QUI
    // DIVERGENT AU PREMIER CORRECTIF. C'est le motif écrit sur le composant
    // lui-même, et ce dépôt l'a déjà payé sur les listes d'objectifs.
    expect(src, "la page recalcule le curseur au lieu de monter le composant")
      .not.toContain("paceControlFor(");
  });

  it("⛔ il est gardé par une PORTE DE LECTURE — `targetsLoaded`", () => {
    // La porte n'est pas un état d'affichage: `keel_household_set_member_target`
    // REMPLACE la paire. Monté sur du vide non lu, le bloc l'écrirait.
    // Cicatrice `mount-snapshot-forms-need-a-loading-gate`.
    expect(src).toContain("targetsLoaded");
    expect(src).toContain("targetsLoaded={targets !== null}");
    expect(src, "la garde ne nomme pas ses trois prémisses")
      .toContain(
        "viewerIsOwner && member.userId === null && targetsLoaded",
      );
    expect(src, "le bloc se rend sans sa garde")
      .toContain("{showTarget ? (");
  });

  it("l'état de la lecture part de `null`, jamais d'une Map vide", () => {
    // `new Map()` rendrait « pas encore lu » et « lu, personne ne vise rien »
    // INDISTINGUABLES — le défaut exact que `bodies` portait avant A5.
    expect(src).toMatch(
      /targets,\s*setTargets\s*\]\s*=\s*React\.useState<\s*Map<string,\s*MemberTargetView>\s*\|\s*null\s*>\(null\)/,
    );
  });

  it("la page LIT vraiment les deux faits que le roster ne rend pas", () => {
    expect(src, "la cible de chaque bouche n'est jamais lue")
      .toContain("loadMemberTargets(hh.id)");
    // Sans la date, `estimatedMaintenanceKcal` n'a pas de bande d'âge, donc
    // `paceControlFor` rend `needs_body`: la fiche promettrait un rythme
    // qu'elle ne donne pas. Même cause que le défaut de l'entonnoir du
    // 2026-09-19.
    expect(src, "la date qui borne le curseur n'est jamais lue")
      .toContain("loadMemberBirthDates(");
  });

  it("⛔ une bouche SANS COMPTE écrit `household_members`, jamais `student_goals`", () => {
    expect(src, "la porte de la ligne n'est pas appelée")
      .toContain("setMemberTarget(memberId, targetWeightKg, paceKgPerWeek)");
    // D1 — la cible de qui a un COMPTE vit dans son « about you », et le
    // moteur lit `household_members` EN PREMIER: y écrire par-dessus poserait,
    // sur la colonne prioritaire, un nombre que la personne n'a pas réglé.
    // `ownTargetWriter` reste la porte du TITULAIRE, et lui seul.
    expect(src, "la fiche d'une bouche a gagné un second écrivain de cible")
      .not.toContain("setOwnTarget(");
    expect(src, "la porte du titulaire a disparu de sa propre fiche")
      .toContain("ownTargetWriter(userId)");
  });

  it("la direction part AVANT la paire — c'est un CHECK de la base", () => {
    // `household_members_target_needs_direction_check` refuse une cible
    // chiffrée tant que `goal` n'est ni `fat_loss` ni `muscle_gain`. Écrire la
    // paire en premier ferait échouer le tout premier réglage de quelqu'un qui
    // vient de choisir sa direction dans la même fenêtre.
    const save = src.indexOf("goal: goalForAge(draft.goal, rowAge) || null");
    const target = src.indexOf("await onSaveTarget(pair.targetWeightKg");
    expect(save, "le Save de la fiche a disparu").toBeGreaterThan(-1);
    expect(target, "la paire n'est jamais écrite").toBeGreaterThan(-1);
    expect(target, "la cible part avant la direction").toBeGreaterThan(save);
    // ⚠️ ET SEULEMENT SUR UN SUCCÈS: sur un refus, la base porte encore
    // l'ancienne direction.
    expect(src).toContain("if (ok && pair !== null) {");
  });

  it("⛔ elle n'écrit RIEN quand le corps manque", () => {
    // `targetPayloadOf` rend `(null, null)` aussi bien sur `maintenance` — où
    // effacer est le geste légitime — que sur un corps inconnu, où aucun
    // contrôle n'est à l'écran. Sans cette garde, ouvrir la fiche d'une bouche
    // sans corps et cliquer Enregistrer effacerait sa cible.
    expect(src, "la garde du corps inconnu a disparu")
      .toContain("!targetWriteIsBlind(rowTargetDraft, todayLocalIso)");
  });

  it("⚠️ la paire est LUE avant l'attente — `run` relit et re-sème", () => {
    // Lire la paire après l'attente rendrait la valeur d'AVANT le geste:
    // un curseur qu'on pousse et qui revient tout seul.
    // ⚠️ ON DÉCOUPE LE GESTE, ET PAS LE FICHIER. La fiche du TITULAIRE
    // (`MeFiche`) porte le même `const ok = await onSave({` plus haut:
    // mesurer sur le fichier entier compterait l'ordre d'une AUTRE fiche.
    const start = src.indexOf("const pair =");
    expect(start, "le geste de la fiche d'une bouche a disparu")
      .toBeGreaterThan(-1);
    const end = src.indexOf("if (ok) setDraft(", start);
    expect(end, "la fin du geste a disparu").toBeGreaterThan(start);
    const gesture = src.slice(start, end);
    const read = gesture.indexOf("targetPayloadOf(rowTargetDraft, todayLocalIso)");
    const awaited = gesture.indexOf("const ok = await onSave({");
    expect(read, "la paire n'est jamais calculée dans ce geste")
      .toBeGreaterThan(-1);
    expect(awaited, "le Save a quitté ce geste").toBeGreaterThan(-1);
    expect(read, "la paire est lue APRÈS la relecture de la page")
      .toBeLessThan(awaited);
  });
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

describe("i18n: la phrase existe dans les DEUX packs", () => {
  it("elle n'est ni absente ni l'anglais recopié, et elle porte SES DEUX TROUS", () => {
    const k = "household.mouth.pace_executed";
    expect(en[k], "la phrase manque en anglais").toBeTruthy();
    expect(fr[k], "la phrase manque en français").toBeTruthy();
    expect(fr[k], "le français est l'anglais recopié").not.toBe(en[k]);
    for (const pack of [en, fr]) {
      expect(pack[k], "le gabarit a perdu le cran enregistré")
        .toContain("{chosen}");
      expect(pack[k], "le gabarit a perdu le cran cuisiné")
        .toContain("{executed}");
    }
  });

  it("le namespace `household` est déclaré sur cette page", () => {
    expect(PAGE_NAMESPACES[PATH]).toContain("household");
  });
});
