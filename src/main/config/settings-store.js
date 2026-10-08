"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { safeStorage } = require("electron");
const defaults = require("./defaults");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[settings] Could not read ${filePath}: ${error.message}`);
    }
    return {};
  }
}

function sanitize(candidate) {
  const result = {};

  if (typeof candidate.hotkey === "string" && candidate.hotkey.trim()) {
    result.hotkey = candidate.hotkey.trim();
  }
  if (candidate.triggerMode === "press" || candidate.triggerMode === "hold") {
    result.triggerMode = candidate.triggerMode;
  }
  if (Number.isFinite(Number(candidate.holdDurationMs))) {
    result.holdDurationMs = Math.min(2000, Math.max(250, Number(candidate.holdDurationMs)));
  }
  if (Number.isFinite(Number(candidate.captureSize))) {
    result.captureSize = Math.min(1200, Math.max(320, Number(candidate.captureSize)));
  }
  if (typeof candidate.model === "string" && candidate.model.trim()) {
    result.model = candidate.model.trim();
  }
  if (typeof candidate.baseUrl === "string" && candidate.baseUrl.trim()) {
    result.baseUrl = candidate.baseUrl.trim().replace(/\/$/, "");
  }
  if (Number.isFinite(Number(candidate.maxOutputTokens))) {
    result.maxOutputTokens = Math.min(4096, Math.max(128, Number(candidate.maxOutputTokens)));
  }
  if (typeof candidate.systemPrompt === "string" && candidate.systemPrompt.trim()) {
    result.systemPrompt = candidate.systemPrompt.trim();
  }

  return result;
}

class SettingsStore {
  constructor({ userDataPath, projectRoot, isPackaged }) {
    this.userSettingsPath = path.join(userDataPath, "settings.json");
    this.projectConfigPath = isPackaged ? null : path.join(projectRoot, "config.json");
    this.persisted = readJson(this.userSettingsPath);
  }

  getRuntimeSettings() {
    const projectConfig = this.projectConfigPath ? readJson(this.projectConfigPath) : {};
    const settings = {
      ...defaults,
      ...sanitize(projectConfig),
      ...sanitize(this.persisted)
    };

    const storedApiKey = this.#readPersistedApiKey();
    settings.apiKey =
      process.env.OPENAI_API_KEY ||
      (typeof projectConfig.apiKey === "string" ? projectConfig.apiKey.trim() : "") ||
      storedApiKey;
    settings.apiKeySource = process.env.OPENAI_API_KEY
      ? "environment"
      : projectConfig.apiKey
        ? "config"
        : storedApiKey
          ? "saved"
          : "missing";
    settings.baseUrl = process.env.OPENAI_BASE_URL || settings.baseUrl;
    settings.model = process.env.OPENAI_MODEL || settings.model;
    return settings;
  }

  getPublicSettings() {
    const runtime = this.getRuntimeSettings();
    const { apiKey, systemPrompt, ...publicSettings } = runtime;
    return {
      ...publicSettings,
      apiKeyConfigured: Boolean(apiKey),
      apiKeySource: runtime.apiKeySource
    };
  }

  save(input) {
    this.persisted = {
      ...this.persisted,
      ...sanitize(input)
    };

    if (typeof input.apiKey === "string" && input.apiKey.trim()) {
      const apiKey = input.apiKey.trim();
      if (safeStorage.isEncryptionAvailable()) {
        this.persisted.encryptedApiKey = safeStorage.encryptString(apiKey).toString("base64");
        delete this.persisted.plainApiKey;
      } else {
        this.persisted.plainApiKey = apiKey;
        delete this.persisted.encryptedApiKey;
      }
    }

    fs.mkdirSync(path.dirname(this.userSettingsPath), { recursive: true });
    fs.writeFileSync(this.userSettingsPath, `${JSON.stringify(this.persisted, null, 2)}\n`, {
      mode: 0o600
    });
    return this.getPublicSettings();
  }

  #readPersistedApiKey() {
    if (this.persisted.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
      try {
        const encrypted = Buffer.from(this.persisted.encryptedApiKey, "base64");
        return safeStorage.decryptString(encrypted);
      } catch (error) {
        console.warn(`[settings] Could not decrypt the saved API key: ${error.message}`);
      }
    }
    return typeof this.persisted.plainApiKey === "string" ? this.persisted.plainApiKey : "";
  }
}

module.exports = { SettingsStore, sanitize };
