const { ethers } = require("hardhat");

async function main() {
  const owner  = "0xDe25bf927C839355C66ee3551dAE8A143bF85F9a"; // ← replace this
  const feeBps = 50;
  const tokens = [
    "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e",
    "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    "0x471EcE3750Da237f93B8E339c536989b8978a438"
  ];
  const symbols = ["USDC", "USDT", "USDm", "CELO"];

  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint16", "address[]", "string[]"],
    [owner, feeBps, tokens, symbols]
  );

  console.log("\nConstructor args (paste into Celoscan):");
  console.log(encoded.slice(2));
}

main().catch(console.error);
