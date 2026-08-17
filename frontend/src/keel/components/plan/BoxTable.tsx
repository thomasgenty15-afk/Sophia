import { mealCopy } from "../../api/mealLabels";
import type { BoxLine } from "../../lib/preparationBoxes";

// LOT 4 — LA TABLE DE PESÉE, SOUS LA PRÉPARATION QUI LA PRODUIT.
//
// ── POURQUOI ELLE EST ICI, ET PAS SUR LES PLATS ────────────────────────────
// C'est TOUT le protocole: on pèse UNE fois, au moment de la mise en boîtes,
// donc l'instruction vit là où le geste se fait — devant la casserole, à la
// session de cuisine. La reporter sur chaque plat ferait ressortir la balance à
// chaque repas, c'est-à-dire exactement ce que le protocole existe pour éviter.
// Le jour J, un plat CITE sa boîte; il ne redit pas comment la remplir.
//
// ── RENDU DEUX FOIS PAR DEUX ÉCRANS, ÉCRIT UNE FOIS ────────────────────────
// « Tes sessions de cuisine » (la vue d'ensemble) et le bloc session du jour
// dans la vue par jour montrent la MÊME table. Deux rendus du même objet
// finissent par diverger, et ici la divergence se paierait sur des grammes.
//
// ⛔ AUCUN POURQUOI, ET C'EST STRUCTUREL. Ce composant ne reçoit que des
// prénoms et des grammes (`BoxLine`): il n'a aucun champ où un objectif, un
// poids ou une calorie pourrait entrer. Les grammes qu'il rend sont des grammes
// d'ALIMENT — la même famille que « 400 g de cuisses de poulet » sur une liste
// de courses (F7/F8, FF-047).
//
// ⛔ AUCUNE COULEUR D'ÉTAT. Une pesée n'est ni un verdict ni une alerte: c'est
// une donnée, comme un jour de cuisine et une durée. La frontière est portée par
// le filet et l'espace (charte §2).

export function BoxTable({ lines }: { lines: readonly BoxLine[] }) {
  // MUETTE QUAND IL N'Y A RIEN À PESER, et c'est le cas majoritaire: tout plan
  // écrit avant le 2026-08-17, toute lane individuelle, et tout foyer où le
  // modèle n'a pas rendu de boîtes. Un en-tête au-dessus du vide se lirait
  // comme une panne.
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 rounded-card border border-line bg-paper-2 px-3 py-2">
      <p className="text-label font-semibold uppercase text-ink-soft">
        {mealCopy("meals.boxes.title")}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {lines.map((line) => (
          <li
            key={line.id}
            // `data-box-id` N'EST PAS UN ORNEMENT DE TEST — même raison que
            // `data-preparation-id` sur la carte d'un plat: c'est l'identifiant
            // QUI FAIT LA JOINTURE entre cette ligne et le plat qui la citera.
            // Il ne s'affiche pas (un slug de couvercle ne veut rien dire à
            // table) mais il rend la jointure auditable dans le DOM.
            data-box-id={line.id}
            // `tabular-nums`: des grammes alignés se comparent d'un coup d'œil,
            // et c'est exactement ce qu'on fait devant trois boîtes.
            className="flex flex-wrap items-baseline gap-2 text-sm tabular-nums text-ink break-words"
          >
            {/* ⚠️ DEUX LIBELLÉS, ET LE SECOND N'EST PAS UN REPLI DÉCORATIF. Un
                plan relu sans ses parts (un secondaire, une lecture partielle)
                n'a AUCUN prénom à joindre: l'instruction de pesée reste vraie,
                et rendre l'identifiant brut à la place montrerait un uuid à
                table. */}
            {line.names.length > 0
              ? mealCopy("meals.boxes.line", {
                names: line.names.join(", "),
                n: line.grams,
              })
              : mealCopy("meals.boxes.line_unnamed", { n: line.grams })}
          </li>
        ))}
      </ul>
    </div>
  );
}
