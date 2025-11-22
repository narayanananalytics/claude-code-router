import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { readFileSync } from "fs";

const execPromise = promisify(exec);

// Whitelist allowed package name
const ALLOWED_PACKAGE = "@musistudio/claude-code-router";

/**
 * Validates package name format to prevent injection
 */
function validatePackageName(packageName: string): boolean {
  // Only allow scoped packages with specific format
  return /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(packageName);
}

/**
 * 检查是否有新版本可用
 * @param currentVersion 当前版本
 * @returns 包含更新信息的对象
 */
export async function checkForUpdates(currentVersion: string) {
  try {
    const packageName = ALLOWED_PACKAGE;

    // Validate package name format
    if (!validatePackageName(packageName)) {
      throw new Error('Invalid package name format');
    }

    // Use npm programmatically with properly quoted package name
    const { stdout } = await execPromise(
      `npm view ${JSON.stringify(packageName)} version`,
      {
        timeout: 10000,
        env: { ...process.env, NO_UPDATE_NOTIFIER: 'true' }
      }
    );

    const latestVersion = stdout.trim();

    // 比较版本
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    // 如果有更新，获取更新日志
    let changelog = "";

    return { hasUpdate, latestVersion, changelog };
  } catch (error) {
    console.error("Error checking for updates:", error);
    // 如果检查失败，假设没有更新
    return { hasUpdate: false, latestVersion: currentVersion, changelog: "" };
  }
}

/**
 * 执行更新操作
 * @returns 更新结果
 */
export async function performUpdate() {
  try {
    const packageName = ALLOWED_PACKAGE;

    // Validate package name
    if (!validatePackageName(packageName)) {
      throw new Error('Invalid package name');
    }

    // 执行npm update命令 with properly quoted package name
    const { stdout, stderr } = await execPromise(
      `npm update -g ${JSON.stringify(packageName)}`,
      {
        timeout: 60000,
        env: { ...process.env, NO_UPDATE_NOTIFIER: 'true' }
      }
    );

    if (stderr && !stderr.includes('npm WARN')) {
      console.error("Update stderr:", stderr);
    }

    console.log("Update stdout:", stdout);

    return {
      success: true,
      message: "Update completed successfully. Please restart the application to apply changes."
    };
  } catch (error) {
    console.error("Error performing update:", error);
    return {
      success: false,
      message: `Failed to perform update: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 比较两个版本号
 * @param v1 版本号1
 * @param v2 版本号2
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = i < parts1.length ? parts1[i] : 0;
    const num2 = i < parts2.length ? parts2[i] : 0;
    
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  
  return 0;
}