const { AxelarQueryAPI, Environment, EvmChain } = require('@axelar-network/axelarjs-sdk');
const { ethers } = require('ethers');
const config = require('../../config/keys');
// Axelar Gateway on Celo — verified on celoscan.io
const AXELAR_GATEWAY_CELO   = '0xe432150cce91c13a887f7D836923d5597adD8E31';
const AXELAR_GAS_SERVICE    = '0x2d5d7d31F671F86C782533cc367F14109a082712';

const AXELAR_CHAIN_NAMES = {
  ethereum: 'ethereum', base: 'base', polygon: 'polygon',
  arbitrum: 'arbitrum', optimism: 'optimism', celo: 'celo'
};

const GATEWAY_ABI = [
  'function sendToken(string destinationChain, string destinationAddress, string symbol, uint256 amount)',
];

const GAS_SERVICE_ABI = [
  'function payNativeGasForContractCallWithToken(address sender, string destinationChain, string destinationAddress, bytes payload, string symbol, uint256 amount, address refundAddress) payable',
   ];

async function executeAxelarTransfer({ wallet, intent, amountUnits, tokenAddress }) {
  const destChainName = AXELAR_CHAIN_NAMES[intent.toChain];
  if (!destChainName) throw new Error(`Axelar: unsupported destination ${intent.toChain}`);

  // Step 1 — Approve gateway to spend your token
  const ERC20_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const approveTx = await token.approve(AXELAR_GATEWAY_CELO, amountUnits);
  await approveTx.wait();

  // Step 2 — Estimate gas fee using Axelar SDK
  const axelarQuery = new AxelarQueryAPI({ environment: Environment.MAINNET });
  const gasFee = await axelarQuery.estimateGasFee(
    EvmChain.CELO, destChainName.toUpperCase(), 'USDC', 700000
  );

  // Step 3 — Pay for gas on destination chain
  const gasService = new ethers.Contract(AXELAR_GAS_SERVICE, GAS_SERVICE_ABI, wallet);
  const gasPayTx = await gasService.payNativeGasForContractCallWithToken(
    wallet.address, destChainName, intent.toAddress, '0x',
    intent.token, amountUnits, wallet.address, { value: gasFee }
  );
  await gasPayTx.wait();

  // Step 4 — Send the token via gateway
  const gateway = new ethers.Contract(AXELAR_GATEWAY_CELO, GATEWAY_ABI, wallet);
  const sendTx = await gateway.sendToken(
    destChainName, intent.toAddress, intent.token, amountUnits
  );
const receipt = await sendTx.wait();
  return receipt.hash;
}

module.exports = { executeAxelarTransfer };
