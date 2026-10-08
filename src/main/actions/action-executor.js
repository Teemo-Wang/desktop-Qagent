"use strict";

/**
 * Deliberately disabled in v0.1. Future UI Automation / Computer Use adapters
 * can implement this contract without giving the model direct renderer access.
 */
class ActionExecutor {
  async execute() {
    throw new Error("Actions are disabled in this demo.");
  }
}

module.exports = { ActionExecutor };
