export const OPEN_MIN = 10 * 60;
export const CLOSE_MIN = 20 * 60;
export const STEP = 30;

export const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
export const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Open Tuesday (2) to Saturday (6). */
export const isOpenDay = (d: Date) => d.getDay() >= 2 && d.getDay() <= 6;

export function availableSlots(
  duration: number,
  busy: { start_time: string; end_time: string }[],
  isToday: boolean,
  nowMin: number,
) {
  const out: string[] = [];
  for (let s = OPEN_MIN; s + duration <= CLOSE_MIN; s += STEP) {
    const e = s + duration;
    if (isToday && s <= nowMin) continue;
    const clash = busy.some((b) => toMin(b.start_time) < e && toMin(b.end_time) > s);
    if (!clash) out.push(toTime(s));
  }
  return out;
}
