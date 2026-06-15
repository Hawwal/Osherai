/**
 * Verifies OsherSavingsVault on Celoscan.
 *
 * Required env:
 *   CELOSCAN_API_KEY
 *
 * Run:
 *   npx hardhat run scripts/verify-savings-vault.js --network celo
 */

const fs = require("fs");
const path = require("path");
const { run } = require("hardhat");

const deploymentPath = path.join(__dirname, "..", "deployments", "celo-savings-vault.json");

if (!fs.existsSync(deploymentPath)) {
  console.error("deployments/celo-savings-vault.json not found.");
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

async function main() {
  const address = deployment.contractAddress;
  const savingsToken = deployment.savingsToken;
  const agent = deployment.agent;

  if (!address || !savingsToken || !agent) {
    throw new Error("Deployment file must include contractAddress, savingsToken, and agent.");
  }

  console.log("\nOsherSavingsVault — Celoscan Verification");
  console.log("Contract:     ", address);
  console.log("Savings token:", savingsToken);
  console.log("Agent:        ", agent);

  try {
    await run("verify:verify", {
      address,
      constructorArguments: [savingsToken, agent],
    });
    console.log(`\nVerified: https://celoscan.io/address/${address}#code`);
  } catch (err) {
    if (String(err.message || err).includes("Already Verified")) {
      console.log(`\nAlready verified: https://celoscan.io/address/${address}#code`);
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("\nVerification failed:", err.message || err);
  process.exit(1);
});
