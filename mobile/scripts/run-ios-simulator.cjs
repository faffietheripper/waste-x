const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MOBILE_ROOT = path.resolve(__dirname, "..");
const WORKSPACE = path.join(MOBILE_ROOT, "ios", "WasteX.xcworkspace");
const DERIVED_DATA = path.join(MOBILE_ROOT, ".ios-build");
const APP_PATH = path.join(
  DERIVED_DATA,
  "Build",
  "Products",
  "Debug-iphonesimulator",
  "WasteX.app",
);
const BUNDLE_ID = "com.wastex.mobile";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: MOBILE_ROOT,
    stdio: "inherit",
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: MOBILE_ROOT,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function metroIsReady() {
  return new Promise((resolve) => {
    const request = http.get("http://127.0.0.1:8081/status", (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve(response.statusCode === 200 && body.includes("packager-status:running"));
      });
    });

    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function selectSimulator() {
  const raw = capture("xcrun", ["simctl", "list", "devices", "available", "-j"]);
  const parsed = JSON.parse(raw);
  const allDevices = Object.values(parsed.devices ?? {}).flat();
  const iphones = allDevices.filter(
    (device) => typeof device?.name === "string" && device.name.startsWith("iPhone"),
  );

  const booted = iphones.find((device) => device.state === "Booted");
  if (booted) return booted;

  const preferred =
    iphones.find((device) => device.name === "iPhone 16 Pro") ?? iphones[0];

  if (!preferred) {
    console.error("No available iPhone Simulator was found in Xcode.");
    process.exit(1);
  }

  console.log(`Booting ${preferred.name}…`);
  run("xcrun", ["simctl", "boot", preferred.udid], { allowFailure: true });
  run("open", ["-a", "Simulator"]);
  run("xcrun", ["simctl", "bootstatus", preferred.udid, "-b"]);
  return preferred;
}

async function main() {
  if (!fs.existsSync(WORKSPACE)) {
    console.error(
      "Waste X iOS workspace is missing. Run `cd mobile && npx expo prebuild --clean` first.",
    );
    process.exit(1);
  }

  if (!(await metroIsReady())) {
    console.error("\nWaste X Metro is not running on http://localhost:8081.");
    console.error("Start it in another terminal with: npm run mobile:start\n");
    process.exit(1);
  }

  const simulator = selectSimulator();
  console.log(`Using ${simulator.name} (${simulator.udid})`);
  console.log("Building Waste X with Xcode…");

  run("xcodebuild", [
    "-workspace",
    WORKSPACE,
    "-scheme",
    "WasteX",
    "-configuration",
    "Debug",
    "-destination",
    `id=${simulator.udid}`,
    "-derivedDataPath",
    DERIVED_DATA,
    "build",
  ]);

  if (!fs.existsSync(APP_PATH)) {
    console.error(`Expected built app was not found at ${APP_PATH}`);
    process.exit(1);
  }

  console.log("Installing Waste X…");
  run("xcrun", ["simctl", "install", simulator.udid, APP_PATH]);

  console.log("Launching Waste X directly…");
  run("xcrun", [
    "simctl",
    "launch",
    "--terminate-running-process",
    simulator.udid,
    BUNDLE_ID,
  ]);

  console.log("\nWaste X launched successfully. Metro remains on http://localhost:8081.\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
