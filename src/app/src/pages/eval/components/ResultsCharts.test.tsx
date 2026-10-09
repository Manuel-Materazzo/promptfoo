import { fireEvent, render, screen } from '@testing-library/react';
import { Chart } from 'chart.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsCharts, {
  DescriptionResultsChart,
  getPromptDisplayLabel,
  MetricChart,
  MODEL_COLORS,
} from './ResultsCharts';
import { useResultsViewSettingsStore, useTableStore } from './store';

// Mock Chart.js
vi.mock('chart.js', () => {
  const ChartMock = vi.fn().mockImplementation(function () {
    return {
      destroy: vi.fn(),
    };
  });

  (ChartMock as any).register = vi.fn();
  (ChartMock as any).defaults = {
    color: '#666',
  };

  return {
    Chart: ChartMock,
    BarController: vi.fn(),
    LineController: vi.fn(),
    ScatterController: vi.fn(),
    CategoryScale: vi.fn(),
    LinearScale: vi.fn(),
    BarElement: vi.fn(),
    LineElement: vi.fn(),
    PointElement: vi.fn(),
    Tooltip: vi.fn(),
    Legend: vi.fn(),
    Colors: vi.fn(),
  };
});

// Mock the store
vi.mock('./store', () => ({
  useTableStore: vi.fn(),
  useResultsViewSettingsStore: vi.fn(),
}));

describe('ResultsCharts', () => {
  let mockSettings: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettings = {
      descriptionChartPromptView: 'compare',
      setDescriptionChartPromptView: vi.fn((view: string) => {
        mockSettings.descriptionChartPromptView = view;
      }),
      metricChartStacked: false,
      setMetricChartStacked: vi.fn((stacked: boolean) => {
        mockSettings.metricChartStacked = stacked;
      }),
      metricChartHiddenMetrics: [],
      setMetricChartHiddenMetrics: vi.fn((metrics: string[]) => {
        mockSettings.metricChartHiddenMetrics = metrics;
      }),
    };

    vi.mocked(useResultsViewSettingsStore).mockImplementation(() => mockSettings);
    vi.mocked(useTableStore).mockReturnValue({
      table: null,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    } as any);
  });

  describe('getPromptDisplayLabel', () => {
    it('replaces eval ID with eval description when available', () => {
      const promptWithEvalId = { label: '[eval-4sl-2026-10-07T15:51:14] gpt-4' };
      const label = getPromptDisplayLabel(promptWithEvalId, 0, 'Production Model');
      expect(label).toBe('[Production Model] gpt-4');
    });

    it('uses fallback description if prompt has only eval ID or is empty', () => {
      const promptOnlyEvalId = { label: 'eval-4sl-2026-10-07T15:51:14' };
      const label = getPromptDisplayLabel(promptOnlyEvalId, 0, 'Web Search Eval');
      expect(label).toBe('Web Search Eval');
    });

    it('falls back to provider or prompt index when no description is available', () => {
      const prompt = { provider: 'claude-3-5-sonnet' };
      const label = getPromptDisplayLabel(prompt, 0);
      expect(label).toBe('claude-3-5-sonnet');
    });

    it('does not replace comparison eval ID when evalId is provided for main eval', () => {
      const mainPrompt = { label: '[eval-main-123] gpt-4' };
      const compPrompt = { label: '[eval-comp-456] claude-3' };
      expect(getPromptDisplayLabel(mainPrompt, 0, 'Production Model', 'eval-main-123')).toBe(
        '[Production Model] gpt-4',
      );
      expect(getPromptDisplayLabel(compPrompt, 1, 'Production Model', 'eval-main-123')).toBe(
        '[eval-comp-456] claude-3',
      );
    });
  });

  describe('DescriptionResultsChart', () => {
    it('correctly creates stacked bars with per-model solid pass and translucent fail colors', () => {
      const easyTests = [
        { description: 'web search - easy', outputs: [{ score: 1, pass: true }] },
        { description: 'web search - easy', outputs: [{ score: 1, pass: true }] },
        { description: 'web search - easy', outputs: [{ score: 1, pass: true }] },
        { description: 'web search - easy', outputs: [{ score: 0, pass: false }] },
        { description: 'web search - easy', outputs: [{ score: 0, pass: false }] },
      ];

      const hardTests = [
        { description: 'web search - hard', outputs: [{ score: 1, pass: true }] },
        { description: 'web search - hard', outputs: [{ score: 0, pass: false }] },
        { description: 'web search - hard', outputs: [{ score: 0, pass: false }] },
      ];

      const mockTable: any = {
        head: {
          prompts: [{ provider: 'test-model', metrics: { namedScores: {} } }],
          vars: [],
        },
        body: [...easyTests, ...hardTests],
      };

      render(<DescriptionResultsChart table={mockTable} />);

      const chartCalls = vi.mocked(Chart).mock.calls;
      expect(chartCalls.length).toBeGreaterThan(0);

      const chartConfig = chartCalls[0][1] as any;
      expect(chartConfig.type).toBe('bar');
      expect(chartConfig.data.labels).toEqual(['web search - easy', 'web search - hard']);

      // Datasets: Pass is index 0 (bottom), Fail is index 1 (top)
      const datasets = chartConfig.data.datasets;
      expect(datasets).toHaveLength(2);

      const passDataset = datasets[0];
      const failDataset = datasets[1];

      expect(passDataset.label).toContain('Pass');
      expect(passDataset.data).toEqual([3, 1]);
      expect(passDataset.backgroundColor).toBe(MODEL_COLORS[0].pass);

      expect(failDataset.label).toContain('Fail');
      expect(failDataset.data).toEqual([2, 2]);
      expect(failDataset.backgroundColor).toBe(MODEL_COLORS[0].fail);
      expect(failDataset.borderColor).toBe(MODEL_COLORS[0].failBorder);

      // Verify stacked scale options
      expect(chartConfig.options.scales.x.stacked).toBe(true);
      expect(chartConfig.options.scales.y.stacked).toBe(true);
    });

    it('handles tests without description by grouping under (No description)', () => {
      const mockTable: any = {
        head: {
          prompts: [{ provider: 'test-model', metrics: { namedScores: {} } }],
          vars: [],
        },
        body: [
          { outputs: [{ score: 1, pass: true }] },
          { outputs: [{ score: 0, pass: false }] },
          { description: 'test a', outputs: [{ score: 1, pass: true }] },
        ],
      };

      render(<DescriptionResultsChart table={mockTable} />);

      const chartCalls = vi.mocked(Chart).mock.calls;
      const chartConfig = chartCalls[0][1] as any;

      expect(chartConfig.data.labels).toEqual(['(No description)', 'test a']);
      expect(chartConfig.data.datasets[0].data).toEqual([1, 1]); // Pass
      expect(chartConfig.data.datasets[1].data).toEqual([1, 0]); // Fail
    });

    it('handles multiple models in compare mode with distinct model colors', () => {
      const mockTable: any = {
        head: {
          prompts: [
            { provider: 'gpt-4o', metrics: { namedScores: {} } },
            { provider: 'claude-3-5', metrics: { namedScores: {} } },
          ],
          vars: [],
        },
        body: [
          {
            description: 'task 1',
            outputs: [
              { score: 1, pass: true },
              { score: 0, pass: false },
            ],
          },
          {
            description: 'task 1',
            outputs: [
              { score: 1, pass: true },
              { score: 1, pass: true },
            ],
          },
        ],
      };

      render(<DescriptionResultsChart table={mockTable} />);

      const chartCalls = vi.mocked(Chart).mock.calls;
      const chartConfig = chartCalls[0][1] as any;

      expect(chartConfig.data.labels).toEqual(['task 1']);
      // 2 models * 2 (pass/fail) = 4 datasets in compare mode
      expect(chartConfig.data.datasets).toHaveLength(4);

      // Model 1 (gpt-4o): Uses MODEL_COLORS[0]
      expect(chartConfig.data.datasets[0].label).toContain('Pass');
      expect(chartConfig.data.datasets[0].backgroundColor).toBe(MODEL_COLORS[0].pass);
      expect(chartConfig.data.datasets[0].data).toEqual([2]);
      expect(chartConfig.data.datasets[0].stack).toBe('prompt-0');

      expect(chartConfig.data.datasets[1].label).toContain('Fail');
      expect(chartConfig.data.datasets[1].backgroundColor).toBe(MODEL_COLORS[0].fail);
      expect(chartConfig.data.datasets[1].data).toEqual([0]);
      expect(chartConfig.data.datasets[1].stack).toBe('prompt-0');

      // Model 2 (claude-3-5): Uses MODEL_COLORS[1]
      expect(chartConfig.data.datasets[2].label).toContain('Pass');
      expect(chartConfig.data.datasets[2].backgroundColor).toBe(MODEL_COLORS[1].pass);
      expect(chartConfig.data.datasets[2].data).toEqual([1]);
      expect(chartConfig.data.datasets[2].stack).toBe('prompt-1');

      expect(chartConfig.data.datasets[3].label).toContain('Fail');
      expect(chartConfig.data.datasets[3].backgroundColor).toBe(MODEL_COLORS[1].fail);
      expect(chartConfig.data.datasets[3].data).toEqual([1]);
      expect(chartConfig.data.datasets[3].stack).toBe('prompt-1');
    });

    it('handles empty body gracefully', () => {
      const mockTable: any = {
        head: { prompts: [{ provider: 'test' }], vars: [] },
        body: [],
      };

      render(<DescriptionResultsChart table={mockTable} />);
      expect(screen.getByText('No test cases found')).toBeInTheDocument();
    });

    it('sets readable fontColor on legend labels instead of black', () => {
      const mockTable: any = {
        head: {
          prompts: [{ provider: 'test-model', metrics: { namedScores: {} } }],
          vars: [],
        },
        body: [{ description: 'test', outputs: [{ score: 1, pass: true }] }],
      };

      render(<DescriptionResultsChart table={mockTable} textColor="#aaa" />);

      const chartConfig = vi.mocked(Chart).mock.calls[0][1] as any;
      const legendLabels = chartConfig.options.plugins.legend.labels;
      expect(legendLabels.color).toBe('#aaa');

      const mockChartInstance = {
        data: chartConfig.data,
        isDatasetVisible: () => true,
        options: chartConfig.options,
      };
      const generated = legendLabels.generateLabels(mockChartInstance);
      expect(generated[0].fontColor).toBe('#aaa');
      expect(generated[1].fontColor).toBe('#aaa');
    });

    it('maintains distinct model labels when comparing evals', () => {
      const mockTable: any = {
        head: {
          prompts: [
            { label: '[eval-main] gpt-4o', provider: 'gpt-4o' },
            { label: '[eval-comp] claude-3-5-sonnet', provider: 'claude-3-5-sonnet' },
          ],
          vars: [],
        },
        body: [
          {
            description: 'test-1',
            outputs: [
              { score: 1, pass: true },
              { score: 1, pass: true },
            ],
          },
        ],
      };

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTable,
        evalId: 'eval-main',
        config: { description: 'GPT-4o Benchmark' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      } as any);

      render(<DescriptionResultsChart table={mockTable} />);

      const chartConfig = vi.mocked(Chart).mock.calls[0][1] as any;
      const datasets = chartConfig.data.datasets;
      expect(datasets[0].label).toBe('[GPT-4o Benchmark] gpt-4o (Pass)');
      expect(datasets[2].label).toBe('[eval-comp] claude-3-5-sonnet (Pass)');
    });
  });

  describe('MetricChart', () => {
    it('renders absolute values without relative normalization', () => {
      const mockTable: any = {
        head: {
          prompts: [
            {
              provider: 'model-a',
              metrics: {
                namedScores: {
                  accuracy: 0.4,
                  helpfulness: 8.5,
                },
              },
            },
            {
              provider: 'model-b',
              metrics: {
                namedScores: {
                  accuracy: 0.8,
                  helpfulness: 10,
                },
              },
            },
          ],
          vars: [],
        },
        body: [],
      };

      render(<MetricChart table={mockTable} />);

      const chartCalls = vi.mocked(Chart).mock.calls;
      expect(chartCalls.length).toBeGreaterThan(0);

      const chartConfig = chartCalls[0][1] as any;
      expect(chartConfig.data.labels).toEqual(['accuracy', 'helpfulness']);

      // Model A values should be absolute [0.4, 8.5], not normalized to max
      expect(chartConfig.data.datasets[0].data).toEqual([0.4, 8.5]);
      expect(chartConfig.data.datasets[0].backgroundColor).toBe(MODEL_COLORS[0].pass);

      // Model B values should be absolute [0.8, 10], not [1, 1]
      expect(chartConfig.data.datasets[1].data).toEqual([0.8, 10]);
      expect(chartConfig.data.datasets[1].backgroundColor).toBe(MODEL_COLORS[1].pass);
    });

    it('allows hiding and showing metrics via interactive toggle buttons and persists', () => {
      const mockTable: any = {
        head: {
          prompts: [
            {
              provider: 'model-a',
              metrics: {
                namedScores: {
                  accuracy: 0.9,
                  latency_score: 0.7,
                },
              },
            },
          ],
          vars: [],
        },
        body: [],
      };

      const { rerender } = render(<MetricChart table={mockTable} />);

      // Initially both metrics are active
      expect(screen.getByRole('button', { name: /accuracy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /latency_score/i })).toBeInTheDocument();

      let chartCalls = vi.mocked(Chart).mock.calls;
      let lastCall = chartCalls[chartCalls.length - 1][1] as any;
      expect(lastCall.data.labels).toEqual(['accuracy', 'latency_score']);

      // Click accuracy button to hide it
      fireEvent.click(screen.getByRole('button', { name: /accuracy/i }));
      expect(mockSettings.setMetricChartHiddenMetrics).toHaveBeenCalledWith(['accuracy']);

      // Simulate re-render with updated hidden state
      mockSettings.metricChartHiddenMetrics = ['accuracy'];
      rerender(<MetricChart table={mockTable} />);

      chartCalls = vi.mocked(Chart).mock.calls;
      lastCall = chartCalls[chartCalls.length - 1][1] as any;
      expect(lastCall.data.labels).toEqual(['latency_score']);
      expect(lastCall.data.datasets[0].data).toEqual([0.7]);
    });

    it('allows toggling between grouped and stacked view and persists', () => {
      const mockTable: any = {
        head: {
          prompts: [
            {
              provider: 'model-a',
              metrics: {
                namedScores: { score: 1 },
              },
            },
          ],
          vars: [],
        },
        body: [],
      };

      const { rerender } = render(<MetricChart table={mockTable} />);

      const toggleButton = screen.getByRole('button', { name: /grouped/i });
      expect(toggleButton).toBeInTheDocument();

      let chartCalls = vi.mocked(Chart).mock.calls;
      let lastCall = chartCalls[chartCalls.length - 1][1] as any;
      expect(lastCall.options.scales.x.stacked).toBe(false);

      // Click toggle button to switch to stacked
      fireEvent.click(toggleButton);
      expect(mockSettings.setMetricChartStacked).toHaveBeenCalledWith(true);

      mockSettings.metricChartStacked = true;
      rerender(<MetricChart table={mockTable} />);

      expect(screen.getByRole('button', { name: /stacked/i })).toBeInTheDocument();

      chartCalls = vi.mocked(Chart).mock.calls;
      lastCall = chartCalls[chartCalls.length - 1][1] as any;
      expect(lastCall.options.scales.x.stacked).toBe(true);
      expect(lastCall.options.scales.y.stacked).toBe(true);
    });

    it('shows placeholder when no named metrics exist', () => {
      const mockTable: any = {
        head: {
          prompts: [{ provider: 'model-a', metrics: {} }],
          vars: [],
        },
        body: [],
      };

      render(<MetricChart table={mockTable} />);
      expect(screen.getByText('No named metrics found')).toBeInTheDocument();
    });

    it('shows message when all metrics are hidden', () => {
      const mockTable: any = {
        head: {
          prompts: [
            {
              provider: 'model-a',
              metrics: {
                namedScores: { m1: 1, m2: 2, m3: 3 },
              },
            },
          ],
          vars: [],
        },
        body: [],
      };

      const { rerender } = render(<MetricChart table={mockTable} />);

      // Click 'None' button
      const noneButton = screen.getByRole('button', { name: 'None' });
      fireEvent.click(noneButton);
      expect(mockSettings.setMetricChartHiddenMetrics).toHaveBeenCalledWith(['m1', 'm2', 'm3']);

      mockSettings.metricChartHiddenMetrics = ['m1', 'm2', 'm3'];
      rerender(<MetricChart table={mockTable} />);

      expect(screen.getByText('All metrics hidden')).toBeInTheDocument();
    });
  });

  describe('ResultsCharts Container', () => {
    it('renders both DescriptionResultsChart and MetricChart with data-testid', () => {
      const mockTable: any = {
        head: {
          prompts: [
            { provider: 'test-provider-1', metrics: { namedScores: { accuracy: 0.9 } } },
            { provider: 'test-provider-2', metrics: { namedScores: { accuracy: 0.8 } } },
          ],
          vars: [],
        },
        body: [
          {
            description: 'desc 1',
            outputs: [
              { score: 0.8, pass: true, text: 'valid output' },
              { score: 0.9, pass: true, text: 'valid output' },
            ],
            vars: [],
          },
        ],
      };

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTable,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      } as any);

      const { container } = render(<ResultsCharts scores={[0.8, 0.9]} />);

      expect(screen.getByTestId('results-charts')).toBeInTheDocument();
      expect(screen.getByText('Results by Description')).toBeInTheDocument();
      expect(screen.getByText('Metrics Comparison')).toBeInTheDocument();
      expect(container.querySelectorAll('canvas').length).toBe(2);
    });

    it('handles null outputs gracefully without crashing', () => {
      const mockTableWithNullOutputs: any = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [null, { score: 0.8, pass: true, text: 'valid output' }],
            vars: [],
          },
          {
            outputs: [{ score: 0.6, pass: true, text: 'another valid' }, null],
            vars: [],
          },
        ],
      };

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableWithNullOutputs,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      } as any);

      expect(() => {
        render(<ResultsCharts scores={[0.8, 0.6]} />);
      }).not.toThrow();
    });
  });
});
