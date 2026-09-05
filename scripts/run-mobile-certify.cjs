const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const steps = [
  {
    name: "Mobile TypeScript",
    command: npmCommand,
    args: ["run", "mobile:check"],
  },
  {
    name: "Web/root TypeScript",
    command: npmCommand,
    args: ["exec", "--", "tsc", "--noEmit"],
  },
  {
    name: "Desktop Bridge Rust",
    command: npmCommand,
    args: ["run", "desktop:bridge:check"],
  },
  {
    name: "Expo public config",
    command: npmCommand,
    args: ["--prefix", "mobile", "exec", "--", "expo", "config", "--type", "public"],
  },
];

const failures = [];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===\n`);
  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(`\n${step.name} could not start: ${result.error.message}`);
    failures.push(step.name);
    continue;
  }

  if (result.status !== 0) {
    failures.push(step.name);
  }
}

console.log("\n=== Certification summary ===\n");

if (failures.length === 0) {
  console.log("All mobile certification phases passed.");
  process.exit(0);
}

console.error(`Failed phases (${failures.length}):`);
for (const failure of failures) {
  console.error(`- ${failure}`);
}
console.error("\nFix the failures above, then rerun the same command.");
process.exit(1);
