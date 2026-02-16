/**
 * wormhole.js — uses dynamic import() for ESM-only SDK
 */
const { ethers } = require("ethers");
const config     = require("../../config/keys");

const WORMHOLE_CHAIN_NAMES = {
  celo: "Celo", solana: "Solana", ethereum: "Ethereum",
  base: "Base", polygon: "Polygon", arbitrum: "Arbitrum",
  optimism: "Optimism", bnb: "Bsc",
};

const WORMHOLE_TOKEN_BRIDGES = {
  celo:     "0x796Dff6D74F3E27060B71255fe517bFb23C93eed",
  ethereum: "0x3ee18B2214AFF97000D974cf647E7C347E8fa585",
  base:     "0x8d2de8d2f73F1F4cAB472AC9A881C9b123C79627",
  polygon:  "0x5a58505a96D1dbf8dF91cB21B54419FC36e93fdE",
  arbitrum: "0x0b2402144Bb366A632D14B83F244D2e0e21bD39c",
};

async function executeWormholeTransfer({ wallet, intent, bridgeQuote, amountUnits, tokenAddress }) {
  const fromChain     = intent.fromChain || "celo";
  const srcChainName  = WORMHOLE_CHAIN_NAMES[fromChain];
  const destChainName = WORMHOLE_CHAIN_NAMES[intent.toChain];

  if (!srcChainName)  throw new Error(`Unsupported source chain: ${fromChain}`);
  if (!destChainName) throw new Error(`Unsupported destination chain: ${intent.toChain}`);

  console.log(`[Wormhole] ${intent.amount} ${intent.token}: ${srcChainName} -> ${destChainName}`);

  // Step 1: Pre-approve Wormhole Token Bridge
  const tokenBridgeAddr = WORMHOLE_TOKEN_BRIDGES[fromChain];
  if (tokenBridgeAddr) {
    const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];
    const tokenCt   = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    console.log("[Wormhole] Approving Token Bridge...");
    const approveTx = await tokenCt.approve(tokenBridgeAddr, amountUnits);
    await approveTx.wait();
    console.log("[Wormhole] Approved:", approveTx.hash);
  }

  // Step 2: Load ESM SDK via dynamic import() — require() breaks with ESM packages
  let wormholeModule, evmModule, solanaModule;
  try {
    [wormholeModule, evmModule] = await Promise.all([
      import("@wormhole-foundation/sdk"),
      import("@wormhole-foundation/sdk-evm"),
    ]);
    if (intent.toChain === "solana") {
      solanaModule = await import("@wormhole-foundation/sdk-solana");
    }
  } catch (err) {
    throw new Error("Wormhole SDK import failed: " + err.message);
  }

  const { wormhole }    = wormholeModule;
  const { EvmPlatform } = evmModule;
  const platforms       = solanaModule
    ? [EvmPlatform, solanaModule.SolanaPlatform]
    : [EvmPlatform];

  // Step 3: Init Wormhole context
  const network  = config.NETWORK === "mainnet" ? "Mainnet" : "Testnet";
  const wh       = await wormhole(network, platforms);
  const srcChain = wh.getChain(srcChainName);
  const tb       = await srcChain.getTokenBridge();

  // Step 4: Build signer (implements Wormhole SignAndSendSigner interface)
  const signer = {
    chain:   () => srcChainName,
    address: () => wallet.address,
    async signAndSend(txs) {
      const hashes = [];
      for (const tx of txs) {
        const txReq = tx.transaction || tx;
        const sent  = await wallet.sendTransaction({
          to:       txReq.to,
          data:     txReq.data,
          value:    txReq.value    || 0n,
          gasLimit: txReq.gasLimit || txReq.gas || undefined,
        });
        const receipt = await sent.wait();
        hashes.push(receipt.hash);
      }
      return hashes;
    },
  };

  // Step 5: Execute transfer (async generator)
  const tokenId   = { chain: srcChainName, address: tokenAddress };
  const recipient = { chain: destChainName, address: intent.toAddress };
  const txHashes  = [];

  for await (const tx of tb.transfer(signer.address(), recipient, tokenId, BigInt(amountUnits))) {
    const hashes = await signer.signAndSend([tx]);
    txHashes.push(...hashes);
    console.log("[Wormhole] tx:", hashes[0]);
  }

  if (txHashes.length === 0) throw new Error("Wormhole produced no transactions");

  const finalHash = txHashes[txHashes.length - 1];
  console.log("[Wormhole] Done:", finalHash);
  return finalHash;
}

module.exports = { executeWormholeTransfer };
