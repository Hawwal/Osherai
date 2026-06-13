/**
 * Disabled in the Celo-only wallet baseline.
 * Kept as a small compatibility module so older imports fail clearly.
 */

async function executeWormholeTransfer() {
  throw new Error("This bridge executor is disabled in the Celo-only baseline.");
}

module.exports = { executeWormholeTransfer };
