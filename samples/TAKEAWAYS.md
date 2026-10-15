# Takeaways

Reusable Pine Script techniques collected from samples. Maintained by the pine-assessor agent.

### Swing low = HTF candle low swept and rejected by the next HTF candle
Source: samples/TLM-HTF.pine (lines ~749-750) · Use when: marking liquidity levels from higher timeframes
```pine
// A = earlier HTF candle, B = next HTF candle
potentialLow = B.low < A.low                       // B still forming
confirmedLow = B.low < A.low and B.close > A.low   // B closed back above A's low
```

### Track HTF candles from chart bars, no request.security
Source: built in indicators/htf-swing-lows · Use when: you only need an HTF candle's low/high/close and the chart is a lower timeframe
```pine
newHtf = timeframe.change("60")
if newHtf
    htfLow := low
else
    htfLow := math.min(htfLow, low)   // htfLow declared with var
```
