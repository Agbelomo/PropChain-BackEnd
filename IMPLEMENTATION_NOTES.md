# Implementation: Issues #1230, #1231, #1235, #1236

Apply these files over the corresponding paths in PropChain-BackEnd.

## Files changed

- `src/i18n/i18n.service.ts` – missing-key observability (#1236)
- `src/i18n/i18n.service.spec.ts` – tests for miss ring
- `src/i18n/translations.symmetry.spec.ts` – CI symmetry check (#1235)
- `src/i18n/translations/en.json` / `es.json` – expanded email keys (#1231/#1235)
- `src/metrics/metrics.controller.ts` – `translations_missing_total`
- `src/admin/admin.controller.ts` – `GET /admin/i18n/missing-keys`
- `src/email/email.service.ts` – inject `context.t` from I18nService (#1231)
- `src/email/email.service.spec.ts` – locale wiring test
- `src/email/templates/*.ejs` – use `<%= t.* %>` instead of hard-coded English
- `src/users/data-export.service.ts` – email after COMPLETED + jobId (#1230)
- `src/users/data-export.service.spec.ts` – ordering assertion
- `package.json` – `test:i18n-symmetry` / `check:i18n` scripts

## Verify

```bash
npm run test:i18n-symmetry
npm test -- src/i18n/i18n.service.spec.ts src/email/email.service.spec.ts src/users/data-export.service.spec.ts
```
