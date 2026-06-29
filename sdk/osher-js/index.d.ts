export type DisplayCurrency = "USD" | "USDT" | "NGN" | "GHS";
export type DisplayMode = "local" | "usdt";

export interface OsherClientOptions {
  baseUrl: string;
  apiKey?: string;
}

export interface SavingsGoal {
  id?: string;
  name?: string;
  category?: string;
  categoryLabel?: string;
  targetAmountUSDT?: number;
  targetAmountDisplay?: number;
  displayCurrency?: string;
  deadline?: string;
  currentAmountUSDT?: number;
  weeklyTargetUSDT?: number;
  weeklyTargetDisplay?: number;
  status?: string;
  vaultGoalId?: string | null;
  vaultGoalCreated?: boolean;
}

export interface GoalParseResponse {
  type: string;
  isGoal: boolean;
  intent?: Record<string, unknown>;
  missingFields?: string[];
  message?: string;
}

export interface GoalPlanRequest {
  amount?: number;
  targetAmount?: number;
  currency?: DisplayCurrency;
  displayCurrency?: DisplayCurrency;
  purpose?: string;
  name?: string;
  deadline?: string;
  deadlineText?: string;
  originalMessage?: string;
  existingGoals?: SavingsGoal[];
}

export interface GoalPlanResponse {
  goal: SavingsGoal;
  summary: string;
  displayMode: DisplayMode;
}

export interface NudgeResponse {
  channel: string;
  message: string;
  data: Record<string, unknown>;
}

export interface TipResponse {
  category: string;
  generatedText: string;
}

export interface DepositIntent {
  intentId: string;
  type: "vault.deposit";
  network: string;
  goalId: string;
  vaultGoalId?: string | null;
  amountUSDT: number;
  token: {
    symbol: string;
    address: string;
    decimals: number;
  };
  contract: {
    savingsVault?: string | null;
  };
  requires: string[];
  humanSummary: string;
}

export interface SavingsSummaryResponse {
  userId?: string | null;
  walletAddress?: string | null;
  goalCount: number;
  activeGoals: number;
  totalSavedUSDT: number;
  totalTargetUSDT: number;
  percentComplete: number;
  display: Record<string, unknown>;
}

export class OsherApiError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
  docsUrl?: string;
}

export class OsherClient {
  constructor(options: OsherClientOptions);
  health(): Promise<Record<string, unknown>>;
  parseGoal(message: string, context?: Record<string, unknown>): Promise<GoalParseResponse>;
  createGoalPlan(input: GoalPlanRequest): Promise<GoalPlanResponse>;
  generateNudge(input: Record<string, unknown>): Promise<NudgeResponse>;
  generateTip(input: Record<string, unknown>): Promise<TipResponse>;
  createDepositIntent(input: { goal?: SavingsGoal; goalId?: string; amountUSDT?: number; amount?: number; vaultGoalId?: string }): Promise<DepositIntent>;
  getSavingsSummary(input: { userId?: string; walletAddress?: string; displayCurrency?: DisplayCurrency; goals?: SavingsGoal[] }): Promise<SavingsSummaryResponse>;
}
