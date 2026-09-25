// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Le bouton qui ouvre les préférences.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import React from "react";

import { Button } from "../ui/Button";
import { SectionLabel } from "../ui/Card";
import { t } from "../../i18n/t";
import { type MouthVoice, voiced } from "../../lib/mouthVoice";

/**
 * LA PORTE DES PRÉFÉRENCES — LE BOUTON, ET CE QU'IL DIT DÉJÀ PORTER.
 *
 * ⚠️ UN COMPOSANT À PART DEPUIS LE 2026-08-18, parce que l'entonnoir le monte
 * aussi — trois fois, même: sur la fiche du titulaire, sur le formulaire
 * d'ajout, et sur la ligne de chaque bouche déjà inscrite. Les champs
 * d'allergies EN LIGNE ont disparu de cet écran; ce bouton est alors la SEULE
 * porte vers eux, et une porte recopiée à trois endroits est une porte dont
 * deux exemplaires cesseront un jour de dire la même chose.
 *
 * ⚠️ LE RÉCAPITULATIF N'EST PAS DÉCORATIF. Sans lui, refermer la fenêtre se lit
 * comme perdre ce qu'on vient de taper: le brouillon le garde, mais l'écran
 * n'en montre plus rien — et « un geste qui ne fait rien est indiscernable d'un
 * geste qui a marché » vaut aussi dans l'autre sens.
 */
export function MouthPreferencesButton(
  { busy, onOpen, voice, who, action = null }: {
    /* ⛔ PLUS DE `draft`: il ne servait qu'au récapitulatif, retiré le
       2026-09-20. Le garder aurait fait une prop que trois appelants
       calculent pour rien — et la première d'entre elles est celle qu'on
       oublie de mettre à jour. */
    busy: boolean;
    onOpen: () => void;
    /** REQUIS: le maître lisait « Renseigner SES préférences » sur sa carte. */
    voice: MouthVoice;
    who: string;
    /**
     * ── ⟳ 2026-09-20 · LE GESTE DE LA CARTE, SUR LA MÊME LIGNE ───────────
     *
     * Passé par les deux cartes de `/app/setup`, qui y mettent leur bouton
     * « Enregistrer ». Absent partout ailleurs, et c'est ce qui décide de la
     * FORME: seul, ce bloc n'est que son bouton; accompagné, il devient une
     * barre de fin de carte, la porte à gauche et le geste à droite.
     *
     * ⚠️ L'ORDRE N'EST PAS UN GOÛT. Cette page a une règle datée du
     * 2026-08-19: « Retour » à gauche, l'avance à droite — c'est pour elle
     * que la barre de bas d'écran a été séparée en deux. « Enregistrer » est
     * l'avance de la carte; la porte facultative, elle, ne doit pas occuper
     * la position que l'écran réserve à ce qui fait avancer, à quelques
     * dizaines de pixels au-dessus du « Continuer » de l'étape.
     */
    action?: React.ReactNode;
  },
): React.ReactElement {
  const door = (
    <Button variant="secondary" disabled={busy} onClick={onOpen}>
      {t(voiced("household.mouth.preferences_open", voice), { who })}
    </Button>
  );
  /* ══════════════════════════════════════════════════════════════════════
     ⛔ ICI SE TENAIT LE RÉCAPITULATIF — RETIRÉ LE 2026-09-20
     ══════════════════════════════════════════════════════════════════════

     Une ligne sous le bouton: « Déjà renseigné : les allergies. », ou « Rien
     de renseigné — le plan se compose sans. » Retirée sur demande, avec le
     reste de ce qui alourdissait ces cartes.

     ⚠️ ELLE PAYAIT QUELQUE CHOSE, ET CE QUELQUE CHOSE EST MAINTENANT À
     DÉCOUVERT. La fenêtre des préférences n'a pas de bouton qui enregistre:
     elle édite le brouillon de la fiche, et c'est le Save de la fiche qui
     écrit. Cette ligne était la contrepartie nommée — sans elle, refermer la
     fenêtre ne laisse plus aucune trace à l'écran de ce qu'on vient d'y
     taper. Le brouillon le garde et l'écriture part bien; c'est la PREUVE
     visible qui disparaît, pas la donnée.

     ⚠️ `filledPreferenceBlocks` ET LES DEUX CLÉS RESTENT VIVANTS: trois
     cadres repliables de `/app/household` les rendent encore, et là-bas le
     récapitulatif est la raison même du repli (« on ne referme que ce qu'on
     vient de lire »). Ce n'est pas le compteur qui part, c'est cette
     ligne-ci, sur cette porte-ci. */
  if (action === null) return door;
  return (
    /* ══════════════════════════════════════════════════════════════════════
       ⟳ 2026-09-25 · UNE SECTION À ELLE, EN FIN DE CARTE
       ══════════════════════════════════════════════════════════════════════

       Demandé à l'écran: « préférences alimentaires, il faut que tu le mettes
       en fin de la section informations, genre une section dédiée, parce que
       vu comment c'est placé sur la page, les gens le voient pas forcément ».
       Le bouton était sur la même ligne qu'« Enregistrer », sous les tuiles
       de sport: il se lisait comme un second bouton de sortie de la carte.

       Il a maintenant un titre et une ligne qui dit ce qu'il y a derrière —
       les allergies surtout, que cette porte est la seule à atteindre dans
       l'entonnoir. « Enregistrer » passe dessous, seul, à droite: il écrit
       aussi ce que la fenêtre des préférences a collecté, donc il vient
       après elle.

       ⛔ `pt-` ET PAS `mt-`, POUR LA MÊME RAISON QU'AVANT. Les deux cartes
       qui passent une `action` rendent ce bloc dans un parent `space-y-3` /
       `space-y-4`, qui écrit `margin-top` avec deux classes de spécificité:
       un `mt-*` posé ici serait écrasé. Le fragment rend les deux blocs
       frères directs de ce parent, et c'est lui qui les espace. */
    <>
      <section className="border-t border-line pt-4">
        <SectionLabel>{t("household.mouth.preferences_title")}</SectionLabel>
        <p className="text-xs leading-5 text-ink-soft">
          {t("household.mouth.preferences_section_hint")}
        </p>
        <div className="mt-3">{door}</div>
      </section>
      <div className="flex justify-end">{action}</div>
    </>
  );
}
