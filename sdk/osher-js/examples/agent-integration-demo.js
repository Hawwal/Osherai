const { OsherClient } = require("../index");

async function main() {
  const osher = new OsherClient({
    baseUrl: process.env.OSHER_BASE_URL || "https://osherai.onrender.com",
    apiKey: process.env.OSHER_API_KEY,
  });

  const parse = await osher.parseGoal("Save 150,000 naira for rent by December 1", {
    walletAddress: "0x0000000000000000000000000000000000000000",
  });
  console.log("Parsed goal:", JSON.stringify(parse, null, 2));

  const plan = await osher.createGoalPlan({
    amount: 150000,
    currency: "NGN",
    purpose: "rent",
    deadline: "December 1",
  });
  console.log("Savings plan:", JSON.stringify(plan, null, 2));

  const intent = await osher.createDepositIntent({
    goal: plan.goal,
    amountUSDT: plan.goal.weeklyTargetUSDT,
  });
  console.log("Deposit intent:", JSON.stringify(intent, null, 2));
}

main().catch(error => {
  console.error(error.code || "error", error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
