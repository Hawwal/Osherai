const { wormhole } = require('@wormhole-foundation/sdk');
const { EvmPlatform } = require('@wormhole-foundation/sdk-evm');
const { SolanaPlatform } = require('@wormhole-foundation/sdk-solana');
const { ethers } = require('ethers');
const config = require('../../config/keys');

async function executeWormholeTransfer({ wallet, intent, amountUnits, tokenAddress }) {
  const wh = await wormhole('Mainnet', [EvmPlatform, SolanaPlatform]);

  // Celo is chain 'Celo' in Wormhole — chain ID 14
  const srcChain = wh.getChain('Celo');

  // Detect destination chain name for Wormhole
  const chainMap = {
    solana: 'Solana', base: 'Base', ethereum: 'Ethereum',
    polygon: 'Polygon', arbitrum: 'Arbitrum', optimism: 'Optimism'
  };
  const destName = chainMap[intent.toChain];
  if (!destName) throw new Error(`Wormhole: unsupported destination ${intent.toChain}`);
  const dstChain = wh.getChain(destName);

  // Get the Token Bridge on Celo
  const tb = await srcChain.getTokenBridge();

  // Build the transfer
  const sendAmt = BigInt(amountUnits);
  const transfer = tb.transfer(
    wallet.address,
    { chain: destName, address: intent.toAddress },
    tokenAddress,
    sendAmt
  );

  // Sign and send
  const txids = await wh.sendTransaction(transfer, wallet);
  return txids[0].txid;
}

module.exports = { executeWormholeTransfer };
