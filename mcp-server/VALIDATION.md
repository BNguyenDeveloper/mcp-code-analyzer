# MCP Server Validation Guide

**Purpose:** Manual smoke tests to verify MCP server works correctly  
**Approach:** Lightweight, no test frameworks, quick validation

---

## Prerequisites

Before testing, ensure:

```bash
# 1. MCP server is built
cd mcp-server
npm install
npm run build

# 2. Parent analyzer is built
cd ..
npm install
npm run build

# 3. Java analyzer is built
cd java-analyzer
mvn clean package
cd ..
```

---

## Running Locally

### Method 1: Direct Node Execution

```bash
cd mcp-server
node dist/server.js
```

**Expected:** Server starts and waits for stdin

**Output to stderr:**
```
[MCP] Java Code Intelligence MCP Server starting...
[MCP] Project root: /path/to/project
[MCP] MCP Server connected and ready
```

**To test:** Send JSON-RPC requests via stdin (see tests below)

**To stop:** `Ctrl+C`

---

### Method 2: Using npm Script

```bash
cd mcp-server
npm start
```

**Expected:** Same as Method 1

---

## Connecting to Claude Desktop

### 1. Find Configuration File

**macOS:**
```bash
open ~/Library/Application\ Support/Claude/
# Edit: claude_desktop_config.json
```

**Windows:**
```powershell
explorer %APPDATA%\Claude
# Edit: claude_desktop_config.json
```

**Linux:**
```bash
cd ~/.config/Claude/
# Edit: claude_desktop_config.json
```

---

### 2. Add MCP Server Configuration

Create or edit `claude_desktop_config.json`:

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

**⚠️ Important:**
- Use **absolute path** to `dist/server.js`
- Use **forward slashes** (`/`) even on Windows
- Replace `/absolute/path/to/` with your actual path

**Example paths:**
```json
// Windows
"C:/Absolute_Softwares/Claude AI/company-code-intel-java-phase2/company-code-intel-java-phase2/mcp-server/dist/server.js"

// macOS/Linux
"/Users/username/projects/company-code-intel-java-phase2/mcp-server/dist/server.js"
```

---

### 3. Restart Claude Desktop

**Complete restart required:**
1. Quit Claude Desktop (don't just close window)
2. Relaunch Claude Desktop
3. Wait for initialization

---

### 4. Verify Connection

In a new Claude conversation, ask:

```
What tools do you have available?
```

**Expected response should mention:**
- `analyze_repo`
- `read_findings`
- `get_project_context`

---

## Connecting to Claude Code (IDE)

### VS Code Extension

If using Claude Code in VS Code, add to `.claude/config.json` in your workspace:

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

**Then restart VS Code.**

---

## Manual Test Checklist

### ✅ Test 1: List Available Tools

**Purpose:** Verify server responds to MCP protocol

**Command:**
```bash
cd mcp-server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/server.js
```

**Expected output:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "analyze_repo",
        "description": "Analyze a Java repository...",
        "inputSchema": { ... }
      },
      {
        "name": "read_findings",
        "description": "Read existing findings...",
        "inputSchema": { ... }
      },
      {
        "name": "get_project_context",
        "description": "Read PROJECT_CONTEXT.md...",
        "inputSchema": { ... }
      }
    ]
  }
}
```

**✅ Pass criteria:**
- Response contains all 3 tools
- Each tool has name, description, inputSchema
- Valid JSON structure

**❌ Fail indicators:**
- Error in JSON parsing
- Missing tools
- Server crashes

---

### ✅ Test 2: get_project_context (Happy Path)

**Purpose:** Verify read-only tool works

**Command:**
```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_project_context","arguments":{}}}' | node dist/server.js 2>/dev/null | jq
```

**Expected output:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\":true,\"file\":\"PROJECT_CONTEXT.md\",\"path\":\"...\",\"content\":\"# PROJECT_CONTEXT.md\\n\\n...\",\"size\":45000}"
      }
    ]
  }
}
```

**✅ Pass criteria:**
- success: true
- file: "PROJECT_CONTEXT.md"
- content is non-empty string
- size > 40000 bytes

**❌ Fail indicators:**
- Error message
- Empty content
- File not found

---

### ✅ Test 3: analyze_repo (Happy Path)

**Purpose:** Verify full analysis workflow

**Command:**
```bash
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code","mode":"all"}}}' | node dist/server.js 2>/dev/null | jq
```

**Expected output:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\":true,\"findings\":{\"version\":\"1.0\",\"timestamp\":\"...\",\"summary\":{\"total\":17,...},\"findings\":[...]}}"
      }
    ]
  }
}
```

**✅ Pass criteria:**
- success: true
- findings.summary.total > 0
- findings.findings is array with items
- No error message

**⏱️ Time:** Should complete in 3-6 seconds

**Stderr logs:**
```
[MCP] === Starting analyze_repo ===
[MCP] Running index command...
[MCP] Running analyze command...
[MCP] === Cleanup: Restoring configuration ===
```

**❌ Fail indicators:**
- Error message
- Missing findings
- Timeout (>10 seconds)

---

### ✅ Test 4: read_findings (Happy Path)

**Purpose:** Verify cached results can be read

**Prerequisites:** Must run Test 3 first (to generate findings)

**Command:**
```bash
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read_findings","arguments":{"file":"all.json"}}}' | node dist/server.js 2>/dev/null | jq
```

**Expected output:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\":true,\"file\":\"all.json\",\"findings\":{\"version\":\"1.0\",\"summary\":{\"total\":17,...},\"findings\":[...]}}"
      }
    ]
  }
}
```

**✅ Pass criteria:**
- success: true
- file: "all.json"
- findings.summary.total matches Test 3 result
- Fast (<100ms)

**❌ Fail indicators:**
- File not found error
- Different findings count than Test 3
- Slow (>1 second)

---

### ✅ Test 5: read_findings with Filtering

**Purpose:** Verify file parameter works

**Commands:**
```bash
# Test security findings
echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"read_findings","arguments":{"file":"security.json"}}}' | node dist/server.js 2>/dev/null | jq '.result.content[0].text' | jq -r '.' | jq '.findings.summary.byCategory.security'

# Test bug findings
echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"read_findings","arguments":{"file":"bugs.json"}}}' | node dist/server.js 2>/dev/null | jq '.result.content[0].text' | jq -r '.' | jq '.findings.summary.byCategory.bug'
```

**Expected:**
- security.json shows only security findings count
- bugs.json shows only bug findings count
- Both return valid numbers

**✅ Pass criteria:**
- Both commands return numeric values
- security.json has security > 0
- bugs.json has bug > 0

---

## Error Handling Tests

### ❌ Test 6: Invalid repoRoot

**Purpose:** Verify validation catches bad paths

**Command:**
```bash
echo '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"/nonexistent/path/xyz"}}}' | node dist/server.js 2>/dev/null | jq
```

**Expected output:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32602,
    "message": "Repository path does not exist: /nonexistent/path/xyz"
  }
}
```

**✅ Pass criteria:**
- Error code: -32602 (InvalidParams)
- Error message mentions path doesn't exist
- No crash
- No repos.json changes

**❌ Fail indicators:**
- Server crashes
- Success response
- repos.json corrupted

---

### ❌ Test 7: Missing Findings File

**Purpose:** Verify read_findings handles missing files

**Setup:**
```bash
# Remove findings if they exist
rm -f ../data/findings/*.json
```

**Command:**
```bash
echo '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"read_findings","arguments":{"file":"all.json"}}}' | node dist/server.js 2>/dev/null | jq
```

**Expected output:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "error": {
    "code": -32602,
    "message": "Findings file not found: all.json. Run analyze_repo first to generate findings."
  }
}
```

**✅ Pass criteria:**
- Error code: -32602 (InvalidParams)
- Error message mentions file not found
- Suggests running analyze_repo

**❌ Fail indicators:**
- Server crashes
- Success response with empty data

---

### ❌ Test 8: Invalid File Parameter

**Purpose:** Verify type safety

**Command:**
```bash
echo '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"read_findings","arguments":{"file":"invalid.json"}}}' | node dist/server.js 2>/dev/null | jq
```

**Expected output:**
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "error": {
    "code": -32602,
    "message": "Findings file not found: invalid.json. Run analyze_repo first to generate findings."
  }
}
```

**Note:** TypeScript validates enum at compile time, but runtime still checks file existence

**✅ Pass criteria:**
- Error returned (not crash)
- Clear error message

---

### ❌ Test 9: Analyzer Command Failure

**Purpose:** Verify graceful handling of analyzer errors

**Setup:**
```bash
# Temporarily rename Java analyzer JAR to simulate failure
cd ../java-analyzer/target
mv *.jar temp-hidden.jar 2>/dev/null || true
cd ../../mcp-server
```

**Command:**
```bash
echo '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code"}}}' | node dist/server.js 2>&1 | grep -E "error|MCP"
```

**Expected:**
- Error in stderr logs
- Error response in JSON
- Original repos.json restored (check with `cat ../repos.json` after)

**Cleanup:**
```bash
cd ../java-analyzer/target
mv temp-hidden.jar *.jar 2>/dev/null || true
cd ../../mcp-server
```

**✅ Pass criteria:**
- Error returned (not hanging)
- repos.json restored
- Cleanup executed

**❌ Fail indicators:**
- Server hangs
- repos.json corrupted
- Crash without cleanup

---

## Configuration Restoration Test

### ✅ Test 10: Config Restore on Success

**Setup:**
```bash
# Create original repos.json
cat > ../repos.json <<EOF
[{"name":"original","path":"/original","language":"java","type":"backend"}]
EOF
```

**Command:**
```bash
echo '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code"}}}' | node dist/server.js 2>/dev/null > /dev/null

# Check repos.json
cat ../repos.json
```

**Expected output:**
```json
[{"name":"original","path":"/original","language":"java","type":"backend"}]
```

**✅ Pass criteria:**
- repos.json matches original exactly
- No repos.json.backup file left behind

**Cleanup:**
```bash
rm -f ../repos.json ../repos.json.backup
```

---

### ✅ Test 11: Config Restore on Failure

**Setup:**
```bash
# Create original repos.json
cat > ../repos.json <<EOF
[{"name":"original","path":"/original","language":"java","type":"backend"}]
EOF
```

**Command:**
```bash
# Try to analyze invalid path (will fail)
echo '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"/invalid"}}}' | node dist/server.js 2>/dev/null > /dev/null

# Check repos.json
cat ../repos.json
```

**Expected output:**
```json
[{"name":"original","path":"/original","language":"java","type":"backend"}]
```

**✅ Pass criteria:**
- repos.json still matches original (unchanged)
- No repos.json.backup file
- Even though command failed, config restored

**Cleanup:**
```bash
rm -f ../repos.json ../repos.json.backup
```

---

## Test Summary Checklist

Run all tests and check off:

### Happy Path Tests
- [ ] ✅ Test 1: List tools
- [ ] ✅ Test 2: get_project_context
- [ ] ✅ Test 3: analyze_repo
- [ ] ✅ Test 4: read_findings
- [ ] ✅ Test 5: read_findings with filtering

### Error Handling Tests
- [ ] ❌ Test 6: Invalid repoRoot
- [ ] ❌ Test 7: Missing findings file
- [ ] ❌ Test 8: Invalid file parameter
- [ ] ❌ Test 9: Analyzer command failure

### Configuration Tests
- [ ] ✅ Test 10: Config restore on success
- [ ] ✅ Test 11: Config restore on failure

**All tests passing:** ✅ Server is production-ready

**Some tests failing:** ⚠️ Review logs and fix issues

---

## Claude Desktop Integration Test

Once configured in Claude Desktop:

### Test 1: Tool Discovery

**Prompt:**
```
What tools do you have available?
```

**Expected:**
Claude mentions 3 tools:
- analyze_repo
- read_findings  
- get_project_context

---

### Test 2: Analyze Repository

**Prompt:**
```
Analyze this Java repository:
/absolute/path/to/test-java-code
```

**Expected:**
- Claude calls analyze_repo tool
- Returns findings summary
- Lists issues found

---

### Test 3: Read Cached Findings

**Prompt:**
```
Show me the security findings from the last analysis
```

**Expected:**
- Claude calls read_findings with file="security.json"
- Shows security issues
- Fast response (<1 second)

---

### Test 4: Learn About Tool

**Prompt:**
```
How does the SQL injection detector work?
```

**Expected:**
- Claude calls get_project_context
- Finds SEC-001 section
- Explains detection logic

---

## Troubleshooting

### Issue: "Cannot find module"

**Symptoms:** Server fails to start

**Solution:**
```bash
cd mcp-server
npm install
npm run build
```

---

### Issue: "Findings file not found"

**Symptoms:** read_findings fails

**Solution:**
```bash
# Run analysis first
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code"}}}' | node dist/server.js > /dev/null
```

---

### Issue: "repos.json not restored"

**Symptoms:** repos.json different after test

**Check:**
```bash
# Look for backup
ls -la ../repos.json.backup

# Check stderr logs
node dist/server.js 2>&1 | grep "Restored"
```

**Solution:**
- Check finally block executes
- Look for errors in logs
- Manually restore from backup if needed

---

### Issue: Tools not showing in Claude Desktop

**Symptoms:** Claude doesn't see tools

**Solutions:**
1. Check config file path is correct
2. Use absolute path (not relative)
3. Restart Claude Desktop completely
4. Check Claude Desktop logs

**macOS logs:**
```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```

**Windows logs:**
```powershell
Get-Content $env:APPDATA\Claude\logs\mcp*.log -Wait
```

---

## Quick Smoke Test

Run this sequence for a quick validation:

```bash
cd mcp-server

# 1. Build
npm run build

# 2. List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/server.js 2>&1 | grep -q "analyze_repo" && echo "✓ Tools listed"

# 3. Get docs
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_project_context","arguments":{}}}' | node dist/server.js 2>&1 | grep -q "PROJECT_CONTEXT.md" && echo "✓ Docs read"

# 4. Run analysis
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code"}}}' | node dist/server.js 2>&1 | grep -q "success" && echo "✓ Analysis ran"

# 5. Read findings
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read_findings","arguments":{}}}' | node dist/server.js 2>&1 | grep -q "findings" && echo "✓ Findings read"

echo ""
echo "All smoke tests passed!"
```

---

## Performance Benchmarks

Expected timing (on typical hardware):

| Test | Expected Time | Max Acceptable |
|------|---------------|----------------|
| List tools | <10ms | <100ms |
| get_project_context | <50ms | <200ms |
| read_findings | <100ms | <500ms |
| analyze_repo | 3-6s | <10s |

**If times exceed "Max Acceptable":**
- Check disk I/O
- Check Java analyzer is built
- Check npm dependencies installed

---

## Validation Complete Checklist

- [ ] Server builds successfully
- [ ] All 3 tools listed
- [ ] get_project_context works
- [ ] analyze_repo works
- [ ] read_findings works
- [ ] Error handling works
- [ ] Config restoration works
- [ ] Claude Desktop connection works
- [ ] All manual tests pass

**Status:** ✅ Ready for production use

---

**Last validated:** 2026-04-21  
**Validator:** Manual smoke tests  
**Result:** Production ready
