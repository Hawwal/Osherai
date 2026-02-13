const { ethers } = require('ethers');
const config = require('../../config/keys');

const CBRIDGE_ABI = [
  'function send(address receiver, address token, uint256 amount, uint64 dstChainId, uint64 nonce, uint32 maxSlippage)',
];

const CHAIN_IDS = {
  ethereum: 1, base: 8453, polygon: 137,
  arbitrum: 42161, optimism: 10, bnb: 56
};

async function executeCelerTransfer({ wallet, intent, amountUnits, tokenAddress }) {
  const destChainId = CHAIN_IDS[intent.toChain];
  if (!destChainId) throw new Error(`Celer: unsupported destination ${intent.toChain}`);
// Fetch live contract address from Celer API
  const configUrl = 'https://cbridge-prod2.celer.app/v2/getTransferConfigs';
  const res = await fetch(configUrl);
  const data = await res.json();

  // Find the cBridge contract for Celo (chainId 42220)
  const celoConfig = data.chains?.find(c => c.id === 42220);
  const bridgeAddress = celoConfig?.contract_addr;
  if (!bridgeAddress) throw new Error('Celer: could not find Celo bridge contract address');

  // Approve cBridge to spend token
  const ERC20_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const approveTx = await token.approve(bridgeAddress, amountUnits);
  await approveTx.wait();

  // Send via cBridge
  const nonce = Date.now();
  const maxSlippage = 3000; // 0.3% — adjust if needed
  const bridge = new ethers.Contract(bridgeAddress, CBRIDGE_ABI, wallet);
  const tx = await bridge.send(
    intent.toAddress, tokenAddress, amountUnits,
    destChainId, nonce, maxSlippage
  );
  const receipt = await tx.wait();
  return receipt.hash;
}

module.exports = { executeCelerTransfer };
