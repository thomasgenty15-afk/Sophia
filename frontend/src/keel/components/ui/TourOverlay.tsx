import React from "react";
import { createPortal } from "react-dom";

import { t } from "../../i18n/t";

// ⟳ 2026-09-25 — UNE VISITE GUIDÉE: UN PROJECTEUR SUR UNE ZONE, UNE BULLE
// QUI L'EXPLIQUE, UN CURSEUR QUI FAIT LES GESTES.
//
// Écrite pour le plan de démonstration (`plan/demo/DemoPlanTour`), sans rien
// qui lui soit propre: une étape nomme ses cibles par une fonction, dit son
// titre et son texte, et peut jouer un script de démonstration (`onEnter`)
// avec un acteur — un curseur qui va cliquer les vrais boutons de l'écran.
//
// ── L'ENCHAÎNEMENT D'UNE ÉTAPE À L'AUTRE (retours du propriétaire: « c'est
// vraiment rapide; sortir du mode highlight, scroller lentement, avec un
// curseur »; puis « le curseur démarre à la fin de la lecture: minimum 6
// secondes entre le texte et le curseur »; ⟳ 2026-09-25, ramené à 3 s) ──
//   1. le texte de l'étape s'affiche AUSSITÔT; le projecteur s'éteint;
//   2. l'étape prépare l'écran SANS curseur (`prepare`: refermer ce qui
//      encombre) — faite avant de défiler, pour que la page ne fasse pas
//      d'allers-retours sous les yeux (mesuré sur le Boxing);
//   3. la page défile LENTEMENT jusqu'à la cible (animation maison: le
//      `behavior: "smooth"` du navigateur n'est pas garanti dans ce dépôt),
//      puis le projecteur s'allume;
//   4. le curseur ne part qu'une fois le texte lu: `READ_MS` (ou le
//      `readMs` de l'étape) après son apparition, défilement compris.
//
// ── LA JAUGE (⟳ 2026-09-25, demandé: « une jauge qui charge en haut à droite
// de chaque pop-up, pour que les gens ne se demandent pas quand ça commence
// et quand ça finit, en prenant en compte le temps d'attente ») ──
// Elle se remplit sur la lecture PLUS le geste du curseur (`playMs`, une
// estimation), s'arrête juste avant la fin si le geste dure plus, et se
// complète quand il est fini. Sans libellé: elle se comprend à l'œil.
//
// ── CE QUI EST BLOQUÉ PENDANT LA VISITE ──────────────────────────────────
// Le défilement à la main (molette, doigt, touches) et les clics sur l'écran:
// c'est la visite qui bouge et qui clique. Seule sa bulle répond.

export interface TourActor {
  /** Amène le curseur sur l'élément (en faisant défiler s'il le faut). */
  point: (el: HTMLElement | null | undefined) => Promise<void>;
  /** Amène le curseur, montre le clic, et clique VRAIMENT l'élément. */
  click: (el: HTMLElement | null | undefined) => Promise<void>;
  /** Tape un texte lettre à lettre dans un champ contrôlé, par son setter. */
  type: (setValue: (value: string) => void, text: string) => Promise<void>;
  /** Fait défiler lentement jusqu'à ces éléments. */
  reveal: (elements: HTMLElement[]) => Promise<void>;
  wait: (ms: number) => Promise<void>;
}

/** Le temps de lecture d'une étape avant que le curseur ne bouge, par défaut (⟳ 2026-09-25: 6 s → 3 s). */
export const READ_MS = 3000;

/** La jauge s'arrête là tant que le geste du curseur n'est pas fini. */
const GAUGE_HOLD = 0.96;

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Les éléments à éclairer. `[]` = aucune cible: la bulle se pose au centre, rien ne défile. */
  targets: () => HTMLElement[];
  /**
   * ⟳ 2026-09-25 — CHAQUE CIBLE ENTOURÉE À PART, au lieu d'un seul rectangle
   * qui les englobe: des boutons éloignés (« Changer » sur les plats,
   * « Ajuster le plan » dans le pied de la fenêtre).
   */
  separate?: boolean;
  /** Ce qu'on range SANS curseur avant de défiler (refermer ce qui encombre). */
  prepare?: () => void;
  /** Le script de démonstration, joué une fois l'étape éclairée. */
  onEnter?: (actor: TourActor) => Promise<void> | void;
  /** Le temps de lecture de CETTE étape avant le curseur; `READ_MS` sinon. */
  readMs?: number;
  /** La durée estimée du script (`onEnter`), pour que la jauge avance au bon pas. */
  playMs?: number;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Edges {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

const PAD = 8;

/** Rejeté quand l'étape change: le script s'arrête là où il en est. */
const CANCELLED = Symbol("tour-step-cancelled");

/**
 * LA PART VISIBLE D'UN ÉLÉMENT: son rectangle, coupé par chaque ancêtre qui
 * rogne ce qui dépasse (une fenêtre qui défile) et par l'écran. Sans elle, une
 * cible plus haute que la fenêtre éclairait aussi son pied, et au-delà.
 */
function visibleEdges(el: HTMLElement): Edges | null {
  const r = el.getBoundingClientRect();
  let edges: Edges = { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const c = node.getBoundingClientRect();
    edges = {
      top: Math.max(edges.top, c.top),
      left: Math.max(edges.left, c.left),
      bottom: Math.min(edges.bottom, c.bottom),
      right: Math.min(edges.right, c.right),
    };
  }
  edges = {
    top: Math.max(edges.top, 0),
    left: Math.max(edges.left, 0),
    bottom: Math.min(edges.bottom, window.innerHeight),
    right: Math.min(edges.right, window.innerWidth),
  };
  return edges.bottom - edges.top > 0 && edges.right - edges.left > 0 ? edges : null;
}

function unionOf(elements: HTMLElement[]): Box | null {
  const rects = elements.map(visibleEdges).filter((r): r is Edges => r !== null);
  if (rects.length === 0) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const right = Math.max(...rects.map((r) => r.right));
  return { top: top - PAD, left: left - PAD, width: right - left + 2 * PAD, height: bottom - top + 2 * PAD };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

/** Le conteneur qui fait défiler cet élément: une fenêtre, sinon la page. */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

export default function TourOverlay(
  { steps, onClose, note = null }: {
    steps: readonly TourStep[];
    onClose: () => void;
    /** Une ligne en tête de la bulle, à toutes les étapes (« ton plan est prêt… »). */
    note?: string | null;
  },
) {
  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<"moving" | "shown">("moving");
  const [boxes, setBoxes] = React.useState<Box[]>([]);
  const [cardHeight, setCardHeight] = React.useState(0);
  const [cursor, setCursor] = React.useState<
    { x: number; y: number; ms: number; visible: boolean; pressing: boolean }
  >({ x: 0, y: 0, ms: 0, visible: false, pressing: false });
  /** La jauge: jusqu'où elle va, et en combien de temps. */
  // Rangée avec son numéro d'étape: une étape qui s'ouvre part de zéro, sans
  // montrer une image de la jauge d'avant.
  const [gauge, setGauge] = React.useState<{ index: number; to: number; ms: number }>(
    { index: 0, to: 0, ms: 0 },
  );
  const cursorRef = React.useRef(cursor);
  React.useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const nextRef = React.useRef<HTMLButtonElement | null>(null);
  const titleId = React.useId();
  // `useId` rend « :r1: », que `url(#…)` ne lit pas.
  const maskId = `tour-mask-${React.useId().replace(/:/g, "")}`;
  const step = steps[index];
  const last = index === steps.length - 1;
  // ⚠️ L'APPELANT RECRÉE SES ÉTAPES À CHAQUE RENDU (elles lisent son état):
  // les effets suivent le NUMÉRO d'étape et lisent la dernière version ici.
  // Suivre l'objet relancerait le script de démonstration à chaque rendu.
  // ⚠️ DÉCLARÉ AVANT les effets qui le lisent: un rendu écrit la dernière
  // étape ici, puis l'enchaînement la lit (les effets tournent dans l'ordre).
  const stepRef = React.useRef(step);
  React.useEffect(() => {
    stepRef.current = step;
  });

  // ── L'ENCHAÎNEMENT D'UNE ÉTAPE: s'effacer, défiler, s'allumer, jouer ────
  React.useEffect(() => {
    const token = { cancelled: false };
    const guard = () => {
      if (token.cancelled) throw CANCELLED;
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        window.setTimeout(() => (token.cancelled ? reject(CANCELLED) : resolve()), ms);
      });

    /**
     * Défile lentement le conteneur de la première cible pour la montrer.
     * `ifHidden`: seulement si elle n'est pas déjà entière à l'écran — le
     * curseur qui va vers un bouton visible ne recentre pas la page (mesuré:
     * la session descendait vers « Voir le détail », puis remontait).
     */
    const reveal = async (elements: HTMLElement[], ifHidden = false) => {
      guard();
      const [first] = elements;
      if (!first) return;
      const container = scrollParentOf(first);
      // Une cible hors du conteneur (le pied de la fenêtre) ne se fait pas
      // défiler: elle est déjà à l'écran.
      const rects = elements
        .filter((el) => !container || container.contains(el))
        .map((el) => el.getBoundingClientRect());
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const view = container
        ? container.getBoundingClientRect()
        : { top: 0, height: window.innerHeight };
      if (ifHidden && top >= view.top && bottom <= view.top + view.height) return;
      const margin = 24;
      const height = bottom - top;
      const wanted = height <= view.height - 2 * margin
        ? (top + height / 2) - (view.top + view.height / 2)
        : top - view.top - margin;
      const scroller = container ?? document.scrollingElement ?? document.documentElement;
      const from = scroller.scrollTop;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const to = Math.max(0, Math.min(max, from + wanted));
      const delta = to - from;
      if (Math.abs(delta) < 12) return;
      // Un onglet caché ne dessine pas d'images: on y saute directement.
      if (document.hidden) {
        scroller.scrollTop = to;
        return;
      }
      const ms = Math.min(1400, Math.max(600, Math.abs(delta) * 1.1));
      const start = performance.now();
      await new Promise<void>((resolve, reject) => {
        const frame = (now: number) => {
          if (token.cancelled) return reject(CANCELLED);
          const p = Math.min(1, (now - start) / ms);
          scroller.scrollTop = from + delta * easeInOut(p);
          if (p < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
    };

    const pointAt = async (el: HTMLElement | null | undefined) => {
      guard();
      if (!el) return;
      await reveal([el], true);
      const r = el.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 40);
      const y = r.top + r.height / 2;
      const prev = cursorRef.current;
      // Le curseur apparaît au bord de la bulle la première fois.
      let origin = { x: prev.x, y: prev.y };
      if (!prev.visible) {
        const card = cardRef.current?.getBoundingClientRect();
        origin = { x: card ? card.left + card.width / 2 : x, y: card ? card.top : y };
        setCursor({ x: origin.x, y: origin.y, ms: 0, visible: true, pressing: false });
        await wait(60);
      }
      const dist = Math.hypot(x - origin.x, y - origin.y);
      const ms = Math.min(1100, Math.max(450, dist * 1.2));
      setCursor({ x, y, ms, visible: true, pressing: false });
      await wait(ms + 80);
    };

    const actor: TourActor = {
      wait,
      reveal: (elements) => reveal(elements),
      point: pointAt,
      click: async (el) => {
        await pointAt(el);
        if (!el) return;
        setCursor((c) => ({ ...c, pressing: true }));
        await wait(220);
        el.click();
        setCursor((c) => ({ ...c, pressing: false }));
        await wait(450);
      },
      type: async (setValue, text) => {
        for (let i = 1; i <= text.length; i++) {
          guard();
          setValue(text.slice(0, i));
          await wait(55);
        }
      },
    };

    setPhase("moving");
    const startedAt = performance.now();
    const readMs = stepRef.current.readMs ?? READ_MS;
    const totalMs = readMs + (stepRef.current.onEnter ? stepRef.current.playMs ?? 0 : 0);
    // La jauge repart de zéro, puis avance d'un pas régulier jusqu'à la fin prévue.
    setGauge({ index, to: 0, ms: 0 });
    const kick = window.setTimeout(() => setGauge({ index, to: GAUGE_HOLD, ms: totalMs * GAUGE_HOLD }), 30);
    // Une étape sans geste (la dernière) ne garde pas le curseur de la précédente.
    if (!stepRef.current.onEnter) setCursor((c) => ({ ...c, visible: false }));
    nextRef.current?.focus({ preventScroll: true });
    (async () => {
      // 1-2. le texte est là; l'écran se range sans curseur
      stepRef.current.prepare?.();
      await wait(index > 0 ? 450 : 150);
      // 3. défiler lentement jusqu'à la cible — seulement si elle n'est pas
      //    déjà entière à l'écran —, puis l'éclairer
      await reveal(stepRef.current.targets(), true);
      setPhase("shown");
      // 4. le curseur attend la fin de la lecture
      await wait(Math.max(0, readMs - (performance.now() - startedAt)));
      await stepRef.current.onEnter?.(actor);
      guard();
      setGauge({ index, to: 1, ms: 250 });
    })().catch((e) => {
      if (e !== CANCELLED) throw e;
    });
    return () => {
      token.cancelled = true;
      window.clearTimeout(kick);
      setCursor((c) => ({ ...c, pressing: false }));
    };
  }, [index]);

  // LE PROJECTEUR SUIT SA CIBLE, image par image — et à chaque défilement ou
  // redimensionnement, qu'un onglet en arrière-plan ralentit moins que les
  // images.
  React.useEffect(() => {
    let frame = 0;
    const measure = () => {
      const current = stepRef.current;
      const targets = current.targets();
      const next = (current.separate ? targets.map((el) => unionOf([el])) : [unionOf(targets)])
        .filter((b): b is Box => b !== null);
      setBoxes((prev) =>
        prev.length === next.length && prev.every((b, i) => sameBox(b, next[i])) ? prev : next
      );
      const h = cardRef.current?.offsetHeight ?? 0;
      setCardHeight((prev) => (prev === h ? prev : h));
    };
    const tick = () => {
      measure();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [index]);

  // LE DÉFILEMENT À LA MAIN EST BLOQUÉ; celui de la visite (`reveal`) ne
  // passe pas par ces événements et reste libre.
  React.useEffect(() => {
    const scrollKeys = new Set([" ", "PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End"]);
    const blockPointer = (e: Event) => e.preventDefault();
    const blockKeys = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      // Un champ garde ses flèches, un bouton garde sa barre d'espace.
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (el?.tagName === "BUTTON" && e.key === " ") return;
      if (scrollKeys.has(e.key)) e.preventDefault();
    };
    window.addEventListener("wheel", blockPointer, { passive: false, capture: true });
    window.addEventListener("touchmove", blockPointer, { passive: false, capture: true });
    window.addEventListener("keydown", blockKeys, true);
    return () => {
      window.removeEventListener("wheel", blockPointer, { capture: true });
      window.removeEventListener("touchmove", blockPointer, { capture: true });
      window.removeEventListener("keydown", blockKeys, true);
    };
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && !last) setIndex((i) => i + 1);
      if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, last, onClose]);

  // Hors navigateur (rendu statique des tests), pas de `document` où poser
  // le portail: la visite ne se rend pas.
  if (typeof document === "undefined") return null;

  // LA BULLE: sous une cible si elle y tient sans en couvrir une autre, sinon
  // au-dessus, sinon en bas de l'écran (une cible plus haute que l'écran).
  // Centrée sur la cible, jamais hors de l'écran. ⟳ 2026-09-25 — SANS CIBLE
  // (la dernière étape), AU CENTRE DE L'ÉCRAN (demandé: « cette pop-up de fin
  // il faut qu'elle soit centrée »).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(360, vw - 24);
  const gap = 12;
  const clampLeft = (left: number) => Math.min(Math.max(12, left), vw - width - 12);
  let cardTop = (vh - cardHeight) / 2;
  let cardLeft = (vw - width) / 2;
  if (boxes.length > 0) {
    const covers = (top: number, left: number) =>
      boxes.some((b) =>
        top < b.top + b.height && top + cardHeight > b.top && left < b.left + b.width && left + width > b.left
      );
    cardTop = vh - cardHeight - 16;
    cardLeft = clampLeft(boxes[0].left + boxes[0].width / 2 - width / 2);
    placing: for (const b of boxes) {
      const left = clampLeft(b.left + b.width / 2 - width / 2);
      for (const top of [b.top + b.height + gap, b.top - gap - cardHeight]) {
        if (top >= 8 && top + cardHeight <= vh - 8 && !covers(top, left)) {
          cardTop = top;
          cardLeft = left;
          break placing;
        }
      }
    }
  }
  const shown = phase === "shown";
  const box = boxes.length === 1 ? boxes[0] : null;

  return createPortal(
    <>
      {/* LES CLICS SUR L'ÉCRAN SONT BLOQUÉS: c'est la visite qui clique. */}
      <div aria-hidden="true" className="fixed inset-0 z-[69]" />
      {boxes.length > 1
        ? (
          // PLUSIEURS CIBLES À PART: un voile percé d'un trou par cible, et un
          // anneau autour de chacune.
          <>
            <svg
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 z-[70] h-full w-full transition-opacity duration-300 motion-reduce:transition-none"
              style={{ opacity: shown ? 1 : 0 }}
            >
              <defs>
                <mask id={maskId}>
                  <rect x="0" y="0" width={vw} height={vh} fill="white" />
                  {boxes.map((b, i) => (
                    <rect key={i} x={b.left} y={b.top} width={b.width} height={b.height} rx="12" fill="black" />
                  ))}
                </mask>
              </defs>
              <rect x="0" y="0" width={vw} height={vh} fill="rgba(35, 25, 31, 0.45)" mask={`url(#${maskId})`} />
            </svg>
            {boxes.map((b, i) => (
              <div
                key={i}
                aria-hidden="true"
                className="pointer-events-none fixed z-[70] rounded-card outline outline-2 outline-fig-600 transition-opacity duration-300 motion-reduce:transition-none"
                style={{ top: b.top, left: b.left, width: b.width, height: b.height, opacity: shown ? 1 : 0 }}
              />
            ))}
          </>
        )
        : box
        ? (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-[70] rounded-card outline outline-2 outline-fig-600 transition-all duration-300 ease-out motion-reduce:transition-none"
            style={{
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              opacity: shown ? 1 : 0,
              boxShadow: "0 0 0 9999px rgba(35, 25, 31, 0.45)",
            }}
          />
        )
        : (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[70] bg-ink/45 transition-opacity duration-300"
            style={{ opacity: shown ? 1 : 0 }}
          />
        )}
      <div
        ref={cardRef}
        role="dialog"
        aria-labelledby={titleId}
        aria-live="polite"
        className="fixed z-[71] rounded-card border border-line-strong bg-paper p-4 shadow-xl transition-[top,left] duration-300 ease-out motion-reduce:transition-none"
        style={{ top: cardTop, left: cardLeft, width }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-label font-semibold uppercase tracking-wide text-fig-700 tabular-nums">
            {t("plan.demo.tour_counter", { n: index + 1, total: steps.length })}
          </p>
          {/* LA JAUGE DE L'ÉTAPE, en haut à droite: lecture + geste. */}
          <span
            key={index}
            aria-hidden="true"
            data-tour-gauge
            className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-fig-100"
          >
            <span
              className="block h-full rounded-full bg-fig-700"
              style={gauge.index === index
                ? { width: `${gauge.to * 100}%`, transition: `width ${gauge.ms}ms linear` }
                : { width: 0 }}
            />
          </span>
        </div>
        {note && (
          <p role="status" className="mt-2 rounded-part bg-fig-100 px-2 py-1 text-xs font-semibold text-fig-800">
            {note}
          </p>
        )}
        <p id={titleId} className="mt-1 text-base font-semibold text-ink">{step.title}</p>
        <p className="mt-1 break-words text-sm leading-6 text-ink-soft">{step.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!last && (
            <button
              type="button"
              onClick={onClose}
              className="mr-auto min-h-6 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
            >
              {t("plan.demo.tour_skip")}
            </button>
          )}
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className={`min-h-8 rounded-full border border-line-strong px-3 text-sm font-medium text-ink hover:bg-fig-50 ${
                last ? "mr-auto" : ""
              }`}
            >
              {t("plan.demo.tour_prev")}
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? onClose() : setIndex((i) => i + 1))}
            className="min-h-8 rounded-full bg-fig-700 px-4 text-sm font-medium text-paper hover:bg-fig-800"
          >
            {t(last ? "plan.demo.tour_done" : "plan.demo.tour_next")}
          </button>
        </div>
      </div>
      {/* ── LE CURSEUR QUI FAIT LES GESTES ────────────────────────────────
          Une flèche qui glisse d'un bouton à l'autre, et un anneau au clic. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[72] motion-reduce:transition-none"
        style={{
          transform: `translate(${cursor.x}px, ${cursor.y}px)`,
          transition: `transform ${cursor.ms}ms cubic-bezier(0.45, 0, 0.2, 1), opacity 200ms`,
          opacity: cursor.visible && shown ? 1 : 0,
        }}
      >
        <span
          className={`absolute -left-3 -top-3 h-6 w-6 rounded-full border-2 border-fig-600 transition-all duration-200 ${
            cursor.pressing ? "scale-100 opacity-100" : "scale-50 opacity-0"
          }`}
        />
        <svg viewBox="0 0 24 24" className="h-6 w-6 drop-shadow" aria-hidden="true">
          <path
            d="M4 2.5 19 13.2l-6.6 1.1 3.8 7.2-2.9 1.5-3.8-7.3L4.8 20Z"
            fill="#23191F"
            stroke="#FBF8FA"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>,
    document.body,
  );
}
