import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
import { useTableStore } from './store';
import type { EvaluateTable } from '@promptfoo/types';

export interface ResultsChartsProps {
  scores?: number[];
}

export interface ChartProps {
  table: EvaluateTable;
}

const COLOR_PALETTE = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // violet
];

const PASS_COLOR = '#22c55e'; // Green
const FAIL_COLOR = '#ef4444'; // Red

Chart.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend, Colors);

export function DescriptionResultsChart({ table }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);
  const [promptView, setPromptView] = useState<string>('compare');

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
          label: 'Pass',
          data: passCounts,
          backgroundColor: PASS_COLOR,
          stack: 'results',
        },
        {
          label: 'Fail',
          data: failCounts,
          backgroundColor: FAIL_COLOR,
          stack: 'results',
        },
      ];
    } else if (promptView === 'combined') {
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
          backgroundColor: PASS_COLOR,
          stack: 'results',
        },
        {
          label: 'Fail',
          data: failCounts,
          backgroundColor: FAIL_COLOR,
          stack: 'results',
        },
      ];
    } else if (promptView !== 'compare' && !Number.isNaN(Number(promptView))) {
      const pIdx = Number(promptView);
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
          label: 'Pass',
          data: passCounts,
          backgroundColor: PASS_COLOR,
          stack: 'results',
        },
        {
          label: 'Fail',
          data: failCounts,
          backgroundColor: FAIL_COLOR,
          stack: 'results',
        },
      ];
    } else {
      // compare mode: each prompt gets its own stack
      datasets = prompts.flatMap((prompt, pIdx) => {
        const pLabel = prompt.label || prompt.provider || `Prompt ${pIdx + 1}`;
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
            backgroundColor: PASS_COLOR,
            stack: `prompt-${pIdx}`,
          },
          {
            label: `${pLabel} (Fail)`,
            data: failCounts,
            backgroundColor: FAIL_COLOR,
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
            },
            grid: {
              display: false,
            },
            ticks: {
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
            },
            ticks: {
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
              filter(legendItem: { datasetIndex?: number }) {
                // When in compare mode, avoid duplicating Pass/Fail in legend
                return legendItem.datasetIndex === 0 || legendItem.datasetIndex === 1;
              },
              generateLabels(_chart: Chart) {
                return [
                  {
                    text: 'Pass',
                    fillStyle: PASS_COLOR,
                    strokeStyle: PASS_COLOR,
                    hidden: false,
                    datasetIndex: 0,
                  },
                  {
                    text: 'Fail',
                    fillStyle: FAIL_COLOR,
                    strokeStyle: FAIL_COLOR,
                    hidden: false,
                    datasetIndex: 1,
                  },
                ];
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
  }, [descriptions, promptView, prompts, rows]);

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
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compare">Compare all models</SelectItem>
              <SelectItem value="combined">All models (combined)</SelectItem>
              {prompts.map((prompt, idx) => (
                <SelectItem key={idx} value={String(idx)}>
                  {prompt.label || prompt.provider || `Prompt ${idx + 1}`}
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

export function MetricChart({ table }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

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

  const [visibleMetrics, setVisibleMetrics] = useState<string[]>(allMetricKeys);
  const [isStacked, setIsStacked] = useState<boolean>(false);

  // Sync visible metrics when available keys change
  useEffect(() => {
    setVisibleMetrics(allMetricKeys);
  }, [allMetricKeys]);

  const toggleMetric = (key: string) => {
    setVisibleMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const activeMetricKeys = useMemo(() => {
    return allMetricKeys.filter((key) => visibleMetrics.includes(key));
  }, [allMetricKeys, visibleMetrics]);

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
      const data = activeMetricKeys.map((key) => {
        const val = prompt.metrics?.namedScores?.[key];
        return typeof val === 'number' && Number.isFinite(val) ? val : 0;
      });

      return {
        label: prompt.label || prompt.provider || `Prompt ${promptIdx + 1}`,
        data,
        backgroundColor: COLOR_PALETTE[promptIdx % COLOR_PALETTE.length],
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
            },
          },
          y: {
            stacked: isStacked,
            beginAtZero: true,
            title: {
              display: true,
              text: 'Score',
            },
            ticks: {
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
  }, [activeMetricKeys, isStacked, prompts]);

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
          onClick={() => setIsStacked((prev) => !prev)}
        >
          {isStacked ? 'Stacked' : 'Grouped'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-xs text-muted-foreground font-medium mr-1">Metrics:</span>
        {allMetricKeys.map((key) => {
          const isVisible = visibleMetrics.includes(key);
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
              onClick={() => setVisibleMetrics([...allMetricKeys])}
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground"
              onClick={() => setVisibleMetrics([])}
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
  useLayoutEffect(() => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    Chart.defaults.color = isDark ? '#aaa' : '#666';
  }, []);

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
            <DescriptionResultsChart table={table} />
          </div>
          <div className="flex flex-col min-h-[360px] p-4 bg-background/50 rounded-lg border border-border">
            <MetricChart table={table} />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default React.memo(ResultsCharts);
