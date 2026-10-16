# Preview (throwaway)

A browser preview of `indicators/htf-swing-lows` so you can see roughly how changes look without pasting into TradingView.
Delete this whole folder whenever you like; nothing else depends on it.

Open it: `open preview/index.html` (or double-click `index.html`).

- **Header**: pick the data (NQ sample, Binance crypto, random, CSV) and switch timeframes (30s, 1m, 3m, 5m, 15m, 30m, 1h)
  like on TradingView. 30s only works with Binance, because the NQ sample starts at 1-minute candles.
- **NQ sample**: `data/nq-1m.js`, Yahoo Finance `NQ=F` 1-minute candles for the last 30 days (Yahoo keeps 1-minute
  history for 30 days only). Higher timeframes are built from it. HTF candles start at 18:00 New York like CME sessions.
  The front-month contract on Yahoo can differ slightly in price from TradingView's NQ1!.
- **Logic**: `engine.js` is a JavaScript copy of the Pine code (v0.8.0). It is not the real script, so TradingView stays the final check.
  When the Pine code changes, ask Claude to update `engine.js` too, or the preview will drift.
- **Differences from TradingView**: lines are cut at the last bar (TradingView draws a few bars into the future).
