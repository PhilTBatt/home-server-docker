import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createApiGet, createApiPost, readToken } from "./api.js";
import { buildServer } from "./tools.js";

const token = readToken(process.env);
const server = buildServer(createApiGet(token), createApiPost(token));
await server.connect(new StdioServerTransport());