// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title OsherSavingsVault
 * @notice Goal-based savings vault for USDT/cUSD-style ERC-20 savings on Celo.
 * @dev The frontend/backend should hash the persisted goal id into bytes32 before calling.
 */

interface IERC20Vault {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract OsherSavingsVault {
    enum GoalStatus {
        None,
        Active,
        Completed,
        Paused,
        Withdrawn
    }

    struct Goal {
        address user;
        uint256 targetAmount;
        uint256 currentAmount;
        uint256 deadline;
        bool roundUpEnabled;
        GoalStatus status;
        uint256 createdAt;
    }

    address public owner;
    address public agent;
    address public immutable savingsToken;

    bool public paused;
    uint256 public goalCount;
    uint256 public totalSaved;

    mapping(bytes32 => Goal) private goals;
    mapping(address => bytes32[]) private userGoalIds;

    event GoalCreated(
        bytes32 indexed goalId,
        address indexed user,
        uint256 targetAmount,
        uint256 deadline,
        uint256 timestamp
    );
    event GoalDeposit(
        bytes32 indexed goalId,
        address indexed user,
        uint256 amount,
        uint256 currentAmount,
        uint256 timestamp
    );
    event RoundUpRecorded(
        bytes32 indexed goalId,
        address indexed user,
        uint256 amount,
        uint256 currentAmount,
        uint256 timestamp
    );
    event AutoSweep(
        bytes32 indexed goalId,
        address indexed user,
        address indexed agent,
        uint256 amount,
        uint256 currentAmount,
        uint256 timestamp
    );
    event GoalWithdrawn(
        bytes32 indexed goalId,
        address indexed user,
        uint256 amount,
        uint256 remainingAmount,
        uint256 timestamp
    );
    event GoalStatusUpdated(bytes32 indexed goalId, GoalStatus oldStatus, GoalStatus newStatus);
    event RoundUpPreferenceUpdated(bytes32 indexed goalId, bool enabled);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    error NotOwner();
    error NotAgent();
    error NotGoalOwner();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidGoalId();
    error InvalidDeadline();
    error GoalAlreadyExists();
    error GoalNotFound();
    error GoalNotActive();
    error GoalLocked(uint256 deadline, uint256 currentAmount, uint256 targetAmount);
    error InsufficientGoalBalance(uint256 requested, uint256 available);
    error InsufficientAllowance(uint256 required, uint256 actual);
    error TransferFailed();
    error ContractPaused();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier notPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier existingGoal(bytes32 goalId) {
        if (goals[goalId].user == address(0)) revert GoalNotFound();
        _;
    }

    modifier onlyGoalOwner(bytes32 goalId) {
        if (goals[goalId].user != msg.sender) revert NotGoalOwner();
        _;
    }

    constructor(address _savingsToken, address _agent) {
        if (_savingsToken == address(0) || _agent == address(0)) revert ZeroAddress();
        owner = msg.sender;
        savingsToken = _savingsToken;
        agent = _agent;
    }

    function createGoal(bytes32 goalId, uint256 targetAmount, uint256 deadline) external notPaused {
        if (goalId == bytes32(0)) revert InvalidGoalId();
        if (targetAmount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (goals[goalId].user != address(0)) revert GoalAlreadyExists();

        goals[goalId] = Goal({
            user: msg.sender,
            targetAmount: targetAmount,
            currentAmount: 0,
            deadline: deadline,
            roundUpEnabled: false,
            status: GoalStatus.Active,
            createdAt: block.timestamp
        });

        userGoalIds[msg.sender].push(goalId);
        goalCount += 1;

        emit GoalCreated(goalId, msg.sender, targetAmount, deadline, block.timestamp);
    }

    function depositToGoal(bytes32 goalId, uint256 amount)
        external
        notPaused
        existingGoal(goalId)
        onlyGoalOwner(goalId)
    {
        _deposit(goalId, msg.sender, amount, false, false);
    }

    function recordRoundUp(bytes32 goalId, uint256 microAmount)
        external
        notPaused
        existingGoal(goalId)
        onlyGoalOwner(goalId)
    {
        if (!goals[goalId].roundUpEnabled) {
            goals[goalId].roundUpEnabled = true;
            emit RoundUpPreferenceUpdated(goalId, true);
        }
        _deposit(goalId, msg.sender, microAmount, true, false);
    }

    /**
     * @notice Pulls approved idle funds from the goal owner into their goal.
     * @dev The user must approve this vault before the backend agent can call autoSweep.
     */
    function autoSweep(bytes32 goalId, uint256 amount) external notPaused existingGoal(goalId) onlyAgent {
        address user = goals[goalId].user;
        _deposit(goalId, user, amount, false, true);
    }

    /**
     * @notice Withdraws from a goal after its deadline or once the target has been reached.
     */
    function withdrawFromGoal(bytes32 goalId, uint256 amount)
        external
        notPaused
        existingGoal(goalId)
        onlyGoalOwner(goalId)
    {
        if (amount == 0) revert ZeroAmount();

        Goal storage goal = goals[goalId];
        if (goal.status != GoalStatus.Active && goal.status != GoalStatus.Completed) revert GoalNotActive();
        if (block.timestamp < goal.deadline && goal.currentAmount < goal.targetAmount) {
            revert GoalLocked(goal.deadline, goal.currentAmount, goal.targetAmount);
        }
        if (amount > goal.currentAmount) revert InsufficientGoalBalance(amount, goal.currentAmount);

        goal.currentAmount -= amount;
        totalSaved -= amount;

        if (goal.currentAmount == 0) {
            GoalStatus oldStatus = goal.status;
            goal.status = GoalStatus.Withdrawn;
            emit GoalStatusUpdated(goalId, oldStatus, GoalStatus.Withdrawn);
        }

        bool ok = IERC20Vault(savingsToken).transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();

        emit GoalWithdrawn(goalId, msg.sender, amount, goal.currentAmount, block.timestamp);
    }

    function setRoundUpEnabled(bytes32 goalId, bool enabled)
        external
        existingGoal(goalId)
        onlyGoalOwner(goalId)
    {
        goals[goalId].roundUpEnabled = enabled;
        emit RoundUpPreferenceUpdated(goalId, enabled);
    }

    function pauseGoal(bytes32 goalId) external existingGoal(goalId) onlyGoalOwner(goalId) {
        _setGoalStatus(goalId, GoalStatus.Paused);
    }

    function resumeGoal(bytes32 goalId) external existingGoal(goalId) onlyGoalOwner(goalId) {
        _setGoalStatus(goalId, GoalStatus.Active);
    }

    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        emit AgentUpdated(agent, newAgent);
        agent = newAgent;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function getGoal(bytes32 goalId) external view existingGoal(goalId) returns (Goal memory) {
        return goals[goalId];
    }

    function getUserGoals(address user) external view returns (bytes32[] memory) {
        return userGoalIds[user];
    }

    function canWithdraw(bytes32 goalId) external view existingGoal(goalId) returns (bool) {
        Goal memory goal = goals[goalId];
        return goal.currentAmount > 0 && (block.timestamp >= goal.deadline || goal.currentAmount >= goal.targetAmount);
    }

    function _deposit(bytes32 goalId, address from, uint256 amount, bool isRoundUp, bool isAutoSweep) private {
        if (amount == 0) revert ZeroAmount();

        Goal storage goal = goals[goalId];
        if (goal.status != GoalStatus.Active) revert GoalNotActive();

        IERC20Vault token = IERC20Vault(savingsToken);
        uint256 allowed = token.allowance(from, address(this));
        if (allowed < amount) revert InsufficientAllowance(amount, allowed);

        bool ok = token.transferFrom(from, address(this), amount);
        if (!ok) revert TransferFailed();

        goal.currentAmount += amount;
        totalSaved += amount;

        if (goal.currentAmount >= goal.targetAmount && goal.status != GoalStatus.Completed) {
            GoalStatus oldStatus = goal.status;
            goal.status = GoalStatus.Completed;
            emit GoalStatusUpdated(goalId, oldStatus, GoalStatus.Completed);
        }

        if (isAutoSweep) {
            emit AutoSweep(goalId, from, msg.sender, amount, goal.currentAmount, block.timestamp);
        } else if (isRoundUp) {
            emit RoundUpRecorded(goalId, from, amount, goal.currentAmount, block.timestamp);
        } else {
            emit GoalDeposit(goalId, from, amount, goal.currentAmount, block.timestamp);
        }
    }

    function _setGoalStatus(bytes32 goalId, GoalStatus newStatus) private {
        GoalStatus oldStatus = goals[goalId].status;
        if (oldStatus == GoalStatus.Withdrawn) revert GoalNotActive();
        goals[goalId].status = newStatus;
        emit GoalStatusUpdated(goalId, oldStatus, newStatus);
    }
}
