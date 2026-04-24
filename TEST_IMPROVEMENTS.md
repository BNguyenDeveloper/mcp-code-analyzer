# Test Cases for Analyzer Improvements

**Date:** 2026-04-24  
**Purpose:** Document test cases for the correctness improvements made to the analyzer

---

## Test Case 1: SQL Keyword in Variable Name (False Positive Fix)

**Issue:** Variable names containing SQL keywords were incorrectly flagged as SQL context.

**Test Code:**
```java
public class FileController {
    public void processFile(String fileName) {
        String selectFile = "data.txt";  // Variable name contains "SELECT"
        String path = selectFile + ".backup";  // Should NOT be flagged as SQL concatenation
        
        // This should NOT trigger SEC-001 based on variable name alone
    }
}
```

**Expected Behavior:**
- ❌ Before: `inSqlContext = true` because `selectFile` variable name contains "SELECT"
- ✅ After: `inSqlContext = false` because only string literal values are checked

**Test Command:**
```bash
cd C:/Absolute_Softwares/ClaudeAI/mcp-code-analyzer
npm run index
npm run analyze
# Check: Should not report SEC-001 for this pattern
```

---

## Test Case 2: PreparedStatement with Unsafe SQL (False Negative Fix)

**Issue:** SEC-001 was completely skipped when PreparedStatement detected, even if unsafe concatenation existed.

**Test Code:**
```java
@RestController
public class UserController {
    public User getUser(String userId) {
        // PreparedStatement exists
        PreparedStatement ps = conn.prepareStatement("SELECT * FROM safe WHERE id = ?");
        ps.setString(1, "123");
        
        // But unsafe SQL also exists in same method
        String sql = "SELECT * FROM users WHERE id = " + userId;  // Unsafe!
        stmt.executeQuery(sql);  // This should still be flagged
        
        return user;
    }
}
```

**Expected Behavior:**
- ❌ Before: SEC-001 completely skipped (false negative)
- ✅ After: SEC-001 reported with:
  - Severity: HIGH (lowered from CRITICAL)
  - Confidence: 70% (lowered from 90%)
  - Message includes: "PreparedStatement detected but cannot verify if the concatenated SQL is safely parameterized"

**Test Command:**
```bash
npm run analyze
# Check: Should report SEC-001 with lowered severity/confidence
```

---

## Test Case 3: Ambiguous Method Name Resolution

**Issue:** Calls were resolved to wrong callee when multiple classes had same method name.

**Test Code:**
```java
// UserService.java
public class UserService {
    public User findById(Long id) { return null; }
}

// ProductService.java
public class ProductService {
    public Product findById(Long id) { return null; }  // Same method name
}

// OrderController.java - NO DEPENDENCY INJECTION
public class OrderController {
    public void createOrder() {
        // Ambiguous - which findById?
        Object result = findById(1L);  // Should NOT be resolved
    }
}
```

**Expected Behavior:**
- ❌ Before: Randomly resolved to UserService.findById or ProductService.findById
- ✅ After: 
  - Not resolved (calleeId remains undefined)
  - Warning logged: "Ambiguous global resolution: findById has 2 implementations - not resolving"

**Test Command:**
```bash
npm run index
# Check console output for ambiguous resolution warnings
```

---

## Test Case 4: Suppression Precision

**Issue:** ±2 line tolerance suppressed unrelated findings nearby.

**Test Code:**
```java
public class TestController {
    public void process() {
        // Line 50
        // analyzer-ignore SEC-001 This is safe
        stmt.executeQuery(sql1);  // Line 51 - Should be suppressed
        
        stmt.executeQuery(sql2);  // Line 52 - Should NOT be suppressed (before: was suppressed)
        stmt.executeQuery(sql3);  // Line 53 - Should NOT be suppressed (before: was suppressed)
    }
}
```

**Expected Behavior:**
- ❌ Before: Lines 51, 52, 53 all suppressed (±2 tolerance)
- ✅ After: Only line 51 suppressed (exact match or previous line only)

**Test Command:**
```bash
npm run analyze
# Check: Line 52 and 53 should be reported
```

---

## Test Case 5: Multiple Rules on Same Line

**Issue:** Deduplication removed different rules on the same line.

**Test Code:**
```java
public class MultiIssueController {
    public void process() {
        // Line 100: Two issues on same line
        User u = opt.get(); String sql = "SELECT * FROM users WHERE id = " + id;
        // BUG-001: Unsafe Optional.get()
        // SEC-001: SQL injection
    }
}
```

**Expected Behavior:**
- ❌ Before: Only first finding kept (one lost)
- ✅ After: Both findings kept (different ruleIds → different keys)

**Deduplication Key:**
- Before: `file:line:ruleId`
- After: `file:line:ruleId:functionId:className`

**Test Command:**
```bash
npm run analyze
# Check: Should report both BUG-001 and SEC-001 on line 100
```

---

## Test Case 6: DI-Based Call Resolution (Should Work)

**Issue:** Verify DI resolution still works correctly.

**Test Code:**
```java
@RestController
public class OrderController {
    @Autowired
    private UserService userService;  // DI injection
    
    public void createOrder() {
        userService.findById(1L);  // Should resolve via DI
    }
}

public class UserService {
    public User findById(Long id) { return null; }
}
```

**Expected Behavior:**
- ✅ Call resolved to `UserService.findById` via DI
- Console log: "[resolve] OrderController.createOrder -> UserService.findById via DI scope=userService"

**Test Command:**
```bash
npm run index
# Check console for DI resolution success
```

---

## Manual Testing Checklist

### Run Full Analysis
```bash
cd C:/Absolute_Softwares/ClaudeAI/mcp-code-analyzer

# Clean and rebuild
cd java-analyzer && mvn clean package -DskipTests && cd ..
npm run build

# Index repositories
npm run index

# Run analysis
npm run analyze

# Check findings
cat data/findings/all.json
```

### Verify CLI Still Works
```bash
# Help command
npm run dev -- --help

# Index command
npm run index

# Analyze with options
npm run analyze -- --bugs-only
npm run analyze -- --security-only
npm run analyze -- --json

# Impact analysis
npm run impact -- --function methodName
```

### Verify MCP Server Still Works
```bash
cd mcp-server
npm run build

# Test MCP tools (requires MCP client)
# - analyze_repo
# - read_findings
# - get_project_context
```

---

## Expected Console Output Changes

### Before (Old Behavior)
```
[resolve] Resolving 150 calls...
(No ambiguity warnings)
(No unresolved count)
```

### After (New Behavior)
```
[resolve] OrderController.createOrder -> UserService.findById via DI scope=userService
[resolve] Ambiguous global resolution: findById has 2 implementations - not resolving
Call resolution complete: 5 unresolved, 3 ambiguous (not resolved)
```

---

## Regression Testing

**Important:** Ensure these still work:

1. ✅ All existing detection rules still trigger correctly
2. ✅ Console reporter outputs summary correctly
3. ✅ JSON files generated: all.json, bugs.json, security.json
4. ✅ MCP server can analyze repositories
5. ✅ Impact analysis works
6. ✅ Suppression comments work (with new precision)
7. ✅ Routes, injections, classes extracted correctly

---

## Summary of Behavior Changes

| Feature | Before | After | Breaking? |
|---------|--------|-------|-----------|
| SQL context detection | Checks expression.toString() | Checks StringLiteralExpr.getValue() | No |
| PreparedStatement handling | Skips SEC-001 completely | Lowers severity/confidence | **Minor** |
| Call resolution | May resolve ambiguous calls | Logs warnings, doesn't resolve | No |
| Suppression matching | ±2 lines | Same line or previous line | **Minor** |
| Deduplication | file:line:ruleId | file:line:ruleId:functionId:className | No |

**Breaking Changes:**
- **PreparedStatement:** May report new findings (previously suppressed false negatives)
- **Suppression:** Stricter matching may require repositioning some suppression comments

**Impact:** Low - improvements mostly reduce false positives and improve accuracy.

---

## Test Results Template

After running tests, document results here:

### Test 1: SQL Keywords in Variable Names
- Status: ⬜ PASS / ⬜ FAIL
- Notes:

### Test 2: PreparedStatement with Unsafe SQL
- Status: ⬜ PASS / ⬜ FAIL
- Notes:

### Test 3: Ambiguous Method Resolution
- Status: ⬜ PASS / ⬜ FAIL
- Notes:

### Test 4: Suppression Precision
- Status: ⬜ PASS / ⬜ FAIL
- Notes:

### Test 5: Multiple Rules Same Line
- Status: ⬜ PASS / ⬜ FAIL
- Notes:

### Test 6: DI Resolution
- Status: ⬜ PASS / ⬜ FAIL
- Notes:

### CLI Commands
- Status: ⬜ PASS / ⬜ FAIL
- Notes:

### MCP Server
- Status: ⬜ PASS / ⬜ FAIL
- Notes:
