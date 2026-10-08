import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as evaluator from '../../../src/evaluator';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import EvalResult from '../../../src/models/evalResult';
import { createApp } from '../../../src/server/server';
import invariant from '../../../src/util/invariant';
import EvalFactory from '../../factories/evalFactory';

vi.mock('../../../src/database/signal', async () => {
  const actual = await vi.importActual('../../../src/database/signal');
  return {
    ...actual,
    updateSignalFile: vi.fn(),
  };
});

describe('Eval rerun routes', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;
  const testEvalIds = new Set<string>();

  beforeAll(async () => {
    await runDbMigrations();
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    const cleanupPromises = Array.from(testEvalIds).map(async (evalId) => {
      try {
        const eval_ = await Eval.findById(evalId);
        if (eval_) {
          await eval_.delete();
        }
      } catch (error) {
        console.error(`Failed to cleanup eval ${evalId}:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    testEvalIds.clear();
  });

  describe('POST /api/eval/:evalId/results/:id/rerun', () => {
    it('returns 404 if eval does not exist', async () => {
      const res = await api.post('/api/eval/non-existent-eval/results/some-result-id/rerun');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Eval not found');
    });

    it('returns 404 if result does not exist', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await api.post(`/api/eval/${eval_.id}/results/non-existent-result/rerun`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Result not found');
    });

    it('successfully reruns a single test result and updates evaluation metrics', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1 });
      testEvalIds.add(eval_.id);
      eval_.config = {
        ...eval_.config,
        providers: ['echo'],
      };
      await eval_.save();

      const results = await eval_.getResults();
      expect(results.length).toBeGreaterThan(0);
      const targetResult = results[0];
      expect(targetResult).toBeDefined();
      invariant(targetResult instanceof EvalResult, 'EvalResult is required');
      targetResult.provider = { id: 'echo', label: 'echo' };
      await targetResult.save();

      const mockEvaluateResult = {
        prompt: {
          raw: 'What is the capital of california?',
          label: 'What is the capital of {{state}}?',
        },
        cost: 0.002,
        error: null,
        failureReason: 0,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Expected Sacramento and got Sacramento',
          tokensUsed: { total: 15, prompt: 5, completion: 10, cached: 0 },
          componentResults: [],
          namedScores: {},
        },
        latencyMs: 120,
        namedScores: {},
        provider: { id: 'echo', label: 'echo' },
        response: {
          output: 'Sacramento',
          tokenUsage: { total: 15, prompt: 5, completion: 10, cached: 0 },
        },
        score: 1,
        success: true,
        testCase: { vars: { state: 'california' } },
      };

      const runEvalSpy = vi
        .spyOn(evaluator, 'runEval')
        .mockResolvedValue([mockEvaluateResult as any]);

      const res = await api.post(`/api/eval/${eval_.id}/results/${targetResult.id}/rerun`);

      if (res.status !== 200) {
        throw new Error(`RERUN FAILED: ${JSON.stringify(res.body)}`);
      }
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Test case rerun successfully');
      expect(res.body).toHaveProperty('result');
      expect(res.body.result).toHaveProperty('text', 'Sacramento');
      expect(res.body.result).toHaveProperty('pass', true);
      expect(res.body.result).toHaveProperty('score', 1);

      expect(runEvalSpy).toHaveBeenCalledTimes(1);

      // Verify the database record was updated
      const updatedResult = await EvalResult.findById(targetResult.id);
      expect(updatedResult).toBeDefined();
      invariant(updatedResult, 'updatedResult is required');
      expect(updatedResult.response?.output).toBe('Sacramento');
      expect(updatedResult.score).toBe(1);
    });
  });

  describe('POST /api/eval/:evalId/test-cases/:testIdx/rerun', () => {
    it('returns 404 if eval does not exist', async () => {
      const res = await api.post('/api/eval/non-existent-eval/test-cases/0/rerun');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Eval not found');
    });

    it('returns 404 if no results exist for the given test index', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1 });
      testEvalIds.add(eval_.id);

      const res = await api.post(`/api/eval/${eval_.id}/test-cases/999/rerun`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No results found');
    });

    it('successfully reruns a test case row', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2 });
      testEvalIds.add(eval_.id);
      eval_.config = {
        ...eval_.config,
        providers: ['echo'],
      };
      await eval_.save();

      const results = await eval_.getResults();
      for (const r of results) {
        invariant(r instanceof EvalResult, 'EvalResult is required');
        r.provider = { id: 'echo', label: 'echo' };
        await r.save();
      }

      const mockEvaluateResult = {
        prompt: {
          raw: 'What is the capital of {{state}}?',
          label: 'What is the capital of {{state}}?',
        },
        cost: 0.001,
        error: null,
        failureReason: 0,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Passed',
          tokensUsed: { total: 10, prompt: 5, completion: 5, cached: 0 },
          componentResults: [],
          namedScores: {},
        },
        latencyMs: 95,
        namedScores: {},
        provider: { id: 'echo', label: 'echo' },
        response: {
          output: 'Row Rerun Output',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        },
        score: 1,
        success: true,
        testCase: { vars: { state: 'colorado' } },
      };

      vi.spyOn(evaluator, 'runEval').mockResolvedValue([mockEvaluateResult as any]);

      const res = await api.post(`/api/eval/${eval_.id}/test-cases/0/rerun`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Test case row rerun successfully');
      expect(res.body).toHaveProperty('results');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results[0]).toHaveProperty('text', 'Row Rerun Output');
    });
  });
});
