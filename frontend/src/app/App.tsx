import { useEffect, useMemo, useState } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { AuthScreen } from './components/AuthScreen';
import { WalletScreen } from './components/WalletScreen';
import { HomeScreen } from './components/HomeScreen';
import { GoalDetailsScreen } from './components/GoalDetailsScreen';
import { GoalsScreen } from './components/GoalsScreen';
import { ManualGoalFormScreen } from './components/ManualGoalFormScreen';
import { AIChatScreen } from './components/AIChatScreen';
import { TipsScreen } from './components/TipsScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { BottomNav } from './components/BottomNav';
import { NotificationsScreen } from './components/NotificationsScreen';
import { RecommendationsScreen } from './components/RecommendationsScreen';
import { YieldScreen } from './components/YieldScreen';
import { SocialScreen } from './components/SocialScreen';
import { ChallengesScreen } from './components/ChallengesScreen';
import {
  AppData,
  AuthProfile,
  ContractsConfig,
  Recommendation,
  SavingsGoal,
  SESSION_ID,
  WalletInfo,
  WalletType,
  apiJson,
  bytes32FromString,
  cleanWalletError,
  clearStoredWallet,
  connectWallet,
  getUserDisplayName,
  hasManualWalletDisconnect,
  encodeErc20Approve,
  encodeVaultCreateGoal,
  encodeVaultDeposit,
  encodeVaultWithdraw,
  encodeVaultRoundUp,
  encodeVaultPauseGoal,
  encodeVaultResumeGoal,
  formatUnits,
  isMiniPay,
  loadAppData,
  loadNetworkConfig,
  loadStoredWallet,
  parseUnits,
  pollTransaction,
  readErc20Balance,
  storeAuthProfile,
} from './lib/osher';

type Flow = 'splash' | 'onboarding' | 'auth' | 'wallet' | 'app';
type Tab = 'home' | 'goals' | 'chat' | 'tips' | 'profile';
type Overlay = null | 'goal-detail' | 'manual-goal' | 'notifications' | 'recommendations' | 'yield' | 'social' | 'challenges';
type ActionSheet = null | { type: 'topup' | 'withdraw' | 'spend'; goal: SavingsGoal; title: string; label: string; placeholder: string; defaultValue?: string };

const EMPTY_DATA: AppData = {
  goals: [],
  dashboard: {},
  activity: [],
  chatMessages: [],
  tips: [],
  recommendations: [],
  walletInfo: {},
  walletBalances: {},
  displayMode: 'local',
  contracts: {},
};

const SAVINGS_TOKEN_DECIMALS = 6;

export default function App() {
  const [flow, setFlow] = useState<Flow>('splash');
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<'local' | 'usdt'>(() => (localStorage.getItem('osher_display_mode') === 'usdt' ? 'usdt' : 'local'));
  const [walletInfo, setWalletInfo] = useState<WalletInfo>(() => loadStoredWallet());
  const [networkConfig, setNetworkConfig] = useState<any>(null);
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [notice, setNotice] = useState('');
  const [actionSheet, setActionSheet] = useState<ActionSheet>(null);
  const [sheetValue, setSheetValue] = useState('');
  const [miniPayLaunchProofRequested, setMiniPayLaunchProofRequested] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState(() => getUserDisplayName());

  const selectedGoal = useMemo(() => data.goals.find(goal => goal.id === selectedGoalId) || data.goals[0], [data.goals, selectedGoalId]);

  useEffect(() => {
    loadNetworkConfig().then(setNetworkConfig).catch(() => null);
  }, []);

  useEffect(() => {
    localStorage.setItem('osher_display_mode', displayMode);
  }, [displayMode]);

  useEffect(() => {
    refreshData();
  }, [walletInfo.address, displayMode]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!networkConfig || miniPayLaunchProofRequested || !isMiniPay() || hasManualWalletDisconnect()) return;
    setMiniPayLaunchProofRequested(true);
    handleWalletConnect('minipay');
  }, [networkConfig, miniPayLaunchProofRequested]);

  const refreshData = async () => {
    const next = await loadAppData(walletInfo, displayMode);
    setData(next);
  };

  const handleSplashDone = () => {
    setFlow(walletInfo.address ? 'app' : 'onboarding');
  };

  const handleWalletConnect = async (walletType: WalletType | 'auto' = 'auto') => {
    try {
      if (!networkConfig) throw new Error('Celo network config is still loading. Try again in a moment.');
      setNotice('Requesting wallet access...');
      setNotice('Waiting for your free login signature. No gas or payment is charged.');
      const info = await connectWallet(walletType, networkConfig);
      setWalletInfo(info);
      setFlow('app');
      setNotice('Wallet connected and login signature saved.');
      await refreshData();
    } catch (err) {
      setNotice(cleanWalletError(err));
    }
  };

  const disconnectWallet = () => {
    clearStoredWallet();
    setWalletInfo({});
    setFlow('wallet');
    setNotice('Wallet disconnected.');
  };

  const handleAuth = (profile: AuthProfile) => {
    const stored = storeAuthProfile(profile);
    setUserDisplayName(getUserDisplayName());
    setFlow('wallet');
    setNotice(stored.name ? `Welcome, ${stored.name}. Connect your wallet to continue.` : 'Account verified. Connect your wallet to continue.');
  };

  const sendMessage = async (message: string) => {
    const response = await apiJson<any>('/api/message', {
      method: 'POST',
      body: JSON.stringify({ sessionId: SESSION_ID, message, walletInfo }),
    });
    if (response?.data?.goal || response?.data?.goals) await refreshData();
    if (response?.data?.action === 'top_up_goal' && response.data.goalId) {
      const responseGoals = response.data.goals || (response.data.goal ? [response.data.goal] : []);
      const goal = responseGoals.find((item: SavingsGoal) => item.id === response.data.goalId) || data.goals.find(item => item.id === response.data.goalId) || response.data.goal;
      if (goal) await topUpGoal(goal, Number(response.data.amountUSDT || 0));
    }
    if (response?.data?.action === 'open_goal_setup' && response.data.goalId) {
      const responseGoals = response.data.goals || (response.data.goal ? [response.data.goal] : []);
      const goal = responseGoals.find((item: SavingsGoal) => item.id === response.data.goalId) || data.goals.find(item => item.id === response.data.goalId);
      if (goal) {
        setSelectedGoalId(goal.id);
        setOverlay('goal-detail');
        setNotice('Create this goal vault first, then tap Top up.');
      }
    }
    return response?.message || response?.error || 'I could not process that yet.';
  };

  const createManualGoal = async (goalInput: { name: string; category: string; targetAmount: number; currency: string; deadline: string; startingDeposit?: number; roundUpEnabled: boolean }) => {
    const result = await apiJson<any>('/api/goals/' + encodeURIComponent(SESSION_ID), {
      method: 'POST',
      body: JSON.stringify(goalInput),
    });
    if (!result.success) throw new Error(result.error || 'Could not create this goal.');
    await refreshData();
    if (result.goal?.id) setSelectedGoalId(result.goal.id);
    setOverlay('goal-detail');
    const firstTopUp = Number(goalInput.startingDeposit || 0);
    setNotice(firstTopUp > 0
      ? `${result.goal?.name || 'Goal'} created. Create its vault, then top up ${firstTopUp.toFixed(2)} ${goalInput.currency}.`
      : (result.message || `${result.goal?.name || 'Goal'} created.`));
  };

  const ensureVaultReady = () => {
    if (!walletInfo.address) throw new Error('Connect MiniPay or MetaMask first.');
    if (!data.contracts?.savingsVault) throw new Error('Savings vault is not configured yet. Set OSHER_SAVINGS_VAULT after deployment.');
    if (!data.contracts?.savingsToken) throw new Error('Savings token is not configured yet.');
  };

  const reconcileGoals = async () => {
    const result = await apiJson<any>('/api/goals/' + encodeURIComponent(SESSION_ID) + '/reconcile', { method: 'POST' }).catch(err => ({ error: cleanWalletError(err) }));
    await refreshData();
    setNotice(result.message || result.error || 'Goal balances refreshed from the vault.');
  };

  const createVaultGoal = async (goal: SavingsGoal) => {
    try {
      ensureVaultReady();
      const ethereum = (window as any).ethereum;
      const vaultGoalId = bytes32FromString(goal.id);
      const targetUnits = parseUnits(goal.targetAmountUSDT || 0, SAVINGS_TOKEN_DECIMALS);
      const deadlineSeconds = BigInt(Math.floor(new Date(goal.deadline || Date.now()).getTime() / 1000));
      setNotice('Create this goal in your wallet...');
      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletInfo.address,
          to: data.contracts.savingsVault,
          value: '0x0',
          data: encodeVaultCreateGoal(vaultGoalId, targetUnits, deadlineSeconds),
        }],
      });
      setNotice('Goal submitted. Checking confirmation...');
      await pollTransaction(txHash, 'celo');
      await apiJson('/api/goals/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id) + '/vault-created', {
        method: 'POST',
        body: JSON.stringify({ vaultGoalId, txHash }),
      });
      await refreshData();
      setNotice((goal.name || 'Goal') + ' is ready for top-ups.');
    } catch (err) {
      setNotice(cleanWalletError(err));
    }
  };

  const executeTopUpGoal = async (goal: SavingsGoal, presetAmount: number) => {
    try {
      ensureVaultReady();
      if (!goal.vaultGoalCreated) {
        setSelectedGoalId(goal.id);
        setOverlay('goal-detail');
        throw new Error('Create this goal vault first, then top it up.');
      }
      const amount = Number(presetAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid USDT amount.');
      const amountUnits = parseUnits(amount, SAVINGS_TOKEN_DECIMALS);
      const vaultGoalId = goal.vaultGoalId || bytes32FromString(goal.id);
      const ethereum = (window as any).ethereum;
      setNotice('Checking your Celo USDT balance...');
      const balanceUnits = await readErc20Balance(data.contracts.savingsToken!, walletInfo.address!);
      if (balanceUnits < amountUnits) {
        throw new Error(`Your Celo USDT balance is ${formatUnits(balanceUnits, SAVINGS_TOKEN_DECIMALS, 2)} USDT, but this deposit needs ${amount.toFixed(2)} USDT.`);
      }
      setNotice('Approve USDT for the vault...');
      const approveHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletInfo.address,
          to: data.contracts.savingsToken,
          value: '0x0',
          data: encodeErc20Approve(data.contracts.savingsVault!, amountUnits),
        }],
      });
      setNotice('Approval submitted. Waiting for confirmation...');
      await pollTransaction(approveHash, 'celo');
      setNotice('Deposit approved USDT into your goal...');
      const depositHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletInfo.address,
          to: data.contracts.savingsVault,
          value: '0x0',
          data: encodeVaultDeposit(vaultGoalId, amountUnits),
        }],
      });
      await pollTransaction(depositHash, 'celo');
      await apiJson('/api/goals/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id) + '/deposit-confirmed', {
        method: 'POST',
        body: JSON.stringify({ amountUSDT: amount, txHash: depositHash }),
      });
      await refreshData();
      setNotice(amount.toFixed(2) + ' USDT confirmed for ' + (goal.name || 'your goal') + '.');
    } catch (err) {
      setNotice(cleanWalletError(err));
    }
  };

  const topUpGoal = async (goal: SavingsGoal, presetAmount?: number) => {
    if (presetAmount !== undefined) return executeTopUpGoal(goal, presetAmount);
    const suggested = Number(goal.weeklyTargetUSDT || 1).toFixed(2);
    setSheetValue(suggested);
    setActionSheet({ type: 'topup', goal, title: 'Top up goal', label: 'Amount in USDT', placeholder: suggested, defaultValue: suggested });
  };

  const executeWithdrawGoal = async (goal: SavingsGoal, presetAmount: number) => {
    try {
      ensureVaultReady();
      if (!goal.vaultGoalCreated) throw new Error('This goal is not on-chain yet.');
      const available = Number(goal.currentAmountUSDT || 0);
      if (available <= 0) throw new Error('This goal has no saved balance to withdraw.');
      const amount = Number(presetAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid USDT amount.');
      if (amount > available) throw new Error(`You can withdraw up to ${available.toFixed(2)} USDT.`);
      const ethereum = (window as any).ethereum;
      const vaultGoalId = goal.vaultGoalId || bytes32FromString(goal.id);
      const amountUnits = parseUnits(amount, SAVINGS_TOKEN_DECIMALS);
      setNotice('Withdraw from your goal in your wallet...');
      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletInfo.address,
          to: data.contracts.savingsVault,
          value: '0x0',
          data: encodeVaultWithdraw(vaultGoalId, amountUnits),
        }],
      });
      setNotice('Withdrawal submitted. Checking confirmation...');
      await pollTransaction(txHash, 'celo');
      const result = await apiJson<any>('/api/goals/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id) + '/withdrawal-confirmed', {
        method: 'POST',
        body: JSON.stringify({ amountUSDT: amount, txHash }),
      });
      await refreshData();
      if (amount >= available) setOverlay(null);
      setNotice(result.message || `${amount.toFixed(2)} USDT withdrawn from ${goal.name || 'your goal'}.`);
    } catch (err) {
      setNotice(cleanWalletError(err));
    }
  };

  const withdrawGoal = async (goal: SavingsGoal) => {
    const available = Number(goal.currentAmountUSDT || 0);
    setSheetValue(available.toFixed(2));
    setActionSheet({ type: 'withdraw', goal, title: 'Withdraw savings', label: 'Amount in USDT', placeholder: available.toFixed(2), defaultValue: available.toFixed(2) });
  };

  const deleteOrArchiveGoal = async (goal: SavingsGoal) => {
    try {
      const balance = Number(goal.currentAmountUSDT || 0);
      if (balance > 0) throw new Error(`Withdraw ${balance.toFixed(2)} USDT before deleting or archiving this goal.`);
      const action = goal.vaultGoalCreated ? 'archive' : 'delete';
      if (!window.confirm(`Are you sure you want to ${action} "${goal.name || 'this goal'}"?`)) return;
      const result = await apiJson<any>('/api/goals/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id), {
        method: 'DELETE',
      });
      await refreshData();
      setOverlay(null);
      setNotice(result.message || (action === 'archive' ? 'Goal archived.' : 'Goal deleted.'));
    } catch (err) {
      setNotice(cleanWalletError(err));
    }
  };

  const setGoalPauseState = async (goal: SavingsGoal, paused: boolean) => {
    try {
      ensureVaultReady();
      if (!goal.vaultGoalCreated) throw new Error('Create this goal vault first.');
      const ethereum = (window as any).ethereum;
      const vaultGoalId = goal.vaultGoalId || bytes32FromString(goal.id);
      setNotice(paused ? 'Pausing this goal in your wallet...' : 'Resuming this goal in your wallet...');
      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: walletInfo.address, to: data.contracts.savingsVault, value: '0x0', data: paused ? encodeVaultPauseGoal(vaultGoalId) : encodeVaultResumeGoal(vaultGoalId) }],
      });
      await pollTransaction(txHash, 'celo');
      const result = await apiJson<any>('/api/goals/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id) + '/status', {
        method: 'POST',
        body: JSON.stringify({ status: paused ? 'paused' : 'active', txHash }),
      });
      await refreshData();
      setNotice(result.message || (paused ? 'Goal paused.' : 'Goal resumed.'));
    } catch (err) {
      setNotice(cleanWalletError(err));
    }
  };

  const toggleRoundUp = async (goal: SavingsGoal) => {
    const result = await apiJson<any>('/api/roundups/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id) + '/preference', {
      method: 'POST',
      body: JSON.stringify({ enabled: !goal.roundUpEnabled }),
    }).catch(err => ({ error: cleanWalletError(err) }));
    setNotice(result.message || result.error || 'Round-up preference updated.');
    await refreshData();
  };

  const executeLogSpend = async (goal: SavingsGoal, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const result = await apiJson<any>('/api/roundups/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id) + '/spend', {
      method: 'POST',
      body: JSON.stringify({ amount, currency: goal.displayCurrency || 'NGN' }),
    }).catch(err => ({ error: cleanWalletError(err) }));
    if (result.roundUp?.roundUpUSDT > 0 && goal.roundUpEnabled && goal.vaultGoalCreated) {
      await executeRoundUpDeposit(goal, Number(result.roundUp.roundUpUSDT));
    } else {
      setNotice(result.message || result.error || 'Spend logged.');
    }
    await refreshData();
  };

  const logSpend = async (goal: SavingsGoal) => {
    setSheetValue('');
    setActionSheet({ type: 'spend', goal, title: 'Log spending', label: 'Amount spent in ' + (goal.displayCurrency || 'NGN'), placeholder: goal.displayCurrency === 'NGN' ? '2500' : '4.60' });
  };

  const executeRoundUpDeposit = async (goal: SavingsGoal, amount: number) => {
    try {
      ensureVaultReady();
      const amountUnits = parseUnits(amount, SAVINGS_TOKEN_DECIMALS);
      const vaultGoalId = goal.vaultGoalId || bytes32FromString(goal.id);
      const ethereum = (window as any).ethereum;
      setNotice('Approve USDT round-up for the vault...');
      const approveHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: walletInfo.address, to: data.contracts.savingsToken, value: '0x0', data: encodeErc20Approve(data.contracts.savingsVault!, amountUnits) }],
      });
      await pollTransaction(approveHash, 'celo');
      setNotice('Saving your round-up...');
      const roundUpHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: walletInfo.address, to: data.contracts.savingsVault, value: '0x0', data: encodeVaultRoundUp(vaultGoalId, amountUnits) }],
      });
      await pollTransaction(roundUpHash, 'celo');
      await apiJson('/api/goals/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id) + '/deposit-confirmed', {
        method: 'POST',
        body: JSON.stringify({ amountUSDT: amount, txHash: roundUpHash, type: 'round_up' }),
      });
      setNotice(amount.toFixed(2) + ' USDT round-up saved for ' + (goal.name || 'your goal') + '.');
    } catch (err) {
      setNotice(cleanWalletError(err));
    }
  };

  const submitActionSheet = async () => {
    if (!actionSheet) return;
    const amount = Number(sheetValue);
    const current = actionSheet;
    setActionSheet(null);
    setSheetValue('');
    if (current.type === 'topup') return executeTopUpGoal(current.goal, amount);
    if (current.type === 'withdraw') return executeWithdrawGoal(current.goal, amount);
    return executeLogSpend(current.goal, amount);
  };

  const updateRecommendation = async (rec: Recommendation, status: 'accepted' | 'customised' | 'dismissed') => {
    const result = await apiJson<any>('/api/recommendations/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(rec.id), {
      method: 'POST',
      body: JSON.stringify({ status }),
    }).catch(err => ({ error: cleanWalletError(err) }));
    setNotice(result.message || result.error || (rec.suggestedGoalName || 'Recommendation') + ' ' + status + '.');
    await refreshData();
  };

  const requestWeeklyNudge = async () => {
    const result = await apiJson<any>('/api/nudges/' + encodeURIComponent(SESSION_ID) + '/weekly', { method: 'POST' }).catch(err => ({ error: cleanWalletError(err) }));
    setNotice(result.message || result.error || 'Weekly summary generated.');
    await refreshData();
  };

  const handleProfileUpdate = (profile: AuthProfile) => {
    storeAuthProfile(profile);
    setUserDisplayName(getUserDisplayName());
    setNotice(profile.name ? `Profile updated. Hi ${profile.name}.` : 'Profile updated.');
  };

  const handleGoalClick = (goal?: SavingsGoal) => {
    if (goal?.id) setSelectedGoalId(goal.id);
    setOverlay('goal-detail');
  };

  const handleHomeDeposit = () => {
    const goal = data.goals[0];
    if (!goal) {
      setNotice('Create a savings goal first, then you can deposit into it.');
      setOverlay('manual-goal');
      return;
    }
    topUpGoal(goal);
  };

  const handleTabChange = (nextTab: Tab) => {
    setOverlay(null);
    setTab(nextTab);
  };

  const renderContent = () => {
    if (overlay === 'goal-detail') return <GoalDetailsScreen goal={selectedGoal} displayMode={displayMode} onBack={() => setOverlay(null)} onCreateVaultGoal={createVaultGoal} onTopUp={topUpGoal} onWithdraw={withdrawGoal} onDeleteGoal={deleteOrArchiveGoal} onToggleRoundUp={toggleRoundUp} onLogSpend={logSpend} onPauseGoal={(goal) => setGoalPauseState(goal, true)} onResumeGoal={(goal) => setGoalPauseState(goal, false)} onReconcile={reconcileGoals} />;
    if (overlay === 'manual-goal') return <ManualGoalFormScreen onBack={() => setOverlay(null)} onAskAi={() => { setOverlay(null); setTab('chat'); }} onCreateGoal={createManualGoal} />;
    if (overlay === 'notifications') return <NotificationsScreen onBack={() => setOverlay(null)} activity={data.activity} goals={data.goals} />;
    if (overlay === 'recommendations') return <RecommendationsScreen recommendations={data.recommendations} onUpdate={updateRecommendation} />;
    if (overlay === 'yield') return <YieldScreen comingSoon />;
    if (overlay === 'social') return <SocialScreen comingSoon />;
    if (overlay === 'challenges') return <ChallengesScreen comingSoon />;

    switch (tab) {
      case 'home':
        return <HomeScreen data={data} displayMode={displayMode} userName={userDisplayName} onDisplayModeChange={setDisplayMode} onGoalClick={handleGoalClick} onChatClick={() => setTab('chat')} onNotifClick={() => setOverlay('notifications')} onAddGoal={() => setOverlay('manual-goal')} onDeposit={handleHomeDeposit} onTopUp={topUpGoal} onWeeklyNudge={requestWeeklyNudge} />;
      case 'goals':
        return <GoalsScreen goals={data.goals} displayMode={displayMode} contracts={data.contracts as ContractsConfig} onGoalClick={handleGoalClick} onCreateManualGoal={() => setOverlay('manual-goal')} onCreateVaultGoal={createVaultGoal} onTopUp={topUpGoal} onWithdraw={withdrawGoal} onDeleteGoal={deleteOrArchiveGoal} onAskAi={() => setTab('chat')} onToggleRoundUp={toggleRoundUp} onLogSpend={logSpend} onPauseGoal={(goal) => setGoalPauseState(goal, true)} onResumeGoal={(goal) => setGoalPauseState(goal, false)} />;
      case 'chat':
        return <AIChatScreen userName={userDisplayName} initialMessages={data.chatMessages} onSendMessage={sendMessage} onDataChanged={refreshData} />;
      case 'tips':
        return <TipsScreen tips={data.tips} onExplainTip={sendMessage} />;
      case 'profile':
        return <ProfileScreen userName={userDisplayName} walletInfo={walletInfo} displayMode={displayMode} dashboard={data.dashboard} walletBalances={data.walletBalances} onDisplayModeChange={setDisplayMode} onDisconnect={disconnectWallet} onProfileUpdate={handleProfileUpdate} onOpenChat={() => setTab('chat')} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: '#d8d8e8' }}>
      <div
        className="relative overflow-hidden flex flex-col"
        style={{
          width: 'min(430px, 100vw)',
          height: 'min(932px, 100dvh)',
          background: '#f8f8fd',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          boxShadow: '0 8px 60px rgba(0,0,0,0.18)',
          borderRadius: 'clamp(0px, (100vw - 430px) * 9999, 40px)',
        }}
      >
        {flow === 'splash' && <SplashScreen onDone={handleSplashDone} />}
        {flow === 'onboarding' && <OnboardingScreen onContinue={() => setFlow('auth')} />}
        {flow === 'auth' && <AuthScreen onAuth={handleAuth} />}
        {flow === 'wallet' && <WalletScreen onConnect={handleWalletConnect} walletInfo={walletInfo} onDisconnect={disconnectWallet} />}

        {flow === 'app' && (
          <>
            <div className="flex-1 overflow-hidden">{renderContent()}</div>
            <BottomNav active={tab} onChange={handleTabChange} />
            {actionSheet && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 420, background: 'rgba(13,13,20,0.34)', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '22px 20px calc(24px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -10px 32px rgba(0,0,0,0.18)' }}>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0d0d14' }}>{actionSheet.title}</h2>
                      <p style={{ color: '#6b6b8a', fontSize: '0.82rem', marginTop: 3 }}>{actionSheet.goal.name}</p>
                    </div>
                    <button onClick={() => setActionSheet(null)} style={{ width: 34, height: 34, borderRadius: 12, background: '#f0f0f9', color: '#3d3d6e', fontWeight: 900 }}>×</button>
                  </div>
                  <label className="block rounded-2xl p-4 mb-4" style={{ background: '#f5f5fb' }}>
                    <span className="block" style={{ color: '#6b6b8a', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{actionSheet.label}</span>
                    <input autoFocus value={sheetValue} onChange={e => setSheetValue(e.target.value)} inputMode="decimal" type="number" min="0" placeholder={actionSheet.placeholder} className="w-full outline-none bg-transparent mt-2" style={{ color: '#0d0d14', fontSize: '1.4rem', fontWeight: 900 }} />
                  </label>
                  <button onClick={submitActionSheet} disabled={Number(sheetValue) <= 0} className="w-full py-4 rounded-2xl" style={{ background: Number(sheetValue) > 0 ? '#171717' : '#d8d8e8', color: Number(sheetValue) > 0 ? '#CCCCF7' : '#7f7f9d', fontWeight: 900 }}>Continue</button>
                </div>
              </div>
            )}
            {!overlay && tab === 'home' && (
              <div style={{ position: 'absolute', bottom: 72, left: 0, right: 0, display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px 4px', scrollbarWidth: 'none', zIndex: 50 }}>
                {[
                  { label: 'Recs', key: 'recommendations', soon: false },
                  { label: 'Yield', key: 'yield', soon: true },
                  { label: 'Groups', key: 'social', soon: true },
                  { label: 'Challenges', key: 'challenges', soon: true },
                ].map(({ label, key, soon }) => (
                  <button
                    key={String(key)}
                    onClick={() => setOverlay(key as Overlay)}
                    style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)', color: '#3d3d6e', border: '1px solid rgba(204,204,247,0.7)', boxShadow: '0 2px 10px rgba(0,0,0,0.09)', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit' }}
                  >
                    {label}{soon ? ' · Soon' : ''}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {notice && (
          <div style={{ position: 'absolute', left: 18, right: 18, bottom: flow === 'app' ? 136 : 24, zIndex: 500, padding: '12px 14px', borderRadius: 16, background: '#171717', color: '#fff', fontSize: '0.82rem', lineHeight: 1.45, boxShadow: '0 8px 28px rgba(23,23,23,0.26)' }}>
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}
