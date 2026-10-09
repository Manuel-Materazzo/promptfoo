import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { cn } from '@app/lib/utils';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartDataset,
  Colors,
  Legend,
  LinearScale,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import { ErrorBoundary } from 'react-error-boundary';
import { useResultsViewSettingsStore, useTableStore } from './store';
import type { EvaluateTable } from '@promptfoo/types';

export interface ResultsChartsProps {
  scores?: number[];
}

export interface ChartProps {
  table: EvaluateTable;
  textColor?: string;
}

export interface ModelColor {
  pass: string;
  fail: string;
  failBorder: string;
}

export const MODEL_COLORS: ModelColor[] = [
  {
    pass: '#2563eb', // Blue
    fail: 'rgba(37, 99, 235, 0.28)',
    failBorder: 'rgba(37, 99, 235, 0.65)',
  },
  {
    pass: '#7c3aed', // Purple / Violet
    fail: 'rgba(124, 58, 237, 0.28)',
    failBorder: 'rgba(124, 58, 237, 0.65)',
  },
  {
    pass: '#059669', // Emerald
    fail: 'rgba(5, 150, 105, 0.28)',
    failBorder: 'rgba(5, 150, 105, 0.65)',
  },
  {
    pass: '#d97706', // Amber
    fail: 'rgba(217, 119, 6, 0.28)',
    failBorder: 'rgba(217, 119, 6, 0.65)',
  },
  {
    pass: '#db2777', // Pink
    fail: 'rgba(219, 39, 119, 0.28)',
    failBorder: 'rgba(219, 39, 119, 0.65)',
  },
  {
    pass: '#0891b2', // Cyan
    fail: 'rgba(8, 145, 178, 0.28)',
    failBorder: 'rgba(8, 145, 178, 0.65)',
  },
  {
    pass: '#ea580c', // Orange
    fail: 'rgba(234, 88, 12, 0.28)',
    failBorder: 'rgba(234, 88, 12, 0.65)',
  },
  {
    pass: '#4f46e5', // Indigo
    fail: 'rgba(79, 70, 229, 0.28)',
    failBorder: 'rgba(79, 70, 229, 0.65)',
  },
];

export function getPromptDisplayLabel(
  prompt: { label?: string; provider?: string },
  promptIndex: number,
  fallbackDescription?: string,
  evalId?: string | null,
): string {
  let label = prompt.label || '';

  // If label has [eval-xxx], replace it with [description] ONLY if it matches the current eval's ID
  // or if no specific evalId was provided (for backwards compatibility with standalone / test callers).
  if (fallbackDescription) {
    if (evalId) {
      const escapedEvalId = evalId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      label = label.replace(new RegExp(`\\[${escapedEvalId}\\]`, 'g'), `[${fallbackDescription}]`);
      if (label.trim() === evalId) {
        label = fallbackDescription;
      }
    } else {
      label = label.replace(/\[eval-[a-zA-Z0-9_\-.:]+\]/g, `[${fallbackDescription}]`);
      if (/^eval-[a-zA-Z0-9_\-.:]+$/.test(label.trim())) {
        label = fallbackDescription;
      }
    }
  }

  const trimmed = label.trim();
  if (trimmed) {
    return trimmed;
  }

  if (fallbackDescription) {
    return prompt.provider ? `[${fallbackDescription}] ${prompt.provider}` : fallbackDescription;
  }

  return prompt.provider || `Prompt ${promptIndex + 1}`;
}

Chart.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend, Colors);

export function DescriptionResultsChart({ table, textColor }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);
  const { descriptionChartPromptView: promptView, setDescriptionChartPromptView: setPromptView } =
    useResultsViewSettingsStore();
  const { config, evalId } = useTableStore();
  const mainDescription = config?.description;

  const resolvedTextColor =
    textColor ||
    (typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark'
      ? '#aaa'
      : '#666');

  const prompts = table.head.prompts || [];
  const rows = table.body || [];

  const descriptions = useMemo(() => {
    const list: string[] = [];
    for (const row of rows) {
      const desc = row.description?.trim() || row.test?.description?.trim() || '(No description)';
      if (!list.includes(desc)) {
        list.push(desc);
      }
    }
    return list;
  }, [rows]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    if (descriptions.length === 0) {
      return;
    }

    let datasets: ChartDataset<'bar'>[] = [];

    if (prompts.length <= 1 || promptView === '0') {
      const pIdx = 0;
      const pLabel = getPromptDisplayLabel(prompts[pIdx] || {}, pIdx, mainDescription, evalId);
      const color = MODEL_COLORS[0];

      const passCounts = descriptions.map((desc) =>
        rows.reduce((acc, row) => {
          const d = row.description?.trim() || row.test?.description?.trim() || '(No description)';
          if (d !== desc) {
            return acc;
          }
          return acc + (row.outputs?.[pIdx]?.pass === true ? 1 : 0);
        }, 0),
      );

      const failCounts = descriptions.map((desc) =>
        rows.reduce((acc, row) => {
          const d = row.description?.trim() || row.test?.description?.trim() || '(No description)';
          if (d !== desc) {
            return acc;
          }
          return acc + (row.outputs?.[pIdx]?.pass === true ? 0 : 1);
        }, 0),
      );

      datasets = [
        {
          label: `${pLabel} (Pass)`,
          data: passCounts,
          backgroundColor: color.pass,
          stack: 'results',
        },
        {
          label: `${pLabel} (Fail)`,
          data: failCounts,
          backgroundColor: color.fail,
          borderColor: color.failBorder,
          borderWidth: 1,
          stack: 'results',
        },
      ];
    } else if (promptView === 'combined') {
      const color = MODEL_COLORS[0];
      const passCounts = descriptions.map((desc) =>
        rows.reduce((acc, row) => {
          const d = row.description?.trim() || row.test?.description?.trim() || '(No description)';
          if (d !== desc) {
            return acc;
          }
          return acc + (row.outputs || []).filter((output) => output?.pass === true).length;
        }, 0),
      );

      const failCounts = descriptions.map((desc) =>
        rows.reduce((acc, row) => {
          const d = row.description?.trim() || row.test?.description?.trim() || '(No description)';
          if (d !== desc) {
            return acc;
          }
          return (
            acc + (row.outputs || []).filter((output) => !output || output.pass !== true).length
          );
        }, 0),
      );

      datasets = [
        {
          label: 'Pass',
          data: passCounts,
          backgroundColor: color.pass,
          stack: 'results',
        },
        {
          label: 'Fail',
          data: failCounts,
          backgroundColor: color.fail,
          borderColor: color.failBorder,
          borderWidth: 1,
          stack: 'results',
        },
      ];
    } else if (promptView !== 'compare' && !Number.isNaN(Number(promptView))) {
      const pIdx = Number(promptView);
      const prompt = prompts[pIdx];
      const pLabel = getPromptDisplayLabel(prompt || {}, pIdx, mainDescription, evalId);
      const color = MODEL_COLORS[pIdx % MODEL_COLORS.length];

      const passCounts = descriptions.map((desc) =>
        rows.reduce((acc, row) => {
          const d = row.description?.trim() || row.test?.description?.trim() || '(No description)';
          if (d !== desc) {
            return acc;
          }
          return acc + (row.outputs?.[pIdx]?.pass === true ? 1 : 0);
        }, 0),
      );

      const failCounts = descriptions.map((desc) =>
        rows.reduce((acc, row) => {
          const d = row.description?.trim() || row.test?.description?.trim() || '(No description)';
          if (d !== desc) {
            return acc;
          }
          return acc + (row.outputs?.[pIdx]?.pass === true ? 0 : 1);
        }, 0),
      );

      datasets = [
        {
          label: `${pLabel} (Pass)`,
          data: passCounts,
          backgroundColor: color.pass,
          stack: 'results',
        },
        {
          label: `${pLabel} (Fail)`,
          data: failCounts,
          backgroundColor: color.fail,
          borderColor: color.failBorder,
          borderWidth: 1,
          stack: 'results',
        },
      ];
    } else {
      // compare mode: each prompt gets its own stack with distinct pass & quieter fail color
      datasets = prompts.flatMap((prompt, pIdx) => {
        const pLabel = getPromptDisplayLabel(prompt, pIdx, mainDescription, evalId);
        const color = MODEL_COLORS[pIdx % MODEL_COLORS.length];

        const passCounts = descriptions.map((desc) =>
          rows.reduce((acc, row) => {
            const d =
              row.description?.trim() || row.test?.description?.trim() || '(No description)';
            if (d !== desc) {
              return acc;
            }
            return acc + (row.outputs?.[pIdx]?.pass === true ? 1 : 0);
          }, 0),
        );

        const failCounts = descriptions.map((desc) =>
          rows.reduce((acc, row) => {
            const d =
              row.description?.trim() || row.test?.description?.trim() || '(No description)';
            if (d !== desc) {
              return acc;
            }
            return acc + (row.outputs?.[pIdx]?.pass === true ? 0 : 1);
          }, 0),
        );

        return [
          {
            label: `${pLabel} (Pass)`,
            data: passCounts,
            backgroundColor: color.pass,
            stack: `prompt-${pIdx}`,
          },
          {
            label: `${pLabel} (Fail)`,
            data: failCounts,
            backgroundColor: color.fail,
            borderColor: color.failBorder,
            borderWidth: 1,
            stack: `prompt-${pIdx}`,
          },
        ];
      });
    }

    const config = {
      type: 'bar' as const,
      data: {
        labels: descriptions,
        datasets,
      },
      options: {
        animation: false as const,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            title: {
              display: true,
              text: 'Description',
              color: resolvedTextColor,
            },
            grid: {
              display: false,
            },
            ticks: {
              color: resolvedTextColor,
              maxRotation: 45,
              minRotation: 0,
              autoSkip: false,
              callback(value: string | number) {
                const label = descriptions[Number(value)];
                if (typeof label === 'string' && label.length > 25) {
                  return `${label.substring(0, 22)}...`;
                }
                return label || value;
              },
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Tests',
              color: resolvedTextColor,
            },
            ticks: {
              color: resolvedTextColor,
              stepSize: 1,
              precision: 0,
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top' as const,
            labels: {
              color: resolvedTextColor,
              generateLabels(chart: Chart) {
                const color =
                  (chart.options.plugins?.legend?.labels?.color as string) ||
                  Chart.defaults.color ||
                  resolvedTextColor;
                return chart.data.datasets.map((dataset, idx) => ({
                  text: dataset.label || '',
                  fillStyle: dataset.backgroundColor as string,
                  strokeStyle:
                    (dataset.borderColor as string) || (dataset.backgroundColor as string),
                  lineWidth: dataset.borderWidth ? Number(dataset.borderWidth) : 0,
                  hidden: !chart.isDatasetVisible(idx),
                  datasetIndex: idx,
                  fontColor: color,
                }));
              },
            },
          },
          tooltip: {
            callbacks: {
              title(items: TooltipItem<'bar'>[]) {
                const index = items[0]?.dataIndex;
                return descriptions[index] ?? '';
              },
              label(item: TooltipItem<'bar'>) {
                const count = item.parsed.y ?? 0;
                return `${item.dataset.label}: ${count}`;
              },
            },
          },
        },
      },
    };

    chartInstance.current = new Chart(canvasRef.current, config);

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [descriptions, evalId, mainDescription, promptView, prompts, resolvedTextColor, rows]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-center p-4">
        <p className="text-sm font-medium text-muted-foreground">No test cases found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Results by Description</h3>
          <p className="text-xs text-muted-foreground">
            Pass / fail counts grouped by test description
          </p>
        </div>
        {prompts.length > 1 && (
          <Select value={promptView} onValueChange={setPromptView}>
            <SelectTrigger className="w-56 h-8 text-xs">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compare">Compare all models</SelectItem>
              <SelectItem value="combined">All models (combined)</SelectItem>
              {prompts.map((prompt, idx) => (
                <SelectItem key={idx} value={String(idx)}>
                  {getPromptDisplayLabel(prompt, idx, mainDescription, evalId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="relative flex-1 min-h-[260px] w-full">
        <canvas ref={canvasRef} style={{ maxHeight: '300px', width: '100%' }} />
      </div>
    </div>
  );
}

export function MetricChart({ table, textColor }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  const {
    metricChartStacked: isStacked,
    setMetricChartStacked: setIsStacked,
    metricChartHiddenMetrics,
    setMetricChartHiddenMetrics,
  } = useResultsViewSettingsStore();
  const { config, evalId } = useTableStore();
  const mainDescription = config?.description;

  const resolvedTextColor =
    textColor ||
    (typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark'
      ? '#aaa'
      : '#666');

  const prompts = table.head.prompts || [];

  const allMetricKeys = useMemo(() => {
    const keys: string[] = [];
    for (const prompt of prompts) {
      for (const key of Object.keys(prompt.metrics?.namedScores || {})) {
        if (!keys.includes(key)) {
          keys.push(key);
        }
      }
    }
    return keys;
  }, [prompts]);

  const toggleMetric = (key: string) => {
    if (metricChartHiddenMetrics.includes(key)) {
      setMetricChartHiddenMetrics(metricChartHiddenMetrics.filter((k) => k !== key));
    } else {
      setMetricChartHiddenMetrics([...metricChartHiddenMetrics, key]);
    }
  };

  const activeMetricKeys = useMemo(() => {
    return allMetricKeys.filter((key) => !metricChartHiddenMetrics.includes(key));
  }, [allMetricKeys, metricChartHiddenMetrics]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    if (activeMetricKeys.length === 0) {
      return;
    }

    const datasets = prompts.map((prompt, promptIdx) => {
      const pLabel = getPromptDisplayLabel(prompt, promptIdx, mainDescription, evalId);
      const color = MODEL_COLORS[promptIdx % MODEL_COLORS.length];
      const data = activeMetricKeys.map((key) => {
        const val = prompt.metrics?.namedScores?.[key];
        return typeof val === 'number' && Number.isFinite(val) ? val : 0;
      });

      return {
        label: pLabel,
        data,
        backgroundColor: color.pass,
        stack: isStacked ? 'metrics-stack' : undefined,
      };
    });

    const config = {
      type: 'bar' as const,
      data: {
        labels: activeMetricKeys,
        datasets,
      },
      options: {
        animation: false as const,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: isStacked,
            grid: {
              display: false,
            },
            title: {
              display: true,
              text: 'Metric',
              color: resolvedTextColor,
            },
            ticks: {
              color: resolvedTextColor,
            },
          },
          y: {
            stacked: isStacked,
            beginAtZero: true,
            title: {
              display: true,
              text: 'Score',
              color: resolvedTextColor,
            },
            ticks: {
              color: resolvedTextColor,
              callback(value: string | number) {
                if (typeof value === 'number') {
                  return Number.isInteger(value) ? value : Number(value.toFixed(2));
                }
                return value;
              },
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top' as const,
            labels: {
              color: resolvedTextColor,
            },
          },
          tooltip: {
            callbacks: {
              title(items: TooltipItem<'bar'>[]) {
                return items[0]?.label ?? '';
              },
              label(item: TooltipItem<'bar'>) {
                const value = item.parsed.y ?? 0;
                const formatted = Number.isInteger(value) ? value : value.toFixed(2);
                return `${item.dataset.label}: ${formatted}`;
              },
            },
          },
        },
      },
    };

    chartInstance.current = new Chart(canvasRef.current, config);

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [activeMetricKeys, evalId, isStacked, mainDescription, prompts, resolvedTextColor]);

  if (allMetricKeys.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Metrics Comparison</h3>
          <p className="text-xs text-muted-foreground">Absolute scores across evaluation metrics</p>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 min-h-[260px] text-center p-4 border border-dashed rounded-md bg-muted/20">
          <p className="text-sm font-medium text-muted-foreground">No named metrics found</p>
          <p className="text-xs text-muted-foreground/75 mt-1 max-w-sm">
            Named metrics are generated from assertions that specify a metric name (e.g. rubrics or
            custom assertions).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Metrics Comparison</h3>
          <p className="text-xs text-muted-foreground">Absolute scores across evaluation metrics</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setIsStacked(!isStacked)}
        >
          {isStacked ? 'Stacked' : 'Grouped'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-xs text-muted-foreground font-medium mr-1">Metrics:</span>
        {allMetricKeys.map((key) => {
          const isVisible = !metricChartHiddenMetrics.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleMetric(key)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors cursor-pointer',
                isVisible
                  ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                  : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/50 line-through opacity-60',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  isVisible ? 'bg-primary' : 'bg-muted-foreground',
                )}
              />
              {key}
            </button>
          );
        })}
        {allMetricKeys.length > 2 && (
          <div className="flex gap-1 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground"
              onClick={() => setMetricChartHiddenMetrics([])}
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground"
              onClick={() => setMetricChartHiddenMetrics([...allMetricKeys])}
            >
              None
            </Button>
          </div>
        )}
      </div>

      <div className="relative flex-1 min-h-[260px] w-full">
        {activeMetricKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 border border-dashed rounded-md bg-muted/20">
            <p className="text-sm font-medium text-muted-foreground">All metrics hidden</p>
            <p className="text-xs text-muted-foreground/75 mt-1">
              Click a metric above or &quot;All&quot; to show metrics on the chart.
            </p>
          </div>
        ) : (
          <canvas ref={canvasRef} style={{ maxHeight: '300px', width: '100%' }} />
        )}
      </div>
    </div>
  );
}

function ResultsCharts({ scores: _scores }: ResultsChartsProps) {
  const [isDark, setIsDark] = React.useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-theme') === 'dark',
  );

  useLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const updateTheme = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      setIsDark(dark);
      Chart.defaults.color = dark ? '#aaa' : '#666';
    };
    updateTheme();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          updateTheme();
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const textColor = isDark ? '#aaa' : '#666';

  const { table } = useTableStore();

  if (!table) {
    return null;
  }

  return (
    <ErrorBoundary fallback={null}>
      <div
        className="relative p-6 mt-2 bg-card rounded-lg border border-border shadow-sm"
        data-testid="results-charts"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          <div className="flex flex-col min-h-[360px] p-4 bg-background/50 rounded-lg border border-border">
            <DescriptionResultsChart table={table} textColor={textColor} />
          </div>
          <div className="flex flex-col min-h-[360px] p-4 bg-background/50 rounded-lg border border-border">
            <MetricChart table={table} textColor={textColor} />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default React.memo(ResultsCharts);
