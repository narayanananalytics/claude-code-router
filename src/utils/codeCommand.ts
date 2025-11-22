import { spawn, type StdioOptions } from "child_process";
import { readConfigFile } from ".";
import { closeService } from "./close";
import {
  decrementReferenceCount,
  incrementReferenceCount,
} from "./processCheck";
import { quote } from 'shell-quote';
import minimist from "minimist";
import { createEnvVariables } from "./createEnvVariables";
import { resolve } from "path";
import { access, constants } from "fs/promises";

/**
 * Validates that the CLAUDE_PATH is safe to execute
 * @param claudePath - The path to validate
 * @returns true if valid, false otherwise
 */
async function validateClaudePath(claudePath: string): Promise<boolean> {
  try {
    const resolvedPath = resolve(claudePath);

    // Check if file exists
    await access(resolvedPath);

    // On Unix, check if it's executable
    if (process.platform !== 'win32') {
      try {
        await access(resolvedPath, constants.X_OK);
      } catch {
        console.error(`File ${resolvedPath} is not executable`);
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables using shared function
  const config = await readConfigFile();
  const env = await createEnvVariables();
  const settingsFlag = {
    env
  };
  if (config?.StatusLine?.enabled) {
    settingsFlag.statusLine = {
      type: "command",
      command: "ccr statusline",
      padding: 0,
    }
  }
  args.push('--settings', `${JSON.stringify(settingsFlag)}`);

  // Non-interactive mode for automation environments
  if (config.NON_INTERACTIVE_MODE) {
    env.CI = "true";
    env.FORCE_COLOR = "0";
    env.NODE_NO_READLINE = "1";
    env.TERM = "dumb";
  }

  // Set ANTHROPIC_SMALL_FAST_MODEL if it exists in config
  if (config?.ANTHROPIC_SMALL_FAST_MODEL) {
    env.ANTHROPIC_SMALL_FAST_MODEL = config.ANTHROPIC_SMALL_FAST_MODEL;
  }

  // Increment reference count when command starts
  incrementReferenceCount();

  // Execute claude command
  const claudePath = config?.CLAUDE_PATH || process.env.CLAUDE_PATH || "claude";

  // Validate claude path if it's not the default "claude" command
  if (claudePath !== "claude") {
    const isValidPath = await validateClaudePath(claudePath);
    if (!isValidPath) {
      console.error(`Invalid CLAUDE_PATH: ${claudePath}`);
      decrementReferenceCount();
      process.exit(1);
    }
  }

  const stdioConfig: StdioOptions = config.NON_INTERACTIVE_MODE
    ? ["pipe", "inherit", "inherit"] // Pipe stdin for non-interactive
    : "inherit"; // Default inherited behavior

  const argsObj = minimist(args);
  const argsArr = [];

  for (const [argsObjKey, argsObjValue] of Object.entries(argsObj)) {
    if (argsObjKey !== '_' && argsObj[argsObjKey]) {
      const prefix = argsObjKey.length === 1 ? '-' : '--';
      // For boolean flags, don't append the value
      if (argsObjValue === true) {
        argsArr.push(`${prefix}${argsObjKey}`);
      } else {
        // Push flag and value as separate arguments (no shell needed)
        argsArr.push(`${prefix}${argsObjKey}`);
        argsArr.push(String(argsObjValue));
      }
    }
  }

  // Don't use shell:true - pass arguments as array for security
  const claudeProcess = spawn(
    claudePath,
    argsArr,
    {
      env: { ...process.env, ...env },
      stdio: stdioConfig,
      shell: false,  // IMPORTANT: Don't use shell to prevent injection
    }
  );

  // Close stdin for non-interactive mode
  if (config.NON_INTERACTIVE_MODE) {
    claudeProcess.stdin?.end();
  }

  claudeProcess.on("error", (error) => {
    console.error("Failed to start claude command:", error.message);
    console.log(
      "Make sure Claude Code is installed: npm install -g @anthropic-ai/claude-code"
    );
    decrementReferenceCount();
    process.exit(1);
  });

  claudeProcess.on("close", (code) => {
    decrementReferenceCount();
    closeService();
    process.exit(code || 0);
  });
}
