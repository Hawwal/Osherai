/**
 * Prints public evidence links from the local Osher deployment config.
 */

const fs = require("fs");
const path = require("path");

const deploymentPath = path.join(__dirname, "..", "deployments", "celo-savings-vault.json");

if (!fs.existsSync(deploymentPath)) {
  console.error("Missing deployments/celo-savings-vault.json");
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
const address = deployment.contractAddress;
const token = deployment.savingsToken;
const agent = deployment.agent;

if (!address) {
  console.error("Deployment file does not include contractAddress.");
  process.exit(1);
}

console.log("Osher AI Mainnet Evidence");
console.log("========================");
console.log(`Network:          ${deployment.network || "celo"} (${deployment.chainId || 42220})`);
console.log(`Savings vault:    ${address}`);
console.log(`Vault code:       https://celoscan.io/address/${address}#code`);
console.log(`Vault txs:        https://celoscan.io/address/${address}#transactions`);
console.log(`Vault events:     https://celoscan.io/address/${address}#events`);
console.log(`Savings token:    ${token || ""}`);
console.log(`Agent:            ${agent || ""}`);
console.log("Developer API:    https://osherai.onrender.com/api/infra/v1/openapi.json");
console.log("Developer docs:   https://osherai.onrender.com/docs.html");
console.log("Demo app:         https://osherai.onrender.com");
