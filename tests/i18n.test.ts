import fs from 'node:fs';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import { chooseLanguage, translate } from '../src/i18n';
import dictionary from '../src/i18n/de.json';
import { cities } from '../src/lib/cities';
import { areaSpecs } from '../src/lib/area-specs';
import { formatDistance } from '../src/lib/geo';
const de: Record<string, string> = dictionary;
describe('German interface', () => {
  it('respects explicit language, saved preference and German browser defaults', () => {
    expect(chooseLanguage('/de/', '', 'en', 'en-US')).toBe('de');
    expect(chooseLanguage('/de/', '?lang=en', 'de', 'de-CH')).toBe('en');
    expect(chooseLanguage('/', '', 'en', 'de-CH')).toBe('en');
    expect(chooseLanguage('/', '', null, 'de-AT')).toBe('de');
    expect(chooseLanguage('/', '', null, 'fr-CH')).toBe('en');
  });
  it('preserves local place names and handles parameters and generated error labels', () => {
    expect(translate('Bürkliplatz', 'de')).toBe('Bürkliplatz');
    expect(translate(' +{extra} min', 'de', { extra: '3,0' })).toBe(' +3,0 Min.');
    expect(
      translate(
        'Destination: No mapped public walking path within 45 metres. Choose a point on a nearby street or path.',
        'de',
      ),
    ).toContain('Ziel: Im Umkreis');
    expect(
      translate('The area could not download (503). Try again when connected.', 'de'),
    ).toContain('(503)');
    expect(formatDistance(1234, 'metric', 'de-DE')).toBe('1,23 km');
    expect(formatDistance(1234, 'metric')).toBe('1.23 km');
  });
  it('covers city facts and every statically translated message, preserving placeholders', () => {
    const needed = new Set<string>();
    for (const city of cities) {
      for (const key of [
        'country',
        'coverageLabel',
        'coverageDescription',
        'treeNotes',
        'buildingNotes',
        'sourceSummary',
        'reviewSummary',
      ] as const)
        if (city[key]) needed.add(city[key]!);
      for (const source of city.sources) needed.add(source.label);
    }
    for (const area of areaSpecs) {
      needed.add(area.label);
      needed.add(area.description);
    }
    for (const file of [
      'src/App.tsx',
      'src/components/Map.tsx',
      'src/components/Search.tsx',
      'src/components/PavementPicker.tsx',
      'src/components/AreaDownloads.tsx',
      'src/components/TrafficCounts.tsx',
      'src/components/TrafficProfile.tsx',
    ]) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === 't' &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        )
          needed.add(node.arguments[0].text.trim());
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect([...needed].filter((key) => !de[key])).toEqual([]);
    for (const [key, value] of Object.entries(de))
      expect(value.match(/\{\w+\}/g)?.sort() ?? [], key).toEqual(
        key.match(/\{\w+\}/g)?.sort() ?? [],
      );
  });
});
