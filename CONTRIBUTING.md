# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

```bash
npm install
npm run dev
```

Open the printed URL in Chrome or Edge. WebUSB works on `localhost`.

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run build
```

- Keep the app framework-free and dependency-light. Ownerkit ships as one offline HTML file.
- New step types need: a type in `src/profile/types.ts`, validation in `validate.ts`, the JSON Schema in `public/profile.schema.json`, `describeStep`/`previewStep`/`runStep` in `src/steps/steps.ts`, a test, and a row in `docs/profiles.md`.
- Strings shown to operators go in `src/i18n/en.ts` and every other locale file. Write them in plain language: say what happened and what to do.
- Quote every value that reaches the device shell with `shQuote`.
- Never commit real profiles, APKs, serial numbers or customer names.

## Adding a language

Copy `src/i18n/id.ts`, translate it, register it in `src/i18n/index.ts`, and add a guide for it in `src/i18n/guide.ts`.
