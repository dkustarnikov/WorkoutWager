# WorkoutWager

A serverless REST API that helps you stay motivated by putting real money on the line. Set a fitness or wellness goal, break it into milestones with deadlines, and wager an amount. Hit your milestones and earn your reward — miss them and face a financial penalty. Stakes make habits stick.

---

## How it works

1. **Create a goal** — Define what you want to achieve (e.g. "Run 3x per week"), set a deadline, split it into milestones with individual deadlines and monetary values, and configure where rewards and penalties go (e.g. savings account, charity).

2. **Milestones track your progress** — Each milestone has its own deadline. When you complete one, you mark it done via the API. If you don't, the system automatically marks it missed when the deadline passes.

3. **Financial settlement** — When all milestones resolve (completed or missed), the system writes a transaction record with reward and/or penalty entries based on your results.

4. **Cancel any time** — You can cancel a goal with no financial consequence as long as it hasn't already been resolved.

---

## Penalty modes

### Per-milestone (default)
Each milestone is settled independently. Completing one earns its `monetaryValue` as a reward; missing one incurs a penalty of `monetaryValue × (1 + penaltyInterestRate / 100)`.

**Example:** $50 milestone with 20% interest rate → $60 penalty if missed, $50 reward if completed.

### All-or-nothing (`allOrNothing: true`)
Any single missed milestone triggers an immediate full goal failure. The penalty is `totalAmount × (1 + penaltyInterestRate / 100)` applied at once and all remaining milestones are automatically marked missed.

**Example:** $100 goal with 20% interest → $120 penalty the moment any milestone is missed.

---

## Architecture

Fully serverless on AWS, deployed via CDK:

```
API Gateway → Lambda functions
                   ↓
              DynamoDB (Goals, Transactions, UserInfo)
                   ↓
         EventBridge (scheduled rules per milestone deadline)
                   ↓
                  SQS (MilestoneQueue)
                   ↓
         milestone-handler Lambda (marks missed, settles goal)
```

| Service | Role |
|---|---|
| **API Gateway** | REST endpoints with JWT authorizer |
| **Lambda (Node.js 20.x)** | Business logic for each operation |
| **DynamoDB** | `Goals`, `Transactions`, `UserInfo` tables |
| **EventBridge** | Fires one scheduled rule per milestone at its deadline |
| **SQS** | Buffers EventBridge events before the milestone handler |

---

## API Endpoints

### Health
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |

### Goals
| Method | Path | Description |
|---|---|---|
| `POST` | `/goal` | Create a new goal |
| `GET` | `/goal/{goalId}` | Get a goal by ID (includes `completionPercentage`) |
| `PUT` | `/goal/{goalId}` | Update a goal |
| `DELETE` | `/goal/{goalId}` | Delete a goal and clean up scheduled rules |
| `POST` | `/goal/{goalId}/cancel` | Cancel a goal (no financial consequence) |
| `GET` | `/goals` | List all goals for the authenticated user |

### Milestones
| Method | Path | Description |
|---|---|---|
| `POST` | `/goal/{goalId}/milestone` | Add a milestone to an existing goal |
| `PUT` | `/goal/{goalId}/milestone/{milestoneId}` | Update a milestone |
| `POST` | `/goal/{goalId}/milestone/{milestoneId}/complete` | Manually mark a milestone as completed |

### Transactions
| Method | Path | Description |
|---|---|---|
| `GET` | `/goal/{goalId}/transactions` | Get transaction history for a goal |

### Users
| Method | Path | Description |
|---|---|---|
| `POST` | `/configure-user` | Create or configure a user profile |
| `POST` | `/get-user-info` | Retrieve user info |

---

## Data model

### Goal

```typescript
{
  goalId: string;
  userId: string;
  goalType: string;           // e.g. "fitness"
  goalName: string;
  generalObjective: string;
  totalAmount: number;        // total wager in dollars
  deadline: string;           // ISO 8601 — must match last milestone deadline
  milestones: Milestone[];
  allOrNothing: boolean;      // true = any miss triggers full penalty
  rewardDestination: string;  // e.g. "savings" (default)
  penaltyDestination: string; // e.g. "savings" or "charity"
  penaltyInterestRate: number;// extra % on top of penalty (0 = no interest)
  status: GoalStatus;         // created | inProgress | completed | failed | cancelled
  createdAt: string;
  updatedAt: string;
}
```

### Milestone

```typescript
{
  milestoneId: string;
  milestoneName: string;
  type: string;
  milestoneDeadline: string;  // ISO 8601
  monetaryValue: number;      // portion of totalAmount
  milestoneCounter: number;   // order within the goal
  completion?: boolean;       // true = completed, false = missed, undefined = pending
}
```

### Goal status lifecycle

```
created → inProgress → completed
                     → failed
          (any time) → cancelled
```

### Transaction

Written automatically when all milestones resolve. Contains individual `entries` (reward/penalty per milestone or a single all-or-nothing entry), a `milestonesSummary`, and a `goalSnapshot` for historical reference.

---

## Business rules

- Milestone `monetaryValue` values must sum exactly to `totalAmount`.
- The last milestone's deadline must match the goal's `deadline`.
- Deadlines must be in the future at creation time.
- Milestone names and deadlines must be unique within a goal.
- Goals in `completed`, `failed`, or `cancelled` status cannot be edited or have milestones added.
- Cancelling a goal removes all pending EventBridge rules but writes no transaction.

---

## Project structure

```
src/
├── main.ts                   # CDK stack — all infrastructure defined here
├── common/
│   ├── models.ts             # Goal, Milestone, Transaction, User interfaces & enums
│   ├── helpers.ts            # Validation schemas, API response helper, cron converter
│   └── transactionUtils.ts  # Settlement logic (penalty calc, completion %, status update)
└── lambdas/
    ├── authorizer/           # JWT authorizer for API Gateway
    ├── create-rule/          # POST /goal
    ├── get-rule-by-id/       # GET /goal/{goalId}
    ├── get-all-rules/        # GET /goals
    ├── update-rule/          # PUT /goal/{goalId}
    ├── delete-rule/          # DELETE /goal/{goalId}
    ├── cancel-goal/          # POST /goal/{goalId}/cancel
    ├── add-milestone/        # POST /goal/{goalId}/milestone
    ├── update-milestone/     # PUT /goal/{goalId}/milestone/{milestoneId}
    ├── complete-milestone/   # POST /goal/{goalId}/milestone/{milestoneId}/complete
    ├── milestone-handler/    # SQS consumer — auto-marks missed milestones at deadline
    ├── get-transactions/     # GET /goal/{goalId}/transactions
    ├── configure-user/       # POST /configure-user
    ├── get-user-info-get/    # POST /get-user-info
    └── health/               # GET /health

test/
├── fixtures.ts               # Shared test data — factories and constants for all tests
├── common/
│   └── transactionUtils.test.ts
└── lambdas/
    └── *.test.ts             # One test file per Lambda
```

---

## Getting started

### Prerequisites
- Node.js 20+
- AWS CLI configured with appropriate credentials
- AWS CDK v2 installed (`npm install -g aws-cdk`)

### Install dependencies
```bash
npm install
```

### Run tests
```bash
npm test
```

### Deploy
```bash
npx projen deploy
```

### Destroy
```bash
npx projen destroy
```

---

## Tech stack

| | |
|---|---|
| **Language** | TypeScript |
| **Runtime** | Node.js 20.x |
| **IaC** | AWS CDK v2 (via Projen) |
| **Validation** | Yup |
| **Auth** | JWT (via API Gateway Lambda authorizer) |
| **Testing** | Jest + ts-jest |
