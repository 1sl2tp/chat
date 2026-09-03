const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
const pad = (n: number): string => String(n).padStart(2, '0');

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function formatDirectoryTime(value: Date, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(value)) / 86_400_000);
  if (days <= 0) return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  if (days === 1) return 'Hôm qua';
  if (days >= 2 && days <= 6) return WEEKDAY[value.getDay()] ?? '';
  if (value.getFullYear() === now.getFullYear()) return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}`;
  return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${String(value.getFullYear()).slice(-2)}`;
}
