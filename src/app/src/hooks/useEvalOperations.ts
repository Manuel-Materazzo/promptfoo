import { useCallback } from 'react';

import { EVAL_ROUTES } from '@app/constants/routes';
import { callApi } from '@app/utils/api';
import type { Trace } from '@app/components/traces/TraceView';
import type {
  ReplayEvaluationParams,
  ReplayEvaluationResult,
} from '@app/pages/eval/components/EvalOutputPromptDialog';
import type { EvaluateTableOutput } from '@promptfoo/types';

/**
 * Custom hook that provides eval-related API operations.
 * Separates API logic from presentational components.
 */
export function useEvalOperations() {
  const replayEvaluation = useCallback(
    async (params: ReplayEvaluationParams): Promise<ReplayEvaluationResult> => {
      try {
        const response = await callApi('/eval/replay', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const error = await response.text();
          return { error: error || 'Failed to replay evaluation' };
        }

        const data = await response.json();

        if (data.error) {
          return { error: `Provider error: ${data.error}` };
        }

        return { output: data.output || undefined };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'An error occurred' };
      }
    },
    [],
  );

  const fetchTraces = useCallback(async (evalId: string, signal: AbortSignal): Promise<Trace[]> => {
    const response = await callApi(`/traces/evaluation/${evalId}`, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.traces) ? data.traces : [];
  }, []);

  const rerunTestResult = useCallback(
    async (
      evalId: string,
      resultId: string,
    ): Promise<{ success: boolean; result?: EvaluateTableOutput; error?: string }> => {
      try {
        const response = await callApi(EVAL_ROUTES.RESULT_RERUN(evalId, resultId), {
          method: 'POST',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          return { success: false, error: errorData?.error || 'Failed to rerun test case' };
        }

        const data = await response.json();
        return { success: true, result: data.result as EvaluateTableOutput };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An error occurred',
        };
      }
    },
    [],
  );

  return {
    replayEvaluation,
    fetchTraces,
    rerunTestResult,
  };
}
