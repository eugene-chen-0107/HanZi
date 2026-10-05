const http = require("http");
const fs = require("fs");
const path = require("path");

// Load a local .env file when present. Never commit it; use .env.example as a guide.
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const files = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};
function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
function responseText(payload) {
  return payload.choices?.[0]?.message?.content || "";
}
function parseJsonResponse(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!cleaned) throw new Error("The AI returned an empty response.");
  try {
    return JSON.parse(cleaned);
  } catch {
    const starts = [cleaned.indexOf("{"), cleaned.indexOf("[")].filter(
      (index) => index >= 0,
    );
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {}
    }
    throw new Error(
      "The AI returned incomplete JSON. Try fewer words at once.",
    );
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && files[req.url]) {
    const file = path.join(__dirname, files[req.url]);
    res.writeHead(200, { "Content-Type": types[path.extname(file)] });
    return fs.createReadStream(file).pipe(res);
  }
  if (req.method === "POST" && req.url === "/api/chat") {
    if (!process.env.GROQ_API_KEY)
      return send(res, 503, { error: "Study Coach is not configured." });
    try {
      const body = JSON.parse(await readBody(req));
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const words = Array.isArray(body.words) ? body.words : [];
      const focusWord =
        body.focusWord && typeof body.focusWord === "object"
          ? body.focusWord
          : null;
      if (!messages.length || messages.length > 12)
        return send(res, 400, {
          error: "Send a conversation with 1 to 12 messages.",
        });
      const safeMessages = messages
        .filter((message) => ["user", "assistant"].includes(message.role))
        .map((message) => ({
          role: message.role,
          content: String(message.content || "").slice(0, 2_000),
        }));
      const vocabulary = words
        .slice(0, 50)
        .map((word) => `${word.term} — ${word.meaning || "meaning unknown"}`)
        .join("\\n");
      const api = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-20b",
            temperature: 0.7,
            messages: [
              {
                role: "system",
                content: `You are Hanji, a warm and perceptive Chinese language tutor having a real conversation with one learner. Your goal is to help the learner communicate more naturally, not to recite dictionary entries. The coach's response language is English: never answer entirely in Chinese, even when the learner writes in Chinese.

Conversation style:
- Respond to what the learner is trying to say before teaching anything extra. Sound encouraging, curious, and human.
- Ask one useful follow-up question when it would keep the conversation going. Do not end every response with a generic question.
- Keep replies focused and reasonably short. Teach one or two useful ideas at a time instead of dumping facts or lists.
- When the learner writes Chinese, respond in English first, then gently correct only the most important issue. Show the improved Chinese sentence, its English translation, and briefly explain why.
- Write all explanations, questions, corrections, instructions, encouragement, and feedback in English. Chinese may appear only as clearly labeled practice material, quoted examples, or target vocabulary, and any Chinese must have an English translation.
- Invite the learner to produce language: ask them in English to answer in Chinese, complete a sentence, choose between two natural options, or try again. Give a small hint before revealing an answer.
- Use the learner's saved words in realistic situations, mini-dialogues, and contextual practice. Do not force vocabulary into a sentence when it would sound unnatural.
- Include pinyin only when it helps pronunciation or the learner asks for it, and explain it in English.
- If the learner asks for a quiz, give the prompts and feedback in English, show Chinese only for the exercise material, and run it interactively one question at a time. If they ask for a conversation, explain the role-play in English and keep guidance in English.
- Celebrate progress specifically, and correct mistakes without sounding judgmental.
- Never invent a saved word or pretend the learner has practiced something they have not. You may use simple unsaved words when needed for a natural example, but say so if it matters.

${focusWord ? `For this focused word, teach it through conversation and practice rather than a fact dump. Use its meaning, part of speech, register, collocations, grammar patterns, pronunciation, and natural examples only when relevant to the learner's question: ${JSON.stringify(focusWord)}.` : ""}
Saved vocabulary:\\n${vocabulary || "No words saved yet."}`,
              },
              ...safeMessages,
            ],
          }),
        },
      );
      if (!api.ok)
        return send(res, api.status, {
          error: "The Study Coach request failed.",
          detail: await api.text(),
        });
      const message = responseText(await api.json());
      if (!message)
        throw new Error("The Study Coach returned an empty response");
      return send(res, 200, { message });
    } catch (error) {
      return send(res, 500, {
        error: "Could not reach the Study Coach.",
        detail: error.message,
      });
    }
  }
  if (req.method !== "POST" || req.url !== "/api/enrich")
    return send(res, 404, { error: "Not found" });
  if (!process.env.GROQ_API_KEY)
    return send(res, 503, { error: "AI enrichment is not configured." });
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 100_000) req.destroy();
  });
  req.on("end", async () => {
    try {
      const terms = JSON.parse(raw).terms;
      if (!Array.isArray(terms) || !terms.length || terms.length > 50)
        return send(res, 400, { error: "Send 1 to 50 words." });
      const prompt = `You are a meticulous Chinese-English lexicographer. Analyze every supplied term carefully before answering. Return a JSON object with an items array, one item per input in the same order. Each item must have exactly: {"term":"original input","meaning":"accurate concise English definition","partOfSpeech":"noun, verb, adjective, phrase, etc.","sentences":{"beginner":["short natural Chinese sentence containing the exact term"],"intermediate":["natural Chinese sentence containing the exact term"],"advanced":["natural sophisticated Chinese sentence containing the exact term"]}}. Preserve the exact Chinese term in every Chinese sentence. Check polysemy and choose the most common learner-relevant meaning; mention a second common meaning briefly when necessary. Do not translate word-for-word if it produces unnatural English. Do not put English inside Chinese example sentences. Terms: ${JSON.stringify(terms)}`;
      const fallbackModel = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-20b";
      const configuredModel =
        process.env.GROQ_ENRICH_MODEL || "openai/gpt-oss-20b";
      const selectedModel = /prompt-guard|safeguard/i.test(configuredModel)
        ? fallbackModel
        : configuredModel;
      let api = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: "system",
              content:
                "Return valid JSON only. Do not include pinyin; pronunciation is generated locally by the app.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          max_completion_tokens: 4_000,
        }),
      });
      if (
        !api.ok &&
        selectedModel !== fallbackModel &&
        [400, 404, 422].includes(api.status)
      ) {
        await api.text();
        api = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: fallbackModel,
            messages: [
              {
                role: "system",
                content:
                  "Return valid JSON only. Do not include pinyin; pronunciation is generated locally by the app.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            max_completion_tokens: 4_000,
          }),
        });
      }
      if (!api.ok)
        return send(res, api.status, {
          error: "The AI request failed.",
          detail: await api.text(),
        });
      const text = responseText(await api.json()).replace(
        /^```json\s*|\s*```$/g,
        "",
      );
      const parsed = parseJsonResponse(text);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items))
        throw new Error("AI response did not include an items array");
      return send(res, 200, { items });
    } catch (error) {
      return send(res, 500, {
        error: "Could not create AI study data.",
        detail: error.message,
      });
    }
  });
});
server.listen(process.env.PORT || 3001, () =>
  console.log("Hanji is running at http://localhost:3001"),
);
