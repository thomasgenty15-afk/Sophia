import React from "react";

import type { RejectedDish } from "../api/rejectedDishes";
import { formatWeekday } from "../i18n/format";
import { t } from "../i18n/t";
import { Card, SectionLabel } from "./ui/Card";

// ⟳ 2026-09-24 — « PLATS REFUSÉS », DANS « CE QUE SOPHIA SAIT ».
//
// Décision du propriétaire: un plat remplacé dans l'aperçu d'un plan entre
// dans une liste, avec les personnes qui le mangeaient, et Sophia ne le leur
// propose plus. Cette liste est une mémoire: elle se voit, et elle s'enlève
// ligne par ligne — la règle de l'écran (« rien ici n'est caché, rien ici
// n'est figé »).
//
// ⛔ À PART DE `KnownAboutYouCard`, ET C'EST VOULU. Ce n'est ni une préférence
// (un aliment), ni un réglage, ni un mémo: c'est une liste de TITRES de plats,
// sous sa propre clé. La ranger dans un des cinq blocs mentirait sur ce qu'elle
// est.

export interface RejectedDishesCardProps {
  entries: readonly RejectedDish[];
  /** Prénom par bouche (le roster de la page). Une bouche partie ne s'affiche pas. */
  members: ReadonlyMap<string, string>;
  onRemove: (key: string) => Promise<void>;
}

export default function RejectedDishesCard(props: RejectedDishesCardProps) {
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [failedKey, setFailedKey] = React.useState<string | null>(null);

  const whoOf = (entry: RejectedDish): string =>
    entry.household
      ? t("known.rejected.everyone")
      : entry.memberIds.map((id) => props.members.get(id)).filter((n): n is string => !!n).join(", ");

  return (
    <section id="known-rejected_dishes" className="mt-8">
      <SectionLabel>{t("known.rejected.title")}</SectionLabel>
      <p className="mt-1 text-sm text-ink-soft">{t("known.rejected.intro")}</p>
      {props.entries.length === 0
        ? (
          <Card tone="dashed" className="mt-3">
            <p className="text-sm text-ink-soft">{t("known.rejected.empty")}</p>
          </Card>
        )
        : (
          <ul className="mt-3 flex flex-col gap-2">
            {props.entries.map((entry) => {
              const who = whoOf(entry);
              return (
                <li key={entry.key}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* Le titre tel que la carte l'affichait: c'est à lui
                            qu'on reconnaît le plat. */}
                        <p className="break-words text-sm font-medium text-ink">{entry.title}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {who}
                          {entry.at && (
                            <>
                              {" · "}
                              {t("known.rejected.said_on", { day: formatWeekday(entry.at, { long: true }) })}
                            </>
                          )}
                        </p>
                        {/* LA RAISON, CITÉE — sans elle, « Enlever » est un pari. */}
                        {entry.reason && (
                          <p className="mt-0.5 break-words text-xs italic text-ink-soft">
                            {t("known.rejected.said", { reason: entry.reason })}
                          </p>
                        )}
                        {failedKey === entry.key && (
                          <p role="alert" className="mt-1 text-xs text-red-700">
                            {t("known.rejected.remove_failed")}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={async () => {
                          setBusyKey(entry.key);
                          setFailedKey(null);
                          try {
                            await props.onRemove(entry.key);
                          } catch {
                            setFailedKey(entry.key);
                          } finally {
                            setBusyKey(null);
                          }
                        }}
                        className="shrink-0 text-xs text-fig-700 underline hover:text-fig-800"
                      >
                        {t("known.remove")}
                      </button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
