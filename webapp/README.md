## Zero Lag MACD Enhanced

This project delivers an interactive web implementation of the **Zero Lag MACD Enhanced (v1.2)** indicator, inspired by the original TradingView study from Albert Callisto. It is built with Next.js 16, Tailwind CSS, and Chart.js.

### Features

- Daily FX data fetched live from the Alpha Vantage demo API (default pair: EURUSD)
- Zero Lag MACD calculations supporting both "Glaz" and "Legacy" algorithms
- Configurable lengths for fast, slow, signal, and MACD EMA periods
- Toggle between EMA/SMA signal smoothing and optional positive histogram dots
- Dual chart layout showing price with Zero Lag EMAs plus MACD histogram and signal lines

### Local Development

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser to explore the indicator. Adjust parameters in the sidebar to see the indicator respond instantly.

### Production Build

```bash
npm run build
npm run start
```

The production build is fully static and ready to deploy to Vercel.
