export function dayTokenToFrench(day: string): string {
  const d = String(day ?? "").trim().toLowerCase()
  if (d === "mon") return "lundi"
  if (d === "tue") return "mardi"
  if (d === "wed") return "mercredi"
  if (d === "thu") return "jeudi"
  if (d === "fri") return "vendredi"
  if (d === "sat") return "samedi"
  if (d === "sun") return "dimanche"
  return d
}

export function formatDaysFrench(days: string[] | null | undefined): string {
  const arr = Array.isArray(days) ? days : []
  return arr.map(dayTokenToFrench).join(", ")
}


