import { formatPrice } from "../../i18n/format";
import { PRICES } from "../../i18n/prices";
import { t } from "../../i18n/t";

// KEEL UI — L'OFFRE DU FOYER, RENDUE À L'IDENTIQUE SUR CINQ SURFACES.
//
// ── LE DÉFAUT QUE CE FICHIER EXISTE POUR FERMER ────────────────────────────
// Mesuré le 2026-09-01 sur les quatre pages de vente du foyer et sur `/start`,
// à un clic les unes des autres:
//
//   · `/` et `/couples` vendaient l'accès d'une autre personne **2 €**;
//     `/families` le vendait **1,99 €** sous un autre nom (« un accompagnement
//     en option pour un membre du foyer »); `/meal-prep` n'en parlait pas.
//   · « Premier mois offert » n'existait que sur `/families` — et disparaissait
//     sur `/start`, c'est-à-dire au moment précis où il déciderait.
//   · Quatre libellés de bouton pour un seul geste.
//
// Quatre pages, quatre offres. Un acheteur qui compare `/couples` et
// `/families` — un couple avec enfants, le cœur de cible — voyait deux
// produits.
//
// ── POURQUOI PAS DANS `ui/Marketing.tsx` ──────────────────────────────────
// ⚠️ C'EST MESURÉ, PAS UNE PRÉFÉRENCE. `pageSeams.int.test.ts` suit le graphe
// d'imports COMPLET d'une route et refuse qu'une page atteigne un namespace
// qu'elle n'a pas déclaré. `Marketing.tsx` est importé par les quatre pages
// PROFESSIONNELLES aussi (`Kicker`, `SectionTitle`, `PriceCard`): y poser un
// littéral `offer.*` ferait « atteindre » ce namespace à `/pro`, `/coaches`,
// `/gyms` et `/communities`, qui vendent un SIÈGE et pas un foyer. Un fichier
// à part garde leur graphe propre — et la charte §6 continue de dire vrai:
// rien de spécifique à un monde n'entre dans les primitives communes.
//
// ── LES DEUX RÈGLES À NE PAS DÉFAIRE ──────────────────────────────────────
// 1. LES MONTANTS VIENNENT DE `PRICES`, jamais du texte. `formatPrice` donne
//    la convention de la langue de la page (« €12.99 » / « 12,99 € »): c'est
//    ce qui empêche qu'un pack anglais serve une virgule décimale, défaut réel
//    qui traînait encore dans `start.price`.
// 2. LA DURÉE ANNONCÉE EST CELLE QUE LE PRODUIT TIENT. « Première semaine
//    offerte » vaut `HOUSEHOLD_TRIAL_DAYS = 7` (`_shared/billing-tier.ts`),
//    aligné en SQL par `keel_household_trial_days()`. Le jour où ce nombre
//    bouge, `offer.trial` ment sans que rien ne le dise — elle ne porte pas le
//    chiffre, elle porte le MOT « semaine ».

/**
 * Les lignes de l'offre, dans cet ordre: ce qu'on paie · ce qui est offert ·
 * ce qu'on ne signe pas. Sur les pages de foyer, le prix d'un accès personnel
 * supplémentaire s'insère après le prix principal; il n'apparaît pas en solo.
 *
 * L'ordre est un argument. Le prix d'abord parce que le cacher le rend
 * suspect; l'offert en TROISIÈME et pas en premier parce qu'une gratuité mise
 * en tête se lit comme l'appât d'un produit qu'on n'ose pas vendre.
 *
 * `className` sert à poser la marge du contexte, jamais à retoucher la
 * typographie: un bloc d'offre qui change de taille d'une page à l'autre
 * redevient quatre offres qui se ressemblent.
 */
export function OfferLines({
  className = "",
  audience = "household",
}: {
  className?: string;
  audience?: "household" | "solo";
}) {
  const solo = audience === "solo";
  return (
    <ul className={`max-w-[52ch] space-y-1 ${className}`}>
      <li className="text-[15px] font-medium leading-6 text-ink">
        {t(solo ? "offer.solo" : "offer.household", { amount: formatPrice(PRICES.household) })}
      </li>
      {!solo && (
        <li className="text-[15px] leading-6 text-ink-soft">
          {t("offer.extra", { amount: formatPrice(PRICES.claimedProfile) })}
        </li>
      )}
      <li className="text-[15px] leading-6 text-ink-soft">{t("offer.trial")}</li>
      <li className="text-[15px] leading-6 text-ink-soft">{t("offer.no_commitment")}</li>
    </ul>
  );
}

export default OfferLines;
