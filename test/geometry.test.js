"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateCaptureRegion, calculatePopupPosition } = require("../src/main/core/geometry");

test("capture region keeps the pointer centered away from display edges", () => {
  assert.deepEqual(
    calculateCaptureRegion({ x: 0, y: 0, width: 1440, height: 900 }, { x: 720, y: 450 }, 600),
    { x: 420, y: 150, width: 600, height: 600, cursorX: 300, cursorY: 300 }
  );
});

test("capture region clamps to a display with negative coordinates", () => {
  assert.deepEqual(
    calculateCaptureRegion(
      { x: -1920, y: -120, width: 1920, height: 1080 },
      { x: -1900, y: -100 },
      600
    ),
    { x: -1920, y: -120, width: 600, height: 600, cursorX: 20, cursorY: 20 }
  );
});

test("popup flips left and above near the lower-right edge", () => {
  assert.deepEqual(
    calculatePopupPosition(
      { x: 0, y: 25, width: 1440, height: 875 },
      { x: 1400, y: 850 },
      { width: 472, height: 590 }
    ),
    { x: 910, y: 242 }
  );
});
