// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// Le chrome de l'entrée, sans navigation.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import React from "react";
import { LocaleSwitch } from "../../components/LocaleSwitch";
import { BrandMark } from "../../components/BrandMark";
import { t } from "../../i18n/t";

/**
 * LE CHROME DE L'ENTRÉE — ET IL N'A PAS DE NAVIGATION.
 *
 * ── POURQUOI PAS `KeelAppShell` ────────────────────────────────────────────
 * Elle rend les huit onglets de l'app élève et la barre du bas sur téléphone.
 * Sur cet écran-là, chacun est une porte vers un écran VIDE: quelqu'un qui n'a
 * pas encore de plan n'a rien à voir sur `/app/today`, `/app/plan` ou
 * `/app/progress`. Mesuré en vrai: on quitte l'entrée par curiosité, on tombe
 * sur du vide, et on juge le produit là-dessus.
 *
 * ── LA MARQUE N'EST PAS UN LIEN ────────────────────────────────────────────
 * Partout ailleurs le mot-symbole ramène à l'accueil. Ici il ne ramène nulle
 * part: c'est le dernier lien qui restait, et un couloir avec une porte est un
 * couloir qu'on quitte.
 *
 * ── CE QUI RESTE CLIQUABLE, ET C'EST DÉLIBÉRÉ ──────────────────────────────
 * Le sélecteur de langue. Il ne fait pas sortir (il recharge la même page), et
 * quelqu'un qui ne lit pas l'anglais doit pouvoir répondre à des questions dont
 * dépend ce qu'il va manger. La vraie sortie — se déconnecter — reste
 * disponible sur `/account`, et elle ne s'atteint pas par accident.
 */
export function FunnelShell({ children }: { children: React.ReactNode }) {
  return (
    // ── LE FOND EST `paper`, ET C'ÉTAIT `bg-white`: UN DÉFAUT MESURÉ ───────
    // Le blanc pur est le seul neutre que la charte refuse (aucune
    // température). Sous les cartes du kit, qui sont en `paper` (#FBF8FA), il
    // inversait le rapport: mesuré au navigateur le 2026-08-13, l'INTÉRIEUR
    // des cartes était plus chaud que la page qui les portait, donc chaque
    // carte se lisait comme un creux et non comme une pièce posée.
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4">
          {/* LE SYMBOLE SUR LE MOT-SYMBOLE, comme dans `PublicHeader`.
              `text-lg` = 18px, sous le plancher de 20px que la charte §3 pose
              pour Young Serif: c'est la valeur de `PublicHeader`, et l'app la
              suit plutôt que de gagner 2px de pureté sur la couture qu'on
              cherche justement à effacer. */}
          {/* ── LE SYMBOLE DE LA MARQUE, ET PLUS L'ÉQUERRE ───────────────
                Le logo (`BrandMark`) prend la place que tenait `.eq`. Deux
                signatures collées au même mot en feraient une de trop, et
                c'est le logo qui gagne: l'équerre garde son rôle d'ouverture
                de SECTION (charte §4), elle ne fait plus office de marque.
                ⚠️ ET ÇA RÈGLE LE PIÈGE DU `padding-left`: `.eq` posait son
                retrait hors de toute couche CSS, donc il battait un
                utilitaire de même spécificité. Un `flex` + `gap` n'a pas ce
                défaut — les avertissements « pas de `px-*` sur ce nœud »
                tombent avec lui. */}
          <span className="flex shrink-0 items-center gap-1.5 font-display text-lg leading-none text-ink">
            <BrandMark className="h-6 w-6 shrink-0 text-fig-700" />
            {t("brand.wordmark")}
          </span>
          <LocaleSwitch />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {/* LE MÊME `h1` QUE LE KIT, ET C'EST LE POINT: `font-display text-title`
            est ce que rend `ui/Page.tsx#PageHeader` sur les seize écrans, et ce
            que rendent `/start` et `/auth`. Cet écran-ci ne peut pas employer
            `PageHeader` — il n'a ni la coque ni la nav de l'app — mais le
            premier écran du produit ne doit pas être le seul dont le titre
            n'est pas de la maison.
            ⛔ AUCUNE GRAISSE ICI (c'était `text-2xl font-semibold`): Young Serif
            n'a qu'une graisse, le navigateur la simulerait en épaississant les
            contours. La hiérarchie se fait à la taille et à l'espace. */}
        <h1 className="text-balance font-display text-title text-ink">{t("setup.title")}</h1>
        <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-ink-soft">
          {t("setup.subtitle")}
        </p>
        {/* LE TRAIT QUI FERME LE BLOC D'IDENTITÉ. La direction est « la fiche
            technique » (charte §1): une fiche a une tête — qui elle concerne —
            puis un trait, puis ses champs. Le compte d'étapes se lit juste en
            dessous, au cran `text-label`, comme la référence d'un document. */}
        <div className="mt-8 border-t border-line pt-8">{children}</div>
      </main>
    </div>
  );
}
