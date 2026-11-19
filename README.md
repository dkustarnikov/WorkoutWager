# WorkoutWager

A serverless REST API that keeps you motivated by putting real money on the line.
Set a goal, break it into milestones with deadlines, and wager an amount. Hit your
milestones and earn your reward. Miss them and pay a penalty. Stakes make habits stick.

- **Stack:** TypeScript · AWS CDK (via projen) · API Gateway · Lambda · DynamoDB · EventBridge · SQS · Cognito
- **API reference:** [`api-specs/api-specs.yaml`](api-specs/api-specs.yaml) (OpenAPI 3.0, validated) · ready-made requests in [`bruno/`](bruno)

---

## How it works

1. **Create a goal.** Say what you want to achieve (e.g. "Run 3x per week"), set a deadline,
   split it into milestones that each have a deadline and a dollar amount, and choose where
   rewards and penalties go (e.g. savings or charity).
2. **Complete milestones.** Mark each milestone done through the API before its deadline.
   If you don't, the system marks it **missed** automatically when the deadline passes.
3. **Settlement.** When every milestone is resolved (completed or missed), a transaction
   record is written with the rewards and penalties.
4. **Cancel any time.** Cancelling a goal before it resolves has no financial consequence.

### Penalty modes

| Mode | What happens |
|---|---|
| **Per-milestone** (default) | Each milestone settles on its own. Completed → reward of `monetaryValue`. Missed → penalty of `monetaryValue × (1 + penaltyInterestRate / 100)`. |
| **All-or-nothing** (`allOrNothing: true`) | The first missed milestone fails the whole goal immediately: penalty of `totalAmount × (1 + penaltyInterestRate / 100)`, and all remaining milestones are marked missed. |

Example: a $50 milestone with a 20% interest rate costs **$60** if missed and earns **$50** if completed.

### Business rules

- Milestone `monetaryValue`s must add up exactly to `totalAmount`.
- The last milestone's deadline must equal the goal's `deadline`, and deadlines must be in the future.
- Milestone names and deadlines must be unique within a goal.
- Only the server sets `completion`: through the complete endpoint, or automatically at the deadline.
  Clients can't pre-set it or change it with an update.
- **Completed**, **failed** and **cancelled** goals are locked. They can't be updated or have milestones added or completed.
- Cancelling removes all pending deadline rules and writes no transaction.

---

## Security model

- Every endpoint requires a **Cognito ID token**: `Authorization: Bearer <token>`.
- A Lambda authorizer verifies the token (RS256, against the user pool's JWKS) and passes the user's
  Cognito `sub` to the handlers. **That is the only source of identity.** Any `userId` in a request
  body is ignored. It's still accepted, so older clients keep working.
- Users can only see or change **their own** goals, milestones, transactions and profile.
  Another user's goal returns `404`, exactly like a goal that doesn't exist, so goal IDs can't be probed.
- Tokens and their claims are never logged, and errors don't leak internal details.

---

## Architecture

```
Client ──► API Gateway ──► Lambda authorizer (verifies Cognito JWT)
                │
                ▼
         Lambda handlers ──► DynamoDB: Goals · Transactions · UserInfo
                │
                └─ schedules one EventBridge rule per milestone deadline
                                   │
                                   ▼
                     SQS (MilestoneQueue) ──► milestone-handler Lambda
                                              (marks missed, settles the goal)
```

All of the infrastructure is defined in [`src/main.ts`](src/main.ts).

| Service | Role |
|---|---|
| API Gateway | REST API; every route goes through the token authorizer |
| Lambda (Node.js 20) | One function per operation |
| DynamoDB | `Goals` (GSI `userIdIndex`), `Transactions` (GSI `goalIdIndex`), `UserInfo` |
| EventBridge | One scheduled rule per milestone deadline |
| SQS | Buffers deadline events for `milestone-handler` |
| Cognito | User pool with email sign-in; one app client for user login, one for client credentials |

---

## API at a glance

| Method | Path | What it does |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/goals` | List your goals |
| `POST` | `/goal` | Create a goal |
| `GET` | `/goal/{goalId}` | Get a goal (includes `completionPercentage`) |
| `PUT` | `/goal/{goalId}` | Update a goal (completion state is preserved) |
| `DELETE` | `/goal/{goalId}` | Delete a goal and its deadline rules |
| `POST` | `/goal/{goalId}/cancel` | Cancel with no financial consequence |
| `POST` | `/goal/{goalId}/milestone` | Add a milestone |
| `PUT` | `/goal/{goalId}/milestone/{milestoneId}` | Update a milestone |
| `POST` | `/goal/{goalId}/milestone/{milestoneId}/complete` | Mark a milestone completed |
| `GET` | `/goal/{goalId}/transactions` | Settlement history, newest first |
| `POST` | `/configure-user` | Create or refresh your profile |
| `POST` | `/get-user-info` | Get your profile |

Full request and response schemas are in [`api-specs/api-specs.yaml`](api-specs/api-specs.yaml).

---

## Getting started

### Prerequisites
- Node.js 20 or newer
- An AWS account and the AWS CLI configured (`aws configure` or a named profile)
- A [CDK bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) in the target account and region (`npx cdk bootstrap`)

### Install and test
```bash
npm ci
npx projen test      # Jest unit tests + CDK snapshot test + ESLint
```

> On low-memory machines (e.g. a Raspberry Pi), ts-jest's per-file type-checking can run out of
> memory. In that case, type-check once with `npx tsc --noEmit -p tsconfig.dev.json` and run Jest
> with `--runInBand`.

### Deploy
```bash
npx projen deploy    # deploys the `workout-wager-dev` stack to your CLI's default account and region
```
The stack outputs everything a client needs: `BrunoBaseUrl` (the API URL), `BrunoUserPoolClientId`,
`UserPoolId`, `CognitoDomain`, plus a ready-to-run `BrunoGetTokenCommand`.

> The stack name `workout-wager-dev` and the Cognito domain prefix `workout-wager` identify the
> deployed resources. Changing either makes CloudFormation **replace** the user pool and tables,
> which loses existing users and data.

### Try it with Bruno
1. Open the [`bruno/`](bruno) folder in [Bruno](https://www.usebruno.com/).
2. In `environments/dev.bru`, set `baseUrl`, `cognitoUrl` and `cognitoClientId` from the stack outputs.
3. Run **00-auth → sign-up**, then **confirm-sign-up**, then **login**. Login saves `authToken`
   and `refreshToken` into the environment for you. **Don't commit those values.**
4. Call any other request.

### Teardown
```bash
npx projen destroy
```

---

## Development

`.projenrc.ts` is the single source of truth for `package.json`, the `tsconfig*.json` files and the
Jest and ESLint config. Change `.projenrc.ts`, then run `npx projen`. **Never hand-edit the generated files.**

```
src/
├── main.ts                 # CDK stack: all infrastructure
├── common/
│   ├── auth.ts             # Caller identity and ownership checks
│   ├── helpers.ts          # Validation schemas, API responses, cron conversion
│   ├── models.ts           # Goal, Milestone, Transaction, User
│   └── transactionUtils.ts # Settlement: penalties, completion %, status
└── lambdas/                # One folder per Lambda
    ├── authorizer/         # Verifies the Cognito JWT
    ├── create-rule/        # POST   /goal
    ├── get-rule-by-id/     # GET    /goal/{goalId}
    ├── get-all-rules/      # GET    /goals
    ├── update-rule/        # PUT    /goal/{goalId}
    ├── delete-rule/        # DELETE /goal/{goalId}
    ├── cancel-goal/        # POST   /goal/{goalId}/cancel
    ├── add-milestone/      # POST   /goal/{goalId}/milestone
    ├── update-milestone/   # PUT    /goal/{goalId}/milestone/{milestoneId}
    ├── complete-milestone/ # POST   /goal/{goalId}/milestone/{milestoneId}/complete
    ├── milestone-handler/  # SQS consumer: marks missed milestones and settles goals
    ├── get-transactions/   # GET    /goal/{goalId}/transactions
    ├── configure-user/     # POST   /configure-user
    ├── get-user-info-get/  # POST   /get-user-info
    └── health/             # GET    /health

test/
├── fixtures.ts             # Shared factories and constants
├── testHelper.ts           # Mock API Gateway event (caller = fixture owner)
├── mockContext.ts          # Timer-free Lambda context
├── common/                 # Settlement logic tests
└── lambdas/                # One test file per Lambda
```

(Several folders still use the older "rule" name for goals.)

---

## Known limitations and roadmap

- **One EventBridge rule per milestone.** Rules are capped per account (300 by default), and they
  aren't removed after they fire. [EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html)
  one-time schedules, with auto-delete, are the better fit.
- **Settlement isn't idempotent yet.** An SQS retry, or a completion racing the deadline handler,
  could write a duplicate transaction. Fix: conditional writes keyed on the goal's version or status.
- **Money is stored as floating-point dollars.** Integer cents would avoid rounding drift.
- **The queue has no dead-letter queue**, and messages are kept for 1 day.
- **AWS SDK for JavaScript v2** is end-of-support. Migrate to v3 (`@aws-sdk/*`).
- **No real money moves yet.** Transactions are records only; payout integration is future work.

---

## License

[Apache-2.0](LICENSE)
