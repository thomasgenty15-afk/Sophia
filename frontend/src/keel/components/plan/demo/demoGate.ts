import React from "react";

// ⟳ 2026-09-25 — CE QUE LA DÉMONSTRATION ET L'ÉCRAN QUI ATTEND SE DISENT.
//
// Demandé: « si le user débute le tour et n'a pas fini quand le plan est prêt,
// il faut le laisser aller jusqu'au bout — le plan ne change pas d'un coup ».
// Deux faits, deux sens:
//   · la démonstration dit si sa fenêtre est OUVERTE (`DemoPlanTour`) — l'écran
//     garde alors la démonstration montée et l'aperçu se cache;
//   · l'écran dit si le VRAI plan est prêt (`SetupPage`, `StudentWeekPlanPage`)
//     — la démonstration l'annonce, et se referme à la fin de la visite.
//
// Un magasin de module et pas une prop: la démonstration vit dans `MealBuilder`,
// la fenêtre d'aperçu dans la page qui le monte, et aucun des deux ne tient
// l'état de l'autre.

// ⟳ 2026-09-25 — LA VISITE SE ROUVRE DEPUIS L'APERÇU DU VRAI PLAN (« Visite
// guidée », à côté du titre). L'aperçu DEMANDE la visite (`requestDemoTour`);
// l'écran monte alors une démonstration, qui PREND la demande à son montage
// (`isDemoTourRequested`) et s'ouvre directement sur la visite.
//
// ⚠️ OUVERTE = AU MOINS UNE DÉMONSTRATION OUVERTE, OU UNE DEMANDE EN ATTENTE.
// Un seul booléen partagé ne tenait pas: deux démonstrations montées (celle de
// `MealBuilder` et une autre), et la fermée écrivait « fermé » par-dessus
// l'ouverte. Chacune publie donc SON état, sous sa propre clé.

const openDemos = new Set<symbol>();
let tourRequested = false;
let realPlanReady = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isDemoOpen(): boolean {
  return openDemos.size > 0 || tourRequested;
}

/**
 * Pour une démonstration: publie si SA fenêtre (ou son invitation) est
 * ouverte. Une fenêtre qui s'ouvre éteint la demande de visite, dans le même
 * geste: « ouverte » ne passe jamais par faux entre les deux.
 */
export function usePublishDemoOpen(open: boolean): void {
  const key = React.useRef(Symbol("demo"));
  React.useEffect(() => {
    const was = isDemoOpen();
    if (open) {
      openDemos.add(key.current);
      tourRequested = false;
    } else openDemos.delete(key.current);
    if (was !== isDemoOpen()) emit();
  }, [open]);
  React.useEffect(() => () => {
    if (openDemos.delete(key.current) && !isDemoOpen()) emit();
  }, []);
}

/** Depuis l'aperçu du vrai plan: « montre-moi la visite ». */
export function requestDemoTour(): void {
  if (tourRequested) return;
  tourRequested = true;
  emit();
}

/**
 * Une visite est-elle demandée ? Lu par la démonstration à son montage; la
 * demande tombe quand sa fenêtre s'ouvre (`usePublishDemoOpen`), pas avant —
 * sinon l'aperçu réapparaîtrait entre les deux (et deux fois de suite sous le
 * `StrictMode` du développement, qui monte les effets deux fois).
 */
export function isDemoTourRequested(): boolean {
  return tourRequested;
}

export function setRealPlanReady(ready: boolean): void {
  if (realPlanReady === ready) return;
  realPlanReady = ready;
  emit();
}

/** Une fenêtre de démonstration est-elle ouverte (ou demandée) ? */
export function useDemoOpen(): boolean {
  return React.useSyncExternalStore(subscribe, isDemoOpen, () => false);
}

/** Le vrai plan est-il arrivé ? */
export function useRealPlanReady(): boolean {
  return React.useSyncExternalStore(subscribe, () => realPlanReady, () => false);
}

/**
 * Pour l'écran qui attend: publie « le vrai plan est là » tant qu'il l'est, et
 * l'efface en partant.
 */
export function usePublishRealPlanReady(ready: boolean): void {
  React.useEffect(() => {
    setRealPlanReady(ready);
  }, [ready]);
  React.useEffect(() => () => setRealPlanReady(false), []);
}
