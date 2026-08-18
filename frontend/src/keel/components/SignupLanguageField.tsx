// KEEL — LA QUESTION QUE LES PORTES POSENT, MAINTENANT QU'ELLES NE DEMANDENT
// PLUS LE PAYS.
//
// ── CE QUE CE CHAMP REMPLACE ───────────────────────────────────────────────
// Les trois formulaires d'inscription demandaient « Où vous vivez », sous une
// aide qui disait: « sert à vous donner le bon numéro d'urgence si une
// conversation en a besoin un jour ». C'était honnête, et c'est exactement
// pourquoi la question est partie: le routage du numéro d'urgence n'est pas un
// sujet du produit aujourd'hui, et une porte d'inscription se juge au nombre de
// questions qu'elle pose. Le pays se DÉDUIT désormais du fuseau horaire, que le
// formulaire envoyait déjà (`api/countryFromTimezone.ts`).
//
// La langue, elle, mérite la question: depuis que `profiles.locale` est câblé,
// elle décide de la langue dans laquelle l'agent répond à CHAQUE tour, de celle
// du plan de repas généré, et de celle des e-mails. C'est la seule réponse de
// ce formulaire qui change quelque chose tous les jours.
//
// ── POURQUOI IL NE RECHARGE PAS, ALORS QUE LE DRAPEAU LE FAIT ─────────────
// Le drapeau de l'en-tête change la langue de la PAGE, et pour ça il recharge
// (plusieurs constantes de module appellent `t()` à l'import). Le faire ici
// DÉTRUIRAIT le formulaire en cours de saisie — un contrôle qui efface le nom
// et le mot de passe qu'on vient de taper est un contrôle qu'on ne touche plus.
//
// Conséquence assumée: le champ et le drapeau peuvent diverger. Quelqu'un qui
// lit la page en français peut vouloir être coaché en anglais, et c'est un
// besoin réel. Le champ NAÎT sur `chosenUiLocale()`, donc les deux s'accordent
// tant que personne ne les sépare exprès.

import { type UiLocale } from "../i18n/catalog";
import { t, type MessageKey } from "../i18n/t";

export interface SignupLanguageFieldProps {
  value: UiLocale;
  onChange: (next: UiLocale) => void;
  /**
   * L'intitulé et l'aide viennent du namespace de la PORTE, pas d'un namespace
   * partagé: chaque écran a sa voix, et une clé partagée entre trois pages est
   * une clé qu'aucune des trois ne peut réécrire sans casser les deux autres.
   */
  labelKey: MessageKey;
  hintKey: MessageKey;
  id: string;
  className?: string;
}

export function SignupLanguageField(props: SignupLanguageFieldProps) {
  return (
    <div>
      <label
        htmlFor={props.id}
        className="block text-sm font-medium text-gray-900"
      >
        {t(props.labelKey)}
      </label>
      <select
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value === "fr" ? "fr" : "en")}
        className={props.className ??
          "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"}
      >
        {/*
          Chaque langue est nommée DANS sa langue — « English », « Français » —
          et chaque option porte son `lang`: sans lui, un lecteur d'écran
          français prononce « English » à la française.

          ⚠️ `public.language.*` ET SURTOUT PAS `public.locale.*`. Les seconds
          valent « EN » et « FR »: c'est le libellé de la PASTILLE du drapeau,
          lisible parce qu'elle est deux boutons côte à côte. Dans une liste
          déroulante, « EN » seul est un code, pas une réponse à « quelle
          langue ? ». Mesuré à l'écran, pas dans un test.
        */}
        <option value="en" lang="en">{t("public.language.en")}</option>
        <option value="fr" lang="fr">{t("public.language.fr")}</option>
      </select>
      <p className="mt-1 text-xs text-gray-500">{t(props.hintKey)}</p>
    </div>
  );
}
