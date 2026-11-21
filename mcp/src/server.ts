import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createApiGet, createApiPost } from "./api.js";
import { readConfig } from "./config.js";
import { buildServer } from "./tools.js";

const config = readConfig(process.env);
const server = buildServer(createApiGet(config.apiToken), createApiPost(config.apiToken), config.actions, createApiGet(config.apiToken, 60_000));
await server.connect(new StdioServerTransport());