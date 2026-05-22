import { Analyzer } from "./analyzer-interface";
import { Finding } from "../core/types";
import { GraphStore } from "../graph/graph-store";

export class BugAnalyzer implements Analyzer {
  name = "BugAnalyzer";
  category: "bug" = "bug";

  analyze(store: GraphStore): Finding[] {
    const findings: Finding[] = [];

    findings.push(...this.detectUnsafeOptionalGet(store));
    findings.push(...this.detectResourceLeaks(store));
    findings.push(...this.detectEmptyCatchBlocks(store));

    // Filter out findings intentionally suppressed in source.
    return findings.filter(f => !store.isSuppressed(f.file, f.line, f.ruleId));
  }

  /**
   * Rule BUG-001: Unsafe Optional.get()
   *
   * Detection Logic:
   * 1. Find all calls to .get() method where scope includes "Optional"
   * 2. Check if isPresent() or isEmpty() is called in the same function
   * 3. If no guard check found, report as unsafe
   *
   * Pattern: Optional<T> opt = ...; opt.get(); // without opt.isPresent()
   *
   * Heuristic: This is pattern-based and may miss:
   * - Guard checks in different methods
   * - Guard checks using orElse() or other Optional methods
   * - Complex control flow with early returns
   */
  private detectUnsafeOptionalGet(store: GraphStore): Finding[] {
    const findings: Finding[] = [];

    for (const call of store.calls) {
      // Check if this is a .get() call
      // Heuristic: If .get() is called and the same method also calls Optional-related methods
      // (like findById, findFirst, etc.), check for guards
      if (call.calleeName === "get") {
        const caller = store.getFunctionById(call.callerId);
        if (!caller) continue;

        // Get all calls in the same function
        const callsInFunction = store.getCallsInFunction(call.callerId);

        // Check if this function has any Optional-returning method calls
        // Common patterns: findById, findFirst, findAny, ofNullable, etc.
        const hasOptionalMethod = callsInFunction.some(c =>
          c.calleeName.startsWith("find") ||
          c.calleeName === "ofNullable" ||
          c.calleeName === "empty" ||
          c.calleeName === "of"
        );

        // If we suspect Optional usage, check for guard methods
        if (hasOptionalMethod) {
          const hasIsPresentCheck = store.isMethodCalledInFunction(call.callerId, "isPresent");
          const hasIsEmptyCheck = store.isMethodCalledInFunction(call.callerId, "isEmpty");
          const hasOrElseCheck = store.isMethodCalledInFunction(call.callerId, "orElse");
          const hasOrElseThrowCheck = store.isMethodCalledInFunction(call.callerId, "orElseThrow");

          // If no guard methods found, flag as unsafe
          if (!hasIsPresentCheck && !hasIsEmptyCheck && !hasOrElseCheck && !hasOrElseThrowCheck) {
            // Severity tuning based on context
            // Controllers/REST endpoints = high (user-facing), Service/Repository = medium
            let severity: "high" | "medium" = "medium";

            if (caller.className) {
              const classInfo = store.classes.find(c => c.className === caller.className);
              if (classInfo) {
                const isController = classInfo.stereotype === "Controller" || classInfo.stereotype === "RestController";
                if (isController) {
                  severity = "high"; // User-facing code - higher impact
                }
              }
            }

            findings.push({
              id: `BUG-001-${call.file}-${call.line}`,
              category: "bug",
              severity,
              ruleId: "BUG-001",
              ruleName: "Unsafe Optional.get()",
              message: "Optional.get() called without isPresent() or isEmpty() check in the same method",
              repo: call.repo,
              file: call.file,
              line: call.line,
              functionId: call.callerId,
              className: caller.className,
              confidence: 75,
              remediation: "Use Optional.orElseThrow(() -> new Exception()) or check with isPresent() first"
            });
          }
        }
      }
    }

    return findings;
  }

  /**
   * Rule BUG-002: Resource Leak in Try-Catch
   *
   * Detection Logic:
   * 1. Find all try-catch blocks that DON'T use try-with-resources
   * 2. Check if method contains I/O-related calls (read, write, execute, etc.)
   * 3. If I/O operations found without try-with-resources, flag as potential leak
   *
   * Pattern:
   *   try {
   *     FileInputStream fis = new FileInputStream(file); // Not in try-with-resources
   *     fis.read(data);
   *     // ...
   *   } catch (Exception e) { }
   *
   * Heuristic: Checks for I/O method calls + absence of try-with-resources.
   * May flag false positives if:
   * - Resource is properly closed in finally block
   * - Resource is returned and closed by caller
   * - I/O is on already-managed resources
   */
  private detectResourceLeaks(store: GraphStore): Finding[] {
    const findings: Finding[] = [];

    // I/O-related method names that suggest resource usage
    const ioMethods = ["read", "write", "execute", "query", "connect", "accept", "getInputStream", "getOutputStream"];

    for (const tryBlock of store.tryCatchBlocks) {
      // Only check try-catch blocks without try-with-resources
      if (tryBlock.hasResources) continue;
      if (!tryBlock.hasCatchBlock) continue;

      // Get the function containing this try-catch
      const method = store.getFunctionById(tryBlock.methodId);
      if (!method) continue;

      // Check if any I/O method is called in this method
      const callsInMethod = store.getCallsInFunction(tryBlock.methodId);
      const hasIOOperation = callsInMethod.some(call =>
        ioMethods.includes(call.calleeName)
      );

      if (hasIOOperation) {
        // Severity tuning based on I/O type
        // Critical I/O (execute, query) = high, File I/O (read, write) = medium
        const hasCriticalIO = callsInMethod.some(call =>
          call.calleeName === "execute" || call.calleeName === "query" || call.calleeName === "connect"
        );

        const severity: "high" | "medium" = hasCriticalIO ? "high" : "medium";
        const message = hasCriticalIO
          ? "Try-catch block with database/network operations does not use try-with-resources. High risk of connection leak."
          : "Try-catch block with I/O operations does not use try-with-resources. Ensure resources are properly closed.";

        findings.push({
          id: `BUG-002-${tryBlock.file}-${tryBlock.line}`,
          category: "bug",
          severity,
          ruleId: "BUG-002",
          ruleName: "Potential Resource Leak",
          message,
          repo: tryBlock.repo,
          file: tryBlock.file,
          line: tryBlock.line,
          functionId: tryBlock.methodId,
          className: method.className,
          confidence: 70,
          remediation: "Use try-with-resources: try (ResourceType resource = new ResourceType()) { ... }"
        });
      }
    }

    return findings;
  }

  /**
   * Rule BUG-003: Empty Catch Block
   *
   * Detection Logic:
   * 1. Find all try-catch blocks
   * 2. Check if catch block is empty
   * 3. If empty, flag as exception swallowing
   *
   * Pattern:
   *   try {
   *     // ...
   *   } catch (Exception e) {
   *     // Empty - exception silently ignored
   *   }
   *
   * Heuristic: Direct check from parser data. Very reliable.
   */
  private detectEmptyCatchBlocks(store: GraphStore): Finding[] {
    const findings: Finding[] = [];

    for (const tryBlock of store.tryCatchBlocks) {
      if (tryBlock.hasCatchBlock && tryBlock.catchBlockEmpty) {
        const method = store.getFunctionById(tryBlock.methodId);

        // Severity tuning based on context
        // Controllers/public methods = medium (user-facing), internal = low
        let severity: "medium" | "low" = "low";

        if (method?.className) {
          const classInfo = store.classes.find(c => c.className === method.className);
          if (classInfo) {
            const isController = classInfo.stereotype === "Controller" || classInfo.stereotype === "RestController";
            if (isController || method.exported) {
              severity = "medium"; // User-facing or public - higher impact
            }
          }
        }

        findings.push({
          id: `BUG-003-${tryBlock.file}-${tryBlock.line}`,
          category: "bug",
          severity,
          ruleId: "BUG-003",
          ruleName: "Empty Catch Block",
          message: "Exception caught but not handled. Empty catch blocks silently ignore errors.",
          repo: tryBlock.repo,
          file: tryBlock.file,
          line: tryBlock.line,
          functionId: tryBlock.methodId,
          className: method?.className,
          confidence: 95,
          remediation: "Log the exception, rethrow it, or handle it appropriately. Use logger.error(e) at minimum."
        });
      }
    }

    return findings;
  }
}
