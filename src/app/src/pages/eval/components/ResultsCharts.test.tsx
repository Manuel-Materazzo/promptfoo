import { fireEvent, render, screen } from '@testing-library/react';
import { Chart } from 'chart.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsCharts, { DescriptionResultsChart, MetricChart } from './ResultsCharts';
import { useTableStore } from './store';

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
}));

describe('ResultsCharts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DescriptionResultsChart', () => {
    it('correctly creates stacked bars grouped by description with pass on bottom and fail on top', () => {
      // 5 tests with "web search - easy" (3 pass, 2 fail)
      // 3 tests with "web search - hard" (1 pass, 2 fail)
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

      expect(passDataset.label).toBe('Pass');
      expect(passDataset.data).toEqual([3, 1]);
      expect(passDataset.backgroundColor).toBe('#22c55e');

      expect(failDataset.label).toBe('Fail');
      expect(failDataset.data).toEqual([2, 2]);
      expect(failDataset.backgroundColor).toBe('#ef4444');

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

    it('handles multiple models in compare mode with separate stacks', () => {
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

      // Model 1 (gpt-4o)
      expect(chartConfig.data.datasets[0].label).toContain('Pass');
      expect(chartConfig.data.datasets[0].data).toEqual([2]);
      expect(chartConfig.data.datasets[0].stack).toBe('prompt-0');

      expect(chartConfig.data.datasets[1].label).toContain('Fail');
      expect(chartConfig.data.datasets[1].data).toEqual([0]);
      expect(chartConfig.data.datasets[1].stack).toBe('prompt-0');

      // Model 2 (claude-3-5)
      expect(chartConfig.data.datasets[2].label).toContain('Pass');
      expect(chartConfig.data.datasets[2].data).toEqual([1]);
      expect(chartConfig.data.datasets[2].stack).toBe('prompt-1');

      expect(chartConfig.data.datasets[3].label).toContain('Fail');
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
      // Model B values should be absolute [0.8, 10], not [1, 1]
      expect(chartConfig.data.datasets[1].data).toEqual([0.8, 10]);
    });

    it('allows hiding and showing metrics via interactive toggle buttons', () => {
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

      render(<MetricChart table={mockTable} />);

      // Initially both metrics are active
      expect(screen.getByRole('button', { name: /accuracy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /latency_score/i })).toBeInTheDocument();

      let chartCalls = vi.mocked(Chart).mock.calls;
      let lastCall = chartCalls[chartCalls.length - 1][1] as any;
      expect(lastCall.data.labels).toEqual(['accuracy', 'latency_score']);

      // Click accuracy button to hide it
      fireEvent.click(screen.getByRole('button', { name: /accuracy/i }));

      chartCalls = vi.mocked(Chart).mock.calls;
      lastCall = chartCalls[chartCalls.length - 1][1] as any;
      expect(lastCall.data.labels).toEqual(['latency_score']);
      expect(lastCall.data.datasets[0].data).toEqual([0.7]);

      // Click accuracy again to show it
      fireEvent.click(screen.getByRole('button', { name: /accuracy/i }));

      chartCalls = vi.mocked(Chart).mock.calls;
      lastCall = chartCalls[chartCalls.length - 1][1] as any;
      expect(lastCall.data.labels).toEqual(['accuracy', 'latency_score']);
    });

    it('allows toggling between grouped and stacked view', () => {
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

      render(<MetricChart table={mockTable} />);

      const toggleButton = screen.getByRole('button', { name: /grouped/i });
      expect(toggleButton).toBeInTheDocument();

      let chartCalls = vi.mocked(Chart).mock.calls;
      let lastCall = chartCalls[chartCalls.length - 1][1] as any;
      expect(lastCall.options.scales.x.stacked).toBe(false);

      // Click toggle button to switch to stacked
      fireEvent.click(toggleButton);

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

      render(<MetricChart table={mockTable} />);

      // Click 'None' button
      const noneButton = screen.getByRole('button', { name: 'None' });
      fireEvent.click(noneButton);

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
      });

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
      });

      expect(() => {
        render(<ResultsCharts scores={[0.8, 0.6]} />);
      }).not.toThrow();
    });
  });
});
