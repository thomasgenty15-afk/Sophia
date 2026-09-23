import React from "react";

import { t, type MessageKey } from "../../i18n/t";
import type { ReachFrame, ReachScene } from "./reachScene";

/**
 * LES MESSAGES QUE SOPHIA ENVOIE D'ELLE-MÊME — refonte du 2026-09-18.
 *
 * ── CE QUI A CHANGÉ, ET POURQUOI ──────────────────────────────────────────
 * Le bloc montrait une question POSÉE à Sophia et sa réponse. La section vend
 * maintenant l'inverse: elle écrit la première. Une boîte de dialogue où c'est
 * l'utilisateur qui parle d'abord dit exactement le contraire du titre.
 *
 * ⚠️ LES TROIS BULLES SONT LES TROIS CANAUX QUI PARTENT VRAIMENT — `thaw_reminder`,
 * `weigh_in` et `slot_meal` dans `keel-proactive-v1`. Une quatrième bulle
 * inventée serait une promesse sans expéditeur, et c'est le genre de copie que
 * le modèle KEEL interdit (aucune attente promise, aucun message qui n'existe pas).
 *
 * ⚠️ AUCUN CONTRÔLE ICI: pas de bouton, pas de champ. C'est une illustration
 * annoncée « Exemple fictif », et `homeUnplannedDemo.int.test.ts` le garde.
 *
 * ⟳ LA LÉGENDE NE DIT PLUS QUE « EXEMPLE FICTIF » (2026-09-18, deux retraits).
 * Elle a porté la phrase sur la désactivation des messages — une porte de sortie
 * sous une carte qui vient d'expliquer pourquoi ils servent — puis celle du repas
 * hors plan, partie dans SA PROPRE SECTION (`home.life.*`, `#imprevu`), avec la
 * mesure qui va avec. Ce qui reste est ce que la carte doit dire d'elle-même:
 * qu'elle est inventée.
 *
 * ⟳ 2026-09-23 — UN TÉLÉPHONE EN 3D À CÔTÉ DES BULLES (`reachScene.ts`). Il
 * vibre, une notification descend sur son écran, et la bulle s'en échappe
 * jusqu'à sa place. ⚠️ LES BULLES RESTENT DU HTML RENDU D'EMBLÉE: la scène ne
 * fait que les déplacer, et elles ne sont masquées qu'une fois la scène prête à
 * jouer. Sans WebGL, la carte est exactement celle d'avant.
 */
const MESSAGES: ReadonlyArray<{ when: MessageKey; text: MessageKey }> = [
  { when: "home.reach.thaw.title", text: "home.reach.bubble.thaw" },
  { when: "home.reach.weigh.title", text: "home.reach.bubble.weigh" },
  { when: "home.reach.slot.title", text: "home.reach.bubble.slot" },
];

type Status = "loading" | "ready" | "failed";

export default function ConversationExample() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLLIElement | null>>([]);
  const sceneRef = React.useRef<ReachScene | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");

  React.useEffect(() => {
    let cancelled = false;
    let settled = false;
    // Le dernier décalage appliqué à chaque bulle: le retirer de sa position
    // mesurée rend sa place naturelle dans la liste.
    const applied = MESSAGES.map(() => ({ x: 0, y: 0 }));
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const onFrame = ({ origins, arrivals }: ReachFrame) => {
      const canvas = canvasRef.current;
      if (!canvas || settled) return;
      const box = canvas.getBoundingClientRect();
      arrivals.forEach((arrival, i) => {
        const item = itemRefs.current[i];
        if (!item) return;
        if (arrival >= 1) {
          item.style.transform = "";
          item.style.opacity = "";
          applied[i] = { x: 0, y: 0 };
          return;
        }
        // L'écart entre la notification (sur l'écran du téléphone) et la place
        // de la bulle dans la liste.
        const rect = item.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 - applied[i].x - box.left;
        const cy = rect.top + rect.height / 2 - applied[i].y - box.top;
        const e = 1 - (1 - arrival) ** 3;
        const dx = (origins[i].x - cx) * (1 - e);
        const dy = (origins[i].y - cy) * (1 - e);
        applied[i] = { x: dx, y: dy };
        // Elle part penchée, comme soufflée hors de l'écran, et se redresse en
        // se posant.
        item.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${(-6 * (1 - e)).toFixed(2)}deg) scale(${(0.35 + 0.65 * e).toFixed(3)})`;
        item.style.opacity = arrival <= 0 ? "0" : Math.min(1, arrival * 2.2).toFixed(3);
      });
      if (arrivals.every((a) => a >= 1)) settled = true;
    };
    import("./reachScene")
      .then(({ createReachScene }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        sceneRef.current = createReachScene({
          canvas,
          reducedMotion,
          onFrame,
          onReady: () => { if (!cancelled) setStatus("ready"); },
        });
      })
      .catch(() => { if (!cancelled) setStatus("failed"); });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const withPhone = status !== "failed";

  return <figure className="rounded-fiche border border-line bg-paper-2 p-5 sm:p-6">
    <div className={withPhone ? "grid items-center gap-4 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] sm:gap-6" : ""}>
      {withPhone && <div aria-hidden="true" className="relative mx-auto aspect-[5/3] w-full max-w-[320px] sm:aspect-[3/4]">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 size-full transition-opacity duration-700 ease-out motion-reduce:transition-none ${status === "ready" ? "opacity-100" : "opacity-0"}`}
        />
      </div>}
      <ul className="space-y-4">
        {MESSAGES.map(({ when, text }, i) => <li key={when} ref={(el) => { itemRefs.current[i] = el; }} className="origin-center">
          <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">{t(when)}</p>
          <div className="mt-1 flex items-start gap-3">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fig-700 text-sm font-semibold text-paper">S</span>
            <p className="rounded-card border border-line bg-paper px-4 py-3 text-sm leading-6 text-ink">{t(text)}</p>
          </div>
        </li>)}
      </ul>
    </div>
    <figcaption className="mt-4 border-t border-line pt-3 text-xs leading-5 text-ink-soft">
      {t("home.reach.example_note")}
    </figcaption>
  </figure>;
}
