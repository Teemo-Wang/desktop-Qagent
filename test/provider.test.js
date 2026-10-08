"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const {
  OpenAICompatibleProvider,
  extractDelta,
  iterateServerSentEvents
} = require("../src/main/providers/openai-compatible-provider");

test("parses SSE events split across arbitrary chunks", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    "data: {\"choices\":[{\"delta\":",
    "{\"content\":\"你\"}}]}\n\n",
    "data: {\"choices\":[{\"delta\":{\"content\":\"好\"}}]}\n\ndata: [DONE]\n\n"
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });

  const events = [];
  for await (const event of iterateServerSentEvents(stream)) events.push(event);

  assert.equal(events.length, 3);
  assert.equal(extractDelta(JSON.parse(events[0])), "你");
  assert.equal(extractDelta(JSON.parse(events[1])), "好");
  assert.equal(events[2], "[DONE]");
});

test("supports array-shaped streaming content", () => {
  assert.equal(
    extractDelta({ choices: [{ delta: { content: [{ text: "A" }, { text: "B" }] } }] }),
    "AB"
  );
});

test("sends screenshot and pointer coordinates and streams the answer", async (context) => {
  let receivedBody;
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      receivedBody = JSON.parse(body);
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write('data: {"choices":[{"delta":{"content":"看"}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":"到了"}}]}\n\n');
      response.end("data: [DONE]\n\n");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const port = server.address().port;
  const deltas = [];
  const provider = new OpenAICompatibleProvider();
  const answer = await provider.streamAnswer({
    question: "这个按钮是什么？",
    screenshot: {
      dataUrl: "data:image/png;base64,AAAA",
      image: { width: 1200, height: 1200 },
      cursor: { x: 610, y: 420, normalizedX: 610 / 1200, normalizedY: 420 / 1200 }
    },
    settings: {
      apiKey: "test-key",
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: "vision-test",
      maxOutputTokens: 300,
      systemPrompt: "Test prompt"
    },
    signal: new AbortController().signal,
    onDelta: (delta) => deltas.push(delta)
  });

  assert.equal(answer, "看到了");
  assert.deepEqual(deltas, ["看", "到了"]);
  assert.equal(receivedBody.model, "vision-test");
  assert.equal(receivedBody.stream, true);
  assert.match(receivedBody.messages[1].content[0].text, /pixel \(610, 420\)/);
  assert.equal(receivedBody.messages[1].content[1].image_url.url, "data:image/png;base64,AAAA");
});
