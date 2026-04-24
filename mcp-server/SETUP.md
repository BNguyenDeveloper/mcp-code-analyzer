# MCP Server Setup Guide

## Quick Start (5 minutes)

### 1. Install and Build

```bash
# From mcp-server directory
npm install
npm run build
```

**Result:** Creates `dist/server.js` (the MCP server executable)

### 2. Verify Parent Analyzer is Ready

```bash
# From parent directory (one level up)
cd ..
npm install
npm run build

# Test that analyzer works
npm run index
npm run analyze
```

**Expected:** Should analyze test-java-code and show findings.

### 3. Configure Claude Desktop

**Find your config file:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

**Add this configuration:**

```json
{
  "mcpServers": {
    "java-code-intel": {
      "command": "node",
      "args": [
        "C:/Absolute_Softwares/Claude AI/company-code-intel-java-phase2/company-code-intel-java-phase2/mcp-server/dist/server.js"
      ]
    }
  }
}
```

**⚠️ IMPORTANT:** 
- Use **absolute path** to `dist/server.js`
- Use **forward slashes** `/` even on Windows
- Update path to match your installation location

### 4. Restart Claude Desktop

After saving the config, completely quit and restart Claude Desktop.

### 5. Test in Claude

In a new conversation, ask:

```
Can you analyze this Java project for security issues?
C:/path/to/your/java/project
```

Claude will use the `analyze_repo` tool.

---

## Manual Testing (Without Claude Desktop)

You can test the MCP server directly via command line:

```bash
# Start the server (it listens on stdin)
node dist/server.js

# In the server's stdin, paste this JSON-RPC request:
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

Press Enter. You should see a response listing the `analyze_repo` tool.

To test analysis:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "analyze_repo",
    "arguments": {
      "repoRoot": "C:/Absolute_Softwares/Claude AI/company-code-intel-java-phase2/test-java-code",
      "mode": "all"
    }
  }
}
```

**Expected:** Server runs analysis and returns findings JSON.

---

## Example Usage in Claude

### Example 1: Full Analysis

**You:**
```
Analyze this Java repository for all issues:
/Users/dev/projects/my-spring-app
```

**Claude uses:**
```json
{
  "name": "analyze_repo",
  "arguments": {
    "repoRoot": "/Users/dev/projects/my-spring-app",
    "mode": "all"
  }
}
```

**Result:** Returns bug + security findings

---

### Example 2: Security Only

**You:**
```
Check this repo for security vulnerabilities:
C:/projects/payment-service
```

**Claude uses:**
```json
{
  "name": "analyze_repo",
  "arguments": {
    "repoRoot": "C:/projects/payment-service",
    "mode": "security"
  }
}
```

**Result:** Returns only security findings (SQL injection, command injection)

---

### Example 3: Bugs Only

**You:**
```
Find bugs in this codebase:
/home/user/java/user-service
```

**Claude uses:**
```json
{
  "name": "analyze_repo",
  "arguments": {
    "repoRoot": "/home/user/java/user-service",
    "mode": "bugs"
  }
}
```

**Result:** Returns only bug findings (Optional.get(), resource leaks, empty catches)

---

## Troubleshooting

### "Cannot find module '@modelcontextprotocol/sdk'"

**Problem:** Dependencies not installed

**Solution:**
```bash
cd mcp-server
npm install
```

---

### "dist/server.js not found"

**Problem:** TypeScript not compiled

**Solution:**
```bash
cd mcp-server
npm run build
```

---

### "Repository path does not exist"

**Problem:** Invalid or relative path provided

**Solution:** 
- Use **absolute paths** (e.g., `C:/projects/my-app` not `../my-app`)
- Verify directory exists
- On Windows, use forward slashes: `C:/path/to/project`

---

### Tool doesn't appear in Claude

**Problem:** Config not loaded or incorrect path

**Solution:**
1. Verify `claude_desktop_config.json` syntax is valid JSON
2. Check absolute path to `dist/server.js` is correct
3. Restart Claude Desktop (quit completely, not just close window)
4. Check Claude Desktop logs for errors

**Windows logs:** `%APPDATA%\Claude\logs\`  
**macOS logs:** `~/Library/Logs/Claude/`

---

### Analysis hangs or times out

**Problem:** Parent analyzer not working or taking too long

**Solution:**
1. Test analyzer manually:
   ```bash
   cd ..
   npm run index
   npm run analyze
   ```
2. Check if Java analyzer JAR exists: `java-analyzer/target/*.jar`
3. Rebuild if needed:
   ```bash
   cd java-analyzer
   mvn clean package
   ```

---

### "Failed to index repository"

**Problem:** No Java source files or invalid structure

**Solution:**
- Ensure repository has `src/` or `src/main/java/` directory
- Verify Java source files (*.java) exist
- Try running manually: `cd .. && npm run index`

---

## Debugging

MCP server logs to **stderr**. To see logs:

### From Command Line:
```bash
node dist/server.js 2>&1 | grep '\[MCP\]'
```

### From Claude Desktop:
Check logs directory (locations above)

### Debug Output Includes:
- `[MCP] Starting analyze_repo`
- `[MCP] Backed up existing repos.json`
- `[MCP] Running index command...`
- `[MCP] Running analyze command...`
- `[MCP] Read X findings`
- `[MCP] Analysis completed successfully`

---

## System Requirements

- **Node.js:** v18 or higher
- **Java:** JDK 17 or higher (for parent analyzer)
- **Maven:** For building Java analyzer
- **OS:** Windows, macOS, or Linux

---

## Development

### Rebuild After Changes

```bash
npm run build
```

Restart Claude Desktop to pick up changes.

### Development Mode (auto-rebuild)

```bash
npm run dev
```

Runs with `ts-node` (no build step needed). Useful for testing changes.

---

## Architecture Overview

```
Claude Desktop
      ↓ (JSON-RPC via stdio)
MCP Server (server.ts)
      ↓ (temporary repos.json swap)
Parent Analyzer (../src/)
  - npm run index
  - npm run analyze
      ↓ (writes files)
data/findings/*.json
      ↓ (reads)
MCP Server → Returns to Claude
```

**Key:** Zero modifications to analyzer core. Just orchestrates config and execution.

---

## Security Considerations

- **Local execution only:** Analyzer runs on your machine
- **File system access:** MCP server can read/write in project directory
- **Temporary files:** Creates `repos.json.backup` (cleaned up automatically)
- **Process execution:** Runs `npm` commands via child_process

---

## What Gets Analyzed

The tool detects:

### Bug Patterns (3 rules)
- **BUG-001:** Unsafe Optional.get() (75% confidence)
- **BUG-002:** Resource leaks (70% confidence)  
- **BUG-003:** Empty catch blocks (95% confidence)

### Security Vulnerabilities (2 rules)
- **SEC-001:** SQL injection (60-90% confidence, CWE-89)
- **SEC-002:** Command injection (65-95% confidence, CWE-78)

All findings include:
- File path and line number
- Severity (critical, high, medium, low)
- Confidence score
- Remediation advice
- CWE mapping (security issues)

---

## Next Steps

Once setup is complete:

1. ✅ Test with test-java-code (included in parent project)
2. ✅ Analyze your own Java projects
3. ✅ Review findings with Claude
4. ✅ Use Claude to help fix issues

Happy analyzing! 🚀
