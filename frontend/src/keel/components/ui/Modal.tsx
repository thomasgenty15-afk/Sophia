import React from "react";
import { createPortal } from "react-dom";

import { t } from "../../i18n/t";

// KEEL UI — la fenêtre. Une seule, pour que ses obligations soient tenues une
// seule fois.
//
// ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
// La liste de courses avait sa fenêtre écrite à la main. Les sessions de
// cuisine en demandaient une deuxième. Deux copies d'un même dialogue, ce n'est
// pas deux fois le même code: c'est deux endroits où Échap peut manquer, deux
// verrous de défilement dont un seul restaure la valeur d'avant, et un jour une
// fenêtre qui piège le clavier pendant que l'autre non. Le dépôt tient déjà UN
// bouton, UNE carte, UN badge — celui-ci est la même règle.
//
// ── CE QU'UNE FENÊTRE DOIT, ET QUI N'EST PAS OPTIONNEL ────────────────────
// Recouvrir la page engage. Sans `role`/`aria-modal`, un lecteur d'écran
// continue d'annoncer ce qu'il y a derrière. Sans Échap, la seule sortie est un
// bouton qu'il faut viser. Sans verrou de défilement, le premier geste au-dessus
// du fond emporte la page et on ressort en ayant perdu sa place. Sans focus
// entrant, la tabulation continue dans l'écran RECOUVERT et on agit à l'aveugle
// sur des boutons qu'on ne voit plus.
//
// ── ELLE NE DÉMONTE PAS SES ENFANTS, ELLE LES CACHE ───────────────────────
// `open === false` rend `null`, donc l'appelant qui monte la fenêtre en
// permanence garde SON état: les articles rayés de la liste de courses et les
// recettes dépliées survivent à une fermeture. C'est le comportement voulu —
// on referme pour aller relire un plat, pas pour tout recommencer.

/**
 * DEUX LARGEURS, PAS UNE PAR APPELANT.
 *
 * `md` est celle d'origine et reste le défaut: une liste de courses ou une
 * session de cuisine se lit en colonne étroite. `lg` existe pour la fenêtre de
 * réglages, qui porte des champs côte à côte sur un écran large — à `max-w-lg`
 * ses grilles `sm:grid-cols-2` se retrouvaient à l'étroit alors que la place
 * était là.
 */
export type ModalSize = "md" | "lg";

const SIZE: Record<ModalSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Nommée: c'est le `aria-label` autant que le titre affiché. */
  title: string;
  /**
   * ⚠️ SON DÉFAUT ÉTAIT LE LITTÉRAL `"Close"`, ET IL SORTAIT EN ANGLAIS.
   *
   * Cinq fenêtres passent leur propre libellé; toutes les autres — dont la
   * grille « Quels repas, quels jours » de l'entonnoir — prenaient le défaut,
   * donc un « Close » anglais en haut à droite d'un dialogue entièrement
   * français. Vu à l'écran le 2026-08-15.
   *
   * Le défaut est maintenant `common.close`, qui est traduit. Il reste un
   * DÉFAUT et pas une valeur imposée: une fenêtre dont la sortie n'est pas
   * « fermer » mais « jeter ce brouillon » doit pouvoir le dire.
   */
  closeLabel?: string;
  /**
   * LA SORTIE EST UNE CROIX PLUTÔT QU'UN MOT.
   *
   * ⚠️ OPT-IN, ET PAS LE DÉFAUT: une fenêtre dont la sortie n'est pas
   * « fermer » mais « jeter ce brouillon » doit pouvoir le DIRE, et la croix
   * n'a pas de mots. Les fenêtres qui portent une décision gardent donc leur
   * libellé; celles qui ne font que se refermer prennent la croix.
   *
   * ⛔ LE TEXTE NE DISPARAÎT PAS POUR AUTANT: il devient l'`aria-label`. Une
   * croix sans nom accessible est un bouton muet pour un lecteur d'écran.
   */
  closeAsIcon?: boolean;
  /**
   * LE GESTE QUE LA FENÊTRE PORTE, RÉPÉTÉ EN HAUT DU CADRE.
   *
   * ── POURQUOI IL EXISTE (2026-09-01) ────────────────────────────────────
   * Une fenêtre qui montre quelque chose de LONG — un aperçu de semaine — met
   * sa décision en pied. Quelqu'un qui a jugé au premier écran doit alors
   * défiler une semaine entière pour l'accepter, et ce trajet se lit comme
   * « il faut tout lire d'abord ». Le fronton, lui, ne défile pas: une action
   * posée ici reste sous la main du début à la fin.
   *
   * ⛔ IL NE REMPLACE PAS LE GESTE DU PIED, il le DOUBLE. Deux boutons, un
   * seul gestionnaire chez l'appelant — jamais deux chemins d'écriture.
   *
   * ⚠️ CE QUI EST DIT SOUS LE BOUTON DU PIED DOIT L'ÊTRE AUSSI EN HAUT. Une
   * fenêtre qui avertit avant le clic (« adopter recompose ») et qui offre
   * ici un second clic sans l'avertissement aurait retiré l'avertissement à
   * qui prend le raccourci. C'est la charge de l'appelant, pas de ce
   * composant, qui ne sait pas ce qu'il monte.
   *
   * `undefined` = la fenêtre n'a qu'une sortie, et c'est le cas de presque
   * toutes.
   */
  headerAction?: React.ReactNode;
  /**
   * ⛔ LA FENÊTRE NE SE FERME QUE PAR SON BOUTON — ni le voile, ni Échap.
   *
   * ── LE DÉFAUT MESURÉ, ET IL EST DESTRUCTEUR (2026-09-07) ───────────────
   * Signalé sur l'aperçu de brouillon de l'entonnoir: « quand tu cliques ou
   * que tu fais un mouvement d'écran, ça supprime l'aperçu ». C'est exact, et
   * ce n'est pas une fermeture ordinaire. Refermer cet aperçu-là ne le range
   * pas: aucun écran ne le rouvre (`setDraftOpen(true)` n'a qu'un appelant, le
   * chemin de composition), donc y revenir COÛTE UN TOUR DE MODÈLE et remet le
   * compteur de reprises à zéro. Un geste involontaire détruit une minute de
   * génération.
   *
   * ⚠️ OPT-IN, ET JAMAIS LE DÉFAUT. Presque toutes les fenêtres d'ici se
   * referment sans conséquence — une liste de courses rouverte est la même
   * liste —, et pour celles-là le voile et Échap sont exactement ce qu'il
   * faut. Cette porte est pour les fenêtres dont la SORTIE EST UNE DÉCISION.
   *
   * ⚠️ CE QUE ÇA COÛTE, DIT PLUTÔT QUE SOUS-ENTENDU: Échap est l'attente d'un
   * dialogue modal, et on la retire ici. Ce qui le rend tenable est que la
   * sortie reste un bouton NOMMÉ (« Laisser tomber »), placé dans le fronton
   * qui ne défile pas, et premier dans l'ordre de tabulation du dialogue — pas
   * une croix qu'il faut viser. Le retour arrière tient en un mot: retirer la
   * prop au site de montage.
   *
   * ⛔ LE VERROU DE DÉFILEMENT, LUI, RESTE POSÉ. Il était dans le même effet
   * qu'Échap (« les deux moitiés du même contrat »); ils sont séparés
   * maintenant, parce qu'une fenêtre qui ne se ferme pas par Échap doit
   * d'autant plus empêcher la page de bouger derrière elle.
   */
  closeOnlyByButton?: boolean;
  size?: ModalSize;
  children: React.ReactNode;
}

export default function Modal(
  {
    open,
    onClose,
    title,
    closeLabel,
    closeAsIcon,
    headerAction,
    closeOnlyByButton = false,
    size = "md",
    children,
  }: ModalProps,
) {
  // Résolu au RENDU et pas dans la signature: `t()` lit la locale courante à
  // l'appel, et une valeur par défaut de paramètre l'évaluerait aussi à chaque
  // rendu — mais l'écrire ici la met sous les yeux de qui lit le composant.
  const closeText = closeLabel ?? t("common.close");
  // ── LA PAGE DERRIÈRE NE DÉFILE PLUS ─────────────────────────────────────
  // ⛔ SÉPARÉ D'ÉCHAP LE 2026-09-07, et l'ordre des mots compte: ce verrou-ci
  // est INCONDITIONNEL. Il l'était déjà, mais il partageait un effet avec la
  // touche; une fenêtre qui refuse Échap (`closeOnlyByButton`) l'aurait perdu
  // avec elle, et c'est précisément celle qui en a le plus besoin.
  React.useEffect(() => {
    if (!open) return;
    // La valeur PRÉCÉDENTE est restaurée, pas `""`: un autre composant peut
    // avoir posé le verrou avant nous, et écrire une chaîne vide le lèverait
    // pour lui aussi.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // ── ÉCHAP FERME — SAUF QUAND LA SORTIE EST UNE DÉCISION ─────────────────
  React.useEffect(() => {
    if (!open || closeOnlyByButton) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, closeOnlyByButton]);

  /**
   * LE GESTE A-T-IL COMMENCÉ SUR LE VOILE ? — et pas seulement fini dessus.
   *
   * ⛔ LE TEST DE CIBLE SEUL NE SUFFISAIT PAS, ET LE COMMENTAIRE D'À CÔTÉ
   * PROMETTAIT LE CONTRAIRE. Un navigateur émet `click` sur le PLUS PROCHE
   * ANCÊTRE COMMUN du `mousedown` et du `mouseup`: presser dans le dialogue
   * puis relâcher sur le voile — sélectionner du texte qui déborde, faire
   * défiler à la souris, tirer l'écran au doigt — rend `e.target` égal au
   * voile. La fenêtre se fermait donc sur un geste qui avait commencé DEDANS,
   * ce que le test de cible était censé empêcher.
   *
   * ⚠️ Une `ref` et pas un `useState`: cette valeur ne doit rien redessiner,
   * et un rendu entre le `pointerdown` et le `click` la perdrait.
   */
  const pressStartedOnVeil = React.useRef(false);

  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  // `createPortal` vers `body`: à l'intérieur de l'arbre, le premier parent qui
  // crée un contexte d'empilement (une `transform`, un `overflow`) suffirait à
  // enfermer la fenêtre dans la carte qui l'a ouverte.
  return createPortal(
    <div
      // Le voile est l'ENCRE de la marque, pas un gris: `ink` (#23191F) à 40 %,
      // la même valeur d'opacité qu'avant. Il n'a pas à être plus dense — ce qui
      // sépare la fenêtre de la page, c'est le trait de la fenêtre.
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      // ⛔ LE GESTE DOIT COMMENCER ET FINIR SUR LE VOILE. Le test de cible seul
      // laissait passer tout geste RELÂCHÉ sur le fond après avoir commencé
      // dans la fenêtre (voir `pressStartedOnVeil`), et c'est le défaut
      // signalé: « un mouvement d'écran supprime l'aperçu ».
      onPointerDown={(e) => {
        pressStartedOnVeil.current = e.target === e.currentTarget;
      }}
      // ⚠️ ET IL DOIT AUSSI SE RELÂCHER SUR LE VOILE. Le cas miroir est réel
      // sur téléphone: la fenêtre est collée en bas (`items-end`), donc il y a
      // du voile AU-DESSUS d'elle, et un doigt qui part de là pour faire
      // défiler la feuille finit dans le dialogue. Sans ceci, ce geste-là
      // fermerait — c'est l'autre moitié du « mouvement d'écran » signalé.
      onPointerUp={(e) => {
        if (e.target !== e.currentTarget) pressStartedOnVeil.current = false;
      }}
      onClick={(e) => {
        const started = pressStartedOnVeil.current;
        pressStartedOnVeil.current = false;
        // ⚠️ LA FENÊTRE QUI PORTE UNE DÉCISION NE SE FERME PAS PAR LE VOILE.
        // Le drapeau est quand même remis à zéro juste au-dessus: sortir plus
        // tôt le laisserait armé pour le geste suivant.
        if (closeOnlyByButton) return;
        if (!started || e.target !== e.currentTarget) return;
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // UNE FENÊTRE EST UNE SURFACE ENTIÈRE, donc `rounded-fiche` (16px) — la
        // même valeur que `rounded-2xl` rendait: le rayon n'a pas changé, il
        // porte son nom. Elle est le GROUND de ce qu'elle contient, donc `paper`
        // comme la page: les cartes posées dedans gardent exactement le contraste
        // qu'elles ont sur un écran.
        className={`flex max-h-[90vh] w-full ${SIZE[size]} flex-col overflow-hidden rounded-t-fiche bg-paper shadow-xl outline-none sm:rounded-fiche`}
      >
        {/* LE FRONTON. `paper-2` sur `paper` (1,08:1) plus le trait `line`: la
            barre de titre se détache du corps sans qu'on ait besoin d'un aplat.
            C'est l'idiome de la fiche, celui de `/auth` et `/start`. */}
        <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-2 px-4 py-3">
          {/* PUBLIC SANS, PAS YOUNG SERIF: un titre de fenêtre fait 16 px et la
              display ne descend jamais sous 20. Et pas d'équerre — la signature
              ouvre une SECTION, elle ne redouble pas un titre de dialogue. */}
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {/* ⚠️ `min-w-0` ET `flex-wrap` NE SUFFISENT PAS SEULS ICI: un enfant
              de flex refuse par défaut d'être plus étroit que son contenu, donc
              un libellé long dans `headerAction` pousserait le titre hors du
              cadre à 320 px. Le groupe rétrécit, le titre garde sa place.
              L'ordre est SORTIE PUIS ACTION: la décision est à droite, là où
              elle est en pied. */}
          <div className="flex min-w-0 shrink items-center justify-end gap-2">
            {closeAsIcon
              ? (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={closeText}
                  // ⚠️ 40px DE CIBLE, pas la taille du glyphe. Une croix dessinée
                  // à 14px est une cible de 14px: sous le minimum tactile, et la
                  // première chose qu'on rate sur un téléphone.
                  className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-part text-xl leading-none text-ink-soft hover:bg-fig-50 hover:text-ink"
                >
                  <span aria-hidden="true">×</span>
                </button>
              )
              : (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-part px-2 py-1 text-sm text-ink-soft underline underline-offset-2 hover:text-ink"
                >
                  {closeText}
                </button>
              )}
            {headerAction ?? null}
          </div>
        </div>

        {/* LE DÉFILEMENT EST ICI, pas sur la page: une liste de courses ou une
            semaine de préparations ne tient pas dans une fenêtre, et laisser la
            page défiler derrière fait perdre le contenu dès le premier geste. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
