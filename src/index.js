#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { toolMap, tools } from "./tools/index.js";

function createServer() {
  const server = new McpServer({
    name: "kylin-offline-mcp-echarts",
    version: "0.1.0",
  });

  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema.shape, tool.run);
  }

  return server;
}

const { values } = parseArgs({
  options: {
    transport: { type: "string", short: "t", default: "sse" },
    port: { type: "string", short: "p", default: String(config.defaultPort) },
    endpoint: { type: "string", short: "e", default: "" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`
Kylin Offline MCP ECharts

Options:
  --transport, -t  "stdio", "sse", or "streamable" (default: sse)
  --port, -p       HTTP port for SSE/streamable transport (default: 7003)
  --endpoint, -e   SSE endpoint (default: /sse) or streamable endpoint (default: /mcp)
`);
  process.exit(0);
}

const transport = values.transport.toLowerCase();
const port = Number.parseInt(values.port, 10);

if (transport === "stdio") {
  await runStdioServer();
} else if (transport === "streamable") {
  await runStreamableHTTPServer(port, values.endpoint || "/mcp");
} else {
  await runSSEServer(port, values.endpoint || "/sse");
}

async function runStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runSSEServer(port, endpoint) {
  const app = createApp();
  const transports = {};

  app.get(endpoint, async (_req, res) => {
    const server = createServer();
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;
    res.on("close", () => {
      delete transports[transport.sessionId];
    });
    await server.connect(transport);
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = transports[sessionId];
    if (!transport) {
      res.status(400).send("No transport found for sessionId");
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  app.listen(port, config.host, () => {
    console.log(`Kylin Offline MCP ECharts SSE server listening on http://127.0.0.1:${port}${endpoint}`);
  });
}

async function runStreamableHTTPServer(port, endpoint) {
  const app = createApp();
  const transports = {};

  app.post(endpoint, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    let transport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };
      await createServer().connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session ID provided" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get(endpoint, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete(endpoint, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.listen(port, config.host, () => {
    console.log(`Kylin Offline MCP ECharts streamable server listening on http://127.0.0.1:${port}${endpoint}`);
  });
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use("/charts", express.static(config.chartsDir, {
    immutable: false,
    maxAge: "1h",
  }));
  app.post("/api/tools/:toolName", async (req, res) => {
    const tool = toolMap.get(req.params.toolName);
    if (!tool) {
      res.status(404).json({
        status: "error",
        message: `Unknown tool: ${req.params.toolName}`,
        availableTools: tools.map((item) => item.name),
      });
      return;
    }

    try {
      const parsed = tool.inputSchema.parse(req.body ?? {});
      const result = await tool.run(parsed);
      const text = result?.content?.[0]?.text;
      if (!text) {
        res.status(500).json({
          status: "error",
          message: "Tool returned an empty response.",
        });
        return;
      }

      try {
        const payload = JSON.parse(text);
        res.json(payload);
      } catch {
        res.json({
          status: "success",
          tool: tool.name,
          result: text,
        });
      }
    } catch (error) {
      res.status(400).json({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  app.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      service: "kylin-offline-mcp-echarts",
      transport: "sse",
      chartsDir: config.chartsDir,
      renderer: "echarts-svg-ssr+rsvg-convert",
      canvas: false,
      httpToolEndpoint: "/api/tools/:toolName",
    });
  });
  return app;
}

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});
