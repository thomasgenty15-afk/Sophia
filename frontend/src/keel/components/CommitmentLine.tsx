import React from "react";
import { activityLabel, commitmentAmount, priorityLabel } from "../api/labels";
import type { TodayLine } from "../api/todayModel";
import { t } from "../i18n/t";
import { StatusBadge, TimingNote } from "./KeelBadges";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

// KEEL — one prescribed engagement, as the student sees it.
//
// TWO ROWS OF TRUTH, NEVER MERGED:
//   - the badge on the right is the DERIVED status, written server-side;
//   - "Logged 2x today" underneath counts FACTS this student recorded.
// Tapping "Log it" moves the second line immediately and leaves the first
// alone. That gap is not a latency bug to paper over: announcing `met` on a tap
// would be announcing an evaluation nobody computed.
//
// FAMILY IDENTITY (E1) also lives here. `activity_class` used to render as a
// grey word among four other grey words, which made it invisible: a student
// could not scan a screen and see "the nutrition lines held, the movement one
// did not". The answer was, and still is, to give each family ITS OWN MARK.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CE COMMENTAIRE A ÉTÉ RÉÉCRIT LE 2026-08-13. LIS-LE AVANT DE « RÉPARER ».
// ═══════════════════════════════════════════════════════════════════════════
//
// Le mark était un GLYPHE + UNE TEINTE, et il annonçait « une famille, une
// couleur, une icône, partout ». Les neuf teintes sont parties; le glyphe
// reste, et c'est lui qui portait déjà l'identité.
//
// POURQUOI. Une famille (`nutrition`, `movement`) est un DOMAINE, pas un état
// du système. Or dans ce produit la couleur saturée appartient au sens:
// émeraude = ok, bleu = info, ambre = attention, rouge = échec. Les neuf
// teintes mordaient précisément là:
//     `amber` sur `supplement`  était l'ambre d'« attention »
//     `cyan`  sur `exposure`    était voisin du bleu d'« info »
//     `lime`  sur `nutrition`   était voisin de l'émeraude d'« ok » — et sur
//                               `/app/today` une pastille « Alimentation »
//                               vert-jaune touchait une pastille de statut
//                               émeraude, à 11 px, dans la même rangée
//     `indigo` et `fuchsia`     étaient la marque du produit grand public
//                               SUPPRIMÉ
// Le fichier se défendait en disant qu'il évitait émeraude et rose, les deux
// teintes de `StatusBadge`. Il en évitait deux sur neuf, et les sept autres
// empruntaient un sens qu'aucune famille ne porte.
//
// CE QUI REMPLACE LA COULEUR EST DÉJÀ LÀ: le glyphe, un tracé de 2 px sur une
// grille de 24 — le langage de figure de la charte (§5). Neuf glyphes se
// distinguent mieux que neuf teintes à 11 px, ils survivent au daltonisme et à
// l'impression, et ils ne consomment aucune teinte, donc aucun état ne devient
// muet. Le chip perd aussi son cadre et son fond: un REMPLISSAGE est ce qui
// fait une pastille, et la pastille appartient aux états (`StatusBadge` est la
// seule chose remplie de la rangée, ce qui est exactement le propos).
//
// ⚠️ Si tu lis encore quelque part que « chaque famille porte une teinte »
// (par exemple en tête de `TodayPage.tsx`), la phrase est périmée: réécris-la,
// ne remets pas la couleur.
//
// Why the chip is defined in this file rather than in `KeelBadges`: the badges
// module owns the DERIVED vocabulary (status, timing). A family is not a grade,
// and giving it a home next to grades is how the two start looking alike.
// Autorité: `docs/keel/CHARTE-VITRINE.md` §2 et §5.

/** The glyph of each family, as a stroked path on a 24x24 grid. */
const ACTIVITY_GLYPH: Record<string, string> = {
  nutrition: "M20 4c0 9-5 14-13 14M7 18c0-6 5-10 11-11",
  supplement: "M8 20a5 5 0 0 1-4-8l8-8a5 5 0 0 1 8 4 5 5 0 0 1-1 3l-8 8a5 5 0 0 1-3 1zM8 8l8 8",
  movement: "M3 13h4l3-8 4 16 3-8h4",
  recovery: "M20 12a8 8 0 1 1-3-6M20 3v4h-4",
  exposure: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19",
  sleep: "M20 14A8.5 8.5 0 0 1 10 4a8 8 0 1 0 10 10z",
  mind: "M12 3l2.2 4.8L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.2z",
  measurement: "M5 20v-7M12 20V4M19 20v-11",
  other: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
};

/**
 * The family of a line, as a chip. R7: an unknown `activity_class` throws here
 * exactly as it does in `todayModel` and in `activityLabel` — a family with no
 * glyph is a family this build never heard of, and rendering it as a bare word
 * would quietly file it under nothing.
 *
 * `size="md"` is the HEADING role — the chip stands in for the `<h5>` that
 * heads a food sub-group on the three screens that read a plan, so it takes the
 * same cran as that heading (`text-label`: 11 px, +0,1em, capitales — charte
 * §3). `size="sm"` is the inline role, on one line of the student's day.
 */
export function ActivityChip(
  { activityClass, size = "sm" }: { activityClass: string; size?: "sm" | "md" },
) {
  const glyph = ACTIVITY_GLYPH[activityClass];
  if (!glyph) {
    throw new Error(
      `[keel/line] no visual identity for activity_class "${activityClass}" (R7)`,
    );
  }
  const box = size === "md"
    ? "gap-1.5 text-label font-semibold uppercase"
    : "gap-1 text-[11px]";
  const icon = size === "md" ? 13 : 12;
  return (
    <span className={`inline-flex items-center text-ink-soft ${box}`}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d={glyph} />
      </svg>
      {activityLabel(activityClass)}
    </span>
  );
}

/**
 * LE RANG D'UNE LIGNE — et il est une FORME, pas trois couleurs.
 *
 * ⛔ CE COMPOSANT EXISTE POUR ANNULER LA FAUTE LA PLUS NETTE DU PRODUIT.
 * `core / secondary / optional` était peint trois fois, différemment, sur trois
 * écrans qui rendent les mêmes lignes:
 *     `TemplatesPage.PriorityChip`  gris / **sky** / gris
 *     `PlanImportPage.PriorityChip` gris / **sky** / gris  (copie à l'identique)
 *     `KeelBadges.PriorityBadge`    **émeraude** / **sky** / gris
 * Trois problèmes empilés: le `sky` prend le bleu de `Badge tone="info"` et rend
 * la pastille bleue muette; l'émeraude de « Core » est un FAUX « ok » — un
 * engagement principal n'est pas un engagement tenu, et sur `/app/today` cette
 * fausse coche touchait la vraie, la pastille de statut, dans la même rangée; et
 * un RANG n'est pas un état du système, donc aucune des trois teintes ne dit
 * quoi que ce soit.
 *
 * LA FORME QUI LES REMPLACE EST ORDINALE, ce que les couleurs n'étaient même
 * pas: trois pièces, remplies de gauche à droite. Elle se lit sans légende,
 * survit au daltonisme et à l'impression, et le mot reste écrit à côté (R1: le
 * jeton est une donnée, jamais une copie). Le `core` prend en plus le seul poids
 * typographique de la rangée: c'est la ligne qui porte le bloc.
 *
 * ⚠️ AUCUN REMPLISSAGE DE FOND ICI, ET C'EST LA GARDE. Un remplissage est ce qui
 * fait une pastille, et la pastille appartient aux états (charte §2). Un rang
 * qui ne se remplit pas ne peut pas être confondu avec un verdict.
 * ⚠️ Les pièces sont en `currentColor`: elles héritent de `ink` ou d'`ink-soft`
 * selon le rang, et la figue n'entre pas ici — un rang n'est pas une action.
 */
const PRIORITY_RANK: Record<string, number> = { core: 3, secondary: 2, optional: 1 };

export function PriorityMark({ priority }: { priority: string }) {
  const rank = PRIORITY_RANK[priority] ?? 1;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[11px] ${
        rank === 3 ? "font-semibold text-ink" : "text-ink-soft"
      }`}
    >
      <svg
        width={13}
        height={8}
        viewBox="0 0 13 8"
        aria-hidden="true"
        className="shrink-0"
      >
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={i * 4.5 + 0.5}
            y={0.5}
            width={3}
            height={7}
            fill={i < rank ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1}
          />
        ))}
      </svg>
      {priorityLabel(priority)}
    </span>
  );
}

export interface CommitmentLineProps {
  line: TodayLine;
  pending: boolean;
  onLog: (line: TodayLine) => void;
}

export function CommitmentLine({ line, pending, onLog }: CommitmentLineProps) {
  const c = line.commitment;
  // The student reads the SAME phrase the coach wrote and re-read at import
  // ("5000 IU", "none", "by 23:00"), not the storage triple. See
  // `commitmentAmount`: the previous renderer printed "<= 2300 time" and "0".
  const target = commitmentAmount(c);
  const loggedCount = line.loggedEvents.length;
  // A silent device feed is read, not ticked (CONTRACT R6: auto_source yields
  // `unknown`, never `missed` — and never a button asking the student to lie).
  //
  // An `avoid` line is NEVER tappable. Its default is inverted (CONTRACT R6:
  // "no fact => met"), so a tap is the ONE thing that can turn a kept promise
  // into a broken one. The review reproduced it on a real row: "no alcohol on
  // weekdays" scored `met` untouched and `missed` after a tap carrying
  // quantity=0 — and because that line is `grain='week'`, a single tap sank a
  // core commitment for the whole week. Breaking an avoid line is reported in
  // words (chat) or by a photo, never by a button that reads like a checkbox.
  const canLog = !line.isAutoSourced && c.polarity !== "avoid";

  return (
    // Une LIGNE de liste, pas une `Card`: `rounded-card` et le trait de contrôle
    // du kit, mais `p-3` gardé — `/app/today` en empile jusqu'à quinze, et le
    // `p-4` de la primitive y changerait le rythme d'un écran qui n'est pas le
    // mien. Pas d'`overflow-hidden` non plus: il rognerait l'anneau de focus du
    // bouton (`outline-offset: 3px`).
    <div className="rounded-card border border-line-strong bg-paper p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-ink">{c.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            <ActivityChip activityClass={c.activity_class} />
            {target && <span className="tabular-nums text-ink">{target}</span>}
            <PriorityMark priority={c.priority} />
            <TimingNote timing={line.timingStatus} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={line.status} />
          {canLog && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => onLog(line)}
              className="disabled:opacity-40"
            >
              {pending ? t("today.log_pending") : t("today.log_button")}
            </Button>
          )}
        </div>
      </div>

      {c.student_instruction && (
        <p className="mt-2 border-l-2 border-line pl-2 text-xs italic text-ink-soft">
          <span className="not-italic text-ink-soft">
            {t("today.instruction_label")}
          </span>
          {" "}
          {c.student_instruction}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
        {loggedCount > 0 && (
          // Un FAIT enregistré, donc une pastille d'état, donc celle du kit.
          <Badge tone="positive">
            {t("today.logged_count", { count: loggedCount })}
          </Badge>
        )}
        {line.isAutoSourced && c.auto_source && (
          <span>{t("today.auto_source", { source: c.auto_source })}</span>
        )}
        {!c.counts_toward_adherence && <span>{t("today.outcome_only")}</span>}
        {c.evidence_required && c.evidence_kind === "photo" && (
          <span className="text-amber-700">{t("today.evidence_photo")}</span>
        )}
        {line.coveredByDeviation && (
          // `violet` ÉTAIT LA MARQUE DU PRODUIT GRAND PUBLIC SUPPRIMÉ, et ici
          // elle disait quand même quelque chose de vrai: la ligne est excusée
          // par un écart déclaré, elle n'est ni tenue ni manquée. C'est de
          // l'INFO, et l'info est bleue dans les quatre familles d'état
          // (`ui/Badge.tsx`). La teinte change, le sens est celui qui était
          // déjà là. Texte et non pastille: les trois notes voisines de cette
          // rangée sont des notes, et une seule d'entre elles ne peut pas
          // devenir un objet d'un autre genre.
          <span className="text-blue-700">{t("today.covered_by_deviation")}</span>
        )}
      </div>
    </div>
  );
}

export default CommitmentLine;
