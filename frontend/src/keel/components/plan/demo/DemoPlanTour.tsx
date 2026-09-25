import React from "react";
import { createPortal } from "react-dom";

import { localDateIn } from "../../../api/dates";
import { dishDayLabel, dishSlotLabel, mealCopy } from "../../../api/mealLabels";
import type { GeneratedDish } from "../../../api/mealGeneration";
import { DRAFT_NOTE_MAX_CHARS, type DraftProgress } from "../../../api/planDraft";
import { t } from "../../../i18n/t";
import { uiLocale } from "../../../i18n/runtime";
import type { DishReplaceControl } from "../../DishCard";
import { Button, buttonClass } from "../../ui/Button";
import { inputClass } from "../../ui/Field";
import Modal from "../../ui/Modal";
import TourOverlay, { type TourStep } from "../../ui/TourOverlay";
import PlanResult from "../PlanResult";
import ReplaceReasonPanel from "../ReplaceReasonPanel";
import SameReasonPanel, { type SameReasonSuggestion } from "../SameReasonPanel";
import { buildDemoPlan } from "./demoPlan";
import { isDemoTourRequested, usePublishDemoOpen, useRealPlanReady } from "./demoGate";

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-25 — LE PLAN DE DÉMONSTRATION ET SA VISITE, PENDANT L'ATTENTE.
// ══════════════════════════════════════════════════════════════════════════
//
// Demandé: pendant les deux à trois minutes où un plan se compose, montrer
// « un vrai plan avec la vraie interface » et une visite qui dit à quoi
// servent le tableau, les jours, la liste de courses, les sessions de cuisine
// et le plan — avec une démonstration de ce qui s'ouvre quand on clique un
// plat, et de « Changer » (« ça cherche si la raison vaut pour d'autres
// plats »). « Il faut que ce soit précisé que c'est un plan de démo. »
//
// ── CE QUI EST VRAI, CE QUI EST FAUX ─────────────────────────────────────
// VRAI: l'interface. `PlanResult`, `DishCard`, `ReplaceReasonPanel`,
// `SameReasonPanel`, `CookingSessions` et `ShoppingListPanel` sont ceux de
// l'aperçu, montés tels quels.
// FAUX: les données (`demoPlan.ts`) et « Changer »: la raison ne part pas au
// serveur, et la recherche « même raison » est une pause suivie des plats de
// la même famille. Rien n'est écrit nulle part.
//
// ── QUAND ELLE S'OUVRE ───────────────────────────────────────────────────
// Montée par l'écran qui attend (`MealBuilder`, `SetupPage`) tant qu'une
// composition est en vol; démontée dès que le vrai plan arrive — la fenêtre
// d'aperçu s'ouvre alors par-dessus, comme avant.
// ⟳ 2026-09-25 — ELLE S'OUVRE SEULE À CHAQUE COMPOSITION, visite comprise
// (demandé: « que la démo s'ouvre toute seule, pas qu'on ait à cliquer »).
// La ligne de l'écran d'attente la rouvre si on l'a fermée.

/** La lecture des étapes, à partir de la troisième. */
const LONG_READ_MS = 6000;

interface Suggest {
  anchor: string;
  reason: string;
  status: "looking" | "ready";
  suggestions: SameReasonSuggestion[];
  checked: Set<string>;
}

/** « Mardi · Déjeuner », pour la liste « même raison ». */
function whereOf(dish: GeneratedDish): string {
  return [dishDayLabel(dish.day), dishSlotLabel(dish.slot)].filter(Boolean).join(" · ");
}

export default function DemoPlanTour(
  // `progress` reste dans le contrat des écrans; la démonstration ne l'affiche
  // plus (le bandeau est parti), l'écran d'attente derrière le montre.
  { householdSize, composing }: {
    progress: DraftProgress | null;
    /**
     * ⟳ 2026-09-25 — UNE COMPOSITION EST-ELLE EN VOL ? La démonstration peut
     * lui survivre (une visite qu'on laisse finir): faux et pas de vrai plan
     * ⇒ la composition s'est arrêtée, et le bandeau le dit.
     */
    composing: boolean;
    /**
     * ⟳ 2026-09-25 — LE NOMBRE DE BOUCHES DU FOYER QUI COMPOSE: 1 ⇒ la
     * démonstration est un plan pour une personne, sinon pour deux (une
     * boîte par personne, les prénoms sur les couvercles et les à-côtés).
     */
    householdSize: number;
  },
) {
  const [startsOn] = React.useState(() =>
    localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone)
  );
  const people: 1 | 2 = householdSize <= 1 ? 1 : 2;
  const demo = React.useMemo(() => buildDemoPlan(startsOn, uiLocale(), people), [startsOn, people]);
  const { plan } = demo;

  // ⟳ 2026-09-25 — D'ABORD UNE INVITATION, PAS LA DÉMONSTRATION D'UN COUP
  // (« elle s'ouvre beaucoup trop vite »): une petite fenêtre qui grandit
  // depuis le bouton qu'on vient de cliquer, « On y va » ou « Passer ».
  // Hors navigateur (rendu statique), rien ne s'ouvre: la ligne seule.
  const [intro, setIntro] = React.useState(() => typeof document !== "undefined" && composing);
  /** Le bouton qui a lancé la composition: l'invitation grandit depuis lui. */
  const [origin] = React.useState<DOMRect | null>(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLButtonElement
      ? document.activeElement.getBoundingClientRect()
      : null
  );
  const [open, setOpen] = React.useState(false);
  const [touring, setTouring] = React.useState(false);
  const [notReal, setNotReal] = React.useState(false);
  const touringRef = React.useRef(touring);
  React.useEffect(() => {
    touringRef.current = touring;
  }, [touring]);
  // ⟳ 2026-09-25 — « AJUSTER LE PLAN » EN QUELQUES MOTS, sans passer par un
  // plat: le champ du pied de l'aperçu, en local.
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const ready = useRealPlanReady();
  // L'écran qui attend retient la fenêtre d'aperçu tant que celle-ci est
  // ouverte (`demoGate`).
  usePublishDemoOpen(open || intro);
  // Le vrai plan arrive avant qu'on ait répondu à l'invitation: on la retire,
  // et c'est lui qui s'ouvre.
  React.useEffect(() => {
    if (ready && intro) setIntro(false);
  }, [ready, intro]);
  const startTour = () => {
    setIntro(false);
    setOpen(true);
    setTouring(true);
  };
  // ⟳ 2026-09-25 — MONTÉE À LA DEMANDE DE L'APERÇU (« Visite guidée »): la
  // visite commence tout de suite, sans invitation.
  React.useEffect(() => {
    if (isDemoTourRequested()) startTour();
  }, []);

  // ── « CHANGER », EN LOCAL ─────────────────────────────────────────────
  const [struck, setStruck] = React.useState<ReadonlyMap<string, string>>(new Map());
  const [reasonFor, setReasonFor] = React.useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = React.useState("");
  const [suggest, setSuggest] = React.useState<Suggest | null>(null);
  const timers = React.useRef<number[]>([]);
  const later = React.useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  const clearTimers = React.useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);
  React.useEffect(() => clearTimers, [clearTimers]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const footerRef = React.useRef<HTMLDivElement | null>(null);

  /** La recherche « même raison »: les autres plats de la même famille. */
  const lookAlike = React.useCallback((title: string, alreadyStruck: ReadonlyMap<string, string>) => {
    const family = demo.families.get(title);
    return plan.dishes
      .filter((d) => d.title !== title && !alreadyStruck.has(d.title) && demo.families.get(d.title) === family)
      .map((d) => ({ key: d.title, title: d.title, where: whereOf(d), fits: true }));
  }, [demo, plan.dishes]);

  // ⚠️ LU PAR DES MINUTERIES: une raison validée par la visite l'est depuis
  // un rendu passé, et l'état qu'elle voit doit être le dernier.
  const struckRef = React.useRef(struck);
  React.useEffect(() => {
    struckRef.current = struck;
  }, [struck]);

  const confirmReason = React.useCallback((title: string, reason: string) => {
    setStruck((prev) => {
      const next = new Map(prev);
      next.set(title, reason);
      struckRef.current = next;
      return next;
    });
    setReasonFor(null);
    setReasonDraft("");
    setSuggest({ anchor: title, reason, status: "looking", suggestions: [], checked: new Set() });
    later(() => {
      const found = lookAlike(title, struckRef.current);
      setSuggest(found.length === 0 ? null : {
        anchor: title,
        reason,
        status: "ready",
        suggestions: found,
        checked: new Set(found.map((s) => s.key)),
      });
    }, 1600);
  }, [later, lookAlike]);

  const dishReplace = (dish: GeneratedDish): DishReplaceControl => {
    const reason = struck.get(dish.title);
    return {
      struck: reason === undefined ? null : { reason },
      canReplace: true,
      onReplace: () => {
        setSuggest(null);
        setReasonDraft("");
        setReasonFor(dish.title);
      },
      onKeep: () => {
        const next = new Map(struck);
        next.delete(dish.title);
        setStruck(next);
      },
      panel: reasonFor === dish.title
        ? (
          <ReplaceReasonPanel
            value={reasonDraft}
            onChange={setReasonDraft}
            // Pendant la visite, un clic ailleurs (le bouton « Suivant ») ne
            // referme rien: c'est la visite qui mène.
            onCancel={() => {
              if (!touringRef.current) setReasonFor(null);
            }}
            onConfirm={() => confirmReason(dish.title, reasonDraft.trim())}
          />
        )
        : suggest !== null && suggest.anchor === dish.title
        ? (
          <SameReasonPanel
            reason={suggest.reason}
            status={suggest.status}
            suggestions={suggest.suggestions}
            checked={suggest.checked}
            capped={false}
            capText=""
            onToggle={(key) => {
              const checked = new Set(suggest.checked);
              if (checked.has(key)) checked.delete(key);
              else checked.add(key);
              setSuggest({ ...suggest, checked });
            }}
            onConfirm={() => {
              const next = new Map(struck);
              for (const key of suggest.checked) next.set(key, suggest.reason);
              setStruck(next);
              setSuggest(null);
            }}
            onSkip={() => {
              if (!touringRef.current) setSuggest(null);
            }}
          />
        )
        : null,
    };
  };

  // ── LES CIBLES DE LA VISITE, cherchées DANS la démonstration seulement ──
  const inRoot = (selector: string): HTMLElement[] => {
    const el = rootRef.current?.querySelector<HTMLElement>(selector);
    return el ? [el] : [];
  };
  const tourCard = (): HTMLElement | null => {
    const toggles = rootRef.current?.querySelectorAll<HTMLElement>("[data-row-toggle]") ?? [];
    for (const toggle of toggles) {
      if (toggle.textContent?.includes(demo.tourDishTitle)) return toggle.closest("section");
    }
    return null;
  };
  /** Le premier jour du rail: c'est lui qui porte la session et le plat de la visite. */
  const showFirstDay = () => {
    rootRef.current?.querySelector<HTMLButtonElement>("[data-tour=day-rail] button")?.click();
  };
  /** Le plat de la visite, remis dans son état de départ. */
  const resetTourDish = () => {
    clearTimers();
    setReasonFor(null);
    setReasonDraft("");
    setSuggest(null);
    setStruck(new Map());
  };
  // ── CE QUE LE CURSEUR VA CLIQUER: les vrais boutons de la démonstration ──
  const railButtons = () =>
    [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-tour=day-rail] button") ?? [])];
  const dayCardButton = (anchor: "day-groceries" | "day-session", wanted: boolean) =>
    rootRef.current?.querySelector<HTMLButtonElement>(
      `[data-tour=${anchor}] ${
        wanted
          ? "button[aria-expanded=false][aria-controls]:not([data-row-toggle])"
          : "button[aria-expanded=true][aria-controls]:not([data-row-toggle])"
      }`,
    ) ?? null;
  /** Une tuile de la session: « Préparation » ou « Boxing » (son bouton). */
  const sessionTile = (which: "preparation" | "boxing") =>
    [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-tour=day-session] [data-row-toggle]") ?? [])]
      .find((b) =>
        b.textContent?.includes(
          which === "preparation" ? mealCopy("meals.sessions.preparation_title") : mealCopy("meals.boxes.title"),
        )
      ) ?? null;
  const buttonIn = (scope: Element | null | undefined, label: string) =>
    [...(scope?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((b) => b.textContent?.trim() === label) ?? null;
  const footerAdjust = () => buttonIn(footerRef.current, t("plan.draft.remix"));
  /** La cible de l'étape « façon 1 »: le plat et sa bulle, puis le pied. */
  const wayOneTargets = (): HTMLElement[] => {
    const card = tourCard();
    const bubble = card?.querySelector<HTMLElement>("[role=dialog]");
    if (bubble) return [card, bubble].filter((e): e is HTMLElement => Boolean(e));
    if (struckRef.current.size > 1 && footerRef.current) return [footerRef.current];
    return card ? [card] : [];
  };

  /** Referme sans curseur ce qu'une étape précédente a ouvert. */
  const tidy = (keep: { groceries?: boolean; session?: boolean } = {}) => {
    showFirstDay();
    if (!keep.groceries) dayCardButton("day-groceries", false)?.click();
    if (!keep.session) dayCardButton("day-session", false)?.click();
  };

  // ⟳ 2026-09-25 — LE TEMPS DE LECTURE: 3 s pour les deux premières étapes
  // (courtes, sans geste long), 6 s à partir de la troisième (demandé tel
  // quel). `playMs`: la durée du geste de chaque étape, pour la jauge —
  // mesurée à 1280 × 800 (défilements compris), calculée pour les deux façons
  // (la frappe lettre à lettre).
  const steps: TourStep[] = [
    {
      id: "recap",
      title: t("plan.demo.step_recap_title"),
      body: t("plan.demo.step_recap_body"),
      targets: () => inRoot("[data-tour=recap]"),
    },
    {
      id: "rail",
      playMs: 3900,
      title: t("plan.demo.step_rail_title"),
      body: t("plan.demo.step_rail_body"),
      targets: () => inRoot("[data-tour=day-rail]"),
      prepare: () => tidy(),
      // LE CURSEUR: le lendemain, puis retour au premier jour.
      onEnter: async (a) => {
        await a.click(railButtons()[1]);
        await a.wait(1400);
        await a.click(railButtons()[0]);
      },
    },
    {
      id: "groceries",
      readMs: LONG_READ_MS,
      playMs: 1300,
      title: t("plan.demo.step_groceries_title"),
      body: t("plan.demo.step_groceries_body"),
      targets: () => inRoot("[data-tour=day-groceries]"),
      prepare: () => tidy(),
      // LE CURSEUR: « Voir la liste ».
      onEnter: async (a) => {
        await a.click(dayCardButton("day-groceries", true));
      },
    },
    // ⟳ 2026-09-25 — LA SESSION EN TROIS ÉTAPES (demandé: « une étape qui
    // arrive sur la session de cuisine et qui déplie, puis une étape pour la
    // Préparation » — le Boxing seul avait la sienne): la session, puis
    // chacune de ses deux tuiles.
    {
      id: "session",
      readMs: LONG_READ_MS,
      playMs: 2300,
      title: t("plan.demo.step_session_title"),
      body: t("plan.demo.step_session_body"),
      targets: () => inRoot("[data-tour=day-session]"),
      // Sans curseur: la liste de courses se referme, et la session aussi
      // (en revenant d'une étape plus loin) — c'est le curseur qui l'ouvre.
      prepare: () => tidy(),
      // LE CURSEUR: « Voir le détail »; la session montre ses deux tuiles.
      onEnter: async (a) => {
        await a.click(dayCardButton("day-session", true));
        await a.wait(400);
        await a.reveal(inRoot("[data-tour=day-session]"));
      },
    },
    {
      id: "preparation",
      readMs: LONG_READ_MS,
      playMs: 2500,
      title: t("plan.demo.step_preparation_title"),
      body: t("plan.demo.step_preparation_body"),
      targets: () => {
        const tile = sessionTile("preparation")?.parentElement?.parentElement;
        return tile ? [tile] : inRoot("[data-tour=day-session]");
      },
      // Sans curseur, avant de défiler: la session ouverte, « Boxing » refermé.
      prepare: () => {
        tidy({ session: true });
        dayCardButton("day-session", true)?.click();
        const boxing = sessionTile("boxing");
        if (boxing?.getAttribute("aria-expanded") === "true") boxing.click();
      },
      // LE CURSEUR: « Préparation » s'ouvre, et la page montre ses recettes.
      onEnter: async (a) => {
        const prep = sessionTile("preparation");
        if (prep?.getAttribute("aria-expanded") !== "true") await a.click(prep);
        await a.wait(500);
        await a.reveal([prep?.parentElement?.parentElement].filter((e): e is HTMLElement => Boolean(e)));
      },
    },
    {
      id: "boxing",
      readMs: LONG_READ_MS,
      playMs: 2400,
      title: t("plan.demo.step_boxing_title"),
      body: t("plan.demo.step_boxing_body"),
      targets: () => {
        const tile = sessionTile("boxing")?.parentElement?.parentElement;
        return tile ? [tile] : inRoot("[data-tour=day-session]");
      },
      // ⟳ 2026-09-25 — LES ALLERS-RETOURS DU BOXING. La page descendait vers
      // le Boxing (sous les recettes ouvertes), puis le curseur REMONTAIT
      // refermer « Préparation ». Refermer « Préparation » sans curseur ne
      // suffisait pas: les recettes repliées, le Boxing se retrouvait AU-DESSUS
      // de l'écran (mesuré: 565 → 386 → 635). « Préparation » reste donc
      // ouverte: le Boxing est juste en dessous, la page ne fait que descendre.
      prepare: () => {
        tidy({ session: true });
        dayCardButton("day-session", true)?.click();
      },
      // LE CURSEUR: « Boxing » s'ouvre, et la page montre ses boîtes.
      onEnter: async (a) => {
        const boxing = sessionTile("boxing");
        if (boxing?.getAttribute("aria-expanded") !== "true") await a.click(boxing);
        await a.wait(500);
        await a.reveal([boxing?.parentElement?.parentElement].filter((e): e is HTMLElement => Boolean(e)));
      },
    },
    {
      id: "menu",
      readMs: LONG_READ_MS,
      playMs: 2300,
      title: t("plan.demo.step_menu_title"),
      body: t("plan.demo.step_menu_body"),
      targets: () => {
        const card = tourCard();
        return card ? [card] : [];
      },
      // ⟳ 2026-09-25 — À PARTIR D'ICI, LA SESSION RESTE OUVERTE: la refermer
      // faisait sauter la page vers le haut d'un coup (mesuré: 1339 → 425). On
      // descend jusqu'au menu, et c'est tout.
      prepare: () => {
        tidy({ session: true });
        resetTourDish();
        setNoteOpen(false);
      },
      // LE CURSEUR: le plat s'ouvre, et la page descend sur ce qu'il montre.
      onEnter: async (a) => {
        const toggle = tourCard()?.querySelector<HTMLButtonElement>("[data-row-toggle]");
        if (toggle?.getAttribute("aria-expanded") !== "true") await a.click(toggle);
        await a.wait(400);
        const card = tourCard();
        if (card) await a.reveal([card]);
      },
    },
    // ⟳ 2026-09-25 — D'ABORD LES DEUX FAÇONS D'UN COUP D'ŒIL (demandé: « une
    // étape sur l'ajustement global, qui dit qu'on peut cliquer sur Changer et
    // Ajuster le plan, en entourant les boutons »), puis une étape par façon.
    {
      id: "adjust",
      readMs: LONG_READ_MS,
      playMs: 2800,
      title: t("plan.demo.step_adjust_title"),
      body: t("plan.demo.step_adjust_body"),
      separate: true,
      targets: () =>
        [
          ...[...(rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-tour=day-menu] button") ?? [])]
            .filter((b) => b.textContent?.trim() === mealCopy("meals.dish.replace")),
          footerAdjust(),
        ].filter((e): e is HTMLButtonElement => e !== null),
      // Le plat reste ouvert: le refermer ferait remonter la page d'un coup.
      prepare: () => {
        tidy({ session: true });
        resetTourDish();
        setNote("");
        setNoteOpen(false);
      },
      // LE CURSEUR: « Changer », puis « Ajuster le plan » — montrés, pas cliqués.
      onEnter: async (a) => {
        await a.point(buttonIn(tourCard(), mealCopy("meals.dish.replace")));
        await a.wait(900);
        await a.point(footerAdjust());
      },
    },
    {
      id: "way1",
      readMs: LONG_READ_MS,
      playMs: 10500,
      title: t("plan.demo.step_way1_title"),
      body: t("plan.demo.step_way1_body"),
      targets: wayOneTargets,
      prepare: () => {
        tidy({ session: true });
        resetTourDish();
        setNoteOpen(false);
      },
      // « CHANGER » D'UN SEUL TENANT: « Changer », la raison tapée,
      // « Valider », la recherche, « Barrer aussi », puis « Ajuster le plan »,
      // en bas à droite.
      onEnter: async (a) => {
        await a.click(buttonIn(tourCard(), mealCopy("meals.dish.replace")));
        await a.wait(300);
        await a.type(setReasonDraft, demo.reason);
        await a.wait(500);
        await a.click(buttonIn(tourCard()?.querySelector("[role=dialog]"), t("plan.draft.replace_confirm")));
        // la recherche « même raison »
        await a.wait(2000);
        const bubble = tourCard()?.querySelector("[role=dialog]");
        const buttons = [...(bubble?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        await a.click(buttons[buttons.length - 1] ?? null);
        await a.wait(600);
        await a.point(footerAdjust());
      },
    },
    {
      id: "way2",
      readMs: LONG_READ_MS,
      playMs: 4800,
      title: t("plan.demo.step_way2_title"),
      body: t("plan.demo.step_way2_body"),
      targets: () => (footerRef.current ? [footerRef.current] : []),
      prepare: () => {
        resetTourDish();
        setNote("");
        setNoteOpen(false);
      },
      // LE CURSEUR: rien de barré, le bouton « Ajuster le plan » de base, en
      // bas, puis quelques mots.
      onEnter: async (a) => {
        await a.click(footerAdjust());
        await a.wait(400);
        await a.type(setNote, t("plan.demo.note_example"));
        await a.wait(400);
        await a.point(footerAdjust());
      },
    },
    {
      id: "end",
      readMs: LONG_READ_MS,
      title: t("plan.demo.step_end_title"),
      body: t(ready ? "plan.demo.step_end_body_ready" : "plan.demo.step_end_body"),
      // ⟳ 2026-09-25 — AUCUNE CIBLE: on ne remonte pas en haut pour dire au
      // revoir. « Terminer », et c'est fini.
      targets: () => [],
    },
  ];

  /** La fenêtre se referme: si le vrai plan est là, c'est lui qui s'ouvre. */
  const closeDemo = () => {
    clearTimers();
    setTouring(false);
    setOpen(false);
    setNotReal(false);
    setNoteOpen(false);
  };
  /**
   * LA VISITE SE TERMINE (ou on la passe): la démonstration se referme avec
   * elle. ⟳ 2026-09-25 — « à la fin, il faut que le plan chargé s'affiche »:
   * s'il est prêt, il s'ouvre aussitôt; sinon l'écran d'attente reprend, et
   * il s'ouvrira de lui-même.
   */
  const closeTour = closeDemo;

  const strikeMode = struck.size > 0;
  // « Ajuster » existe comme dans le vrai aperçu; ici, il dit seulement que
  // ce plan-ci n'est pas le vrai. « Adopter » est grisé.
  const demoOnly = () => setNotReal(true);

  const noteLeft = DRAFT_NOTE_MAX_CHARS - note.length;
  const footer = (
    <div ref={footerRef} data-tour="demo-footer" className="flex flex-col gap-2">
      {notReal && (
        <p role="status" className="text-sm font-medium text-fig-800">{t("plan.demo.not_real")}</p>
      )}
      {strikeMode
        ? (
          <>
            <p className="text-label text-ink-soft">
              {struck.size === 1
                ? t("plan.draft.struck_one")
                : t("plan.draft.struck_many", { count: struck.size })}
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={demoOnly}>{t("plan.draft.remix")}</Button>
            </div>
          </>
        )
        : noteOpen
        ? (
          // LE MÊME PIED QUE L'APERÇU QUAND ON AJUSTE EN QUELQUES MOTS: le champ
          // et son bouton, les deux comptes, l'adoption en dessous.
          <>
            <div className="flex items-end gap-2">
              <textarea
                className={`${inputClass} min-h-16 min-w-0 flex-1`}
                rows={2}
                value={note}
                placeholder={t("plan.draft.note_placeholder")}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button variant="primary" onClick={demoOnly}>{t("plan.draft.remix")}</Button>
            </div>
            <div className="flex flex-wrap items-baseline justify-end gap-2">
              <span className="text-label text-ink-soft">{t("plan.draft.chars_left", { count: noteLeft })}</span>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" disabled>{t("plan.draft.adopt")}</Button>
            </div>
          </>
        )
        : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setNoteOpen(true)}>{t("plan.draft.remix")}</Button>
            <Button variant="primary" disabled>{t("plan.draft.adopt")}</Button>
          </div>
        )}
    </div>
  );

  return (
    <>
      {/* ── DANS L'ÉCRAN D'ATTENTE: UNE LIGNE QUI OUVRE LA DÉMONSTRATION ───
          Pour qui a passé l'invitation, ou refermé la démonstration. */}
      {composing && (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-fiche border border-dashed border-fig-300 bg-fig-50 px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-ink">{t("plan.demo.invite")}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={startTour}
        >
          {t("plan.demo.show")}
        </Button>
      </div>
      )}

      {intro && <DemoIntroPrompt origin={origin} onGo={startTour} onSkip={() => setIntro(false)} />}

      {/* ══════════════════════════════════════════════════════════════════
          LA FENÊTRE DE DÉMONSTRATION — FAITE COMME L'APERÇU (demandé: « dans
          un modal comme la preview du plan, sinon les gens ne vont pas
          comprendre »). Même taille, même fronton, même pied; son titre et
          son bandeau disent que c'est une démonstration.
          ══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={open}
        onClose={closeDemo}
        title={t("plan.demo.banner_title")}
        closeLabel={t("plan.demo.close")}
        closeOnlyByButton
        size="lg"
        headerAction={strikeMode
          ? undefined
          // ⛔ « ADOPTER » NE SE CLIQUE PAS DANS LA DÉMONSTRATION: il n'y a
          // rien à adopter. Il reste montré, à sa place, grisé.
          : <Button variant="primary" size="sm" disabled>{t("plan.draft.adopt")}</Button>}
        footer={footer}
      >
        {/* ⚠️ `overflow-anchor: none`: sans lui, le navigateur recalait la page
            quand un plat s'ouvrait (pour garder le plat du dessous en place) —
            la page bougeait sous le curseur (mesuré: 425 → 731). C'est la
            visite qui fait défiler. */}
        <div ref={rootRef} data-demo-plan className="space-y-6 [overflow-anchor:none]">
          {/* ⛔ 2026-09-25 — PLUS DE BANDEAU EN TÊTE (« vu qu'on a eu la pop-up
              avant, la partie tout en haut ne sert à rien »): l'invitation a
              dit que c'est une démonstration, le titre de la fenêtre le
              redit. L'état du vrai plan (prêt, arrêté) passe dans la bulle de
              la visite. */}
          <PlanResult
            dishes={plan.dishes}
            preparations={plan.preparations}
            cookingSessions={plan.cookingSessions}
            shoppingList={plan.shoppingList}
            portions={plan.memberPortions}
            startsOn={plan.startsOn}
            durationDays={plan.durationDays}
            today={startsOn}
            emptyLabel=""
            dishLayout="compact"
            dishReplace={dishReplace}
            memberDayEnergy={demo.memberDayEnergy}
          />
        </div>
      </Modal>

      {open && touring && (
        <TourOverlay
          steps={steps}
          onClose={closeTour}
          // L'ÉTAT DU VRAI PLAN, en tête de la bulle: prêt, ou arrêté.
          note={ready
            ? t("plan.demo.ready_in_tour")
            : composing
            ? null
            : t("plan.demo.stopped")}
        />
      )}
    </>
  );
}

/**
 * ⟳ 2026-09-25 — L'INVITATION À LA VISITE, QUI GRANDIT DEPUIS LE BOUTON.
 *
 * Demandé: « une petite animation qui part du bouton pour faire apparaître un
 * petit modal: en attendant que le plan charge, une petite visite guidée de
 * l'aperçu, avec "On y va" et "Passer" ». La fenêtre part du rectangle du
 * bouton cliqué (réduite, transparente) et vient se poser au centre; sans
 * bouton connu, elle monte du bas de l'écran.
 */
function DemoIntroPrompt(
  { origin, onGo, onSkip }: { origin: DOMRect | null; onGo: () => void; onSkip: () => void },
) {
  const [shown, setShown] = React.useState(false);
  const goRef = React.useRef<HTMLButtonElement | null>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    const id = window.setTimeout(() => setShown(true), 30);
    return () => window.clearTimeout(id);
  }, []);
  React.useEffect(() => {
    if (shown) goRef.current?.focus({ preventScroll: true });
  }, [shown]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSkip]);
  if (typeof document === "undefined") return null;
  const dx = origin ? origin.left + origin.width / 2 - window.innerWidth / 2 : 0;
  const dy = origin ? origin.top + origin.height / 2 - window.innerHeight / 2 : window.innerHeight / 3;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/40 transition-opacity duration-500 motion-reduce:transition-none"
        style={{ opacity: shown ? 1 : 0 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute left-1/2 top-1/2 w-[min(24rem,calc(100vw-2rem))] rounded-fiche border border-line-strong bg-paper p-5 shadow-xl transition-[transform,opacity] duration-500 ease-out motion-reduce:transition-none"
        style={{
          transform: shown
            ? "translate(-50%, -50%) scale(1)"
            : `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2)`,
          opacity: shown ? 1 : 0,
        }}
      >
        <span className="rounded-full bg-fig-700 px-2 py-0.5 text-label font-semibold uppercase tracking-wide text-paper">
          {t("plan.demo.badge")}
        </span>
        <p id={titleId} className="mt-3 text-base font-semibold text-ink">{t("plan.demo.intro_title")}</p>
        <p className="mt-1 text-sm leading-6 text-ink-soft">{t("plan.demo.intro_body")}</p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onSkip}>{t("plan.demo.intro_skip")}</Button>
          <button ref={goRef} type="button" className={buttonClass("primary")} onClick={onGo}>
            {t("plan.demo.intro_go")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
