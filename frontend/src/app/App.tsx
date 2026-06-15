import { useEffect, useMemo, useState } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { AuthScreen } from './components/AuthScreen';
import { WalletScreen } from './components/WalletScreen';
import { HomeScreen } from './components/HomeScreen';
import { GoalDetailsScreen } from './components/GoalDetailsScreen';
import { GoalsScreen } from './components/GoalsScreen';
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
type Overlay = null | 'goal-detail' | 'notifications' | 'recommendations' | 'yield' | 'social' | 'challenges';

const EMPTY_DATA: AppData = {
  goals: [],
  dashboard: {},
  activity: [],
  tips: [],
  recommendations: [],
  walletInfo: {},
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
    return response?.message || response?.error || 'I could not process that yet.';
  };

  const ensureVaultReady = () => {
    if (!walletInfo.address) throw new Error('Connect MiniPay or MetaMask first.');
    if (!data.contracts?.savingsVault) throw new Error('Savings vault is not configured yet. Set OSHER_SAVINGS_VAULT after deployment.');
    if (!data.contracts?.savingsToken) throw new Error('Savings token is not configured yet.');
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

  const topUpGoal = async (goal: SavingsGoal, presetAmount?: number) => {
    try {
      ensureVaultReady();
      if (!goal.vaultGoalCreated) throw new Error('Create this goal on-chain first, then top it up.');
      const suggested = presetAmount || goal.weeklyTargetUSDT || 1;
      const value = window.prompt('Amount in USDT', Number(suggested).toFixed(2));
      if (!value) return;
      const amount = Number(value);
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

  const toggleRoundUp = async (goal: SavingsGoal) => {
    const result = await apiJson<any>('/api/roundups/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id) + '/preference', {
      method: 'POST',
      body: JSON.stringify({ enabled: !goal.roundUpEnabled }),
    }).catch(err => ({ error: cleanWalletError(err) }));
    setNotice(result.message || result.error || 'Round-up preference updated.');
    await refreshData();
  };

  const logSpend = async (goal: SavingsGoal) => {
    const amount = Number(window.prompt('Amount spent in ' + (goal.displayCurrency || 'NGN'), ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const result = await apiJson<any>('/api/roundups/' + encodeURIComponent(SESSION_ID) + '/' + encodeURIComponent(goal.id) + '/spend', {
      method: 'POST',
      body: JSON.stringify({ amount, currency: goal.displayCurrency || 'NGN' }),
    }).catch(err => ({ error: cleanWalletError(err) }));
    setNotice(result.message || result.error || 'Spend logged.');
    await refreshData();
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

  const handleTabChange = (nextTab: Tab) => {
    setOverlay(null);
    setTab(nextTab);
  };

  const renderContent = () => {
    if (overlay === 'goal-detail') return <GoalDetailsScreen goal={selectedGoal} displayMode={displayMode} onBack={() => setOverlay(null)} onCreateVaultGoal={createVaultGoal} onTopUp={topUpGoal} onToggleRoundUp={toggleRoundUp} onLogSpend={logSpend} />;
    if (overlay === 'notifications') return <NotificationsScreen onBack={() => setOverlay(null)} />;
    if (overlay === 'recommendations') return <RecommendationsScreen recommendations={data.recommendations} onUpdate={updateRecommendation} />;
    if (overlay === 'yield') return <YieldScreen comingSoon />;
    if (overlay === 'social') return <SocialScreen comingSoon />;
    if (overlay === 'challenges') return <ChallengesScreen comingSoon />;

    switch (tab) {
      case 'home':
        return <HomeScreen data={data} displayMode={displayMode} userName={userDisplayName} onDisplayModeChange={setDisplayMode} onGoalClick={handleGoalClick} onChatClick={() => setTab('chat')} onNotifClick={() => setOverlay('notifications')} onAddGoal={() => setTab('chat')} onTopUp={topUpGoal} onWeeklyNudge={requestWeeklyNudge} />;
      case 'goals':
        return <GoalsScreen goals={data.goals} displayMode={displayMode} contracts={data.contracts as ContractsConfig} onGoalClick={handleGoalClick} onCreateVaultGoal={createVaultGoal} onTopUp={topUpGoal} onToggleRoundUp={toggleRoundUp} onLogSpend={logSpend} />;
      case 'chat':
        return <AIChatScreen userName={userDisplayName} onSendMessage={sendMessage} onDataChanged={refreshData} />;
      case 'tips':
        return <TipsScreen tips={data.tips} onExplainTip={sendMessage} />;
      case 'profile':
        return <ProfileScreen userName={userDisplayName} walletInfo={walletInfo} displayMode={displayMode} onDisplayModeChange={setDisplayMode} onDisconnect={disconnectWallet} onProfileUpdate={handleProfileUpdate} onOpenChat={() => setTab('chat')} />;
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
