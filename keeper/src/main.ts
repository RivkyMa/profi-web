import { connect } from "./chain";
import { parseConfig } from "./config";
import { tick, type Logger } from "./tick";

const log: Logger = (level, message, fields = {}) => {
  const line = JSON.stringify(
    { ts: new Date().toISOString(), level, message, ...fields },
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
  );
  (level === "error" ? console.error : console.log)(line);
};

function loadEnvFile() {
  // Variables already in the environment win over the file.
  try {
    process.loadEnvFile(new URL("../.env", import.meta.url));
  } catch {
    // No .env file: the environment alone must be complete.
  }
}

async function main() {
  loadEnvFile();
  const once = process.argv.includes("--once");
  const config = parseConfig(process.env);
  const clients = await connect(config);

  log("info", "keeper started", {
    chainId: clients.chain.id,
    sender: clients.sender,
    factory: config.factory,
    vault: config.vault,
    dryRun: config.dryRun,
    mode: once ? "once" : `every ${config.pollIntervalMs} ms`,
  });

  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      stopping = true;
      log("info", `received ${signal}, stopping after the current pass`);
    });
  }

  let failedPasses = 0;
  do {
    try {
      const report = await tick(clients, config, log);
      failedPasses = report.failed > 0 ? failedPasses + 1 : 0;
      log("info", "pass complete", { ...report });
    } catch (error) {
      failedPasses++;
      log("error", "pass failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (once || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  } while (!stopping);

  // A single pass that could not do its job should not look like success.
  if (once && failedPasses > 0) process.exitCode = 1;
}

main().catch((error) => {
  log("error", "keeper could not start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
