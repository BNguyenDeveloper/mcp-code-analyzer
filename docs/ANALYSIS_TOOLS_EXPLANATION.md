# Analysis Tools Used for msp-service Security Audit

**Date:** April 21, 2026  
**Repository Analyzed:** C:\Absolute_Softwares\A7\GitLab\msp-service

---

## Overview

The analysis used a **custom-built Java Code Intelligence System** that combines:
1. Java AST parsing (JavaParser library)
2. TypeScript-based security analyzers
3. Graph-based call analysis
4. Pattern-based vulnerability detection

**Not using commercial tools like:** SonarQube, Checkmarx, Fortify, Snyk, etc.

---

## Tool Stack

### 1. Java AST Parser (JavaParser)

**Location:** `java-analyzer/`  
**Technology:** JavaParser 3.25.10 (Maven)  
**Language:** Java 17

**Purpose:** Parse Java source files into structured data

**What it extracts:**
```json
{
  "classes": [
    {
      "className": "AbsoluteAgentServiceImpl",
      "stereotype": "Service",
      "methods": [
        {
          "name": "downloadCoreAgent",
          "parameters": ["accountUid", "userUid", "platform", "version"],
          "calls": [
            {
              "calleeName": "execute",
              "scopeName": "absoluteAgentClient",
              "line": 46
            }
          ],
          "usesStringConcat": false,
          "usesPreparedStatement": false
        }
      ]
    }
  ]
}
```

**How it works:**
```java
// Input: Java source file
CompilationUnit cu = StaticJavaParser.parse(sourceFile);

// Extract classes
cu.findAll(ClassOrInterfaceDeclaration.class).forEach(cls -> {
    // Get class name, annotations, stereotype
    String className = cls.getNameAsString();
    boolean isController = cls.getAnnotationByName("RestController").isPresent();
    
    // Extract methods
    cls.getMethods().forEach(method -> {
        // Get method calls
        method.findAll(MethodCallExpr.class).forEach(call -> {
            // Record: methodName, scope, line number
        });
        
        // Check for string concatenation
        method.findAll(BinaryExpr.class).forEach(expr -> {
            if (expr.getOperator() == BinaryExpr.Operator.PLUS) {
                // Record string concatenation location
            }
        });
    });
});

// Output: JSON AST
objectMapper.writeValue(outputFile, astData);
```

**Execution:**
```bash
cd java-analyzer
mvn clean package
java -jar target/java-analyzer-1.0.0.jar /path/to/repo output.json
```

---

### 2. TypeScript Analysis Engine

**Location:** `src/analyzers/`  
**Technology:** TypeScript 5.7.2, Node.js  
**Purpose:** Apply security rules to parsed Java AST

#### A. Security Analyzer (`security-analyzer.ts`)

**Rules Implemented:**

##### **SEC-001: SQL Injection Detection (Heuristic)**

**Detection Logic:**
```typescript
// Step 1: Find SQL execution methods
const sqlMethods = ["execute", "executeQuery", "executeUpdate"];

// Step 2: Check WHERE the call happens
for (const call of store.calls) {
    if (!sqlMethods.includes(call.calleeName)) continue;
    
    // Get the caller function and class
    const caller = store.getFunctionById(call.callerId);
    const classInfo = store.getClassByName(caller.className);
    
    // Step 3: Check if in Controller class (BAD!)
    if (classInfo.stereotype === "Controller" || 
        classInfo.stereotype === "RestController") {
        
        // Step 4: Check for string concatenation (WORSE!)
        const hasConcat = store.hasStringConcatenation(call.callerId);
        
        // Step 5: Check for PreparedStatement (GOOD!)
        if (store.usesPreparedStatement(call.callerId)) {
            continue; // Skip - using prepared statements
        }
        
        // FINDING: Controller executing SQL directly
        findings.push({
            severity: hasConcat ? "critical" : "high",
            confidence: hasConcat ? 90 : 75,
            message: "Controller executes SQL query...",
            remediation: "Move to service layer, use PreparedStatement"
        });
    }
    
    // Step 6: Check if outside Repository/Service layer
    if (classInfo.stereotype !== "Repository" && 
        classInfo.stereotype !== "Service") {
        
        findings.push({
            severity: "high",
            confidence: 60,
            message: "SQL query execution outside Repository/Service layer..."
        });
    }
}
```

**What triggers detection:**
- ✅ `Statement.execute()` in Controller → **CRITICAL**
- ✅ `executeQuery()` with string concatenation → **HIGH**
- ⚠️ Any `.execute()` call outside Repository/Service → **MEDIUM**

**What it misses (by design):**
- SQL injection in service layer (would need taint analysis)
- ORM query builders (JPA, Hibernate)
- Complex injection via reflection

**False Positives:**
- ❌ Retrofit `Call<T>.execute()` (HTTP, not SQL)
- ❌ OkHttp `Response.execute()` (HTTP, not SQL)
- ❌ Properly parameterized queries in non-standard locations

---

##### **SEC-002: Command Injection Detection (Heuristic)**

**Detection Logic:**
```typescript
// Step 1: Find command execution methods
const isCommandExecution = (call) => {
    // Runtime.getRuntime().exec()
    if (call.calleeName === "exec" && 
        call.scopeName?.includes("Runtime")) {
        return true;
    }
    
    // new ProcessBuilder(...)
    if (call.calleeName === "ProcessBuilder") {
        return true;
    }
    
    // ProcessBuilder.start()
    if (call.calleeName === "start" && 
        call.scopeName?.includes("ProcessBuilder")) {
        return true;
    }
    
    return false;
};

// Step 2: Check exposure level
for (const call of store.calls) {
    if (!isCommandExecution(call)) continue;
    
    const caller = store.getFunctionById(call.callerId);
    const classInfo = store.getClassByName(caller.className);
    
    // Step 3: Check if in Controller (HIGH RISK)
    if (classInfo.stereotype === "Controller") {
        findings.push({
            severity: "critical",
            confidence: 90,
            message: "Controller executes system commands..."
        });
    }
    
    // Step 4: Check for string concatenation
    if (store.hasStringConcatenation(call.callerId)) {
        findings.push({
            severity: "high",
            confidence: 85,
            message: "Command execution with string concatenation..."
        });
    }
}
```

**What triggers detection:**
- ✅ `Runtime.getRuntime().exec()` anywhere
- ✅ `ProcessBuilder` usage
- ✅ Command execution in Controller classes

---

#### B. Bug Analyzer (`bug-analyzer.ts`)

**Rules Implemented:**

##### **BUG-001: Null Pointer Risk**
```typescript
// Detect method calls on potentially null objects
for (const call of store.calls) {
    const scope = call.scopeName;
    
    // Check if scope could be null
    if (couldBeNull(scope)) {
        findings.push({
            severity: "medium",
            message: `Potential null pointer: ${scope}.${call.calleeName}()`
        });
    }
}
```

##### **BUG-002: Resource Leak**
```typescript
// Detect unclosed resources (streams, connections)
const resourceMethods = ["FileInputStream", "BufferedReader", "Connection"];

for (const call of store.calls) {
    if (resourceMethods.includes(call.calleeName)) {
        const hasFinally = store.hasFinally(call.callerId);
        const usesTryWithResources = store.usesTryWithResources(call.callerId);
        
        if (!hasFinally && !usesTryWithResources) {
            findings.push({
                severity: "medium",
                message: "Resource may not be closed properly"
            });
        }
    }
}
```

---

### 3. Graph Store (Call Graph Analysis)

**Location:** `src/graph/graph-store.ts`  
**Purpose:** Build and query function call relationships

**Data Structure:**
```typescript
class GraphStore {
    functions: Map<string, Function>;      // All functions
    calls: Call[];                         // All function calls
    classes: ClassInfo[];                  // All classes
    
    // Bidirectional relationships
    callersOf: Map<string, Set<string>>;   // Who calls this function?
    calleesOf: Map<string, Set<string>>;   // Who does this function call?
}
```

**Example Query:**
```typescript
// Find all functions that call "executeQuery"
const sqlCallers = store.getCallsTo("executeQuery");

// Find call chain: Controller → Service → Repository
const impactChain = store.getCallChain(
    "AsioCallbackController.handleCallback",
    "MspDeviceRepository.findByAccountUid"
);
```

---

## Analysis Workflow

### Step 1: Index Repository
```bash
npm run index
```

**What happens:**
1. Read `repos.json` configuration
2. Find all `.java` files in repository
3. For each file:
   - Run Java AST parser (JavaParser)
   - Extract classes, methods, calls
   - Save to `data/raw/repo-analyses.json`
4. Build bidirectional call graph (606 functions)

**Output:**
```
Indexed 150 Java files
Found 45 classes
Found 606 functions
Found 2,345 method calls
Built call graph with 606 nodes
```

---

### Step 2: Analyze Code
```bash
npm run analyze
```

**What happens:**
1. Load graph data from `data/raw/`
2. Run SecurityAnalyzer:
   - Apply SEC-001 (SQL Injection)
   - Apply SEC-002 (Command Injection)
3. Run BugAnalyzer:
   - Apply BUG-001 (Null Pointer)
   - Apply BUG-002 (Resource Leak)
4. Filter suppressed findings (analyzer-ignore comments)
5. Save findings to `data/findings/`:
   - `security.json` (64 findings)
   - `bugs.json` (82 findings)
   - `all.json` (146 findings)

**Output:**
```json
{
  "version": "1.0",
  "timestamp": "2026-04-21T10:10:01.168Z",
  "summary": {
    "total": 64,
    "bySeverity": {
      "critical": 0,
      "high": 64,
      "medium": 0
    }
  },
  "findings": [
    {
      "id": "SEC-001-service/.../AbsoluteAgentServiceImpl.java-46",
      "severity": "high",
      "ruleId": "SEC-001",
      "message": "SQL query execution outside Repository/Service layer...",
      "file": "service/.../AbsoluteAgentServiceImpl.java",
      "line": 46,
      "confidence": 60
    }
  ]
}
```

---

### Step 3: Human Analysis (What I Did)

After automated analysis, I:

1. **Read findings file** (`data/findings/security.json`)
2. **Filtered test files** (files containing `/test/`)
3. **Read actual source code** for each production finding
4. **Analyzed context:**
   - What is `absoluteAgentClient`? → Retrofit HTTP client
   - What does `.execute()` do? → HTTP call, not SQL
   - Is this really SQL injection? → NO, false positive
5. **Identified real issues** scanner missed:
   - SSRF vulnerability in `UtilityHelper.postInternalAPI()`
   - Sensitive data in log messages

---

## Detection Capabilities

### ✅ What It Can Detect

| Vulnerability | Method | Confidence |
|---------------|--------|------------|
| SQL Injection in Controllers | Pattern matching `.execute()` in Controllers | 75-90% |
| Command Injection | Pattern matching `Runtime.exec()`, `ProcessBuilder` | 70-90% |
| Null Pointer Risks | Call graph analysis | 60-70% |
| Resource Leaks | Pattern matching + try-with-resources check | 65-80% |
| Architectural Issues | Layer violation detection | 80% |

### ❌ What It Cannot Detect (Requires Advanced Analysis)

| Vulnerability | Why Not Detected | Would Need |
|---------------|------------------|------------|
| SQL injection via user input flow | No taint analysis | Data flow analysis |
| ORM query injection (JPA, Hibernate) | Different API patterns | ORM-specific rules |
| Second-order SQL injection | No persistent taint | Database state tracking |
| Blind command injection | No execution trace | Dynamic analysis |
| SSRF vulnerabilities | No HTTP client pattern rules | URL validation rules |
| XXE (XML External Entity) | No XML parsing rules | XML parser detection |
| Deserialization attacks | No serialization tracking | Object stream analysis |

---

## Why msp-service Had False Positives

### The Problem

**Rule:** Flag all `.execute()` calls outside Repository/Service layer

**Assumption:** `.execute()` = SQL execution

**Reality in msp-service:**
- Retrofit HTTP client: `Call<T>.execute()` → Makes REST API calls
- OkHttp client: `Response.execute()` → Makes HTTP requests
- These are NOT SQL-related!

### Example False Positive

**File:** `AbsoluteAgentServiceImpl.java:46`
```java
Response<ResponseBody> response = 
    absoluteAgentClient.downloadCoreAgent(...).execute();
```

**Scanner thinks:** "`.execute()` call outside Repository → Could be SQL injection!"

**Reality:** This is Retrofit HTTP client downloading agent installers via REST API.

---

## Comparison with Commercial Tools

| Feature | This Tool | SonarQube | Checkmarx | Fortify |
|---------|-----------|-----------|-----------|---------|
| **Technology** | Custom TypeScript + JavaParser | Java + Rules Engine | SAST + DAST | SAST |
| **SQL Injection** | Pattern-based heuristics | Pattern + taint | Full taint analysis | Full taint analysis |
| **Command Injection** | Pattern-based | Pattern + taint | Full taint analysis | Full taint analysis |
| **False Positives** | Higher (pattern-only) | Medium | Lower | Lower |
| **Speed** | Fast (~20s) | Medium | Slow (hours) | Slow (hours) |
| **Customization** | Full control | Rule customization | Limited | Limited |
| **Cost** | Free (custom) | Free (Community) / Paid | Paid | Paid |
| **Taint Analysis** | ❌ No | ⚠️ Limited | ✅ Yes | ✅ Yes |
| **Data Flow** | ❌ No | ⚠️ Limited | ✅ Yes | ✅ Yes |

---

## Improving Detection Accuracy

### Current Issue: High False Positive Rate

**Problem:** Flags Retrofit/OkHttp `.execute()` as SQL injection

**Solution 1: Add HTTP Client Detection**
```typescript
// Before: Flag all .execute() calls
if (call.calleeName === "execute") {
    findings.push({ ... }); // Too broad!
}

// After: Exclude HTTP clients
if (call.calleeName === "execute") {
    // Check if scope is HTTP client
    const httpClients = ["Call", "Response", "HttpClient", "OkHttpClient"];
    if (httpClients.some(c => call.scopeName?.includes(c))) {
        continue; // Skip - this is HTTP, not SQL
    }
    
    findings.push({ ... });
}
```

**Solution 2: Import Analysis**
```typescript
// Check file imports
const imports = store.getImportsForFile(call.file);

if (imports.includes("retrofit2.Call") || 
    imports.includes("okhttp3.Response")) {
    // This file uses HTTP clients, not SQL
    continue;
}
```

**Solution 3: Method Signature Analysis**
```typescript
// Check return type
if (call.returnType === "Response" || 
    call.returnType === "Call") {
    // Likely HTTP client
    continue;
}
```

---

## Suppression Support

**Feature:** Developers can suppress false positives using comments

**Example:**
```java
// analyzer-ignore SEC-001: This is Retrofit HTTP client, not SQL
Response<ResponseBody> response = 
    absoluteAgentClient.downloadCoreAgent(...).execute();
```

**How it works:**
```typescript
// Check for suppression comments in code
const isSuppressed = (file: string, line: number, ruleId: string): boolean => {
    const sourceCode = readFile(file);
    const lineContent = sourceCode[line - 1];
    
    // Look for: analyzer-ignore SEC-001
    if (lineContent.includes(`analyzer-ignore ${ruleId}`)) {
        return true;
    }
    
    return false;
};
```

---

## Summary

### What We Used
1. **JavaParser** - AST extraction from Java code
2. **Custom TypeScript Analyzers** - Security rule engine
3. **Graph Store** - Call relationship tracking
4. **Pattern Matching** - Heuristic vulnerability detection

### Strengths
✅ Fast analysis (~20 seconds)  
✅ Fully customizable rules  
✅ No licensing costs  
✅ Good for architectural violations  
✅ Catches obvious patterns

### Weaknesses
❌ High false positive rate (pattern-only)  
❌ No taint analysis (can't track data flow)  
❌ No runtime behavior analysis  
❌ Requires manual source review for accuracy  
❌ Limited to heuristic patterns

### Recommendation
This tool is excellent for:
- Quick initial security scans
- Architectural rule enforcement
- CI/CD integration (fast feedback)
- Educational purposes

For production security audits, combine with:
- Commercial SAST tools (Checkmarx, Fortify)
- Manual code review
- Penetration testing
- Dynamic analysis (DAST)

---

**Analysis Date:** April 21, 2026  
**Tool Version:** 1.0.0  
**Repository Analyzed:** msp-service (606 functions, 2,345 calls)
