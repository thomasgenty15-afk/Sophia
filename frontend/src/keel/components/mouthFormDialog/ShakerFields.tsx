// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Le bloc du shaker.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { t } from "../../i18n/t";
import {
  EATING_OCCASIONS,
  type EatingOccasionSlot,
} from "../../api/mealGeneration";
import { mealCopy } from "../../api/mealLabels";
import { type MouthVoice, voiced } from "../../lib/mouthVoice";
import {
  type ShakerDraft,
  shakerCanBeSaved,
  shakerIsComplete,
} from "../../lib/mouthForm";

/**
 * LE SHAKER — ET LES DEUX NOMBRES QU'ON LUI DEMANDE.
 *
 * ⚠️ ON DEMANDE CE QU'IL APPORTE, PAS SEULEMENT CE QUE C'EST. Protéines et
 * calories par portion: c'est ce qui lui permet de COMPTER DANS L'ENVELOPPE au
 * lieu d'être contourné — un shaker ignoré, c'est 380 kcal invisibles par jour,
 * et un générateur qui rajoute de quoi combler un creux qui n'existe pas.
 *
 * ⚠️ LES DEUX NOMBRES SE LISENT SUR L'ÉTIQUETTE DU POT, et c'est ce qui garde
 * la frontière du §3 de la conception: c'est un FAIT DU PRODUIT, pas un verdict
 * sur la personne. Le référentiel, lui, ne connaît aucune poudre de protéine
 * (mesuré: 911 références, zéro whey) et n'en connaîtrait qu'une moyenne.
 *
 * ⚠️ MIS EN AVANT POUR QUI PREND DU POIDS, PROPOSÉ SANS INSISTANCE AUX AUTRES.
 * « Sans insistance » n'est pas « absent »: quelqu'un qui perd du poids peut
 * très bien en prendre un, et ne pas le demander le rendrait invisible au
 * calcul.
 */
/**
 * L'APPORT CHIFFRÉ — UN OBJET, PAS UNE SUITE DE CHAMPS.
 *
 * ── ⚠️ REFAIT LE 2026-08-19, SUR UN SIGNALEMENT DE COMPRÉHENSION ──────────
 * « La partie ajouter un shaker, on ne comprend pas […] refais la partie UI
 * parce qu'on comprend vraiment pas. » Ce qui ne se comprenait pas, en clair,
 * et chaque point était une cause distincte:
 *
 *   · REPLIÉ, ON NE VOYAIT QU'UN PARAGRAPHE ET UN BOUTON. Rien ne disait ce
 *     qu'est cette chose ni où elle atterrit — juste une phrase sur la prise de
 *     poids, suivie d'un bouton de vingt-cinq caractères.
 *   · DÉPLIÉ, IL N'AVAIT PAS DE CADRE. Les champs tombaient dans le flux, à la
 *     suite des lignes d'habitudes: on lisait la suite de la section du dessus,
 *     pas un objet ajouté.
 *   · LES TROIS NOMBRES N'AVAIENT QUE DES `placeholder`. Le placeholder
 *     DISPARAÎT dès qu'on tape: trois cases de chiffres sans étiquette, et plus
 *     aucun moyen de savoir laquelle porte les protéines. C'est le défaut le
 *     plus coûteux des trois — il produit des données FAUSSES, pas seulement de
 *     la confusion.
 *   · ET RIEN NE DISAIT OÙ ÇA S'ENREGISTRE. « Il faut que ça permette
 *     d'enregistrer, de supprimer. »
 *
 * ── ⚠️ CE BLOC N'A TOUJOURS PAS SON PROPRE BOUTON D'ENREGISTREMENT ────────
 * Et c'est délibéré, pas un raccourci: la fenêtre édite LE MÊME brouillon que
 * la fiche, et c'est la fiche qui écrit. Un second bouton d'enregistrement sur
 * les mêmes colonnes est « la garantie qu'un jour l'un des deux cessera
 * d'écrire ce que l'autre écrit » — le dépôt l'a déjà mesuré sur `MeCard`.
 * Ce qui manquait n'était donc pas un bouton, c'était la PHRASE: le pied du
 * cadre dit maintenant par quoi il part. Le retrait, lui, est immédiat et local
 * — il ne touche que le brouillon.
 */
export function ShakerFields(
  { shaker, foreground, onChange, onSlot, rhythm, onSave, busy, voice, who }: {
    shaker: ShakerDraft | null;
    foreground: boolean;
    onChange: (next: ShakerDraft | null) => void;
    /**
     * LE MOMENT SE POSE PAR LE PARENT — 2026-09-01.
     *
     * ⛔ PAS PAR `onChange`, ET C'EST LA MOITIÉ QUI COMPTE. Choisir un moment
     * que la personne n'a pas coché AJOUTE ce moment à son rythme, et le
     * rythme n'appartient pas à ce bloc. L'écrire ici en ferait un second
     * écrivain sur un champ qui en a déjà un — deux idées du même rythme, à
     * deux lignes d'écart.
     */
    onSlot: (slot: string) => void;
    /**
     * CE QUI EST COCHÉ EN CE MOMENT. `null` = « comme la maison ».
     *
     * ⚠️ IL NE RESTREINT PAS LA LISTE DES MOMENTS OFFERTS, il sert à DIRE
     * qu'un moment non coché sera ajouté. Restreindre rendrait le cas
     * fondateur inexprimable: « je mange midi et soir, et j'ai un shaker
     * l'après-midi » — l'après-midi n'est pas dans la liste, et c'est
     * justement pour ça qu'on le choisit.
     */
    rhythm: readonly EatingOccasionSlot[] | null;
    /**
     * Enregistre TOUT DE SUITE, sans passer par le Save de la fiche.
     *
     * ⚠️ IL PORTE AUSSI LE RYTHME DEPUIS LE 2026-09-01, ET CE N'EST PAS DU
     * CONFORT. Le rythme et le shaker ont deux chemins d'écriture différents
     * (`setMemberRhythm` via le bouton de la FICHE, `addShakerTo…Intakes` via
     * CE bouton-ci). Sans le second argument, déclarer un shaker sur un moment
     * non coché écrivait le shaker et laissait le moment dans le brouillon:
     * en base, un apport posé sur un moment où la personne ne mange pas.
     * C'est la moitié d'écriture que ce dépôt paie en boucle.     *
     * ⚠️ `null` = IL N'Y A PAS DE BOUTON ICI, ET LES CHAMPS RESTENT. C'est la
     * fiche d'AJOUT: la ligne n'existe pas encore, donc rien ne peut être
     * écrit tout de suite — mais la déclaration se COLLECTE, et « Ajouter à la
     * table » l'écrit avec le reste du brouillon. Retirer le bloc entier dans
     * ce cas était le défaut du 2026-09-01. Voir `ShakerPort`.
     */
    onSave:
      | ((
        shaker: ShakerDraft,
        rhythm: readonly EatingOccasionSlot[] | null,
      ) => void)
      | null;
    busy: boolean;
    /** REQUIS: sans elle, ce bloc reparlerait de « son » shaker au maître. */
    voice: MouthVoice;
    who: string;
  },
) {
  const empty: ShakerDraft = {
    label: "",
    servingGrams: "",
    proteinGPerServing: "",
    energyKcalPerServing: "",
    slot: "",
  };

  // ── REPLIÉ: UNE INVITATION ENCADRÉE, PAS UN BOUTON ORPHELIN ──────────────
  // Le cadre en pointillé dit « il n'y a rien encore ici », exactement comme la
  // fiche d'ajout d'une personne — un seul idiome dans tout l'entonnoir.
  if (shaker === null) {
    return (
      <div
        // IL EST UNE SECTION DE LA FICHE depuis qu'il a quitté « ce
        // qu'elle mange déjà » — et le compte de cadres le vérifie.
        data-sheet-section=""
        className="rounded-card border border-dashed border-line-strong p-4"
      >
        <span className="block text-sm font-semibold text-ink">
          {t(voiced("household.mouth.shaker_title", voice), { who })}
        </span>
        <p className="mt-1 text-xs leading-5 text-ink-soft">
          {foreground
            ? t("household.mouth.shaker_foreground")
            : t("household.mouth.shaker_background")}
        </p>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => onChange(empty)}>
            {t("household.mouth.shaker_add")}
          </Button>
        </div>
      </div>
    );
  }

  const set = (patch: Partial<ShakerDraft>) => onChange({ ...shaker, ...patch });
  const complete = shakerIsComplete(shaker);
  // LES TROIS NOMBRES, DÉCLARÉS UNE FOIS. Le `Record` n'est pas du zèle: il
  // garantit qu'aucun des trois ne peut être rendu sans son étiquette, ce qui
  // est très précisément le défaut qu'on referme.
  const numbers: Array<{
    id: string;
    label: string;
    value: string;
    onValue: (v: string) => void;
    min: number;
  }> = [
    {
      id: "mouth-shaker-grams",
      label: t("household.mouth.shaker_grams"),
      value: shaker.servingGrams,
      onValue: (v) => set({ servingGrams: v }),
      min: 1,
    },
    {
      id: "mouth-shaker-protein",
      label: t("household.mouth.shaker_protein"),
      value: shaker.proteinGPerServing,
      onValue: (v) => set({ proteinGPerServing: v }),
      min: 0,
    },
    {
      id: "mouth-shaker-kcal",
      label: t("household.mouth.shaker_kcal"),
      value: shaker.energyKcalPerServing,
      onValue: (v) => set({ energyKcalPerServing: v }),
      min: 0,
    },
  ];

  return (
    // ── DÉPLIÉ: UN CADRE PLEIN — « ceci est un objet que tu as ajouté » ─────
    // Trait plein contre le pointillé de l'invitation, exactement comme une
    // bouche inscrite contre la fiche d'ajout.
    <div
      data-sheet-section=""
      className="space-y-4 rounded-card border border-line-strong bg-paper p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* SON NOM EN TÊTE, comme une personne inscrite: c'est ce qui dit « ici
            commence un objet », et ce qui permet de le reconnaître plus tard.
            Tant qu'il n'est pas nommé, le titre générique tient la place. */}
        <span className="min-w-0 text-sm font-semibold text-ink">
          {shaker.label.trim() || t(voiced("household.mouth.shaker_title", voice), { who })}
        </span>
        {/* ⚠️ « RETIRER » EST EN TÊTE, PAS AU FOND. Au fond d'un bloc de six
            champs, il se lisait comme le geste de la SECTION entière. */}
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          {t("household.mouth.shaker_remove")}
        </Button>
      </div>

      <Field
        label={t(voiced("household.mouth.shaker_label", voice), { who })}
        hint={t(voiced("household.mouth.shaker_label_hint", voice), { who })}
        htmlFor="mouth-shaker-label"
      >
        <input
          id="mouth-shaker-label"
          type="text"
          maxLength={60}
          value={shaker.label}
          onChange={(e) => set({ label: e.target.value })}
          className={inputClass}
        />
      </Field>

      {/* ── ⛔ CHAQUE NOMBRE PORTE SON ÉTIQUETTE, ET PAS UN `placeholder` ────
          Le placeholder disparaît à la première frappe. Trois cases de chiffres
          côte à côte SANS étiquette, c'est un tableau qu'on ne peut plus relire
          — et une protéine saisie dans la case des calories est une donnée
          fausse qui entre ensuite dans un calcul d'énergie avec l'autorité
          d'une mesure. L'`aria-label` seul ne réparait rien: il ne se VOIT
          pas. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {numbers.map((n) => (
          <Field key={n.id} label={n.label} htmlFor={n.id}>
            <input
              id={n.id}
              type="number"
              inputMode="decimal"
              min={n.min}
              value={n.value}
              onChange={(e) => n.onValue(e.target.value)}
              className={`${inputClass} min-w-0`}
            />
          </Field>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          À QUEL MOMENT — le champ qui manquait depuis toujours (2026-09-01)
          ══════════════════════════════════════════════════════════════════

          ⛔ `ShakerDraft.slot` EXISTAIT DÉJÀ ET N'ÉTAIT RENDU NULLE PART. Le
          champ partait donc en base avec sa valeur d'origine — `""`, « hors
          moment nommé » — sans que personne ait jamais pu la choisir. Ce n'est
          pas un déplacement de contrôle, c'est un contrôle qui manquait.

          ⚠️ LES SIX MOMENTS SONT OFFERTS, PAS SEULEMENT LES COCHÉS. Restreindre
          rendrait le cas fondateur inexprimable: « je mange midi et soir, et
          j'ai un shaker l'après-midi ». L'après-midi n'est pas dans sa liste —
          c'est justement pour ça qu'on le choisit, et c'est ce qui l'ajoutera.

          ⛔ ET L'AJOUT SE DIT AVANT LE CLIC, jamais après. Un moment qui
          apparaîtrait coché plus haut sans un mot serait une écriture que
          personne n'a demandée; la phrase sous le champ dit ce que le choix
          va faire. */}
      <Field
        label={t(voiced("household.mouth.shaker_at", voice), { who })}
        htmlFor="mouth-shaker-slot"
      >
        <select
          id="mouth-shaker-slot"
          value={shaker.slot}
          disabled={busy}
          onChange={(e) => onSlot(e.target.value)}
          className={inputClass}
        >
          {/* `""` EST UNE RÉPONSE, pas un vide: « il ne tombe sur aucun de mes
              moments ». C'est la valeur d'origine, et elle reste atteignable. */}
          <option value="">{t("household.mouth.shaker_at_loose")}</option>
          {/* ══════════════════════════════════════════════════════════════
              ⛔ LES OPTIONS PORTENT LE NOM DU MOMENT, ET RIEN D'AUTRE.
              ══════════════════════════════════════════════════════════════

              Deux rédactions ont essayé d'annoncer l'ajout ICI, et les deux
              ont échoué pour des raisons opposées:

                ① une phrase sous le champ (« ce moment n'est pas coché plus
                  haut ») — INATTEIGNABLE: `onSlot` ajoute le moment au rythme
                  dans le MÊME `set()` que le slot, donc au rendu suivant la
                  condition était déjà fausse. Mesuré au navigateur avec un
                  `MutationObserver`: zéro occurrence, pas même une image.
                ② une marque « — à ajouter » sur chaque option non cochée —
                  ATTEIGNABLE mais ILLISIBLE: le cas courant est `rhythm:
                  null` (« comme la maison »), où AUCUN moment n'est coché. Les
                  six options portaient donc la marque, et une marque que tout
                  le monde porte ne distingue plus rien. Vu à l'écran le
                  2026-09-01, capture à l'appui.

              ⚠️ L'AJOUT N'EST PAS MUET POUR AUTANT, et c'est ce qui autorise à
              se taire ici: la case se coche dans la section juste au-dessus, à
              l'écran, dans le même geste. La conséquence est VISIBLE — elle
              n'a pas besoin d'être aussi annoncée. */}
          {EATING_OCCASIONS.map((slot) => (
            <option key={slot} value={slot}>
              {mealCopy(`meals.slot.${slot}` as "meals.slot.breakfast")}
            </option>
          ))}
        </select>
      </Field>

      <p className="text-xs leading-5 text-ink-soft">
        {t("household.mouth.shaker_label_source")}
      </p>

      {/* ⛔ L'AVERTISSEMENT AMBRE A ÉTÉ RETIRÉ LE 2026-08-19. Il disait « il
          faut un nom et les trois nombres, sinon la ligne est jetée sans un
          mot » — au-dessus d'une ligne d'état qui dit déjà, sous le bouton,
          exactement où en est cette déclaration. Deux phrases pour le même
          fait, dont une en ambre: on lisait un refus là où il n'y en a pas. */}
      {!complete ? null : (
        // ── COMPLET: ON RELIT CE QUI PARTIRA ───────────────────────────────
        // ⚠️ CE RÉCAPITULATIF EST LA SECONDE MOITIÉ DES ÉTIQUETTES. Il rejoue
        // les trois nombres AVEC leur unité, dans une phrase: c'est ce qui
        // permet d'attraper une protéine tapée dans la case des calories, que
        // trois champs remplis ne montrent pas.
        <p className="rounded-card border border-line-strong bg-paper-2 p-3 text-xs leading-5 text-ink">
          {t("household.mouth.shaker_summary", {
            grams: shaker.servingGrams,
            protein: shaker.proteinGPerServing,
            kcal: shaker.energyKcalPerServing,
          })}
        </p>
      )}

      {/* ── SON PROPRE BOUTON D'ENREGISTREMENT ─────────────────────────────
          ⚠️ IL S'ACTIVE DÈS QU'IL Y A UN NOM ET **UNE** DES TROIS MESURES, et
          c'est la règle demandée: « ça enregistre peu importe si tout est
          complété, il faut au moins une des 3 mesures ».

          ⛔ MAIS UNE DÉCLARATION INCOMPLÈTE N'EST PAS COMPTÉE, ET L'ÉCRAN NE
          PEUT PAS LE TAIRE. `parseFixedIntakes` est TOUT-OU-RIEN sur les trois
          nombres — « une déclaration à moitié lisible n'est pas une
          déclaration […] ferait perdre la protéine en silence ». Un shaker
          enregistré avec le seul grammage est donc gardé sur la fiche et JETÉ
          par le moteur. On enregistre quand même (c'est la demande), et la
          phrase juste en dessous dit dans quel état il est: gardé, ou compté.
          Un bouton qui dit « enregistré » sur une ligne que la composition
          ignore serait le mensonge que ce dépôt passe son temps à fermer. */}
      {/* ⛔ PAS DE BOUTON QUAND IL N'Y A PAS DE LIGNE OÙ ÉCRIRE, et les champs
          restent quand même. Un bouton « Enregistrer » sur la fiche d'ajout
          échouerait à tous les coups — la ligne membre n'existe qu'après
          « Ajouter à la table ». C'est la phrase d'état, plus bas, qui dit
          alors où part la déclaration. */}
      {onSave !== null ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !shakerCanBeSaved(shaker)}
            // ⛔ LES DEUX, ET DANS LE MÊME GESTE. Le moment choisi ici a pu
            // AJOUTER une case au rythme; sans ce second argument, le shaker
            // partait en base et la case restait dans le brouillon.
            onClick={() => onSave(shaker, rhythm)}
          >
            {t("household.mouth.shaker_save")}
          </Button>
        </div>
      ) : null}
      {/* ── OÙ EN EST CETTE DÉCLARATION, ET LES DEUX COLONNES NE MENTENT PAS
          L'UNE POUR L'AUTRE ────────────────────────────────────────────────
          ⚠️ « Compté » EST UN FAIT SUR LA BASE, pas sur le brouillon. Le dire
          sans bouton d'écriture serait annoncer qu'une chose est en base au
          moment précis où elle ne l'est pas — le mensonge que ce dépôt passe
          son temps à fermer. Sans port immédiat, une déclaration complète dit
          donc PAR OÙ elle partira, pas qu'elle est arrivée.

          Les deux autres crans, eux, parlent de la DÉCLARATION elle-même
          (« il manque une mesure », « gardé mais pas compté »): ils sont vrais
          des deux côtés, et ils ne bougent pas. */}
      <p className="text-xs leading-5 text-ink-soft">
        {!shakerCanBeSaved(shaker)
          ? t("household.mouth.shaker_needs_one")
          : !complete
          ? t("household.mouth.shaker_kept_not_counted")
          : onSave === null
          ? t("household.mouth.shaker_with_the_card")
          : t("household.mouth.shaker_counted")}
      </p>
    </div>
  );
}
