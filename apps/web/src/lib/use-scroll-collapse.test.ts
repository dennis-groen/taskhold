import { describe, expect, it } from "vitest";

import { START, trackScroll, type ScrollFrame, type ScrollTrack } from "./use-scroll-collapse.ts";

const PAGE = { max: 2000, viewport: 700, locked: false };

/** A track at rest at `y` on PAGE, as the hook starts one */
function at(y: number, collapsed = false): ScrollTrack {
  return { ...START, anchor: y, last: y, max: PAGE.max, viewport: PAGE.viewport, collapsed };
}

/** Scrolls through `steps`, each a position or a whole frame */
function scroll(from: ScrollTrack, ...steps: (number | Partial<ScrollFrame>)[]): ScrollTrack {
  return steps.reduce<ScrollTrack>((track, step) => {
    const frame = typeof step === "number" ? { y: step } : step;
    // The page keeps its last size unless the step changes it
    const page = { ...PAGE, max: track.max, viewport: track.viewport, y: track.last };
    return trackScroll(track, { ...page, ...frame });
  }, from);
}

describe("trackScroll", () => {
  it("folds after scrolling down past the threshold, not before", () => {
    expect(scroll(at(0), 10, 20).collapsed).toBe(false);
    expect(scroll(at(0), 10, 20, 40).collapsed).toBe(true);
  });

  it("ignores small wiggles back up", () => {
    const folded = scroll(at(100), 200, 300);
    expect(folded.collapsed).toBe(true);
    expect(scroll(folded, 290, 285).collapsed).toBe(true);
  });

  it("unfolds after scrolling up past the threshold", () => {
    expect(scroll(at(300, true), 280, 270).collapsed).toBe(false);
  });

  it("counts from where the page turned", () => {
    const unfolded = scroll(at(100), 200, 300, 270);
    expect(unfolded.collapsed).toBe(false);
    expect(scroll(unfolded, 285).collapsed).toBe(false);
    expect(scroll(unfolded, 285, 300).collapsed).toBe(true);
  });

  it("stays unfolded at the top and the bottom of the page", () => {
    expect(scroll(at(300, true), 100, 5).collapsed).toBe(false);
    expect(scroll(at(300, true), 1000, PAGE.max).collapsed).toBe(false);
    // Scrolling down onto the bottom doesn't fold it either
    expect(scroll(at(1900), 1950, PAGE.max - 2).collapsed).toBe(false);
  });

  it("never folds a page too short to need it", () => {
    const short = { max: 100 };
    const track = { ...at(0), max: 100 };
    expect(
      scroll(track, { ...short, y: 30 }, { ...short, y: 60 }, { ...short, y: 80 }).collapsed,
    ).toBe(false);
  });

  it("unfolds when the page shrinks too short to need it", () => {
    expect(scroll(at(300, true), { y: 50, max: 60 }).collapsed).toBe(false);
  });

  describe("when the page moves by itself", () => {
    it("doesn't unfold when content above the view shrinks (an aisle folding)", () => {
      const folded = at(800, true);
      const settled = scroll(folded, { y: 740, max: 1940 }, { y: 700, max: 1900 });
      expect(settled.collapsed).toBe(true);
      // and counting starts from where it landed
      expect(scroll(settled, 690).collapsed).toBe(true);
      expect(scroll(settled, 690, 670).collapsed).toBe(false);
    });

    it("doesn't fold when content above the view grows (a housemate's item)", () => {
      const settled = scroll(at(400), { y: 460, max: 2060 });
      expect(settled.collapsed).toBe(false);
      expect(scroll(settled, 470).collapsed).toBe(false);
    });

    it("doesn't count scrolling while the keyboard comes or goes", () => {
      const track = at(400);
      const keyboardUp = scroll(track, { y: 700, viewport: 400 }, { y: 760, viewport: 380 });
      expect(keyboardUp.collapsed).toBe(false);
      const keyboardDown = scroll(at(400, true), { y: 360, viewport: 900 });
      expect(keyboardDown.collapsed).toBe(true);
    });

    it("doesn't count a jump, like a restored scroll position", () => {
      expect(scroll(at(400), 1200).collapsed).toBe(false);
      expect(scroll(at(1200, true), 400).collapsed).toBe(true);
    });

    it("still unfolds when a jump lands at the top, like opening another list", () => {
      expect(scroll(at(1200, true), 0).collapsed).toBe(false);
    });

    it("changes nothing behind a sheet, and picks up from where the sheet left the page", () => {
      const folded = at(800, true);
      // A lock that moves scrolling to <body> reads as the top of the page
      const behind = scroll(folded, { y: 0, locked: true }, { y: 40, locked: true });
      expect(behind.collapsed).toBe(true);
      const after = scroll(behind, { y: 800, locked: true }, 790);
      expect(after.collapsed).toBe(true);
      expect(scroll(after, 770).collapsed).toBe(false);
    });
  });
});
