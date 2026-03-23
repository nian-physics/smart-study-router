require("dotenv").config();
const express = require("express");
const cors = require("cors");
const prompts = require("./prompts");
const app = express();

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

const PORT = process.env.PORT || 8787;
const UPSTREAM_BASE_URL = process.env.UPSTREAM_BASE_URL;
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY;
const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL;
const ANSWER_MODEL = process.env.ANSWER_MODEL;

if (!UPSTREAM_BASE_URL || !UPSTREAM_API_KEY || !CLASSIFIER_MODEL || !ANSWER_MODEL) {
  console.error("❌ 缺少环境变量，请检查 .env 文件");
  process.exit(1);
}

function buildClassifierPrompt(userText) {
  return [
    {
      role: "system",
      content: `
你是分类器，不是讲解老师。
请判断下面内容最可能属于哪一类，只返回一个数字，不要解释，不要输出其他文字：

1 = Linux 命令
2 = Python 代码
3 = C 语言代码
4 = JavaScript 代码
5 = TypeScript 代码
6 = 技术文本
7 = 其他内容

注：
 - 只有代码才返回2或3或4或5，非代码内容以及非Linux命令的内容请根据你的判断返回6或者7
 - 只有跟计算机软件相关的内容才有可能判定为技术文本，否则判定为其他内容。其他内容可能有：数学、物理、化学、计算机、生物、医学、科技、计算机硬件、金融、时政、新闻，或者其他各种学习型内容。
 - 只有内容确实是技术文本才会判定为技术文本，如果是其他跟计算机相关的但不是文本内容则不要判断为技术文本，例如文件发了一个系统设置，文件结构图片等等，这些都不是技术文本。注意，用户可能发送图片，图片也可以被判断为技术文本，只要图片里的内容确实是技术文本。

      `.trim(),
    },
    {
      role: "user",
      content: userText,
    },
  ];
}

function mapCategory(num) {
  switch (num) {
    case "1":
      return "linux";
    case "2":
      return "python";
    case "3":
      return "c";
    case "4":
      return "JavaScript";
    case "5":
      return "TypeScript";
    case "6":
      return "technical_text";
    default:
      return "other";
  }
}

function getCategoryByLabel(label) {
  for (const [key, value] of Object.entries(prompts)) {
    if (value.label === label) {
      return key;
    }
  }
  return null;
}

function extractCategoryFromHistory(messages) {
  const assistantMessages = [...messages]
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .reverse();

  for (const msg of assistantMessages) {
    const match = msg.content.match(/^识别类别：(.+?)$/m);
    if (match) {
      const label = match[1].trim();
      const category = getCategoryByLabel(label);
      if (category) {
        return category;
      }
    }
  }

  return null;
}

function stripRouterPrefix(content) {
  if (typeof content !== "string") return content;

  return content.replace(/^识别类别：.*?\n\s*\nAI讲解：\n?/s, "").trim();
}

function getCategoryLabel(category) {
  return prompts[category]?.label || prompts.other.label;
}

function getSystemPromptByCategory(category) {
  return prompts[category]?.prompt || prompts.other.prompt;
}

async function callUpstream({ model, messages, stream = false, temperature = 0.3, signal }) {
  const response = await fetch(`${UPSTREAM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${UPSTREAM_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstream API error: ${response.status} ${text}`);
  }

  return response;
}

async function classifyText(userText) {
  const response = await callUpstream({
    model: CLASSIFIER_MODEL,
    messages: buildClassifierPrompt(userText),
    stream: false,
    temperature: 0,
  });

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim() || "7";
  const digit = (content.match(/[1-7]/) || ["7"])[0];
  return mapCategory(digit);
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/v1/chat/completions", async (req, res) => {
  try {
    const { messages = [], stream = true } = req.body;

    const lastUserMessage =
  [...messages].reverse().find((m) => m.role === "user")?.content || "";

// 1. 先尝试从历史对话里恢复已经确定过的类别
const existingCategory = extractCategoryFromHistory(messages);

// 2. 如果是全新对话，没有历史类别，再用“第一条用户消息”做首次分类
const firstUserMessage =
  messages.find((m) => m.role === "user" && typeof m.content === "string")?.content || lastUserMessage;

const category = existingCategory || await classifyText(firstUserMessage);
const systemPrompt = getSystemPromptByCategory(category);

// 3. 清理历史 assistant 消息里我们自己加的前缀，避免污染上下文
const cleanedMessages = messages.map((m) => {
  if (m.role === "assistant" && typeof m.content === "string") {
    return {
      ...m,
      content: stripRouterPrefix(m.content),
    };
  }
  return m;
});

const finalMessages = [
  {
    role: "system",
    content: systemPrompt,
  },
  ...cleanedMessages,
];

    const upstreamResponse = await callUpstream({
      model: ANSWER_MODEL,
      messages: finalMessages,
      stream,
      temperature: 0.3,
      signal: req.signal,
    });

    if (!stream) {
      const data = await upstreamResponse.json();
      const originalContent = data?.choices?.[0]?.message?.content || "";
      const categoryLabel = getCategoryLabel(category);
      const wrappedContent = `识别类别：${categoryLabel}

AI讲解：
${originalContent}`;

  if (data?.choices?.[0]?.message) {
    data.choices[0].message.content = wrappedContent;
  }

  return res.json({
    ...data,
    router_meta: {
      category,
      category_label: categoryLabel,
      classifier_model: CLASSIFIER_MODEL,
      answer_model: ANSWER_MODEL,
    },
  });
}

res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
res.setHeader("Cache-Control", "no-cache, no-transform");
res.setHeader("Connection", "keep-alive");

const reader = upstreamResponse.body.getReader();
const decoder = new TextDecoder();

const categoryLabel = getCategoryLabel(category);
const prefix = `识别类别：${categoryLabel}

AI讲解：
`;

// 先把“识别类别 + AI讲解”作为第一段流式内容发给 Cherry Studio
const prefixEvent = {
  id: `router-prefix-${Date.now()}`,
  object: "chat.completion.chunk",
  created: Math.floor(Date.now() / 1000),
  model: ANSWER_MODEL,
  choices: [
    {
      index: 0,
      delta: {
        content: prefix,
      },
      finish_reason: null,
    },
  ],
};

res.write(`data: ${JSON.stringify(prefixEvent)}\n\n`);

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value, { stream: true });
  res.write(chunk);
}

res.end();

// 先把“识别类别 + AI讲解”作为第一段流式内容发给 Cherry Studio

  } catch (error) {
    console.error("❌ Router error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: String(error.message || error),
          type: "router_error",
        },
      });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`✅ Smart Study Router is running at http://127.0.0.1:${PORT}`);
});