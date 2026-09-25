/**
 * Issue #1235 – Catalogue symmetry check.
 * Fails the unit suite when any language is missing a key that another has.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SUPPORTED_LANGUAGES } from './i18n.service';

function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, next));
    } else {
      keys.push(next);
    }
  }
  return keys;
}

describe('i18n catalogue symmetry (issue #1235)', () => {
  const dir = path.join(__dirname, 'translations');
  const catalogues: Record<string, Set<string>> = {};

  beforeAll(() => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const file = path.join(dir, `${lang}.json`);
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      catalogues[lang] = new Set(flattenKeys(raw));
    }
  });

  it('every language has the same key set', () => {
    const langs = Object.keys(catalogues);
    const reference = catalogues[langs[0]];
    const asymmetries: string[] = [];

    for (const lang of langs.slice(1)) {
      const other = catalogues[lang];
      for (const key of reference) {
        if (!other.has(key)) {
          asymmetries.push(`missing in ${lang}: ${key}`);
        }
      }
      for (const key of other) {
        if (!reference.has(key)) {
          asymmetries.push(`extra in ${lang} (missing in ${langs[0]}): ${key}`);
        }
      }
    }

    expect(asymmetries).toEqual([]);
  });

  it('email template keys exist in both catalogues', () => {
    const required = [
      'email.password_reset_subject',
      'email.password_reset_title',
      'email.account_locked_subject',
      'email.fraud_alert_title',
      'email.transaction_completed_title',
      'email.data_export_ready_subject',
      'email.data_export_ready_body',
    ];
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const key of required) {
        expect(catalogues[lang].has(key)).toBe(true);
      }
    }
  });
});
