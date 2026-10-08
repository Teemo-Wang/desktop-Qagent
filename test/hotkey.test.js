"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MODIFIER_MASKS, parseAccelerator } = require("../src/main/platform/macos-hotkey");

test("parses the default macOS accelerator", () => {
  assert.deepEqual(parseAccelerator("Command+Shift+Space"), {
    keyCode: 49,
    modifierMask: MODIFIER_MASKS.command | MODIFIER_MASKS.shift
  });
});

test("maps CommandOrControl to Command on macOS", () => {
  assert.deepEqual(parseAccelerator("CommandOrControl+Option+K"), {
    keyCode: 40,
    modifierMask: MODIFIER_MASKS.command | MODIFIER_MASKS.option
  });
});

test("rejects unsupported main keys", () => {
  assert.throws(() => parseAccelerator("Command+Shift+PageDown"), /Unsupported hotkey/);
});
