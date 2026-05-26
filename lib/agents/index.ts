import { ToolLoopAgent, stepCountIs } from "ai";
import { subconsciousModel } from "@/lib/subconscious";
import { agentTools, chatTools } from "@/lib/tools";
import { createMcpTools } from "@/lib/tools/mcp-tools";

const CHAT_INSTRUCTIONS = `You are a helpful hackathon assistant powered by Subconscious (TIM-Qwen3.6).

You can use tools when they help answer the user. Keep replies concise and practical.
When the user attaches an image, describe what you see and answer their question.
If you need more steps or research, suggest they switch to Agent mode.`;

const AGENT_INSTRUCTIONS = `You are a long-running research and execution agent for a hackathon project.

Break complex requests into steps. Use tools to gather information, run calculations,
search the web, and execute multi-step tasks. Think carefully before acting.

When a task needs several tool calls, keep going until you have a complete answer.
Summarize findings clearly at the end with actionable next steps for the hacker team.`;

/** Quick chat with a small tool set. */
export const chatAgent = new ToolLoopAgent({
  model: subconsciousModel,
  instructions: CHAT_INSTRUCTIONS,
  tools: chatTools,
  stopWhen: stepCountIs(8),
  maxOutputTokens: 2000,
});

/** Long-running agent with search, multi-step tasks, and MCP examples. */
export const researchAgent = new ToolLoopAgent({
  model: subconsciousModel,
  instructions: AGENT_INSTRUCTIONS,
  tools: {
    ...agentTools,
    ...createMcpTools(),
  },
  stopWhen: stepCountIs(30),
  maxOutputTokens: 4000,
});

export type AgentMode = "chat" | "agent";
