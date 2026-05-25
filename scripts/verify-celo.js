/**
 * verify-celo.js
 * ─────────────────────────────────────────────────────────────────
 * Verifies OsherMonitor on Celoscan.
 * Run: npx hardhat run scripts/verify-celo.js --network celo
 * ─────────────────────────────────────────────────────────────────
 */

const { run } = require("hardhat");
const fs      = require("fs");
const path    = require("path");

// ── Load deployed contract address ───────────────────────────────
const deployPath = path.join(__dirname, "../deployments/celo-mainnet.json");
if (!fs.existsSync(deployPath)) {
  console.error("❌ deployments/celo-mainnet.json not found.");
  console.error("   Run deploy-celo.js first.");
  process.exit(1);
}
const deployment = JSON.parse(fs.readFileSync(deployPath, "utf-8"));

async function main() {
  const contractAddress = deployment.contractAddress;
  const owner           = deployment.deployer;

  // ── Must match EXACTLY what was passed to the constructor ──────
  const feeBps       = 50;
  const tokenAddrs   = [
    "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",  // USDC
    "0x617f3112bf5397D0467D315cC709EF968D9ba546",  // USDT
    "0x765DE816845861e75A25fCA122bb6898B8B1282a",  // USDm
    "0x471EcE3750Da237f93B8E339c536989b8978a438",  // CELO
  ];
  const tokenSymbols = ["USDC", "USDT", "USDm", "CELO"];

  console.log("\n════════════════════════════════════════════════");
  console.log("  OsherMonitor — Celoscan Verification");
  console.log("════════════════════════════════════════════════");
  console.log("Contract: ", contractAddress);
  console.log("Owner:    ", owner);
  console.log("Fee BPS:  ", feeBps);
  console.log("Tokens:   ", tokenSymbols.join(", "));
  console.log("");

  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: [
        owner,
        feeBps,
        tokenAddrs,
        tokenSymbols,
      ],
    });

    console.log("\n✅ Contract verified successfully!");
    console.log(`   https://celoscan.io/address/${contractAddress}#code`);

  } catch (err) {
    if (err.message.includes("Already Verified")) {
      console.log("\n✅ Contract is already verified on Celoscan.");
      console.log(`   https://celoscan.io/address/${contractAddress}#code`);
    } else {
      console.error("\n❌ Verification failed:", err.message);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
