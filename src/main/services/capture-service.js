"use strict";

const crypto = require("node:crypto");
const { desktopCapturer, screen, systemPreferences } = require("electron");
const { calculateCaptureRegion } = require("../core/geometry");

class CapturePermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = "CapturePermissionError";
    this.code = "SCREEN_PERMISSION_REQUIRED";
  }
}

class CaptureService {
  getPermissionStatus() {
    if (process.platform !== "darwin") return "granted";
    return systemPreferences.getMediaAccessStatus("screen");
  }

  async captureAroundCursor(requestedSize) {
    const permission = this.getPermissionStatus();
    if (permission === "denied" || permission === "restricted") {
      throw new CapturePermissionError(
        "请在“系统设置 → 隐私与安全性 → 屏幕与系统音频录制”中允许 CursorLens，然后重新启动。"
      );
    }

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const region = calculateCaptureRegion(display.bounds, cursor, requestedSize);
    const targetPixelWidth = Math.max(1, Math.round(display.bounds.width * display.scaleFactor));
    const targetPixelHeight = Math.max(1, Math.round(display.bounds.height * display.scaleFactor));

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: targetPixelWidth, height: targetPixelHeight },
      fetchWindowIcons: false
    });

    const source =
      sources.find((candidate) => candidate.display_id === String(display.id)) ||
      (sources.length === 1 ? sources[0] : null);

    if (!source || source.thumbnail.isEmpty()) {
      throw new CapturePermissionError(
        "未能读取当前显示器画面。请确认已授予屏幕录制权限，然后重新启动 CursorLens。"
      );
    }

    const fullSize = source.thumbnail.getSize();
    const scaleX = fullSize.width / display.bounds.width;
    const scaleY = fullSize.height / display.bounds.height;
    const cropRect = {
      x: Math.max(0, Math.round((region.x - display.bounds.x) * scaleX)),
      y: Math.max(0, Math.round((region.y - display.bounds.y) * scaleY)),
      width: Math.min(fullSize.width, Math.round(region.width * scaleX)),
      height: Math.min(fullSize.height, Math.round(region.height * scaleY))
    };

    cropRect.width = Math.min(cropRect.width, fullSize.width - cropRect.x);
    cropRect.height = Math.min(cropRect.height, fullSize.height - cropRect.y);

    const cropped = source.thumbnail.crop(cropRect);
    const imageSize = cropped.getSize();
    const relativePixelX = Math.round(region.cursorX * (imageSize.width / region.width));
    const relativePixelY = Math.round(region.cursorY * (imageSize.height / region.height));

    return {
      id: crypto.randomUUID(),
      dataUrl: cropped.toDataURL(),
      capturedAt: new Date().toISOString(),
      displayId: String(display.id),
      scaleFactor: display.scaleFactor,
      absoluteCursorDip: { x: cursor.x, y: cursor.y },
      regionDip: {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height
      },
      cursor: {
        x: relativePixelX,
        y: relativePixelY,
        normalizedX: relativePixelX / imageSize.width,
        normalizedY: relativePixelY / imageSize.height
      },
      image: { width: imageSize.width, height: imageSize.height }
    };
  }
}

module.exports = { CaptureService, CapturePermissionError };
