# Osher JavaScript SDK

JavaScript client for Osher Infrastructure.

## Install

During private beta, import directly from the repository:

```js
const { OsherClient } = require("./sdk/osher-js");
```

When published as a package:

```bash
npm install @osher-ai/sdk
```

## Quickstart

```js
const { OsherClient } = require("@osher-ai/sdk");

const osher = new OsherClient({
  baseUrl: "https://osherai.onrender.com",
  apiKey: process.env.OSHER_API_KEY,
});

const plan = await osher.createGoalPlan({
  amount: 150000,
  currency: "NGN",
  purpose: "rent",
  deadline: "December 1",
});

console.log(plan.goal.weeklyTargetUSDT);
```

## Methods

- `health()`
- `parseGoal(message, context)`
- `createGoalPlan(input)`
- `generateNudge(input)`
- `generateTip(input)`
- `createDepositIntent(input)`
- `getSavingsSummary(input)`

## Error Handling

```js
try {
  await osher.createGoalPlan({ amount: 0 });
} catch (error) {
  console.log(error.code);
  console.log(error.message);
  console.log(error.docsUrl);
}
```

## Safety

Deposit intents do not move funds. Builders must still request wallet approval from the user.
