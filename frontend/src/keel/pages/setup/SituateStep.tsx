// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// L'étape 1: seul ou à plusieurs.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import { Button } from "../../components/ui/Button";
import { Card, SectionLabel } from "../../components/ui/Card";
import { branchForMouths, type FunnelBranch } from "../../api/onboarding";
import { t } from "../../i18n/t";

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 1
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ EXPORTÉ POUR ÊTRE RENDU, pas pour être réutilisé ailleurs — même raison
 * que `MouthsStep`: `SetupPage` entier ne se monte pas sous
 * `renderToStaticMarkup`, et ce qui doit être prouvé ici est ce que la tuile
 * « Juste moi » DIT et FAIT selon qu'il reste ou non quelqu'un à table. Voir
 * `pages/setupSituateStep.int.test.ts`.
 */
export function SituateStep({
  current,
  hasHousehold,
  hasOtherMouths,
  isOwner,
  busy,
  onChoose,
  dissolve,
}: {
  current: number | null;
  hasHousehold: boolean;
  /**
   * RESTE-T-IL QUELQU'UN D'AUTRE À TABLE ? REQUIS — jamais optionnel: c'est
   * cette réponse-là qui décide si « Juste moi » est un choix ou une
   * destruction, et un paramètre de garde facultatif est une garde désarmée.
   */
  hasOtherMouths: boolean;
  isOwner: boolean;
  busy: boolean;
  onChoose: (mouths: number) => void;
  /** La défaite du foyer, armée ou non. REQUIS, même raison. */
  dissolve: { armed: boolean; onConfirm: () => void; onCancel: () => void };
}) {
  // UN SECONDAIRE N'A PAS CETTE QUESTION À RÉPONDRE. Quelqu'un d'autre gouverne
  // la table, et lui proposer trois cartes serait promettre un geste que la
  // base refusera (`not_owner`). On dit l'état, on ne demande rien.
  if (!isOwner) {
    return (
      <Card>
        <SectionLabel>{t("setup.situate.title")}</SectionLabel>
        <p className="mt-2 text-sm text-ink-soft">{t("setup.situate.member")}</p>
      </Card>
    );
  }
  const branch = branchForMouths(current);
  const options: Array<{ mouths: number; key: FunnelBranch; title: string; hint: string }> = [
    { mouths: 1, key: "solo", title: t("setup.situate.solo"), hint: t("setup.situate.solo_hint") },
    { mouths: 2, key: "pair", title: t("setup.situate.pair"), hint: t("setup.situate.pair_hint") },
    { mouths: 3, key: "family", title: t("setup.situate.family"), hint: t("setup.situate.family_hint") },
  ];
  return (
    <Card>
      <SectionLabel>{t("setup.situate.title")}</SectionLabel>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          // ── ⚠️ « JUSTE MOI » NE SE DÉSARME PLUS QUE S'IL RESTE QUELQU'UN ──
          //
          // Cette ligne disait `option.mouths === 1 && hasHousehold`, et son
          // commentaire justifiait le verrou ainsi: « cet écran ne supprime pas
          // un foyer — ce serait effacer des bouches, leurs allergies et leurs
          // portions sur un clic d'entonnoir. Le geste existe, il vit sur
          // /app/household, où il porte son avertissement. »
          //
          // ⛔ LA SECONDE PHRASE ÉTAIT FAUSSE, ET C'EST ELLE QUI A FAIT LE MUR.
          // `/app/household` ne sait retirer que des MEMBRES;
          // `keel_household_remove_member` refuse le maître
          // (`cannot_remove_owner`); rien nulle part ne défaisait un foyer.
          // Répondre « on est deux » à cette question était donc irréversible
          // dans tout le produit — et l'étape 2 retient ensuite sur
          // `missing_mouths`. Signalé sur un compte réel le 2026-08-19:
          // « je ne peux même pas la retirer et faire continuer ».
          //
          // La PREMIÈRE phrase, elle, est juste — et elle porte exactement sa
          // condition: on efface des bouches QUAND IL Y EN A. Le verrou tient
          // donc tant qu'il en reste une, et il le DIT sous la grille; quand le
          // maître est seul, il n'y a plus rien à effacer que sa propre ligne,
          // et le geste s'ouvre derrière une confirmation qui la nomme.
          const locked = option.mouths === 1 && hasHousehold && hasOtherMouths;
          const chosen = branch === option.key;
          return (
            <button
              key={option.key}
              type="button"
              disabled={busy || locked}
              // LE CHOIX COURANT EST DIT AUTREMENT QUE PAR LA COULEUR. Sans
              // ceci, « laquelle des trois est la mienne » ne passait que par
              // une bordure teintée: invisible à un lecteur d'écran, et seule
              // porteuse de l'information au sens de WCAG 1.4.1.
              aria-pressed={chosen}
              onClick={() => onChoose(option.mouths)}
              className={[
                // `rounded-card` (12px) et pas `rounded-xl`: le rayon RENDU est
                // le même, il porte enfin son nom — le vocabulaire du kit est
                // `part` (4px) · `card` (12px) · `fiche` (16px) · `full`
                // (boutons et pastilles), et rien d'autre.
                "rounded-card border p-4 text-left transition-colors",
                // ── POURQUOI LE LAVIS ET PAS L'APLAT DE MARQUE ──────────────
                // Une pastille choisie prend l'aplat plein (`bg-fig-700`), et
                // c'est l'idiome de la maison — voir `MealPrepPage.tsx:325`.
                // Ici la surface est une TUILE de 200px: un aplat de marque à
                // cette taille devient le bloc dominant de l'écran, et il
                // faudrait remonter le sous-titre à `fig-300` pour qu'il se
                // lise. `fig-100` est le lavis, « un remplissage qui doit se
                // lire PLEIN » (charte §5), fermé par un trait `fig-700`:
                // `ink` dessus = 13,42:1, `ink-soft` = 5,07:1.
                chosen
                  ? "border-fig-700 bg-fig-100"
                  // Le non-choisi est le geste secondaire du kit, et c'est mot
                  // pour mot la grande commande de `/auth` (`Auth.tsx:1340`) —
                  // la porte que le visiteur vient de franchir: un contour de
                  // CONTRÔLE (`line-strong`, 3,84:1 — WCAG 1.4.11 exige 3:1)
                  // sur le même papier que tout le reste. Le survol emprunte le
                  // lavis clair `fig-50`, donc il ne peut pas se confondre avec
                  // le lavis plein `fig-100` du choix retenu.
                  : "border-line-strong bg-paper",
                locked ? "cursor-not-allowed opacity-50" : "hover:bg-fig-50",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-ink">
                {option.title}
              </span>
              {/* `min-w-0` n'est pas nécessaire ici (pas de flex), mais le texte
                  doit se replier à 320 px: pas de `whitespace-nowrap`. */}
              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── UN REFUS QUI NE DIT PAS CE QUI LE LÈVERAIT N'EST PAS UN REFUS ────
          La tuile grisée ne portait RIEN: ni pourquoi, ni par où. C'est le mot
          d'ordre du dépôt, et c'était le seul endroit de l'entonnoir où il
          était violé sur un chemin sans issue. */}
      {hasHousehold && hasOtherMouths ? (
        <p className="mt-4 text-xs leading-5 text-ink-soft">
          {t("setup.situate.solo_locked")}
        </p>
      ) : null}

      {/* LA DÉFAITE DU FOYER, EN DEUX CLICS ET AVEC SA LISTE. Même idiome que
          « Retirer » sur une bouche: un clic arme, le second exécute, et le
          libellé change entre les deux. Ce qui part est NOMMÉ — la ligne de
          bouche du maître et ce qui y est clé —, et ce qui reste aussi: son
          profil et sa direction ne bougent pas, c'est ce qui rend le retour au
          solo non destructeur pour la personne elle-même. */}
      {dissolve.armed ? (
        <div className="mt-4 rounded-card border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs leading-5 text-amber-900">
            {t("setup.situate.dissolve_confirm")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={dissolve.onConfirm}
            >
              {t("setup.situate.dissolve_do")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={dissolve.onCancel}
            >
              {t("setup.situate.dissolve_cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
