import { spawn } from "node:child_process";
import net from "node:net";

const serverPort = await findOpenPort(7871);
const clientPort = await findOpenPort(4187);
const apiTarget = `http://localhost:${serverPort}`;
const clientUrl = `http://localhost:${clientPort}`;

const commonEnv = {
  ...process.env,
  FORCE_COLOR: "1",
};

const server = spawnPnpm(["--filter", "@hushline/server", "dev"], {
  cwd: process.cwd(),
  env: {
    ...commonEnv,
    PORT: String(serverPort),
  },
  stdio: "inherit",
});

const client = spawnPnpm(["--filter", "@hushline/client", "dev"], {
  cwd: process.cwd(),
  env: {
    ...commonEnv,
    CLIENT_PORT: String(clientPort),
    HUSHLINE_API_TARGET: apiTarget,
  },
  stdio: "inherit",
});

console.log(`Hushline Chat client: ${clientUrl}`);
console.log(`Hushline Chat API:    ${apiTarget}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
    client.kill(signal);
    process.exit(0);
  });
}

server.on("exit", (code) => {
  if (code && code !== 0) {
    client.kill();
    process.exit(code);
  }
});

client.on("exit", (code) => {
  if (code && code !== 0) {
    server.kill();
    process.exit(code);
  }
});

function findOpenPort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const tester = net.createServer();
      tester.once("error", (error) => {
        if (error.code === "EADDRINUSE" || error.code === "EACCES") {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });
      tester.once("listening", () => {
        tester.close(() => resolve(port));
      });
      tester.listen(port, "0.0.0.0");
    };

    tryPort(start);
  });
}

function spawnPnpm(args, options) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", ["corepack", "pnpm", ...args].join(" ")], options);
  }

  return spawn("corepack", ["pnpm", ...args], options);
}
