"use strict";

const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

const MODIFIER_MASKS = Object.freeze({
  command: 1 << 20,
  cmd: 1 << 20,
  shift: 1 << 17,
  option: 1 << 19,
  alt: 1 << 19,
  control: 1 << 18,
  ctrl: 1 << 18
});

const KEY_CODES = Object.freeze({
  A: 0,
  S: 1,
  D: 2,
  F: 3,
  H: 4,
  G: 5,
  Z: 6,
  X: 7,
  C: 8,
  V: 9,
  B: 11,
  Q: 12,
  W: 13,
  E: 14,
  R: 15,
  Y: 16,
  T: 17,
  1: 18,
  2: 19,
  3: 20,
  4: 21,
  6: 22,
  5: 23,
  EQUAL: 24,
  9: 25,
  7: 26,
  MINUS: 27,
  8: 28,
  0: 29,
  RIGHTBRACKET: 30,
  O: 31,
  U: 32,
  LEFTBRACKET: 33,
  I: 34,
  P: 35,
  RETURN: 36,
  L: 37,
  J: 38,
  QUOTE: 39,
  K: 40,
  SEMICOLON: 41,
  BACKSLASH: 42,
  COMMA: 43,
  SLASH: 44,
  N: 45,
  M: 46,
  PERIOD: 47,
  TAB: 48,
  SPACE: 49,
  BACKTICK: 50,
  DELETE: 51,
  ESCAPE: 53,
  F1: 122,
  F2: 120,
  F3: 99,
  F4: 118,
  F5: 96,
  F6: 97,
  F7: 98,
  F8: 100,
  F9: 101,
  F10: 109,
  F11: 103,
  F12: 111
});

function parseAccelerator(accelerator) {
  const parts = accelerator.split("+").map((part) => part.trim()).filter(Boolean);
  let modifierMask = 0;
  let keyCode;

  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === "commandorcontrol" || normalized === "cmdorctrl") {
      modifierMask |= MODIFIER_MASKS.command;
    } else if (MODIFIER_MASKS[normalized]) {
      modifierMask |= MODIFIER_MASKS[normalized];
    } else {
      keyCode = KEY_CODES[part.toUpperCase()];
    }
  }

  if (keyCode === undefined) {
    throw new Error(`Unsupported hotkey: ${accelerator}`);
  }
  return { keyCode, modifierMask };
}

class MacOSLongPressHotkey {
  constructor({ projectRoot, isPackaged, resourcesPath, onTrigger, onStatus }) {
    this.projectRoot = projectRoot;
    this.isPackaged = isPackaged;
    this.resourcesPath = resourcesPath;
    this.onTrigger = onTrigger;
    this.onStatus = onStatus;
    this.child = null;
    this.timer = null;
    this.triggered = false;
  }

  start({ hotkey, holdDurationMs }) {
    this.stop();
    const parsed = parseAccelerator(hotkey);
    const executable = this.isPackaged
      ? path.join(this.resourcesPath, "native/cursorlens-hotkey")
      : path.join(this.projectRoot, "build/cursorlens-hotkey");

    this.child = spawn(executable, [
      "--key-code",
      String(parsed.keyCode),
      "--modifier-mask",
      String(parsed.modifierMask)
    ]);

    const output = readline.createInterface({ input: this.child.stdout });
    output.on("line", (line) => this.#handleLine(line.trim(), holdDurationMs));
    this.child.stderr.on("data", (chunk) => {
      console.warn(`[hotkey] ${String(chunk).trim()}`);
    });
    this.child.on("error", (error) => this.onStatus({ type: "error", message: error.message }));
    this.child.on("exit", (code, signal) => {
      if (this.child) {
        this.onStatus({ type: "error", message: `Hotkey helper stopped (${code ?? signal}).` });
      }
    });
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.triggered = false;
    if (this.child) {
      const child = this.child;
      this.child = null;
      child.kill();
    }
  }

  #handleLine(line, holdDurationMs) {
    if (line === "DOWN") {
      clearTimeout(this.timer);
      this.triggered = false;
      this.timer = setTimeout(() => {
        this.triggered = true;
        this.onTrigger();
      }, holdDurationMs);
    } else if (line === "UP") {
      clearTimeout(this.timer);
      this.timer = null;
      this.triggered = false;
    } else if (line === "PERMISSION_REQUIRED") {
      this.onStatus({ type: "permission-required" });
    } else if (line === "PERMISSION_OK" || line === "READY") {
      this.onStatus({ type: "ready", message: line });
    } else if (line === "MONITOR_FAILED") {
      this.onStatus({ type: "error", message: "macOS keyboard monitor could not start." });
    }
  }
}

module.exports = { MacOSLongPressHotkey, parseAccelerator, KEY_CODES, MODIFIER_MASKS };
