# MCP Setup Guide (Claude CLI)

This guide explains how to register and use the MCP server for the **MCP Code Analyzer** project with Claude CLI.

---

## Prerequisites

- Node.js installed (v18+ recommended)
- Claude CLI installed
- Project dependencies installed

---

## 1. Build the MCP Server

```bash
cd mcp-server
npm install
npm run build
```

Verify:
```
dist/server.js
```

---

## 2. Test the MCP Server Locally

```bash
node mcp-server/dist/server.js
```

Expected:
```
[MCP] MCP Server starting...
[MCP] MCP Server ready
```

---

## 3. Register MCP Server (Dynamic Path)

> Navigate to your project root before running commands.

### Windows (CMD)
```bat
cd <your-project-root>
claude mcp add mcp-code-analyzer node "%CD%\mcp-server\dist\server.js"
```

### Windows (PowerShell)
```powershell
cd <your-project-root>
claude mcp add mcp-code-analyzer node "$PWD/mcp-server/dist/server.js"
```

### macOS / Linux
```bash
cd <your-project-root>
claude mcp add mcp-code-analyzer node "$(pwd)/mcp-server/dist/server.js"
```

---

## 4. Verify Registration

```bash
claude mcp list
```

You should see:
```
mcp-code-analyzer
```

---

## 5. Start Claude CLI

```bash
claude
```

Then ask:
```
what tools do you have?
```

Expected tools:
- analyze_repo
- read_findings
- get_project_context

---

## 6. Run the Analyzer

Example:

```
Run analyze_repo with:
repoRoot: <path-to-your-test-repo>
mode: all
```

---

## 7. Remove MCP Server

```bash
claude mcp remove mcp-code-analyzer
```

---

## Notes

- Always use dynamic paths instead of hardcoded absolute paths
- Wrap paths with quotes if they contain spaces
- Re-register MCP if project folder changes
- Do NOT manually run the server after registering with Claude

---

## Summary

1. Build MCP server
2. Test locally
3. Register using dynamic path
4. Verify tools
5. Use via Claude CLI

---

End of guide.
