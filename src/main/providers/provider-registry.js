"use strict";

const { OpenAICompatibleProvider } = require("./openai-compatible-provider");

class ProviderRegistry {
  constructor() {
    this.providers = new Map([["openai-compatible", new OpenAICompatibleProvider()]]);
  }

  get(name = "openai-compatible") {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown model provider: ${name}`);
    return provider;
  }
}

module.exports = { ProviderRegistry };
