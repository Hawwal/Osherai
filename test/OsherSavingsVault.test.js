const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("OsherSavingsVault", function () {
  let token;
  let vault;
  let owner;
  let user;
  let agent;
  let other;
  let goalId;
  let target;
  let deadline;

  beforeEach(async function () {
    [owner, user, agent, other] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy("Mock USDT", "USDT", 6);
    await token.waitForDeployment();

    const Vault = await ethers.getContractFactory("OsherSavingsVault");
    vault = await Vault.deploy(await token.getAddress(), agent.address);
    await vault.waitForDeployment();

    goalId = ethers.id("goal-rent");
    target = ethers.parseUnits("100", 6);
    deadline = (await timeNow()) + 30n * 24n * 60n * 60n;

    await token.mint(user.address, ethers.parseUnits("1000", 6));
  });

  it("creates a goal for the caller", async function () {
    await expect(vault.connect(user).createGoal(goalId, target, deadline))
      .to.emit(vault, "GoalCreated")
      .withArgs(goalId, user.address, target, deadline, anyValue);

    const goal = await vault.getGoal(goalId);
    expect(goal.user).to.equal(user.address);
    expect(goal.targetAmount).to.equal(target);
    expect(goal.currentAmount).to.equal(0n);
    expect(goal.status).to.equal(1n);
    expect(await vault.goalCount()).to.equal(1n);
  });

  it("rejects duplicate goal ids", async function () {
    await vault.connect(user).createGoal(goalId, target, deadline);

    await expect(
      vault.connect(other).createGoal(goalId, target, deadline)
    ).to.be.revertedWithCustomError(vault, "GoalAlreadyExists");
  });

  it("deposits approved funds into the user's goal", async function () {
    const amount = ethers.parseUnits("25", 6);
    await vault.connect(user).createGoal(goalId, target, deadline);
    await token.connect(user).approve(await vault.getAddress(), amount);

    await expect(vault.connect(user).depositToGoal(goalId, amount))
      .to.emit(vault, "GoalDeposit")
      .withArgs(goalId, user.address, amount, amount, anyValue);

    const goal = await vault.getGoal(goalId);
    expect(goal.currentAmount).to.equal(amount);
    expect(await vault.totalSaved()).to.equal(amount);
    expect(await token.balanceOf(await vault.getAddress())).to.equal(amount);
  });

  it("requires allowance before deposits", async function () {
    const amount = ethers.parseUnits("25", 6);
    await vault.connect(user).createGoal(goalId, target, deadline);

    await expect(
      vault.connect(user).depositToGoal(goalId, amount)
    ).to.be.revertedWithCustomError(vault, "InsufficientAllowance")
      .withArgs(amount, 0n);
  });

  it("locks withdrawals before deadline until target is reached", async function () {
    const amount = ethers.parseUnits("25", 6);
    await vault.connect(user).createGoal(goalId, target, deadline);
    await token.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).depositToGoal(goalId, amount);

    await expect(
      vault.connect(user).withdrawFromGoal(goalId, amount)
    ).to.be.revertedWithCustomError(vault, "GoalLocked");
  });

  it("allows withdrawal after the target is reached", async function () {
    await vault.connect(user).createGoal(goalId, target, deadline);
    await token.connect(user).approve(await vault.getAddress(), target);
    await vault.connect(user).depositToGoal(goalId, target);

    expect(await vault.canWithdraw(goalId)).to.equal(true);

    const withdrawAmount = ethers.parseUnits("40", 6);
    await expect(vault.connect(user).withdrawFromGoal(goalId, withdrawAmount))
      .to.emit(vault, "GoalWithdrawn")
      .withArgs(goalId, user.address, withdrawAmount, target - withdrawAmount, anyValue);

    const goal = await vault.getGoal(goalId);
    expect(goal.currentAmount).to.equal(target - withdrawAmount);
    expect(await vault.totalSaved()).to.equal(target - withdrawAmount);
  });

  it("allows withdrawal after the deadline", async function () {
    const amount = ethers.parseUnits("25", 6);
    await vault.connect(user).createGoal(goalId, target, deadline);
    await token.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).depositToGoal(goalId, amount);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deadline + 1n)]);
    await ethers.provider.send("evm_mine");

    await expect(vault.connect(user).withdrawFromGoal(goalId, amount))
      .to.emit(vault, "GoalWithdrawn");
  });

  it("records round-ups and enables the round-up flag", async function () {
    const amount = ethers.parseUnits("1.5", 6);
    await vault.connect(user).createGoal(goalId, target, deadline);
    await token.connect(user).approve(await vault.getAddress(), amount);

    await expect(vault.connect(user).recordRoundUp(goalId, amount))
      .to.emit(vault, "RoundUpRecorded")
      .withArgs(goalId, user.address, amount, amount, anyValue);

    const goal = await vault.getGoal(goalId);
    expect(goal.roundUpEnabled).to.equal(true);
  });

  it("lets only the configured agent auto-sweep approved funds", async function () {
    const amount = ethers.parseUnits("10", 6);
    await vault.connect(user).createGoal(goalId, target, deadline);
    await token.connect(user).approve(await vault.getAddress(), amount);

    await expect(
      vault.connect(other).autoSweep(goalId, amount)
    ).to.be.revertedWithCustomError(vault, "NotAgent");

    await expect(vault.connect(agent).autoSweep(goalId, amount))
      .to.emit(vault, "AutoSweep")
      .withArgs(goalId, user.address, agent.address, amount, amount, anyValue);
  });

  it("lets the owner pause and unpause vault actions", async function () {
    await vault.pause();

    await expect(
      vault.connect(user).createGoal(goalId, target, deadline)
    ).to.be.revertedWithCustomError(vault, "ContractPaused");

    await vault.unpause();
    await expect(vault.connect(user).createGoal(goalId, target, deadline))
      .to.emit(vault, "GoalCreated");
  });
});

async function timeNow() {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block.timestamp);
}
