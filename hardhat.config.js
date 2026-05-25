require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * hardhat.config.js
 * ─────────────────────────────────────────────────────────────────
 * Hardhat configuration for Celo mainnet deployment.
 *
 * Required .env variables (add to your Render environment OR .env):
 *   DEPLOYER_PRIVATE_KEY   — wallet that pays for deployment gas
 *   CELOSCAN_API_KEY       — from https://celoscan.io/myapikey (for verification)
 * ─────────────────────────────────────────────────────────────────
 */

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.AGENT_PRIVATE_KEY;

if (!DEPLOYER_KEY) {
  console.warn("[Hardhat] WARNING: No DEPLOYER_PRIVATE_KEY set. Deployment will fail.");
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,     // Optimise for deployment cost (not runtime)
      },
    },
  },

  networks: {
    // ── Celo Mainnet ─────────────────────────────────────────────
    celo: {
      url:      "https://forno.celo.org",
      chainId:  42220,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      gasPrice: "auto",
    },

    // ── Celo Alfajores Testnet (for testing before mainnet) ──────
    alfajores: {
      url:      "https://alfajores-forno.celo-testnet.org",
      chainId:  44787,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      gasPrice: "auto",
    },

    // ── Local hardhat node (for unit tests) ──────────────────────
    hardhat: {
      chainId: 31337,
    },
  },

  // ── Contract verification on Celoscan ────────────────────────
  etherscan: {
    // Etherscan v2 format — single apiKey value
    apiKey: process.env.CELOSCAN_API_KEY || "",
    customChains: [
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL:      "https://api.celoscan.io/api",
          browserURL:  "https://celoscan.io",
        },
      },
      {
        network: "alfajores",
        chainId: 44787,
        urls: {
          apiURL:      "https://api-alfajores.celoscan.io/api",
          browserURL:  "https://alfajores.celoscan.io",
        },
      },
    ],
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};
