import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const projectFiles = ["**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}"];
const tsFiles = ["**/*.{ts,tsx,mts,cts}"];

const clawIgnores = {
  name: "claw/ignores",
  ignores: [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/.cache/**",
  ],
};

const sharedLanguageOptions = {
  ecmaVersion: "latest" as const,
  sourceType: "module" as const,
  globals: {
    ...globals.browser,
    ...globals.node,
  },
};

const clawBaseRules = {
  "array-callback-return": "error",
  "default-case-last": "error",
  "dot-notation": "error",
  "eqeqeq": ["error", "always"],
  "no-alert": "error",
  "no-console": ["warn", { allow: ["warn", "error"] }],
  "no-constant-binary-expression": "error",
  "no-debugger": "error",
  "no-duplicate-imports": "error",
  "no-empty-pattern": "error",
  "no-fallthrough": "error",
  "no-irregular-whitespace": "error",
  "no-promise-executor-return": "error",
  "no-template-curly-in-string": "error",
  "no-unreachable-loop": "error",
  "no-unused-private-class-members": "error",
  "no-useless-assignment": "error",
  "object-shorthand": ["error", "always"],
  "prefer-const": "error",
  "prefer-template": "error",
  "symbol-description": "error",
} as const;

const clawBaseConfig = {
  name: "claw/base",
  files: projectFiles,
  languageOptions: sharedLanguageOptions,
  linterOptions: {
    reportUnusedDisableDirectives: "error" as const,
  },
  rules: clawBaseRules,
};

const clawTypeScriptConfig = {
  name: "claw/typescript",
  files: tsFiles,
  rules: {
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "no-undef": "off",
    "no-unused-vars": "off",
  },
};

export const javascript: object[] = [
  clawIgnores,
  js.configs.recommended,
  clawBaseConfig,
];

export const recommended: object[] = [
  clawIgnores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  clawBaseConfig,
  clawTypeScriptConfig,
];

export default recommended;
