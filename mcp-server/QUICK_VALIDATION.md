# Quick Validation Guide

**5-minute smoke test for MCP server**

---

## Step 1: Build (1 min)

```bash
cd mcp-server
npm install
npm run build
```

**✅ Success:** `dist/server.js` created  
**❌ Fail:** Fix TypeScript errors

---

## Step 2: Run Smoke Tests (2 min)

```bash
chmod +x smoke-test.sh
./smoke-test.sh
```

**✅ Success:** All tests pass  
**❌ Fail:** See VALIDATION.md for detailed tests

---

## Step 3: Connect to Claude Desktop (2 min)

### Find config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux:** `~/.config/Claude/claude_desktop_config.json`

### Add this (use YOUR absolute path):

```json
{
  "mcpServers": {
    "java-code-intel": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-server/dist/server.js"
      ]
    }
  }
}
```

**Example:**
```json
{
  "mcpServers": {
    "java-code-intel": {
      "command": "node",
      "args": [
        "C:/projects/company-code-intel-java-phase2/mcp-server/dist/server.js"
      ]
    }
  }
}
```

### Restart Claude Desktop

Completely quit and relaunch.

---

## Step 4: Test in Claude (30 sec)

Ask Claude:

```
What tools do you have available?
```

**✅ Success:** Claude mentions:
- analyze_repo
- read_findings
- get_project_context

**❌ Fail:** Check config file path, restart again

---

## Manual Test

Try analyzing the test repository:

```
Analyze this Java code for security issues:
/path/to/company-code-intel-java-phase2/test-java-code
```

**Expected:** Claude runs analysis and shows findings

---

## Troubleshooting

### Tools not showing

1. Check absolute path in config (no `~` or relative paths)
2. Use forward slashes `/` (even on Windows)
3. Fully quit Claude Desktop (not just close)
4. Check logs: `~/Library/Logs/Claude/` (macOS) or `%APPDATA%\Claude\logs\` (Windows)

### Analysis fails

1. Ensure parent analyzer built: `cd .. && npm run build`
2. Ensure Java analyzer built: `cd java-analyzer && mvn clean package`
3. Check path is absolute (not relative)

### Slow performance

- analyze_repo: 3-6s is normal
- read_findings: <100ms is normal
- get_project_context: <50ms is normal

---

## Quick Test Commands

From `mcp-server` directory:

```bash
# List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/server.js 2>&1 | grep "analyze_repo"

# Get docs
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_project_context","arguments":{}}}' | node dist/server.js 2>&1 | grep "success"

# Analyze (if test repo exists)
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code"}}}' | node dist/server.js 2>&1 | grep "success"
```

All should print matching lines.

---

## Checklist

- [ ] Built successfully (`dist/server.js` exists)
- [ ] Smoke tests pass (`./smoke-test.sh`)
- [ ] Added to Claude Desktop config
- [ ] Restarted Claude Desktop
- [ ] Tools show in Claude
- [ ] Can analyze test repository

**All checked:** ✅ Ready to use!

---

**For detailed tests:** See VALIDATION.md  
**For usage examples:** See NEW_TOOLS.md  
**For troubleshooting:** See README.md
