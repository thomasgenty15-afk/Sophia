import React from "react";

import { type MealPreparation, type ShoppingItem } from "../api/mealGeneration";
import { waveAssignments, wavesAreMeaningful } from "../api/groceryWaves";
import { aisleLabel } from "../api/mealLabels";
import { groupByAisle } from "../lib/mealBuilderModel";
import { requestMealDocument } from "../api/mealDocument";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import Modal from "./ui/Modal";

// LA LISTE DE COURSES — celle qu'on emporte au magasin.
//
// ===========================================================================
// CE QUI CHANGE, ET POURQUOI CHAQUE POINT
// ===========================================================================
// Elle était tout en bas de l'écran, à plat, après sept jours de plats. Pour la
// lire il fallait faire défiler une semaine entière, et une fois dessus on
// obtenait vingt-huit lignes dans l'ordre où le modèle les avait sorties —
// c'est-à-dire le poulet entre les tomates et le riz. On fait ses courses en
// suivant les rayons; une liste qui les ignore se parcourt en entier à chaque
// article.
//
// ── ELLE EST EN HAUT, DERRIÈRE UN BOUTON ─────────────────────────────────
// En haut parce que c'est le geste du dimanche: on ouvre l'écran POUR ça.
// Derrière un bouton parce que le reste de la semaine on vient lire ses plats,
// et vingt-huit lignes dépliées au-dessus les repousseraient hors de l'écran.
//
// ── « I HAVE » NE SE PERSISTE PAS, ET C'EST UN CHOIX ─────────────────────
// Cocher raye la ligne, et rien de plus: rien n'est écrit, rien ne survit au
// rechargement. Un placard change tous les jours — l'huile s'épuise, les œufs
// se finissent — donc un « j'ai ça » gardé en base prétendrait connaître un
// état qu'on ne peut pas suivre, et nourrirait la génération suivante avec un
// inventaire faux. C'est une rature sur un bout de papier, pas un inventaire,
// et l'écran le dit.
//
// ── LE PDF PORTE LA LISTE ENTIÈRE ────────────────────────────────────────
// Il est construit côté serveur depuis la ligne en base, donc il ignore les
// ratures. C'est cohérent avec ce qu'elles sont (éphémères, locales), mais il
// faut le DIRE avant le clic: le découvrir au supermarché, devant un PDF qui
// redemande ce qu'on a déjà, serait exactement la trahison qu'un export doit
// éviter.

const COPY = {
  empty: "Nothing to buy — this week runs on what you already have.",
  have: "I have it",
  left: "{count} left to buy",
  all_done: "Everything ticked. Nothing left to buy.",
  ephemeral:
    "Ticking is just for the shop — it is not saved, and nothing here is remembered as your cupboard.",
  pdf: "Save as PDF",
  pdf_building: "Preparing…",
  pdf_note: "The PDF carries the whole list, including what you have ticked off.",
  pdf_failed: "That did not work. Try again.",
  // LE LIEN RESTE À L'ÉCRAN une fois le fichier prêt. `window.open` est tenté,
  // mais un navigateur a le droit de le bloquer — et un export silencieusement
  // avalé est pire qu'un export absent: on croit avoir sa liste et on arrive au
  // magasin les mains vides.
  pdf_ready: "Your list is ready.",
  pdf_download: "Open the PDF",
  title: "Shopping list",
  close: "Close",
  // ── LES VAGUES ─────────────────────────────────────────────────────────
  // La raison est la FRAÎCHEUR, et elle est DITE. Une seconde liste sans
  // explication se lit comme une corvée arbitraire — c'est-à-dire comme
  // exactement ce que ce produit promet de retirer.
  wave_now: "Buy now",
  wave_later: "Buy on {date}",
  wave_serves: "so it is fresh for the {day} cooking",
  wave_intro:
    "Split by when it has to be fresh: the mid-week meat does not keep from Monday.",
} as const;

/** « Friday 7 August ». Locale du navigateur: c'est une date qu'on lit, pas
 *  une donnée qu'on compare. */
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

function weekdayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
}

export interface ShoppingListPanelProps {
  items: readonly ShoppingItem[];
  /** `null` quand la composition n'a pas d'identité: pas de PDF possible. */
  mealId: string | null;
  /**
   * OUVERT OU NON — décidé par le PARENT, parce que le bouton vit chez lui.
   *
   * Le déclencheur est dans la rangée d'en-tête des repas, à côté de « Build
   * another plan » et dans la même forme: ce sont les deux gestes qu'on vient
   * faire sur cet écran, et les présenter différemment demandait de comprendre
   * deux fois la même chose.
   *
   * LE COMPOSANT RESTE MONTÉ QUAND IL EST FERMÉ. Les ratures sont éphémères,
   * mais pas au point de disparaître parce qu'on a replié la liste pour aller
   * relire un plat: elles doivent survivre à un aller-retour, elles n'ont
   * simplement pas à survivre à un rechargement.
   */
  open: boolean;
  onClose: () => void;
  /**
   * DE QUOI DÉDUIRE LES VAGUES D'ACHAT (PIVOT-FOYER §3).
   *
   * Optionnels et absents par défaut: une composition lue avant
   * `20260807090000_meal_plan_window` n'a pas de fenêtre, et une composition
   * sans préparations datées n'a rien à répartir. Dans les deux cas la liste
   * reste exactement celle d'avant — l'ajout est additif, jamais régressif.
   */
  preparations?: readonly MealPreparation[];
  startsOn?: string | null;
  durationDays?: number | null;
}

export default function ShoppingListPanel(props: ShoppingListPanelProps) {
  // LES RATURES, EN MÉMOIRE ET RIEN D'AUTRE. Un `Set` d'index dans la liste
  // d'origine: voir `groupByAisle` sur le choix de l'index plutôt que du terme.
  const [ticked, setTicked] = React.useState<Set<number>>(new Set());
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  /** L'URL signée du dernier export, gardée pour que le lien reste cliquable. */
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);

  const groups = React.useMemo(() => groupByAisle(props.items), [props.items]);
  const left = props.items.length - ticked.size;

  // LES VAGUES. Calculées ici et pas au chargement: elles ne dépendent que de
  // ce que le panneau reçoit déjà, et les recalculer ailleurs ferait deux
  // sources pour la même répartition.
  const waves = React.useMemo(() => {
    if (!props.startsOn || !props.preparations?.length) return [];
    return waveAssignments({
      startsOn: props.startsOn,
      durationDays: props.durationDays ?? 7,
      shoppingList: props.items,
      preparations: props.preparations,
    });
  }, [props.startsOn, props.durationDays, props.items, props.preparations]);

  // UNE SEULE VAGUE NE SE MONTRE PAS: c'est la liste plate d'avant, et un
  // en-tête posé sur la totalité n'ajoute qu'un mot à lire.
  const showWaves = wavesAreMeaningful(
    waves.map((w) => ({ buyOn: w.buyOn, items: [], servesCookOn: w.servesCookOn })),
  );

  const toggle = (index: number) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  async function exportPdf() {
    if (!props.mealId) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const doc = await requestMealDocument(props.mealId);
      setPdfUrl(doc.downloadUrl);
      if (doc.downloadUrl) {
        // On TENTE l'ouverture directe — c'est le geste attendu — mais on ne
        // s'y fie pas: le lien rendu plus bas est ce qui garantit que le
        // fichier est atteignable même si le navigateur bloque la fenêtre.
        // `noopener` sur une URL signée: la page ouverte n'a aucune raison de
        // garder une poignée sur celle-ci.
        window.open(doc.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : COPY.pdf_failed);
    } finally {
      setPdfBusy(false);
    }
  }

  /**
   * UN RAYON. Extrait pour être rendu deux fois — à plat, ou dans une vague —
   * sans que les deux chemins puissent diverger. Il continue de travailler sur
   * l'INDEX D'ORIGINE, qui est ce qui identifie une rature.
   */
  function renderGroup(group: { aisle: string; items: Array<{ item: ShoppingItem; index: number }> }) {
    return (
      <div key={group.aisle}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {aisleLabel(group.aisle)}
        </h3>
        <Card padded={false}>
          <ul className="divide-y divide-gray-100">
            {group.items.map(({ item, index }) => {
              const done = ticked.has(index);
              return (
                <li key={`${item.term}-${index}`}>
                  {/* TOUTE LA LIGNE EST LA CIBLE. On coche ça d'une main,
                      debout, avec un chariot dans l'autre: une case de 16px
                      serait une case qu'on rate. */}
                  <label className="flex cursor-pointer items-baseline gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggle(index)}
                      aria-label={`${COPY.have}: ${item.term}`}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                    <span
                      className={`flex flex-wrap items-baseline gap-2 text-sm ${
                        done ? "text-gray-400 line-through" : "text-gray-800"
                      }`}
                    >
                      <span>{item.term}</span>
                      {item.quantity && (
                        <span className={done ? "text-gray-300" : "text-gray-500"}>
                          {item.quantity}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    );
  }

  if (props.items.length === 0) return null;

  return (
    <Modal open={props.open} onClose={props.onClose} title={COPY.title}>
      <div className="space-y-4">
          <Card>
            {/* LE RESTE À ACHETER, EN TÊTE: c'est ce qu'on regarde entre deux
                rayons, et ça n'a de sens qu'à côté de la liste. */}
            <p className="text-sm tabular-nums text-gray-800">
              {left > 0 ? COPY.left.replace("{count}", String(left)) : COPY.all_done}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">{COPY.ephemeral}</p>
          </Card>

          {showWaves && (
            <p className="text-xs leading-5 text-gray-500">{COPY.wave_intro}</p>
          )}

          {showWaves
            ? waves.map((wave, w) => {
              const inWave = new Set(wave.indices);
              const waveGroups = groups
                .map((g) => ({
                  aisle: g.aisle,
                  items: g.items.filter((entry) => inWave.has(entry.index)),
                }))
                .filter((g) => g.items.length > 0);
              return (
                <section key={wave.buyOn} className="space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {w === 0
                        ? COPY.wave_now
                        : COPY.wave_later.replace("{date}", longDate(wave.buyOn))}
                    </h3>
                    {/* LA RAISON, à côté de la date. Sans elle, la seconde
                        vague est un déplacement de plus qu'on ne s'explique
                        pas — et on cesse de la suivre. */}
                    {wave.servesCookOn && (
                      <p className="text-xs leading-5 text-gray-500">
                        {COPY.wave_serves.replace("{day}", weekdayOf(wave.servesCookOn))}
                      </p>
                    )}
                  </div>
                  {waveGroups.map((group) => renderGroup(group))}
                </section>
              );
            })
            : groups.map((group) => renderGroup(group))}


          {/* L'EXPORT, EN BAS DU PANNEAU: on l'utilise une fois, avant de
              partir, pas à chaque coup d'œil sur la liste. */}
          {props.mealId && (
            <div>
              <Button variant="secondary" disabled={pdfBusy} onClick={() => void exportPdf()}>
                {pdfBusy ? COPY.pdf_building : COPY.pdf}
              </Button>
              <p className="mt-1 text-xs leading-5 text-gray-500">{COPY.pdf_note}</p>
              {pdfUrl && (
                <p className="mt-2 text-sm text-gray-800">
                  {COPY.pdf_ready}{" "}
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    {COPY.pdf_download}
                  </a>
                </p>
              )}
              {pdfError && <p className="mt-1 text-sm text-red-600">{pdfError}</p>}
            </div>
          )}
      </div>
    </Modal>
  );
}
