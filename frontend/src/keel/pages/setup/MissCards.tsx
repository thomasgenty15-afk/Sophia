// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// Ce qui retient une étape: par personne (`BlockersCard`), ou par motif
// (`MissingCard`).
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import { setupMissKey } from "../../copy/setupMisses";
import { Card, SectionLabel } from "../../components/ui/Card";
import type { FunnelMissId, StepBlocker } from "../../api/onboarding";
import { t, type MessageKey } from "../../i18n/t";

/**
 * CE QUI MANQUE, DIT PAR SON MOTIF.
 *
 * Un bouton gris sans explication est la moitié d'un refus — et le motif de D1
 * dit ce que l'absence COÛTE, pas seulement qu'un champ est vide.
 *
 * Le même bloc sert aux deux étapes qui peuvent retenir. Deux rendus, ce serait
 * deux vocabulaires pour un seul verdict: `canGenerateMisses`.
 */
/**
 * CE QUI RETIENT L'ÉTAPE 2, RANGÉ PAR PERSONNE.
 *
 * ⚠️ ELLE REMPLACE UNE LISTE PLATE, et c'est la demande du 2026-08-19: « ça
 * doit signaler précisément chez qui manque quoi ». Avec quatre personnes à
 * table, « il manque une date de naissance » envoyait relire quatre cartes.
 *
 * ⚠️ LE TITULAIRE EST NOMMÉ « toi », pas par son prénom: c'est la voix de tout
 * l'écran depuis le même jour, et lire son propre prénom dans une liste de
 * reproches se lit comme si l'écran parlait de quelqu'un d'autre.
 */
export function BlockersCard({ blockers }: { blockers: readonly StepBlocker[] }) {
  return (
    <Card tone="dashed">
      <SectionLabel>{t("setup.missing.before_next")}</SectionLabel>
      <ul className="mt-2 space-y-3">
        {blockers.map((b) => (
          <li key={b.who ?? "\u0000self"}>
            <span className="block text-sm font-semibold text-ink">
              {b.who === null
                ? t("setup.missing.for_you")
                : b.who.trim() || t("household.mouth.who_fallback")}
            </span>
            <ul className="mt-1 space-y-1">
              {b.missing.map((miss) => (
                <li key={miss} className="text-sm leading-6 text-ink-soft">
                  {t(setupMissKey(miss))}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function MissingCard(
  { missing, title }: {
    missing: readonly FunnelMissId[];
    /**
     * ⚠️ REQUIS, ET C'EST UN DÉFAUT VU À L'ÉCRAN. Le titre était en dur:
     * « avant de pouvoir le construire ». Juste, sur la dernière étape — elle
     * construit. Absurde sur les autres: on lisait « avant de pouvoir le
     * construire — quand tu manges » sous un formulaire qui pose cette
     * question et qui ne construit rien. Une phrase par étape, et le
     * compilateur réclame laquelle.
     */
    title: MessageKey;
  },
) {
  return (
    <Card tone="dashed">
      <SectionLabel>{t(title)}</SectionLabel>
      <ul className="mt-2 space-y-1">
        {missing.map((miss) => (
          <li key={miss} className="text-sm leading-6 text-ink">
            {t(setupMissKey(miss))}
          </li>
        ))}
      </ul>
    </Card>
  );
}
