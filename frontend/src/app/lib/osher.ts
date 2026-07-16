import { codeFromHostname, toDataSuffix } from '@celo/attribution-tags';

const ASSIGNED_CELO_ATTRIBUTION_CODE = 'celo_26d5781f584b';
const DEFAULT_CELO_ATTRIBUTION_CODE = 'osher_ai';
const ATTRIBUTION_CODE_PATTERN = /^[a-z0-9_]{1,32}$/;
let cachedAttributionSuffix: string | undefined;

function addAttributionCode(codes: string[], code?: string) {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized || !ATTRIBUTION_CODE_PATTERN.test(normalized)) return;
  if (!codes.includes(normalized)) codes.push(normalized);
}

export function getCeloAttributionCodes() {
  const codes: string[] = [];
  addAttributionCode(codes, (import.meta as any).env?.VITE_CELO_ATTRIBUTION_CODE);
  addAttributionCode(codes, ASSIGNED_CELO_ATTRIBUTION_CODE);
  addAttributionCode(codes, DEFAULT_CELO_ATTRIBUTION_CODE);
  if (typeof window !== 'undefined' && window.location?.hostname) {
    addAttributionCode(codes, codeFromHostname(window.location.hostname));
  }
  return codes;
}

export function getCeloAttributionSuffix() {
  if (cachedAttributionSuffix) return cachedAttributionSuffix;
  const codes = getCeloAttributionCodes();
  if (!codes.length) return undefined;
  cachedAttributionSuffix = toDataSuffix(codes.length === 1 ? codes[0] : codes) as string;
  return cachedAttributionSuffix;
}

export function appendCeloAttribution(data: string) {
  const suffix = getCeloAttributionSuffix();
  if (!suffix) return data;
  const base = data && data !== '0x' ? data : '0x';
  return base + suffix.replace(/^0x/, '');
}

export type WalletType = 'minipay' | 'metamask';

export type WalletInfo = {
  address?: string;
  walletType?: WalletType;
  chainId?: number;
  loginProof?: string;
  loginProofType?: 'wallet_account';
  loginLinkedAt?: string;
};

export type WalletBalances = {
  usdt?: number;
};

export type SavingsGoal = {
  id: string;
  name?: string;
  category?: string;
  categoryLabel?: string;
  targetAmountUSDT?: number;
  targetAmountDisplay?: number;
  displayCurrency?: string;
  currentAmountUSDT?: number;
  weeklyTargetUSDT?: number;
  weeklyTargetDisplay?: number;
  deadline?: string;
  daysRemaining?: number;
  progressPercent?: number;
  roundUpEnabled?: boolean;
  status?: string;
  vaultGoalId?: string;
  vaultGoalCreated?: boolean;
  vaultGoalStatus?: string;
  vaultCreateTxHash?: string;
  lastDepositTxHash?: string;
  lastWithdrawalTxHash?: string;
};

export type DashboardStats = {
  totalSavedUSDT?: number;
  totalTargetUSDT?: number;
  progressPercent?: number;
  activeGoalCount?: number;
  completedGoalCount?: number;
  streakWeeks?: number;
  monthlySavedUSDT?: number;
};

export type ActivityItem = {
  id?: string;
  message?: string;
  type?: string;
  amount_usdt?: number;
  amountUSDT?: number;
  created_at?: string;
  createdAt?: string;
};

export type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant' | 'ai';
  content?: string;
  text?: string;
  createdAt?: string;
  created_at?: string;
};

export type Tip = { id?: string; category?: string; generatedText?: string; generated_text?: string; created_at?: string; };

export type Recommendation = {
  id: string;
  suggestedGoalName?: string;
  suggestedCategory?: string;
  suggestedAmountUSDT?: number;
  reasoningText?: string;
  status?: string;
};

export type ContractsConfig = {
  network?: string;
  savingsVault?: string;
  savingsToken?: string;
  configuredSavingsToken?: string;
  vaultSavingsToken?: string;
  currentCeloUsdt?: string;
  legacyCeloUsdt?: string;
  tokenMatchesConfig?: boolean;
  vaultReady?: boolean;
  vaultIssue?: string;
  agent?: string;
};

export const CURRENT_CELO_USDT = '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e';

export type NetworkConfig = { chainId: string; chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: string[]; blockExplorerUrls: string[]; };

export type AuthMethod = 'email' | 'phone';
export type AuthProfile = {
  name?: string;
  contact?: string;
  method?: AuthMethod;
  userId?: string;
  avatarIcon?: string;
  onboardingComplete?: boolean;
  accessToken?: string;
  refreshToken?: string;
};

export type AppData = {
  goals: SavingsGoal[];
  dashboard: DashboardStats;
  activity: ActivityItem[];
  chatMessages: ChatMessage[];
  tips: Tip[];
  recommendations: Recommendation[];
  walletInfo: WalletInfo;
  walletBalances: WalletBalances;
  displayMode: 'local' | 'usdt';
  contracts: ContractsConfig;
};

export function getOrCreateSessionId() {
  const key = 'osher_session_id';
  const authProfile = loadStoredAuthProfile();
  if (authProfile.userId) {
    const authSession = 'auth_' + String(authProfile.userId).replace(/[^a-zA-Z0-9:_-]/g, '_');
    localStorage.setItem(key, authSession);
    return authSession;
  }
  let id = localStorage.getItem(key);
  if (!id) {
    id = 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

export let SESSION_ID = getOrCreateSessionId();

export function setAuthenticatedSession(profile: AuthProfile) {
  if (!profile.userId) return SESSION_ID;
  SESSION_ID = 'auth_' + String(profile.userId).replace(/[^a-zA-Z0-9:_-]/g, '_');
  localStorage.setItem('osher_session_id', SESSION_ID);
  return SESSION_ID;
}

export function isMiniPay() {
  return typeof window !== 'undefined' && (window as any).ethereum?.isMiniPay === true;
}

export function isMetaMask() {
  return typeof window !== 'undefined' && (window as any).ethereum?.isMetaMask === true && !(window as any).ethereum?.isMiniPay;
}

export function hasManualWalletDisconnect() {
  return localStorage.getItem('osher_wallet_disconnect_requested') === 'true';
}

export async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export async function loadNetworkConfig(): Promise<NetworkConfig> {
  const data = await apiJson<{ network: string; chainId: number }>('/api/network');
  const mainnet = Number(data.chainId) === 42220;
  return {
    chainId: '0x' + Number(data.chainId || 42220).toString(16),
    chainName: mainnet ? 'Celo' : 'Celo Alfajores',
    nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
    rpcUrls: [mainnet ? 'https://forno.celo.org' : 'https://alfajores-forno.celo-testnet.org'],
    blockExplorerUrls: [mainnet ? 'https://celoscan.io' : 'https://alfajores.celoscan.io'],
  };
}

export async function loadAppData(walletInfo: WalletInfo, displayMode: 'local' | 'usdt'): Promise<AppData> {
  const [goalsResponse, dashboard, activityResponse, chatResponse, tipsResponse, recommendationsResponse, contracts] = await Promise.all([
    apiJson<any>(`/api/goals/${encodeURIComponent(SESSION_ID)}`).catch(() => []),
    apiJson<DashboardStats>(`/api/dashboard/${encodeURIComponent(SESSION_ID)}`).catch(() => ({})),
    apiJson<any>(`/api/activity/${encodeURIComponent(SESSION_ID)}?limit=20`).catch(() => []),
    apiJson<any>(`/api/chat/${encodeURIComponent(SESSION_ID)}?limit=80`).catch(() => []),
    apiJson<any>(`/api/tips/${encodeURIComponent(SESSION_ID)}`).catch(() => []),
    apiJson<any>(`/api/recommendations/${encodeURIComponent(SESSION_ID)}`).catch(() => []),
    apiJson<ContractsConfig>('/api/contracts').catch(() => ({})),
  ]);
  const goals = Array.isArray(goalsResponse) ? goalsResponse : (goalsResponse.goals || []);
  const activity = Array.isArray(activityResponse) ? activityResponse : (activityResponse.activity || activityResponse.logs || []);
  const chatMessages = Array.isArray(chatResponse) ? chatResponse : (chatResponse.messages || []);
  const tips = Array.isArray(tipsResponse) ? tipsResponse : (tipsResponse.tips || []);
  const recommendations = Array.isArray(recommendationsResponse) ? recommendationsResponse : (recommendationsResponse.recommendations || []);
  const dashboardStats = (dashboard as any)?.stats || dashboard || {};
  const walletBalances = walletInfo.address ? await loadWalletBalances(walletInfo.address, contracts).catch(() => ({})) : {};
  return { goals, dashboard: dashboardStats, activity, chatMessages, tips, recommendations, walletInfo, walletBalances, displayMode, contracts };
}

export async function ensureCeloNetwork(networkConfig: NetworkConfig) {
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('No wallet provider detected.');
  const currentChain = await ethereum.request({ method: 'eth_chainId' });
  if (String(currentChain).toLowerCase() === networkConfig.chainId.toLowerCase()) return;
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: networkConfig.chainId }] });
  } catch (switchErr: any) {
    if (switchErr?.code === 4902) {
      await ethereum.request({ method: 'wallet_addEthereumChain', params: [networkConfig] });
      return;
    }
    throw switchErr;
  }
}

function createWalletSessionProof(address: string) {
  const linkedAt = new Date().toISOString();
  const suffix = address ? address.slice(-8).toLowerCase() : Math.random().toString(36).slice(2);
  return {
    loginProof: `wallet-account:${suffix}:${Date.now()}`,
    loginProofType: 'wallet_account' as const,
    loginLinkedAt: linkedAt,
  };
}

export function walletDisplayName(walletInfo?: WalletInfo) {
  if (!walletInfo?.address) return 'No wallet connected';
  return walletInfo.walletType === 'minipay' ? 'MiniPay connected' : 'MetaMask connected';
}

export function walletReference(address?: string) {
  return address ? 'Wallet ending ' + address.slice(-4).toUpperCase() : '';
}

export async function connectWallet(walletType: WalletType | 'auto', networkConfig: NetworkConfig): Promise<WalletInfo> {
  const ethereum = (window as any).ethereum;
  const resolved: WalletType = walletType === 'auto' ? (isMiniPay() ? 'minipay' : 'metamask') : walletType;
  if (!ethereum) throw new Error(resolved === 'minipay' ? 'Open this app in MiniPay or Opera Mini.' : 'MetaMask was not detected.');
  if (resolved === 'minipay' && !isMiniPay()) throw new Error('MiniPay was not detected in this browser.');
  if (resolved === 'metamask' && !isMetaMask()) throw new Error('MetaMask was not detected. MiniPay users can connect with the MiniPay option.');
  const accounts = await ethereum.request({ method: 'eth_requestAccounts', params: [] });
  const address = accounts?.[0];
  if (!address) throw new Error('No account returned by wallet.');
  if (resolved !== 'minipay') await ensureCeloNetwork(networkConfig);
  const chainId = await ethereum.request({ method: 'eth_chainId' });
  const walletInfo: WalletInfo = { address, walletType: resolved, chainId: parseInt(chainId, 16), ...createWalletSessionProof(address) };
  await apiJson('/api/wallet/connect', { method: 'POST', body: JSON.stringify({ sessionId: SESSION_ID, walletInfo }) }).catch(() => null);
  localStorage.setItem('osher_wallet_info', JSON.stringify(walletInfo));
  localStorage.removeItem('osher_wallet_disconnect_requested');
  return walletInfo;
}

export function loadStoredWallet(): WalletInfo {
  try { return JSON.parse(localStorage.getItem('osher_wallet_info') || '{}'); } catch { return {}; }
}

export function clearStoredWallet() {
  localStorage.removeItem('osher_wallet_info');
  localStorage.setItem('osher_wallet_disconnect_requested', 'true');
}

export function getUserDisplayName() {
  const profile = loadStoredAuthProfile();
  const raw = profile.name || localStorage.getItem('osher_user_name') || '';
  const clean = raw.trim();
  return clean || 'there';
}

export function loadStoredAuthProfile(): AuthProfile {
  try { return JSON.parse(localStorage.getItem('osher_auth_profile') || '{}'); } catch { return {}; }
}

export function storeAuthProfile(profile: AuthProfile) {
  const current = loadStoredAuthProfile();
  const clean = {
    ...current,
    ...profile,
    name: (profile.name ?? current.name ?? '').trim(),
    contact: (profile.contact || current.contact || '').trim(),
  };
  localStorage.setItem('osher_auth_profile', JSON.stringify(clean));
  if (clean.name) localStorage.setItem('osher_user_name', clean.name);
  if (clean.userId) setAuthenticatedSession(clean);
  return clean;
}

function authHeaders(profile = loadStoredAuthProfile()) {
  return profile.accessToken ? { Authorization: `Bearer ${profile.accessToken}` } : {};
}

export async function startSupabaseOtp(profile: AuthProfile) {
  return apiJson<{ success: boolean; demo?: boolean; message?: string }>('/api/auth/start', {
    method: 'POST',
    body: JSON.stringify({ ...profile, sessionId: SESSION_ID }),
  });
}

export async function verifySupabaseOtp(profile: AuthProfile & { otp: string }) {
  const result = await apiJson<{ success: boolean; demo?: boolean; user?: AuthProfile; message?: string }>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ ...profile, sessionId: SESSION_ID }),
  });
  if (result.success) storeAuthProfile(result.user || profile);
  return result;
}

export async function loadRemoteAuthProfile() {
  const current = loadStoredAuthProfile();
  if (!current.accessToken) return current;
  const result = await apiJson<{ success: boolean; profile?: AuthProfile }>('/api/profile', {
    headers: authHeaders(current),
  });
  if (result.success && result.profile) {
    return storeAuthProfile({ ...current, ...result.profile });
  }
  return current;
}

export async function saveRemoteAuthProfile(profile: AuthProfile) {
  const current = loadStoredAuthProfile();
  const merged = storeAuthProfile({ ...current, ...profile });
  const result = await apiJson<{ success: boolean; profile?: AuthProfile }>('/api/profile', {
    method: 'POST',
    headers: authHeaders(merged),
    body: JSON.stringify({ profile: merged }),
  }).catch(() => ({ success: true, profile: merged }));
  if (result.success && result.profile) return storeAuthProfile({ ...merged, ...result.profile });
  return merged;
}

export function shortAddress(address?: string) {
  return address ? address.slice(0, 6) + '...' + address.slice(-4) : '';
}

export function formatNumber(value: unknown, digits = 2) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatTokenNumber(value: unknown) {
  const amount = Number(value || 0);
  const small = amount > 0 && amount < 0.01;
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: small ? 0 : 2,
    maximumFractionDigits: small ? 6 : 2,
  });
}

export function formatLocalAmount(amount: unknown, currency = 'USD') {
  const code = String(currency || 'USD').toUpperCase();
  if (code === 'USD') return formatTokenNumber(amount) + ' USDT';
  if (code === 'NGN') return '₦' + formatNumber(amount, 0);
  if (code === 'GHS') return 'GHS ' + formatNumber(amount, 2);
  return formatNumber(amount, 2) + ' ' + code;
}

export function formatGoalAmount(goal: SavingsGoal, mode: 'local' | 'usdt', field: 'target' | 'saved' | 'weekly' = 'target') {
  if (mode === 'usdt') {
    const value = field === 'target' ? goal.targetAmountUSDT : field === 'weekly' ? goal.weeklyTargetUSDT : goal.currentAmountUSDT;
    return formatTokenNumber(value) + ' USDT';
  }
  if (field === 'weekly') return formatLocalAmount(goal.weeklyTargetDisplay, goal.displayCurrency);
  if (field === 'saved') {
    const targetDisplay = Number(goal.targetAmountDisplay || 0);
    const pct = Math.max(0, Number(goal.progressPercent || 0)) / 100;
    return formatLocalAmount(targetDisplay * pct, goal.displayCurrency);
  }
  return formatLocalAmount(goal.targetAmountDisplay, goal.displayCurrency);
}

export function categoryEmoji(category?: string) {
  const key = String(category || '').toLowerCase();
  if (key.includes('rent')) return '🏠';
  if (key.includes('school')) return '🎓';
  if (key.includes('emergency')) return '🛡️';
  if (key.includes('travel')) return '✈️';
  if (key.includes('gadget')) return '📱';
  return '🎯';
}

export function cleanWalletError(err: any) {
  const message = err?.message || String(err);
  if (err?.code === 4001 || message.toLowerCase().includes('rejected')) return 'Wallet request cancelled.';
  if (message.toLowerCase().includes('insufficient')) return 'Your wallet does not have enough funds for this transaction and network fee.';
  if (message.toLowerCase().includes('transfer amount exceeds balance')) return 'Your USDT balance is too low for this deposit. Add USDT to your wallet, then try again.';
  return message;
}

export function parseUnits(value: number | string, decimals: number) {
  const [whole, fraction = ''] = String(value).trim().split('.');
  const normalizedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(normalizedFraction || '0');
}

export function bytes32FromString(value: string) {
  const bytes = new TextEncoder().encode(String(value));
  const out = new Uint8Array(32);
  out.set(bytes.slice(0, 32));
  return '0x' + Array.from(out).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function encodeAddress(address: string) { return address.toLowerCase().replace(/^0x/, '').padStart(64, '0'); }
function encodeUint(value: bigint) { return value.toString(16).padStart(64, '0'); }

export function formatUnits(value: bigint, decimals: number, digits = 2) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  const fractionText = fraction.toString().padStart(decimals, '0').slice(0, digits);
  return `${whole.toString()}.${fractionText}`.replace(/\.?0+$/, '');
}

export async function readErc20Balance(tokenAddress: string, owner: string): Promise<bigint> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('No wallet provider detected.');
  const data = '0x70a08231' + encodeAddress(owner);
  const result = await ethereum.request({ method: 'eth_call', params: [{ to: tokenAddress, data }, 'latest'] });
  return BigInt(result || '0x0');
}

export async function readNativeCeloBalance(owner: string): Promise<bigint> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('No wallet provider detected.');
  const result = await ethereum.request({ method: 'eth_getBalance', params: [owner, 'latest'] });
  return BigInt(result || '0x0');
}

export async function loadWalletBalances(owner: string, contracts: ContractsConfig): Promise<WalletBalances> {
  const walletUsdtToken = contracts.currentCeloUsdt || CURRENT_CELO_USDT;
  const usdtRaw = walletUsdtToken ? await readErc20Balance(walletUsdtToken, owner).catch(() => 0n) : 0n;
  return {
    usdt: Number(formatUnits(usdtRaw, 6, 6)),
  };
}

export function encodeErc20Approve(spender: string, amountUnits: bigint) {
  return '0x095ea7b3' + encodeAddress(spender) + encodeUint(amountUnits);
}

export function encodeVaultCreateGoal(vaultGoalId: string, targetUnits: bigint, deadlineSeconds: bigint) {
  return '0xb5ae5b38' + vaultGoalId.replace(/^0x/, '').padStart(64, '0') + encodeUint(targetUnits) + encodeUint(deadlineSeconds);
}

export function encodeVaultDeposit(vaultGoalId: string, amountUnits: bigint) {
  return '0xd04b3936' + vaultGoalId.replace(/^0x/, '').padStart(64, '0') + encodeUint(amountUnits);
}

export function encodeVaultWithdraw(vaultGoalId: string, amountUnits: bigint) {
  return '0xcbf8e299' + vaultGoalId.replace(/^0x/, '').padStart(64, '0') + encodeUint(amountUnits);
}

export function encodeVaultRoundUp(vaultGoalId: string, amountUnits: bigint) {
  return '0xf816f918' + vaultGoalId.replace(/^0x/, '').padStart(64, '0') + encodeUint(amountUnits);
}

export function encodeVaultPauseGoal(vaultGoalId: string) {
  return '0x1835e74e' + vaultGoalId.replace(/^0x/, '').padStart(64, '0');
}

export function encodeVaultResumeGoal(vaultGoalId: string) {
  return '0x398f969b' + vaultGoalId.replace(/^0x/, '').padStart(64, '0');
}

export async function pollTransaction(txHash: string, chain = 'celo', onUpdate?: (status: string) => void) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const data = await apiJson<{ status: string; confirmations?: number }>(`/api/transaction/status?txHash=${encodeURIComponent(txHash)}&chain=${encodeURIComponent(chain)}`).catch(() => ({ status: 'pending' }));
    onUpdate?.(data.status);
    if (data.status === 'confirmed') return data;
    if (data.status === 'failed') throw new Error('Transaction failed or reverted.');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return { status: 'pending' };
}
