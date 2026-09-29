import assert from "node:assert/strict";
import { DEFAULT_BETA, WIDTH_STATIONS, fitWidths, sectionWidthCm } from "./body.ts";

const base = { ...DEFAULT_BETA };

function width(beta: typeof base, key: keyof typeof WIDTH_STATIONS) {
  return sectionWidthCm(beta, WIDTH_STATIONS[key]);
}

const shoulder = fitWidths(base, { shoulder: width(base, "shoulder") + 3 });
assert.equal(shoulder.ok, true);
if (shoulder.ok) {
  assert.ok(Math.abs(width(shoulder.beta, "shoulder") - (width(base, "shoulder") + 3)) < 1.5);
  assert.equal(shoulder.beta.heightCm, base.heightCm);
  assert.notEqual(shoulder.beta.shoulder, base.shoulder);
}

const waist = fitWidths(base, { waist: width(base, "waist") - 2 });
assert.equal(waist.ok, true);
if (waist.ok) {
  assert.ok(Math.abs(width(waist.beta, "waist") - (width(base, "waist") - 2)) < 1.5);
}

const ratio = fitWidths(base, { chest: 40, hip: 20 });
assert.equal(ratio.ok, false);

const tooWide = fitWidths(base, { hip: 200 });
assert.equal(tooWide.ok, false);
if (!tooWide.ok) assert.match(tooWide.reason, /未改模型/);

const unreachableWaist = fitWidths({ ...base, fat: 0, belly: 0 }, { waist: 80 });
assert.equal(unreachableWaist.ok, false);

console.log("fitWidths ok");
