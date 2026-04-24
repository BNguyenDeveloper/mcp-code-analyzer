# Java Code Intelligence MCP Server

MCP (Model Context Protocol) server wrapper for the Java Code Intelligence analyzer.

## Tools Provided

**3 MCP tools available:**

1. **`analyze_repo`** - Run analysis on a Java repository
2. **`read_findings`** - Read existing analysis results (NEW)
3. **`get_project_context`** - Read analyzer documentation (NEW)

## Architecture

This is a **thin wrapper** that exposes the existing analyzer via MCP protocol:

```
Claude/MCP Client
       ↓
  MCP Server (server.ts)
       ↓
  ┌─────────────────────────────┐
  │  analyze_repo               │──→ Temporary repos.json
  │  read_findings (read-only)  │──→ Read data/findings/*.json
  │  get_project_context        │──→ Read PROJECT_CONTEXT.md
  └─────────────────────────────┘
       ↓
  Existing Analyzer (../src/)
       ↓
  Findings JSON (../data/findings/)
       ↓
  MCP Server → Returns to Claude
```

**Key Design:** 
- Does NOT modify analyzer core
- Creates temporary `repos.json` configuration (analyze_repo only)
- Calls existing `npm run index` and `npm run analyze` commands
- Restores original configuration after execution
- Two read-only tools for retrieving existing data

## Setup

### 1. Install Dependencies

```bash
cd mcp-server
npm install
```

### 2. Build TypeScript

```bash
npm run build
```

This creates `dist/server.js` - the executable MCP server.

### 3. Ensure Parent Project is Built

The MCP server calls the parent analyzer, which must be installed:

```bash
cd ..
npm install
npm run build
```

### 4. Validate Installation (Optional but Recommended)

Run automated smoke tests:

```bash
cd mcp-server
chmod +x smoke-test.sh
./smoke-test.sh
```

**Expected output:** All tests pass (✓)

See [QUICK_VALIDATION.md](QUICK_VALIDATION.md) for 5-minute validation guide.

See [VALIDATION.md](VALIDATION.md) for comprehensive test suite.

---

## Usage

### Running Standalone (for testing)

```bash
cd mcp-server
npm start
```

Server will listen on stdio for JSON-RPC messages.

### Integrating with Claude Desktop

Add to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

**Important:** Use absolute path to `dist/server.js`

Restart Claude Desktop. Three tools will be available:
- `analyze_repo` - Run analysis
- `read_findings` - Read results
- `get_project_context` - Read documentation

### Using the Tools in Claude

**Example 1: Run Analysis**
```
Analyze this Java repository for security issues:
/path/to/my-java-project
```

Claude will call:
```json
{
  "name": "analyze_repo",
  "arguments": {
    "repoRoot": "/path/to/my-java-project",
    "mode": "security"
  }
}
```

**Example 2: Read Previous Results**
```
Show me the security findings from the last analysis
```

Claude will call:
```json
{
  "name": "read_findings",
  "arguments": {
    "file": "security.json"
  }
}
```

**Example 3: Learn About Analyzer**
```
How does the SQL injection detector work?
```

Claude will call:
```json
{
  "name": "get_project_context",
  "arguments": {}
}
```

## MCP Tools

### Tool 1: analyze_repo

### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repoRoot` | string | ✅ Yes | Absolute path to Java repository root |
| `mode` | string | No | Analysis mode: `"all"` (default), `"bugs"`, `"security"` |
| `repoName` | string | No | Optional repository name (defaults to directory name) |

### Output

Returns JSON with structure:

```json
{
  "success": true,
  "findings": {
    "version": "1.0",
    "timestamp": "2026-04-21T...",
    "repos": ["my-project"],
    "summary": {
      "total": 15,
      "bySeverity": {
        "critical": 6,
        "high": 1,
        "medium": 8,
        "low": 0
      },
      "byCategory": {
        "bug": 9,
        "security": 6
      }
    },
    "findings": [
      {
        "id": "SEC-001-Controller.java-42",
        "category": "security",
        "severity": "critical",
        "ruleId": "SEC-001",
        "ruleName": "Potential SQL Injection (Heuristic)",
        "message": "...",
        "file": "src/main/java/.../Controller.java",
        "line": 42,
        "confidence": 90,
        "cwe": ["CWE-89"],
        "remediation": "..."
      }
    ]
  }
}
```

---

### Tool 2: read_findings

**Purpose:** Read existing findings JSON without re-running analysis

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repoRoot` | string | No | Optional (not used - kept for API consistency) |
| `file` | string | No | Which file: `"all.json"` (default), `"bugs.json"`, `"security.json"` |

**Output:**
```json
{
  "success": true,
  "file": "security.json",
  "findings": {
    "version": "1.0",
    "summary": { "total": 8, ... },
    "findings": [ ... ]
  }
}
```

**Use Cases:**
- ✅ Retrieve previous analysis results
- ✅ Get specific category (bugs or security)
- ✅ Check findings without re-running analysis
- ✅ Fast (<100ms vs 3-6s for full analysis)

---

### Tool 3: get_project_context

**Purpose:** Read PROJECT_CONTEXT.md documentation

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repoRoot` | string | No | Optional (not used - kept for API consistency) |

**Output:**
```json
{
  "success": true,
  "file": "PROJECT_CONTEXT.md",
  "path": "/path/to/PROJECT_CONTEXT.md",
  "content": "# PROJECT_CONTEXT.md\n\n...",
  "size": 45000
}
```

**What's Included:**
- ✅ Analyzer architecture
- ✅ All 5 detection rules (BUG-001/002/003, SEC-001/002)
- ✅ Confidence scoring methodology
- ✅ Design decisions and trade-offs
- ✅ Known limitations
- ✅ Future roadmap

**Use Cases:**
- ✅ Learn how detection rules work
- ✅ Understand confidence scores
- ✅ Check analyzer capabilities
- ✅ Review known limitations

---

## How It Works

### analyze_repo: Temporary Configuration Strategy

The existing analyzer reads configuration from `repos.json` in the project root. The MCP server:

1. **Backs up** existing `repos.json` → `repos.json.backup`
2. **Writes** temporary `repos.json` with MCP-provided `repoRoot`
3. **Executes** analyzer via `npm run index` and `npm run analyze`
4. **Reads** findings from `data/findings/*.json`
5. **Restores** original `repos.json` from backup

This ensures:
- ✅ Zero modifications to analyzer code
- ✅ Original configuration always restored (even on error)
- ✅ Thread-safe (Node.js is single-threaded)

### Assumptions About Parent Analyzer

The MCP server assumes the parent project (`../`) has:

1. **npm scripts:**
   - `npm run index` - Indexes repositories (calls `indexAllRepos()`)
   - `npm run analyze` - Runs analysis (calls `runAnalyze()`)
   - Options: `--bugs-only`, `--security-only`

2. **Configuration:**
   - Reads from `repos.json` in project root
   - Format: `[{ name, path, language, type }]`

3. **Output:**
   - Writes findings to `data/findings/all.json`, `bugs.json`, `security.json`
   - JSON format matches `AnalysisResult` type

4. **Built and ready:**
   - TypeScript compiled (`npm run build`)
   - Java analyzer JAR built (`cd java-analyzer && mvn clean package`)

## Debugging

The MCP server logs to **stderr** (not stdout, which is reserved for MCP protocol).

To see debug logs:

```bash
npm start 2>&1 | grep '\[MCP\]'
```

Or when running via Claude Desktop, check Claude's logs (stderr is captured).

## Error Handling

All errors are wrapped in MCP `ErrorCode`:

- `InvalidParams` - Invalid `repoRoot` or parameters
- `InternalError` - Analyzer execution failed
- `MethodNotFound` - Unknown tool name

The server **always** restores `repos.json` in the `finally` block, even on errors.

## Development

### Running in Development Mode

```bash
npm run dev
```

Uses `ts-node` to run TypeScript directly (no build step needed).

### Testing Manually

Send JSON-RPC request via stdin:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm start
```

Expected response: List of available tools.

## Files

- `server.ts` - Main MCP server implementation
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `dist/` - Compiled JavaScript (generated by `npm run build`)

## Production Safety

✅ **Validates** `repoRoot` exists before analysis  
✅ **Backs up** original configuration  
✅ **Restores** configuration in `finally` block (always executes)  
✅ **Logs to stderr** (stdout is clean for MCP)  
✅ **Wraps errors** in proper MCP error codes  
✅ **No stdout pollution** - only MCP protocol messages

## Limitations

- **Single-threaded:** Only one analysis at a time (Node.js limitation)
- **Synchronous:** Each tool call blocks until complete
- **Local only:** Analyzer runs on local machine (no remote repos)
- **Java only:** Only analyzes Java/Spring Boot projects

## Troubleshooting

### "Repository path does not exist"
- Ensure `repoRoot` is an absolute path
- Verify the directory exists and is accessible

### "Findings file not found"
- Check if analyzer completed successfully
- Look for errors in stderr logs
- Verify Java analyzer JAR is built (`java-analyzer/target/*.jar`)

### "Failed to index repository"
- Ensure `npm run index` works when run manually
- Check that `repos.json` format is correct
- Verify Java source files exist in `src/` or `src/main/java/`

### Claude Desktop doesn't show the tool
- Verify `dist/server.js` exists (run `npm run build`)
- Check absolute path in `claude_desktop_config.json` is correct
- Restart Claude Desktop after config changes
- Check Claude Desktop logs for MCP connection errors

## License

Same as parent project (Java Code Intelligence System).
