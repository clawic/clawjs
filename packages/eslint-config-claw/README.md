# eslint-config-claw

Shared ESLint flat config for Claw projects.

## Install

```bash
npm install --save-dev eslint eslint-config-claw
```

## Usage

```js
// eslint.config.js
import claw from "eslint-config-claw";

export default claw;
```

Use the JavaScript-only preset when you do not want TypeScript rules:

```js
import { javascript } from "eslint-config-claw";

export default javascript;
```
