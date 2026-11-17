// Sunrise/sunset from the NOAA approximation, same math as the design prototype.
export const HOME = { lat: 32.95, lng: -96.73, tz: 'America/Chicago' };

const RAD = Math.PI / 180;
const DAY_MS = 86400000;

export function sunTimes(now: Date, lat = HOME.lat, lng = HOME.lng): { rise: number; set: number } {
  const lw = -lng;
  const J = now.getTime() / DAY_MS + 2440587.5;
  const n = Math.round(J - 2451545.0009 - lw / 360);
  const Js = 2451545.0009 + lw / 360 + n;
  const M = (357.5291 + 0.98560028 * (Js - 2451545)) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jt = Js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
  const dec = Math.asin(Math.sin(L * RAD) * Math.sin(23.4397 * RAD));
  const cosW =
    (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(dec)) / (Math.cos(lat * RAD) * Math.cos(dec));
  const w = Math.acos(Math.max(-1, Math.min(1, cosW))) / RAD;
  const toMs = (j: number) => (j - 2440587.5) * DAY_MS;
  return { rise: toMs(Jt - w / 360), set: toMs(Jt + w / 360) };
}

export type ThemePref = 'auto' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';

export function formatTime(ms: number, tz = HOME.tz): string {
  try {
    return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
  } catch {
    return '';
  }
}

/** Picks light or dark for the given preference and time, plus the label shown under the header. */
export function resolveTheme(pref: ThemePref, now: Date): { mode: ThemeMode; label: string } {
  if (pref === 'light') return { mode: 'light', label: 'Light theme, set by hand · tap the icon for Auto' };
  if (pref === 'dark') return { mode: 'dark', label: 'Dark theme, set by hand · tap the icon for Auto' };
  const sun = sunTimes(now);
  const t = now.getTime();
  if (t >= sun.rise && t < sun.set) {
    return { mode: 'light', label: `Auto · light until sunset, ${formatTime(sun.set)}` };
  }
  const nextRise = t >= sun.set ? sun.rise + DAY_MS : sun.rise;
  return { mode: 'dark', label: `Auto · dark until sunrise, ${formatTime(nextRise)}` };
}

export const NEXT_PREF: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' };
