export const OPEN_MIN = 10 * 60;
export const CLOSE_MIN = 20 * 60;
export const STEP = 30;

export type Window = { weekday: number; start_time: string; end_time: string };

export const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
export const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Default when the owner hasn't set availability: Tuesday (2) to Saturday (6), 10–20. */
export const isOpenDay = (d: Date, windows: Window[] = []) =>
  windows.length ? windows.some((w) => w.weekday === d.getDay()) : d.getDay() >= 2 && d.getDay() <= 6;

export function windowsFor(d: Date, windows: Window[] = []) {
  if (!windows.length) return [{ start: OPEN_MIN, end: CLOSE_MIN }];
  return windows
    .filter((w) => w.weekday === d.getDay())
    .map((w) => ({ start: toMin(w.start_time), end: toMin(w.end_time) }));
}

export function availableSlots(
  duration: number,
  busy: { start_time: string; end_time: string }[],
  isToday: boolean,
  nowMin: number,
  ranges: { start: number; end: number }[] = [{ start: OPEN_MIN, end: CLOSE_MIN }],
) {
  const out = new Set<string>();
  for (const r of ranges) {
    for (let s = r.start; s + duration <= r.end; s += STEP) {
      const e = s + duration;
      if (isToday && s <= nowMin) continue;
      const clash = busy.some((b) => toMin(b.start_time) < e && toMin(b.end_time) > s);
      if (!clash) out.add(toTime(s));
    }
  }
  return [...out].sort();
}
