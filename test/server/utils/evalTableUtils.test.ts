import { describe, expect, it } from 'vitest';
import * as legacyEvalTableUtils from '../../../src/server/utils/evalTableUtils';
import * as evalTableUtils from '../../../src/util/eval/evalTableUtils';

describe('legacy evalTableUtils import', () => {
  it('re-exports the node-layer implementation for enterprise compatibility', () => {
    expect(legacyEvalTableUtils.evalTableToCsv).toBe(evalTableUtils.evalTableToCsv);
    expect(legacyEvalTableUtils.streamEvalCsv).toBe(evalTableUtils.streamEvalCsv);
    expect(legacyEvalTableUtils.mergeComparisonTables).toBe(evalTableUtils.mergeComparisonTables);
  });

  it('prefixes prompt labels with eval descriptions when provided', () => {
    const mainTable = {
      head: { prompts: [{ raw: 'p1', label: 'model-a' }], vars: [] },
      body: [],
    };
    const compTable = {
      head: { prompts: [{ raw: 'p2', label: 'model-b' }], vars: [] },
      body: [],
    };

    const result = evalTableUtils.mergeComparisonTables(
      'eval-1',
      mainTable,
      [{ evalId: 'eval-2', description: 'Comparison Eval', table: compTable }],
      'Main Eval',
    );

    expect(result.head.prompts[0].label).toBe('[Main Eval] model-a');
    expect(result.head.prompts[1].label).toBe('[Comparison Eval] model-b');
  });

  it('falls back to evalId when descriptions are omitted', () => {
    const mainTable = {
      head: { prompts: [{ raw: 'p1', label: 'model-a' }], vars: [] },
      body: [],
    };
    const compTable = {
      head: { prompts: [{ raw: 'p2', label: 'model-b' }], vars: [] },
      body: [],
    };

    const result = evalTableUtils.mergeComparisonTables('eval-1', mainTable, [
      { evalId: 'eval-2', table: compTable },
    ]);

    expect(result.head.prompts[0].label).toBe('[eval-1] model-a');
    expect(result.head.prompts[1].label).toBe('[eval-2] model-b');
  });
});
