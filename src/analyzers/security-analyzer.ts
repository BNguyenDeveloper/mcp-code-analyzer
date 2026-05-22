import { Analyzer } from "./analyzer-interface";
import { Finding } from "../core/types";
import { GraphStore } from "../graph/graph-store";

export class SecurityAnalyzer implements Analyzer {
  name = "SecurityAnalyzer";
  category: "security" = "security";

  analyze(store: GraphStore): Finding[] {
    const findings: Finding[] = [];

    findings.push(...this.detectSQLInjection(store));
    findings.push(...this.detectCommandInjection(store));

    // Filter out findings intentionally suppressed in source.
    return findings.filter(f => !store.isSuppressed(f.file, f.line, f.ruleId));
  }

  /**
   * Rule SEC-001: Potential SQL Injection (Heuristic)
   *
   * Detection Logic (Pattern-Based):
   * 1. Find all calls to SQL execution methods:
   *    - execute, executeQuery, executeUpdate
   * 2. Check if the caller is in a Controller class:
   *    - @RestController or @Controller stereotype
   * 3. If yes, flag as potential SQL injection risk
   * 4. Check for string concatenation (+ operator near SQL call) - increases confidence
   * 5. Check if SQL-related variables are used - increases confidence
   *
   * Rationale:
   * Controllers should not directly execute SQL queries. This pattern suggests:
   * - Lack of service layer separation
   * - Potential for user input to flow directly to SQL
   * - Missing parameterization or validation layer
   *
   * Heuristic: This is a PATTERN-BASED check, not definitive proof.
   * May flag:
   * - Controllers using properly parameterized queries (false positive)
   * - Direct JDBC usage for legitimate reasons (false positive)
   *
   * Will NOT detect:
   * - SQL injection in service layer (requires taint analysis)
   * - SQL injection via ORM query builders
   * - Complex injection patterns
   *
   * Confidence: 65-85% depending on signals (concat, variables, etc.)
   */
  private detectSQLInjection(store: GraphStore): Finding[] {
    const findings: Finding[] = [];

    // SQL execution method names
    const sqlMethods = ["execute", "executeQuery", "executeUpdate"];

    // Find all SQL execution calls
    for (const call of store.calls) {
      if (!sqlMethods.includes(call.calleeName)) continue;

      // Get the function making the SQL call
      const caller = store.getFunctionById(call.callerId);
      if (!caller || !caller.className) continue;

      // Check if the caller is in a Controller class
      const classInfo = store.classes.find(c => c.className === caller.className);
      if (!classInfo) continue;

      const isController =
        classInfo.stereotype === "Controller" ||
        classInfo.stereotype === "RestController";

      if (isController) {
        // Check for string concatenation extracted from the AST parser.
        const concats = store.getStringConcatsInFunction(call.callerId);
        const hasSqlConcat = concats.some(c => c.inSqlContext);

        // Check for concat method calls (Phase 4 method)
        const callsInFunction = store.getCallsInFunction(call.callerId);
        const hasMethodConcat = callsInFunction.some(c =>
          c.calleeName === "concat" || c.calleeName === "append" || c.calleeName === "format"
        );

        // Check if method has parameters (increases risk if SQL + params)
        const hasParameters = caller.name.includes("(") && !caller.name.includes("()");

        // Check if using PreparedStatement (affects confidence/severity, but don't skip)
        const usesPreparedStmt = store.usesPreparedStatement(call.callerId);
        const usesParameterization = store.usesParameterization(call.callerId);
        const hasPreparedStatement = usesPreparedStmt && usesParameterization;

        // Calculate confidence based on signals
        let confidence = 65; // base confidence
        let severity: "critical" | "high" | "medium" = "critical";
        let message = "Controller class directly executes SQL query. This bypasses service layer and increases SQL injection risk.";

        if (hasSqlConcat) {
          confidence = 90; // AST detected + operator in SQL string
          message = "Controller executes SQL with '+' operator concatenation. Very high risk of SQL injection.";

          if (hasPreparedStatement) {
            // PreparedStatement detected, but unsafe concatenation also found - lower confidence
            confidence = 70;
            severity = "high";
            message += " Note: PreparedStatement detected but cannot verify if the concatenated SQL is safely parameterized.";
          }
        } else if (hasMethodConcat) {
          confidence = 85;
          message = "Controller executes SQL with string concatenation. High risk of SQL injection if user input is involved.";

          if (hasPreparedStatement) {
            confidence = 65;
            severity = "high";
            message += " Note: PreparedStatement detected but concatenation methods found.";
          }
        } else if (hasParameters) {
          confidence = 75;
          message = "Controller method with parameters executes SQL query. Risk of SQL injection if parameters reach the query.";

          if (hasPreparedStatement) {
            confidence = 55;
            severity = "medium";
            message = "Controller executes SQL query. PreparedStatement with parameterization detected, but architectural smell remains (SQL should be in service layer).";
          }
        } else if (hasPreparedStatement) {
          // PreparedStatement with no obvious concatenation - still architectural smell but lower risk
          confidence = 50;
          severity = "medium";
          message = "Controller directly executes SQL query. PreparedStatement with parameterization detected, reducing injection risk, but SQL should be in service layer.";
        }

        // Controller directly executing SQL - architectural smell + security risk
        findings.push({
          id: `SEC-001-${call.file}-${call.line}`,
          category: "security",
          severity,
          ruleId: "SEC-001",
          ruleName: "Potential SQL Injection (Heuristic)",
          message,
          repo: call.repo,
          file: call.file,
          line: call.line,
          functionId: call.callerId,
          className: caller.className,
          confidence,
          cwe: ["CWE-89"],
          remediation: "Move SQL execution to a service layer. Use PreparedStatement with parameterized queries. Never concatenate user input into SQL strings."
        });
        continue;
      }

      // Additional heuristic: Check if this is direct JDBC usage (lower confidence)
      // If the SQL call is NOT in a Repository stereotype, it might be direct JDBC
      const isRepository = classInfo.stereotype === "Repository";
      if (!isRepository && classInfo.stereotype !== "Service") {
        // SQL execution outside Repository/Service layer
        findings.push({
          id: `SEC-001-${call.file}-${call.line}`,
          category: "security",
          severity: "high",
          ruleId: "SEC-001",
          ruleName: "Potential SQL Injection (Heuristic)",
          message: "SQL query execution outside Repository/Service layer. Verify parameterized queries are used.",
          repo: call.repo,
          file: call.file,
          line: call.line,
          functionId: call.callerId,
          className: caller.className,
          confidence: 60,
          cwe: ["CWE-89"],
          remediation: "Ensure PreparedStatement with parameterized queries is used. Follow repository pattern for data access."
        });
      }
    }

    return findings;
  }

  /**
   * Rule SEC-002: Potential Command Injection (Heuristic)
   *
   * Detection Logic (Pattern-Based):
   * 1. Find all calls to command execution methods:
   *    - Runtime.exec (scopeName contains "Runtime")
   *    - ProcessBuilder methods (callee or scope contains "ProcessBuilder")
   * 2. Check if:
   *    - Called from Controller class (direct exposure)
   *    - Called from public/exported methods (potential exposure)
   * 3. Check for string concatenation/variables - increases confidence
   * 4. Check if method has parameters - increases confidence
   *
   * Rationale:
   * Executing system commands is inherently risky, especially when:
   * - Exposed via web endpoints (Controller)
   * - Accessible to external callers
   * - Could receive untrusted input
   *
   * Heuristic: This is a PATTERN-BASED check, not definitive proof.
   * May flag:
   * - Safe command execution with hardcoded commands (false positive)
   * - Internal admin tools with proper validation (false positive)
   *
   * Will NOT detect:
   * - Command injection via indirect paths (requires taint analysis)
   * - Commands built in other methods
   * - Complex injection patterns
   *
   * Confidence: 70-90% depending on signals (concat, parameters, etc.)
   */
  private detectCommandInjection(store: GraphStore): Finding[] {
    const findings: Finding[] = [];

    // Command execution patterns
    const isCommandExecution = (call: any): boolean => {
      // Runtime.exec() pattern (scopeName could be "runtime", "Runtime", or contain "Runtime")
      if (call.calleeName === "exec") {
        // Check if it's likely Runtime.exec() (common pattern in command injection)
        // scopeName could be: "runtime", "Runtime.getRuntime()", "Runtime", etc.
        const scope = call.scopeName?.toLowerCase() || "";
        if (scope.includes("runtime") || !call.scopeName) {
          // exec() is dangerous regardless, but especially from Runtime
          return true;
        }
      }

      // ProcessBuilder patterns
      if (call.calleeName === "ProcessBuilder") {
        return true;
      }

      // ProcessBuilder.start() - scopeName could be variable name like "pb", "builder", etc.
      // Heuristic: start() method is commonly used with ProcessBuilder
      if (call.calleeName === "start") {
        // Could be ProcessBuilder.start() or Process.start()
        // This is a heuristic - start() is common in command execution
        return true;
      }

      return false;
    };

    for (const call of store.calls) {
      if (!isCommandExecution(call)) continue;

      const caller = store.getFunctionById(call.callerId);
      if (!caller) continue;

      // Check if in Controller class
      if (caller.className) {
        const classInfo = store.classes.find(c => c.className === caller.className);

        if (classInfo) {
          const isController =
            classInfo.stereotype === "Controller" ||
            classInfo.stereotype === "RestController";

          if (isController) {
            // Check for string concatenation extracted from the AST parser.
            const concats = store.getStringConcatsInFunction(call.callerId);
            const hasCommandConcat = concats.some(c => c.inCommandContext);

            // Check for concat method calls (Phase 4 method)
            const callsInFunction = store.getCallsInFunction(call.callerId);
            const hasMethodConcat = callsInFunction.some(c =>
              c.calleeName === "concat" || c.calleeName === "append" || c.calleeName === "format"
            );

            // Check if method has parameters (increases risk)
            const hasParameters = caller.name.includes("(") && !caller.name.includes("()");

            // Calculate confidence based on signals
            let confidence = 75; // base confidence for Controller
            let message = "Controller class executes system commands. This creates command injection risk if user input is involved.";

            if (hasCommandConcat && hasParameters) {
              confidence = 95; // AST detected + operator in command + parameters
              message = "Controller executes command with '+' operator concatenation and parameters. Very high command injection risk.";
            } else if (hasCommandConcat) {
              confidence = 90; // AST detected + operator in command
              message = "Controller executes command with '+' operator concatenation. Very high risk of command injection.";
            } else if (hasMethodConcat && hasParameters) {
              confidence = 90;
              message = "Controller method executes system command with string concatenation and parameters. Very high command injection risk.";
            } else if (hasMethodConcat) {
              confidence = 85;
              message = "Controller executes system command with string concatenation. High risk of command injection.";
            } else if (hasParameters) {
              confidence = 80;
              message = "Controller method with parameters executes system commands. Risk of command injection if parameters reach the command.";
            }

            // Command execution in Controller - critical risk
            findings.push({
              id: `SEC-002-${call.file}-${call.line}`,
              category: "security",
              severity: "critical",
              ruleId: "SEC-002",
              ruleName: "Potential Command Injection (Heuristic)",
              message,
              repo: call.repo,
              file: call.file,
              line: call.line,
              functionId: call.callerId,
              className: caller.className,
              confidence,
              cwe: ["CWE-78"],
              remediation: "Avoid executing system commands from web endpoints. If required, validate/sanitize all inputs and use allowlists for commands."
            });
            continue;
          }
        }
      }

      // Additional heuristic: Exported/public methods executing commands
      if (caller.exported) {
        findings.push({
          id: `SEC-002-${call.file}-${call.line}`,
          category: "security",
          severity: "high",
          ruleId: "SEC-002",
          ruleName: "Potential Command Injection (Heuristic)",
          message: "Public method executes system commands. Verify that no untrusted input reaches this execution.",
          repo: call.repo,
          file: call.file,
          line: call.line,
          functionId: call.callerId,
          className: caller.className,
          confidence: 65,
          cwe: ["CWE-78"],
          remediation: "If user input is involved, validate/sanitize rigorously. Consider safer alternatives to command execution."
        });
      }
    }

    return findings;
  }
}
