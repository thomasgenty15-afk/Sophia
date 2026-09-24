// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// Le cadre nommé de la fiche. Son pavé d'explication (①②③) était écrit
// au-dessus de `MemberAccess`; il suit ici le cadre qu'il explique.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import React from "react";
import { t } from "../../i18n/t";
import { SectionLabel } from "../../components/ui/Card";

/**
 * UN CADRE NOMMÉ DE LA FICHE — A5 (D5.1), 2026-09-03.
 *
 * ── ⛔ CE N'EST PAS UNE PRIMITIVE `Accordion`, ET C'EST DÉLIBÉRÉ ────────────
 * La charte interdit une primitive `Tabs`/`Accordion` neuve avant un TROISIÈME
 * usage. Il y en a deux ici (les deux cadres d'une ligne). Ce composant reste
 * donc LOCAL à cet écran: le jour où la pop-up d'ajout porte le sien (point 3
 * du mandat), les trois se comptent et la primitive se sort — pas avant, parce
 * qu'une abstraction tirée de deux cas fige le mauvais dénominateur.
 *
 * ── LES TROIS CHOSES QU'IL FAIT, ET CHACUNE RÉPOND À UN DÉFAUT MESURÉ ──────
 *   ① IL SE REPLIE, mais il s'ouvre PAR DÉFAUT. Le repli avait été retiré le
 *      2026-08-19 (« il faut arrêter avec le dépliable ») sur trois motifs;
 *      celui qui tenait vraiment est « une réponse repliée est une réponse
 *      invisible ». Ouvert par défaut, il ne cache rien; refermé À LA MAIN, il
 *      est refermé par quelqu'un qui vient de lire.
 *   ② IL RÉSUME CE QU'IL CACHE. C'est ce qui répond au motif ci-dessus, et
 *      c'est la seule chose qui rende le repli acceptable: le résumé reste à
 *      l'écran quand le contenu n'y est plus.
 *   ③ IL A UNE GARDE DE CHARGEMENT. `loaded` faux ⇒ AUCUN champ, une phrase.
 *      Les formulaires de cette page figent leurs champs au montage et
 *      REMPLACENT à l'enregistrement: un cadre monté sur une lecture non faite
 *      affiche du vide non lu, puis l'écrit. Le paramètre est REQUIS — jamais
 *      optionnel: une garde facultative est une garde désarmée.
 *
 * ⚠️ ET IL DÉMONTE SON CONTENU QUAND IL EST REPLIÉ, exprès: les champs d'ici
 * sont figés au montage, donc les remonter à l'ouverture est ce qui les fait
 * repartir de la lecture FRAÎCHE plutôt que de celle du premier rendu. C'est
 * l'inverse du choix fait pour `Modal` (qui rend `null` sans démonter, pour
 * qu'une grille en cours de saisie survive à une fermeture accidentelle), et
 * l'inverse est juste ici: on ne saisit rien dans un cadre replié.
 */
/**
 * ⚠️ EXPORTÉ POUR ÊTRE PROUVÉ, pas pour être réutilisé ailleurs. `HouseholdPage`
 * entier ne se monte pas sous `renderToStaticMarkup` (session, routeur, quatre
 * lectures), et ce qui doit être mesuré ici est le CADRE: sa garde de
 * chargement, son récapitulatif replié, et le fait qu'il démonte son contenu.
 * Voir `pages/memberSheetFrames.int.test.ts`.
 */
export function SheetFrame(
  { title, hint, open, onToggle, loaded, summary, children }: {
    title: string;
    hint?: string;
    open: boolean;
    onToggle: () => void;
    /** Faux = la lecture n'a pas eu lieu. REQUIS — voir ③. */
    loaded: boolean;
    /** Ce que le cadre cache, dit quand il est replié. */
    summary?: string;
    children: React.ReactNode;
  },
) {
  return (
    <section className="rounded-card border border-line bg-paper p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <SectionLabel>{title}</SectionLabel>
        {/* LE CHEVRON EST UN CARACTÈRE, PAS UNE IMAGE: il tourne avec l'état,
            et `aria-expanded` au-dessus porte le fait pour qui ne le voit pas.
            `aria-hidden`, parce qu'il répète ce que l'état dit déjà. */}
        <span aria-hidden className="text-ink-soft">{open ? "▾" : "▸"}</span>
      </button>
      {hint !== undefined && open
        ? <p className="mt-1 text-xs leading-5 text-ink-soft">{hint}</p>
        : null}
      {open
        ? (
          !loaded
            // ⛔ AUCUN CHAMP TANT QUE LA LECTURE N'EST PAS REVENUE. Voir ③.
            ? (
              <p className="mt-2 text-sm text-ink-soft">
                {t("household.mouth.frame_loading")}
              </p>
            )
            : <div className="mt-3 flex flex-col gap-3">{children}</div>
        )
        : summary !== undefined
        ? <p className="mt-1 text-xs leading-5 text-ink-soft">{summary}</p>
        : null}
    </section>
  );
}
