const { OsherClient } = require("../index");

async function main() {
  const osher = new OsherClient({
    baseUrl: process.env.OSHER_BASE_URL || "https://osherai.onrender.com",
    apiKey: process.env.OSHER_API_KEY,
  });

  const plan = await osher.createGoalPlan({
    amount: 150000,
    currency: "NGN",
    purpose: "rent",
    deadline: "December 1",
  });

  console.log("Goal:", plan.goal.name);
  console.log("Target USDT:", plan.goal.targetAmountUSDT);
  console.log("Weekly USDT:", plan.goal.weeklyTargetUSDT);
  console.log("Summary:", plan.summary);

  const intent = await osher.createDepositIntent({
    goal: plan.goal,
    amountUSDT: plan.goal.weeklyTargetUSDT,
  });

  console.log("Deposit intent:", intent.humanSummary);
}

main().catch(error => {
  console.error(error.code || "error", error.message);
  process.exit(1);
});
