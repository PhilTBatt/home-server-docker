import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { lookUpToolDescription, lookUpToolName, webServerName, type LookUpTool } from "./look-up-tool.js";

export function lookUpServer(lookUpTool: LookUpTool): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: webServerName,
    tools: [
      tool(lookUpToolName, lookUpToolDescription, { question: z.string() }, async (input) => {
        const outcome = await lookUpTool.run(input);
        return { content: [{ type: "text", text: outcome.content }], isError: outcome.isError };
      }),
    ],
  });
}
