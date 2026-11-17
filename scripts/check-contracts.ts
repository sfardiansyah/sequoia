import { $ } from "bun";

const root = new URL("..", import.meta.url).pathname;
const contracts = new URL("../contracts", import.meta.url).pathname;

const normalizedLock =
  /^"aiken-lang\/fuzz@v3" = \[\{ TIMESTAMP \}, "[0-9a-f]+"\]$/;

/**
 * `aiken check` refreshes the fuzz etag timestamp in `aiken.lock` on every run.
 * A check that only sees that timestamp must not leave the worktree dirty; a
 * dependency change must still fail the check.
 */
export function isTimestampOnlyLockDiff(diff: string): boolean {
  const changed = diff
    .split("\n")
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line))
    .map((line) =>
      line
        .slice(1)
        .trim()
        .replace(
          /secs_since_epoch = \d+, nanos_since_epoch = \d+/,
          "TIMESTAMP",
        ),
    );
  const unique = new Set(changed);
  if (unique.size !== 1) return false;
  return normalizedLock.test([...unique][0]!);
}

function printResult(
  label: string,
  result: { stdout: Uint8Array; stderr: Uint8Array },
): void {
  process.stderr.write(`${label} failed\n`);
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
}

function checkSummary(stdout: string, stderr: string): string {
  const summary = stderr
    .split("\n")
    .find((line) => line.trim().startsWith("Summary "));
  if (summary) return summary.trim();

  try {
    const report = JSON.parse(stdout) as {
      summary?: { total: number; passed: number; failed: number };
    };
    if (report.summary) {
      return `aiken check: ${report.summary.passed}/${report.summary.total} tests passed`;
    }
  } catch {
    // A TTY prints a human report instead of JSON.
  }
  return "aiken check passed";
}

async function restoreLockTimestamp(): Promise<void> {
  const diff = await $`git diff -- contracts/aiken.lock`
    .cwd(root)
    .quiet()
    .nothrow();
  if (diff.exitCode !== 0) return;
  if (!isTimestampOnlyLockDiff(diff.stdout.toString())) return;

  const restore = await $`git checkout -- contracts/aiken.lock`
    .cwd(root)
    .quiet()
    .nothrow();
  if (restore.exitCode === 0) {
    console.log("restored timestamp-only contracts/aiken.lock churn");
  }
}

async function runChecks(): Promise<number> {
  const fmt = await $`aiken fmt --check`.cwd(contracts).quiet().nothrow();
  if (fmt.exitCode !== 0) {
    printResult("aiken fmt --check", fmt);
    return 1;
  }

  const check = await $`aiken check`.cwd(contracts).quiet().nothrow();
  if (check.exitCode !== 0) {
    printResult("aiken check", check);
    return 1;
  }
  console.log(checkSummary(check.stdout.toString(), check.stderr.toString()));

  const build = await $`aiken build`.cwd(contracts).quiet().nothrow();
  if (build.exitCode !== 0) {
    printResult("aiken build", build);
    return 1;
  }

  const blueprint = await $`git diff --exit-code -- contracts/plutus.json`
    .cwd(root)
    .quiet()
    .nothrow();
  if (blueprint.exitCode !== 0) {
    printResult("contracts/plutus.json is not committed", blueprint);
    return 1;
  }

  return 0;
}

if (import.meta.main) {
  let exitCode = 1;
  try {
    exitCode = await runChecks();
  } finally {
    await restoreLockTimestamp();
  }
  process.exit(exitCode);
}
