// Contextual greeting pool, drawn from the i18n dictionary so each language
// has its own natural-sounding lines (not translations).
import { dict } from '@shared/i18n-strings';
import { getLocale } from '@/i18n';

function bucketFromHour(hour: number, pools: { morning: string[]; afternoon: string[]; evening: string[]; latenight: string[] }): string[] {
  if (hour >= 5 && hour < 12) return pools.morning;
  if (hour >= 12 && hour < 18) return pools.afternoon;
  if (hour >= 18 && hour < 23) return pools.evening;
  return pools.latenight; // 23-04
}

function bonusFromDay(day: number, hour: number, pools: { monday: string[]; friday: string[]; weekend: string[] }): string[] {
  // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  if (day === 0 || day === 6) return pools.weekend;
  if (day === 1 && hour < 13) return pools.monday;
  if (day === 5 && hour >= 14) return pools.friday;
  return [];
}

export function pickGreeting(now: Date = new Date()): string {
  const greetings = dict(getLocale()).greeting;
  const hour = now.getHours();
  const day = now.getDay();
  const pool = [
    ...bucketFromHour(hour, greetings),
    ...bonusFromDay(day, hour, greetings),
    ...greetings.generic,
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}
