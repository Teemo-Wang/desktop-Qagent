"use strict";

/**
 * Extension point for future context sources such as the macOS Accessibility
 * tree, active-window metadata, OCR, or an app-specific MCP bridge.
 */
class ContextProvider {
  async collect() {
    throw new Error("ContextProvider.collect() must be implemented.");
  }
}

class ContextPipeline {
  constructor(providers) {
    this.providers = providers;
  }

  async collect() {
    const context = {};
    for (const provider of this.providers) {
      Object.assign(context, await provider.collect());
    }
    return context;
  }
}

module.exports = { ContextProvider, ContextPipeline };
