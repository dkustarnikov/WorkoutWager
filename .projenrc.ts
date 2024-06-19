import { awscdk } from 'projen';

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'WorkoutWager',
  projenrcTs: true,
  gitignore: ['.env'],
  deps: ['aws-lambda'], // Runtime dependencies of this module.
  devDeps: [
    'aws-cdk-lib',
    'aws-lambda-mock-context',
    'constructs',
    '@types/aws-lambda@^8.10.138',
    'typescript',
    'copyfiles',
    'ts-dotenv',
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
  projen: 'ts-node .projenrc.ts',
  build: 'tsc',
  package: 'npm run build && copyfiles -u 1 src/**/* dist',
  deploy: 'npm run projen && npm run build && npm run package && npm run test  && cdk deploy',
});

// Enables unit tests on windows
project.jest?.addTestMatch('<rootDir>/test/**/*(*.)@(spec|test).ts?(x)');
project.jest?.addTestMatch('<rootDir>/src/**/*(*.)@(spec|test).ts?(x)');
project.jest!.config.modulePaths = ['<rootDir>'];

// Use tsconfig.test.json for ESLint
project.eslint?.addOverride({
  files: ['test/**/*.ts'],
  ...{
    parserOptions: {
      project: ['./tsconfig.json', './tsconfig.test.json'],
    },
  },
});

project.synth();