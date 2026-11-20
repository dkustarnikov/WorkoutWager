# WorkoutWager

A serverless REST API that keeps you motivated by putting real money on the line.
Set a goal, break it into milestones with deadlines, and wager an amount. Hit your
milestones and earn your reward. Miss them and pay a penalty. Stakes make habits stick.

- **Stack:** TypeScript · AWS CDK (via projen) · API Gateway · Lambda · DynamoDB · EventBridge · SQS · Cognito
- **API reference:** [`api-specs/api-specs.yaml`](api-specs/api-specs.yaml) (OpenAPI 3.0, validated) · ready-made requests in [`bruno/`](bruno)

---

## How it works

WorkoutWager runs on **play money** for now. Every user starts with a **balance of 50**.

1. **Create a goal.** Say what you want to achieve (e.g. "Run 3x per week"), set a deadline,
   split it into milestones with their own deadlines, and choose a **stake**. The stake moves
   from your `balance` into `pendingBalance` (escrow). If your balance is too low, the goal is rejected.
2. **Complete milestones** through the API before their deadlines. If you don't, the system
   marks the milestone **missed** automatically when its deadline passes.
3. **Settlement.** Each completed milestone returns its share of the stake to your balance, plus
   **10% of it as stars**. Each missed milestone **forfeits** its share. Every movement is
   recorded as a transaction.
4. **Stars rank you** on the leaderboard.
5. **Cancel any time.** Whatever stake is still escrowed comes back to your balance, with no penalty.

### Settlement modes

| Mode | What happens |
|---|---|
| **Per-milestone** (default) | Each milestone settles on its own: completed → stake back + 10% stars; missed → stake forfeited. |
| **All-or-nothing** (`allOrNothing: true`) | Nothing settles until the end. Complete every milestone → the whole stake back + 10% stars. Miss any → the whole stake is forfeited immediately and the goal fails. |

Example: a $50 milestone returns **$50 + 5 stars** if completed and loses **$50** if missed.

### Business rules

- The stake is split evenly across milestones, unless every milestone has an explicit `stake`.
  Explicit stakes must add up exactly to the goal's stake.
- The last milestone's deadline must equal the goal's `deadline`, and deadlines must be in the future.
- Milestone names and deadlines must be unique within a goal.
- A goal can only be **edited** (details, stake, milestones) while it's still `created`, meaning no
  milestone has been resolved yet. A changed stake escrows or releases the difference.
- Only the server sets `completion`: through the complete endpoint, or automatically at the deadline.
- **Completed**, **failed** and **cancelled** goals are locked.
- Balance changes are conditional writes: a balance can never go negative, and a retried
  deadline event can't forfeit the same milestone twice.

---

## Security model

- Every endpoint requires a **Cognito ID token**: `Authorization: Bearer <token>`.
- A Lambda authorizer verifies the token (RS256, against the user pool's JWKS) and passes the user's
  Cognito `sub` to the handlers. **That is the only source of identity.** Any `userId` in a request
  body is ignored. It's still accepted, so older clients keep working.
- Users can only see or change **their own** goals, milestones, transactions and profile.
  Another user's goal returns `404`, exactly like a goal that doesn't exist, so goal IDs can't be probed.
- The authorizer accepts only tokens issued by this user pool **to an allowed app client**
  (`COGNITO_ALLOWED_CLIENT_IDS`). Tokens and their claims are never logged, and errors don't
  leak internal details.
- The leaderboard is visible to every signed-in user, so usernames that are email addresses are masked.

---

## Architecture

```
Android app · Web UI · Bruno · MCP
        │  https://wager.api.dkustarnikov.com  (API Gateway custom domain, DNS in Cloudflare)
        ▼
  API Gateway ──► Lambda authorizer (verifies Cognito JWT + app client)
        │
        ▼
  Lambda handlers ──► DynamoDB: Goals · Transactions · UserInfo (balances, stars)
        │
        └─ schedules one EventBridge rule per milestone deadline
                           │
                           ▼
             SQS (MilestoneQueue) ──► milestone-handler Lambda
                                      (marks missed, forfeits stake, settles the goal)
```

All of the infrastructure is defined in [`src/main.ts`](src/main.ts). The stack is pinned to **us-east-2**.

| Service | Role |
|---|---|
| API Gateway | REST API with a custom domain (ACM certificate), CORS preflight for the web origins, token authorizer on every route except `/health` |
| Lambda (Node.js 20) | One function per operation |
| DynamoDB | `Goals` (GSI `userIdIndex`), `Transactions` (GSI `goalIdIndex`), `UserInfo` (profile, balance, stars) |
| EventBridge | One scheduled rule per milestone deadline |
| SQS | Buffers deadline events for `milestone-handler` |
| Cognito | User pool with email sign-in. **App client** (no secret, PKCE) for Android, the web UI and Bruno; a client-credentials client for machine access |

---

## API at a glance

| Method | Path | What it does |
|---|---|---|
| `GET` | `/health` | Health check (public) |
| `GET` | `/goals` | List your goals |
| `POST` | `/goal` | Create a goal (escrows the stake) |
| `GET` | `/goal/{goalId}` | Get a goal (includes `completionPercentage`) |
| `PUT` | `/goal/{goalId}` | Update a goal before it starts |
| `DELETE` | `/goal/{goalId}` | Delete a goal (releases any escrow) |
| `POST` | `/goal/{goalId}/cancel` | Cancel with no penalty (escrow returned) |
| `POST` | `/goal/{goalId}/milestone` | Add a milestone |
| `PUT` | `/goal/{goalId}/milestone/{milestoneId}` | Update a milestone |
| `POST` | `/goal/{goalId}/milestone/{milestoneId}/complete` | Mark a milestone completed (stake back + stars) |
| `GET` | `/goal/{goalId}/transactions` | Settlement history, newest first |
| `POST` | `/configure-user` | Create or refresh your profile |
| `POST` | `/get-user-info` | Get your profile (balance, pending, stars) |
| `POST` | `/configure-payments` | Switch play money on/off (real payments are a stub for now) |
| `GET` | `/leaderboard` | Everyone ranked by stars |

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
npx projen deploy    # updates the `workout-wager-dev` stack in us-east-2
```
The stack outputs everything a client needs: `ApiBaseUrl`, `AppClientId`, `AppAuthorizeUrl`,
`UserPoolId`, `CognitoDomain`, the Bruno values, and a ready-to-run `BrunoGetTokenCommand`.

**Custom domain (first deploy only).** DNS lives in Cloudflare, so the ACM certificate is validated
by hand. Follow the `CloudflareDnsInstructions` output: add the certificate's validation CNAME,
then point `wager.api.dkustarnikov.com` at `ApiCustomDomainTarget`. Both records are DNS-only (grey cloud).

> The stack name `workout-wager-dev`, the Cognito domain prefix `workout-wager` and the resource
> logical IDs identify the live resources. Changing them makes CloudFormation **replace** the user
> pool and tables, which loses existing users and data. Before deploying, run `npx cdk diff` and
> check that nothing is replaced.

### Try it with Bruno
1. Open the [`bruno/`](bruno) folder in [Bruno](https://www.usebruno.com/).
2. In `environments/dev.bru`, set `baseUrl` (`ApiBaseUrl`), `cognitoUrl` and `cognitoClientId` (`AppClientId`) from the stack outputs.
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
│   ├── models.ts           # Goal, Milestone, Transaction, User + economy constants
│   └── transactionUtils.ts # Stake allocation, escrow / refund / forfeit, stars, settlement
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
    ├── configure-payments/ # POST   /configure-payments
    ├── get-leaderboard/    # GET    /leaderboard
    └── health/             # GET    /health (public)

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
  aren't removed after a missed deadline fires. [EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html)
  one-time schedules, with auto-delete, are the better fit.
- **Settlement spans several writes** (balance, stars, goal, transaction). They aren't one atomic
  transaction, so a failure partway through can leave a goal and a balance briefly out of step.
  Balances themselves are protected by conditional writes. `TransactWriteItems` would make it atomic.
- **The leaderboard scans the whole `UserInfo` table.** That's fine for a small user base; at scale
  it needs a GSI or a cached ranking.
- **Play money only.** `configure-payments` records a `stub` provider; no real money moves yet.
- **The queue has no dead-letter queue**, and messages are kept for 1 day.
- **AWS SDK for JavaScript v2** is end-of-support. Migrate to v3 (`@aws-sdk/*`).

---

## License

[Apache-2.0](LICENSE)
