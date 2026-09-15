import React from "react";

import { type HouseholdDishView, loadMemberPersonalPlan } from "../api/household";
import {
  dismissMergeNotice,
  loadMergeNotices,
  mergeMemberPlan,
  type MergeNoticesView,
  type MergeNoticeView,
  unmergeMemberPlan,
} from "../api/householdMerge";
import { edgeRefusalKey, mergeCardRefusalKey, mergeCardSkipKey } from "../copy/planRefusals";
import { dishDayLabel, dishSlotLabel } from "../api/mealLabels";
import { formatDate as formatDateIn } from "../i18n/format";
import { t } from "../i18n/t";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";

// KEEL — L8 · LA PROPOSITION DE FUSION, ET SES TROIS SORTIES (D8, D10, D11).
//
// Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md.
//
// ── LA RÈGLE QUI GOUVERNE CETTE CARTE ─────────────────────────────────────
// `exits` EST LA LISTE DES BOUTONS. Le serveur en retire déjà ce qu'il
// refuserait — `merge` quand le plafond de D11 est atteint (mesuré), `unmerge`
// quand le plan porteur n'a plus de queue à recomposer. Afficher un bouton
// absent de cette liste, c'est promettre un geste qui rendra 409 ou 429; L5 l'a
// mesuré dans l'autre sens (le bouton offert pendant que le geste refusait) et
// c'est précisément ce qui a fait exister `mergeCarriers`.
//
// ── AUCUNE PHRASE N'EST RECOMPOSÉE ICI ────────────────────────────────────
// `sentence` arrive calculée: elle porte les trois nombres de D16 (« son plan
// couvre 5 jours, dont 2 déjà passés — je peux fusionner les 3 restants »), et
// les trois viennent de `bestMergePair`, la MÊME fonction que la fusion appelle.
// La réécrire côté navigateur ferait un second avis sur des jours, avec deux
// nombres plausibles et un seul vrai.
//
// ── CE QU'ELLE N'AFFICHE JAMAIS ───────────────────────────────────────────
// Aucun objectif, aucun poids, aucune calorie, aucun « pourquoi » de plat. Le
// dépliant « voir son plan » ne montre que des titres, des jours et des
// moments — voir `HouseholdDishView`.

/**
 * « 7 août » · « 7 Aug ». LA COUTURE QUE CE FICHIER PORTAIT, nommée depuis le
 * lot 4 dans `i18n/catalog.ts`: `/app/household` est une page DÉCLARÉE
 * française, et ces quatre dates y sortaient en `en-GB`.
 */
function formatDate(value: string): string {
  return formatDateIn(value, { year: false });
}

/** Le dernier jour d'une fenêtre, pour dire jusqu'où une reprise tient. */
function windowEnd(startsOn: string, durationDays: number): string {
  const d = new Date(`${startsOn}T00:00:00`);
  if (Number.isNaN(d.getTime())) return startsOn;
  d.setDate(d.getDate() + Math.max(0, durationDays - 1));
  return d.toISOString().slice(0, 10);
}

export default function HouseholdMergeCard(
  { isOwner, hasCounterpart, onComposed }: {
    /** D10 — seul le maître voit ces propositions, et le serveur le tient (403). */
    isOwner: boolean;
    /**
     * AU MOINS UNE BOUCHE RÉCLAMÉE EN PLUS DU MAÎTRE (`mergeCounterparts`).
     *
     * ⚠️ FAUX ⇒ LA CARTE N'EXISTE PAS, et elle ne LIT même pas. Une bouche sans
     * compte ne compose rien, donc n'a rien à fusionner: la lecture rendrait
     * `notices: []`, et la carte trois phrases pour dire qu'il ne se passe rien
     * (mesuré le 2026-08-14). Le pourquoi de la règle est écrit une seule fois,
     * au-dessus de `mergeCounterparts` dans `api/household.ts`.
     *
     * La garde est AVANT `loadMergeNotices`: un appel edge par montage, pour
     * une réponse qu'on ne rendrait pas, est un coût sans lecteur.
     */
    hasCounterpart: boolean;
    /** Un geste vient d'écrire un plan: la page entière doit se relire. */
    onComposed: () => Promise<void> | void;
  },
): React.ReactElement | null {
  const [view, setView] = React.useState<MergeNoticesView | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!isOwner || !hasCounterpart) return;
    const res = await loadMergeNotices();
    if (res.ok) {
      setView(res.view);
      setLoadError(null);
      return;
    }
    // ⚠️ ON NE SE VIDE PAS. « Personne n'a pris la main » et « la lecture a
    // échoué » doivent être deux phrases différentes: le jeton nommé quand on
    // le connaît, la phrase de repli sinon — jamais un blanc.
    setView(null);
    const key = edgeRefusalKey(res.reason);
    setLoadError(key ? t(key) : t("household.merge.load_failed"));
  }, [isOwner, hasCounterpart]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isOwner) return null;
  // ZÉRO PROFIL RÉCLAMÉ ⇒ AUCUN BLOC. Pas d'état vide, pas de plafond, pas de
  // liste « non proposés »: il n'y a personne avec qui fusionner.
  if (!hasCounterpart) return null;
  // Garde de montage: tant que la première lecture n'a rien rendu ET n'a pas
  // échoué, on ne raconte rien — ni « personne », ni une carte vide.
  if (view === null && loadError === null) return null;

  const quota = view?.quota ?? null;

  async function run(action: () => Promise<{ ok: boolean; reason: string | null }>) {
    setBusy(true);
    setFailure(null);
    try {
      const res = await action();
      if (!res.ok) {
        const token = res.reason ?? "";
        // Les onze refus de fusion, les six de défusion, le 402 du gel et le
        // 429 du plafond ont tous un nom côté serveur. C'est ici qu'ils
        // cessent d'arriver en jargon.
        //
        // ⚠️ LA CHAÎNE EST DANS `copy/planRefusals.ts`, PAS ICI. Elle avait
        // deux maillons et il en manquait un: `not_a_member` et
        // `not_authenticated` — que les DEUX RPC de réglage refusent, et que
        // « refuser une proposition » atteint depuis cette carte-ci — n'avaient
        // d'étiquette sur aucune table consultée d'ici. Mesuré deux fois en
        // HTTP réel. Le test appelle la même fonction que cette ligne.
        const key = mergeCardRefusalKey(token);
        setFailure(key ? t(key) : token);
      }
      // On relit dans TOUS les cas, y compris après un refus: un refus signifie
      // souvent que les plans ont bougé depuis l'affichage (`notice_moved_on`,
      // `merge_plan_vanished`), et réafficher l'ancien état ferait recliquer sur
      // le même mur.
      await refresh();
      await onComposed();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionLabel>{t("household.merge.title")}</SectionLabel>
      {loadError ? <p className="text-sm text-red-700">{loadError}</p> : null}
      {view?.frozen
        ? <p className="mb-2 text-sm text-amber-800">{t("household.merge.frozen")}</p>
        : null}
      {view && view.notices.length === 0 && !loadError
        ? <p className="text-sm text-ink-soft">{t("household.merge.none")}</p>
        : null}
      {view && view.notices.length > 0
        ? (
          <>
            <p className="mb-3 text-sm text-ink-soft">{t("household.merge.body")}</p>
            <ul className="flex flex-col gap-4">
              {view.notices.map((notice) => (
                <NoticeRow
                  key={`${notice.memberId}:${notice.kind}`}
                  notice={notice}
                  busy={busy}
                  onMerge={() => run(() => mergeMemberPlan(notice.memberId))}
                  onUnmerge={() => run(() => unmergeMemberPlan(notice.memberId))}
                  onDismiss={() =>
                    run(async () => {
                      // ⚠️ `dismissValidatedAt`, PAS `plan.validatedAt`. Le
                      // registre nomme ce piège: les deux dates existent,
                      // toutes deux plausibles, et la mauvaise fait refuser
                      // `notice_moved_on` en boucle sans rien expliquer.
                      const at = notice.dismissValidatedAt;
                      if (!at) return { ok: false, reason: "validated_at_required" };
                      const res = await dismissMergeNotice(notice.memberId, at);
                      return { ok: res.ok, reason: res.reason || null };
                    })}
                />
              ))}
            </ul>
          </>
        )
        : null}
      {failure ? <p className="mt-3 text-sm text-red-700">{failure}</p> : null}

      {/* ── L7/D11 — LE PLAFOND, À PARTIR DE LA PREMIÈRE FUSION ───────────
          « Le plafond ne se voit nulle part avant d'être atteint » était une
          ligne de L8, et elle est allée un cran trop loin: la carte annonçait
          « il reste 4 fusions sur 4 cette semaine » à un foyer qui n'en avait
          fait aucune. « 4 sur 4 » n'est pas un fait, c'est la définition du
          plafond; « il reste 1 sur 4 » en est un.
          ⚠️ `used > 0` ET PAS `remaining < limit`: les deux seraient vrais
          ensemble aujourd'hui, mais `remaining` est compté EN BASE et rendu tel
          quel (on ne recalcule jamais `limit - used` ici) — le comparer
          reviendrait à rouvrir l'arithmétique que ce fichier refuse.
          Les nombres viennent du serveur (`keel_household_merge_quota_state`);
          aucun fichier TypeScript de ce dépôt ne connaît le `N + 3`, et un test
          de source le tient. */}
      {quota && quota.used > 0
        ? (
          <p className="mt-3 text-sm text-ink-soft">
            {quota.exhausted
              ? t("household.merge.quota_none", {
                limit: quota.limit,
                date: formatDate(quota.resetsOn),
              })
              : t("household.merge.quota_left", {
                remaining: quota.remaining,
                limit: quota.limit,
              })}
          </p>
        )
        : null}

      {/* CE QUE LA PROCHAINE COMPOSITION REPRENDRA D'OFFICE, AVEC SA PORTÉE.
          Hors de cette fenêtre la reprise ne colle pas — le serveur rend la
          fenêtre du plan porteur exprès, et une liste d'ids nus promettrait
          une reprise que toute composition d'une autre semaine ne ferait
          pas. */}
      {view && view.held.length > 0
        ? (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-soft">
            {view.held.map((held) => (
              <li key={held.planId + held.memberId}>
                {t("household.merge.held", {
                  to: formatDate(windowEnd(held.window.startsOn, held.window.durationDays)),
                })}
              </li>
            ))}
          </ul>
        )
        : null}

      {/* POURQUOI LES AUTRES BOUCHES N'APPARAISSENT PAS. Sans cette liste,
          « pourquoi Zoé n'est-elle pas là ? » n'a de réponse que dans une base
          de production. `member_is_owner` est filtré: dire au maître qu'on ne
          lui propose pas de fusionner son propre plan est du bruit.

          ⛔ `no_validated_plan` EST FILTRÉ AUSSI, DEPUIS LE 2026-08-14, ET CE
          N'EST PAS LA MÊME RAISON. « Christèle — cette personne n'a validé
          aucun plan à elle » explique une absence à quelqu'un qui ne peut rien
          en faire: seul le TITULAIRE peut valider un plan à lui, et il ne lit
          pas cet écran-là (D10 — la carte est réservée au maître). Le maître,
          lui, n'a aucun geste: il ne peut ni composer ni valider à la place
          d'un autre, et il n'existe aucun canal 1:1 pour le lui demander.
          Une bouche sans compte porte ce motif en permanence, par nature.
          Les cinq autres motifs restent: `proposals_muted` est un réglage que
          le maître a posé et peut retirer, `merge_quota_exhausted` passe la
          semaine prochaine, les refus de fenêtre bougent avec les plans. */}
      {view
        ? (() => {
          const skipped = view.skipped.filter((s) =>
            s.reason !== "member_is_owner" && s.reason !== "no_validated_plan"
          );
          if (skipped.length === 0) return null;
          return (
            <div className="mt-3 border-t border-line pt-3">
              {/* L'ÉTIQUETTE DE LA CHARTE (§3), PAS UNE RECOPIE. Ce sur-titre
                  se tenait à la main en `text-xs uppercase tracking-wide
                  gray-400` — 2,84:1, sous le seuil du texte. `text-label` porte
                  déjà la taille, l'approche de +0,1em et l'interligne; il ne
                  reste que les capitales et l'encre.
                  ⚠️ PAS de `SectionLabel` ici: il pose une équerre, et l'écran
                  en rend déjà dix. La signature ouvre une SECTION, pas le
                  sous-titre d'une carte. */}
              <p className="text-label font-semibold uppercase text-ink-soft">
                {t("household.merge.skipped_title")}
              </p>
              <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-soft">
                {skipped.map((s) => {
                  // ⚠️ PAS `mergeSkipKey` SEUL. Le lecteur range aussi des
                  // refus de FENÊTRE dans `skipped[]` (`skip(pair.refusal)`),
                  // et ceux-là ont leurs mots dans la table des refus edge.
                  // Sans le repli, « Zoe — merge_windows_disjoint » s'affiche
                  // tel quel: mesuré.
                  const key = mergeCardSkipKey(s.reason);
                  return (
                    <li key={s.memberId + s.reason}>
                      <span className="font-medium">{s.displayName}</span>
                      {" — "}
                      {key ? t(key) : s.reason}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })()
        : null}
    </Card>
  );
}

/**
 * UNE PROPOSITION, OU UN AVERTISSEMENT — distingués par `kind`, jamais par la
 * présence d'un champ.
 *
 * D8 et D10 demandent la même chose au maître (un geste sur une personne) et ne
 * disent PAS la même chose: une proposition parle du plan d'un autre, un
 * avertissement parle de SON plan à lui, dont la ligne vivante porte la reprise
 * d'un plan que l'intéressé a remplacé depuis.
 */
function NoticeRow(
  { notice, busy, onMerge, onUnmerge, onDismiss }: {
    notice: MergeNoticeView;
    busy: boolean;
    onMerge: () => void;
    onUnmerge: () => void;
    onDismiss: () => void;
  },
) {
  const warning = notice.kind === "merged_plan_revalidated";
  return (
    <li className="border-t border-line pt-3 first:border-0 first:pt-0">
      {warning
        ? (
          <>
            <p className="text-sm font-medium">{t("household.merge.revalidated_title")}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {t("household.merge.revalidated_body")}
            </p>
          </>
        )
        : null}
      {/* LA PHRASE DU SERVEUR, TELLE QUELLE. Elle nomme la personne et ses
          jours; l'écran ne la recompose pas. */}
      <p className={warning ? "mt-1 text-sm text-ink-soft" : "text-sm"}>
        {notice.sentence}
      </p>
      {notice.mergeable
        ? (
          <p className="mt-1 text-sm text-ink-soft">
            {t("household.merge.window", {
              days: notice.mergeable.window.durationDays,
              from: formatDate(notice.mergeable.window.startsOn),
            })}
            {notice.mergeable.daysAlreadyPast > 0
              ? " " +
                t("household.merge.window_past", {
                  days: notice.mergeable.daysAlreadyPast,
                })
              : ""}
            {/* D1 — CE QUE LE GESTE REFERA EN PLUS. Muet dans le cas nominal
                (`recomposed === window`): une carte qui explique toujours tout
                finit par ne plus être lue. Elle parle quand leur plan s'arrête
                avant la fin de la semaine du foyer — la fusion refait alors la
                semaine jusqu'au bout, faute de quoi la fin de semaine n'aurait
                plus aucun plan (mesuré: 409 après 16,1 s de modèle). */}
            {notice.mergeable.recomposed &&
                notice.mergeable.recomposed.durationDays >
                  notice.mergeable.window.durationDays
              ? " " +
                t("household.merge.window_rebuilt", {
                  days: notice.mergeable.recomposed.durationDays,
                })
              : ""}
          </p>
        )
        : null}
      {notice.merged?.unmergeWindow
        ? (
          <p className="mt-1 text-sm text-ink-soft">
            {t("household.merge.unmerge_window", {
              days: notice.merged.unmergeWindow.durationDays,
              from: formatDate(notice.merged.unmergeWindow.startsOn),
            })}
          </p>
        )
        : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* ⚠️ UN BOUTON PAR SORTIE OFFERTE, ET RIEN D'AUTRE. */}
        {/* ⛔ CE BOUTON N'EST PLUS FIGUE, ET C'EST UN COMPTAGE, PAS UN GOÛT.
            Il portait `variant="primary"` — donc la teinte de marque — et cette
            carte en rend UN PAR PROPOSITION: trois bouches à fusionner faisaient
            trois actions principales dans la même carte, sur un écran qui en
            porte déjà une (la fiche du compte maître). « Une seule action figue
            par vue rendue » n'est pas une préférence: trois boutons pleins l'un
            sous l'autre, c'est zéro hiérarchie.
            ⚠️ FUSIONNER ET DÉFUSIONNER SE RESSEMBLENT MAINTENANT, ET C'EST
            VOULU. Les deux sorties arrivent parfois ENSEMBLE — le lecteur rend
            `["unmerge","merge","dismiss"]` (test `household_merge_notice_test`,
            l. 489) — et ce sont les deux sens d'un même geste: leur donner deux
            poids visuels dirait que l'un est le bon. Ce qui les distingue est
            leur LIBELLÉ, et « refuser » reste en `ghost` parce que c'est le seul
            des trois qu'on peut ignorer. */}
        {notice.exits.includes("merge")
          ? (
            <Button size="sm" disabled={busy} onClick={onMerge}>
              {busy ? t("household.merge.working") : t("household.merge.merge_cta")}
            </Button>
          )
          : null}
        {notice.exits.includes("unmerge")
          ? (
            <Button size="sm" disabled={busy} onClick={onUnmerge}>
              {t("household.merge.unmerge_cta")}
            </Button>
          )
          : null}
        {/* `dismissValidatedAt` NUL ⇒ pas de bouton: la base exige cette date
            et refuserait `validated_at_required`. C'est un rétrécissement de
            ce que le serveur offre, jamais un élargissement. */}
        {notice.exits.includes("dismiss") && notice.dismissValidatedAt
          ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
              {t("household.merge.dismiss_cta")}
            </Button>
          )
          : null}
        <MemberPlanDisclosure userId={notice.userId} />
      </div>
    </li>
  );
}

/**
 * « LE MAÎTRE ACCÈDE À TOUS LES PLANS » — l'autre moitié de D9.
 *
 * Sa surface de cuisine n'affiche QUE le plan qu'il cuisine; celui d'un
 * secondaire ne s'y invite pas. Mais il doit pouvoir le REGARDER pour décider
 * s'il le fusionne. « Accéder » et « afficher » ne sont pas la même chose, et
 * c'est tout l'arbitrage: d'où un dépliant fermé par défaut, chargé à la
 * demande, qui ne montre que des titres.
 */
function MemberPlanDisclosure({ userId }: { userId: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [dishes, setDishes] = React.useState<HouseholdDishView[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  if (!userId) return null;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          if (open) {
            setOpen(false);
            return;
          }
          setOpen(true);
          if (dishes !== null || failed) return;
          try {
            const today = new Date().toISOString().slice(0, 10);
            setDishes(await loadMemberPersonalPlan(userId, today) ?? []);
          } catch {
            // « Rien à lire » et « on n'a pas pu lire » sont deux phrases.
            setFailed(true);
          }
        }}
      >
        {open ? t("household.merge.close_plan") : t("household.merge.open_plan")}
      </Button>
      {open
        ? (
          <ul className="mt-1 w-full flex-col gap-0.5 pl-1 text-sm text-ink-soft">
            {failed
              ? <li>{t("household.merge.plan_unreadable")}</li>
              : dishes === null
              ? <li>…</li>
              : dishes.length === 0
              ? <li>{t("household.merge.plan_empty")}</li>
              : dishes.map((dish, i) => (
                <li key={`${dish.title}:${i}`}>
                  {[dishDayLabel(dish.day), dishSlotLabel(dish.slot)]
                    .filter(Boolean)
                    .join(" · ")}
                  {dish.day || dish.slot ? " — " : ""}
                  {dish.title}
                </li>
              ))}
          </ul>
        )
        : null}
    </>
  );
}
