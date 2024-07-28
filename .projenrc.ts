import { awscdk, github } from 'projen';
import { NodePackageManager } from 'projen/lib/javascript';

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'workout-wager',
  projenrcTs: true,
  packageManager: NodePackageManager.NPM,
  gitignore: ['.env'],
  deps: [
    '@types/aws-lambda',
    'jsonwebtoken',
    'axios',
    'aws-sdk',
    'dotenv-cli',
    'dotenv',
    'uuid',
    'yup'
  ], // Runtime dependencies of this module.
  devDeps: [
    'aws-cdk-lib',
    'aws-lambda-mock-context',
    'constructs',
    '@types/jsonwebtoken',
    '@types/jwk-to-pem',
    '@types/aws-lambda',
    '@types/uuid',
    'typescript',
    'copyfiles',
    'ts-dotenv',
    'ts-node',
    'jwks-rsa',
    'jwk-to-pem'
  ], // Build dependencies for this module.
  tsconfig: {
    compilerOptions: {
      outDir: './dist',
      rootDir: './src',
      target: 'ES2020',
      module: 'commonjs',
      strict: true,
      esModuleInterop: true,
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules'],
  },
});

// Add custom scripts
project.addScripts({
  projen: 'ts-node --project tsconfig.dev.json .projenrc.ts',
  build: 'tsc',
  checkBranch: 'node check-branch.ts'
});

// Enables unit tests on windows
project.jest?.addTestMatch('<rootDir>/test/**/*(*.)@(spec|test).ts?(x)');
project.jest?.addTestMatch('<rootDir>/src/**/*(*.)@(spec|test).ts?(x)');
project.jest!.config.modulePaths = ['<rootDir>'];
project.jest!.config.testTimeout = 30000; // 30 seconds


// Use tsconfig.test.json for ESLint
project.eslint?.addOverride({
  files: ['test/**/*.ts'],
  ...{
    parserOptions: {
      project: ['./tsconfig.json', './tsconfig.test.json'],
    },
  },
});

// Retrieve the existing build workflow
const buildWorkflow = project.github?.workflows.find(workflow => workflow.name === 'build');

if (buildWorkflow) {
  // Add triggers to the existing workflow
  buildWorkflow.on({
    pullRequest: {},
    workflowDispatch: {},
  });

  // Define the build job
  const buildJob = {
    runsOn: ['ubuntu-latest'],
    permissions: {
      contents: github.workflows.JobPermission.READ,
    },
    outputs: {
      self_mutation_happened: { stepId: 'self_mutation', outputName: 'self_mutation_happened' },
    },
    env: {
      CI: 'true',
    },
    steps: [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v4',
        with: {
          ref: '${{ github.event.pull_request.head.ref }}',
          repository: '${{ github.event.pull_request.head.repo.full_name }}',
        },
      },
      {
        name: 'Install dependencies',
        run: 'yarn install --check-files',
      },
      {
        name: 'Build project',
        run: 'yarn build',
      },
      {
        name: 'Build with Projen',
        run: 'npx projen build',
      },
      {
        name: 'Find mutations',
        id: 'self_mutation',
        run: `
          git add .
          if git diff --staged --quiet; then
            echo "self_mutation_happened=false" >> $GITHUB_ENV
          else
            git diff --staged --patch > .repo.patch
            echo "self_mutation_happened=true" >> $GITHUB_ENV
          fi
        `,
      },
      {
        name: 'Upload patch',
        if: 'env.self_mutation_happened == true',
        uses: 'actions/upload-artifact@v4',
        with: {
          name: '.repo.patch',
          path: '.repo.patch',
          overwrite: true,
        },
      },
      {
        name: 'Fail build on mutation',
        if: 'env.self_mutation_happened == true',
        run: `
          echo "::error::Files were changed during build (see build log). If this was triggered from a fork, you will need to update your branch."
          cat .repo.patch
          exit 1
        `,
      },
    ],
  };

  // Define the self-mutation job
  const selfMutationJob = {
    needs: ['build'],
    runsOn: ['ubuntu-latest'],
    permissions: {
      contents: github.workflows.JobPermission.WRITE,
    },
    if: 'always() && needs.build.outputs.self_mutation_happened == true && !(github.event.pull_request.head.repo.full_name != github.repository)',
    steps: [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v4',
        with: {
          token: '${{ secrets.PROJEN_GITHUB_TOKEN }}',
          ref: '${{ github.event.pull_request.head.ref }}',
          repository: '${{ github.event.pull_request.head.repo.full_name }}',
        },
      },
      {
        name: 'Download patch',
        uses: 'actions/download-artifact@v4',
        with: {
          name: '.repo.patch',
          path: '${{ runner.temp }}',
        },
      },
      {
        name: 'Apply patch',
        run: '[ -s ${{ runner.temp }}/.repo.patch ] && git apply ${{ runner.temp }}/.repo.patch || echo "Empty patch. Skipping."',
      },
      {
        name: 'Set git identity',
        run: `
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
        `,
      },
      {
        name: 'Push changes',
        env: {
          PULL_REQUEST_REF: '${{ github.event.pull_request.head.ref }}',
        },
        run: `
          git add .
          git commit -s -m "chore: self mutation"
          git push origin HEAD:$PULL_REQUEST_REF
        `,
      },
    ],
  };

  // Add jobs to the existing workflow
  buildWorkflow.addJobs({
    'build': buildJob,
    'self-mutation': selfMutationJob,
  });
}

project.synth();