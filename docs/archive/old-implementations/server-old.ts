#!/usr/bin/env node

/**
 * MCP Server for Java Code Intelligence Analyzer
 *
 * This is a thin wrapper that exposes the existing analyzer via MCP protocol.
 * It does NOT modify the analyzer core - just orchestrates temporary config
 * and calls existing functions.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to parent project (the analyzer)
const PROJECT_ROOT = path.resolve(__dirname, "..");
const REPOS_JSON = path.join(PROJECT_ROOT, "repos.json");
const REPOS_BACKUP = path.join(PROJECT_ROOT, "repos.json.backup");

/**
 * Debug logging to stderr (MCP requires stdout to be clean for protocol)
 */
function debug(message: string, ...args: any[]): void {
  console.error(`[MCP] ${message}`, ...args);
}

/**
 * Normalize path to use forward slashes (for cross-platform compatibility)
 * Windows paths like C:\foo\bar become C:/foo/bar
 * Already-normalized paths are unchanged
 */
function normalizePath(filepath: string): string {
  // Replace backslashes with forward slashes
  let normalized = filepath.replace(/\\/g, "/");

  // Handle Windows drive letters: C:/ should stay C:/ not c:/
  // But allow existing lowercase drive letters to pass through

  debug(`Path normalized: ${filepath} -> ${normalized}`);
  return normalized;
}

/**
 * Validate that a repository path exists and looks like a Java project
 */
async function validateRepoRoot(repoRoot: string): Promise<string> {
  const exists = await fs.pathExists(repoRoot);
  if (!exists) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Repository path does not exist: ${repoRoot}`
    );
  }

  const stats = await fs.stat(repoRoot);
  if (!stats.isDirectory()) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Repository path is not a directory: ${repoRoot}`
    );
  }

  // Check for Java source files (src/main/java or src/)
  const hasSrcMainJava = await fs.pathExists(path.join(repoRoot, "src", "main", "java"));
  const hasSrc = await fs.pathExists(path.join(repoRoot, "src"));

  if (!hasSrcMainJava && !hasSrc) {
    debug(`Warning: No src/main/java or src/ directory found in ${repoRoot}`);
    debug(`Will attempt analysis anyway, but may find no Java files`);
  }

  // Return normalized path for use in config
  return normalizePath(repoRoot);
}

/**
 * Save the current repos.json (if it exists) to backup location
 *
 * Returns: true if original existed and was backed up, false otherwise
 * Throws: If backup operation fails (e.g., permission denied)
 */
async function backupReposJson(): Promise<boolean> {
  try {
    if (await fs.pathExists(REPOS_JSON)) {
      await fs.copy(REPOS_JSON, REPOS_BACKUP, { overwrite: true });
      debug(`Backed up existing repos.json to repos.json.backup`);
      return true;
    }
    debug(`No existing repos.json to backup`);
    return false;
  } catch (error: any) {
    debug(`ERROR: Failed to backup repos.json: ${error.message}`);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to backup configuration: ${error.message}`
    );
  }
}

/**
 * Restore the original repos.json from backup
 *
 * This function is CRITICAL for cleanup and runs in the finally block.
 * It must handle all errors gracefully and never throw.
 *
 * @param hadOriginal - Whether an original repos.json existed before analysis
 *
 * Behavior:
 * - If hadOriginal=true: Restore from backup, then delete backup
 * - If hadOriginal=false: Delete the temporary repos.json we created
 * - Always cleans up backup file if it exists
 * - Logs errors but never throws (to avoid masking original errors)
 */
async function restoreReposJson(hadOriginal: boolean): Promise<void> {
  try {
    if (hadOriginal) {
      // Original existed - restore it
      if (await fs.pathExists(REPOS_BACKUP)) {
        await fs.copy(REPOS_BACKUP, REPOS_JSON, { overwrite: true });
        debug(`Restored original repos.json from backup`);

        // Clean up backup file
        await fs.remove(REPOS_BACKUP);
        debug(`Removed backup file`);
      } else {
        debug(`WARNING: Expected backup file not found at ${REPOS_BACKUP}`);
        // Don't throw - this is cleanup, we want to be resilient
      }
    } else {
      // No original existed - remove the temp one we created
      if (await fs.pathExists(REPOS_JSON)) {
        await fs.remove(REPOS_JSON);
        debug(`Removed temporary repos.json`);
      }

      // Also clean up backup if it somehow exists
      if (await fs.pathExists(REPOS_BACKUP)) {
        await fs.remove(REPOS_BACKUP);
        debug(`Cleaned up unexpected backup file`);
      }
    }
  } catch (error: any) {
    // CRITICAL: Never throw in restore - log error but continue
    // This prevents masking the original error if analysis failed
    debug(`ERROR during restore (non-fatal): ${error.message}`);
    debug(`repos.json may not be properly restored - manual cleanup may be needed`);
    // Don't throw - we're in a finally block or error recovery
  }
}

/**
 * Write temporary repos.json with MCP-provided configuration
 *
 * Creates a single-repo configuration for the analyzer to use.
 *
 * @param normalizedPath - Path already normalized to forward slashes
 * @param repoName - Optional repository name (defaults to directory basename)
 *
 * Output format:
 * [
 *   {
 *     "name": "my-project",
 *     "path": "C:/path/to/project",  // Always forward slashes
 *     "language": "java",
 *     "type": "backend"
 *   }
 * ]
 *
 * Throws: If write fails (e.g., permission denied, disk full)
 */
async function writeTempReposJson(
  normalizedPath: string,
  repoName?: string
): Promise<void> {
  // Use provided name or extract from path
  const name = repoName || path.basename(normalizedPath) || "target-repo";

  const config = [
    {
      name: name,
      path: normalizedPath,
      language: "java",
      type: "backend"
    }
  ];

  try {
    await fs.writeJson(REPOS_JSON, config, { spaces: 2 });
    debug(`Wrote temporary repos.json:`);
    debug(`  - name: ${config[0].name}`);
    debug(`  - path: ${config[0].path}`);
  } catch (error: any) {
    debug(`ERROR: Failed to write temporary repos.json: ${error.message}`);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to write temporary configuration: ${error.message}`
    );
  }
}

/**
 * Run the analyzer's index command
 *
 * Assumption: The parent project has "npm run index" script that calls indexAllRepos()
 */
async function runIndexCommand(): Promise<void> {
  debug(`Running index command...`);

  try {
    const { stdout, stderr } = await execAsync("npm run index", {
      cwd: PROJECT_ROOT,
      env: { ...process.env }
    });

    // Log output to stderr for debugging
    if (stderr) {
      debug(`Index stderr: ${stderr}`);
    }
    debug(`Index completed successfully`);
  } catch (error: any) {
    debug(`Index command failed: ${error.message}`);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to index repository: ${error.message}`
    );
  }
}

/**
 * Run the analyzer's analyze command
 *
 * Assumption: The parent project has "npm run analyze" script that calls runAnalyze()
 */
async function runAnalyzeCommand(
  mode: "all" | "bugs" | "security" = "all"
): Promise<void> {
  debug(`Running analyze command with mode: ${mode}`);

  let analyzeArgs = "npm run analyze";
  if (mode === "bugs") {
    analyzeArgs += " -- --bugs-only";
  } else if (mode === "security") {
    analyzeArgs += " -- --security-only";
  }

  try {
    const { stdout, stderr } = await execAsync(analyzeArgs, {
      cwd: PROJECT_ROOT,
      env: { ...process.env }
    });

    // Log output to stderr for debugging
    if (stderr) {
      debug(`Analyze stderr: ${stderr}`);
    }
    debug(`Analyze completed successfully`);
  } catch (error: any) {
    debug(`Analyze command failed: ${error.message}`);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to analyze repository: ${error.message}`
    );
  }
}

/**
 * Read findings JSON from analyzer output
 *
 * This is a helper function used by analyze_repo tool.
 * For reading findings without running analysis, use readFindingsTool().
 *
 * Assumption: Analyzer writes findings to data/findings/*.json
 */
async function readFindings(
  mode: "all" | "bugs" | "security" = "all"
): Promise<any> {
  const findingsMap = {
    all: "all.json",
    bugs: "bugs.json",
    security: "security.json"
  };

  const filename = findingsMap[mode];
  const findingsPath = path.join(PROJECT_ROOT, "data", "findings", filename);

  debug(`Reading findings from: ${findingsPath}`);

  if (!await fs.pathExists(findingsPath)) {
    throw new McpError(
      ErrorCode.InternalError,
      `Findings file not found: ${findingsPath}. Analysis may have failed.`
    );
  }

  const findings = await fs.readJson(findingsPath);
  debug(`Read ${findings.findings?.length || 0} findings`);

  return findings;
}

/**
 * Tool: read_findings
 *
 * Read existing findings JSON without running analysis.
 * Useful for retrieving previous analysis results.
 *
 * @param params.repoRoot - Optional: Not used (findings are in project directory)
 * @param params.file - Which findings file to read (default: "all.json")
 *
 * Returns: Parsed JSON from findings file
 *
 * Use cases:
 * - Retrieve results from previous analysis
 * - Get specific category (bugs or security only)
 * - Check current findings status
 */
async function readFindingsTool(params: {
  repoRoot?: string;
  file?: "all.json" | "bugs.json" | "security.json";
}): Promise<any> {
  const { file = "all.json" } = params;

  debug(`=== Starting read_findings ===`);
  debug(`File requested: ${file}`);

  // Note: repoRoot is accepted for consistency but not used
  // Findings are always in PROJECT_ROOT/data/findings/
  if (params.repoRoot) {
    debug(`Note: repoRoot parameter ignored (findings are in project directory)`);
  }

  const findingsPath = path.join(PROJECT_ROOT, "data", "findings", file);

  debug(`Reading from: ${findingsPath}`);

  // Check if file exists
  if (!await fs.pathExists(findingsPath)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Findings file not found: ${file}. Run analyze_repo first to generate findings.`
    );
  }

  try {
    const findings = await fs.readJson(findingsPath);
    debug(`Successfully read findings: ${findings.findings?.length || 0} total`);

    return {
      success: true,
      file: file,
      findings: findings
    };

  } catch (error: any) {
    debug(`ERROR: Failed to read findings: ${error.message}`);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to read findings file: ${error.message}`
    );
  }
}

/**
 * Tool: get_project_context
 *
 * Read PROJECT_CONTEXT.md from the parent analyzer project.
 * Provides comprehensive documentation about the analyzer architecture,
 * design decisions, detection rules, and capabilities.
 *
 * @param params.repoRoot - Optional: Not used (reads from analyzer project)
 *
 * Returns: Content of PROJECT_CONTEXT.md as string
 *
 * Use cases:
 * - Understand analyzer architecture
 * - Learn about detection rules
 * - Check capabilities and limitations
 * - Review design decisions
 */
async function getProjectContextTool(params: {
  repoRoot?: string;
}): Promise<any> {
  debug(`=== Starting get_project_context ===`);

  // Note: repoRoot is accepted for consistency but not used
  // PROJECT_CONTEXT.md is in the analyzer project root
  if (params.repoRoot) {
    debug(`Note: repoRoot parameter ignored (reading from analyzer project)`);
  }

  const contextPath = path.join(PROJECT_ROOT, "PROJECT_CONTEXT.md");

  debug(`Reading from: ${contextPath}`);

  // Check if file exists
  if (!await fs.pathExists(contextPath)) {
    throw new McpError(
      ErrorCode.InternalError,
      `PROJECT_CONTEXT.md not found at: ${contextPath}`
    );
  }

  try {
    const content = await fs.readFile(contextPath, "utf-8");
    debug(`Successfully read PROJECT_CONTEXT.md (${content.length} bytes)`);

    return {
      success: true,
      file: "PROJECT_CONTEXT.md",
      path: contextPath,
      content: content,
      size: content.length
    };

  } catch (error: any) {
    debug(`ERROR: Failed to read PROJECT_CONTEXT.md: ${error.message}`);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to read PROJECT_CONTEXT.md: ${error.message}`
    );
  }
}

/**
 * Main tool implementation: analyze_repo
 *
 * Orchestrates temporary configuration and analysis execution.
 *
 * CRITICAL GUARANTEE: Original repos.json is ALWAYS restored, even on failure.
 *
 * Flow:
 * 1. Validate & normalize input path
 * 2. Backup original repos.json (if exists)
 * 3. Write temporary repos.json with normalized path
 * 4. Run index command (parses Java files)
 * 5. Run analyze command (detects bugs/security issues)
 * 6. Read findings from output JSON
 * 7. Restore original repos.json (in finally block - always runs)
 *
 * Error Handling:
 * - Validation errors → InvalidParams (user error)
 * - Analyzer errors → InternalError (system error)
 * - Restore errors → Logged but not thrown (cleanup is best-effort)
 *
 * @param params - Tool input parameters
 * @returns Success result with findings, or throws McpError
 */
async function analyzeRepo(params: {
  repoRoot: string;
  mode?: "all" | "bugs" | "security";
  repoName?: string;
}): Promise<any> {
  const { repoRoot, mode = "all", repoName } = params;

  debug(`=== Starting analyze_repo ===`);
  debug(`Input repoRoot: ${repoRoot}`);
  debug(`Input mode: ${mode}`);
  debug(`Input repoName: ${repoName || "(auto-detect)"}`);

  // Track if we had an original repos.json (for restore logic)
  let hadOriginal = false;

  // Track normalized path (for temp config)
  let normalizedPath: string;

  try {
    // Step 1: Validate input and normalize path
    // validateRepoRoot returns normalized path (forward slashes)
    normalizedPath = await validateRepoRoot(repoRoot);
    debug(`Normalized path: ${normalizedPath}`);

    // Step 2: Backup original repos.json
    // Returns true if original existed, false otherwise
    hadOriginal = await backupReposJson();

    // Step 3: Write temporary repos.json
    // Uses normalized path with forward slashes
    await writeTempReposJson(normalizedPath, repoName);

    // Step 4: Run index
    // Analyzer reads temporary repos.json and parses Java files
    await runIndexCommand();

    // Step 5: Run analyze
    // Analyzer runs detection rules and writes findings
    await runAnalyzeCommand(mode);

    // Step 6: Read findings
    // Read JSON output from analyzer
    const findings = await readFindings(mode);

    debug(`=== Analysis completed successfully ===`);
    debug(`Found ${findings.findings?.length || 0} total findings`);

    return {
      success: true,
      findings
    };

  } catch (error: any) {
    debug(`=== Analysis failed: ${error.message} ===`);
    debug(`Error type: ${error.constructor.name}`);

    // Re-throw McpError as-is (already has proper error code)
    if (error instanceof McpError) {
      throw error;
    }

    // Wrap other errors in InternalError
    throw new McpError(
      ErrorCode.InternalError,
      `Analysis failed: ${error.message}`
    );

  } finally {
    // Step 7: ALWAYS restore original repos.json
    // This runs even if analysis succeeded OR failed
    // This runs even if we're about to throw an error
    debug(`=== Cleanup: Restoring configuration ===`);
    await restoreReposJson(hadOriginal);
    debug(`=== Cleanup complete ===`);
  }
}

/**
 * Initialize and start MCP server
 */
async function main(): Promise<void> {
  debug(`Java Code Intelligence MCP Server starting...`);
  debug(`Project root: ${PROJECT_ROOT}`);

  const server = new Server(
    {
      name: "java-code-intel",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    debug(`Received ListTools request`);
    return {
      tools: [
        {
          name: "analyze_repo",
          description: "Analyze a Java repository for bugs and security vulnerabilities. Returns findings with severity levels, confidence scores, and remediation advice.",
          inputSchema: {
            type: "object",
            properties: {
              repoRoot: {
                type: "string",
                description: "Absolute path to the Java repository root directory (should contain src/ or src/main/java/)"
              },
              mode: {
                type: "string",
                enum: ["all", "bugs", "security"],
                description: "Analysis mode: 'all' (default) runs both bug and security detection, 'bugs' runs only bug detection, 'security' runs only security detection",
                default: "all"
              },
              repoName: {
                type: "string",
                description: "Optional repository name (defaults to directory name)"
              }
            },
            required: ["repoRoot"]
          }
        },
        {
          name: "read_findings",
          description: "Read existing findings JSON from previous analysis without re-running analysis. Returns parsed findings with summary and detailed issues.",
          inputSchema: {
            type: "object",
            properties: {
              repoRoot: {
                type: "string",
                description: "Optional: Not used (findings are read from analyzer project directory)"
              },
              file: {
                type: "string",
                enum: ["all.json", "bugs.json", "security.json"],
                description: "Which findings file to read: 'all.json' (default - all findings), 'bugs.json' (bug findings only), 'security.json' (security findings only)",
                default: "all.json"
              }
            },
            required: []
          }
        },
        {
          name: "get_project_context",
          description: "Read PROJECT_CONTEXT.md from the analyzer project. Provides comprehensive documentation about analyzer architecture, detection rules, design decisions, capabilities, and limitations.",
          inputSchema: {
            type: "object",
            properties: {
              repoRoot: {
                type: "string",
                description: "Optional: Not used (reads from analyzer project)"
              }
            },
            required: []
          }
        }
      ]
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    debug(`Received CallTool request: ${request.params.name}`);

    try {
      let result: any;

      // Route to appropriate tool handler
      switch (request.params.name) {
        case "analyze_repo":
          result = await analyzeRepo(request.params.arguments as any);
          break;

        case "read_findings":
          result = await readFindingsTool(request.params.arguments as any);
          break;

        case "get_project_context":
          result = await getProjectContextTool(request.params.arguments as any);
          break;

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }

      // Return result
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };

    } catch (error: any) {
      debug(`Tool execution failed: ${error.message}`);

      // Re-throw McpError as-is
      if (error instanceof McpError) {
        throw error;
      }

      // Wrap other errors
      throw new McpError(
        ErrorCode.InternalError,
        error.message || "Unknown error occurred"
      );
    }
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  debug(`MCP Server connected and ready`);
}

// Start the server
main().catch((error) => {
  debug(`Fatal error: ${error.message}`);
  process.exit(1);
});
