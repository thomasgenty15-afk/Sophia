import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildDemoPlan, DEMO_MEMBER_ALEX, DEMO_MEMBER_CAMILLE } from "./demoPlan";
import DemoPlanTour from "./DemoPlanTour";
import PlanResult from "../PlanResult";
import { en } from "../../../i18n/en";
import { fr } from "../../../i18n/fr";
import { setChosenUiLocaleForTest } from "../../../i18n/runtime";

// ===========================================================================
// ⟳ 2026-09-25 — LE PLAN DE DÉMONSTRATION, PENDANT QU'UN VRAI SE COMPOSE.
// ===========================================================================
//   ① la démo est un VRAI plan pour l'écran: elle passe par le lecteur de
//      production et remplit toutes les zones que la visite montre;
//   ② « Changer » a de quoi montrer « même raison »: le plat de la visite a
//      deux autres plats de sa famille;
//   ③ l'écran dit que c'est une démonstration, dans les deux langues;
//   ④ les deux écrans d'attente la montent, et seulement pendant l'attente.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` ne collecte
// que `src/**/*.int.test.ts`.

const STARTS = "2026-09-25";

function atLocale(locale: "en" | "fr"): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: "/app/plan", search: "", href: "http://localhost/app/plan" },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

function code(rel: string): string {
  return readFileSync(resolve(__dirname, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("① un vrai plan pour l'écran", () => {
  for (const locale of ["fr", "en"] as const) {
    it(`${locale} — trois jours, une session, des courses, des boîtes`, () => {
      const { plan } = buildDemoPlan(STARTS, locale);
      expect(plan.startsOn).toBe(STARTS);
      expect(plan.durationDays).toBe(3);
      expect(plan.dishes).toHaveLength(9);
      expect(new Set(plan.dishes.map((d) => d.day)).size).toBe(3);
      expect(plan.preparations).toHaveLength(4);
      expect(plan.cookingSessions).toHaveLength(1);
      expect(plan.cookingSessions[0].preparation_ids).toHaveLength(4);
      expect(plan.shoppingList.length).toBeGreaterThan(15);
      expect(plan.memberPortions.map((p) => p.memberId)).toEqual([DEMO_MEMBER_CAMILLE, DEMO_MEMBER_ALEX]);
      // Chaque plat a un titre unique: « Changer » barre par titre.
      expect(new Set(plan.dishes.map((d) => d.title)).size).toBe(9);
      // Chaque plat porte ses boîtes, une par personne.
      for (const dish of plan.dishes) expect(dish.boxes.length).toBe(2);
    });
  }

  it("seule Camille a un chiffre de calories (elle seule a un objectif)", () => {
    const demo = buildDemoPlan(STARTS, "fr");
    const day = demo.plan.dishes[0].day ?? "";
    expect(demo.memberDayEnergy(DEMO_MEMBER_CAMILLE, day)?.kcal).toBeGreaterThan(0);
    expect(demo.memberDayEnergy(DEMO_MEMBER_ALEX, day)).toBeNull();
  });
});

describe("② « Changer » a de quoi montrer « même raison »", () => {
  it("le plat de la visite est au premier jour, et deux autres plats partagent sa famille", () => {
    const demo = buildDemoPlan(STARTS, "fr");
    const target = demo.plan.dishes.find((d) => d.title === demo.tourDishTitle);
    expect(target?.day).toBe(demo.plan.dishes[0].day);
    const family = demo.families.get(demo.tourDishTitle);
    const alike = demo.plan.dishes.filter(
      (d) => d.title !== demo.tourDishTitle && demo.families.get(d.title) === family,
    );
    expect(alike).toHaveLength(2);
    expect(demo.reason).toBe("Pas de saumon cette semaine");
  });
});

describe("③ la vraie interface de l'aperçu, et elle dit que c'est une démonstration", () => {
  for (const [locale, pack] of [["fr", fr], ["en", en]] as const) {
    it(`${locale} — le plan de démo passe par \`PlanResult\` en ligne compacte, avec les repères de la visite`, () => {
      atLocale(locale);
      const { plan, tourDishTitle } = buildDemoPlan(STARTS, locale);
      const html = renderToStaticMarkup(createElement(PlanResult, {
        dishes: plan.dishes,
        preparations: plan.preparations,
        cookingSessions: plan.cookingSessions,
        shoppingList: plan.shoppingList,
        portions: plan.memberPortions,
        startsOn: plan.startsOn,
        durationDays: plan.durationDays,
        today: STARTS,
        emptyLabel: "",
        dishLayout: "compact",
      }));
      for (const anchor of ["recap", "day-rail", "day-prep", "day-groceries", "day-session", "day-menu"]) {
        expect(html, anchor).toContain(`data-tour="${anchor}"`);
      }
      expect(html).toContain(tourDishTitle);
      // ⛔ Aucun bouton que l'aperçu n'a pas: ni sessions, ni courses en tête.
      expect(html).not.toContain(pack["meals.sessions.title"]);
      expect(html).not.toContain(`>${pack["meals.result.shopping_title"]}<`);
    });

    it(`${locale} — dans l'écran d'attente, la ligne qui ouvre la démonstration`, () => {
      atLocale(locale);
      const html = renderToStaticMarkup(createElement(DemoPlanTour, { progress: null, householdSize: 2, composing: true }));
      expect(html).toContain(pack["plan.demo.invite"]);
      expect(html).toContain(pack["plan.demo.show"]);
    });
  }

  it("⛔ une fenêtre comme l'aperçu: la même `Modal`, même taille, fermée par son bouton seul; aucun outil ajouté", () => {
    const src = code("./DemoPlanTour.tsx");
    expect(src).toContain("<Modal");
    expect(src).toContain('size="lg"');
    expect(src).toContain("closeOnlyByButton");
    expect(src).toContain('title={t("plan.demo.banner_title")}');
    expect(src).not.toContain("tools=");
  });
});

describe("① bis — une personne ou deux, selon le foyer", () => {
  it("une personne: une boîte par repas, une seule part, l'à-côté à Camille, des courses de moitié", () => {
    const duo = buildDemoPlan(STARTS, "fr", 2).plan;
    const solo = buildDemoPlan(STARTS, "fr", 1).plan;
    expect(solo.memberPortions.map((p) => p.memberId)).toEqual([DEMO_MEMBER_CAMILLE]);
    for (const dish of solo.dishes) {
      expect(dish.boxes.map((b) => b.member_ids)).toEqual([[DEMO_MEMBER_CAMILLE]]);
    }
    const sides = solo.dishes.flatMap((d) => d.side_courses);
    expect(sides.length).toBeGreaterThan(0);
    for (const side of sides) expect(side.member_id).toBe(DEMO_MEMBER_CAMILLE);
    const salmon = (p: typeof duo) => p.shoppingList.find((i) => i.term === "saumon")?.quantity;
    expect(salmon(duo)).toBe("720 g");
    expect(salmon(solo)).toBe("360 g");
  });

  it("les écrans passent la taille du foyer", () => {
    expect(code("../../MealBuilder.tsx")).toContain("householdSize={household?.members.length ?? 1}");
    expect(code("../../../pages/SetupPage.tsx")).toContain("householdSize={facts?.mouths.length ?? 1}");
  });
});

describe("④ les écrans d'attente la montent — et une visite commencée va jusqu'au bout", () => {
  it("le composeur: montée pendant l'attente ET tant que sa fenêtre est ouverte, hors de la branche d'attente", () => {
    const src = code("../../MealBuilder.tsx");
    const mount = src.indexOf("{(building || demoOpen) && (");
    const demo = src.indexOf("<DemoPlanTour", mount);
    expect(mount).toBeGreaterThan(-1);
    expect(demo).toBeGreaterThan(mount);
    expect(src.slice(demo, demo + 200)).toContain("composing={building}");
    // Hors du ternaire d'attente: changer de branche la démonterait.
    expect(src.indexOf("<PlanComposingCard")).toBeGreaterThan(demo);
  });

  it("l'entonnoir: pendant l'attente ET tant que sa fenêtre est ouverte", () => {
    const src = code("../../../pages/SetupPage.tsx");
    // ⛔ La composition SEULE: `busy` sert aussi aux enregistrements.
    expect(src).toContain("{((composeBusy || resumingDraft) && draft === null) || demoOpen ? (");
    expect(src).toContain("composing={composeBusy || resumingDraft}");
    expect(src).not.toContain("{(busy && draft === null) || demoOpen ? (");
  });

  it("⛔ l'aperçu se CACHE tant que la démonstration est ouverte (sans se refermer), et les pages disent quand le plan est là", () => {
    for (const page of ["../../../pages/SetupPage.tsx", "../../../pages/StudentWeekPlanPage.tsx"]) {
      const src = code(page);
      expect(src, page).toContain("open={draft !== null}");
      expect(src, page).toContain("usePublishRealPlanReady(draft !== null);");
    }
    // Caché, pas fermé: `open` ne bouge pas, l'effet d'ouverture (qui remet
    // la note et les plats barrés à zéro) ne rejoue pas au retour.
    const dialog = code("../PlanDraftDialog.tsx");
    expect(dialog).toContain("open={open && !demoOpen}");
    expect(dialog).toContain("const demoOpen = useDemoOpen();");
  });

  it("« Visite guidée » à côté du titre de l'aperçu: la démonstration se monte et part sur la visite", () => {
    const dialog = code("../PlanDraftDialog.tsx");
    expect(dialog).toContain("onClick={requestDemoTour}");
    expect(dialog).toContain('{t("plan.draft.tour")}');
    const titleAt = dialog.indexOf('title={t("plan.draft.title")}');
    expect(dialog.indexOf("titleAction={", titleAt)).toBeGreaterThan(titleAt);
    expect(code("../../ui/Modal.tsx")).toContain("{titleAction}");
    const src = code("./DemoPlanTour.tsx");
    expect(src).toContain("if (isDemoTourRequested()) startTour();");
    expect(src).toContain("usePublishDemoOpen(open || intro);");
    // La demande tombe quand une fenêtre s'ouvre, dans le même geste.
    const gate = code("./demoGate.ts");
    expect(gate).toContain("openDemos.add(key.current);\n      tourRequested = false;");
    for (const pack of [fr, en]) expect(pack["plan.draft.tour"]).not.toBe("");
  });

  it("la visite finie (ou passée) referme la démonstration: le plan chargé s'affiche, ou s'affichera", () => {
    const src = code("./DemoPlanTour.tsx");
    expect(src).toContain("const closeTour = closeDemo;");
  });
});

describe("⑤ les deux façons d'ajuster, et une visite menée par un curseur", () => {
  it("les étapes: plus d'introduction, « Changer » d'un seul tenant, puis les deux façons", () => {
    const src = code("./DemoPlanTour.tsx");
    const ids = [...src.matchAll(/id: "([a-z0-9]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([
      "recap",
      "rail",
      "groceries",
      "session",
      "preparation",
      "boxing",
      "menu",
      "adjust",
      "way1",
      "way2",
      "end",
    ]);
    expect(src).toContain('placeholder={t("plan.draft.note_placeholder")}');
    for (const pack of [fr, en]) {
      expect(pack["plan.demo.step_way1_title"]).toMatch(/1/);
      expect(pack["plan.demo.step_way2_title"]).toMatch(/2/);
      expect(pack["plan.demo.note_example"]).not.toBe("");
    }
  });

  it("⛔ le curseur clique les VRAIS boutons: « Changer », « Valider », « Barrer aussi », « Ajuster le plan »", () => {
    const src = code("./DemoPlanTour.tsx");
    expect(src).toContain('buttonIn(tourCard(), mealCopy("meals.dish.replace"))');
    expect(src).toContain('t("plan.draft.replace_confirm")');
    expect(src).toContain("await a.click(footerAdjust());");
  });

  it("⛔ pendant la visite, rien ne se clique ni ne défile à la main, et une bulle ne se referme pas seule", () => {
    const overlay = code("../../ui/TourOverlay.tsx");
    expect(overlay).toContain('<div aria-hidden="true" className="fixed inset-0 z-[69]" />');
    expect(overlay).toContain('window.addEventListener("wheel", blockPointer, { passive: false, capture: true });');
    const src = code("./DemoPlanTour.tsx");
    expect(src).toContain("if (!touringRef.current) setReasonFor(null);");
    expect(src).toContain("if (!touringRef.current) setSuggest(null);");
  });

  it("à chaque composition, une invitation grandit depuis le bouton: « On y va » ou « Passer »", () => {
    const src = code("./DemoPlanTour.tsx");
    expect(src).not.toContain("localStorage");
    expect(src).toContain('const [intro, setIntro] = React.useState(() => typeof document !== "undefined" && composing);');
    expect(src).toContain("document.activeElement instanceof HTMLButtonElement");
    expect(src).toContain("<DemoIntroPrompt origin={origin} onGo={startTour}");
    for (const pack of [fr, en]) {
      expect(pack["plan.demo.intro_go"]).not.toBe("");
      expect(pack["plan.demo.intro_skip"]).not.toBe("");
    }
  });

  it("⛔ le curseur attend la fin de la lecture: 3 s au moins (6 s dès l'étape 3) entre le texte et le premier geste", () => {
    const overlay = code("../../ui/TourOverlay.tsx");
    expect(overlay).toContain("export const READ_MS = 3000;");
    const flow = overlay.slice(overlay.indexOf("const startedAt = performance.now();"));
    const prepare = flow.indexOf("stepRef.current.prepare?.();");
    const reveal = flow.indexOf("await reveal(stepRef.current.targets(), true);");
    const read = flow.indexOf("await wait(Math.max(0, readMs - (performance.now() - startedAt)));");
    const play = flow.indexOf("await stepRef.current.onEnter?.(actor);");
    // Ranger sans curseur, PUIS défiler, PUIS attendre la lecture, PUIS jouer.
    expect(prepare).toBeGreaterThan(-1);
    expect(reveal).toBeGreaterThan(prepare);
    expect(read).toBeGreaterThan(reveal);
    expect(play).toBeGreaterThan(read);
  });

  it("⛔ le Boxing garde la Préparation ouverte (la page ne fait que descendre), et la dernière étape ne remonte pas", () => {
    const src = code("./DemoPlanTour.tsx");
    const boxing = src.slice(src.indexOf('id: "boxing"'), src.indexOf('id: "menu"'));
    const prepare = boxing.indexOf("prepare: () => {");
    const script = boxing.indexOf("onEnter: async (a) => {");
    expect(prepare).toBeGreaterThan(-1);
    // « Préparation » reste ouverte: la refermer remontait le Boxing au-dessus de l'écran.
    expect(boxing.slice(prepare, script)).not.toContain('sessionTile("preparation")');
    expect(boxing.slice(prepare, script)).toContain('dayCardButton("day-session", true)?.click();');
    const end = src.slice(src.indexOf('id: "end"'));
    expect(end.slice(0, 400)).toContain("targets: () => [],");
    // Un clic de programme sur « Masquer … » ne ramène pas la page en haut.
    expect(code("../../ui/FoldCloser.tsx")).toContain("onClose(e.nativeEvent.isTrusted)");
  });

  it("la session a trois étapes (elle-même, la Préparation, le Boxing), chacune rangée avant de défiler", () => {
    const src = code("./DemoPlanTour.tsx");
    const session = src.slice(src.indexOf('id: "session"'), src.indexOf('id: "preparation"'));
    expect(session).toContain('await a.click(dayCardButton("day-session", true));');
    const prep = src.slice(src.indexOf('id: "preparation"'), src.indexOf('id: "boxing"'));
    expect(prep.slice(prep.indexOf("prepare: () => {"), prep.indexOf("onEnter:"))).toContain('sessionTile("boxing")');
    expect(prep.slice(prep.indexOf("onEnter:"))).toContain("await a.click(prep);");
  });

  it("une étape sur les deux façons d'ajuster entoure « Changer » et « Ajuster le plan », chacun à part", () => {
    const src = code("./DemoPlanTour.tsx");
    const adjust = src.slice(src.indexOf('id: "adjust"'), src.indexOf('id: "way1"'));
    expect(adjust).toContain("separate: true,");
    expect(adjust).toContain('mealCopy("meals.dish.replace")');
    expect(adjust).toContain("footerAdjust()");
    for (const pack of [fr, en]) expect(pack["plan.demo.step_adjust_title"]).toMatch(/2/);
    const overlay = code("../../ui/TourOverlay.tsx");
    expect(overlay).toContain("current.separate ? targets.map((el) => unionOf([el])) : [unionOf(targets)]");
  });

  it("3 s de lecture pour les deux premières étapes, 6 s à partir de la troisième", () => {
    const src = code("./DemoPlanTour.tsx");
    expect(src).toContain("const LONG_READ_MS = 6000;");
    const ids = ["groceries", "session", "preparation", "boxing", "menu", "adjust", "way1", "way2", "end"];
    for (const id of ids) expect(src, id).toContain(`id: "${id}",\n      readMs: LONG_READ_MS,`);
    for (const id of ["recap", "rail"]) {
      const at = src.indexOf(`id: "${id}",`);
      expect(src.slice(at, at + 400), id).not.toContain("readMs:");
    }
    const overlay = code("../../ui/TourOverlay.tsx");
    expect(overlay).toContain("const readMs = stepRef.current.readMs ?? READ_MS;");
  });

  it("une jauge sans libellé, en haut à droite de la bulle: lecture + geste, complète quand le geste est fini", () => {
    const overlay = code("../../ui/TourOverlay.tsx");
    expect(overlay).toContain("const totalMs = readMs + (stepRef.current.onEnter ? stepRef.current.playMs ?? 0 : 0);");
    expect(overlay).toContain('className="block h-full rounded-full bg-fig-700"');
    const flow = overlay.slice(overlay.indexOf("const startedAt = performance.now();"));
    expect(flow.indexOf("setGauge({ index, to: 1, ms: 250 });")).toBeGreaterThan(
      flow.indexOf("await stepRef.current.onEnter?.(actor);"),
    );
    // Chaque étape à geste dit combien de temps il dure.
    const src = code("./DemoPlanTour.tsx");
    const gestures = [...src.matchAll(/onEnter: async/g)].length;
    const estimates = [...src.matchAll(/playMs: \d+,/g)].length;
    expect(estimates).toBe(gestures);
  });

  it("⛔ la bulle sans cible (la dernière étape) se pose au centre de l'écran", () => {
    const overlay = code("../../ui/TourOverlay.tsx");
    expect(overlay).toContain("let cardTop = (vh - cardHeight) / 2;");
    expect(overlay).toContain("let cardLeft = (vw - width) / 2;");
  });

  it("⛔ « Adopter ce plan » est grisé dans la démonstration: il n'y a rien à adopter", () => {
    const src = code("./DemoPlanTour.tsx");
    const adopts = [...src.matchAll(/<Button[^>]*>\{t\("plan\.draft\.adopt"\)\}<\/Button>/g)].map((m) => m[0]);
    expect(adopts.length).toBeGreaterThanOrEqual(3);
    for (const button of adopts) expect(button).toContain("disabled");
  });
});
