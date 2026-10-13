import { describe, it, expect } from "vitest";
import { availableSlots, isOpenDay } from "@/lib/slots";

describe("slots", () => {
  it("closed Sunday and Monday, open Tuesday", () => {
    expect(isOpenDay(new Date(2026, 9, 11))).toBe(false); // Sun
    expect(isOpenDay(new Date(2026, 9, 12))).toBe(false); // Mon
    expect(isOpenDay(new Date(2026, 9, 13))).toBe(true); // Tue
  });
  it("last 60-min slot starts at 19:00", () => {
    const s = availableSlots(60, [], false, 0);
    expect(s[0]).toBe("10:00");
    expect(s.at(-1)).toBe("19:00");
  });
  it("excludes overlapping booked times", () => {
    const s = availableSlots(60, [{ start_time: "11:00:00", end_time: "12:00:00" }], false, 0);
    expect(s).not.toContain("10:30");
    expect(s).not.toContain("11:30");
    expect(s).toContain("10:00");
    expect(s).toContain("12:00");
  });
});
