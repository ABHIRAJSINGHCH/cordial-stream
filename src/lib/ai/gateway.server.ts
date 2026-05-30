// Server-only AI gateway client. Never import from client code.
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ToolCall {
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function aiToolCall<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  parameters: Record<string, unknown>;
  model?: string;
}): Promise<T> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3-flash-preview",
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: opts.toolName,
            description: opts.toolDescription,
            parameters: opts.parameters,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: opts.toolName } },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
    const text = await res.text();
    console.error("AI gateway error", res.status, text);
    throw new Error(`AI gateway error (${res.status})`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { tool_calls?: ToolCall[]; content?: string } }>;
  };

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw new Error("AI did not return a tool call");
  }
  try {
    return JSON.parse(toolCall.function.arguments) as T;
  } catch {
    throw new Error("AI returned invalid JSON");
  }
}
