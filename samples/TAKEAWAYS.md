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

### CISD level = extreme open of the latest same-direction candle run
Source: samples/Cisd.pine · Use when: marking where a change in state of delivery happens
```pine
// bias 1: level = lowest open of the latest run of bullish candles (dojis skipped); bias -1: highest open of bearish run
// bias bearish and close > level  -> bullish CISD, flip bias
// bias bullish and close < level  -> bearish CISD, flip bias
// new high/low in the bias direction moves the level to the latest run
```

### Run every state-machine update on barstate.isconfirmed
Source: built in indicators/htf-swing-lows · Use when: a script keeps arrays or drawings that must not be duplicated by realtime ticks
