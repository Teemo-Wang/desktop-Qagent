"use strict";

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function calculateCaptureRegion(displayBounds, cursorPoint, requestedSize) {
  const width = Math.min(requestedSize, displayBounds.width);
  const height = Math.min(requestedSize, displayBounds.height);
  const x = clamp(
    Math.round(cursorPoint.x - width / 2),
    displayBounds.x,
    displayBounds.x + displayBounds.width - width
  );
  const y = clamp(
    Math.round(cursorPoint.y - height / 2),
    displayBounds.y,
    displayBounds.y + displayBounds.height - height
  );

  return {
    x,
    y,
    width,
    height,
    cursorX: cursorPoint.x - x,
    cursorY: cursorPoint.y - y
  };
}

function calculatePopupPosition(workArea, cursorPoint, windowSize, gap = 18) {
  let x = cursorPoint.x + gap;
  let y = cursorPoint.y + gap;

  if (x + windowSize.width > workArea.x + workArea.width) {
    x = cursorPoint.x - windowSize.width - gap;
  }
  if (y + windowSize.height > workArea.y + workArea.height) {
    y = cursorPoint.y - windowSize.height - gap;
  }

  return {
    x: Math.round(clamp(x, workArea.x, workArea.x + workArea.width - windowSize.width)),
    y: Math.round(clamp(y, workArea.y, workArea.y + workArea.height - windowSize.height))
  };
}

module.exports = { calculateCaptureRegion, calculatePopupPosition, clamp };
