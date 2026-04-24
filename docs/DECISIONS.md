# Architectural Decisions

This document explains key architectural decisions made during the project. Each decision includes the rationale and trade-offs involved.

---

## 1. Pattern-Based Detection Only (No Taint Analysis)

### Decision

Use pattern matching on AST structures and call graphs. Do not implement data flow or taint analysis.

### Reason

**Complexity vs Value**:
- Taint analysis requires tracking data through 5-10+ hops
- Needs points-to analysis, aliasing detection, context sensitivity
- 3-4 weeks of work minimum for basic implementation
- High bug risk in taint tracking logic

**MVP Scope**:
- Pattern-based catches 70-80% of real vulnerabilities
- Controllers executing SQL directly IS a problem (regardless of taint proof)
- Architectural smells are valuable to flag even without proof

**Maintenance Burden**:
- Taint analysis breaks easily with new Java features
- Requires constant tuning for false positives
- Hard to explain to developers why something was flagged

**Real World**:
```java
@RestController
public class UserController {
    public String getUser(@PathVariable String id) {
        // Pattern-based: Flags this (Controller + SQL)
        // Taint-based: Also flags this (proves 'id' reaches SQL)
        stmt.executeQuery("SELECT * FROM users WHERE id = " + id);
    }
}
```

Both approaches flag it. Pattern is simpler. Taint proof doesn't add much value here.

### Trade-offs

**Lose**:
- Cannot detect SQL injection in service layer
  ```java
  @Service
  class UserService {
      void findUser(String id) {
          // Won't flag without taint analysis
          stmt.executeQuery("SELECT * WHERE id = " + id);
      }
  }
  ```
- Cannot prove user input reaches SQL/command
- May flag safe code in Controllers (false positive)

**Gain**:
- Fast implementation (5 phases in reasonable time)
- Predictable behavior (pattern matching is deterministic)
- Easy to debug (print the AST, see the pattern)
- Low maintenance (patterns rarely break)
- Clear to developers (they understand the pattern)

**Acceptable Because**:
- Controllers shouldn't execute SQL anyway (architectural smell)
- Can add taint analysis in v2.0 if needed
- 70-80% detection rate is good for MVP
- False positives manageable via suppression

---

## 2. Heuristic-Based with Confidence Scores

### Decision

Mark all findings as "Potential" and "Heuristic". Provide confidence scores (60-95%). Never claim 100% certainty.

### Reason

**Honesty**:
- We don't have proof (no taint analysis)
- Pattern matching has inherent uncertainty
- False positives are possible

**Trust**:
- Developers trust tools that admit limitations
- Over-confident tools get ignored when wrong
- Transparency builds credibility

**Risk Management**:
- Better to flag architectural smells at 70% confidence
- Than miss real vulnerabilities by being too conservative

**Example**:
```java
// Confidence: 90% (AST detected + operator in SQL)
String sql = "SELECT * FROM users WHERE id = " + id;
stmt.executeQuery(sql);

// Confidence: 65% (Controller + SQL, no other signals)
stmt.executeQuery(query);
```

### Trade-offs

**Lose**:
- Some developers may ignore "potential" findings
- Can't integrate with tools expecting boolean (vulnerable/not vulnerable)

**Gain**:
- Honest about capabilities
- Confidence scores help prioritization
- Developers understand uncertainty
- No false sense of security

**Acceptable Because**:
- Honesty > false confidence
- Security tools should admit limitations
- Confidence scores are actionable (start with 90%, then 85%, etc.)

---

## 3. Simple Graph Store (Bidirectional Indexes Only)

### Decision

GraphStore has:
- `Map<functionId, Function>` - O(1) lookup
- `callersIndex: Map<calleeId, Set<callerIds>>` - O(1) reverse lookup
- Simple arrays for calls, classes, routes, etc.

Does NOT have:
- Transitive closure
- Dominator trees
- Control flow graphs
- Def-use chains

### Reason

**Current Rules Don't Need It**:
- BUG-001 (Optional.get): Checks calls in same function
- BUG-002 (Resource leak): Checks try-catch structure
- BUG-003 (Empty catch): Direct AST check
- SEC-001 (SQL injection): Checks class stereotype + method call
- SEC-002 (Command injection): Same as SEC-001

None require complex graph algorithms.

**YAGNI** (You Ain't Gonna Need It):
- Added complexity that isn't used is tech debt
- Every data structure needs maintenance
- More code = more bugs

**Performance**:
```typescript
// Simple: O(1) lookup
const callers = store.getDirectCallers(fnId);

// Complex: O(V + E) transitive closure
const allCallers = store.getTransitiveCallers(fnId);
```

We don't need transitive for current rules.

### Trade-offs

**Lose**:
- Can't answer "who calls this transitively?" efficiently
- Can't do deep call chain analysis (>3 hops)
- Can't build control flow graphs

**Gain**:
- Fast: O(1) for all current operations
- Simple: Easy to understand and debug
- Small: ~48MB for test codebase
- Maintainable: No complex graph algorithms to maintain

**Acceptable Because**:
- Current rules work with direct relationships
- Call chain helper (depth 2-3) available for future
- Can add complexity when actually needed (v2.0)

---

## 4. AST Extraction in Java, Analysis in TypeScript

### Decision

Split into two parts:
1. Java analyzer (JavaParser) - Extract AST patterns → JSON
2. TypeScript orchestrator - Load JSON → Analyze → Report

### Reason

**Right Tool for the Job**:
- JavaParser is the best Java AST library (Java)
- TypeScript is good for orchestration, graph manipulation
- Don't force square peg into round hole

**Performance**:
- JavaParser is fast (native Java)
- Extracting everything once is cheaper than on-demand
- JSON serialization is one-time cost

**Simplicity**:
- Java analyzer: "Extract everything, dump JSON, exit"
- TypeScript: "Load JSON, run analyzers, report"
- Clear separation of concerns

**Debugging**:
- Can inspect `data/raw/repo-analyses.json` manually
- Can test Java analyzer independently
- Can test analyzers with mock data

### Trade-offs

**Lose**:
- Two languages to maintain
- JSON serialization overhead
- Can't query AST dynamically (must extract upfront)

**Gain**:
- Use best library for each task
- Serialized data is inspectable
- Analyzers don't need JavaParser knowledge
- Can swap Java analyzer if needed (e.g., Spoon, Eclipse JDT)

**Acceptable Because**:
- One-time parse cost is fine
- Extracting comprehensive data upfront is simpler than on-demand
- TypeScript graph manipulation is easier than Java

---

## 5. No Control Flow Graphs

### Decision

Do not build CFGs. Do not analyze branches, loops, or execution paths.

### Reason

**Current Rules Don't Need It**:
- Optional.get(): Pattern match on calls
- Resource leak: Pattern match on try-catch structure
- Empty catch: Direct AST check
- SQL/Command injection: Pattern match on calls + class

None require "Does execution always reach this line?"

**Complexity**:
```java
// With CFG: Can prove rs.close() always executes
try {
    ResultSet rs = stmt.executeQuery(sql);
    if (condition) {
        return rs.getString("name");
    }
    rs.close(); // Is this reachable? CFG knows.
} catch (Exception e) {}

// Without CFG: Flag as potential leak (conservative)
```

We accept false positive (flagging even if close() always reached) rather than build CFG.

**Diminishing Returns**:
- CFG reduces false positives by maybe 10-20%
- Implementation cost: 2-3 weeks
- Maintenance cost: High (CFG breaks with new syntax)

### Trade-offs

**Lose**:
- Some false positives (flag code that's actually safe)
- Can't detect unreachable code
- Can't prove exhaustive checks

**Gain**:
- Simpler implementation
- Faster analysis
- Less maintenance
- Easier to understand

**Acceptable Because**:
- Suppressions handle false positives
- Architectural smells are valid even if flow-safe
- CFG doesn't help with SQL/command injection (our main focus)

---

## 6. In-Memory Graph Store

### Decision

Load entire graph into memory. No database, no disk-backed store.

### Reason

**Performance**:
```typescript
// In-memory: O(1)
const fn = store.functions.get(fnId);

// Database: Network roundtrip + query
const fn = await db.query("SELECT * FROM functions WHERE id = ?", [fnId]);
```

For analysis, we query the graph hundreds of times. In-memory is 100-1000x faster.

**Simplicity**:
- No DB setup, no schema migrations, no connection pooling
- GraphStore is just TypeScript data structures
- Easy to debug (console.log the object)

**Analysis Pattern**:
- Parse once → Analyze many rules → Report
- Not a long-running service
- Not incrementally updated

### Trade-offs

**Lose**:
- RAM limit (can't analyze 10M+ function codebase)
- No incremental updates (must re-parse everything)
- No persistence (must re-index if process crashes)

**Gain**:
- 100-1000x faster queries
- No external dependencies
- Trivial to test (just create objects)
- Simple deployment (no DB setup)

**Acceptable Because**:
- Typical codebases: 10K-100K functions (fits in RAM)
- Analysis is fast enough to re-run entirely
- Can add disk-backed store in v3.0 if needed

---

## 7. Suppression via Inline Comments

### Decision

Support `// analyzer-ignore RULE-ID` comments. No global config file initially.

### Reason

**Context**:
- Comment lives with code
- Reviewer sees why it's suppressed
- Git blame shows who/when/why

**Maintenance**:
```java
// Good: Clear context
// analyzer-ignore SEC-001 Admin-only endpoint with manual validation
stmt.executeQuery(sql);

// Bad: Disconnected from code
// In .analyzer-ignore.json:
// { "file": "Controller.java", "line": 42, "rule": "SEC-001" }
```

**Discoverability**:
- Developers see comment while editing
- Code review catches unnecessary suppressions
- Easy to remove when code changes

### Trade-offs

**Lose**:
- No bulk suppression (must add comment to each)
- No project-wide patterns (e.g., "ignore SEC-001 in test/*")
- No centralized suppression management

**Gain**:
- Suppressions documented in code
- Git history tracks suppressions
- Code review includes suppressions
- No separate file to maintain

**Acceptable Because**:
- Most suppressions are legitimate exceptions (not bulk)
- Can add config file in v1.2 if needed
- Inline is better for code review

---

## 8. Context-Aware Severity (Not Fixed)

### Decision

Same rule can produce different severities based on context:
- BUG-001: Medium (Service) → High (Controller)
- BUG-002: Medium (File I/O) → High (DB I/O)
- BUG-003: Low (internal) → Medium (public)

### Reason

**Risk-Based**:
- Controllers are user-facing (higher impact)
- Database leaks are worse than file leaks
- Public methods have wider blast radius

**Prioritization**:
```java
// HIGH severity: Controller (user-facing)
@RestController
class UserController {
    void getUser() {
        opt.get(); // NoSuchElementException → 500 error to user
    }
}

// MEDIUM severity: Service (internal)
@Service
class UserService {
    void getUser() {
        opt.get(); // NoSuchElementException → caught by controller
    }
}
```

Developers fix HIGH first, then MEDIUM.

### Trade-offs

**Lose**:
- Less consistent (same pattern, different severity)
- Harder to explain rules (severity depends on context)

**Gain**:
- Better prioritization
- Reflects real-world risk
- Developers focus on high-impact issues

**Acceptable Because**:
- Risk-based prioritization is correct
- Developers understand context (Controller vs Service)
- Still consistent (same context = same severity)

---

## 9. Impact Analysis Separate from Main Analysis

### Decision

Impact analysis (`npm run impact`) is a separate command. Not integrated into `npm run analyze`.

### Reason

**Different Use Cases**:
- `analyze`: Find bugs/security issues (CI/CD)
- `impact`: Assess change impact (pre-commit, planning)

**Performance**:
- Impact analysis for 1 function: Fast
- Impact analysis for all functions: Slow (not needed)

**Clarity**:
```bash
# Clear: Find all issues
npm run analyze

# Clear: Impact of changing this function
npm run impact -- --function createOrder

# Confusing: Find issues + impact for every function?
npm run analyze --with-impact
```

### Trade-offs

**Lose**:
- No integrated view (findings + impact in one report)
- Two separate commands to learn

**Gain**:
- Focused tools (one job each)
- Faster analysis (no unnecessary impact calculation)
- Clearer UX

**Acceptable Because**:
- Different workflows for different use cases
- Can add `--with-impact` flag later if needed
- Simplicity > feature completeness

---

## 10. Phase-Based Incremental Development

### Decision

Deliver in 5 phases over time. Each phase adds capability without breaking previous phases.

### Reason

**Risk Management**:
- Small changes = easy to review
- Each phase tested independently
- Can stop after any phase (still have value)

**Learning**:
- Phase 1: Learn if bidirectional indexes are enough
- Phase 2: Learn if bug detection is valuable
- Phase 3: Learn if security detection works
- Phase 4: Learn what UX improvements matter
- Phase 5: Learn what accuracy improvements matter

**Momentum**:
- Working software after each phase
- Can demo progress incrementally
- Team sees value early (not waiting months)

**Example**:
- After Phase 1: Have graph store (usable for other tools)
- After Phase 2: Have bug detection (deployable)
- After Phase 3: Have security detection (complete MVP)
- After Phase 4: Have better UX (professional tool)
- After Phase 5: Have accuracy (production-ready)

### Trade-offs

**Lose**:
- Slower to "complete" (compared to big bang)
- More documentation overhead (PHASEX_COMPLETE.md for each)
- Need to maintain compatibility across phases

**Gain**:
- De-risked (can stop early if not valuable)
- Validated (each phase used in practice)
- Stable (zero breaking changes across 5 phases)

**Acceptable Because**:
- Working software > comprehensive plan
- Feedback-driven > speculation
- Stable evolution > rewrite churn

---

## 11. Zero Breaking Changes Policy

### Decision

Once a feature is added, never break it. All changes must be backward compatible.

### Reason

**Trust**:
- Developers integrate tool into workflow
- Breaking changes = disruption = tool gets removed
- Stability matters more than perfect API

**Maintenance**:
- No migration guides needed
- No "upgrade" process
- Just pull latest and run

**Real Cost of Breaking Changes**:
```typescript
// Breaking: Changed finding ID format
// Before: "BUG-001-Controller.java-42"
// After:  "BUG-001-hash123"
// Result: All suppressions break

// Non-breaking: Add new field
interface Finding {
  id: string;  // Keep existing format
  confidence: number;
  hash?: string;  // New optional field
}
```

### Trade-offs

**Lose**:
- Stuck with early design decisions
- Accumulate optional fields
- Can't "fix" bad names

**Gain**:
- Developers trust the tool
- No upgrade pain
- No documentation churn

**Acceptable Because**:
- Initial design was thoughtful (not rushed)
- Optional fields are manageable
- Stability > perfection

---

## 12. No Framework-Specific Deep Analysis

### Decision

Detect general patterns (SQL execution, command execution). Do not analyze framework internals (Spring Security policies, Hibernate queries).

### Reason

**Maintenance Burden**:
- Spring Framework: 1000+ classes
- New versions: 2-3 times per year
- Breaking internal API changes common

**Complexity**:
```java
// General: Flag this (pattern-based)
@RestController
class Controller {
    void endpoint() {
        stmt.executeQuery(sql);
    }
}

// Framework-specific: Analyze @PreAuthorize, @Secured
@RestController
@Secured("ROLE_ADMIN")
class AdminController {
    @PreAuthorize("hasRole('ADMIN')")
    void endpoint() {
        stmt.executeQuery(sql);  // Is this safe given security annotations?
    }
}
```

Analyzing Spring Security correctly requires:
- Understanding @PreAuthorize expressions (SpEL)
- Tracking security context
- Understanding authentication flow

Too complex for MVP.

### Trade-offs

**Lose**:
- Miss framework-specific vulnerabilities
- Can't reduce severity based on security annotations
- More false positives (flag code that framework protects)

**Gain**:
- Simple rules (work across frameworks)
- Low maintenance (framework changes don't break tool)
- Fast implementation

**Acceptable Because**:
- General patterns catch most issues
- Framework-specific rules can be v1.5+ add-ons
- Suppressions handle framework-managed cases

---

## 13. PreparedStatement Detection (Not Parameterization Verification)

### Decision

Detect `PreparedStatement` + `?` placeholders. Do NOT verify `setString()` calls.

### Reason

**Complexity**:
```java
PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
// Need to verify:
// 1. setString(1, ...) is called
// 2. For every ? placeholder
// 3. Before executeQuery()
// 4. With correct index
```

This requires data flow analysis (tracking stmt variable, verifying method calls in order).

**Diminishing Returns**:
- Code with `?` placeholders is 95% likely to use setString()
- Code without `?` is 100% likely vulnerable
- Most false positives avoided just by detecting `?`

**Real World**:
```java
// Pattern we detect (skip this):
PreparedStatement stmt = conn.prepareStatement("SELECT * WHERE id = ?");
stmt.setString(1, id);
stmt.executeQuery();

// Edge case we miss (still flag this):
PreparedStatement stmt = conn.prepareStatement("SELECT * WHERE id = ?");
stmt.executeQuery();  // Would fail at runtime (missing setString)
```

We accept missing the edge case to avoid complexity.

### Trade-offs

**Lose**:
- May skip broken code (PreparedStatement without setString)
- Can't verify correct parameter indexes

**Gain**:
- Simple detection (check method name + arguments)
- Fast (no data flow analysis)
- 95% accurate (most PreparedStatement usage is correct)

**Acceptable Because**:
- False negative (missing broken code) is better than false positive (flagging safe code)
- Broken PreparedStatement fails at runtime (developer catches it)
- Our goal: Reduce false positives, not achieve 100% recall

---

## 14. ±2 Line Tolerance for Suppressions

### Decision

Suppression comment on line N suppresses findings on lines N-2 to N+2.

### Reason

**Formatting Flexibility**:
```java
// Option 1: Comment before
// analyzer-ignore SEC-001
stmt.executeQuery(sql);

// Option 2: Comment on same line
stmt.executeQuery(sql); // analyzer-ignore SEC-001

// Option 3: Comment after method declaration
@GetMapping("/query")
public void query() {  // analyzer-ignore SEC-001
    stmt.executeQuery(sql);
}
```

Different developers have different styles. Tolerance accommodates all.

**Annotation Distance**:
- Spring annotations can be 1-2 lines above method
- JavaDoc can be 5+ lines above
- 2 line tolerance balances flexibility and precision

### Trade-offs

**Lose**:
- May suppress wrong finding (if two findings within 4 lines)
- Less precise (comment intent may be ambiguous)

**Gain**:
- Flexible comment placement
- Works with different formatting styles
- Developers don't fight the tool

**Acceptable Because**:
- Multiple findings on adjacent lines is rare
- Developers can adjust comment placement if needed
- False suppression is visible in code review

---

## Summary Table

| Decision | Key Benefit | Main Trade-off |
|----------|-------------|----------------|
| Pattern-based only | Simple, fast, maintainable | Can't prove user input reaches sink |
| Heuristic confidence | Honest about limitations | Some findings ignored due to uncertainty |
| Simple graph | Fast O(1) operations | Can't do transitive analysis |
| Java + TypeScript | Right tool for each job | Two languages to maintain |
| No CFG | Simpler implementation | Some false positives |
| In-memory store | 100-1000x faster queries | RAM limited |
| Inline suppression | Context with code | No bulk suppression |
| Context-aware severity | Better prioritization | Less consistent |
| Separate impact analysis | Focused tools | No integrated view |
| Phase-based delivery | De-risked, validated | Slower to "complete" |
| Zero breaking changes | Developer trust | Stuck with early decisions |
| No framework-specific | Low maintenance | Miss framework patterns |
| PreparedStatement detection | Reduce false positives | May skip broken code |
| ±2 line suppression | Flexible formatting | May suppress wrong finding |

---

## Decision-Making Framework

When considering new features, we ask:

1. **Do we need it?** - Will current rules use it?
2. **What's the cost?** - Implementation time, maintenance burden
3. **What's the trade-off?** - What do we lose by adding complexity?
4. **Can we defer?** - Can we add it later when actually needed?
5. **Is it breaking?** - Will it break existing users?

**Default answer**: No (YAGNI - You Ain't Gonna Need It)

**Exception**: Feature clearly needed, cost is reasonable, no breaking changes

---

## Anti-Patterns We Avoid

### 1. "We Might Need It Later"
- Adding complexity for hypothetical future needs
- Result: Maintenance burden without benefit

### 2. "This Would Be Cool"
- Adding features because they're interesting, not needed
- Result: Bloated, confusing codebase

### 3. "Let's Make It Perfect"
- Over-engineering the first version
- Result: Late delivery, over-complex solution

### 4. "Industry Standard Tools Do It"
- Copying features from commercial tools without understanding cost
- Result: Poor clone of expensive tool

### 5. "Users Might Want Options"
- Adding configuration for every decision
- Result: Decision paralysis, maintenance burden

---

## Principles

**Simplicity > Completeness**: Better to do 5 things well than 20 things poorly

**Honesty > Confidence**: Admit limitations rather than over-promise

**Stability > Perfection**: Working consistently beats perfect but fragile

**Practicality > Theory**: Solve real problems with simple solutions

**Focus > Features**: Deep in narrow area beats shallow in wide area

---

**Last Updated**: 2026-04-21  
**Project**: Java Code Intelligence System  
**Philosophy**: Do less, better
