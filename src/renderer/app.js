"use strict";

const elements = {
  assistantView: document.querySelector("#assistantView"),
  settingsView: document.querySelector("#settingsView"),
  captureBadge: document.querySelector("#captureBadge"),
  preview: document.querySelector("#preview"),
  screenshot: document.querySelector("#screenshot"),
  pointerMarker: document.querySelector("#pointerMarker"),
  previewMessage: document.querySelector("#previewMessage"),
  captureStatus: document.querySelector("#captureStatus"),
  pointerPosition: document.querySelector("#pointerPosition"),
  screenPermissionButton: document.querySelector("#screenPermissionButton"),
  answerPanel: document.querySelector("#answerPanel"),
  answerText: document.querySelector("#answerText"),
  questionForm: document.querySelector("#questionForm"),
  questionInput: document.querySelector("#questionInput"),
  askButton: document.querySelector("#askButton"),
  apiHint: document.querySelector("#apiHint"),
  refreshButton: document.querySelector("#refreshButton"),
  settingsButton: document.querySelector("#settingsButton"),
  closeButton: document.querySelector("#closeButton"),
  settingsBackButton: document.querySelector("#settingsBackButton"),
  settingsForm: document.querySelector("#settingsForm"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  apiKeyState: document.querySelector("#apiKeyState"),
  modelInput: document.querySelector("#modelInput"),
  baseUrlInput: document.querySelector("#baseUrlInput"),
  captureSizeInput: document.querySelector("#captureSizeInput"),
  triggerModeInput: document.querySelector("#triggerModeInput"),
  holdDurationField: document.querySelector("#holdDurationField"),
  holdDurationInput: document.querySelector("#holdDurationInput"),
  hotkeyInput: document.querySelector("#hotkeyInput"),
  settingsMessage: document.querySelector("#settingsMessage"),
  inputPermissionButton: document.querySelector("#inputPermissionButton"),
  settingsScreenPermissionButton: document.querySelector("#settingsScreenPermissionButton")
};

const state = {
  settings: null,
  screenshot: null,
  requestId: null,
  streaming: false
};

function setView(name) {
  const showSettings = name === "settings";
  elements.assistantView.classList.toggle("hidden", showSettings);
  elements.settingsView.classList.toggle("hidden", !showSettings);
  window.cursorLens.setExpanded(showSettings || !elements.answerPanel.classList.contains("hidden"));
  if (!showSettings) setTimeout(() => elements.questionInput.focus(), 40);
}

function populateSettings(settings) {
  state.settings = settings;
  elements.apiKeyInput.value = "";
  elements.apiKeyState.textContent = settings.apiKeyConfigured
    ? `已配置（${settings.apiKeySource}）`
    : "未配置";
  elements.modelInput.value = settings.model;
  elements.baseUrlInput.value = settings.baseUrl;
  elements.captureSizeInput.value = String(settings.captureSize);
  elements.triggerModeInput.value = settings.triggerMode;
  elements.holdDurationField.classList.toggle("hidden", settings.triggerMode !== "hold");
  elements.holdDurationInput.value = String(settings.holdDurationMs);
  elements.hotkeyInput.value = settings.hotkey;
  elements.captureBadge.textContent = `${settings.captureSize} × ${settings.captureSize}`;
  elements.apiHint.classList.toggle("hidden", settings.apiKeyConfigured);
}

function showCapture(payload) {
  state.screenshot = payload?.screenshot || null;
  const error = payload?.error;
  elements.answerPanel.classList.add("hidden");
  elements.answerText.textContent = "";
  setStreaming(false);
  window.cursorLens.setExpanded(false);

  if (!state.screenshot) {
    elements.preview.classList.remove("has-image");
    elements.screenshot.removeAttribute("src");
    elements.previewMessage.textContent = error?.message || "没有可用的屏幕上下文";
    elements.captureStatus.textContent = error ? "截取失败" : "局部上下文";
    elements.pointerPosition.textContent = "";
    elements.screenPermissionButton.classList.toggle(
      "hidden",
      error?.code !== "SCREEN_PERMISSION_REQUIRED"
    );
    elements.askButton.disabled = true;
    return;
  }

  const screenshot = state.screenshot;
  elements.screenshot.src = screenshot.dataUrl;
  elements.pointerMarker.style.setProperty("--pointer-x", `${screenshot.cursor.normalizedX * 100}%`);
  elements.pointerMarker.style.setProperty("--pointer-y", `${screenshot.cursor.normalizedY * 100}%`);
  elements.captureStatus.textContent = `${screenshot.image.width} × ${screenshot.image.height}px`;
  elements.pointerPosition.textContent = `指向 ${screenshot.cursor.x}, ${screenshot.cursor.y}`;
  elements.preview.classList.add("has-image");
  elements.screenPermissionButton.classList.add("hidden");
  elements.askButton.disabled = false;
  setTimeout(() => elements.questionInput.focus(), 30);
}

function setStreaming(streaming) {
  state.streaming = streaming;
  elements.answerPanel.classList.toggle("is-streaming", streaming);
  elements.askButton.textContent = streaming ? "■" : "↑";
  elements.askButton.setAttribute("aria-label", streaming ? "停止生成" : "发送问题");
}

function showAnswer(message = "") {
  elements.answerPanel.classList.remove("hidden");
  elements.answerText.textContent = message;
  elements.answerPanel.scrollTop = elements.answerPanel.scrollHeight;
  window.cursorLens.setExpanded(true);
}

async function submitQuestion() {
  if (state.streaming) {
    await window.cursorLens.cancel();
    return;
  }

  const question = elements.questionInput.value.trim();
  if (!question) return;
  if (!state.settings.apiKeyConfigured) {
    setView("settings");
    elements.apiKeyInput.focus();
    elements.settingsMessage.textContent = "请先配置 API Key。";
    return;
  }
  if (!state.screenshot) return;

  state.requestId = crypto.randomUUID();
  showAnswer("");
  setStreaming(true);
  try {
    await window.cursorLens.ask({ question, requestId: state.requestId });
  } catch (error) {
    if (!elements.answerText.textContent) showAnswer(error.message || "请求失败。");
    setStreaming(false);
  }
}

elements.questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuestion();
});

elements.questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitQuestion();
  }
});

elements.refreshButton.addEventListener("click", async () => {
  elements.preview.classList.remove("has-image");
  elements.previewMessage.textContent = "正在重新截取…";
  elements.askButton.disabled = true;
  await window.cursorLens.refreshContext();
});

elements.settingsButton.addEventListener("click", () => setView("settings"));
elements.settingsBackButton.addEventListener("click", () => setView("assistant"));
elements.closeButton.addEventListener("click", () => window.cursorLens.hide());
elements.apiHint.addEventListener("click", () => setView("settings"));
elements.screenPermissionButton.addEventListener("click", () => window.cursorLens.openPermission("screen"));
elements.inputPermissionButton.addEventListener("click", () => window.cursorLens.openPermission("input"));
elements.settingsScreenPermissionButton.addEventListener("click", () =>
  window.cursorLens.openPermission("screen")
);
elements.triggerModeInput.addEventListener("change", () => {
  elements.holdDurationField.classList.toggle("hidden", elements.triggerModeInput.value !== "hold");
});

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.settingsMessage.classList.remove("error");
  elements.settingsMessage.textContent = "正在保存…";
  try {
    const settings = await window.cursorLens.saveSettings({
      apiKey: elements.apiKeyInput.value,
      model: elements.modelInput.value,
      baseUrl: elements.baseUrlInput.value,
      captureSize: Number(elements.captureSizeInput.value),
      triggerMode: elements.triggerModeInput.value,
      holdDurationMs: Number(elements.holdDurationInput.value),
      hotkey: elements.hotkeyInput.value
    });
    populateSettings(settings);
    elements.settingsMessage.textContent = "已保存。快捷键监听已重新启动。";
  } catch (error) {
    elements.settingsMessage.classList.add("error");
    elements.settingsMessage.textContent = error.message || "保存失败。";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!elements.settingsView.classList.contains("hidden")) setView("assistant");
    else window.cursorLens.hide();
  }
  if (event.key === "," && event.metaKey) {
    event.preventDefault();
    setView("settings");
  }
});

window.cursorLens.onContextUpdated(showCapture);
window.cursorLens.onOpenSettings(() => setView("settings"));
window.cursorLens.onAssistantStream((event) => {
  if (event.requestId !== state.requestId) return;
  if (event.type === "delta") {
    elements.answerText.textContent += event.text;
    elements.answerPanel.scrollTop = elements.answerPanel.scrollHeight;
  } else if (event.type === "error") {
    showAnswer(event.message || "请求失败。");
    setStreaming(false);
  } else if (event.type === "cancelled") {
    if (!elements.answerText.textContent) showAnswer(event.message || "已停止生成。");
    setStreaming(false);
  } else if (event.type === "done") {
    setStreaming(false);
  }
});

window.cursorLens.bootstrap().then((bootstrap) => {
  populateSettings(bootstrap.settings);
  showCapture({ screenshot: bootstrap.screenshot });
});
