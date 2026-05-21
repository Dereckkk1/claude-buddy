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

export interface PickGreetingOpts {
  /** Whether the user just slept/woke very quickly — pick a teasing line. */
  recentReturn?: boolean;
  /** Optional user name interpolated into `{userName}` placeholders. */
  userName?: string;
}

/**
 * Pick a contextual greeting. When `opts.userName` is non-empty, any
 * `{userName}` placeholder in the picked line is interpolated — lines
 * without the placeholder are returned as-is.
 */
export function pickGreeting(now: Date = new Date(), opts: PickGreetingOpts = {}): string {
  const greetings = dict(getLocale()).greeting;
  // Recently returned? Pull from the "wait, you again?" pool.
  if (opts.recentReturn && Array.isArray(greetings.recentReturn) && greetings.recentReturn.length > 0) {
    const pool = greetings.recentReturn;
    const raw = pool[Math.floor(Math.random() * pool.length)];
    return interpolateUserName(raw, opts.userName ?? '');
  }
  const hour = now.getHours();
  const day = now.getDay();
  const pool = [
    ...bucketFromHour(hour, greetings),
    ...bonusFromDay(day, hour, greetings),
    ...greetings.generic,
  ];
  const raw = pool[Math.floor(Math.random() * pool.length)];
  return interpolateUserName(raw, opts.userName ?? '');
}

function interpolateUserName(raw: string, userName: string): string {
  // No name set: strip the placeholder gracefully ("Good morning, !" → "Good morning!").
  if (!userName.trim()) return raw.replace(/,?\s*\{userName\}/g, '');
  return raw.replace(/\{userName\}/g, userName.trim());
}
