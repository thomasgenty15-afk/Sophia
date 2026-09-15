// KEEL — LE POINT HEBDOMADAIRE, dans l'app.
//
// ── CE QUI REMPLACE QUOI ─────────────────────────────────────────────────────
// C'était un WhatsApp Flow : deux écrans déclarés chez Meta, un `flow_id` à
// configurer, un template de repli hors fenêtre 24 h, et un `flow_token` qui
// faisait l'aller-retour par le client de l'élève. Tout ça disparaît. Reste ce
// qui comptait : six axes 1-5, puis deux mesures entièrement facultatives.
//
// ── LE JETON NE PORTE QUE LA SEMAINE ─────────────────────────────────────────
// Règle héritée, et non négociable : `token` dit QUELLE SEMAINE, jamais QUI.
// L'élève est identifié par son JWT côté serveur. Un jeton qui porterait un
// identifiant serait un identifiant modifiable désignant la ligne à écrire.
//
// ── HORS BORNES = REFUSÉ ET NOMMÉ, jamais ramené au bord ─────────────────────
// Un 500 kg ramené à 400 produit une donnée fausse qui a l'air vraie. Le
// serveur applique déjà cette règle (`readMeasure`) ; l'écran la reflète pour
// que l'élève voie son erreur au lieu de la subir en silence.
//
// ── R4 — LES SIX AXES NE SE COLLECTENT QUE LÀ OÙ QUELQU'UN LES LIT ───────────
// « On ne collecte une donnée que si quelque chose en aval la consomme — le
// plan, une ceinture de sécurité, ou le coach. » (`docs/fonctionnalites/
// conversation/README.md`, direction du 2026-08-08.)
//
// Les six axes n'ont qu'UN lecteur: la synthèse de cohorte du coach. Le plan ne
// les lit pas, aucune ceinture ne les lit. En B2C personne ne les lit — et le
// coach « maison » ne compte pas: la méthode maison n'a pas de synthèse, il n'y
// a personne pour ouvrir la page du lundi. D'où `showAxes`, résolu par
// `my_biofeedback_has_reader()`.
//
// LE POIDS ET LE TOUR DE TAILLE RESTENT POUR TOUS. Leurs lecteurs
// (`/app/progress`, la ceinture restrictive, FF-008) ne dépendent pas du coach.
// Un dimanche poids-seul est donc le cas NOMINAL en B2C, pas un état partiel —
// c'est ce qui rend le défaut ci-dessous grave.
//
// ⚠️ CE QUI A DÛ CHANGER AVEC, ET C'ÉTAIT LE VRAI DÉFAUT. La garde de vacuité
// ne comptait QUE les axes: `Object.keys(values).length === 0` sur un objet qui
// ne contenait que des scores. Cacher les axes sans y toucher rendait le
// formulaire IMPOSSIBLE à soumettre — un élève B2C aurait tapé son poids et reçu
// « Give at least one of the six a score » sur un écran qui n'en propose aucun.
// Le retrait aurait cassé la boucle du poids, c'est-à-dire la seule chose que ce
// point hebdo garde en B2C. La garde compte donc maintenant TOUTE valeur.
//
// ── LA VISIBILITÉ EST UNE GATE DE MONTAGE, PAS UN AFFICHAGE CONDITIONNEL ─────
// `showAxes === null` = « on ne sait pas encore » et le formulaire NE SE MONTE
// PAS. Afficher les six axes puis les retirer une fois la réponse arrivée
// donnerait le pire des deux: l'élève voit une question qu'on a décidé de ne pas
// poser, et la voit disparaître sous ses doigts.

import React from "react";
import { Button } from "./ui/Button";
import { inputClass } from "./ui/Field";
import {
  buildWeeklySubmission,
  WEEKLY_AXES,
  weeklyAxisLabel,
  weeklyScaleLabel,
  WEEKLY_SCALE_VALUES,
  type WeeklyAxis,
  type WeeklySubmissionError,
} from "../api/weeklyCheckIn";
import { t } from "../i18n/t";

export type WeeklyCheckInValues = Record<string, number>;

export function WeeklyCheckInDialog({
  onSubmit,
  onCancel,
  busy,
  showAxes,
}: {
  onSubmit: (values: WeeklyCheckInValues) => void;
  onCancel: () => void;
  busy?: boolean;
  /**
   * Les six axes se demandent-ils ? `null` = pas encore su, et le formulaire ne
   * se monte pas — voir la gate de montage dans l'en-tête. Requis et non
   * optionnel: un défaut ferait décider l'absence de la prop à la place de
   * l'appelant, et c'est la classe de défaut la plus fréquente de ce dépôt
   * (`optional-gate-params-are-disarmed-gates`).
   */
  showAxes: boolean | null;
}) {
  const [scores, setScores] = React.useState<Partial<Record<WeeklyAxis, number>>>({});
  const [weight, setWeight] = React.useState("");
  const [waist, setWaist] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  /**
   * L'erreur, traduite. La DÉCISION vit dans `buildWeeklySubmission`
   * (`api/weeklyCheckIn.ts`), pure et donc testable sans DOM — ce dépôt n'a pas
   * de jsdom, et la règle de vacuité est précisément celle que R4 a dû corriger.
   * Ici il ne reste que la mise en mots.
   */
  const messageFor = (error: WeeklySubmissionError): string => {
    const label = error.kind === "empty"
      ? ""
      : t(error.field === "weight" ? "chat.weekly.weight" : "chat.weekly.waist");
    switch (error.kind) {
      case "not_a_number":
        return t("chat.weekly.error.number", { field: label });
      case "out_of_range":
        return t("chat.weekly.error.range", {
          field: label,
          min: String(error.min),
          max: String(error.max),
        });
      case "empty":
        return error.axesShown
          ? t("chat.weekly.error.empty")
          : t("chat.weekly.error.empty.measures");
    }
  };

  const submit = (event: React.FormEvent) => {
    // `preventDefault` en PREMIER, avant toute condition de sortie: un `return`
    // placé avant ferait partir le formulaire en soumission native, donc
    // rechargerait la page et perdrait la saisie sans rien dire. Défaut mesuré
    // sur la bulle, corrigé là-bas, évité ici.
    event.preventDefault();
    setError(null);

    const built = buildWeeklySubmission({
      // `showAxes === null` ne se rend pas (gate de montage plus bas), donc ce
      // cas n'atteint jamais la soumission. `=== true` plutôt qu'un truthy pour
      // que ça reste vrai si le type s'élargit un jour.
      showAxes: showAxes === true,
      scores,
      weight,
      waist,
    });
    if (!built.ok) return setError(messageFor(built.error));
    onSubmit(built.values);
  };

  // LA GATE DE MONTAGE. Tant que la réponse n'est pas là, on n'affiche RIEN —
  // ni le formulaire complet qu'on retirerait ensuite, ni un squelette qui
  // annoncerait six champs pour n'en rendre que deux.
  if (showAxes === null) return null;

  return (
    <form
      onSubmit={submit}
      // LE MÊME CADRE QUE `ui/Card.tsx`, à la classe près: remplissage `paper`
      // comme le sol, et un trait de CONTRÔLE `line-strong` (3,84:1) pour que le
      // formulaire se lise. `border-line` (1,30:1) le ferait disparaître — le
      // fond de la conversation EST `paper`, il n'y a pas de neutre plus clair
      // dans la charte. Ce n'est pas `<Card>` parce qu'il faut un `<form>`.
      className="rounded-card border border-line-strong bg-paper p-4"
      aria-label={t("chat.weekly.title")}
      data-testid="weekly-checkin"
      // LISIBLE DEPUIS UN TEST, et pas seulement à l'œil: c'est ce qui permet
      // d'épingler « zéro axe rendu » sans compter des boutons.
      data-axes={showAxes ? "on" : "off"}
    >
      <h2 className="text-base font-semibold text-ink">
        {t("chat.weekly.title")}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {showAxes ? t("chat.weekly.subtitle") : t("chat.weekly.subtitle.measures")}
      </p>

      {showAxes && (
        <div className="mt-4 flex flex-col gap-3">
          {WEEKLY_AXES.map((axis) => (
            <div key={axis}>
              <p className="text-sm font-medium text-ink">
                {weeklyAxisLabel(axis)}
              </p>
              {/* ── LE CRAN CHOISI RESTE NEUTRE, ET C'EST UN ARBITRAGE ────────
                  Six axes se notent en même temps: six pastilles pleines sont
                  rendues côte à côte dès que l'élève a répondu. Les peindre à la
                  figue mettrait SIX aplats de marque dans un panneau qui porte
                  déjà l'action figue (« Envoyer ») — c'est-à-dire zéro
                  hiérarchie, exactement ce que le plafond d'une action de marque
                  par vue existe pour éviter. Un cran choisi n'est d'ailleurs pas
                  une action, c'est la VALEUR d'un contrôle.
                  `ink` sur `paper` = 16,18:1, le couple le plus contrasté de la
                  charte, et `aria-pressed` porte déjà l'état sans la couleur.
                  ⚠️ Le panneau de déviation, lui, EST à la figue: il n'a qu'UN
                  choix sélectionné par groupe. La différence est le nombre. */}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {WEEKLY_SCALE_VALUES.map((score) => (
                  <button
                    key={score}
                    type="button"
                    aria-pressed={scores[axis] === score}
                    aria-label={`${weeklyAxisLabel(axis)}: ${weeklyScaleLabel(score)}`}
                    onClick={() => setScores((prev) => ({ ...prev, [axis]: score }))}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      scores[axis] === score
                        ? "border-ink bg-ink text-paper"
                        : "border-line-strong bg-paper text-ink hover:bg-fig-50"
                    }`}
                  >
                    {weeklyScaleLabel(score)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* « Optionnel » n'a de sens qu'À CÔTÉ des axes: quand les deux mesures
          sont les seuls champs, le sous-titre porte déjà « si tu les suis », et
          répéter « optionnel » sur l'unique chose demandée dit à l'élève qu'il
          peut envoyer un formulaire vide — ce que la garde refuse. */}
      {showAxes && (
        <p className="mt-4 text-xs text-ink-soft">{t("chat.weekly.optional")}</p>
      )}
      {/* La marge se reprend quand la légende disparaît: sans ça la rangée des
          mesures viendrait coller au sous-titre.

          ⛔ LES DEUX CHAMPS PASSENT PAR `inputClass`, ET C'EST UN DÉFAUT MESURÉ
          QUI TOMBE. Ils portaient `text-sm` — 14 px — donc Safari iOS ZOOMAIT au
          focus et NE DÉZOOMAIT PAS en sortant: le point hebdo est un écran de
          téléphone du dimanche, c'est-à-dire le pire endroit possible pour ce
          défaut. `inputClass` est `text-base` sous `lg`. Il apporte aussi la
          bordure de contrôle `line-strong` (3,84:1 contre 1,30:1) et l'anneau de
          focus `fig-600` que ces deux champs n'avaient pas du tout.
          ⚠️ Et le rayon passe de `full` à `card`: le cercle complet est réservé
          aux boutons et aux pastilles d'état (`KIT-CONTRAT` §1), un champ est une
          case. Une grille bornée remplace les deux `w-32`: elle tient à 320 px
          sans qu'aucune largeur ne soit écrite en dur. */}
      <div
        className={`${
          showAxes ? "mt-1" : "mt-4"
        } grid max-w-xs grid-cols-2 gap-2`}
      >
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          inputMode="decimal"
          placeholder={t("chat.weekly.weight")}
          aria-label={t("chat.weekly.weight")}
          className={inputClass}
        />
        <input
          value={waist}
          onChange={(e) => setWaist(e.target.value)}
          inputMode="decimal"
          placeholder={t("chat.weekly.waist")}
          aria-label={t("chat.weekly.waist")}
          className={inputClass}
        />
      </div>

      {/* ⛔ UN FAIT. Rouge = échec, et `red-700` est la valeur du produit
          (`ui/Field.tsx`, `ui/Badge.tsx`): 6,13:1 contre 4,83:1 pour `red-600`. */}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {t("chat.weekly.submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t("chat.weekly.cancel")}
        </Button>
      </div>
    </form>
  );
}

export default WeeklyCheckInDialog;
