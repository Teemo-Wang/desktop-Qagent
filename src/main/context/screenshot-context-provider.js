"use strict";

const { ContextProvider } = require("./context-provider");

class ScreenshotContextProvider extends ContextProvider {
  constructor(captureService, getCaptureSize) {
    super();
    this.captureService = captureService;
    this.getCaptureSize = getCaptureSize;
  }

  async collect() {
    return {
      screenshot: await this.captureService.captureAroundCursor(this.getCaptureSize())
    };
  }
}

module.exports = { ScreenshotContextProvider };
