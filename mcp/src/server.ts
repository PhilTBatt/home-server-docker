import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createApiGet, readToken } from "./api.js";
import { buildServer } from "./tools.js";

const server = buildServer(createApiGet(readToken(process.env)));
await server.connect(new StdioServerTransport());