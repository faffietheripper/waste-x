const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
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
const METRO_URL = "http://127.0.0.1:8081";
const DEV_CLIENT_URL = `wastex://expo-development-client/?url=${encodeURIComponent(METRO_URL)}`;
const METRO_LOG = path.join(os.tmpdir(), "waste-x-mobile-metro.log");

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function metroStatus(hostname) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname,
        port: 8081,
        path: "/status",
        family: hostname === "127.0.0.1" ? 4 : 6,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve(
            response.statusCode === 200 && body.includes("packager-status:running"),
          );
        });
      },
    );

    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function metroIsReady() {
  return metroStatus("127.0.0.1");
}

function realPath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function findIpv4MetroOwner() {
  const pidResult = spawnSync(
    "lsof",
    ["-tiTCP:8081", "-sTCP:LISTEN"],
    { cwd: MOBILE_ROOT, encoding: "utf8" },
  );
  const pid = String(pidResult.stdout || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  if (!pid) return null;

  const cwdResult = spawnSync(
    "lsof",
    ["-a", "-p", pid, "-d", "cwd", "-Fn"],
    { cwd: MOBILE_ROOT, encoding: "utf8" },
  );
  const cwd = String(cwdResult.stdout || "")
    .split(/\r?\n/)
    .find((value) => value.startsWith("n"))
    ?.slice(1)
    .trim();

  const commandResult = spawnSync(
    "ps",
    ["-p", pid, "-o", "command="],
    { cwd: MOBILE_ROOT, encoding: "utf8" },
  );
  const command = String(commandResult.stdout || "").trim();

  return { pid, cwd: cwd || null, command: command || null };
}

function assertMetroBelongsToThisCheckout() {
  const owner = findIpv4MetroOwner();
  if (!owner) {
    console.error(
      "Metro answered on 127.0.0.1:8081, but Waste X could not identify the process that owns the port.",
    );
    printPortOwner();
    process.exit(1);
  }

  if (!owner.cwd || realPath(owner.cwd) !== realPath(MOBILE_ROOT)) {
    console.error("\nA Metro server from a different checkout is already using 127.0.0.1:8081.");
    console.error(`Existing Metro pid: ${owner.pid}`);
    if (owner.cwd) console.error(`Existing Metro root: ${owner.cwd}`);
    if (owner.command) console.error(`Existing Metro command: ${owner.command}`);
    console.error(`This Waste X Mobile root: ${MOBILE_ROOT}`);
    console.error(
      `\nStop the existing Metro process (for example: kill ${owner.pid}) and run Waste X Mobile again.`,
    );
    console.error(
      "Waste X will not reuse a Metro bundle from another checkout because that can launch stale JavaScript.\n",
    );
    process.exit(1);
  }

  console.log(`Waste X Metro is already running from this checkout on ${METRO_URL}.`);
}

function printMetroLog() {
  console.error(`\nMetro log: ${METRO_LOG}`);
  try {
    const contents = fs.readFileSync(METRO_LOG, "utf8").trim();
    if (!contents) {
      console.error("Metro exited without writing a log.");
      return;
    }
    const lines = contents.split(/\r?\n/);
    console.error("\n--- Metro log (last 80 lines) ---");
    console.error(lines.slice(-80).join("\n"));
    console.error("--- end Metro log ---\n");
  } catch (error) {
    console.error(
      `Could not read Metro log: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function printPortOwner() {
  const result = spawnSync(
    "lsof",
    ["-nP", "-iTCP:8081", "-sTCP:LISTEN"],
    { cwd: MOBILE_ROOT, encoding: "utf8" },
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (output) {
    console.error("\nPort 8081 listeners:");
    console.error(output);
    console.error("");
  }
}

async function ensureMetro() {
  if (await metroIsReady()) {
    assertMetroBelongsToThisCheckout();
    return;
  }

  const ipv6Metro = await metroStatus("::1");
  if (ipv6Metro) {
    console.log(
      "A Metro server is already bound to IPv6 localhost (::1:8081), but the iOS simulator needs IPv4 127.0.0.1:8081.",
    );
    console.log("Starting a Waste X IPv4 Metro listener alongside it…");
  }

  const expoBin = path.join(MOBILE_ROOT, "node_modules", ".bin", "expo");
  if (!fs.existsSync(expoBin)) {
    console.error("Waste X Mobile dependencies are not installed.");
    console.error("Run `npm run mobile:install` from the Waste X repo root.");
    process.exit(1);
  }

  console.log(`Waste X Metro is not running on IPv4. Starting it on ${METRO_URL}…`);
  fs.writeFileSync(METRO_LOG, "", "utf8");
  const logFd = fs.openSync(METRO_LOG, "a");

  // `--localhost` resolves to ::1 first on some recent macOS versions. The
  // simulator bundle URL is 127.0.0.1, so bind Metro to the IPv4/LAN listener
  // instead and explicitly advertise 127.0.0.1 to React Native.
  const metro = spawn(
    expoBin,
    ["start", "--dev-client", "--lan", "--port", "8081"],
    {
      cwd: MOBILE_ROOT,
      env: {
        ...process.env,
        CI: "1",
        REACT_NATIVE_PACKAGER_HOSTNAME: "127.0.0.1",
      },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  );

  fs.closeSync(logFd);
  metro.unref();

  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await metroIsReady()) {
      console.log(`Waste X Metro is ready on ${METRO_URL} (pid ${metro.pid}).`);
      return;
    }

    try {
      process.kill(metro.pid, 0);
    } catch {
      console.error("Waste X Metro exited before becoming ready.");
      printMetroLog();
      printPortOwner();
      process.exit(1);
    }

    await sleep(500);
  }

  console.error("Waste X Metro did not become ready within 45 seconds.");
  printMetroLog();
  printPortOwner();
  process.exit(1);
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
    console.error("Waste X iOS workspace is missing.");
    console.error(
      "Do not clean/rebuild the simulator state. Restore/generate the native workspace only if it is genuinely absent.",
    );
    process.exit(1);
  }

  await ensureMetro();

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

  // A direct native launch can otherwise reopen expo-dev-client's historical
  // "most recent" bundle. Explicitly route this freshly installed build to
  // the IPv4 Metro instance that this script has just verified.
  await sleep(500);
  console.log(`Connecting Waste X development client to ${METRO_URL}…`);
  run("xcrun", ["simctl", "openurl", simulator.udid, DEV_CLIENT_URL]);

  console.log(`\nWaste X launched successfully. Metro is available on ${METRO_URL}.\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printMetroLog();
  printPortOwner();
  process.exit(1);
});
