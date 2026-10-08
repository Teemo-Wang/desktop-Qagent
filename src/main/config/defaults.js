"use strict";

module.exports = Object.freeze({
  hotkey: "Command+Shift+Space",
  triggerMode: "press",
  holdDurationMs: 500,
  captureSize: 600,
  model: "gpt-4.1-mini",
  baseUrl: "https://api.openai.com/v1",
  maxOutputTokens: 900,
  systemPrompt:
    "You are a concise desktop UI assistant. Focus on what the user is pointing at, explain uncertainty, and never claim that you clicked or changed anything."
});
