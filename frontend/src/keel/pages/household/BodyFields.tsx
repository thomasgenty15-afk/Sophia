// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// Le corps d'une bouche: taille, poids, sexe.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import React from "react";
import { MEMBER_GENDERS, type MemberBodyView, type MemberGender } from "../../api/household";
import { MouthActivityAxesFields, MouthAppetiteFields, type MouthActivityAndStructure } from "../../components/MouthFormDialog";
import { t } from "../../i18n/t";
import { Button } from "../../components/ui/Button";
import { SectionLabel } from "../../components/ui/Card";
import { Field, inputClass } from "../../components/ui/Field";

/**
 * LE CORPS D'UNE BOUCHE — taille, poids, sexe. TOUT-OU-RIEN.
 *
 * Décision humaine du 2026-08-12, qui renverse FF-047 §3 et le « cran 2 » du
 * README du foyer: on collecte pour CHAQUE bouche, y compris sans compte, y
 * compris pour un mineur.
 *
 * ⚠️ CE QUE CE FORMULAIRE NE FAIT PAS, ET NE FERA PAS. Il ne rend aucun
 * chiffre calculé — ni besoin, ni IMC, ni catégorie, ni cible. Ce qu'on saisit
 * entre dans le MOTEUR et en ressort en grammes d'aliment sur une assiette.
 * C'est la ligne de partage du lot: collecter et calculer, jamais énoncer.
 */
export function BodyFields(
  { body, busy, needsBirthDate, onSave }: {
    body: MemberBodyView | null;
    busy: boolean;
    /** L'équation dépend de l'âge, et elle n'est pas la même avant 18 ans. */
    needsBirthDate: boolean;
    onSave: (
      h: number,
      w: number,
      g: MemberGender,
      extras: MouthActivityAndStructure,
    ) => Promise<boolean>;
  },
) {
  const [height, setHeight] = React.useState(body ? String(body.heightCm) : "");
  const [weight, setWeight] = React.useState(body ? String(body.weightKg) : "");
  const [gender, setGender] = React.useState<MemberGender | "">(body?.gender ?? "");
  const [saved, setSaved] = React.useState(false);
  // ── ② LES DEUX AXES · ⑤ L'APPÉTIT (2026-08-20) ────────────────────────
  const [extras, setExtras] = React.useState<MouthActivityAndStructure>({
    dayActivity: body?.dayActivity ?? "",
    sportFrequency: body?.sportFrequency ?? "",
    appetite: body?.appetite ?? "",
  });
  /**
   * ⛔ ON RESÈME SUR LA LECTURE, PAS AU MONTAGE — ET ICI ÇA COÛTE PLUS CHER
   * QU'AILLEURS.
   *
   * Les trois champs du dessus (taille, poids, sexe) sont semés au montage, et
   * c'est supportable: la porte les lit comme un tout-ou-rien qu'on renvoie
   * complet. Ces cinq-là, non. Depuis le 2026-08-20 la porte accepte de
   * DÉ-répondre — le drapeau `…_asked` autorise l'écriture d'un `null` — donc
   * un formulaire figé sur du vide non lu ne se contente plus de ne rien dire:
   * il EFFACE. C'est « formulaire figé au montage » et « `current` périmé
   * efface l'écriture d'avant », les deux à la fois.
   *
   * La dépendance est la VALEUR lue, sérialisée: un re-rendu qui rend le même
   * corps ne touche à rien, donc une saisie en cours survit à tout ce qui n'est
   * pas une lecture différente.
   */
  const bodyKey = JSON.stringify(body ?? null);
  React.useEffect(() => {
    setExtras({
      dayActivity: body?.dayActivity ?? "",
      sportFrequency: body?.sportFrequency ?? "",
      appetite: body?.appetite ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey]);

  const h = Number(height);
  const w = Number(weight);
  // LE MÊME TOUT-OU-RIEN QU'EN BASE. Le bouton reste inerte tant que les trois
  // ne sont pas là: `body_incomplete` existe quand même côté serveur, parce
  // qu'un bouton grisé n'est pas une garde.
  const complete = Number.isFinite(h) && h > 0 && Number.isFinite(w) && w > 0 &&
    gender !== "";

  return (
    <div className="border-t border-line pt-3">
      <SectionLabel>{t("household.body.title")}</SectionLabel>
      <p className="mb-2 text-xs text-ink-soft">{t("household.body.hint")}</p>
      {body === null ? (
        <p className="mb-2 text-xs text-amber-800">{t("household.body.missing")}</p>
      ) : null}
      {needsBirthDate ? (
        <p className="mb-2 text-xs text-amber-800">
          {t("household.body.needs_birth_date")}
        </p>
      ) : null}
      {/* ── LES TROIS CHAMPS PASSENT PAR `Field`, ET CE N'EST PAS COSMÉTIQUE ──
          Ils se tenaient à la main: un `<label class="flex flex-col text-xs">`
          enveloppant un `<input class="rounded border-gray-300 text-sm">`. Trois
          conséquences mesurables, pas une:
            · `text-sm` = 14 px, donc Safari iOS zoomait au focus et ne
              dézoomait plus — la règle des 16 px d'`index.css` est dans
              `@layer base` et un utilitaire la bat;
            · `border-gray-300` est à 1,73:1 sur ce papier, sous le seuil de
              3:1 que WCAG 1.4.11 exige d'une bordure de CONTRÔLE;
            · l'étiquette n'était liée au champ que par l'enveloppe, et son
              cran (`text-xs`) n'était celui d'aucune autre étiquette du produit.
          La largeur vit maintenant sur l'ENVELOPPE (`w-24`), parce que
          `inputClass` porte `w-full`: la poser sur le champ ferait deux
          utilitaires `w-*` dont l'ordre de génération, et non la source,
          désignerait le gagnant. */}
      {/* `items-start` ET PAS `items-end`: un `<select>` fait 41 px là où un
          `<input>` en fait 42 (mesuré), donc aligner par le BAS décalait le haut
          des trois boîtes de 2 px et l'étiquette « sexe » d'autant. Aligné par
          le haut, ce sont les étiquettes et les bords supérieurs qui tombent
          juste — la ligne que l'œil suit. */}
      <div className="flex flex-wrap items-start gap-2">
        {/* ⚠️ `w-20` ET PAS `w-24`, ET C'EST UNE MESURE. À 320 px la fiche
            ouverte ne laisse que 198 px sur cette ligne (carte `p-4` + panneau
            `p-3`): deux champs de 96 px et leur gouttière de 8 en font 200, donc
            « taille » et « poids » se retrouvaient empilés pour 2 px. 80 + 80 + 8
            = 168, et 80 px tiennent « 180 » à 16 px. */}
        <Field label={t("household.body.height")} className="w-20">
          <input
            type="number"
            inputMode="decimal"
            className={inputClass}
            value={height}
            onChange={(e) => { setHeight(e.target.value); setSaved(false); }}
          />
        </Field>
        <Field label={t("household.body.weight")} className="w-20">
          <input
            type="number"
            inputMode="decimal"
            className={inputClass}
            value={weight}
            onChange={(e) => { setWeight(e.target.value); setSaved(false); }}
          />
        </Field>
        <Field label={t("household.body.gender")} className="w-40">
          <select
            className={inputClass}
            value={gender}
            onChange={(e) => {
              setGender(e.target.value as MemberGender | "");
              setSaved(false);
            }}
          >
            <option value="">—</option>
            {MEMBER_GENDERS.map((g) => (
              <option key={g} value={g}>{t(`household.body.gender_${g}` as never)}</option>
            ))}
          </select>
        </Field>
      </div>
      {/* ── ② LES DEUX AXES · ① LES TROIS QUESTIONS ─────────────────────
          Sous le corps, dans le MÊME geste d'enregistrement, parce que c'est la
          même porte qui les écrit. Deux boutons sur un même bloc, c'est la
          garantie qu'un jour l'un des deux cessera d'écrire ce que l'autre
          écrit — mesuré sur `MeFiche`. */}
      <div className="mt-3 flex flex-col gap-3">
        {/* ⛔ LES DEUX BLOCS ICI, ET C'EST LE SEUL ÉCRAN DANS CE CAS. Cette
            rangée n'ouvre AUCUNE fenêtre de préférences: y laisser seulement
            les deux axes rendrait ① et ⑤ inatteignables pour une bouche déjà
            inscrite — un champ qu'on peut remplir sur une fiche neuve et plus
            jamais ensuite. */}
        {/* ⛔ LES DEUX BLOCS ICI, ET C'EST LE SEUL ÉCRAN DANS CE CAS. Cette
            rangée n'ouvre AUCUNE fenêtre de préférences: n'y laisser que les
            deux axes rendrait ① et ⑤ inatteignables pour une bouche déjà
            inscrite — un champ qu'on peut remplir sur une fiche neuve et plus
            jamais ensuite. */}
        <MouthActivityAxesFields
          voice="other"
          who={t("household.mouth.who_fallback")}
          value={extras}
          onChange={(patch) => {
            setExtras((prev) => ({ ...prev, ...patch }));
            setSaved(false);
          }}
        />
        <MouthAppetiteFields
          voice="other"
          who={t("household.mouth.who_fallback")}
          value={extras}
          onChange={(patch) => {
            setExtras((prev) => ({ ...prev, ...patch }));
            setSaved(false);
          }}
        />
        {/* ⛔ « CE QU'IL Y A D'AUTRE DANS L'ASSIETTE » N'EXISTE PLUS. Retiré
            de l'écran le 2026-09-01 (trois oui/non par personne), remplacé par
            des bulles par moment, elles-mêmes retirées le 2026-09-10: le plan
            dimensionne les aliments qu'il prévoit et ne réserve plus d'énergie
            pour un accompagnement personnel hors plan. */}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={busy || !complete}
          onClick={async () => {
            // `complete` porte déjà `gender !== ""`, et TypeScript le sait: le
            // rétrécissement voyage par la constante. Rajouter le test ici
            // ferait une comparaison que le compilateur signale comme morte.
            if (!complete) return;
            const ok = await onSave(h, w, gender, extras);
            if (ok) setSaved(true);
          }}
        >
          {t("household.body.save")}
        </Button>
        {saved ? (
          <span className="text-xs text-emerald-700">{t("household.body.saved")}</span>
        ) : null}
      </div>
    </div>
  );
}
