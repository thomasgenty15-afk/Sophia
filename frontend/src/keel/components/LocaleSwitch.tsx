import { t } from "../i18n/t";
import { type UiLocale } from "../i18n/catalog";
import { chosenUiLocale } from "../i18n/runtime";
import { chooseUiLanguage } from "../api/uiLanguage";

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
 * ── OÙ IL APPARAÎT, ET CE QUE ÇA IMPLIQUE ─────────────────────────────────
 * ⚠️ CE PARAGRAPHE A ÉTÉ RÉÉCRIT LE 2026-08-13. Il affirmait que « l'app
 * authentifiée est encore anglaise (frontière déclarée) » et que proposer
 * « FR » au-delà des surfaces publiques « promettrait une traduction qui
 * n'existe pas encore ». C'EST PÉRIMÉ: le produit connecté est bilingue depuis
 * ce jour-là — les paquets sont `en.ts` et `fr.ts`, et la frontière de
 * `i18n/catalog.ts` ne compte plus que quelques écrans. Laisser la phrase
 * ferait « réparer » ce bouton par le prochain lecteur, qui le retirerait de
 * l'app pour respecter une frontière qui n'existe plus.
 *
 * Ses trois sites d'appel: `PublicHeader` (les huit pages publiques), `Auth`,
 * et `SetupPage` — et cette dernière est AUTHENTIFIÉE. C'est pour ça que le
 * clic passe par `chooseUiLanguage` et non par `setUiLocaleAndReload`:
 * quand une session existe, la langue doit être écrite sur le COMPTE, sinon
 * l'interface bascule et l'agent continue de répondre dans l'autre langue —
 * et, pire, la réconciliation d'`AuthProvider` annulerait le clic au
 * rechargement suivant.
 */
export function LocaleSwitch() {
  // ── LE CHOIX DU VISITEUR, PAS LA LANGUE DE LA PAGE ────────────────────────
  // Les deux diffèrent sur une page dont le namespace n'est pas encore traduit:
  // elle se rend entièrement en anglais (voir `uiLocaleForPath`) alors que le
  // choix enregistré peut être le français. Marquer « EN » actif là-dessus
  // effacerait le choix aux yeux du visiteur, et son clic sur « FR » — qui
  // marche, et vaut pour toutes les autres pages — ressemblerait à un bouton
  // mort. Ce bouton dit ce qu'il a enregistré; la page dit ce qu'elle sait
  // afficher.
  const current = chosenUiLocale();

  const option = (locale: UiLocale, labelKey: "public.locale.en" | "public.locale.fr") => {
    const active = current === locale;
    return (
      // ⚠️ `aria-pressed` ET PAS `aria-current`. `aria-current` dit « c'est
      // l'élément COURANT d'un ensemble de navigation » — une page, une étape
      // d'un fil. Ceci est une BASCULE à deux états. L'en-tête public employait
      // les deux formes sur un même écran (`page` sur la sous-nav, `true` ici),
      // ce qui fait dire à un lecteur d'écran « courant » de deux choses qui ne
      // sont pas de même nature.
      <button
        key={locale}
        type="button"
        lang={locale}
        aria-pressed={active}
        aria-label={locale === "fr"
          ? t("public.locale.switch_to_fr")
          : t("public.locale.switch_to_en")}
        onClick={() => { void chooseUiLanguage(locale); }}
        className={[
          "rounded-full px-2 py-1 text-xs font-medium transition-colors",
          // ── LA LANGUE COURANTE PREND LA MARQUE, ET C'EST LA RÈGLE ────────
          // « La teinte de marque marque la NAVIGATION et l'ACTION; les
          // couleurs d'état marquent les FAITS. » Choisir sa langue est une
          // NAVIGATION — c'est même le seul contrôle qui survit dans le
          // couloir d'entrée. La figue y a donc sa place, et l'aplat plein est
          // le rendu que la maison donne à un choix courant sur un contrôle
          // (voir `MealPrepPage.tsx:325`, la même forme sur une page publique).
          // ⚠️ CE N'EST PAS UNE PASTILLE D'ÉTAT: la garde du chantier — « la
          // figue n'entre jamais dans une pastille » — vise `ui/Badge.tsx`, un
          // fait rendu. Ici le rond est un BOUTON, il agit au clic.
          // `paper` sur `fig-700` = 9,98:1. C'était `bg-gray-900 text-white`,
          // un aplat froid sans température, le seul neutre que la charte refuse.
          active
            ? "bg-fig-700 text-paper"
            // La langue non retenue reste lisible sans se faire passer pour
            // active: `ink-soft` sur `paper` = 6,11:1 (seuil 4,5), et son
            // survol emprunte le lavis `fig-50` (`ink` dessus = 15,39:1).
            : "text-ink-soft hover:bg-fig-50 hover:text-ink",
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
      // `line-strong` (3,84:1) et jamais `line` (1,30:1): le cerne dessine les
      // limites d'un GROUPE DE CONTRÔLES, et WCAG 1.4.11 exige 3:1 pour un
      // composant d'interface. Même trait que la pastille de `KeelAppShell`.
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-line-strong p-0.5"
    >
      {option("en", "public.locale.en")}
      {option("fr", "public.locale.fr")}
    </div>
  );
}
