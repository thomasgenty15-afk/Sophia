// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Le poids visé et le curseur de rythme.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import React from "react";

import { Field, inputClass } from "../ui/Field";
import { t } from "../../i18n/t";
import { uiLocale } from "../../i18n/runtime";
import { type MouthVoice } from "../../lib/mouthVoice";
import { arrivalHorizonCopy } from "../../lib/arrivalHorizon";
import {
  executedPaceNoticeFor,
  type MouthFormDraft,
  paceControlFor,
  targetWeightStateFor,
} from "../../lib/mouthForm";
import { PACE_WARNING_LABELS } from "../../../../../supabase/functions/_shared/keel/weight_pace.ts";
import { pace } from "./labels.ts";

/**
 * LE POIDS VISÉ ET LE CURSEUR DE RYTHME — UN SEUL EXEMPLAIRE DANS LE DÉPÔT.
 *
 * ⚠️ EXTRAITS POUR QUE L'ENTONNOIR LES MONTE AUSSI. Mesuré au navigateur:
 * `/app/setup` ne portait NI poids visé NI curseur — zéro `input[type=range]`
 * sur la page après avoir choisi une direction. Les y recopier aurait fait une
 * SECONDE lecture de `paceControlFor`, donc deux écrans qui divergent au premier
 * correctif; le dépôt a déjà payé ça sur les listes d'objectifs.
 *
 * Les quatre états restent ceux du module, et ils ne se confondent pas:
 *   `folded`      la direction ne bouge pas — on ne demande rien, et ce
 *                 composant rend `null`;
 *   `needs_body`  `null` = « je ne connais pas ce corps » — une phrase;
 *   `no_margin`   `0` = « je le connais, il n'a pas de marge » — une AUTRE
 *                 phrase, jamais un curseur de 0,05 à 0;
 *   `slider`      un curseur borné sur CE corps.
 *
 * ⚠️ `idPrefix` EST REQUIS, ET CE N'EST PAS DU CONFORT. Les deux contrôles
 * portaient `id="mouth-target-weight"` et `id="mouth-pace"` en dur. Depuis le
 * 2026-08-18 l'étape 2 de l'entonnoir les monte DEUX FOIS sur la même page —
 * une fois pour le titulaire, une fois pour la bouche qu'on ajoute: deux
 * éléments du même `id` font qu'un `<label for>` désigne le premier, donc
 * cliquer le libellé du second met le curseur du premier au point. Un préfixe
 * OPTIONNEL aurait laissé les appelants d'aujourd'hui produire la collision en
 * silence — c'est le patron `idPrefix` d'`ActivityTiles`, requis pour la même
 * raison.
 */
export function TargetAndPaceFields(
  // ⟳ 2026-09-15 — `voice` ET `who` SONT REDEVENUS LUS, ET C'ÉTAIT PRÉVU.
  // Ils avaient cessé de l'être le 2026-09-03, quand les deux `hint` qui les
  // lisaient sont partis; la note d'alors disait « le prochain texte voisé les
  // relira » et refusait de les retirer du contrat pour faire taire un lint.
  // Le texte voisé est arrivé: la phrase d'arrivée TUTOIE, et cette fiche se
  // règle aussi pour une bouche du foyer.
  { draft, onChange, todayLocalIso, idPrefix, voice, who }: {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
    idPrefix: string;
    /** REQUIS, même raison que partout ailleurs sur cette fiche. */
    voice: MouthVoice;
    who: string;
  },
): React.ReactElement | null {
  const set = (patch: Partial<MouthFormDraft>) =>
    onChange((prev) => ({ ...prev, ...patch }));
  const paceControl = paceControlFor(draft, todayLocalIso);
  const targetState = targetWeightStateFor(draft, todayLocalIso);
  // ⚠️ LU SUR LE BROUILLON BRUT, PAS SUR `paceControl.value`. Le curseur
  // affiche un cran RABATTU sur le plafond de ce corps; la base, elle, garde
  // celui qu'on y a écrit. Voir `executedPaceNoticeFor`.
  const executedNotice = executedPaceNoticeFor(draft, todayLocalIso);
  if (paceControl.kind === "folded") return null;
  return (
            <div className="space-y-4 border-t border-line pt-4">
              <Field
                label={t("household.mouth.target_weight")}
                // ⛔ PAS DE `hint` ICI (2026-09-01, à la demande), ET CETTE
                // PLACE A DÉJÀ PORTÉ DEUX PHRASES CONTRAIRES:
                //   · « Avec le rythme ci-dessous, il donne une date
                //     d'arrivée. » — la promesse, énoncée plus explicitement
                //     que le nombre lui-même (retirée le 2026-08-22);
                //   · « …il dit le sens de marche, pas le moment où il sera
                //     atteint. » — sa négation, qui CONTREDIRAIT maintenant le
                //     nombre de semaines rendu quinze lignes plus bas.
                // Les deux sont intenables avec le chiffre de retour. La
                // phrase sous le curseur porte l'horizon ET sa réserve, au
                // moment exact où le curseur se pousse; un troisième texte ici
                // ne pourrait que diverger de celui-là.
                // ⚠️ LE REFUS EST RENDU À CÔTÉ DU CHAMP, ET C'EST LE CONTRAT DE
                // PASSATION DU SOCLE. Trois fois dans `SetupPage`, un refus
                // rendu loin du geste s'est lu comme un bouton mort.
                error={targetState.kind === "refused"
                  ? t(
                    `household.mouth.target_refused_${targetState.refusal}` as "household.mouth.target_refused_implausible",
                  )
                  : undefined}
                htmlFor={`${idPrefix}-target-weight`}
              >
                <input
                  id={`${idPrefix}-target-weight`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={25}
                  max={400}
                  value={draft.targetWeightKg}
                  onChange={(e) => set({ targetWeightKg: e.target.value })}
                  className={inputClass}
                />
              </Field>

              {paceControl.kind === "needs_body" ? (
                // ⚠️ `null` DE `paceCeilingFor` = « JE NE CONNAIS PAS CE CORPS ».
                // On demande le corps, on n'affiche PAS de curseur: un maximum
                // deviné promettrait une date d'arrivée calculée sur une
                // personne qui n'existe pas.
                <p className="rounded-card border border-line-strong bg-paper-2 p-3 text-xs leading-5 text-ink-soft">
                  {t("household.mouth.pace_needs_body")}
                </p>
              ) : null}

              {paceControl.kind === "no_margin" ? (
                // ⚠️ ET `0` = « JE LE CONNAIS, ET IL N'A PAS DE MARGE » (défaut
                // D3 de la vérification du socle, porté dans le type de
                // `PaceCeiling`). Les deux appellent des écrans DIFFÉRENTS, et
                // surtout: on n'affiche pas un curseur de 0,05 à 0 — c'est un
                // contrôle mort, et un contrôle mort se lit comme un bouton
                // cassé, jamais comme un refus.
                <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  {t("household.mouth.pace_no_margin")}
                </p>
              ) : null}

              {paceControl.kind === "slider" ? (
                <Field
                  label={t("household.mouth.pace")}
                  // ⛔ PAS DE `hint` ICI (2026-09-01, à la demande).
                  // `household.mouth.pace_hint` disait « le maximum de ce
                  // curseur est réglé sur ton corps — c'est le rythme le plus
                  // rapide que le plan sait vraiment cuisiner. » Le plafond
                  // se VOIT: le curseur ne monte pas plus haut, et
                  // `paceCeilingFor` le calcule déjà sur ce corps. Les deux
                  // clés ont été retirées des catalogues avec ce lot — un
                  // texte gardé « au cas où » est un texte qu'on rerend.
                  // ⚠️ CE QUI RESTE EST CE QUI N'EST PAS DÉDUCTIBLE DU
                  // CONTRÔLE: `pace_needs_body` et `pace_no_margin`
                  // au-dessus (aucun curseur du tout), et
                  // `PACE_WARNING_LABELS` en dessous (un fait de
                  // physiologie, pas une borne).
                  htmlFor={`${idPrefix}-pace`}
                >
                  <input
                    id={`${idPrefix}-pace`}
                    type="range"
                    min={paceControl.min}
                    max={paceControl.max}
                    step={paceControl.step}
                    value={paceControl.value}
                    onChange={(e) => set({ paceKgPerWeek: e.target.value })}
                    className="w-full"
                  />
                  <p className="mt-2 text-sm font-medium text-ink">
                    {t("household.mouth.pace_value", {
                      pace: pace(paceControl.value),
                    })}
                  </p>
                  {/* ⚠️ LA PHRASE VIENT DU MODULE, DANS LES DEUX LANGUES, ET
                      ELLE N'EST PAS RÉÉCRITE ICI. Le seuil et son mot sont une
                      seule décision (`PACE_WARN_UP_KG_PER_WEEK` +
                      `PACE_WARNING_LABELS`): les séparer laisse l'un bouger
                      sans l'autre. Elle DIT un fait — « le surplus part surtout
                      en gras » —, elle n'interdit rien: le curseur monte
                      jusqu'à la borne dure. */}
                  {paceControl.warning !== null ? (
                    <p className="mt-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      {PACE_WARNING_LABELS[paceControl.warning][
                        uiLocale() === "fr" ? "fr" : "en"
                      ]}
                    </p>
                  ) : null}
                  {/* ══════════════════════════════════════════════════════
                      LE CRAN ENREGISTRÉ CONTRE LE CRAN CUISINÉ — 2026-09-22
                      ══════════════════════════════════════════════════════

                      ── LE FAIT MESURÉ ─────────────────────────────────────
                      Un homme de 72 kg en prise portait `0,45` en base. Le
                      resserrement du 2026-09-21 (`MAX_WEEKLY_BODY_FRACTION_UP`,
                      0,5 %/semaine) a ramené son plafond à 0,35: le curseur
                      s'affichait DÉJÀ à 0,35 (`paceControlFor` rabat), la base
                      gardait 0,45, et le moteur cuisinait 0,35. Trois nombres,
                      aucun écran pour les relier — c'est-à-dire quelqu'un qui
                      croit avoir réglé 0,45 et qui mange 0,35.

                      ⚠️ ELLE NE PEUT PAS DIRE « TU AS CHOISI CE QUE TU VOIS ».
                      La ligne ne se rend que quand les deux nombres diffèrent
                      À L'AFFICHAGE, et elle disparaît dès qu'on touche le
                      curseur: le cran devient alors celui qu'on vient de poser,
                      et il passe tel quel.

                      ⚠️ TON NEUTRE, PAS AMBRE. Ce n'est ni un risque ni un
                      refus: c'est un écart entre ce qui est écrit et ce qui est
                      exécuté, et le curseur au-dessus montre déjà le second. */}
                  {executedNotice !== null ? (
                    <p className="mt-2 text-xs leading-5 text-ink-soft">
                      {t("household.mouth.pace_executed", {
                        chosen: pace(executedNotice.chosenKgPerWeek),
                        executed: pace(executedNotice.executedKgPerWeek),
                      })}
                    </p>
                  ) : null}
                  {/* ③ — LA SATURATION, ET POURQUOI IL N'Y A PLUS RIEN ICI.
                      Du 2026-08-18 au -08-19, cette place a porté « à partir
                      de ce cran, l'assiette ne change plus » : le moteur
                      rabotait une prise à +10 % de l'entretien pendant que le
                      curseur montait à la borne dure, et 0,20 comme 0,60
                      rendaient la même boîte. L'AFFICHAGE est parti le
                      2026-08-19 (la phrase répétait en trente mots ce que la
                      butée du curseur montrait déjà). Le PLAFOND CACHÉ, lui,
                      est parti le 2026-09-09 : le curseur est le contrat, et
                      un cran réglé ici est exécuté tel quel — en-tête de
                      `weight_pace.ts`. Il n'y a donc plus de cran qui « ne
                      change plus rien », et plus rien à dire à cette place. */}
                  {/* ⚠️ L'HORIZON — IL DONNE UNE DATE DEPUIS LE 2026-09-15.

                      ── CE QUE CETTE PLACE A PORTÉ, DANS L'ORDRE ──────────
                      ① « About 12 weeks at this pace. » — retiré le
                         2026-08-22 (lot `L3`). Mesuré le même jour: l'écart
                         quotidien prescrit vaut 495 kcal/j et notre erreur
                         d'estimation ±580 kcal/j, donc l'écart RÉELLEMENT
                         exécuté vit dans [-85 … 1075] kcal/j — il traverse
                         zéro, et le nombre de semaines réellement possible
                         allait « de 6 à JAMAIS ».
                      ② Sa phrase de remplacement, qui expliquait en trois
                         lignes POURQUOI il n'y avait pas de date — retirée le
                         2026-09-01: un cours de méthode servi à quelqu'un qui
                         pousse un curseur.
                      ③ Le nombre de semaines collé à sa réserve (« le calcul
                         du curseur, pas une date : seule la balance dira le
                         rythme réel ») — du 2026-09-01 au 2026-09-15.
                      ④ LA DATE, à la demande, mot pour mot: « Si tu fais
                         attention à bien coller au plan, le xxx tu seras à ton
                         objectif de XX kilos. C'est mathématique. »

                      ── ⚠️ CE QUI REND LA DATE TENABLE ────────────────────
                      LA MESURE N'A PAS BOUGÉ, et elle est recopiée en entier
                      dans `lib/arrivalHorizon.ts`. Ce qui la tient ici est la
                      CONDITION, pas une réserve: la date est exacte SI le plan
                      est tenu, et la phrase le dit avant de donner le jour.
                      Date, poids visé et condition vivent dans UNE SEULE
                      chaîne (`ARRIVAL_HORIZON_TEMPLATES`), donc aucun rendu ne
                      peut prendre la date sans sa condition, et
                      `arrivalCopyCarriesItsCondition` refuse tout gabarit qui
                      la perdrait.

                      ⛔ ET C'EST TOUJOURS POUR ÇA QUE LE `hint` DU CHAMP
                      AU-DESSUS EST PARTI: il disait « pas le moment où il sera
                      atteint », ce que cette phrase-ci contredit désormais mot
                      pour mot.

                      ⚠️ TON NEUTRE, PAS AMBRE — même règle que la phrase de
                      saturation retirée plus haut. Ce n'est pas un risque,
                      c'est ce que le curseur vient de calculer.

                      ⚠️ LA VOIX EST OBLIGATOIRE ICI. La phrase tutoie, et ce
                      curseur se pousse aussi pour une bouche du foyer: sans
                      `voice`, « tu seras à ton objectif » s'afficherait sous le
                      prénom de quelqu'un d'autre — la cicatrice déjà payée sur
                      cet écran avec « Tu en as coché 4 ».

                      ⚠️ LA PRÉMISSE EST DANS `arrivalHorizonFor`, PAS ICI:
                      cible acceptée, deux poids connus, cran vivant, écart
                      non nul, et un jour d'aujourd'hui lisible. Un `&&` de
                      plus à l'écran serait une seconde prémisse à faire
                      diverger de la première. */}
                  {targetState.kind === "accepted" &&
                      targetState.horizon !== null
                    ? (
                      <p className="mt-2 text-sm leading-5 text-ink-soft">
                        {arrivalHorizonCopy(
                          targetState.horizon,
                          uiLocale() === "fr" ? "fr" : "en",
                          voice,
                          who,
                        )}
                      </p>
                    )
                    : null}
                </Field>
              ) : null}
            </div>
  );
}
