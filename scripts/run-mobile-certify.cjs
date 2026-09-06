const { spawnSync } = require("node:child_process");
const path = require("node:path");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const repoRoot = path.resolve(__dirname, "..");
const mobileRoot = path.join(repoRoot, "mobile");

const steps = [
  {
    name: "Mobile TypeScript",
    command: npmCommand,
    args: ["run", "mobile:check"],
    cwd: repoRoot,
  },
  {
    name: "Web/root TypeScript",
    command: npmCommand,
    args: ["exec", "--", "tsc", "--noEmit"],
    cwd: repoRoot,
  },
  {
    name: "Desktop Bridge Rust",
    command: npmCommand,
    args: ["run", "desktop:bridge:check"],
    cwd: repoRoot,
  },
  {
    name: "Expo public config",
    command: npmCommand,
    args: ["exec", "--", "expo", "config", "--type", "public"],
    cwd: mobileRoot,
  },
];

const results = [];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===\n`);
  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    shell: false,
    cwd: step.cwd,
  });

  if (result.error) {
    console.error(`\n${step.name} could not start: ${result.error.message}`);
    results.push({ name: step.name, passed: false });
    continue;
  }

  results.push({ name: step.name, passed: result.status === 0 });
}

console.log("\n=== Certification summary ===\n");
for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.name}`);
}

const failures = results.filter((result) => !result.passed);
if (failures.length === 0) {
  console.log("\nAll mobile certification phases passed.");
  process.exit(0);
}

console.error(`\nFailed phases (${failures.length}):`);
for (const failure of failures) {
  console.error(`- ${failure.name}`);
}
console.error("\nFix the failures above, then rerun the same command.");
process.exit(1);
