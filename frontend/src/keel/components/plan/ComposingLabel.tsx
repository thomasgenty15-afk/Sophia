import React from "react";
import { Loader2 } from "lucide-react";

import { t } from "../../i18n/t";
import { draftProgressLabel } from "../../lib/draftProgressLabel";
import type { DraftProgress } from "../../api/planDraft";

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-21 — EXTRAIT DE `SetupPage`, PARCE QU'IL A UN SECOND MONTAGE.
//
// L'aperçu de brouillon en a besoin: son bouton « Ajuster le plan » recompose
// la semaine — deux minutes — et il ne disait rien pendant ce temps-là.
// Pendant ce temps c'est le bouton d'ADOPTION qui affichait « Enregistrement… »
// (un seul booléen `working` pour trois gestes), c'est-à-dire un mot faux: rien
// ne s'enregistre pendant un ajustement.
//
// ⛔ UNE SEULE ÉCRITURE. Deux copies auraient donné deux vocabulaires d'attente
// pour la même composition, et c'est celle qu'on regarde le moins qui garderait
// les anciennes phrases.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'ATTENTE DE LA COMPOSITION, DITE PENDANT QU'ELLE DURE.
 *
 * ── POURQUOI HUIT PHRASES ET PAS UN SABLIER ────────────────────────────────
 * Composer une semaine prend des dizaines de secondes: le modèle écrit, le
 * serveur vérifie, la liste de courses se construit. Un libellé figé
 * (« Construction en cours… ») pendant deux minutes se lit comme un écran
 * planté — la personne appuie une deuxième fois, ou quitte. Ce qui distingue
 * « ça travaille » de « c'est mort » n'est pas une animation, c'est du TEXTE
 * QUI CHANGE: il prouve que quelque chose avance encore.
 *
 * ⚠️ CE QUE CES PHRASES NE FONT PAS: elles ne prétendent PAS lire l'avancement
 * réel. La fonction edge ne rend rien avant d'avoir fini, donc une barre à
 * pourcentage serait inventée de bout en bout — un fait indémentable de plus.
 * Elles disent ce que la composition FAIT, dans l'ordre où elle le fait, et
 * c'est vrai sans être mesuré.
 *
 * ── LA CADENCE ────────────────────────────────────────────────────────────
 * Huit messages, quinze secondes chacun: deux minutes, la durée demandée. Au
 * bout, le dernier RESTE affiché — on ne reboucle pas sur « on démarre », qui
 * ferait croire que tout recommence, ni sur une phrase de fin, qui promettrait
 * une réponse qui n'est pas arrivée.
 *
 * Le composant est monté par `busy` et démonté avec lui: chaque composition
 * repart donc du premier message, sans qu'aucun `useEffect` de remise à zéro
 * ait à exister.
 */
const COMPOSING_MESSAGES = 8;
const COMPOSING_TICK_MS = 15_000;

/**
 * ⟳ 2026-09-15 · LOT B — LE STADE RÉEL D'ABORD, LA MINUTERIE EN REPLI.
 *
 * ⛔ LES HUIT PHRASES NE PRÉTENDAIENT PAS LIRE L'AVANCEMENT, ET ÇA SE VOYAIT :
 * 8 × 15 s = deux minutes, puis la huitième restait figée pendant les quatre
 * minutes suivantes (mesuré le 2026-09-15 sur une composition de 6 min 20).
 * Depuis que le serveur écrit `stage` dans la ligne et que le navigateur la
 * relit toutes les 2 s, la première ligne est ce qui se passe VRAIMENT, avec le
 * temps écoulé ; les phrases minutées ne servent plus qu'avant le premier
 * stade (la ligne vient d'être ouverte) — quelques secondes.
 */
export default function ComposingLabel({ progress }: { progress: DraftProgress | null }) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (index >= COMPOSING_MESSAGES - 1) return;
    const id = globalThis.setTimeout(
      () => setIndex((n) => n + 1),
      COMPOSING_TICK_MS,
    );
    return () => globalThis.clearTimeout(id);
  }, [index]);

  const live = draftProgressLabel(progress);
  return (
    <>
      <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
      {/* `aria-live` et pas seulement du texte: le bouton est désactivé
          pendant l'attente, donc son libellé n'est plus annoncé au focus. Sans
          région vivante, un lecteur d'écran n'apprendrait jamais que ça
          avance. */}
      <span aria-live="polite">
        {live ?? t(
          `setup.plan.composing_${index + 1}` as "setup.plan.composing_1",
        )}
      </span>
    </>
  );
}
