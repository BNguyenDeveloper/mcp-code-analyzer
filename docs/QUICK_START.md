# Quick Start Guide

Get started with the Java Code Intelligence System in 5 minutes.

---

## Installation

```bash
cd company-code-intel-java-phase2
npm install
npm run build
```

---

## Usage

### 1. Index Your Code
```bash
npm run index
```

This will:
- Parse all Java files in configured repositories
- Build function/class/call graphs
- Extract try-catch blocks and patterns
- Save to `data/raw/repo-analyses.json`

### 2. Run Analysis
```bash
# Full analysis (bugs + security)
npm run analyze

# Security issues only
npm run analyze -- --security-only

# Bug detection only
npm run analyze -- --bugs-only

# JSON output only (no console)
npm run analyze -- --json

# Custom output directory
npm run analyze -- --output my-findings/
```

---

## Understanding the Output

### Console Output

```
═══════════════════════════════════════
  ANALYSIS SUMMARY
═══════════════════════════════════════

Analysis Version: 1.0
Total Findings: 15

By Severity:
  Critical: 6    ← Requires immediate attention
  High: 1        ← Should fix soon
  Medium: 8      ← Plan to fix
  Low: 0         ← Low priority

By Category:
  Bug: 9         ← Logic/correctness issues
  Security: 6    ← Vulnerability patterns

═══════════════════════════════════════
  TOP RISKY CLASSES
═══════════════════════════════════════

  VulnerableController
    Critical: 3, High: 0, Total: 3
    ↑ Focus refactoring here first
```

### JSON Output

Location: `data/findings/`

- `all.json` - All findings (bugs + security)
- `bugs.json` - Bug findings only
- `security.json` - Security findings only

**Structure**:
```json
{
  "version": "1.0",
  "timestamp": "2026-04-21T05:17:14.896Z",
  "repos": ["test-java-code"],
  "summary": {
    "total": 15,
    "bySeverity": { "critical": 6, "high": 1, ... },
    "byCategory": { "bug": 9, "security": 6 }
  },
  "findings": [
    {
      "id": "SEC-001-VulnerableController.java-18",
      "category": "security",
      "severity": "critical",
      "ruleId": "SEC-001",
      "ruleName": "Potential SQL Injection (Heuristic)",
      "message": "Controller executes SQL...",
      "file": "src/main/java/.../VulnerableController.java",
      "line": 18,
      "className": "VulnerableController",
      "confidence": 85,
      "cwe": ["CWE-89"],
      "remediation": "Use PreparedStatement..."
    }
  ]
}
```

---

## Detection Rules

### Bug Detection (3 Rules)

| Rule | What It Detects | Confidence | Severity |
|------|----------------|------------|----------|
| **BUG-001** | Optional.get() without guard check | 75% | Medium-High |
| **BUG-002** | Resource leak (no try-with-resources) | 70% | Medium-High |
| **BUG-003** | Empty catch blocks | 95% | Low-Medium |

### Security Detection (2 Rules)

| Rule | What It Detects | Confidence | Severity | CWE |
|------|----------------|------------|----------|-----|
| **SEC-001** | SQL injection risk | 60-85% | Critical | CWE-89 |
| **SEC-002** | Command injection risk | 65-90% | Critical | CWE-78 |

---

## Common Patterns

### ✅ Safe Code
```java
@Service
public class UserService {
    public String getUser(Long id) {
        // Safe: PreparedStatement in Service layer
        PreparedStatement stmt = conn.prepareStatement(
            "SELECT * FROM users WHERE id = ?"
        );
        stmt.setLong(1, id);
        return stmt.executeQuery();
    }
}
```

### ❌ Vulnerable Code
```java
@RestController
public class UserController {
    @GetMapping("/users/{id}")
    public String getUser(@PathVariable String id) {
        // SEC-001: Controller executing SQL directly
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery(
            "SELECT * FROM users WHERE id = " + id
        );
        return rs.getString("name");
    }
}
```

---

## Fixing Issues

### BUG-001: Unsafe Optional.get()
**Before**:
```java
Optional<String> name = findUser(id);
return name.get(); // May throw NoSuchElementException
```

**After**:
```java
Optional<String> name = findUser(id);
return name.orElseThrow(() -> new UserNotFoundException(id));
```

### BUG-002: Resource Leak
**Before**:
```java
try {
    Connection conn = DriverManager.getConnection(...);
    Statement stmt = conn.createStatement();
    // ... use stmt
} catch (SQLException e) {
    // conn and stmt not closed
}
```

**After**:
```java
try (Connection conn = DriverManager.getConnection(...);
     Statement stmt = conn.createStatement()) {
    // ... use stmt
} catch (SQLException e) {
    // Auto-closed
}
```

### BUG-003: Empty Catch Block
**Before**:
```java
try {
    riskyOperation();
} catch (Exception e) {
    // Silently ignored
}
```

**After**:
```java
try {
    riskyOperation();
} catch (Exception e) {
    logger.error("Failed to execute risky operation", e);
    throw new RuntimeException("Operation failed", e);
}
```

### SEC-001: SQL Injection
**Before**:
```java
@RestController
public class UserController {
    public String search(@RequestParam String query) {
        String sql = "SELECT * FROM users WHERE name = '" + query + "'";
        return stmt.executeQuery(sql);
    }
}
```

**After**:
```java
@RestController
public class UserController {
    @Autowired
    private UserService userService; // Move to service layer
    
    public List<User> search(@RequestParam String query) {
        return userService.searchUsers(query); // Service uses PreparedStatement
    }
}
```

### SEC-002: Command Injection
**Before**:
```java
@RestController
public class BackupController {
    public String backup(@RequestParam String filename) {
        Runtime.getRuntime().exec("tar -czf " + filename);
        return "Done";
    }
}
```

**After**:
```java
@RestController
public class BackupController {
    public String backup(@RequestParam String filename) {
        // Validate input
        if (!filename.matches("[a-zA-Z0-9_-]+")) {
            throw new IllegalArgumentException("Invalid filename");
        }
        
        // Use allowlist of commands
        ProcessBuilder pb = new ProcessBuilder(
            "tar", "-czf", filename // Separate arguments
        );
        pb.start();
        return "Done";
    }
}
```

---

## CI/CD Integration

### GitHub Actions
```yaml
name: Code Intelligence
on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: npm install
        
      - name: Index code
        run: npm run index
        
      - name: Run analysis
        run: npm run analyze -- --json
        
      - name: Check for critical issues
        run: |
          CRITICAL=$(jq '.summary.bySeverity.critical' data/findings/all.json)
          if [ "$CRITICAL" -gt 0 ]; then
            echo "Found $CRITICAL critical issues"
            exit 1
          fi
```

### GitLab CI
```yaml
code_intelligence:
  stage: test
  script:
    - npm install
    - npm run index
    - npm run analyze -- --json
    - |
      CRITICAL=$(jq '.summary.bySeverity.critical' data/findings/all.json)
      if [ "$CRITICAL" -gt 0 ]; then
        echo "Found $CRITICAL critical issues"
        exit 1
      fi
  artifacts:
    paths:
      - data/findings/
```

---

## Configuration

### Add Repositories
Edit `data/repos.json`:

```json
[
  {
    "name": "my-java-project",
    "path": "/path/to/project",
    "language": "java",
    "type": "backend"
  }
]
```

### Run Analysis
```bash
npm run index
npm run analyze
```

---

## Troubleshooting

### No findings detected
**Issue**: Analysis returns 0 findings  
**Solution**: 
1. Check `data/raw/repo-analyses.json` exists and has data
2. Run `npm run index` first to parse code
3. Verify Java files are in standard Maven/Gradle layout

### TypeScript compilation errors
**Issue**: `npm run build` fails  
**Solution**:
```bash
rm -rf dist/
npm install
npm run build
```

### Parser errors
**Issue**: Java analyzer fails to parse files  
**Solution**:
- Check Java syntax is valid
- Ensure Java version compatibility (Java 8+)
- Check `data/raw/repo-analyses.json` for `failures` array

---

## Getting Help

- **Documentation**: See `IMPLEMENTATION_COMPLETE.md` for full details
- **Phase Guides**: See `PHASE1_COMPLETE.md` through `PHASE4_COMPLETE.md`
- **Issues**: Check GitHub issues or create new one

---

## What's Next?

After running your first analysis:

1. **Review Top Risky Classes** - Focus on high-impact issues
2. **Fix Critical Issues** - Address security vulnerabilities first
3. **Plan Refactoring** - Use groupings to plan systematic improvements
4. **Integrate with CI/CD** - Prevent new issues from being introduced
5. **Track Progress** - Run regularly to measure improvement

---

**Happy Analyzing!** 🚀
