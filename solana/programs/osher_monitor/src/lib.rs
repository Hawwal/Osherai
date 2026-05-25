/**
 * osher_monitor — Solana Program (Anchor framework)
 * ─────────────────────────────────────────────────────────────────
 * Deployed on: Solana Mainnet
 *
 * What it does:
 *   1. Called by jupiterSwap.js and transfers.js AFTER a tx succeeds.
 *   2. Collects a basis-point service fee into a PDA-controlled vault.
 *   3. Emits structured program logs (events) for every transaction.
 *   4. Owner can update fee rate and withdraw vault balance.
 *
 * Accounts used:
 *   - Config PDA   : stores feeBps, owner, totalTx, totalVolume
 *   - FeeVault PDA : holds collected SOL fees (native lamports)
 *   - TokenVault   : Associated token accounts for SPL fee collection
 *
 * Fee model:
 *   - SOL transfers  → fee in SOL (lamports)
 *   - SPL transfers  → fee in the same SPL token (USDC/USDT)
 *   - Jupiter swaps  → fee in input token
 *   - feeBps default : 50 (0.5%) — matches keys.js SERVICE_FEE_PERCENT
 *   - Max fee cap    : 500 bps (5%)
 * ─────────────────────────────────────────────────────────────────
 */

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};

declare_id!("PLACEHOLDER_REPLACE_AFTER_DEPLOY");

// Seeds for PDAs
const CONFIG_SEED:    &[u8] = b"osher_config";
const FEE_VAULT_SEED: &[u8] = b"osher_fee_vault";
const MAX_FEE_BPS:    u16   = 500; // 5% hard ceiling

#[program]
pub mod osher_monitor {
    use super::*;

    // ── Initialize ────────────────────────────────────────────────

    /**
     * initialize()
     * Run once at deployment. Creates the Config PDA and FeeVault PDA.
     *
     * @param fee_bps  Initial fee in basis points (50 = 0.5%)
     */
    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, OsherError::FeeTooHigh);

        let config = &mut ctx.accounts.config;
        config.owner              = ctx.accounts.owner.key();
        config.fee_bps            = fee_bps;
        config.paused             = false;
        config.total_transactions = 0;
        config.total_volume_usd   = 0;
        config.bump               = ctx.bumps.config;
        config.vault_bump         = ctx.bumps.fee_vault;

        emit!(ProgramInitialized {
            owner:   ctx.accounts.owner.key(),
            fee_bps,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("OsherMonitor initialized. Owner: {}, Fee: {}bps", config.owner, fee_bps);
        Ok(())
    }

    // ── Record SOL Transfer ───────────────────────────────────────

    /**
     * record_sol_transfer()
     * Called by transfers.js after a native SOL transfer succeeds.
     * Pulls fee (in lamports) from the payer into the FeeVault PDA.
     *
     * @param tx_id       Unique transaction ID (32 bytes, from orchestrator)
     * @param amount      Transfer amount in lamports
     * @param to_chain    Destination chain name ("solana", "ethereum", etc.)
     * @param to_address  Destination address (base58 string, max 64 chars)
     * @param bridge      Bridge used ("wormhole", "none" for native)
     */
    pub fn record_sol_transfer(
        ctx:        Context<RecordSolTransfer>,
        tx_id:      [u8; 32],
        amount:     u64,
        to_chain:   String,
        to_address: String,
        bridge:     String,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, OsherError::ContractPaused);
        require!(amount > 0,                  OsherError::ZeroAmount);
        require!(to_chain.len()   <= 32,      OsherError::StringTooLong);
        require!(to_address.len() <= 64,      OsherError::StringTooLong);
        require!(bridge.len()     <= 32,      OsherError::StringTooLong);

        let fee_lamports = fee_amount(amount, ctx.accounts.config.fee_bps);

        // Transfer fee lamports: payer → fee_vault
        if fee_lamports > 0 {
            let ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.payer.key(),
                &ctx.accounts.fee_vault.key(),
                fee_lamports,
            );
            anchor_lang::solana_program::program::invoke(
                &ix,
                &[
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.fee_vault.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
        }

        // Update stats
        let config = &mut ctx.accounts.config;
        config.total_transactions = config.total_transactions.saturating_add(1);
        config.total_volume_usd   = config.total_volume_usd.saturating_add(
            amount / 1_000_000_000  // lamports → approximate SOL units
        );

        emit!(SolTransferLogged {
            tx_id,
            sender:      ctx.accounts.payer.key(),
            amount,
            fee_charged: fee_lamports,
            to_chain:    to_chain.clone(),
            to_address:  to_address.clone(),
            bridge:      bridge.clone(),
            timestamp:   Clock::get()?.unix_timestamp,
        });

        msg!(
            "SOL transfer: {}L amount, {}L fee, → {} via {}",
            amount, fee_lamports, to_chain, bridge
        );
        Ok(())
    }

    // ── Record SPL Token Transfer ─────────────────────────────────

    /**
     * record_spl_transfer()
     * Called by transfers.js after a USDC/USDT SPL transfer succeeds.
     * Pulls fee from payer's token account into the fee token vault.
     *
     * @param tx_id       Unique transaction ID
     * @param amount      Transfer amount (in token base units, e.g. USDC = 6 decimals)
     * @param token_symbol "USDC" or "USDT"
     * @param to_chain    Destination chain
     * @param to_address  Destination address
     * @param bridge      Bridge used
     */
    pub fn record_spl_transfer(
        ctx:          Context<RecordSplTransfer>,
        tx_id:        [u8; 32],
        amount:       u64,
        token_symbol: String,
        to_chain:     String,
        to_address:   String,
        bridge:       String,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, OsherError::ContractPaused);
        require!(amount > 0,                  OsherError::ZeroAmount);
        require!(token_symbol.len() <= 10,    OsherError::StringTooLong);
        require!(to_chain.len()     <= 32,    OsherError::StringTooLong);
        require!(to_address.len()   <= 64,    OsherError::StringTooLong);

        let fee_amount_spl = fee_amount(amount, ctx.accounts.config.fee_bps);

        // Transfer fee from payer's token account → fee token vault
        if fee_amount_spl > 0 {
            let cpi_accounts = SplTransfer {
                from:      ctx.accounts.payer_token_account.to_account_info(),
                to:        ctx.accounts.fee_token_vault.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
            );
            token::transfer(cpi_ctx, fee_amount_spl)?;
        }

        // Update stats
        let config = &mut ctx.accounts.config;
        config.total_transactions = config.total_transactions.saturating_add(1);
        config.total_volume_usd   = config.total_volume_usd.saturating_add(
            amount / 1_000_000  // 6-decimal stablecoin → approximate USD units
        );

        emit!(SplTransferLogged {
            tx_id,
            sender:       ctx.accounts.payer.key(),
            token_mint:   ctx.accounts.token_mint.key(),
            token_symbol: token_symbol.clone(),
            amount,
            fee_charged:  fee_amount_spl,
            to_chain:     to_chain.clone(),
            to_address:   to_address.clone(),
            bridge:       bridge.clone(),
            timestamp:    Clock::get()?.unix_timestamp,
        });

        msg!(
            "SPL transfer: {} {} amount, {} fee, → {} via {}",
            amount, token_symbol, fee_amount_spl, to_chain, bridge
        );
        Ok(())
    }

    // ── Record Jupiter Swap ───────────────────────────────────────

    /**
     * record_swap()
     * Called by jupiterSwap.js after a Jupiter swap completes.
     * Fee is taken on the input token.
     *
     * @param tx_id           Unique ID (use swap signature bytes)
     * @param from_token_sym  Input token symbol
     * @param to_token_sym    Output token symbol
     * @param from_amount     Input amount (base units)
     * @param to_amount       Output amount (base units, for logging)
     * @param price_impact    Price impact * 1000 (e.g. 12 = 0.012%)
     * @param route           Route description (e.g. "Orca → Raydium")
     */
    pub fn record_swap(
        ctx:           Context<RecordSplTransfer>,  // Reuses SPL account structure
        tx_id:         [u8; 32],
        from_token_sym: String,
        to_token_sym:   String,
        from_amount:    u64,
        to_amount:      u64,
        price_impact:   u32,    // Scaled by 1000 (12 = 0.012%)
        route:          String,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, OsherError::ContractPaused);
        require!(from_amount > 0,             OsherError::ZeroAmount);
        require!(route.len() <= 128,          OsherError::StringTooLong);

        let fee_amount_spl = fee_amount(from_amount, ctx.accounts.config.fee_bps);

        if fee_amount_spl > 0 {
            let cpi_accounts = SplTransfer {
                from:      ctx.accounts.payer_token_account.to_account_info(),
                to:        ctx.accounts.fee_token_vault.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
            );
            token::transfer(cpi_ctx, fee_amount_spl)?;
        }

        let config = &mut ctx.accounts.config;
        config.total_transactions = config.total_transactions.saturating_add(1);

        emit!(SwapLogged {
            tx_id,
            sender:          ctx.accounts.payer.key(),
            from_token_mint: ctx.accounts.token_mint.key(),
            to_token_mint:   ctx.accounts.fee_token_vault.key(), // Placeholder
            from_token_sym:  from_token_sym.clone(),
            to_token_sym:    to_token_sym.clone(),
            from_amount,
            to_amount,
            fee_charged:     fee_amount_spl,
            price_impact,
            route:           route.clone(),
            timestamp:       Clock::get()?.unix_timestamp,
        });

        msg!(
            "Swap: {} {} → {} {}, fee: {}, impact: {}bps",
            from_amount, from_token_sym, to_amount, to_token_sym,
            fee_amount_spl, price_impact
        );
        Ok(())
    }

    // ── Owner: Withdraw SOL fees from vault ───────────────────────

    /**
     * withdraw_sol_fees()
     * Drain accumulated SOL from the FeeVault PDA to the owner's wallet.
     */
    pub fn withdraw_sol_fees(ctx: Context<WithdrawSolFees>, amount: u64) -> Result<()> {
        let vault_balance = ctx.accounts.fee_vault.lamports();
        require!(amount <= vault_balance, OsherError::InsufficientFunds);
        require!(amount > 0,             OsherError::ZeroAmount);

        // PDA-signed transfer out of vault
        let config_key = ctx.accounts.config.key();
        let seeds = &[
            FEE_VAULT_SEED,
            config_key.as_ref(),
            &[ctx.accounts.config.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.fee_vault.key(),
            &ctx.accounts.owner.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.fee_vault.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        emit!(FeeWithdrawn {
            token:     Pubkey::default(), // SOL = zero address by convention
            to:        ctx.accounts.owner.key(),
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Withdrew {} lamports from fee vault", amount);
        Ok(())
    }

    // ── Owner: Config ─────────────────────────────────────────────

    pub fn set_fee_bps(ctx: Context<OwnerOnly>, new_bps: u16) -> Result<()> {
        require!(new_bps <= MAX_FEE_BPS, OsherError::FeeTooHigh);
        let old = ctx.accounts.config.fee_bps;
        ctx.accounts.config.fee_bps = new_bps;
        emit!(FeeUpdated { old_bps: old, new_bps, timestamp: Clock::get()?.unix_timestamp });
        msg!("Fee updated: {} → {} bps", old, new_bps);
        Ok(())
    }

    pub fn set_paused(ctx: Context<OwnerOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        msg!("Contract paused: {}", paused);
        Ok(())
    }

    pub fn transfer_ownership(ctx: Context<TransferOwnership>, new_owner: Pubkey) -> Result<()> {
        require!(new_owner != Pubkey::default(), OsherError::ZeroAddress);
        let old = ctx.accounts.config.owner;
        ctx.accounts.config.owner = new_owner;
        emit!(OwnershipTransferred {
            old_owner: old,
            new_owner,
            timestamp: Clock::get()?.unix_timestamp,
        });
        msg!("Ownership transferred to {}", new_owner);
        Ok(())
    }
}

// ── Helper ────────────────────────────────────────────────────────

fn fee_amount(amount: u64, fee_bps: u16) -> u64 {
    (amount as u128 * fee_bps as u128 / 10_000) as u64
}

// ── Account Structs ───────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer  = owner,
        space  = Config::LEN,
        seeds  = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    /// The FeeVault PDA holds collected SOL fees
    #[account(
        init,
        payer  = owner,
        space  = 8,  // Just a lamport sink — no data needed
        seeds  = [FEE_VAULT_SEED, config.key().as_ref()],
        bump
    )]
    pub fee_vault: SystemAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordSolTransfer<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [FEE_VAULT_SEED, config.key().as_ref()],
        bump  = config.vault_bump
    )]
    pub fee_vault: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordSplTransfer<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// The token mint (e.g. USDC mint address)
    pub token_mint: Account<'info, anchor_spl::token::Mint>,

    /// Payer's token account — fee is debited from here
    #[account(mut)]
    pub payer_token_account: Account<'info, TokenAccount>,

    /// Program's fee token vault — receives the fee
    #[account(
        init_if_needed,
        payer       = payer,
        associated_token::mint      = token_mint,
        associated_token::authority = config,
    )]
    pub fee_token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawSolFees<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump,
              has_one = owner @ OsherError::NotOwner)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [FEE_VAULT_SEED, config.key().as_ref()],
        bump  = config.vault_bump
    )]
    pub fee_vault: SystemAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump,
              has_one = owner @ OsherError::NotOwner)]
    pub config: Account<'info, Config>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump,
              has_one = owner @ OsherError::NotOwner)]
    pub config: Account<'info, Config>,

    pub owner: Signer<'info>,
}

// ── State Account ────────────────────────────────────────────────

#[account]
pub struct Config {
    pub owner:              Pubkey,  // 32
    pub fee_bps:            u16,     // 2
    pub paused:             bool,    // 1
    pub bump:               u8,      // 1
    pub vault_bump:         u8,      // 1
    pub total_transactions: u64,     // 8
    pub total_volume_usd:   u64,     // 8
    pub _reserved:          [u8; 32], // 32  — reserved for future fields without redeployment
}

impl Config {
    // 8 (discriminator) + 32 + 2 + 1 + 1 + 1 + 8 + 8 + 32 = 93
    pub const LEN: usize = 8 + 32 + 2 + 1 + 1 + 1 + 8 + 8 + 32;
}

// ── Events ───────────────────────────────────────────────────────

#[event]
pub struct ProgramInitialized {
    pub owner:     Pubkey,
    pub fee_bps:   u16,
    pub timestamp: i64,
}

#[event]
pub struct SolTransferLogged {
    pub tx_id:      [u8; 32],
    pub sender:     Pubkey,
    pub amount:     u64,
    pub fee_charged: u64,
    pub to_chain:   String,
    pub to_address: String,
    pub bridge:     String,
    pub timestamp:  i64,
}

#[event]
pub struct SplTransferLogged {
    pub tx_id:        [u8; 32],
    pub sender:       Pubkey,
    pub token_mint:   Pubkey,
    pub token_symbol: String,
    pub amount:       u64,
    pub fee_charged:  u64,
    pub to_chain:     String,
    pub to_address:   String,
    pub bridge:       String,
    pub timestamp:    i64,
}

#[event]
pub struct SwapLogged {
    pub tx_id:           [u8; 32],
    pub sender:          Pubkey,
    pub from_token_mint: Pubkey,
    pub to_token_mint:   Pubkey,
    pub from_token_sym:  String,
    pub to_token_sym:    String,
    pub from_amount:     u64,
    pub to_amount:       u64,
    pub fee_charged:     u64,
    pub price_impact:    u32,
    pub route:           String,
    pub timestamp:       i64,
}

#[event]
pub struct FeeWithdrawn {
    pub token:     Pubkey,
    pub to:        Pubkey,
    pub amount:    u64,
    pub timestamp: i64,
}

#[event]
pub struct FeeUpdated {
    pub old_bps:   u16,
    pub new_bps:   u16,
    pub timestamp: i64,
}

#[event]
pub struct OwnershipTransferred {
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
    pub timestamp: i64,
}

// ── Errors ───────────────────────────────────────────────────────

#[error_code]
pub enum OsherError {
    #[msg("OsherMonitor: not the owner")]
    NotOwner,
    #[msg("OsherMonitor: contract is paused")]
    ContractPaused,
    #[msg("OsherMonitor: amount cannot be zero")]
    ZeroAmount,
    #[msg("OsherMonitor: fee exceeds 5% maximum")]
    FeeTooHigh,
    #[msg("OsherMonitor: string argument too long")]
    StringTooLong,
    #[msg("OsherMonitor: zero address not allowed")]
    ZeroAddress,
    #[msg("OsherMonitor: insufficient vault funds")]
    InsufficientFunds,
}
