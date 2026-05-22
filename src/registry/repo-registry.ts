import fs from "fs-extra";
import path from "path";
import { RepoConfig } from "../core/types";

export async function inferRepoConfig(
  repoRoot = process.env.INIT_CWD || process.cwd(),
  repoName?: string
): Promise<RepoConfig> {
  const resolvedPath = path.resolve(repoRoot);
  const exists = await fs.pathExists(resolvedPath);

  if (!exists) {
    throw new Error(`Repository path not found at ${resolvedPath}`);
  }

  const stats = await fs.stat(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error(`Repository path is not a directory: ${resolvedPath}`);
  }

  return {
    name: repoName || path.basename(resolvedPath) || "current-repo",
    path: resolvedPath,
    language: "java",
    type: "backend",
    provider: "local"
  };
}
