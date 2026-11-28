import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createApiDelete, createApiGet, createApiPost } from "./api.js";
import { readConfig } from "./config.js";
import { buildServer } from "./tools.js";

const config = readConfig(process.env);
const server = buildServer(createApiGet(config.apiToken), createApiPost(config.apiToken), config.actions, createApiGet(config.apiToken, 60_000), createApiDelete(config.apiToken), config.wallPages);
await server.connect(new StdioServerTransport());