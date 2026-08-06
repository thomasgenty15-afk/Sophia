import { t } from "../i18n/t";
import { type UiLocale } from "../i18n/catalog";
import { setUiLocaleAndReload, uiLocale } from "../i18n/runtime";

/**
 * Le sélecteur de langue de la VITRINE.
 *
 * ── POURQUOI DEUX ÉTIQUETTES ET PAS UN `<select>` ──────────────────────────
 * Deux langues font deux états. Un menu déroulant demande un clic pour révéler
 * ce qu'un bouton montre déjà, et il coûte plus large — or le bloc de droite de
 * l'en-tête fait déjà 275px déconnecté sur un téléphone (voir le long
 * commentaire de `PublicHeader`). « EN | FR » tient dans ~52px.
 *
 * ── POURQUOI LES ÉTIQUETTES NE SE TRADUISENT PAS ──────────────────────────
 * Un sélecteur de langue nomme chaque langue DANS cette langue. C'est aussi
 * pour ça que chaque option porte son propre attribut `lang`: sans lui, un
 * lecteur d'écran en français prononcerait « EN » à la française.
 *
 * ── CE QU'IL NE FAIT PAS ──────────────────────────────────────────────────
 * Il n'apparaît que sur les surfaces publiques. L'app authentifiée est en
 * anglais (frontière déclarée, voir `i18n/catalog.ts`), et y proposer un
 * bouton « FR » promettrait une traduction qui n'existe pas encore.
 */
export function LocaleSwitch() {
  const current = uiLocale();

  const option = (locale: UiLocale, labelKey: "public.locale.en" | "public.locale.fr") => {
    const active = current === locale;
    return (
      <button
        key={locale}
        type="button"
        lang={locale}
        aria-current={active ? "true" : undefined}
        aria-label={locale === "fr"
          ? t("public.locale.switch_to_fr")
          : t("public.locale.switch_to_en")}
        onClick={() => setUiLocaleAndReload(locale)}
        className={[
          "rounded-full px-2 py-1 text-xs font-medium transition-colors",
          active
            ? "bg-gray-900 text-white"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
        ].join(" ")}
      >
        {t(labelKey)}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label={t("public.locale.label")}
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-gray-200 p-0.5"
    >
      {option("en", "public.locale.en")}
      {option("fr", "public.locale.fr")}
    </div>
  );
}
