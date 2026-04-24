# MCP Tools Quick Reference

**Java Code Intelligence MCP Server**  
**3 Tools Available**

---

## 🔧 analyze_repo

**What:** Run analysis on a Java repository  
**Speed:** Slow (3-6 seconds)  
**Side Effects:** Yes (temporary config swap)

**Input:**
```typescript
{
  repoRoot: string;          // Required: Path to Java repo
  mode?: "all" | "bugs" | "security";  // Optional: Default "all"
  repoName?: string;         // Optional: Repo name
}
```

**When to use:**
- ✅ Need fresh analysis results
- ✅ Code has changed since last analysis
- ✅ First time analyzing a repository

**Example:**
```json
{
  "name": "analyze_repo",
  "arguments": {
    "repoRoot": "C:/projects/my-app",
    "mode": "security"
  }
}
```

---

## 📄 read_findings

**What:** Read existing analysis results  
**Speed:** Fast (<100ms)  
**Side Effects:** None (read-only)

**Input:**
```typescript
{
  repoRoot?: string;         // Optional (not used)
  file?: "all.json" | "bugs.json" | "security.json";  // Default: "all.json"
}
```

**When to use:**
- ✅ Analysis already run
- ✅ Just need to read results
- ✅ Want specific category only
- ✅ Need quick access to findings

**Example:**
```json
{
  "name": "read_findings",
  "arguments": {
    "file": "bugs.json"
  }
}
```

---

## 📖 get_project_context

**What:** Read analyzer documentation  
**Speed:** Fast (<50ms)  
**Side Effects:** None (read-only)

**Input:**
```typescript
{
  repoRoot?: string;         // Optional (not used)
}
```

**When to use:**
- ✅ Learn about detection rules
- ✅ Understand confidence scores
- ✅ Check analyzer capabilities
- ✅ Review design decisions
- ✅ Need rule explanations

**Example:**
```json
{
  "name": "get_project_context",
  "arguments": {}
}
```

---

## Decision Tree: Which Tool to Use?

```
Do you need fresh analysis results?
├─ YES → Use analyze_repo
│        (Takes 3-6 seconds, runs full analysis)
│
└─ NO → Do you want to read existing findings?
         ├─ YES → Use read_findings
         │        (Fast, <100ms, read-only)
         │
         └─ NO → Do you want to learn about the analyzer?
                  └─ YES → Use get_project_context
                           (Fast, <50ms, returns docs)
```

---

## Common Workflows

### Workflow 1: First Analysis
```
1. get_project_context         (Learn about tool)
2. analyze_repo                (Run analysis)
3. Present findings to user
```

### Workflow 2: Check Previous Results
```
1. read_findings               (Get cached results)
2. Present findings to user
```

### Workflow 3: Re-analyze After Fixes
```
1. read_findings               (Get baseline)
2. User makes code changes
3. analyze_repo                (Re-analyze)
4. read_findings               (Get new results)
5. Compare before/after
```

### Workflow 4: Explain a Rule
```
1. User asks: "What is BUG-001?"
2. get_project_context         (Read rule docs)
3. Find BUG-001 section
4. Explain to user
```

---

## Output Comparison

### analyze_repo Output
```json
{
  "success": true,
  "findings": { ... }  // Full AnalysisResult
}
```

### read_findings Output
```json
{
  "success": true,
  "file": "all.json",
  "findings": { ... }  // Full AnalysisResult (same as analyze_repo)
}
```

### get_project_context Output
```json
{
  "success": true,
  "file": "PROJECT_CONTEXT.md",
  "path": "/path/to/file",
  "content": "# PROJECT_CONTEXT.md\n\n...",  // Markdown string
  "size": 45000
}
```

---

## Error Handling

### analyze_repo Errors
```
InvalidParams: Path doesn't exist, not a directory
InternalError: Backup failed, index failed, analyze failed
```

### read_findings Errors
```
InvalidParams: Findings file not found (run analyze_repo first)
InternalError: Failed to read file (permission denied)
```

### get_project_context Errors
```
InternalError: PROJECT_CONTEXT.md not found
InternalError: Failed to read file (permission denied)
```

---

## Performance Comparison

| Tool | Speed | Network | Disk Reads | Disk Writes |
|------|-------|---------|-----------|-------------|
| **analyze_repo** | 3-6s | npm exec | Many | Many |
| **read_findings** | <100ms | None | 1 | None |
| **get_project_context** | <50ms | None | 1 | None |

---

## When NOT to Use

### ❌ Don't use analyze_repo when:
- Results already exist and code hasn't changed
- Just need to read cached findings
- Need quick response (use read_findings instead)

### ❌ Don't use read_findings when:
- No analysis has been run yet
- Code has changed and need fresh results
- First time analyzing repository

### ❌ Don't use get_project_context when:
- User wants analysis results (not documentation)
- Need findings data (not rule explanations)

---

## File Locations

### analyze_repo
```
Reads:  repos.json (temporarily)
Writes: data/findings/all.json
        data/findings/bugs.json
        data/findings/security.json
        data/raw/repo-analyses.json
```

### read_findings
```
Reads:  data/findings/{all|bugs|security}.json
Writes: None
```

### get_project_context
```
Reads:  PROJECT_CONTEXT.md
Writes: None
```

---

## Tool Characteristics

|  | analyze_repo | read_findings | get_project_context |
|--|--------------|---------------|---------------------|
| **Read-only** | ❌ No | ✅ Yes | ✅ Yes |
| **Fast** | ❌ No (3-6s) | ✅ Yes (<100ms) | ✅ Yes (<50ms) |
| **Side effects** | ✅ Yes (temp config) | ❌ No | ❌ No |
| **Requires previous analysis** | ❌ No | ✅ Yes | ❌ No |
| **Returns findings** | ✅ Yes | ✅ Yes | ❌ No |
| **Returns docs** | ❌ No | ❌ No | ✅ Yes |

---

## Debug Logging

All tools log to stderr with `[MCP]` prefix:

### analyze_repo
```
[MCP] === Starting analyze_repo ===
[MCP] Running index command...
[MCP] Running analyze command...
[MCP] === Cleanup: Restoring configuration ===
```

### read_findings
```
[MCP] === Starting read_findings ===
[MCP] File requested: security.json
[MCP] Successfully read findings: 8 total
```

### get_project_context
```
[MCP] === Starting get_project_context ===
[MCP] Successfully read PROJECT_CONTEXT.md (45000 bytes)
```

---

## Testing Commands

### Test analyze_repo
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code"}}}' | node dist/server.js
```

### Test read_findings
```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_findings","arguments":{"file":"security.json"}}}' | node dist/server.js
```

### Test get_project_context
```bash
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_project_context","arguments":{}}}' | node dist/server.js
```

---

## Summary

✅ **3 tools total**  
✅ **1 write tool** (analyze_repo)  
✅ **2 read-only tools** (read_findings, get_project_context)  
✅ **All tools work together**  
✅ **No breaking changes**  
✅ **Production ready**

---

**Quick Tip:** Use `read_findings` first to check for cached results before running `analyze_repo`. Saves 3-6 seconds if analysis is already done!
