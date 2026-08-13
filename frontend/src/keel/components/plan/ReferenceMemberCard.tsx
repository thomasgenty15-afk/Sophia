/**
 * QUELLE FAÇON DE MANGER LE PLAT COMMUN SUIT — FF-043, déménagée et gardée.
 *
 * ── LA PLAINTE, MOT POUR MOT ──────────────────────────────────────────────
 * « "Quelle façon de manger le plat commun suit" — je comprends pas ce qu'elle
 * fait là cette section. »
 *
 * Elle était posée sur la page du foyer, HORS de tout contexte de plan, et son
 * libellé ne disait pas pourquoi on la posait maintenant. Deux corrections,
 * et il faut les deux:
 *
 *   1. ELLE DÉMÉNAGE dans la demande de plan, au-dessus du formulaire. C'est
 *      une ENTRÉE de la composition, pas un réglage de foyer: la lire après le
 *      bouton, c'est la lire trop tard.
 *   2. SON LIBELLÉ NOMME LES DEUX PERSONNES qui s'opposent, quand on les
 *      connaît (`plan.reference.title_pair`). « Quelle façon de manger le plat
 *      commun suit » est une question sans sujet tant qu'on ne sait pas de qui
 *      on parle.
 *
 * ⚠️ ET ELLE NE NOMME JAMAIS UN OBJECTIF. « Christèle veut perdre du poids »
 * est un verdict lu par toute la table. Une DIRECTION DE SERVICE se lit à voix
 * haute sans blesser; le motif qui la produit, non. C'est toute la discipline
 * de FF-043, et elle tient ici comme ailleurs.
 *
 * ── LA GARDE DE VACUITÉ, ET CE QU'ELLE NE RÈGLE PAS ───────────────────────
 * La garde d'origine comptait des ADULTES: deux adultes suffisaient à afficher
 * la carte, même s'ils portaient la même façon de manger — un arbitrage entre
 * une chose et elle-même. On compte maintenant des DIRECTIONS DISTINCTES.
 *
 * ⚠️ MAIS ELLE NE RÉPOND PAS À LA PLAINTE, ET IL FAUT LE SAVOIR. Dans le foyer
 * qui l'a formulée, les deux directions DIVERGENT réellement: la carte est
 * légitime et elle s'affiche toujours. Ce qui répond à la plainte, c'est le
 * déménagement et le libellé. La garde ferme un défaut VOISIN — la carte qui
 * s'affiche sans sujet — et il fallait fermer les deux.
 *
 * ⚠️ LA COMPARAISON PORTE SUR LES CHAÎNES, PAS SUR LES JETONS, et elle vit
 * dans le module qui porte les chaînes (`distinctServingDirections`).
 * `NEUTRAL_DIRECTION` est EXACTEMENT `SERVING_DIRECTION.maintenance`: un foyer
 * `{maintenance, aucun objectif}` a deux jetons et UNE direction.
 *
 * ── POURQUOI CETTE GARDE NE DIVULGUE RIEN ─────────────────────────────────
 * FF-043 R3 interdit un référent DÉRIVÉ d'une métrique ou d'un ordre
 * d'objectifs, parce que « connaître le référent reviendrait à connaître
 * l'objectif le plus bas de la maison ». Une garde fondée sur les objectifs
 * fait de la PRÉSENCE de la carte un signal.
 *
 * Elle est sûre ici pour une raison précise: LA CARTE EST `isOwner`-ONLY. C'est
 * le maître qui a saisi les objectifs de chaque bouche; il n'apprend rien qu'il
 * n'ait écrit. Aucun secondaire, aucun mineur ne la voit — ni avant ni après ce
 * lot. ⚠️ SI UN LOT FUTUR REND CETTE CARTE À QUELQU'UN D'AUTRE, LA GARDE DE
 * VACUITÉ DOIT TOMBER AVEC.
 */

import React from "react";

import type { HouseholdView } from "../../api/household";
import { distinctServingDirections } from "../../api/servingDivergence";
import { Card, SectionLabel } from "../ui/Card";
import { inputClass } from "../ui/Field";
import { t } from "../../i18n/t";

export interface ReferenceMemberCardProps {
  /** Le foyer. `null` = pas lu, ou pas de foyer: la carte se tait. */
  household: HouseholdView | null;
  /** Suis-je le maître ? REQUIS. `false` est une affirmation, pas un défaut. */
  isOwner: boolean;
  busy: boolean;
  onPick: (memberId: string | null) => Promise<boolean>;
}

export default function ReferenceMemberCard(
  { household, isOwner, busy, onPick }: ReferenceMemberCardProps,
) {
  const [saved, setSaved] = React.useState(false);

  // ⚠️ LES ADULTES SEULS. `CHILD_DIRECTION` est une TAILLE, pas une
  // orientation: un mineur ne gouverne rien et ne peut pas gagner un arbitrage
  // (« un mineur n'est jamais référent »). Un âge INCONNU est hors du compte
  // aussi — `goalApplies` rend déjà `false` pour lui, donc le compter ferait
  // d'une ignorance une position.
  const eligible = (household?.members ?? []).filter(
    (m) => m.ageState === "adult",
  );
  // SANS DEUX DIRECTIONS, PAS D'ARBITRAGE — et pas de phrase qui explique
  // l'absence non plus. Une carte qui dit « il n'y a rien à trancher ici »
  // apprend à lire les autres cartes comme du bruit.
  if (!isOwner || distinctServingDirections(eligible).length < 2) return null;

  // LES DEUX PREMIERS ADULTES, DANS L'ORDRE DU ROSTER. Le titre nomme deux
  // personnes parce que deux suffisent à dire de quoi il s'agit; au-delà, la
  // liste ci-dessous porte le reste.
  const [first, second] = eligible;

  return (
    <Card>
      <SectionLabel>
        {first && second
          ? t("plan.reference.title_pair", {
            first: first.displayName,
            second: second.displayName,
          })
          : t("plan.reference.title")}
      </SectionLabel>
      <p className="mb-2 text-xs text-ink-soft">{t("plan.reference.hint")}</p>
      <select
        // `inputClass` DU KIT, ET PAS UNE CLASSE RECOPIÉE. Celle d'avant portait
        // `text-sm` — 14 px — donc Safari iOS ZOOMAIT à l'ouverture du menu et
        // ne dézoomait pas en sortant. `inputClass` fait `text-base lg:text-sm`,
        // et porte `min-w-0`, sans quoi un enfant flex déborde toute la page à
        // 320 px.
        className={inputClass}
        disabled={busy}
        value={household?.referenceMemberId ?? ""}
        onChange={async (e) => {
          setSaved(false);
          const ok = await onPick(e.target.value || null);
          if (ok) setSaved(true);
        }}
      >
        <option value="">{t("plan.reference.default")}</option>
        {eligible.map((m) => (
          // LE LIBELLÉ EST UN PRÉNOM, ET RIEN D'AUTRE. Pas d'objectif à côté,
          // pas de badge « au régime »: la liste est lue par qui ouvre l'écran.
          <option key={m.memberId} value={m.memberId}>{m.displayName}</option>
        ))}
      </select>
      {saved ? (
        <p className="mt-2 text-xs text-emerald-700">{t("plan.reference.saved")}</p>
      ) : null}
    </Card>
  );
}
