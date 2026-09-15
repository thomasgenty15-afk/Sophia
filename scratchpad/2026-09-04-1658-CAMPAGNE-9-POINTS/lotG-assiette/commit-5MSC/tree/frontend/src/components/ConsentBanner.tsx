// LE BANDEAU DE CONSENTEMENT PUBLICITAIRE.
//
// ── CE QUI LE REND CONFORME, ET CE N'EST PAS LE TEXTE ─────────────────────
// Trois propriétés de FORME, chacune exigée par la CNIL (délibération
// 2020-091), et chacune facile à casser en le « rendant plus joli »:
//
//   1. DEUX BOUTONS DE MÊME POIDS. Refuser doit coûter le même nombre de clics
//      qu'accepter, et se voir aussi bien. Un « Refuser » en lien gris sous un
//      « Accepter » plein est le motif sanctionné le plus courant.
//   2. AUCUNE CROIX DE FERMETURE. Une croix n'est ni un oui ni un non; la
//      compter comme un oui est précisément ce qui est interdit, et la compter
//      comme un non ferait disparaître la question sans qu'elle soit posée.
//   3. IL NE BLOQUE PAS LA PAGE. Pas de voile modal: la navigation reste
//      possible sans répondre, et ne pas répondre ne vaut PAS acceptation —
//      `consentState()` rend `null`, donc le tag reste muet.
//
// ⚠️ NE LE TRANSFORME PAS EN MODALE POUR « AUGMENTER LE TAUX D'ACCEPTATION ».
// Un consentement arraché par blocage n'en est pas un, et le risque n'est pas
// théorique: c'est une sanction publique.
//
// ── QUAND IL N'EXISTE PAS ─────────────────────────────────────────────────
// Sans `VITE_GOOGLE_ADS_ID`, rien n'est chargé et rien n'est déposé: le
// bandeau ne s'affiche donc pas. Demander la permission de poser un cookie
// qu'on ne pose pas serait une question sans objet.

import { useState } from "react";
import { Link } from "react-router-dom";

import { answerConsent, isAdsConfigured } from "../analytics/googleAds";
import { consentState } from "../analytics/consent";
import { localeHref } from "../keel/i18n/links";
import { t } from "../keel/i18n/t";

export function ConsentBanner() {
  // ⚠️ L'ÉTAT EST LU UNE FOIS AU MONTAGE, PAS À CHAQUE RENDU. Le lire à chaque
  // rendu ferait disparaître le bandeau au clic sans transition et, surtout,
  // rendrait le composant dépendant du stockage à un moment où React peut le
  // rendre deux fois (StrictMode).
  const [answered, setAnswered] = useState(() => consentState() !== null);

  if (answered || !isAdsConfigured()) return null;

  const decide = (choice: "granted" | "denied") => {
    answerConsent(choice);
    setAnswered(true);
  };

  return (
    <div
      // `role="region"` et pas `dialog`: une `dialog` promet un piège de focus
      // et un `Escape` qui ferme, or ce bandeau ne bloque rien et n'a pas de
      // fermeture. Annoncer une modale qui n'en est pas une est pire que de ne
      // rien annoncer.
      role="region"
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper/98 backdrop-blur"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-5 py-4 sm:px-8 sm:py-5">
        <div className="min-w-0">
          <p id="consent-title" className="font-display text-[1.05rem] leading-snug text-ink">
            {t("public.consent.title")}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {t("public.consent.body")}{" "}
            <Link to={localeHref("/legal")} className="underline hover:text-ink">
              {t("public.consent.learn_more")}
            </Link>
          </p>
        </div>
        {/* ⚠️ LES DEUX BOUTONS PARTAGENT `flex-1` SOUS `sm`, ET C'EST LA
            PROPRIÉTÉ QUI COMPTE: à 320px ils font la même largeur, donc la
            même cible. Un « Refuser » plus étroit serait déjà un défaut de
            symétrie. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="flex-1 rounded-full border border-line px-5 py-2.5 text-[15px] font-medium text-ink transition-colors hover:bg-paper-2 sm:flex-none"
          >
            {t("public.consent.refuse")}
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="flex-1 rounded-full border border-fig-700 bg-fig-700 px-5 py-2.5 text-[15px] font-medium text-paper transition-colors hover:bg-fig-800 sm:flex-none"
          >
            {t("public.consent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConsentBanner;
