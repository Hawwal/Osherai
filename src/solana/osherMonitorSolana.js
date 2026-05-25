/**
 * osherMonitorSolana.js
 * ─────────────────────────────────────────────────────────────────
 * Integration helper: called by jupiterSwap.js and transfers.js
 * AFTER a Solana transaction succeeds.
 *
 * Drop this file into: src/solana/osherMonitorSolana.js
 *
 * Note: On Solana, the monitor is called AFTER the tx (unlike Celo
 * where it's called before). This is because Solana transactions are
 * atomic — we can't split "fee approval" and "transfer" like EVM.
 * The fee is collected in a separate instruction/tx post-completion.
 * ─────────────────────────────────────────────────────────────────
 */

const anchor   = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const fs       = require("fs");
const path     = require("path");
const config   = require("../../config/keys");

// ── Load deployment info ──────────────────────────────────────────
function getDeployment() {
  // Prefer environment variables
  if (process.env.OSHER_MONITOR_SOLANA_PROGRAM) {
    return {
      programId:   new PublicKey(process.env.OSHER_MONITOR_SOLANA_PROGRAM),
      configPda:   new PublicKey(process.env.OSHER_MONITOR_SOLANA_CONFIG),
      feeVaultPda: new PublicKey(process.env.OSHER_MONITOR_SOLANA_VAULT),
    };
  }
  // Fall back to deployment JSON
  const deployPath = path.join(__dirname, "../../deployments/solana-mainnet.json");
  if (!fs.existsSync(deployPath)) return null;
  const d = JSON.parse(fs.readFileSync(deployPath, "utf-8"));
  return {
    programId:   new PublicKey(d.programId),
    configPda:   new PublicKey(d.configPda),
    feeVaultPda: new PublicKey(d.feeVaultPda),
  };
}

function loadProgram(wallet) {
  const deployment = getDeployment();
  if (!deployment) return null;

  const idlPath = path.join(__dirname, "../../deployments/osher_monitor.json");
  if (!fs.existsSync(idlPath)) {
    console.warn("[OsherMonitor Solana] IDL not found at", idlPath);
    return null;
  }

  const idl      = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const provider = new anchor.AnchorProvider(
    wallet.connection,
    new anchor.Wallet(wallet.keypair),
    { commitment: "confirmed" }
  );
  return new anchor.Program(idl, deployment.programId, provider);
}

/**
 * recordSolanaSwap()
 * ─────────────────────────────────────────────────────────────────
 * Call this in jupiterSwap.js executeSwap() AFTER the swap succeeds.
 *
 * @param {SolanaWallet} wallet        - Solana wallet instance
 * @param {string}       fromToken     - Input token symbol ("SOL", "USDC")
 * @param {string}       toToken       - Output token symbol
 * @param {number}       fromAmount    - Input amount (human-readable)
 * @param {number}       toAmount      - Output amount (human-readable)
 * @param {number}       priceImpact   - Price impact percentage
 * @param {string}       route         - Route description
 * @param {string}       signature     - Jupiter swap tx signature (for txId)
 */
async function recordSolanaSwap({
  wallet,
  fromToken,
  toToken,
  fromAmount,
  toAmount,
  priceImpact,
  route = "",
  signature,
}) {
  const deployment = getDeployment();
  if (!deployment) {
    console.warn("[OsherMonitor Solana] Not deployed yet — skipping swap recording.");
    return { feeCharged: 0, signature: null };
  }

  try {
    const program = loadProgram(wallet);
    if (!program) return { feeCharged: 0, signature: null };

    // Convert signature string to 32-byte array for txId
    const txIdBytes = Buffer.from(signature.slice(0, 32).padEnd(32, "0"));
    const txId      = Array.from(txIdBytes);

    // Get token mint from config
    const fromMint = new PublicKey(config.SOLANA.TOKENS[fromToken]);

    // Payer's token account
    const payerTokenAccount = await getAssociatedTokenAddress(
      fromMint,
      wallet.publicKey
    );

    // Fee vault token account (owned by config PDA)
    const feeTokenVault = await getAssociatedTokenAddress(
      fromMint,
      deployment.configPda,
      true  // allowOwnerOffCurve = true for PDA
    );

    // Convert to base units
    const decimals     = fromToken === "SOL" ? 9 : 6;
    const fromBaseUnits = Math.floor(fromAmount * Math.pow(10, decimals));
    const toBaseUnits   = Math.floor(toAmount   * Math.pow(10, decimals === 9 ? 9 : 6));
    const impactScaled  = Math.floor(priceImpact * 1000); // 0.012% → 12

    const tx = await program.methods
      .recordSwap(
        txId,
        fromToken,
        toToken,
        new anchor.BN(fromBaseUnits),
        new anchor.BN(toBaseUnits),
        impactScaled,
        route.slice(0, 128)
      )
      .accounts({
        config:                deployment.configPda,
        tokenMint:             fromMint,
        payerTokenAccount,
        feeTokenVault,
        payer:                 wallet.publicKey,
        tokenProgram:          TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:         SystemProgram.programId,
      })
      .rpc();

    // Calculate fee for logging
    const feeBps    = 50; // Read from chain in production
    const feeAmount = fromAmount * feeBps / 10000;

    console.log(`[OsherMonitor Solana] Swap recorded. Fee: ${feeAmount} ${fromToken}. Tx: ${tx}`);
    return { feeCharged: feeAmount, signature: tx };

  } catch (err) {
    // IMPORTANT: never fail the original swap because of monitoring
    console.error("[OsherMonitor Solana] recordSwap failed (non-blocking):", err.message);
    return { feeCharged: 0, signature: null };
  }
}

/**
 * recordSolanaTransfer()
 * Call this in transfers.js after a native SOL or SPL transfer succeeds.
 */
async function recordSolanaTransfer({
  wallet,
  token,           // "SOL" or "USDC" / "USDT"
  amount,          // human-readable
  toChain,
  toAddress,
  bridge = "none",
  signature,
}) {
  const deployment = getDeployment();
  if (!deployment) return { feeCharged: 0, signature: null };

  try {
    const program  = loadProgram(wallet);
    if (!program) return { feeCharged: 0, signature: null };

    const txIdBytes = Buffer.from(signature.slice(0, 32).padEnd(32, "0"));
    const txId      = Array.from(txIdBytes);

    if (token === "SOL") {
      // Native SOL transfer
      const lamports = Math.floor(amount * 1e9);
      const tx = await program.methods
        .recordSolTransfer(
          txId,
          new anchor.BN(lamports),
          toChain,
          toAddress.slice(0, 64),
          bridge
        )
        .accounts({
          config:        deployment.configPda,
          feeVault:      deployment.feeVaultPda,
          payer:         wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const feeCharged = amount * 50 / 10000;
      console.log(`[OsherMonitor Solana] SOL transfer recorded. Fee: ${feeCharged} SOL`);
      return { feeCharged, signature: tx };

    } else {
      // SPL token transfer (USDC/USDT)
      const mintAddr = new PublicKey(config.SOLANA.TOKENS[token]);
      const payerTokenAccount = await getAssociatedTokenAddress(mintAddr, wallet.publicKey);
      const feeTokenVault     = await getAssociatedTokenAddress(mintAddr, deployment.configPda, true);

      const baseUnits = Math.floor(amount * 1e6);
      const tx = await program.methods
        .recordSplTransfer(
          txId,
          new anchor.BN(baseUnits),
          token,
          toChain,
          toAddress.slice(0, 64),
          bridge
        )
        .accounts({
          config:                 deployment.configPda,
          tokenMint:              mintAddr,
          payerTokenAccount,
          feeTokenVault,
          payer:                  wallet.publicKey,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .rpc();

      const feeCharged = amount * 50 / 10000;
      console.log(`[OsherMonitor Solana] ${token} transfer recorded. Fee: ${feeCharged} ${token}`);
      return { feeCharged, signature: tx };
    }

  } catch (err) {
    console.error("[OsherMonitor Solana] recordTransfer failed (non-blocking):", err.message);
    return { feeCharged: 0, signature: null };
  }
}

module.exports = { recordSolanaSwap, recordSolanaTransfer };


/* ═══════════════════════════════════════════════════════════════════
   HOW TO WIRE INTO jupiterSwap.js
   ═══════════════════════════════════════════════════════════════════

   1. Add this import at the top of jupiterSwap.js:

      const { recordSolanaSwap } = require("./osherMonitorSolana");

   2. In executeSwap(), AFTER the confirmTransaction line, add:

      // ── OsherMonitor: log + collect fee ──────────────────────
      await recordSolanaSwap({
        wallet,
        fromToken:   quote.inputToken,
        toToken:     quote.outputToken,
        fromAmount:  quote.inputAmount,
        toAmount:    quote.outputAmount,
        priceImpact: quote.priceImpact,
        route:       quote.route?.map(r => r.swapInfo?.label || "DEX").join(" → ") || "",
        signature,
      });
      // ──────────────────────────────────────────────────────────

   That's it. The return statement below it is unchanged.
   ═══════════════════════════════════════════════════════════════════ */
