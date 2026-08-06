import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Card, SectionLabel } from "../components/ui/Card";
import { displayWeights, type ReviewRow } from "./studentProgressWeight";
import {
  aggregateWeekInFood,
  type FoodEventRow,
} from "../lib/weekInFood";
import {
  aggregateRhythm,
  MOMENT_LABELS,
  MOMENTS,
  type RhythmEventRow,
} from "../lib/mealRhythm";
import { signMealPhotoUrls } from "../api/mealPhoto";

/**
 * PIVOT N3 — `/app/progress` : l'avancée, semaine et mois.
 *
 * ---------------------------------------------------------------------------
 * L'ORDRE DES BLOCS EST UNE DÉCISION, PAS UNE MISE EN PAGE
 * ---------------------------------------------------------------------------
 * 1. LA RÉGULARITÉ d'abord. C'est la seule métrique dont ce dépôt a la preuve
 *    qu'elle prédit le résultat (PHOTO_QUANTIFICATION §5, Peterson 2014,
 *    n=220, p<0,0001 sur la fréquence de log ; la COMPLÉTUDE du log, elle, ne
 *    prédit rien, p>0,05). Elle passe donc en premier et en gros.
 * 2. LA VIVABILITÉ ensuite — les taps du soir. « Est-ce que ça tient ? »
 * 3. LES PORTIONS — la réponse à « je mange beaucoup ou peu ? » sans un kcal.
 * 4. LE POIDS en dernier, et c'est délibéré : la variation d'eau quotidienne
 *    (±1-2 kg) dépasse le signal hebdomadaire, et c'est la métrique la plus
 *    associée aux troubles alimentaires. Il est affiché en clair — arbitrage
 *    produit du 2026-08-03 — mais il ne mène jamais.
 *
 * ---------------------------------------------------------------------------
 * CE QUI N'EST PAS ICI, ET NE DOIT PAS Y ARRIVER
 * ---------------------------------------------------------------------------
 * Aucun score, aucun pourcentage de réalisation, aucune série, aucun badge.
 * Le coach RECOMMANDE, l'élève DÉCIDE, personne ne note (§1.3 bannit
 * explicitement streaks et badges : un jour raté ne casse rien).
 *
 * ---------------------------------------------------------------------------
 * LE GARDE-FOU TCA
 * ---------------------------------------------------------------------------
 * Si `restriction_guard` a levé un drapeau, l'écran chiffré se masque
 * entièrement — doctrine W3.2 : « plus aucun score affiché à l'élève ». Ce
 * n'est pas une préférence d'affichage, c'est une règle clinique, et elle
 * s'applique AVANT toute autre considération de lisibilité.
 */

type Range = "week" | "month";

interface PulseRow {
  local_date: string;
  overall: "good" | "mixed" | "hard";
  axis: string | null;
}
// C8: les événements portent maintenant le contenu alimentaire (aliments
// détectés, groupes) en plus de la bande de portion — même type que l'util
// d'agrégation, une seule forme pour les deux lecteurs.
type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "restricted" }
  | { kind: "ready" };

const AXIS_LABELS: Record<string, string> = {
  energy: "energy",
  hunger: "hunger",
  sleep: "sleep",
};

function daysBack(range: Range): number {
  return range === "week" ? 7 : 30;
}

/**
 * LE PREMIER JOUR DE LA FENÊTRE RÉELLEMENT AFFICHÉE.
 *
 * ── LE DÉFAUT MESURÉ LE 2026-08-05 ────────────────────────────────────────
 * Le filtre était `local_date >= isoDaysAgo(7)` alors que la grille rend
 * `isoDaysAgo(6..0)` — sept jours. Le J-7 entrait donc dans TOUS les
 * dénominateurs de l'écran et ne pouvait atterrir dans AUCUNE case. Mesuré:
 * « 5 meals logged across 4 days » et « Vegetables at 1 of 5 meals » pendant
 * que le journal listait 3 jours et que la grille sommait à 4. Même décalage à
 * 30 jours.
 *
 * Une seule expression sert maintenant les deux — la borne des requêtes et
 * celle des cases — pour qu'elles ne puissent plus diverger.
 */
function windowStart(range: Range, timeZone: string | null = null): string {
  return isoDaysAgo(daysBack(range) - 1, timeZone);
}

/**
 * AUJOURD'HUI DANS LE FUSEAU DE L'ÉLÈVE, en `YYYY-MM-DD`.
 *
 * `en-CA` est le seul locale dont le format court EST l'ISO — c'est l'idiome
 * habituel pour obtenir une date civile dans un fuseau donné sans dépendance.
 */
function todayIn(timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    // Un fuseau invalide en base ne doit pas blanchir l'écran.
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
}

/**
 * Le jour civil `n` jours avant aujourd'hui, DANS LE FUSEAU DE L'ÉLÈVE.
 *
 * Le décalage se fait en arithmétique de chaîne (via un `Date` en UTC pur),
 * jamais en `setDate` sur une date locale: `setDate` sur une nuit de changement
 * d'heure décale d'un jour de plus ou de moins selon le fuseau de la machine —
 * exactement le genre d'écart que cet écran vient de payer.
 */
function isoDaysAgo(n: number, timeZone: string | null = null): string {
  const base = todayIn(timeZone);
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function StudentProgressPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [range, setRange] = React.useState<Range>("week");
  const [pulses, setPulses] = React.useState<PulseRow[]>([]);
  const [events, setEvents] = React.useState<FoodEventRow[]>([]);
  // C8: la fenêtre PRÉCÉDENTE, uniquement pour donner une direction («more
  // vegetables than the week before») — jamais affichée en tant que telle.
  const [prevEvents, setPrevEvents] = React.useState<FoodEventRow[]>([]);
  const [reviews, setReviews] = React.useState<ReviewRow[]>([]);
  /** chemin de bucket -> URL signée, pour les vignettes du journal. */
  const [photoUrls, setPhotoUrls] = React.useState<Record<string, string>>({});
  /**
   * LE FUSEAU DE L'ÉLÈVE, celui qui a daté ses lignes. Null tant qu'il n'est
   * pas lu — voir `timeZone` plus bas pour pourquoi ce n'est pas celui du
   * navigateur.
   */
  const [profileTimeZone, setProfileTimeZone] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      try {
        // LE FUSEAU D'ABORD, parce que les bornes de la fenêtre en dépendent:
        // « aujourd'hui » n'est pas le même jour pour un élève d'Auckland et
        // pour le navigateur qui l'affiche depuis Paris. Une requête de plus,
        // séquentielle, contre un écran dont les dates seraient fausses d'un
        // jour pour tout élève à l'est du spectateur.
        const profileRes = await supabase
          .from("profiles")
          .select("timezone")
          .maybeSingle();
        // Un fuseau illisible DÉGRADE vers celui du navigateur, il ne fait pas
        // échouer l'écran: une grille approximative vaut mieux qu'une page
        // blanche.
        const tz = String(
          (profileRes.data as { timezone?: unknown } | null)?.timezone ?? "",
        ).trim() || null;
        if (cancelled) return;
        setProfileTimeZone(tz);

        const since = windowStart(range, tz);
        // LA BORNE HAUTE. Le `.gte` n'en avait aucune: une ligne datée dans le
        // futur entrait dans les compteurs sans pouvoir s'afficher. Voir
        // `windowStart`.
        const until = isoDaysAgo(0, tz);

        // Le garde TCA d'abord. Si un drapeau est levé, on ne lit même pas le
        // reste: l'écran ne doit pas exister pour cet élève cette semaine.
        const flagRes = await supabase
          .from("weekly_reviews")
          .select("risk_band, week_start_date")
          .order("week_start_date", { ascending: false })
          .limit(1);
        if (flagRes.error) throw new Error(flagRes.error.message);
        const latest = (flagRes.data ?? [])[0] as { risk_band?: string } | undefined;
        if (latest?.risk_band === "restriction_flag") {
          if (!cancelled) setState({ kind: "restricted" });
          return;
        }

        const [pulseRes, eventRes, reviewRes] = await Promise.all([
          supabase
            .from("student_daily_checkins")
            .select("local_date, overall, axis")
            .gte("local_date", since)
            // MÊME borne haute que les repas: un check-in daté de demain chez
            // l'élève entrait sinon dans « HOW IT WENT » (mesuré).
            .lte("local_date", until)
            .order("local_date", { ascending: true }),
          supabase
            .from("protocol_events")
            // C8: le contenu alimentaire voyage avec la ligne. On remonte 7
            // jours PLUS LOIN que la fenêtre affichée quand elle est
            // hebdomadaire: la semaine d'avant ne sert qu'à la direction.
            //
            // `occurred_at` est ce qui rend le RYTHME possible: `slot_key` est
            // NULL sur 71 % des lignes (mesuré), donc une grille bâtie dessus
            // perdrait les deux tiers des repas. Voir `lib/mealRhythm.ts`.
            // `media_path` sert la vignette: revoir son assiette À CÔTÉ de ce
            // qui en a été lu est la réponse la plus directe à « pourquoi je
            // prends des photos ». C'est un chemin de bucket privé, pas une
            // URL — il est signé plus bas.
            .select(
              "local_date, occurred_at, slot_key, portion_band, food_group_ref, " +
                "recognized, disqualified_reason, media_path",
            )
            // LE FILTRE DE SUJET, à la source. `disqualified_reason` existe
            // pour que les lecteurs qui comptent des repas filtrent une colonne
            // au lieu de ré-implémenter « est-ce que ceci est un repas ». Cet
            // écran ne le faisait pas: une photo de menu ou de rayon comptait
            // comme un repas dans « X meals logged » et dans la distribution
            // des portions.
            .is("disqualified_reason", null)
            // `tz` et pas le fuseau du navigateur: la borne basse doit être
            // dans la MÊME horloge que la borne haute, sinon la fenêtre de
            // comparaison déborde d'un jour pour tout élève décalé.
            .gte("local_date", range === "week" ? isoDaysAgo(13, tz) : since)
            .lte("local_date", until),
          supabase
            .from("weekly_reviews")
            .select("week_start_date, outcomes, biofeedback")
            .gte("week_start_date", since)
            .order("week_start_date", { ascending: true }),
        ]);
        if (pulseRes.error) throw new Error(pulseRes.error.message);
        if (eventRes.error) throw new Error(eventRes.error.message);
        if (reviewRes.error) throw new Error(reviewRes.error.message);

        if (cancelled) return;
        setPulses((pulseRes.data ?? []) as PulseRow[]);
        // Le découpage en deux fenêtres se fait ICI, pas dans les cartes: les
        // cartes existantes (régularité, assiettes) ne doivent voir QUE la
        // fenêtre affichée, sinon leurs chiffres changent en silence.
        // `as unknown as` et pas `as`: le client navigateur n'a pas de
        // générique `Database`, donc PostgREST type ce `.select(...)` en
        // `GenericStringError[]`, qui ne recouvre pas assez `FoodEventRow[]`
        // pour un cast direct. Même traversée que partout ailleurs.
        const allEvents = (eventRes.data ?? []) as unknown as FoodEventRow[];
        // Les DEUX bornes, comme la requête: ce filtre et `windowDates` plus bas
        // décrivent désormais le même intervalle.
        setEvents(
          allEvents.filter((e) => e.local_date >= since && e.local_date <= until),
        );
        setPrevEvents(
          range === "week" ? allEvents.filter((e) => e.local_date < since) : [],
        );
        setReviews((reviewRes.data ?? []) as ReviewRow[]);
        setState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  const total = daysBack(range);

  // 1. RÉGULARITÉ — des jours DISTINCTS avec au moins un fait.
  const loggedDays = new Set(events.map((e) => e.local_date)).size;

  // 2. VIVABILITÉ — les taps.
  const good = pulses.filter((p) => p.overall === "good").length;
  const mixed = pulses.filter((p) => p.overall === "mixed").length;
  const hard = pulses.filter((p) => p.overall === "hard").length;
  const taps = good + mixed + hard;
  const axisCounts = new Map<string, number>();
  for (const p of pulses) {
    if (p.axis) axisCounts.set(p.axis, (axisCounts.get(p.axis) ?? 0) + 1);
  }
  // Tri déterministe sur égalité, comme côté serveur.
  const dominantAxis = [...axisCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  // 3. PORTIONS.
  const bands = events.map((e) => e.portion_band).filter(Boolean) as string[];
  const bandCount = (b: string) => bands.filter((x) => x === b).length;

  // 3bis. LA SEMAINE DANS L'ASSIETTE — l'agrégat de fréquence. Des comptes,
  // jamais des pourcentages: « at 9 of 13 meals » décrit, « 69% » note.
  // Les MÊMES bornes que la requête, dans le MÊME fuseau — voir `windowStart`.
  const windowDates = range === "week"
    ? Array.from({ length: 7 }, (_, i) => isoDaysAgo(6 - i, profileTimeZone))
    : [];
  const food = aggregateWeekInFood(events, {
    dates: windowDates,
    prevRows: range === "week" ? prevEvents : undefined,
  });
  const dayName = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" });

  // 3ter. LE RYTHME — la même semaine, mais sur l'axe du TEMPS.
  //
  // ── LE FUSEAU VIENT DU PROFIL, PAS DE L'APPAREIL ────────────────────────
  // Il venait de `Intl.DateTimeFormat().resolvedOptions().timeZone`, au motif
  // que le navigateur est la source la plus proche de la journée vécue. C'était
  // vrai pour le MOMENT et faux pour le JOUR: `local_date` est résolu côté
  // serveur dans `profiles.timezone`. La colonne d'une case et sa ligne étaient
  // donc calculées dans deux horloges différentes.
  //
  // Mesuré 3/3 le 2026-08-05, élève à Auckland, navigateur à Paris: 08:00 →
  // « Night », 12:30 → « Night », 19:00 → « Morning », et le résumé affirmait
  // « Most of what you log lands in the night » à quelqu'un qui mange à 8 h,
  // 12 h 30 et 19 h. Ça mordait dès UNE heure d'écart — un dîner londonien à
  // 21 h 30 tombait en « Night ». Sur l'écran qui porte le garde TCA.
  //
  // Le repli reste l'appareil: mieux vaut une grille approximative qu'aucune.
  const timeZone = profileTimeZone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const rhythmDates = range === "week"
    ? windowDates
    : Array.from({ length: 30 }, (_, i) => isoDaysAgo(29 - i, profileTimeZone));
  const rhythm = aggregateRhythm(events as RhythmEventRow[], {
    dates: rhythmDates,
    timeZone,
  });
  // La taille du bloc dit la BANDE, jamais une quantité. Une case vide reste
  // visible: les trous d'une semaine sont la moitié de son information.
  const BAND_FILL: Record<string, string> = {
    small: "h-2 w-2",
    moderate: "h-3 w-3",
    large: "h-4 w-4",
    unclear: "h-2.5 w-2.5",
  };
  // `unclear` n'a PAS de mot: dire « unclear portion » à quelqu'un qui a
  // photographié son assiette n'ajoute rien et sonne comme un reproche. On se
  // tait sur la taille et on garde les aliments, qui eux sont lus.
  const BAND_WORD: Record<string, string> = {
    small: "small",
    moderate: "regular",
    large: "large",
  };
  // Les jours qui portent réellement quelque chose, du plus récent au plus
  // ancien: un journal se lit par le haut, et la semaine dernière n'est pas ce
  // qu'on vient vérifier après avoir envoyé une photo.
  const loggedDaysDetail = [...rhythm.days]
    .reverse()
    .map((d) => ({
      date: d.date,
      entries: MOMENTS
        .map((m) => ({ moment: m, cell: d.cells[m] }))
        .filter((e) => e.cell !== null),
    }))
    .filter((d) => d.entries.length > 0);

  // LES VIGNETTES. Même chaîne que la conversation: le bucket est privé et sans
  // policy, donc un chemin ne devient affichable qu'après signature. Un échec
  // est avalé — une ligne sans vignette reste une ligne lisible, et perdre
  // l'écran entier pour une image serait le mauvais arbitrage.
  React.useEffect(() => {
    const paths = [
      ...new Set(
        loggedDaysDetail.flatMap((d) =>
          d.entries.flatMap((e) => e.cell!.mediaPaths)
        ),
      ),
    ].filter((p) => !(p in photoUrls));
    if (paths.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const urls = await signMealPhotoUrls(paths);
        if (!cancelled && Object.keys(urls).length > 0) {
          setPhotoUrls((prev) => ({ ...prev, ...urls }));
        }
      } catch {
        // Muet par conception: voir ci-dessus.
      }
    })();
    return () => { cancelled = true; };
  }, [loggedDaysDetail, photoUrls]);

  // 4. POIDS — la pesée du point du dimanche. Voir `displayWeights`.
  const weights = displayWeights(reviews);
  const firstWeight = weights[0] ?? null;
  const lastWeight = weights.length > 0 ? weights[weights.length - 1] : null;

  if (state.kind === "loading") {
    return (
      <KeelAppShell variant="student" title="My progress">
        <p className="text-sm text-gray-500">Loading…</p>
      </KeelAppShell>
    );
  }
  if (state.kind === "error") {
    return (
      <KeelAppShell variant="student" title="My progress">
        <Card tone="warning">
          <p className="text-sm text-gray-900">We could not load your data.</p>
          <p className="mt-1 text-xs text-gray-600">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }
  if (state.kind === "restricted") {
    // Doctrine W3.2 — aucun chiffre affiché à l'élève quand le plancher TCA
    // est levé. On ne dit pas pourquoi: nommer le drapeau ici serait un
    // diagnostic posé par une machine.
    return (
      <KeelAppShell variant="student" title="My progress">
        <Card>
          <p className="text-sm leading-6 text-gray-800">
            We are setting the numbers aside for now. What matters this week
            is how you feel — and your coach knows.
          </p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell variant="student" title="My progress">
      <div className="space-y-6">
        <div className="flex gap-2">
          {(["week", "month"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                range === r
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-700 ring-1 ring-gray-200"
              }`}
            >
              {r === "week" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>

        {/* 1. LA RÉGULARITÉ — la seule métrique dont on a la preuve qu'elle prédit. */}
        <Card>
          <SectionLabel>Your consistency</SectionLabel>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {loggedDays}<span className="text-lg text-gray-400"> / {total} days</span>
          </p>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            This is the thing that matters most, by a distance. Not how perfect
            the days were — the fact that they got logged at all.
          </p>
        </Card>

        {/* 2. LA VIVABILITÉ */}
        <Card>
          <SectionLabel>How it went</SectionLabel>
          {taps === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              No evening check-ins in this period yet.
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={"positive" as BadgeTone}>{good} all good</Badge>
                <Badge tone={"caution" as BadgeTone}>{mixed} so-so</Badge>
                <Badge tone={"critical" as BadgeTone}>{hard} rough</Badge>
              </div>
              {dominantAxis && (mixed + hard) > 0 ? (
                <p className="mt-3 text-sm text-gray-700">
                  When it is hard, it is most often{" "}
                  <span className="font-medium">{AXIS_LABELS[dominantAxis] ?? dominantAxis}</span>.
                </p>
              ) : null}
            </>
          )}
        </Card>

        {/* 3bis. LA SEMAINE DANS L'ASSIETTE — ce que les photos construisent.
            Le payoff visible du geste quotidien: des fréquences et des
            aliments, pas un score. Aucun kcal ici, par contrat produit. */}
        <Card>
          <SectionLabel>{range === "week" ? "Your week in food" : "Your month in food"}</SectionLabel>
          {food.meals === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              No photos read in this period yet. Send a plate in Chat and
              it starts adding up here.
            </p>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-gray-800">
              <p>
                <span className="font-medium">{food.meals}</span> meal{food.meals > 1 ? "s" : ""} logged
                across <span className="font-medium">{food.daysLogged}</span> day{food.daysLogged > 1 ? "s" : ""}.
              </p>
              <p>
                Vegetables at {food.vegMeals} of {food.meals} meals · protein
                at {food.proteinMeals} · fruit at {food.fruitMeals}.
              </p>
              {food.topFoods.length > 0 ? (
                <p className="text-gray-700">
                  Seen most:{" "}
                  {food.topFoods.map((f) => `${f.label} ×${f.count}`).join(" · ")}
                </p>
              ) : null}
              {food.watchCounts.length > 0 ? (
                // Un COMPTE, pas un commentaire. « Fried food ×3 » est un fait;
                // la morale reste chez le coach.
                <p className="text-gray-700">
                  Also this period:{" "}
                  {food.watchCounts.map((w) => `${w.label} ×${w.count}`).join(" · ")}
                </p>
              ) : null}
              {food.dinnerLarge && food.dinnerLarge.total >= 2 ? (
                <p className="text-gray-700">
                  Dinners ran large {food.dinnerLarge.large} of {food.dinnerLarge.total} nights.
                </p>
              ) : null}
              {range === "week" && food.missingDays.length > 0 && food.missingDays.length <= 4 ? (
                <p className="text-gray-700">
                  Nothing logged on {food.missingDays.map(dayName).join(", ")}.
                </p>
              ) : null}
              {food.vegTrend ? (
                <p className="text-gray-700">
                  {food.vegTrend === "up"
                    ? "More vegetables than the week before."
                    : food.vegTrend === "down"
                    ? "Fewer vegetables than the week before."
                    : "About the same vegetables as the week before."}
                </p>
              ) : null}
              <p className="pt-1 text-xs leading-5 text-gray-500">
                Counts from your photos — what showed up, and how often. No
                calories here: the logging itself is what moves the needle.
              </p>
            </div>
          )}
        </Card>

        {/* 3bis-b. CE QUE TU AS MANGÉ — le journal, nommément.
            LE DÉFAUT QUE CETTE CARTE CORRIGE, mesuré sur une vraie ligne: un
            bol d'avoine au fromage blanc, lu par le modèle avec 0,95 et 0,98
            de confiance, ne produisait à l'écran que « 1 meal logged » et une
            ligne de zéros. Les aliments n'étaient nommés nulle part, parce que
            le seul endroit qui les nommait (`topFoods`) exige de les avoir vus
            DEUX fois — donc jamais sur une photo. L'élève faisait le geste et
            ne recevait rien qui prouve qu'on avait regardé. */}
        <Card>
          <SectionLabel>What you ate</SectionLabel>
          {loggedDaysDetail.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              Nothing logged in this period yet. Send a plate in Chat, or just
              tell me what you had — both end up here.
            </p>
          ) : (
            <>
              <div className="mt-3 space-y-3">
                {loggedDaysDetail.map((d) => (
                  <div key={d.date}>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      {dayName(d.date)}
                    </p>
                    <ul className="mt-1 space-y-2">
                      {d.entries.map((e) => {
                        const thumb = e.cell!.mediaPaths
                          .map((p) => photoUrls[p])
                          .find(Boolean) ?? null;
                        return (
                          <li key={e.moment} className="flex gap-3">
                            {/* LA VIGNETTE, à gauche de ce qui en a été lu.
                                C'est la preuve que la photo a servi à quelque
                                chose — et le seul endroit du produit où l'élève
                                peut relire sa propre semaine. */}
                            {thumb
                              ? (
                                <img
                                  src={thumb}
                                  alt=""
                                  data-testid="log-thumb"
                                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                                />
                              )
                              : null}
                            <div className="min-w-0 text-sm text-gray-800">
                              <p>
                                <span className="text-gray-500">
                                  {MOMENT_LABELS[e.moment]}
                                </span>{" "}
                                —{" "}
                                {e.cell!.foods.length > 0
                                  ? e.cell!.foods.join(", ")
                                  : "logged, nothing readable in the photo"}
                                {e.cell!.band && BAND_WORD[e.cell!.band]
                                  ? (
                                    <span className="text-gray-500">
                                      {" "}· {BAND_WORD[e.cell!.band]} portion
                                    </span>
                                  )
                                  : null}
                              </p>
                              {/* CE QUE LE MODÈLE A VU DE LA TAILLE, dans ses
                                  mots. Une phrase observable, jamais un nombre:
                                  elle dit POURQUOI la portion est classée
                                  ainsi, là où le jeton seul ressemble à un
                                  verdict tombé de nulle part. */}
                              {e.cell!.rationale
                                ? (
                                  <p className="mt-0.5 text-xs leading-5 text-gray-500">
                                    {e.cell!.rationale}
                                  </p>
                                )
                                : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                This is what was read from your photos and from what you told
                me. If something is wrong, say so in Chat and it gets corrected
                on the spot.
              </p>
            </>
          )}
        </Card>

        {/* 3ter. LE RYTHME — quand tu manges, jour par jour.
            `weekInFood` dit CE QUI a été mangé; ceci dit QUAND. Une grille et
            pas une moyenne: un coach lit un rythme d'un coup d'œil, il ne le
            lit pas dans un chiffre. Aucun kcal ici non plus — la taille du
            bloc est la BANDE de portion, dont le jeton est la barre d'erreur. */}
        <Card>
          <SectionLabel>Your rhythm</SectionLabel>
          {rhythm.meals === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              Nothing logged in this period yet. Tell me what you ate in Chat,
              or send a plate — both land here.
            </p>
          ) : (
            <>
              {range === "week" ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-separate border-spacing-1 text-xs">
                    <thead>
                      <tr>
                        <th className="w-20" />
                        {rhythm.days.map((d) => (
                          <th
                            key={d.date}
                            className="pb-1 text-center font-medium text-gray-500"
                          >
                            {dayName(d.date)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MOMENTS.map((moment) => (
                        <tr key={moment}>
                          <th className="pr-2 text-right font-normal text-gray-500">
                            {MOMENT_LABELS[moment]}
                          </th>
                          {rhythm.days.map((d) => {
                            const cell = d.cells[moment];
                            return (
                              <td key={d.date} className="text-center">
                                <div
                                  data-testid="rhythm-cell"
                                  data-count={cell?.count ?? 0}
                                  title={cell
                                    ? [
                                      cell.foods.join(", ") ||
                                      `${cell.count} logged`,
                                      cell.band && BAND_WORD[cell.band]
                                        ? `${BAND_WORD[cell.band]} portion`
                                        : null,
                                    ].filter(Boolean).join(" · ")
                                    : "nothing logged"}
                                  className="flex h-7 w-full items-center justify-center rounded-md bg-gray-100"
                                >
                                  {cell ? (
                                    <span
                                      className={`rounded-full bg-gray-900 ${
                                        BAND_FILL[cell.band ?? "unclear"]
                                      }`}
                                    />
                                  ) : null}
                                  {cell && cell.count > 1 ? (
                                    <span className="ml-1 text-[10px] text-gray-500">
                                      ×{cell.count}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 space-y-1 text-sm text-gray-800">
                  {MOMENTS.map((moment) => (
                    <p key={moment}>
                      <span className="inline-block w-24 text-gray-500">
                        {MOMENT_LABELS[moment]}
                      </span>
                      {rhythm.byMoment[moment]}
                    </p>
                  ))}
                </div>
              )}
              {rhythm.busiest ? (
                <p className="mt-3 text-sm text-gray-700">
                  Most of what you log lands in the{" "}
                  <span className="font-medium">
                    {MOMENT_LABELS[rhythm.busiest].toLowerCase()}
                  </span>.
                </p>
              ) : null}
              {rhythm.unplaced > 0 ? (
                // On le DIT plutôt que de ranger ces faits dans une case au
                // hasard: une grille qui invente un horaire est pire qu'une
                // grille incomplète.
                <p className="mt-1 text-sm text-gray-700">
                  {rhythm.unplaced} log{rhythm.unplaced > 1 ? "s" : ""} without a
                  time of day — not placed above.
                </p>
              ) : null}
              <p className="mt-2 text-xs leading-5 text-gray-500">
                The block size is how big the plate looked — small, regular or
                large. That is the whole scale, and it is deliberately the whole
                scale: a number here would be wrong in a direction we can
                predict.
              </p>
            </>
          )}
        </Card>

        {/* 3. LES PORTIONS — la réponse à "beaucoup ou peu", sans un kcal. */}
        <Card>
          <SectionLabel>Your plates</SectionLabel>
          {bands.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No photos read in this period.</p>
          ) : (
            <p className="mt-3 text-sm text-gray-800">
              {bands.length} plate{bands.length > 1 ? "s" : ""}:{" "}
              {bandCount("small")} small,{" "}
              {bandCount("moderate")} regular,{" "}
              {bandCount("large")} large
              {bandCount("unclear") > 0 ? `, ${bandCount("unclear")} unclear` : ""}.
            </p>
          )}
        </Card>

        {/* 4. LE POIDS, EN DERNIER. Une pesée par semaine, lue comme une
            tendance: le chiffre du jour n'est pas l'information. */}
        <Card>
          <SectionLabel>Your weight</SectionLabel>
          {lastWeight === null ? (
            <p className="mt-2 text-sm text-gray-600">
              No weight in this period yet. You enter it in the Sunday
              check-in.
            </p>
          ) : (
            <>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {lastWeight.toFixed(1)}<span className="text-lg text-gray-400"> kg</span>
              </p>
              {firstWeight !== null && weights.length > 1 ? (
                <p className="mt-1 text-sm text-gray-700">
                  {(lastWeight - firstWeight >= 0 ? "+" : "")}
                  {(lastWeight - firstWeight).toFixed(1)} kg over the period
                </p>
              ) : null}
              <p className="mt-2 text-xs leading-5 text-gray-500">
                One weigh-in a week, read as a line and not as a number: day to
                day, water moves the scale more than a whole week of eating
                does.
              </p>
            </>
          )}
        </Card>
      </div>
    </KeelAppShell>
  );
}
