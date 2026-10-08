import * as cache from '../../cache';
import cliState from '../../cliState';
import { isAllowedPrompt, runEval } from '../../evaluator';
import logger from '../../logger';
import Eval from '../../models/eval';
import EvalResult from '../../models/evalResult';
import { recalculatePromptMetrics } from '../../node/retry';
import { resolveProvider } from '../../providers/index';
import { isApiProvider } from '../../types/providers';
import { resolveConfigs } from '../../util/config/load';
import { convertEvalResultToTableCell } from '../../util/exportToFile/index';
import {
  buildConfiguredProviderMap,
  isProviderTypeMap,
  resolveConfiguredProviderReference,
} from '../../util/gradingProvider';

import type {
  ApiProvider,
  EvaluateTableOutput,
  GradingConfig,
  Prompt,
  TestCase,
} from '../../types/index';

function cloneTestForResolve<T extends Pick<TestCase, 'options' | 'assert'>>(test: T): T {
  const cloned: T = { ...test };
  if (test.options) {
    cloned.options = { ...test.options };
  }
  if (test.assert) {
    cloned.assert = test.assert.map((assertion) => ({ ...assertion }));
  }
  return cloned;
}

async function resolveGradingProvider(
  provider: GradingConfig['provider'],
  providerMap: Record<string, ApiProvider>,
  context: { env?: Record<string, string>; basePath?: string },
): Promise<GradingConfig['provider']> {
  if (!isProviderTypeMap(provider)) {
    return isApiProvider(provider) ? provider : resolveProvider(provider, providerMap, context);
  }
  return resolveConfiguredProviderReference(provider, providerMap);
}

/**
 * Reruns a single test result record by its ID, updates the evaluation and prompt metrics,
 * and returns the updated table output cell.
 */
export async function rerunTestResult(
  evalId: string,
  resultId: string,
): Promise<EvaluateTableOutput> {
  const eval_ = await Eval.findById(evalId);
  if (!eval_) {
    throw new Error('Eval not found');
  }

  const targetResult = await EvalResult.findById(resultId);
  if (!targetResult || targetResult.evalId !== evalId) {
    throw new Error('Result not found');
  }

  // Resolve configuration and providers from eval config
  const resolved = await resolveConfigs({}, eval_.config);
  const { testSuite, config, basePath } = resolved;
  const providerMap = buildConfiguredProviderMap(testSuite.providers);

  // Identify the target provider and prompt for this result's promptIdx
  let activeProvider: ApiProvider | undefined;
  let activePrompt: Prompt = targetResult.prompt;

  let currentPromptIdx = 0;
  for (const prov of testSuite.providers) {
    const providerKey = prov.id();
    for (const p of testSuite.prompts) {
      if (!isAllowedPrompt(p, testSuite.providerPromptMap?.[providerKey])) {
        continue;
      }
      if (currentPromptIdx === targetResult.promptIdx) {
        activeProvider = prov;
        activePrompt = p;
        break;
      }
      currentPromptIdx++;
    }
    if (activeProvider) {
      break;
    }
  }

  if (!activeProvider) {
    activeProvider =
      testSuite.providers.find(
        (p) =>
          p.id() === targetResult.provider?.id ||
          p.label === targetResult.provider?.label ||
          p.id() === targetResult.provider,
      ) ?? testSuite.providers[0];
  }

  if (!activeProvider) {
    throw new Error('No provider available to rerun evaluation');
  }

  // Clone test case and resolve any custom test/assertion providers (e.g., llm-rubric judge models)
  const testCase = cloneTestForResolve(targetResult.testCase);
  if (testCase.provider && !isApiProvider(testCase.provider)) {
    testCase.provider = await resolveProvider(testCase.provider, providerMap, {
      env: testSuite.env,
      basePath,
    });
  }
  if (testCase.options?.provider && !isApiProvider(testCase.options.provider)) {
    testCase.options.provider = await resolveGradingProvider(
      testCase.options.provider,
      providerMap,
      {
        env: testSuite.env,
        basePath,
      },
    );
  }
  if (testCase.assert) {
    for (const assertion of testCase.assert) {
      if (
        assertion.type !== 'assert-set' &&
        assertion.provider &&
        !isApiProvider(assertion.provider)
      ) {
        assertion.provider = await resolveGradingProvider(assertion.provider, providerMap, {
          env: testSuite.env,
          basePath,
        });
      }
    }
  }

  logger.debug(
    `[evalRerunService] Rerunning result ${resultId} (testIdx=${targetResult.testIdx}, promptIdx=${targetResult.promptIdx}) in eval ${evalId}`,
  );

  // Execute test case with fresh cache (cache disabled)
  const evaluateResults = await cliState.withBasePath(basePath, () =>
    cliState.withConfig(config, () =>
      cliState.withEnv(testSuite.env ?? {}, () =>
        cache.withCacheEnabled(false, () =>
          runEval({
            provider: isApiProvider(testCase.provider) ? testCase.provider : activeProvider!,
            prompt: activePrompt,
            delay: 0,
            test: testCase,
            testSuite,
            nunjucksFilters: testSuite.nunjucksFilters,
            evaluateOptions: {
              cache: false,
            },
            testIdx: targetResult.testIdx,
            promptIdx: targetResult.promptIdx,
            repeatIndex: 0,
            isRedteam: Boolean(eval_.config.redteam),
            evalId,
          }),
        ),
      ),
    ),
  );

  const newResult = evaluateResults[0];
  if (!newResult) {
    throw new Error('Evaluation produced no result');
  }

  // Update targetResult and save
  await targetResult.updateFromEvaluateResult(newResult);

  // Recalculate prompt metrics on the Eval and persist
  await recalculatePromptMetrics(eval_);

  logger.debug(
    `[evalRerunService] Successfully updated result ${resultId} (success=${newResult.success}, score=${newResult.score})`,
  );

  return convertEvalResultToTableCell(targetResult);
}

/**
 * Reruns all results for a given test index (row) in an evaluation.
 */
export async function rerunTestCaseRow(
  evalId: string,
  testIdx: number,
): Promise<EvaluateTableOutput[]> {
  const eval_ = await Eval.findById(evalId);
  if (!eval_) {
    throw new Error('Eval not found');
  }

  const results = await EvalResult.findManyByEvalId(evalId, { testIdx });
  if (results.length === 0) {
    throw new Error(`No results found for test index ${testIdx}`);
  }

  const updatedOutputs: EvaluateTableOutput[] = [];
  for (const result of results) {
    const updated = await rerunTestResult(evalId, result.id);
    updatedOutputs.push(updated);
  }

  return updatedOutputs;
}
