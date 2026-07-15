/**
 * deploy-savings-vault.js
 * ─────────────────────────────────────────────────────────────────
 * Deploys OsherSavingsVault.sol to Celo.
 *
 * Run:
 *   npx hardhat run scripts/deploy-savings-vault.js --network alfajores
 *   npx hardhat run scripts/deploy-savings-vault.js --network celo
 *
 * Optional env:
 *   VAULT_SAVINGS_TOKEN  - ERC-20 token address. Defaults to Celo USDT.
 *   VAULT_AGENT_ADDRESS  - backend/agent wallet allowed to call autoSweep.
 *                          Defaults to deployer for test deployments.
 * ─────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const CELO_MAINNET_USDT = "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e";

async function waitForReadableContract(vault, attempts = 12) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return {
        owner: await vault.owner(),
        agent: await vault.agent(),
        savingsToken: await vault.savingsToken(),
      };
    } catch (err) {
      lastError = err;
      console.log(`Waiting for RPC to index contract reads... (${attempt}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw lastError;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const savingsToken = process.env.VAULT_SAVINGS_TOKEN || CELO_MAINNET_USDT;
  const agent = process.env.VAULT_AGENT_ADDRESS || deployer.address;

  console.log("\n════════════════════════════════════════════════");
  console.log("  OsherSavingsVault — Deployment");
  console.log("════════════════════════════════════════════════");
  console.log("Network:       ", network.name);
  console.log("Deployer:      ", deployer.address);
  console.log("Balance:       ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "CELO");
  console.log("Savings token: ", savingsToken);
  console.log("Agent:         ", agent);
  console.log("");

  const Vault = await ethers.getContractFactory("OsherSavingsVault");
  const vault = await Vault.deploy(savingsToken, agent);
  await vault.waitForDeployment();
  const deployTx = vault.deploymentTransaction();
  if (deployTx) {
    await deployTx.wait(3);
  }

  const address = await vault.getAddress();
  const deployed = await waitForReadableContract(vault);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const explorerBase = chainId === 42220
    ? "https://celoscan.io/address"
    : "https://alfajores.celoscan.io/address";

  console.log("OsherSavingsVault deployed.");
  console.log("Contract:      ", address);
  console.log("Explorer:      ", `${explorerBase}/${address}`);

  const deploymentInfo = {
    contract: "OsherSavingsVault",
    network: network.name,
    chainId,
    contractAddress: address,
    deployer: deployer.address,
    owner: deployed.owner,
    agent: deployed.agent,
    savingsToken: deployed.savingsToken,
    deployedAt: new Date().toISOString(),
    explorer: `${explorerBase}/${address}`,
  };

  const deploymentDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });
  const deploymentPath = path.join(deploymentDir, `${network.name}-savings-vault.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\nDeployment info saved to:", deploymentPath);
  console.log("\nNext env values:");
  console.log(`OSHER_SAVINGS_VAULT=${address}`);
  console.log(`VAULT_SAVINGS_TOKEN=${savingsToken}`);
  console.log(`VAULT_AGENT_ADDRESS=${agent}`);
  console.log("════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nDeployment failed:", err);
    process.exit(1);
  });
