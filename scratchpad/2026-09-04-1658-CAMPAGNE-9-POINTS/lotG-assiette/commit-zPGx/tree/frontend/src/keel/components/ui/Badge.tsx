import React from "react";

// KEEL UI — the one badge. Tones map to meaning, shared across coach and
// student surfaces: `positive` = an active/kept state, `info` = pending,
// `caution` = degraded or paused, `critical` = refused or exceeded,
// `neutral` = everything that is only a label.
//
// ── ⛔ LES QUATRE FAMILLES D'ÉTAT N'ONT PAS BOUGÉ, ET C'EST LE POINT ────────
// Émeraude = ok, bleu = info, ambre = attention, rouge = échec. QUATRE
// familles, pas trois — `info` occupe le bleu, et plus d'un document du dépôt
// l'avait oublié. Elles sont le VOCABULAIRE du produit: un lecteur apprend une
// fois ce que veut dire une pastille ambre, et il le sait sur les seize écrans.
// Le passage de l'app à la charte « la fiche » (2026-08-13) n'a touché à AUCUNE
// de ces quatre teintes — seul `neutral` a changé, voir plus bas.
//
// ── ET LA FIGUE N'ENTRE JAMAIS DANS CE FICHIER ────────────────────────────
// La teinte de marque (`fig-*`) marque la NAVIGATION et l'ACTION; les couleurs
// d'état marquent les FAITS. La garde qui rend ça vérifiable est une FORME et
// non une couleur: un état est TOUJOURS une pastille, et la pastille
// n'appartient qu'aux états. Si tu t'apprêtes à écrire `bg-fig-…` ici, ce n'est
// pas la valeur qui est fausse, c'est le fichier.
// Autorité: `docs/keel/CHARTE-VITRINE.md` §2.
//
// ── `neutral`, LE SEUL TON QUI AIT CHANGÉ ─────────────────────────────────
// `bg-gray-100 text-gray-600` est devenu `bg-line text-ink-soft` — 4,72:1, le
// couple le plus serré du kit et au-dessus du seuil 4,5 du texte (`line`
// #E3DAE0 contre `ink-soft` #6A5A64).
// ⚠️ Il ne peut PAS emprunter un fond `-50` d'état pour respirer davantage: un
// ton qui ne dit rien doit rester le plus discret des cinq, et lui donner la
// surface d'un état en ferait un faux état. Et `fig-50` est exclu par la garde
// ci-dessus. `line` est le seul remplissage neutre qui se lise comme une pièce
// posée sur le papier (1,30:1 sur `paper`) sans emprunter un sens.

export type BadgeTone = "neutral" | "positive" | "info" | "caution" | "critical";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-line text-ink-soft",
  positive: "bg-emerald-50 text-emerald-700",
  info: "bg-blue-50 text-blue-700",
  caution: "bg-amber-50 text-amber-800",
  critical: "bg-red-50 text-red-700",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  // ⚠️ LA GÉOMÉTRIE EST INCHANGÉE, ET C'EST UNE DÉCISION. `rounded-full` est
  // déjà ce que la charte réserve aux pastilles d'état et aux boutons
  // (`tokens.css` §2), et la pastille est la FORME qui porte la garde: la
  // déformer affaiblirait la seule règle vérifiable de la palette. Rayon,
  // graisse et marges intérieures restent donc tels quels.
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
