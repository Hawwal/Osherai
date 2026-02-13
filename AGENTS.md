# AGENTS

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: `npx openskills read <skill-name>` (run in your shell)
  - For multiple: `npx openskills read skill-one,skill-two`
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>8004</name>
<description>ERC-8004 Agent Trust Protocol for AI agent identity, reputation, and validation on Celo. Use when building AI agents that need identity registration, reputation tracking, or trust verification across organizational boundaries.</description>
<location>project</location>
</skill>

<skill>
<name>bridging</name>
<description>Bridge assets to and from Celo. Use when transferring tokens between Celo and other chains like Ethereum.</description>
<location>project</location>
</skill>

<skill>
<name>celo-composer</name>
<description>Scaffold Celo dApps with Celo Composer. Use when starting new Celo projects, creating MiniPay apps, or setting up development environments.</description>
<location>project</location>
</skill>

<skill>
<name>celo-defi</name>
<description>Integrate DeFi protocols on Celo. Use when building swaps, lending, or liquidity applications with Uniswap, Aave, Ubeswap, or other DeFi protocols.</description>
<location>project</location>
</skill>

<skill>
<name>celo-rpc</name>
<description>Interact with Celo blockchain via RPC endpoints. Use when reading balances, transactions, blocks, and interacting with Celo via viem or cast.</description>
<location>project</location>
</skill>

<skill>
<name>celo-stablecoins</name>
<description>Working with Celo's stablecoin ecosystem. Use when building with USDm, EURm, USDC, USDT, or regional Mento stablecoins on Celo.</description>
<location>project</location>
</skill>

<skill>
<name>contract-verification</name>
<description>Verify smart contracts on Celo. Use when publishing contract source code to Celoscan or Blockscout.</description>
<location>project</location>
</skill>

<skill>
<name>evm-foundry</name>
<description>Foundry development for EVM chains including Celo. Use when working with forge, cast, anvil, writing Solidity contracts, testing, deploying, or verifying contracts with Foundry.</description>
<location>project</location>
</skill>

<skill>
<name>evm-hardhat</name>
<description>Hardhat development for EVM chains including Celo. Use when setting up Hardhat projects, writing Solidity contracts, compiling, testing, deploying, or verifying contracts with Hardhat.</description>
<location>project</location>
</skill>

<skill>
<name>evm-wallet-integration</name>
<description>Integrate wallets into Celo dApps. Covers RainbowKit, Dynamic, and wallet connection patterns.</description>
<location>project</location>
</skill>

<skill>
<name>fee-abstraction</name>
<description>Pay gas fees with ERC-20 tokens on Celo. Covers supported tokens, implementation, and wallet compatibility.</description>
<location>project</location>
</skill>

<skill>
<name>minipay-integration</name>
<description>Build Mini Apps for MiniPay wallet. Use when building applications for MiniPay, detecting MiniPay wallet, or creating mobile-first dApps for Celo.</description>
<location>project</location>
</skill>

<skill>
<name>thirdweb</name>
<description>Use thirdweb SDK for Celo development. Includes wallet connection, contract deployment, and pre-built UI components.</description>
<location>project</location>
</skill>

<skill>
<name>viem</name>
<description>Use viem for Celo development. Includes fee currency support, transaction signing, and Celo-specific configurations.</description>
<location>project</location>
</skill>

<skill>
<name>wagmi</name>
<description>Use wagmi React hooks for Celo dApps. Includes wallet connection, transaction hooks, and React integration patterns.</description>
<location>project</location>
</skill>

<skill>
<name>x402</name>
<description>x402 HTTP-native payment protocol for AI agents on Celo. Use when implementing pay-per-use APIs, agent micropayments, or HTTP 402 Payment Required flows with stablecoins.</description>
<location>project</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
