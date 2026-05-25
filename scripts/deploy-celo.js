/**
 * deploy-celo.js
 * ─────────────────────────────────────────────────────────────────
 * Deploys OsherMonitor.sol to Celo Mainnet.
 * Run: npx hardhat run scripts/deploy-celo.js --network celo
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers } = require("hardhat");

// ── Token addresses on Celo Mainnet (from your keys.js) ──────────
const CELO_TOKENS = {
  USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  USDT: "0x617f3112bf5397D0467D315cC709EF968D9ba546",
  USDm: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
  CELO: "0x471EcE3750Da237f93B8E339c536989b8978a438",
};

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n════════════════════════════════════════════════");
  console.log("  OsherMonitor — Celo Mainnet Deployment");
  console.log("════════════════════════════════════════════════");
  console.log("Deployer:      ", deployer.address);
  console.log("Balance:       ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "CELO");
  console.log("Network:        Celo Mainnet (chainId 42220)");
  console.log("");

  // ── Constructor arguments ─────────────────────────────────────
  const owner         = deployer.address;         // Change to multisig later
  const feeBps        = 50;                        // 0.5% — matches SERVICE_FEE_PERCENT
  const tokenAddrs    = Object.values(CELO_TOKENS);
  const tokenSymbols  = Object.keys(CELO_TOKENS);

  console.log("Constructor args:");
  console.log("  owner:      ", owner);
  console.log("  feeBps:     ", feeBps, "(0.5%)");
  console.log("  tokens:     ", tokenSymbols.join(", "));
  console.log("");

  // ── Deploy ────────────────────────────────────────────────────
  console.log("Deploying OsherMonitor...");
  const OsherMonitor = await ethers.getContractFactory("OsherMonitor");
  const contract = await OsherMonitor.deploy(
    owner,
    feeBps,
    tokenAddrs,
    tokenSymbols
  );

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\n✅ OsherMonitor deployed!");
  console.log("   Contract address: ", address);
  console.log("   Celoscan:         ", `https://celoscan.io/address/${address}`);
  console.log("");

  // ── Verify deployment ─────────────────────────────────────────
  console.log("Verifying deployment...");
  const stats = await contract.getStats();
  console.log("  Owner:            ", stats.currentOwner);
  console.log("  Fee BPS:          ", stats.currentFeeBps.toString());
  console.log("  Paused:           ", stats.isPaused);
  console.log("  Total TXs:        ", stats.txCount.toString());
  console.log("");

  for (const [symbol, addr] of Object.entries(CELO_TOKENS)) {
    const supported = await contract.isTokenSupported(addr);
    console.log(`  Token ${symbol} (${addr.slice(0,8)}...): ${supported ? "✅ supported" : "❌ NOT supported"}`);
  }

  // ── Save deployment info ──────────────────────────────────────
  const deploymentInfo = {
    network:       "celo-mainnet",
    chainId:       42220,
    contractAddress: address,
    deployer:      deployer.address,
    feeBps:        feeBps,
    tokens:        CELO_TOKENS,
    deployedAt:    new Date().toISOString(),
    celoscan:      `https://celoscan.io/address/${address}`,
  };

  const fs = require("fs");
  fs.writeFileSync(
    "./deployments/celo-mainnet.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n📄 Deployment info saved to: ./deployments/celo-mainnet.json");
  console.log("\n════════════════════════════════════════════════");
  console.log("  NEXT STEPS:");
  console.log("════════════════════════════════════════════════");
  console.log("1. Copy the contract address to your .env:");
  console.log(`   OSHER_MONITOR_CELO=${address}`);
  console.log("");
  console.log("2. Verify on Celoscan:");
  console.log("   npx hardhat verify --network celo", address, `"${owner}"`, feeBps, `"[${tokenAddrs}]"`, `"[${tokenSymbols}]"`);
  console.log("");
  console.log("3. Update orchestrator.js to call recordTransfer()");
  console.log("   (the integration patch is in scripts/orchestrator-patch.js)");
  console.log("════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Deployment failed:", err.message);
    process.exit(1);
  });
