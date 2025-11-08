"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
  TimeScale,
} from "chart.js";
import type { ChartData, ChartOptions, TooltipItem } from "chart.js";
import "chartjs-adapter-date-fns";
import { Chart } from "react-chartjs-2";
import {
  calculateZeroLagMacd,
  toNullableSeries,
  ZeroLagMacdSettings,
} from "@/lib/zeroLagMacd";

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
);

type PricePoint = {
  time: string;
  close: number;
};

const defaultSettings: ZeroLagMacdSettings = {
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  macdEmaLength: 9,
  signalType: "ema",
  algorithm: "glaz",
};

const DEFAULT_SYMBOL = "EURUSD";

const OUTPUTSIZE = "compact";

const fetchSeries = async (symbol: string): Promise<PricePoint[]> => {
  const normalized = symbol.trim().toUpperCase();
  if (normalized.length < 6) {
    throw new Error("Symbol must contain at least 6 characters, e.g. EURUSD");
  }

  const base = normalized.slice(0, 3);
  const quote = normalized.slice(3);

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "FX_DAILY");
  url.searchParams.set("from_symbol", base);
  url.searchParams.set("to_symbol", quote);
  url.searchParams.set("apikey", "demo");
  url.searchParams.set("outputsize", OUTPUTSIZE);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch data (HTTP ${response.status})`);
  }

  const json = await response.json();
  const seriesKey = Object.keys(json).find((key) => key.startsWith("Time Series"));
  if (!seriesKey) {
    throw new Error(json["Note"] ?? json["Error Message"] ?? "Unexpected response");
  }

  const entries = Object.entries(json[seriesKey] as Record<string, Record<string, string>>)
    .map(([time, values]) => ({
      time,
      close: Number.parseFloat(values["4. close"]),
    }))
    .filter((point) => !Number.isNaN(point.close))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  if (entries.length === 0) {
    throw new Error("No price data available for symbol");
  }

  return entries;
};

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toFixed(5) : "N/A";

const warmupForSettings = (settings: ZeroLagMacdSettings) =>
  Math.max(settings.fastLength, settings.slowLength, settings.signalLength, settings.macdEmaLength);

export const ZeroLagMacdChart = () => {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [settings, setSettings] = useState<ZeroLagMacdSettings>(defaultSettings);
  const [series, setSeries] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDots, setShowDots] = useState(true);

  const handleSettingChange = useCallback(
    (field: keyof ZeroLagMacdSettings) => (value: number | string) => {
      setSettings((prev) => ({
        ...prev,
        [field]:
          typeof prev[field] === "number" ? Number(value) || prev[field] : value,
      }));
    },
    [],
  );

  const loadSeries = useCallback(
    async (requestedSymbol: string) => {
      try {
        setIsLoading(true);
        setError(null);
        const newSeries = await fetchSeries(requestedSymbol);
        setSeries(newSeries);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unknown error");
        setSeries([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadSeries(symbol);
  }, [loadSeries, symbol]);

  const indicator = useMemo(() => {
    if (series.length === 0) {
      return null;
    }
    const prices = series.map((point) => point.close);
    return calculateZeroLagMacd(prices, settings);
  }, [series, settings]);

  const warmup = warmupForSettings(settings);
  const labels = useMemo(() => series.map((point) => point.time), [series]);

  const macdStats = useMemo(() => {
    if (!indicator || indicator.macd.length === 0) {
      return null;
    }
    const latestIndex = indicator.macd.length - 1;
    return {
      macd: indicator.macd[latestIndex],
      signal: indicator.signal[latestIndex],
      histogram: indicator.histogram[latestIndex],
      fast: indicator.fastZlema[latestIndex],
      slow: indicator.slowZlema[latestIndex],
      close: series[latestIndex]?.close ?? 0,
    };
  }, [indicator, series]);

  const macdData = useMemo<ChartData<"bar"> | null>(() => {
    if (!indicator) {
      return null;
    }

    const macdSeries = toNullableSeries(indicator.macd, warmup);
    const signalSeries = toNullableSeries(indicator.signal, warmup);
    const histogramSeries = toNullableSeries(indicator.histogram, warmup);

    const datasets: ChartData<"bar">["datasets"] = [];

    datasets.push(
      {
        type: "line",
        label: "MACD",
        data: macdSeries,
        borderColor: "#2563eb",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      } as unknown as ChartData<"bar">["datasets"][number],
    );

    datasets.push(
      {
        type: "line",
        label: "Signal",
        data: signalSeries,
        borderColor: "#f97316",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      } as unknown as ChartData<"bar">["datasets"][number],
    );

    datasets.push(
      {
        type: "bar",
        label: "Histogram",
        data: histogramSeries,
        backgroundColor: histogramSeries.map((value) =>
          value == null
            ? "rgba(0,0,0,0)"
            : value >= 0
            ? "rgba(22, 163, 74, 0.45)"
            : "rgba(220, 38, 38, 0.45)",
        ),
        borderColor: histogramSeries.map((value) =>
          value == null
            ? "rgba(0,0,0,0)"
            : value >= 0
            ? "rgba(22, 163, 74, 0.8)"
            : "rgba(220, 38, 38, 0.8)",
        ),
        borderWidth: 1,
      } as unknown as ChartData<"bar">["datasets"][number],
    );

    if (showDots) {
      datasets.push(
        {
          type: "line",
          label: "Positive Dots",
          data: histogramSeries.map((value) => (value != null && value > 0 ? value : null)),
          borderColor: "transparent",
          backgroundColor: histogramSeries.map((value) =>
            value != null && value > 0 ? "#14b8a6" : "rgba(20, 184, 166, 0)",
          ),
          pointRadius: 3,
          pointHoverRadius: 4,
          showLine: false,
        } as unknown as ChartData<"bar">["datasets"][number],
      );
    }

    return {
      labels,
      datasets,
    } as ChartData<"bar">;
  }, [indicator, labels, showDots, warmup]);

  const priceData = useMemo<ChartData<"line"> | null>(() => {
    if (series.length === 0) {
      return null;
    }

    const datasets: ChartData<"line">["datasets"] = [];

    datasets.push({
      label: `${symbol.toUpperCase()} Close`,
      data: series.map((point) => point.close),
      borderColor: "#111827",
      backgroundColor: "rgba(17, 24, 39, 0.15)",
      pointRadius: 0,
      fill: true,
      tension: 0.3,
      borderWidth: 2,
    } as ChartData<"line">["datasets"][number]);

    if (indicator) {
      datasets.push({
        label: "Fast ZeroLag EMA",
        data: indicator.fastZlema,
        borderColor: "#0ea5e9",
        borderWidth: 1.5,
        pointRadius: 0,
      } as ChartData<"line">["datasets"][number]);

      datasets.push({
        label: "Slow ZeroLag EMA",
        data: indicator.slowZlema,
        borderColor: "#f97316",
        borderWidth: 1.5,
        pointRadius: 0,
      } as ChartData<"line">["datasets"][number]);
    }

    return {
      labels,
      datasets,
    } as ChartData<"line">;
  }, [indicator, labels, series, symbol]);

  const macdOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index" as const,
      },
      scales: {
        x: {
          type: "time" as const,
          time: { tooltipFormat: "PP" },
          ticks: { maxRotation: 0, autoSkip: true, color: "#4b5563" },
          grid: { color: "rgba(156, 163, 175, 0.15)" },
        },
        y: {
          ticks: { color: "#4b5563" },
          grid: { color: "rgba(156, 163, 175, 0.15)" },
        },
      },
      plugins: {
        legend: { position: "top" as const },
        tooltip: {
          callbacks: {
            label: (context: TooltipItem<"bar">) => {
              const label = context.dataset.label ?? "";
              const value = context.parsed.y;
              if (value == null) {
                return `${label}: --`;
              }
              return `${label}: ${formatNumber(value)}`;
            },
          },
        },
      },
    }),
    [],
  );

  const priceOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" as const },
      scales: {
        x: {
          type: "time" as const,
          time: { tooltipFormat: "PP" },
          ticks: { maxRotation: 0, color: "#4b5563" },
          grid: { color: "rgba(156, 163, 175, 0.15)" },
        },
        y: {
          ticks: { color: "#4b5563" },
          grid: { color: "rgba(156, 163, 175, 0.15)" },
        },
      },
      plugins: {
        legend: { position: "top" as const },
        tooltip: {
          callbacks: {
            label: (context: TooltipItem<"line">) => {
              const value = context.parsed.y;
              if (value == null) {
                return `${context.dataset.label}: --`;
              }
              return `${context.dataset.label}: ${formatNumber(value)}`;
            },
          },
        },
      },
    }),
    [],
  );

  const isReady = !isLoading && macdData && priceData;

  return (
    <section className="flex flex-col gap-8 text-gray-900">
      <header className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Zero Lag MACD Enhanced
            </h1>
            <p className="text-sm text-slate-600">
              Interactive implementation of the Zero Lag MACD (v1.2) with configurable parameters.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              maxLength={12}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase shadow-sm focus:border-slate-900 focus:outline-none"
              placeholder="Symbol e.g. EURUSD"
            />
            <button
              type="button"
              onClick={() => loadSeries(symbol)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt className="text-slate-500">Close</dt>
            <dd className="font-semibold text-slate-900">
              {macdStats ? formatNumber(macdStats.close) : "--"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">MACD</dt>
            <dd className="font-semibold text-blue-600">
              {macdStats ? formatNumber(macdStats.macd) : "--"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Signal</dt>
            <dd className="font-semibold text-orange-500">
              {macdStats ? formatNumber(macdStats.signal) : "--"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Histogram</dt>
            <dd
              className={classNames("font-semibold", {
                "text-emerald-600": macdStats && macdStats.histogram >= 0,
                "text-rose-600": macdStats && macdStats.histogram < 0,
                "text-slate-400": !macdStats,
              })}
            >
              {macdStats ? formatNumber(macdStats.histogram) : "--"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Fast ZeroLag</dt>
            <dd className="font-semibold text-slate-900">
              {macdStats ? formatNumber(macdStats.fast) : "--"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Slow ZeroLag</dt>
            <dd className="font-semibold text-slate-900">
              {macdStats ? formatNumber(macdStats.slow) : "--"}
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <div className="h-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            {priceData && (
              <Chart type="line" data={priceData} options={priceOptions} />
            )}
          </div>
          <div className="h-80 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            {macdData && <Chart type="bar" data={macdData} options={macdOptions} />}
          </div>
        </div>

        <aside className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Parameters</h2>
          <fieldset className="grid grid-cols-2 gap-4 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-slate-600">Fast Length</span>
              <input
                type="number"
                min={1}
                value={settings.fastLength}
                onChange={(event) => handleSettingChange("fastLength")(Number(event.target.value))}
                className="rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-slate-900 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-600">Slow Length</span>
              <input
                type="number"
                min={2}
                value={settings.slowLength}
                onChange={(event) => handleSettingChange("slowLength")(Number(event.target.value))}
                className="rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-slate-900 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-600">Signal Length</span>
              <input
                type="number"
                min={1}
                value={settings.signalLength}
                onChange={(event) => handleSettingChange("signalLength")(Number(event.target.value))}
                className="rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-slate-900 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-600">MACD EMA Length</span>
              <input
                type="number"
                min={1}
                value={settings.macdEmaLength}
                onChange={(event) => handleSettingChange("macdEmaLength")(Number(event.target.value))}
                className="rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-slate-900 focus:outline-none"
              />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-2 text-sm">
            <span className="text-slate-600">Signal Smoothing</span>
            <div className="flex gap-2">
              {(["ema", "sma"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={classNames(
                    "flex-1 rounded-lg border px-3 py-2 font-medium capitalize transition",
                    settings.signalType === type
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-gray-300 bg-white text-slate-700 hover:border-slate-500",
                  )}
                  onClick={() => setSettings((prev) => ({ ...prev, signalType: type }))}
                >
                  {type}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 text-sm">
            <span className="text-slate-600">Zero Lag Algorithm</span>
            <div className="flex gap-2">
              {(["glaz", "legacy"] as const).map((algorithm) => (
                <button
                  key={algorithm}
                  type="button"
                  className={classNames(
                    "flex-1 rounded-lg border px-3 py-2 font-medium capitalize transition",
                    settings.algorithm === algorithm
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-gray-300 bg-white text-slate-700 hover:border-slate-500",
                  )}
                  onClick={() => setSettings((prev) => ({ ...prev, algorithm }))}
                >
                  {algorithm}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span>Show positive dots</span>
            <button
              type="button"
              onClick={() => setShowDots((previous) => !previous)}
              className={classNames(
                "relative inline-flex h-6 w-11 items-center rounded-full transition",
                showDots ? "bg-slate-900" : "bg-gray-300",
              )}
            >
              <span
                className={classNames(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition",
                  showDots ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </label>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Data courtesy of Alpha Vantage demo API. Adjust parameters to explore the indicator response.
            </p>
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500" />
              Fetching latest quotes…
            </div>
          )}

          {!isReady && !isLoading && !error && (
            <div className="text-sm text-slate-600">Adjust parameters or refresh to generate data.</div>
          )}
        </aside>
      </div>
    </section>
  );
};
