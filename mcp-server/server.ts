#!/usr/bin/env node

/**
 * MCP Server for Java Code Intelligence Analyzer
 *
 * Thin wrapper exposing the analyzer via MCP protocol.
 * Handles temporary configuration, executes analysis, and cleans up.
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

// Paths
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const REPOS_JSON = path.join(PROJECT_ROOT, "repos.json");
const REPOS_BACKUP = path.join(PROJECT_ROOT, "repos.json.backup");
const DATA_FINDINGS_DIR = path.join(PROJECT_ROOT, "data", "findings");
const PROJECT_CONTEXT_PATH = path.join(PROJECT_ROOT, "PROJECT_CONTEXT.md");

/**
 * Debug logging to stderr (stdout reserved for MCP protocol)
 */
function debug(message: string): void {
  console.error(`[MCP] ${message}`);
}

/**
 * Normalize path to forward slashes for cross-platform compatibility
 */
function normalizePath(filepath: string): string {
  return filepath.replace(/\\/g, "/");
}

/**
 * Validate repository path exists and is a directory
 * Returns normalized path
 */
async function validateRepoRoot(repoRoot: string): Promise<string> {
  // Check path is not attempting traversal
  const resolvedPath = path.resolve(repoRoot);
  if (!resolvedPath.startsWith(path.resolve("/"))) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid repository path"
    );
  }

  if (!await fs.pathExists(resolvedPath)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Repository path does not exist: ${repoRoot}`
    );
  }

  const stats = await fs.stat(resolvedPath);
  if (!stats.isDirectory()) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Path is not a directory: ${repoRoot}`
    );
  }

  return normalizePath(resolvedPath);
}

/**
 * Backup repos.json if it exists
 * Returns true if backup was created
 */
async function backupReposJson(): Promise<boolean> {
  if (await fs.pathExists(REPOS_JSON)) {
    await fs.copy(REPOS_JSON, REPOS_BACKUP, { overwrite: true });
    debug("Backed up repos.json");
    return true;
  }
  return false;
}

/**
 * Restore repos.json from backup or remove temporary config
 * Never throws - logs errors instead to avoid masking original errors
 */
async function restoreReposJson(hadOriginal: boolean): Promise<void> {
  try {
    if (hadOriginal) {
      if (await fs.pathExists(REPOS_BACKUP)) {
        await fs.copy(REPOS_BACKUP, REPOS_JSON, { overwrite: true });
        await fs.remove(REPOS_BACKUP);
        debug("Restored repos.json");
      } else {
        debug("WARNING: Backup file missing");
      }
    } else {
      // No original - clean up temp files
      await fs.remove(REPOS_JSON);
      await fs.remove(REPOS_BACKUP); // In case it exists
      debug("Removed temporary repos.json");
    }
  } catch (error: any) {
    // Never throw in cleanup - just log
    debug(`Cleanup error (non-fatal): ${error.message}`);
  }
}

/**
 * Write temporary repos.json with normalized path
 */
async function writeTempReposJson(
  normalizedPath: string,
  repoName?: string
): Promise<void> {
  const config = [{
    name: repoName || path.basename(normalizedPath) || "target-repo",
    path: normalizedPath,
    language: "java",
    type: "backend"
  }];

  await fs.writeJson(REPOS_JSON, config, { spaces: 2 });
  debug(`Wrote temporary repos.json for: ${config[0].name}`);
}

/**
 * Run analyzer index command
 */
async function runIndexCommand(): Promise<void> {
  debug("Running index command...");

  try {
    await execAsync("npm run index", {
      cwd: PROJECT_ROOT,
      env: { ...process.env }
    });
    debug("Index completed");
  } catch (error: any) {
    throw new McpError(
      ErrorCode.InternalError,
      `Index failed: ${error.message}`
    );
  }
}

/**
 * Run analyzer analyze command with mode
 */
async function runAnalyzeCommand(
  mode: "all" | "bugs" | "security"
): Promise<void> {
  debug(`Running analyze (${mode})...`);

  const modeFlags: Record<string, string> = {
    bugs: " -- --bugs-only",
    security: " -- --security-only",
    all: ""
  };

  try {
    await execAsync(`npm run analyze${modeFlags[mode]}`, {
      cwd: PROJECT_ROOT,
      env: { ...process.env }
    });
    debug("Analyze completed");
  } catch (error: any) {
    throw new McpError(
      ErrorCode.InternalError,
      `Analysis failed: ${error.message}`
    );
  }
}

/**
 * Read findings JSON from output directory
 */
async function readFindingsFile(
  filename: "all.json" | "bugs.json" | "security.json"
): Promise<any> {
  const findingsPath = path.join(DATA_FINDINGS_DIR, filename);

  if (!await fs.pathExists(findingsPath)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Findings file not found: ${filename}. Run analyze_repo first.`
    );
  }

  return await fs.readJson(findingsPath);
}

/**
 * Tool: analyze_repo
 * Run full analysis with temporary configuration
 */
async function analyzeRepo(params: {
  repoRoot: string;
  mode?: "all" | "bugs" | "security";
  repoName?: string;
}): Promise<any> {
  const { repoRoot, mode = "all", repoName } = params;

  debug("=== analyze_repo ===");

  let hadOriginal = false;
  let normalizedPath: string;

  try {
    // Validate and normalize
    normalizedPath = await validateRepoRoot(repoRoot);

    // Backup, write temp config, run analysis
    hadOriginal = await backupReposJson();
    await writeTempReposJson(normalizedPath, repoName);
    await runIndexCommand();
    await runAnalyzeCommand(mode);

    // Read results
    const findings = await readFindingsFile(
      mode === "bugs" ? "bugs.json" :
      mode === "security" ? "security.json" :
      "all.json"
    );

    debug(`Analysis complete: ${findings.findings?.length || 0} findings`);

    return {
      success: true,
      findings
    };

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Analysis failed: ${error.message}`
    );

  } finally {
    // Always restore configuration
    debug("=== Cleanup ===");
    await restoreReposJson(hadOriginal);
  }
}

/**
 * Tool: read_findings
 * Read existing findings without running analysis
 */
async function readFindings(params: {
  repoRoot?: string;
  file?: "all.json" | "bugs.json" | "security.json";
}): Promise<any> {
  const { file = "all.json" } = params;

  debug(`read_findings: ${file}`);

  const findings = await readFindingsFile(file);

  return {
    success: true,
    file,
    findings
  };
}

/**
 * Tool: get_project_context
 * Read PROJECT_CONTEXT.md documentation
 */
async function getProjectContext(): Promise<any> {
  debug("get_project_context");

  if (!await fs.pathExists(PROJECT_CONTEXT_PATH)) {
    throw new McpError(
      ErrorCode.InternalError,
      "PROJECT_CONTEXT.md not found"
    );
  }

  const content = await fs.readFile(PROJECT_CONTEXT_PATH, "utf-8");

  return {
    success: true,
    file: "PROJECT_CONTEXT.md",
    path: PROJECT_CONTEXT_PATH,
    content,
    size: content.length
  };
}

/**
 * Initialize and start MCP server
 */
async function main(): Promise<void> {
  debug("MCP Server starting...");

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

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "analyze_repo",
          description: "Analyze Java repository for bugs and security vulnerabilities",
          inputSchema: {
            type: "object",
            properties: {
              repoRoot: {
                type: "string",
                description: "Absolute path to Java repository root"
              },
              mode: {
                type: "string",
                enum: ["all", "bugs", "security"],
                description: "Analysis mode (default: all)",
                default: "all"
              },
              repoName: {
                type: "string",
                description: "Optional repository name"
              }
            },
            required: ["repoRoot"]
          }
        },
        {
          name: "read_findings",
          description: "Read existing findings from previous analysis",
          inputSchema: {
            type: "object",
            properties: {
              repoRoot: {
                type: "string",
                description: "Optional (not used)"
              },
              file: {
                type: "string",
                enum: ["all.json", "bugs.json", "security.json"],
                description: "Findings file to read (default: all.json)",
                default: "all.json"
              }
            },
            required: []
          }
        },
        {
          name: "get_project_context",
          description: "Read PROJECT_CONTEXT.md documentation",
          inputSchema: {
            type: "object",
            properties: {
              repoRoot: {
                type: "string",
                description: "Optional (not used)"
              }
            },
            required: []
          }
        }
      ]
    };
  });

  // Execute tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      let result: any;

      switch (request.params.name) {
        case "analyze_repo":
          result = await analyzeRepo(request.params.arguments as any);
          break;

        case "read_findings":
          result = await readFindings(request.params.arguments as any);
          break;

        case "get_project_context":
          result = await getProjectContext();
          break;

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };

    } catch (error: any) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        error.message || "Unknown error"
      );
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  debug("MCP Server ready");
}

// Start server
main().catch((error) => {
  console.error(`[MCP] Fatal error: ${error.message}`);
  process.exit(1);
});
