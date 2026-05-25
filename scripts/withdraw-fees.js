/**
 * withdraw-fees.js
 * ─────────────────────────────────────────────────────────────────
 * Utility script to withdraw accumulated fees from both contracts.
 *
 * Celo:   npx hardhat run scripts/withdraw-fees.js --network celo
 * Solana: node scripts/withdraw-fees.js --solana
 * ─────────────────────────────────────────────────────────────────
 */

const { ethers } = require("hardhat");
const fs         = require("fs");

// Token addresses on Celo Mainnet
const CELO_TOKENS = {
  USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  USDT: "0x617f3112bf5397D0467D315cC709EF968D9ba546",
  USDm: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
  CELO: "0x471EcE3750Da237f93B8E339c536989b8978a438",
};

const OSHER_MONITOR_ABI = [
  "function withdrawAllFees(address[] tokens, address to) external",
  "function getCollectedFee(address token) view returns (uint256)",
  "function getStats() view returns (uint128, uint128, uint16, bool, address, address)",
  "function owner() view returns (address)",
];

async function main() {
  const [signer] = await ethers.getSigners();

  const deployPath = "./deployments/celo-mainnet.json";
  if (!fs.existsSync(deployPath)) {
    console.error("❌ No deployment found. Run deploy-celo.js first.");
    process.exit(1);
  }

  const { contractAddress } = JSON.parse(fs.readFileSync(deployPath, "utf-8"));
  const monitor = new ethers.Contract(contractAddress, OSHER_MONITOR_ABI, signer);

  console.log("\n════════════════════════════════════════════════");
  console.log("  OsherMonitor Fee Withdrawal — Celo Mainnet");
  console.log("════════════════════════════════════════════════");

  // Check balances
  let hasAnyFees = false;
  for (const [symbol, addr] of Object.entries(CELO_TOKENS)) {
    const balance = await monitor.getCollectedFee(addr);
    const formatted = ethers.formatUnits(balance, 6);
    console.log(`  ${symbol}: ${formatted}`);
    if (balance > 0n) hasAnyFees = true;
  }

  if (!hasAnyFees) {
    console.log("\n  No fees to withdraw yet.");
    return;
  }

  // Withdraw all
  const recipient = signer.address; // Change to your treasury wallet
  console.log(`\nWithdrawing all fees to: ${recipient}`);

  const tx = await monitor.withdrawAllFees(Object.values(CELO_TOKENS), recipient);
  await tx.wait();
  console.log(`\n✅ Fees withdrawn. Tx: ${tx.hash}`);
  console.log(`   Celoscan: https://celoscan.io/tx/${tx.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
