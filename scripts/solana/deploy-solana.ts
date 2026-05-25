/**
 * deploy-solana.ts
 * ─────────────────────────────────────────────────────────────────
 * Deploys and initializes the osher_monitor Anchor program on
 * Solana Mainnet.
 *
 * Prerequisites:
 *   1. anchor build              (compiles the program)
 *   2. solana config set --url mainnet-beta
 *   3. solana config set --keypair ~/.config/solana/id.json
 *   4. ts-node scripts/deploy-solana.ts
 * ─────────────────────────────────────────────────────────────────
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ── Load IDL and program ID after anchor build ────────────────────
// The IDL is generated at: target/idl/osher_monitor.json
// The program ID is in:    target/deploy/osher_monitor-keypair.json

const IDL_PATH     = path.join(__dirname, "../target/idl/osher_monitor.json");
const KEYPAIR_PATH = path.join(__dirname, "../target/deploy/osher_monitor-keypair.json");

async function main() {
  console.log("\n════════════════════════════════════════════════");
  console.log("  OsherMonitor — Solana Mainnet Deployment");
  console.log("════════════════════════════════════════════════\n");

  // ── Set up provider ───────────────────────────────────────────
  const connection = new web3.Connection(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    "confirmed"
  );

  // Load wallet from file (set by `solana config set --keypair`)
  const walletKeypairPath = process.env.SOLANA_KEYPAIR_PATH ||
    `${process.env.HOME}/.config/solana/id.json`;

  const rawKey  = JSON.parse(fs.readFileSync(walletKeypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));
  const wallet  = new anchor.Wallet(keypair);

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  console.log("Deployer:  ", wallet.publicKey.toBase58());
  console.log("Balance:   ", (await connection.getBalance(wallet.publicKey)) / 1e9, "SOL");
  console.log("RPC:       ", connection.rpcEndpoint);
  console.log("");

  // ── Get program ID from keypair file ──────────────────────────
  const programKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8")))
  );
  const programId = programKeypair.publicKey;
  console.log("Program ID:", programId.toBase58());

  // ── Load IDL ──────────────────────────────────────────────────
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new Program(idl, programId, provider);

  // ── Derive PDAs ───────────────────────────────────────────────
  const [configPda, configBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("osher_config")],
    programId
  );
  const [feeVaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("osher_fee_vault"), configPda.toBuffer()],
    programId
  );

  console.log("\nDerived PDAs:");
  console.log("  Config PDA:   ", configPda.toBase58());
  console.log("  Fee Vault PDA:", feeVaultPda.toBase58());
  console.log("");

  // ── Check if already initialized ─────────────────────────────
  const existing = await connection.getAccountInfo(configPda);
  if (existing) {
    console.log("⚠️  Config PDA already exists — program already initialized.");
    console.log("   To re-initialize, close the account first or deploy a new program.");
    process.exit(0);
  }

  // ── Initialize the program ────────────────────────────────────
  const FEE_BPS = 50; // 0.5% — matches keys.js SERVICE_FEE_PERCENT
  console.log(`Initializing with fee_bps = ${FEE_BPS} (${FEE_BPS / 100}%)...`);

  const tx = await program.methods
    .initialize(FEE_BPS)
    .accounts({
      config:        configPda,
      feeVault:      feeVaultPda,
      owner:         wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("\n✅ Program initialized!");
  console.log("   Tx signature:", tx);
  console.log("   Solscan:     ", `https://solscan.io/tx/${tx}`);
  console.log("");

  // ── Verify state ──────────────────────────────────────────────
  const configAccount = await program.account.config.fetch(configPda);
  console.log("Verifying on-chain state:");
  console.log("  Owner:      ", configAccount.owner.toBase58());
  console.log("  Fee BPS:    ", configAccount.feeBps);
  console.log("  Paused:     ", configAccount.paused);
  console.log("  Total TXs:  ", configAccount.totalTransactions.toString());
  console.log("");

  // ── Save deployment info ──────────────────────────────────────
  const deploymentInfo = {
    network:     "solana-mainnet",
    programId:   programId.toBase58(),
    configPda:   configPda.toBase58(),
    feeVaultPda: feeVaultPda.toBase58(),
    owner:       wallet.publicKey.toBase58(),
    feeBps:      FEE_BPS,
    deployedAt:  new Date().toISOString(),
    txSignature: tx,
    solscan:     `https://solscan.io/account/${programId.toBase58()}`,
  };

  fs.mkdirSync(path.join(__dirname, "../../deployments"), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, "../../deployments/solana-mainnet.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("📄 Deployment info saved to: deployments/solana-mainnet.json");
  console.log("\n════════════════════════════════════════════════");
  console.log("  NEXT STEPS:");
  console.log("════════════════════════════════════════════════");
  console.log("1. Add to your .env:");
  console.log(`   OSHER_MONITOR_SOLANA_PROGRAM=${programId.toBase58()}`);
  console.log(`   OSHER_MONITOR_SOLANA_CONFIG=${configPda.toBase58()}`);
  console.log(`   OSHER_MONITOR_SOLANA_VAULT=${feeVaultPda.toBase58()}`);
  console.log("");
  console.log("2. Update jupiterSwap.js to call record_swap()");
  console.log("   (the integration patch is in scripts/jupiter-patch.js)");
  console.log("════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Deployment failed:", err);
    process.exit(1);
  });
