import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const [operation, requestedPath, confirmation] = process.argv.slice(2);
if (
  !operation ||
  !requestedPath ||
  !["backup", "verify", "restore"].includes(operation)
) {
  console.error(
    "Usage: node scripts/postgres-backup.mjs <backup|verify|restore> <file> [--confirm-restore]",
  );
  process.exit(2);
}

const file = resolve(requestedPath);
const databaseUser = process.env.POSTGRES_USER || "flowforge";
const databaseName = process.env.POSTGRES_DB || "flowforge";

function runDocker(args, input, output) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      "docker",
      ["compose", "exec", "-T", "postgres", ...args],
      {
        stdio: [
          input ? "pipe" : "ignore",
          output ? "pipe" : "inherit",
          "inherit",
        ],
      },
    );
    if (input) input.pipe(child.stdin);
    if (output) child.stdout.pipe(output);
    child.once("error", rejectRun);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : rejectRun(new Error(`Database command exited with code ${code}`)),
    );
  });
}

if (operation === "backup") {
  await mkdir(dirname(file), { recursive: true });
  const output = createWriteStream(file, { flags: "wx", mode: 0o600 });
  await runDocker(
    ["pg_dump", "-U", databaseUser, "-d", databaseName, "--format=custom"],
    undefined,
    output,
  );
  console.log(`Backup created: ${file}`);
} else if (operation === "verify") {
  if (!existsSync(file)) throw new Error(`Backup does not exist: ${file}`);
  await runDocker(["pg_restore", "--list"], createReadStream(file));
  console.log(`Backup verified: ${file}`);
} else {
  if (confirmation !== "--confirm-restore")
    throw new Error("Restore requires the explicit --confirm-restore flag");
  if (!existsSync(file)) throw new Error(`Backup does not exist: ${file}`);
  await runDocker(
    [
      "pg_restore",
      "-U",
      databaseUser,
      "-d",
      databaseName,
      "--clean",
      "--if-exists",
      "--no-owner",
    ],
    createReadStream(file),
  );
  console.log(`Backup restored: ${file}`);
}
