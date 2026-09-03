import React from "react";

import { type MealPreparation, type ShoppingItem } from "../api/mealGeneration";
import { waveAssignments, wavesAreMeaningful } from "../api/groceryWaves";
import { aisleLabel } from "../api/mealLabels";
import { groupByAisle } from "../lib/mealBuilderModel";
import { requestMealDocument } from "../api/mealDocument";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import Modal from "./ui/Modal";
import { formatDateLong, formatWeekday } from "../i18n/format";
import { plural } from "../i18n/plural";
import { t } from "../i18n/t";

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

// ── LA CHARTE, LE 2026-08-13 ──────────────────────────────────────────────
// Seize neutres `gray-*` sont passés aux jetons de « la fiche » (`ink` ·
// `ink-soft` · `line`), et deux d'entre eux étaient sous le seuil de contraste:
// le titre de rayon en `gray-400` (2,8:1) et la quantité rayée en `gray-300`
// (1,7:1) — sur l'écran qu'on lit debout, dans un magasin, d'une main.
// Le panneau ne rend AUCUN état: une liste de courses n'a ni verdict ni
// adhérence. Ses deux seules teintes sont donc un LIEN (figue) et un ÉCHEC
// d'export (rouge). ⚠️ La case à cocher, elle, a un piège à elle: voir
// `accent-ink` plus bas. Autorité: `docs/keel/CHARTE-VITRINE.md` §2.
//
// ── I18N (lot 4) ──────────────────────────────────────────────────────────
// Le `COPY` local a rejoint le seed sous `meals.shopping.*`. C'était le
// dernier catalogue parallèle de `/app/today`: dix-sept phrases invisibles à
// `t()` comme au scanner de coutures, sur le panneau qu'on ouvre au magasin.

/**
 * « vendredi 7 août » · « Friday 7 August ».
 *
 * ⚠️ ELLE PASSAIT `undefined`, ce qui n'est PAS « la locale de la page »: c'est
 * `navigator.language`. Un visiteur au navigateur français lisait donc
 * « vendredi 7 août » au milieu d'un `/app/today` anglais, et l'inverse ne se
 * voyait jamais chez nous. Le contournement `T00:00:00Z` + `timeZone: "UTC"`
 * était correct et vit maintenant dans `i18n/format.ts`, pour tout le monde.
 */
function longDate(iso: string): string {
  return formatDateLong(iso, { year: false, weekday: "long" });
}

function weekdayOf(iso: string): string {
  return formatWeekday(iso, { long: true });
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
  // `wavesAreMeaningful` ne compte que les vagues — on lui passe la liste
  // telle quelle. Elle exigeait autrefois des `GroceryWave` complets, ce qui
  // obligeait à fabriquer ici une vague entière pour une question de comptage.
  const showWaves = wavesAreMeaningful(waves);

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
      setPdfError(e instanceof Error ? e.message : t("meals.shopping.pdf_failed"));
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
        {/* LE RAYON. `text-label` est le cran d'étiquette de la charte (§3):
            0,6875rem, +0,1em d'approche, capitales — le même que `SectionLabel`
            et que l'étiquette d'un champ. Et `ink-soft` (6,11:1) remplace un
            `gray-400` qui était à 2,8:1 sur le papier: un titre de rayon qu'on
            lit d'un coup d'œil au magasin ne peut pas être sous le seuil.
            ⚠️ PAS d'équerre ici: `SectionLabel` ouvre une SECTION, et il y en
            aurait une par rayon — la signature marque l'origine de ce qui est
            spécifié, elle ne ponctue pas une liste. */}
        <h3 className="mb-2 text-label font-semibold uppercase text-ink-soft">
          {aisleLabel(group.aisle)}
        </h3>
        <Card padded={false}>
          <ul className="divide-y divide-line">
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
                      aria-label={`${t("meals.shopping.have")}: ${item.term}`}
                      // ⚠️ `accent-ink` EST LA SEULE CLASSE QUI ATTEINT CETTE
                      // CASE, ET C'EST MESURÉ. `@tailwindcss/forms` n'est pas
                      // installé dans ce dépôt: l'`appearance` de la case reste
                      // native, donc `border-*` et `rounded-*` sont INERTES
                      // dessus — ils étaient là et ne peignaient rien. Sans
                      // `accent-*`, la coche est rendue dans le BLEU SYSTÈME, la
                      // teinte que `Badge tone="info"` occupe: une rature de
                      // liste de courses se serait lue comme un état « info ».
                      // `accent-ink` et pas `accent-fig-700`: cocher ici ne
                      // navigue pas et n'agit pas sur le produit, ça raye une
                      // ligne sur un bout de papier.
                      // L'anneau de focus est explicite parce que la règle
                      // `:focus-visible` de `tokens.css` ne couvre que `a`,
                      // `button` et `[tabindex]` — une case n'en fait pas partie.
                      className="mt-0.5 h-4 w-4 shrink-0 accent-ink focus:outline-none focus:ring-2 focus:ring-fig-600"
                    />
                    <span
                      className={`flex flex-wrap items-baseline gap-2 text-sm ${
                        done ? "text-ink-soft line-through" : "text-ink"
                      }`}
                    >
                      <span>{item.term}</span>
                      {/* LA QUANTITÉ EST TOUJOURS `ink-soft`: la rature est
                          portée par le `line-through` du parent, dont elle
                          hérite. Deux gris de plus pour redire ce qu'une barre
                          dit déjà, dont un `gray-300` à 1,7:1. */}
                      {item.quantity && (
                        <span className="text-ink-soft">{item.quantity}</span>
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
    <Modal open={props.open} onClose={props.onClose} title={t("meals.shopping.title")}>
      <div className="space-y-4">
          <Card>
            {/* LE RESTE À ACHETER, EN TÊTE: c'est ce qu'on regarde entre deux
                rayons, et ça n'a de sens qu'à côté de la liste. */}
            <p className="text-sm tabular-nums text-ink">
              {left > 0
                ? plural(
                  left,
                  t("meals.shopping.left_one", { count: left }),
                  t("meals.shopping.left_many", { count: left }),
                )
                : t("meals.shopping.all_done")}
            </p>
            <p className="mt-1 text-sm leading-6 text-ink-soft">{t("meals.shopping.ephemeral")}</p>
          </Card>

          {showWaves && (
            <p className="text-sm leading-6 text-ink-soft">{t("meals.shopping.wave_intro")}</p>
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
                    <h3 className="text-sm font-semibold text-ink">
                      {w === 0
                        ? t("meals.shopping.wave_now")
                        : t("meals.shopping.wave_later", { date: longDate(wave.buyOn) })}
                    </h3>
                    {/* LA RAISON, à côté de la date. Sans elle, la seconde
                        vague est un déplacement de plus qu'on ne s'explique
                        pas — et on cesse de la suivre. */}
                    {wave.servesCookOn && (
                      <p className="text-sm leading-6 text-ink-soft">
                        {t("meals.shopping.wave_serves", { day: weekdayOf(wave.servesCookOn) })}
                      </p>
                    )}
                  </div>
                  {waveGroups.map((group) => renderGroup(group))}
                </section>
              );
            })
            : (
              <>
                {/* ══════════════════════════════════════════════════════════
                    UNE SEULE VAGUE PORTE QUAND MÊME SON JOUR — 2026-09-01
                    ══════════════════════════════════════════════════════════

                    ⛔ LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL: « ça me disait de
                    cuisiner le poulet acheté le lundi, le samedi ». Le calcul
                    était juste; il ne SORTAIT que sur deux vagues ou plus, et
                    une liste sans jour se lit « achète tout maintenant ». Sur
                    dix plans mesurés le 2026-08-23, aucune date n'atteignait
                    l'écran.

                    ⚠️ CE N'EST PAS `wavesAreMeaningful` QUI CHANGE. Sa règle
                    reste juste: une seule vague ne se DÉCOUPE pas en sections,
                    ce serait un en-tête posé sur la totalité. Ce qui manquait
                    n'est pas un découpage, c'est une DATE — et une date tient
                    sur une ligne. */}
                {waves.length === 1 && (
                  <p className="text-sm font-semibold text-ink">
                    {t("meals.shopping.buy_all_on", {
                      date: longDate(waves[0].buyOn),
                    })}
                  </p>
                )}
                {groups.map((group) => renderGroup(group))}
              </>
            )}


          {/* L'EXPORT, EN BAS DU PANNEAU: on l'utilise une fois, avant de
              partir, pas à chaque coup d'œil sur la liste. */}
          {props.mealId && (
            <div>
              <Button variant="secondary" disabled={pdfBusy} onClick={() => void exportPdf()}>
                {pdfBusy ? t("meals.shopping.pdf_building") : t("meals.shopping.pdf")}
              </Button>
              <p className="mt-1 text-sm leading-6 text-ink-soft">{t("meals.shopping.pdf_note")}</p>
              {pdfUrl && (
                <p className="mt-2 text-sm leading-6 text-ink">
                  {t("meals.shopping.pdf_ready")}{" "}
                  {/* UN LIEN, DONC LA FIGUE — c'est la seule chose de la charte
                      qui passe à la teinte de marque sans être un bouton
                      (`fig-700` sur `paper` = 9,98:1). Il héritait d'`ink`
                      jusqu'ici: souligné, mais de la couleur du texte autour. */}
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
                  >
                    {t("meals.shopping.pdf_download")}
                  </a>
                </p>
              )}
              {/* ⛔ ROUGE = ÉCHEC, et un export refusé est un fait. `red-700`
                  (6,13:1) est la valeur du kit; `red-600` était à 4,4:1. */}
              {pdfError && <p className="mt-1 text-sm leading-6 text-red-700">{pdfError}</p>}
            </div>
          )}
      </div>
    </Modal>
  );
}
