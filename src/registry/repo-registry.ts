import fs from "fs-extra";
import path from "path";
import { RepoConfig } from "../core/types";

export async function loadRepoConfigs(configPath = "repos.json"): Promise<RepoConfig[]> {
  const fullPath = path.resolve(configPath);
  const exists = await fs.pathExists(fullPath);

  if (!exists) {
    throw new Error(`repos.json not found at ${fullPath}`);
  }

  return (await fs.readJson(fullPath)) as RepoConfig[];
}
