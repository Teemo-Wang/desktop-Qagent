"use strict";

async function* iterateServerSentEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const eventBlock = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = eventBlock
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield data;
      boundary = buffer.indexOf("\n\n");
    }

    if (done) break;
  }

  const trailing = buffer.trim();
  if (trailing.startsWith("data:")) {
    yield trailing.slice(5).trimStart();
  }
}

function extractDelta(payload) {
  const content = payload?.choices?.[0]?.delta?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || "").join("");
  }
  return "";
}

class OpenAICompatibleProvider {
  async streamAnswer({ question, screenshot, settings, signal, onDelta }) {
    if (!settings.apiKey) {
      const error = new Error("请先在设置中填写 API Key，或设置 OPENAI_API_KEY 环境变量。");
      error.code = "API_KEY_MISSING";
      throw error;
    }

    const pointerDescription = [
      `The screenshot is ${screenshot.image.width}×${screenshot.image.height} pixels.`,
      `The user's pointer target is at pixel (${screenshot.cursor.x}, ${screenshot.cursor.y}) from the top-left,`,
      `or (${screenshot.cursor.normalizedX.toFixed(4)}, ${screenshot.cursor.normalizedY.toFixed(4)}) in normalized coordinates.`,
      "Resolve words such as “this”, “here”, and “that button” against that exact point.",
      "The pointer marker is metadata and may not be visible in the image."
    ].join(" ");

    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.model,
        stream: true,
        max_tokens: settings.maxOutputTokens,
        messages: [
          { role: "system", content: settings.systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${pointerDescription}\n\nUser question: ${question}`
              },
              {
                type: "image_url",
                image_url: { url: screenshot.dataUrl, detail: "high" }
              }
            ]
          }
        ]
      }),
      signal
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 1000);
      const error = new Error(`模型请求失败（HTTP ${response.status}）：${details || response.statusText}`);
      error.code = "MODEL_REQUEST_FAILED";
      throw error;
    }

    let fullText = "";
    for await (const data of iterateServerSentEvents(response.body)) {
      if (data === "[DONE]") break;
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = extractDelta(payload);
      if (delta) {
        fullText += delta;
        onDelta(delta);
      }
    }
    return fullText;
  }
}

module.exports = { OpenAICompatibleProvider, iterateServerSentEvents, extractDelta };
