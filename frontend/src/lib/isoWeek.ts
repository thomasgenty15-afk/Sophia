export function startOfIsoWeekLocal(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // JS: Sunday=0..Saturday=6. ISO: Monday=0..Sunday=6.
  const isoDayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - isoDayIndex);
  return date;
}

export function isSameIsoWeekLocal(a: Date, b: Date): boolean {
  return startOfIsoWeekLocal(a).getTime() === startOfIsoWeekLocal(b).getTime();
}



