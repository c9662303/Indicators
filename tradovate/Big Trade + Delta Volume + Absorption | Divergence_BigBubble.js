const predef = require("./tools/predef");
const { px, du, op, min, max } = require('./tools/graphics');

// ── SESSION DEFINITIONS ──────────────────────────────────────────────────────
// Hardcoded session windows, defined in each market's *native local time*.
// These are resolved to actual UTC windows per-bar (see resolveSessionUTC),
// so they stay correct regardless of:
//   - the chart's display timezone (e.g. Dubai time)
//   - daylight saving transitions in the session's home timezone
//
// utcOffsetStd / utcOffsetDst: hours to ADD to local time to get UTC during
// standard time / daylight time respectively (e.g. New York is UTC-5 standard,
// UTC-4 daylight, so offsets here are -5 and -4 — added to local to reach UTC
// means: UTC = local - offset, so we store offset as hours *behind* UTC as a
// positive "hoursBehindUTC" value to keep the math unambiguous below).
const SESSIONS = {
    none: null,

    // New York / US equity & futures RTH: 9:30 AM - 4:00 PM ET
    new_york_rth: {
        label: 'New York RTH (9:30-16:00 ET)',
        openHour: 9, openMinute: 30,
        closeHour: 16, closeMinute: 0,
        dst: 'us',
    },
    // CME futures overnight / Globex session, ET-based: 6:00 PM - 9:30 AM ET
    new_york_overnight: {
        label: 'New York Overnight (18:00-09:30 ET)',
        openHour: 18, openMinute: 0,
        closeHour: 9, closeMinute: 30,
        dst: 'us',
        overnight: true, // closes "the next day" relative to open
    },
    // Full Globex session: 6:00 PM - 5:00 PM ET (next day), i.e. nearly 23h
    new_york_globex: {
        label: 'New York Full Session (18:00-17:00 ET)',
        openHour: 18, openMinute: 0,
        closeHour: 17, closeMinute: 0,
        dst: 'us',
        overnight: true,
    },
    // London session: 8:00 AM - 4:30 PM London time (LSE cash hours)
    london: {
        label: 'London (08:00-16:30 UK)',
        openHour: 8, openMinute: 0,
        closeHour: 16, closeMinute: 30,
        dst: 'uk',
    },
    // Tokyo session: 9:00 AM - 3:00 PM JST (no DST in Japan)
    tokyo: {
        label: 'Tokyo (09:00-15:00 JST)',
        openHour: 9, openMinute: 0,
        closeHour: 15, closeMinute: 0,
        dst: 'none',
        fixedOffsetHours: 9, // JST = UTC+9 year-round
    },
    // Sydney session: 10:00 AM - 4:00 PM AEST/AEDT
    sydney: {
        label: 'Sydney (10:00-16:00 AET)',
        openHour: 10, openMinute: 0,
        closeHour: 16, closeMinute: 0,
        dst: 'au',
    },
    // Frankfurt/Xetra: 9:00 AM - 5:30 PM CET/CEST
    frankfurt: {
        label: 'Frankfurt (09:00-17:30 CET)',
        openHour: 9, openMinute: 0,
        closeHour: 17, closeMinute: 30,
        dst: 'eu',
    },
};

// Returns hours-behind-UTC for a given DST rule and a UTC instant (used only
// to figure out which side of a DST transition we're on, via UTC month — this
// is an approximation that ignores the exact transition day/hour, see note
// below).
function hoursBehindUTC(dstRule, fixedOffsetHours, utcDate) {
    if (dstRule === 'none') return -fixedOffsetHours; // negative => ahead of UTC

    const month = utcDate.getUTCMonth(); // 0=Jan..11=Dec
    const date  = utcDate.getUTCDate();

    // Rough DST windows (good enough for trading-session bucketing; exact
    // transition hour is not critical since sessions don't open/close at
    // exactly 2am on transition weekends in practice).
    if (dstRule === 'us') {
        // DST (EDT, UTC-4) roughly mid-March through early November.
        const isDst = (month > 2 && month < 10) ||
                      (month === 2 && date >= 8) ||   // ~2nd Sun March
                      (month === 10 && date < 1);     // never true, kept for clarity
        return isDst ? 4 : 5; // hours behind UTC
    }
    if (dstRule === 'uk' || dstRule === 'eu') {
        // BST/CEST roughly late-March through late-October.
        const isDst = (month > 2 && month < 9) ||
                      (month === 2 && date >= 25) ||  // ~last Sun March
                      (month === 9 && date < 26);      // ~last Sun Oct
        // UK is UTC+0 std / UTC+1 dst -> "behind UTC" is negative (ahead)
        // EU(Frankfurt) is UTC+1 std / UTC+2 dst.
        if (dstRule === 'uk') return isDst ? -1 : 0;
        return isDst ? -2 : -1;
    }
    if (dstRule === 'au') {
        // Sydney DST is opposite hemisphere: roughly Oct through early April.
        const isDst = (month > 9) || (month < 2) || (month === 2 && date < 1) ||
                      (month === 9 && date >= 1);
        return isDst ? -11 : -10;
    }
    return -fixedOffsetHours;
}

// Given a session config and the bar's UTC date, returns { startMs, endMs }
// for the session window covering (or most recently preceding) that bar.
function resolveSessionUTC(session, utcDate) {
    const behind = session.dst === 'none'
        ? -session.fixedOffsetHours
        : hoursBehindUTC(session.dst, session.fixedOffsetHours || 0, utcDate);

    // Local wall-clock date matching this UTC instant (for picking which
    // calendar day's open/close to anchor to).
    const localMs = utcDate.getTime() - behind * 3600000;
    const local = new Date(localMs);

    const sessionOpenLocal = new Date(Date.UTC(
        local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(),
        session.openHour, session.openMinute
    ));
    let sessionCloseLocal = new Date(Date.UTC(
        local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(),
        session.closeHour, session.closeMinute
    ));
    if (session.overnight || sessionCloseLocal.getTime() <= sessionOpenLocal.getTime()) {
        sessionCloseLocal = new Date(sessionCloseLocal.getTime() + 86400000);
    }

    // Convert those local wall-clock instants to true UTC ms.
    const openUTC  = sessionOpenLocal.getTime()  + behind * 3600000;
    const closeUTC = sessionCloseLocal.getTime() + behind * 3600000;

    return { startMs: openUTC, endMs: closeUTC };
}

// Returns true if the bar's actual UTC timestamp falls within the configured
// session window. If the bar is before today's session open, checks against
// yesterday's window too (handles bars just after midnight UTC for sessions
// that span a UTC day boundary).
function isInSession(sessionKey, barUtcMs) {
    const session = SESSIONS[sessionKey];
    if (!session) return true; // 'none' => no filtering

    const utcDate = new Date(barUtcMs);
    const todayWindow = resolveSessionUTC(session, utcDate);
    if (barUtcMs >= todayWindow.startMs && barUtcMs < todayWindow.endMs) return true;

    // Check the window anchored a day earlier too, in case barUtcMs sits in
    // the early-UTC tail of a session that opened "yesterday" local-date-wise.
    const yesterdayUtcDate = new Date(barUtcMs - 86400000);
    const yesterdayWindow = resolveSessionUTC(session, yesterdayUtcDate);
    if (barUtcMs >= yesterdayWindow.startMs && barUtcMs < yesterdayWindow.endMs) return true;

    return false;
}

// Returns a string key identifying which "trading day" a bar belongs to, for
// the purpose of resetting the delta/volume accumulator daily. When a session
// filter is active, the key is anchored to that session's own window (so the
// accumulator resets exactly when a new session window begins — e.g. a new
// "New York RTH" day, not a UTC calendar day, which would split/rejoin the
// session incorrectly). When no session filter is set, falls back to a plain
// UTC calendar-day key.
function dayKeyFor(sessionKey, barUtcMs) {
    const session = SESSIONS[sessionKey];
    if (!session) {
        const d = new Date(barUtcMs);
        return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    }
    const window = resolveSessionUTC(session, new Date(barUtcMs));
    // Key off the session's own open instant — every bar inside the same
    // session window resolves to the same openUTC ms, so this is stable
    // for the whole window and changes exactly when a new window starts.
    return `${sessionKey}_${window.startMs}`;
}

// ── HTF CANDLES ──────────────────────────────────────────────────────────────
// 30m and 1H candles (previous + current only) drawn to the right of the last
// bar, built from the chart's own bars, with the big trade bubbles of each HTF
// candle (same threshold and price grouping as the chart bubbles).
const HTF_TIMEFRAMES = [
    { key: '30m', label: '30m', ms: 30 * 60000 },
    { key: '1h',  label: '1H',  ms: 60 * 60000 },
];
const HOUR_MS = 3600000;
// HTF candle colours (bullish / bearish), TradingView style: body, border, wick.
const HTF_COLORS = {
    bull: { body: '#e1e1df', border: '#696d7a', wick: '#696d7a' },
    bear: { body: '#696d7a', border: '#696d7a', wick: '#696d7a' },
};

// Groups price levels into buckets of `modifiedSize`, exactly as the chart-bar
// bubbles do above, so an HTF candle's bubbles match what that timeframe's
// chart would show.
function combineLevels(levels, modifiedSize) {
    const combinedProfs = {};
    let last, barInit;
    levels
        .slice()
        .sort((a, b) => a.price - b.price)
        .forEach(({ price, vol, bidVol, askVol }) => {
            if (!barInit) barInit = price;
            if (last && last >= barInit + modifiedSize) barInit = price;
            if (last && last <= barInit + modifiedSize) {
                let item = combinedProfs[barInit.toFixed(7).toString()];
                if (!item) {
                    item = { vol: 0, askVol: 0, bidVol: 0, price: barInit };
                    combinedProfs[barInit.toFixed(7).toString()] = item;
                }
                item.askVol += askVol;
                item.bidVol += bidVol;
                item.vol    += vol;
            }
            last = price;
        });
    return Object.values(combinedProfs);
}

// One HTF candle from its chart bars: OHLC plus the volume at each price summed
// over all of them.
function buildHtfCandle(bars) {
    const sorted = bars.slice().sort((a, b) => a.t - b.t);
    const byPrice = {};
    sorted.forEach(b => b.levels.forEach(({ price, vol, bidVol, askVol }) => {
        const k = price.toFixed(7);
        if (!byPrice[k]) byPrice[k] = { price, vol: 0, bidVol: 0, askVol: 0 };
        byPrice[k].vol    += vol;
        byPrice[k].bidVol += bidVol;
        byPrice[k].askVol += askVol;
    }));
    return {
        o: sorted[0].o,
        h: Math.max(...sorted.map(b => b.h)),
        l: Math.min(...sorted.map(b => b.l)),
        c: sorted[sorted.length - 1].c,
        levels: Object.values(byPrice),
    };
}

// ── ABSORBED BIG ORDERS → CISD ───────────────────────────────────────────────
// A big order is a bubble (same threshold and price grouping as the chart
// bubbles). Big sellers are absorbed when no candle closes below their zone and
// price then makes a bullish CISD: a close above the highest open of the latest
// run of down-close candles, with the sellers' zone below that level. Big buyers
// mirror it with a bearish CISD. Judged on closed candles only.
const ABSORB_COLORS = { bull: '#52D4FC', bear: '#FD7070' };
// Colour of the candle that makes the CISD.
const CISD_CANDLE_COLORS = { bull: '#22C55E', bear: '#EF4444' };

// Copy of the absorption state, so the forming candle can be judged without
// changing what the closed candles have built up.
function cloneAbsState(st) {
    return {
        sell: st.sell.slice(),
        buy: st.buy.slice(),
        downRun: st.downRun ? Object.assign({}, st.downRun) : null,
        upRun: st.upRun ? Object.assign({}, st.upRun) : null,
        lastDir: st.lastDir,
    };
}

// One closed candle: records its big orders, drops the ones price closed
// through (they worked) or that are too old, and returns the CISDs that
// absorbed big orders on the other side.
function stepAbsorption(st, bar, threshold, modSize, tolerance, maxBars) {
    const events = [];
    const { i, o, c, groups } = bar;

    groups.forEach(({ price, bidVol, askVol }) => {
        const delta = askVol - bidVol;
        if (delta < -threshold) st.sell.push({ bar: i, low: price, high: price + modSize, delta });
        if (delta > threshold)  st.buy.push({ bar: i, low: price, high: price + modSize, delta });
    });
    st.sell = st.sell.filter(b => i - b.bar <= maxBars && c >= b.low - tolerance);
    st.buy  = st.buy.filter(b => i - b.bar <= maxBars && c <= b.high + tolerance);

    const dir = c > o ? 1 : c < o ? -1 : 0;

    // Bullish CISD absorbing big sellers
    if (dir === 1 && st.downRun && c > st.downRun.level) {
        const level = st.downRun.level;
        const absorbed = st.sell.filter(b => b.low < level);
        if (absorbed.length > 0) {
            events.push({ side: 'bull', bar: i, level, start: st.downRun.start, orders: absorbed });
            st.sell = st.sell.filter(b => absorbed.indexOf(b) < 0);
        }
        st.downRun = null;
    }
    // Bearish CISD absorbing big buyers
    if (dir === -1 && st.upRun && c < st.upRun.level) {
        const level = st.upRun.level;
        const absorbed = st.buy.filter(b => b.high > level);
        if (absorbed.length > 0) {
            events.push({ side: 'bear', bar: i, level, start: st.upRun.start, orders: absorbed });
            st.buy = st.buy.filter(b => absorbed.indexOf(b) < 0);
        }
        st.upRun = null;
    }

    // Runs of same-direction candles (dojis skipped); the newest run is the reference.
    if (dir === -1) {
        if (st.lastDir === -1 && st.downRun) st.downRun.level = Math.max(st.downRun.level, o);
        else st.downRun = { start: i, level: o };
    }
    if (dir === 1) {
        if (st.lastDir === 1 && st.upRun) st.upRun.level = Math.min(st.upRun.level, o);
        else st.upRun = { start: i, level: o };
    }
    if (dir !== 0) st.lastDir = dir;

    return events;
}

// The zone of the absorbed orders around their average price: the average is
// weighted by each order's size (|delta|), and every order whose middle lies
// within one standard deviation of it (at least one bubble's height) is
// included, above or below. The zone spans those orders and is clipped at the
// CISD level, so a bullish zone sits below the line and a bearish one above it.
function absorbedZone(ev, modSize) {
    const pts = ev.orders.map(b => ({ b, mid: (b.low + b.high) / 2, w: Math.abs(b.delta) }));
    const total = pts.reduce((s, p) => s + p.w, 0);
    const avg = pts.reduce((s, p) => s + p.mid * p.w, 0) / total;
    const sd = Math.sqrt(pts.reduce((s, p) => s + p.w * (p.mid - avg) * (p.mid - avg), 0) / total);
    const band = Math.max(sd, modSize);
    const near = pts.filter(p => Math.abs(p.mid - avg) <= band).map(p => p.b);
    const zone = {
        avg,
        low: Math.min(...near.map(b => b.low)),
        high: Math.max(...near.map(b => b.high)),
        delta: near.reduce((s, b) => s + b.delta, 0),
        firstBar: Math.min(...near.map(b => b.bar)),
    };
    if (ev.side === 'bull') zone.high = Math.min(zone.high, ev.level);
    else zone.low = Math.max(zone.low, ev.level);
    return zone;
}

class BigTradeDeltaAbsorption {
    init() {
        // --- Big Trade Bubbles / Price Axis Delta state ---
        this.mDelta   = 0;
        this.maxDelta = 0;
        this.byPrice  = {};
        this.currentDayKey = null;

        // --- Absorption / Divergence state ---
        this.defaultTickSize = 0.01; // Fallback tick size
        this.validationState = {
            consecutiveErrors: 0,
            maxConsecutiveErrors: 5,
        };

        // --- HTF candles state ---
        this.htfBars = {};        // chart bars of the previous + current hour, by bar index
        this.htfCurHour = null;
        this.htfPrevHour = null;
        this.htfMaxDelta = {};    // per HTF timeframe, for bubble sizing

        // --- Absorbed big orders → CISD state ---
        this.absState = { sell: [], buy: [], downRun: null, upRun: null, lastDir: 0 };
        this.absIndex = null;     // bar currently being mapped
        this.absLastBar = null;   // its latest data (added to absState once the next bar starts)

        console.log('BigTradeDeltaAbsorption (RewiredSanjay): Initialization started');
    }

    map(d, i, history) {

        // ── DEFENSIVE VALIDATION (shared by both features) ──────────────────
        // Ported from the absorption indicator. If contractInfo/OHLC/volume
        // data is missing or malformed for this bar, skip the whole bar
        // rather than letting either feature draw on top of bad data.
        if (!this.contractInfo || typeof this.contractInfo.tickSize !== 'number' || this.contractInfo.tickSize <= 0) {
            console.warn('BigTradeDeltaAbsorption: Missing or invalid contractInfo.tickSize for bar ' + d.index() + ', using fallback');
            this.contractInfo = this.contractInfo || {};
            this.contractInfo.tickSize = this.contractInfo.tickSize || this.defaultTickSize;
        }

        const hasValidOHLC = (
            typeof d.open() === 'number' && !isNaN(d.open()) &&
            typeof d.close() === 'number' && !isNaN(d.close()) &&
            typeof d.high() === 'number' && !isNaN(d.high()) &&
            typeof d.low() === 'number' && !isNaN(d.low())
        );

        if (!hasValidOHLC) {
            console.warn('BigTradeDeltaAbsorption: Invalid OHLC data for bar ' + d.index() + ' - skipping');
            this.validationState.consecutiveErrors++;
            return {};
        }

        const hasValidVolumeData = (
            typeof d.offerVolume() === 'number' && !isNaN(d.offerVolume()) &&
            typeof d.bidVolume() === 'number' && !isNaN(d.bidVolume())
        );

        if (!hasValidVolumeData) {
            console.warn('BigTradeDeltaAbsorption: Invalid volume data for bar ' + d.index() + ' - skipping');
            this.validationState.consecutiveErrors++;
            return {};
        }

        this.validationState.consecutiveErrors = 0;

        // ── SESSION FILTER (delta/volume section only) ──────────────────────
        // Uses the bar's true UTC timestamp, independent of the chart's
        // display timezone. Bubbles are intentionally NOT gated by this —
        // they run on every bar all day. Only the price-axis delta/volume
        // accumulation below is restricted to the selected session window.
        const barUtcMs = d.date ? d.date.getTime() : (typeof d.timestamp === 'function' ? d.timestamp() : null);
        const inSession = this.props.SessionFilter === 'none'
            || barUtcMs == null
            || isInSession(this.props.SessionFilter, barUtcMs);

        const volCircles = {
            tag: "Container", key: 'circs', global: false, children: [],
        };
        const bubbleTextContainer = {
            tag: 'Container', key: 'bubbleText', children: [],
        };
        const combinedBars = {
            tag: 'Container', key: 'combinedBars',
            origin: { cs: 'grid', h: 'right', v: 'top' },
            global: true, children: [],
            conditions: { scaleRangeY: { max: 3 } }
        };
        const combinedText = {
            tag: 'Container', key: 'combinedText',
            origin: { cs: 'grid', h: 'right', v: 'top' },
            global: true, children: [],
            conditions: { scaleRangeY: { max: 3, min: 2 / this.props.priceLevelsPerBar } }
        };
        const textContainer = {
            tag: 'Container', key: 'PADV_textcontainer',
            origin: { cs: 'grid', h: 'right', v: 'top' },
            global: true, children: [],
            conditions: { scaleRangeY: { min: 3 } }
        };
        const barsContainer = {
            tag: 'Container', key: 'PADV_barscontainer',
            global: true, origin: { cs: 'grid', h: 'right', v: 'top' },
            children: [], conditions: { scaleRangeY: { min: 3 } }
        };

        // ── BIG TRADE BUBBLES ─────────────────────────────────────────────────
        if (this.props.EnableBubbles) {
            const profiles      = d.profile();
            const combinedProfs = {};
            const modifiedSize  = this.contractInfo.tickSize * this.props.priceLevelsPerBar;
            let last, barInit;

            profiles
                .sort((a, b) => a.price - b.price)
                .forEach(({ price, vol, bidVol, askVol }) => {
                    if (!barInit) barInit = price;
                    if (last && last >= barInit + modifiedSize) barInit = price;
                    if (last && last <= barInit + modifiedSize) {
                        let item = combinedProfs[barInit.toFixed(7).toString()];
                        if (!item) {
                            item = { vol: 0, askVol: 0, bidVol: 0, price: barInit };
                            combinedProfs[barInit.toFixed(7).toString()] = item;
                        }
                        item.askVol += askVol;
                        item.bidVol += bidVol;
                        item.vol    += vol;
                    }
                    last = price;
                });

            Object.values(combinedProfs).forEach(({ bidVol, askVol, price }) => {
                const delta    = -(bidVol - askVol);
                const xOffset  = 0.02;
                const fontSize = 9;

                this.mdelta   = Math.abs(delta);
                this.maxDelta = Math.max(this.mdelta, this.maxDelta);

                const volThreshold = this.props.RthVolThreshold;
                const ctrPt = {
                    x: op(du(d.index()), '-', du(xOffset)),
                    y: du(price + modifiedSize / 2)
                };

                const minR   = 8;
                const maxR   = this.props.MaxBubbleSize;
                const maxI   = this.maxDelta + (this.maxDelta / 2.15);
                const cValue = delta;

                const radiusScale = Math.min(
                    ((Math.abs(cValue) - volThreshold) / (maxI - volThreshold)) * (maxR - minR) + minR,
                    maxR
                );

                if (Math.abs(cValue) > volThreshold) {
                    volCircles.children.push({
                        tag: "Shapes",
                        key: `bar${d.index()}${price}`,
                        primitives: [{ tag: 'Circle', radius: radiusScale, center: ctrPt }],
                        fillStyle: {
                            color: cValue > 0 ? this.props.positiveDeltaColor : this.props.negativeDeltaColor,
                            opacity: this.props.BubbleOpacity
                        }
                    });
                    bubbleTextContainer.children.push({
                        tag: 'Text',
                        key: `${d.index()}${price}`,
                        text: this.props.EnableBubbleLabels ? `${cValue}` : undefined,
                        point: ctrPt,
                        style: { fontSize, fill: '#ffffff' },
                        textAlignment: 'centerMiddle'
                    });
                }
            });
        }

        // ── PRICE AXIS DELTA & VOLUME ─────────────────────────────────────────
        // Only accumulates/draws while the bar is inside the selected session
        // window. Bars outside the window are skipped here entirely (no effect
        // on bubbles above, which always run).
        //
        // RestrictToCurrentDay resets the accumulator whenever the bar's day
        // (or session window, if a SessionFilter is active) changes, so the
        // profile only reflects the current/most-recent day rather than every
        // day ever loaded on the chart.
        if (this.props.EnableDeltaVolume && inSession) {
            if (this.props.RestrictToCurrentDay && barUtcMs != null) {
                const dayKey = dayKeyFor(this.props.SessionFilter, barUtcMs);
                if (dayKey !== this.currentDayKey) {
                    this.byPrice = {};
                    this.currentDayKey = dayKey;
                }
            }

            d.profile().forEach((profile) => {
                const { price, bidVol, askVol, vol } = profile;
                const priceKey = price.toFixed(4).toString();
                if (this.byPrice[priceKey]) {
                    this.byPrice[priceKey].askVol += askVol;
                    this.byPrice[priceKey].bidVol += bidVol;
                    this.byPrice[priceKey].vol    += vol;
                } else {
                    this.byPrice[priceKey] = { price, askVol, bidVol, vol };
                }
            });

            if (d.isLast()) {
                const keys = Object.keys(this.byPrice);
                if (keys.length > 0) {
                    const highPrice = keys.map(k => parseFloat(k)).reduce((a, b) => Math.max(a, b), 0);
                    const lowPrice  = keys.map(k => parseFloat(k)).reduce((a, b) => Math.min(a, b), Infinity);
                    const range     = highPrice - lowPrice;

                    const greatestDelta = keys
                        .map(k => this.byPrice[k])
                        .map(({ bidVol, askVol }) => Math.abs(bidVol - askVol))
                        .reduce((a, b) => Math.max(a, b), 0);
                    const greatestVol = keys
                        .map(k => this.byPrice[k])
                        .map(({ vol }) => vol)
                        .reduce((a, b) => Math.max(a, b), 0);

                    const numBars = range / this.contractInfo.tickSize;

                    if (this.props.priceLevelsPerBar > 0) {
                        const combinedByPrice = {};
                        const modSize = this.contractInfo.tickSize * this.props.priceLevelsPerBar;
                        let lastK, barInitK;

                        keys
                            .sort((a, b) => parseFloat(a) - parseFloat(b))
                            .forEach(k => {
                                let float = parseFloat(k);
                                if (!barInitK) barInitK = float;
                                if (lastK && lastK >= barInitK + modSize) barInitK = float;
                                if (lastK && lastK <= barInitK + modSize) {
                                    let item = combinedByPrice[barInitK.toFixed(4).toString()];
                                    if (!item) {
                                        item = { vol: 0, askVol: 0, bidVol: 0, price: barInitK };
                                        combinedByPrice[barInitK.toFixed(4).toString()] = item;
                                    }
                                    const src = this.byPrice[k];
                                    item.askVol += src.askVol;
                                    item.bidVol += src.bidVol;
                                    item.vol    += src.vol;
                                }
                                lastK = float;
                            });

                        const greatestCombinedDelta = Object.values(combinedByPrice)
                            .map(({ bidVol, askVol }) => Math.abs(bidVol - askVol))
                            .reduce((a, b) => Math.max(a, b), 0);
                        const greatestCombinedVol = Object.values(combinedByPrice)
                            .map(({ vol }) => vol)
                            .reduce((a, b) => Math.max(a, b), 0);

                        const combinedNumBars = range / modSize;
                        let lastPush, initPush;

                        Object.values(combinedByPrice).forEach(({ price, askVol, bidVol, vol }) => {
                            if (!initPush) initPush = price;
                            if (lastPush && lastPush > initPush + modSize) initPush = price;
                            if (lastPush && lastPush <= initPush + modSize) {
                                const delta      = -(bidVol - askVol);
                                const fontSize   = 9;
                                const textLength = Math.abs(delta).toString().length;
                                const barHeight  = du(range / combinedNumBars);

                                const deltaBarWidth = min(px(-2), px(-this.props.scaleFactorPx * Math.abs(delta / greatestCombinedDelta)));
                                const volBarWidth   = max(px(2),  px(this.props.volScaleFactorPx * (vol / greatestCombinedVol)));
                                const textPt = {
                                    x: op(px(-(fontSize) * (.667 * textLength) - this.props.barOffsetPx), '+', deltaBarWidth),
                                    y: op(du(price), '-', du(modSize / 2))
                                };

                                combinedBars.children.push({
                                    tag: 'Shapes', key: 'cbar_' + price,
                                    primitives: [{
                                        tag: 'Rectangle',
                                        position: { x: px(-(this.props.barOffsetPx)), y: op(du(price), '-', du(modSize)) },
                                        size: { height: barHeight, width: deltaBarWidth }
                                    }],
                                    fillStyle: { color: delta > 0 ? this.props.positiveColor : delta < 0 ? this.props.negativeColor : '#999' }
                                });
                                combinedText.children.push({
                                    tag: 'Text', key: 'ctxt_' + price,
                                    text: this.props.EnableDeltaLabels && Math.abs(delta) > this.props.TextLabelThreshold ? `${delta}` : undefined,
                                    point: textPt,
                                    style: { fontSize, fill: this.props.FontColor },
                                    textAlignment: 'rightMiddle'
                                });
                                if (this.props.EnableVolumeBars) {
                                    combinedBars.children.push({
                                        tag: 'Shapes', key: 'cvol_' + price,
                                        primitives: [{
                                            tag: 'Rectangle',
                                            position: { x: px(-(this.props.barOffsetPx)), y: op(du(price), '-', du(modSize)) },
                                            size: { height: barHeight, width: volBarWidth }
                                        }],
                                        fillStyle: { color: this.props.VolumeBarColor, opacity: this.props.VolumeBarOpacity }
                                    });
                                }
                            }
                            lastPush = price;
                        });
                    }

                    keys.map(k => this.byPrice[k]).forEach(({ price, askVol, bidVol, vol }) => {
                        const delta      = -(bidVol - askVol);
                        const fontSize   = 9;
                        const textLength = Math.abs(delta).toString().length;
                        const barHeight  = op(du(range / numBars), '-', px(2));

                        const deltaBarWidth = min(px(-2), px(-this.props.scaleFactorPx * Math.abs(delta / greatestDelta)));
                        const volBarWidth   = max(px(2),  px(this.props.volScaleFactorPx * (vol / greatestVol)));
                        const textPt = {
                            x: op(px(-(fontSize) * (.667 * textLength) - this.props.barOffsetPx), '+', deltaBarWidth),
                            y: du(price),
                        };

                        barsContainer.children.push({
                            tag: 'Shapes', key: 'bar_' + price,
                            primitives: [{
                                tag: 'Rectangle',
                                position: {
                                    x: px(-(this.props.barOffsetPx)),
                                    y: op(du(price), '-', du(this.contractInfo.tickSize / 2))
                                },
                                size: { height: barHeight, width: deltaBarWidth }
                            }],
                            fillStyle: { color: delta > 0 ? this.props.positiveColor : delta < 0 ? this.props.negativeColor : '#999' }
                        });
                        textContainer.children.push({
                            tag: 'Text', key: 'txt_' + price,
                            text: this.props.EnableDeltaLabels && Math.abs(delta) > this.props.TextLabelThreshold ? `${delta}` : undefined,
                            point: textPt,
                            style: { fontSize, fill: this.props.FontColor },
                            textAlignment: 'rightMiddle'
                        });
                        if (this.props.EnableVolumeBars) {
                            barsContainer.children.push({
                                tag: 'Shapes', key: 'vol_' + price,
                                primitives: [{
                                    tag: 'Rectangle',
                                    position: {
                                        x: px(-(this.props.barOffsetPx)),
                                        y: op(du(price), '-', du(this.contractInfo.tickSize / 2))
                                    },
                                    size: { height: barHeight, width: volBarWidth }
                                }],
                                fillStyle: { color: this.props.VolumeBarColor, opacity: this.props.VolumeBarOpacity }
                            });
                        }
                    });
                }
            }
        }

        const items = [
            volCircles,
            bubbleTextContainer,
            barsContainer,
            textContainer,
            combinedBars,
            combinedText,
        ];

        // ── ABSORBED BIG ORDERS → CISD ───────────────────────────────────────
        let cisdCandleColor = null;
        if (this.props.EnableAbsorbedCisd !== false) {
            const absorb = this.updateAbsorption(d);
            if (absorb) {
                items.push(absorb.container);
                cisdCandleColor = absorb.candleColor;
            }
        }

        // ── HTF CANDLES ──────────────────────────────────────────────────────
        if (this.props.EnableHtfCandles && barUtcMs != null) {
            this.storeHtfBar(d, barUtcMs);
            if (d.isLast()) items.push(this.drawHtfCandles(d));
        }

        const result = {
            graphics: { items },
        };
        if (cisdCandleColor) result.candlestick = { color: cisdCandleColor };
        return result;
    }

    // Adds the previous candle to the state once it has closed (when this bar
    // first appears), then judges this candle as it stands. If it makes a CISD
    // that absorbed big orders, it is coloured green (bullish) or red (bearish),
    // the absorbed orders around their average price get a box (below the CISD
    // level for longs, above for shorts) and each absorbed bubble an ✕.
    // On the forming candle this updates with price; it is final once it closes.
    updateAbsorption(d) {
        const idx  = d.index();
        const tick = this.contractInfo.tickSize;
        const modSize = tick * this.props.priceLevelsPerBar;

        // Settings added after the indicator was put on a chart can arrive
        // empty; fall back to the defaults instead of silently matching nothing.
        const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);
        const maxBars   = num(this.props.AbsorbMaxBars, 20);
        const tolerance = num(this.props.AbsorbToleranceTicks, 0) * tick;
        const threshold = num(this.props.RthVolThreshold, 155);

        if (idx !== this.absIndex) {
            if (this.absLastBar) stepAbsorption(this.absState, this.absLastBar, threshold, modSize, tolerance, maxBars);
            this.absIndex = idx;
        }
        this.absLastBar = {
            i: idx, o: d.open(), c: d.close(),
            groups: combineLevels(d.profile(), modSize),
        };
        const events = stepAbsorption(cloneAbsState(this.absState), this.absLastBar, threshold, modSize, tolerance, maxBars);

        if (events.length === 0) return null;
        const container = { tag: 'Container', key: `absorb_${idx}`, children: [] };
        events.forEach(ev => {
            const color = ABSORB_COLORS[ev.side];
            const zone  = absorbedZone(ev, modSize);
            container.children.push({
                tag: 'Shapes', key: `absorb_zone_${ev.side}_${ev.bar}`,
                primitives: [{
                    tag: 'Rectangle',
                    position: { x: du(zone.firstBar - 0.5), y: du(zone.low) },
                    size: { height: du(zone.high - zone.low), width: du(ev.bar - zone.firstBar + 1) }
                }],
                fillStyle: { color, opacity: 25 }
            });
            ev.orders.forEach(b => {
                container.children.push({
                    tag: 'Text', key: `absorb_x_${b.bar}_${b.low}`,
                    text: '✕',
                    point: { x: op(du(b.bar), '-', du(0.02)), y: du(b.low + modSize / 2) },
                    style: { fontSize: 16, fill: color },
                    textAlignment: 'centerMiddle'
                });
            });
        });
        return { container, candleColor: CISD_CANDLE_COLORS[events[events.length - 1].side] };
    }

    // Keeps this bar (OHLC + volume profile) while it belongs to the previous or
    // current hour. Re-runs of the live bar overwrite its entry, so nothing is
    // counted twice.
    storeHtfBar(d, barUtcMs) {
        const hour = Math.floor(barUtcMs / HOUR_MS);
        if (this.htfCurHour === null || hour > this.htfCurHour) {
            if (this.htfCurHour !== null) this.htfPrevHour = this.htfCurHour;
            this.htfCurHour = hour;
            const keepFrom = (this.htfPrevHour !== null ? this.htfPrevHour : hour) * HOUR_MS;
            Object.keys(this.htfBars).forEach(k => {
                if (this.htfBars[k].t < keepFrom) delete this.htfBars[k];
            });
        }
        this.htfBars[d.index()] = {
            t: barUtcMs,
            o: d.open(), h: d.high(), l: d.low(), c: d.close(),
            levels: d.profile().map(({ price, vol, bidVol, askVol }) => ({ price, vol, bidVol, askVol })),
        };
    }

    // Draws the previous + current 30m and 1H candles to the right of the last
    // bar, each with its big trade bubbles.
    drawHtfCandles(d) {
        const container = { tag: 'Container', key: 'htfCandles', global: true, children: [] };
        const bars = Object.values(this.htfBars);
        if (bars.length === 0) return container;

        const tick         = this.contractInfo.tickSize;
        const modifiedSize = tick * this.props.priceLevelsPerBar;
        const width        = this.props.HtfCandleWidth;
        const volThreshold = this.props.HtfVolThreshold;
        let x = d.index() + this.props.HtfOffsetBars;

        HTF_TIMEFRAMES.forEach(tf => {
            // The last two candles of this timeframe that have bars (skips session gaps).
            const buckets = [...new Set(bars.map(b => Math.floor(b.t / tf.ms)))]
                .sort((a, b) => a - b)
                .slice(-2);
            const candles = buckets.map(bucket => ({
                bucket,
                candle: buildHtfCandle(bars.filter(b => Math.floor(b.t / tf.ms) === bucket)),
            }));
            candles.forEach(({ candle }) => {
                candle.groups = combineLevels(candle.levels, modifiedSize);
                candle.groups.forEach(({ bidVol, askVol }) => {
                    this.htfMaxDelta[tf.key] = Math.max(this.htfMaxDelta[tf.key] || 0, Math.abs(bidVol - askVol));
                });
            });

            const groupX = x;
            let groupTop = -Infinity;
            candles.forEach(({ bucket, candle }) => {
                const { o, h, l, c } = candle;
                const cx = x + width / 2;
                const colors = c >= o ? HTF_COLORS.bull : HTF_COLORS.bear;

                // Wick, then body with its border
                container.children.push({
                    tag: 'Shapes', key: `htf_${tf.key}_${bucket}_wick`,
                    primitives: [{
                        tag: 'Rectangle',
                        position: { x: op(du(cx), '-', px(1)), y: du(l) },
                        size: { height: du(h - l), width: px(2) }
                    }],
                    fillStyle: { color: colors.wick }
                });
                container.children.push({
                    tag: 'Shapes', key: `htf_${tf.key}_${bucket}_body`,
                    primitives: [{
                        tag: 'Rectangle',
                        position: { x: du(x), y: du(Math.min(o, c)) },
                        size: { height: du(Math.max(Math.abs(c - o), tick / 4)), width: du(width) }
                    }],
                    fillStyle: { color: colors.body },
                    lineStyle: { lineWidth: 1, color: colors.border }
                });

                // Bubbles: same threshold, sizing and colours as the chart bubbles,
                // scaled against this timeframe's largest delta.
                if (this.props.EnableBubbles) {
                    const minR = 8;
                    const maxR = this.props.MaxBubbleSize;
                    const maxD = this.htfMaxDelta[tf.key] || 0;
                    const maxI = maxD + (maxD / 2.15);
                    candle.groups.forEach(({ bidVol, askVol, price }) => {
                        const cValue = -(bidVol - askVol);
                        if (Math.abs(cValue) <= volThreshold) return;
                        const radiusScale = Math.min(
                            ((Math.abs(cValue) - volThreshold) / (maxI - volThreshold)) * (maxR - minR) + minR,
                            maxR
                        );
                        const ctrPt = { x: du(cx), y: du(price + modifiedSize / 2) };
                        container.children.push({
                            tag: 'Shapes',
                            key: `htf_${tf.key}_${bucket}_b${price}`,
                            primitives: [{ tag: 'Circle', radius: radiusScale, center: ctrPt }],
                            fillStyle: {
                                color: cValue > 0 ? this.props.positiveDeltaColor : this.props.negativeDeltaColor,
                                opacity: this.props.BubbleOpacity
                            }
                        });
                        container.children.push({
                            tag: 'Text',
                            key: `htf_${tf.key}_${bucket}_t${price}`,
                            text: this.props.EnableBubbleLabels ? `${cValue}` : undefined,
                            point: ctrPt,
                            style: { fontSize: 9, fill: '#ffffff' },
                            textAlignment: 'centerMiddle'
                        });
                    });
                }

                groupTop = Math.max(groupTop, h);
                x += width + 1;
            });

            // Timeframe name above its two candles
            if (candles.length > 0) {
                container.children.push({
                    tag: 'Text', key: `htf_${tf.key}_label`,
                    text: tf.label,
                    point: { x: du(groupX + (x - 1 - groupX) / 2), y: du(groupTop + modifiedSize * 2) },
                    style: { fontSize: 12, fill: this.props.FontColor },
                    textAlignment: 'centerMiddle'
                });
            }
            x += 3; // gap between the 30m and 1H groups
        });

        return container;
    }
}

// Base line style, extended below with dark-mode colors for the divergence
// dots. The divergence dots and delta numbers were removed; the two plots stay
// declared (they never receive values, so nothing is drawn) to keep the
// indicator's plot setup unchanged in Tradovate.
const baseScheme = predef.styles.solidLine("#000") || {};
const mergedSchemeStyles = Object.assign({}, baseScheme, {
    dark: Object.assign({}, baseScheme.dark, {
        bullishDivergence: { color: "#52D4FC" },
        bearishDivergence: { color: "#FD7070" }
    })
});

module.exports = {
    inputType: 'bars',
    name: "abhishek_customOF",
    description: "abhishek_customOF",
    calculator: BigTradeDeltaAbsorption,
    params: {
        // ── SESSION FILTER ────────────────────────────────────────────────────
        divider0:           predef.paramSpecs.enum({ s: '━━━━━━━━━━  SESSION FILTER  ━━━━━━━━━━' }, 's'),
        SessionFilter:      predef.paramSpecs.enum({
            none:                 'All sessions (no filter)',
            new_york_rth:         'New York RTH (9:30-16:00 ET)',
            new_york_overnight:   'New York Overnight (18:00-09:30 ET)',
            new_york_globex:      'New York Full/Globex (18:00-17:00 ET)',
            london:               'London (08:00-16:30 UK)',
            frankfurt:            'Frankfurt (09:00-17:30 CET)',
            tokyo:                'Tokyo (09:00-15:00 JST)',
            sydney:                'Sydney (10:00-16:00 AET)',
        }, 'none'),

        // ── BUBBLES ───────────────────────────────────────────────────────────
        divider1:           predef.paramSpecs.enum({ s: '━━━━━━━━━━  BIG TRADE BUBBLES  ━━━━━━━━━━' }, 's'),
        EnableBubbles:      predef.paramSpecs.bool(true),
        positiveDeltaColor: predef.paramSpecs.color('#00CCB4'),
        negativeDeltaColor: predef.paramSpecs.color('#9900CC'),
        RthVolThreshold:    predef.paramSpecs.number(155, 1, 0),
        BubbleOpacity:      predef.paramSpecs.number(40,  1, 0),
        MaxBubbleSize:      predef.paramSpecs.number(50, 1, 0),
        EnableBubbleLabels: predef.paramSpecs.bool(true),
        priceLevelsPerBar:  predef.paramSpecs.number(6,   1, 1),

        // ── ABSORBED BIG ORDERS → CISD ───────────────────────────────────────
        dividerAbs:         predef.paramSpecs.enum({ s: '━━━━━━━━━━  ABSORBED BIG ORDERS → CISD  ━━━━━━━━━━' }, 's'),
        EnableAbsorbedCisd: predef.paramSpecs.bool(true),
        AbsorbMaxBars:      predef.paramSpecs.number(20, 1, 1),
        AbsorbToleranceTicks: predef.paramSpecs.number(0, 1, 0),

        // ── HTF CANDLES ───────────────────────────────────────────────────────
        dividerHtf:         predef.paramSpecs.enum({ s: '━━━━━━━━━━  HTF CANDLES (30m / 1H)  ━━━━━━━━━━' }, 's'),
        EnableHtfCandles:   predef.paramSpecs.bool(true),
        HtfOffsetBars:      predef.paramSpecs.number(5, 1, 1),
        HtfCandleWidth:     predef.paramSpecs.number(3, 1, 1),
        HtfVolThreshold:    predef.paramSpecs.number(155, 1, 0),

        // ── PRICE AXIS DELTA & VOLUME ─────────────────────────────────────────
        divider2:           predef.paramSpecs.enum({ s: '━━━━━━━━━━  PRICE AXIS DELTA & VOLUME  ━━━━━━━━━━' }, 's'),
        EnableDeltaVolume:  predef.paramSpecs.bool(true),
        RestrictToCurrentDay: predef.paramSpecs.bool(true),
        positiveColor:      predef.paramSpecs.color('#00CCB4'),
        negativeColor:      predef.paramSpecs.color('#9900CC'),
        scaleFactorPx:      predef.paramSpecs.number(60, 10, 10),
        volScaleFactorPx:   predef.paramSpecs.number(60, 10, 10),
        barOffsetPx:        predef.paramSpecs.number(60,  1,  0),
        EnableDeltaLabels:  predef.paramSpecs.bool(true),
        TextLabelThreshold: predef.paramSpecs.number(100, 1,  0),
        FontColor:          predef.paramSpecs.color('#FFFFFF'),

        // ── VOLUME BARS ───────────────────────────────────────────────────────
        divider3:           predef.paramSpecs.enum({ s: '━━━━━━━━━━  VOLUME BARS  ━━━━━━━━━━' }, 's'),
        EnableVolumeBars:   predef.paramSpecs.bool(false),
        VolumeBarColor:     predef.paramSpecs.color('#FFFFFF'),
        VolumeBarOpacity:   predef.paramSpecs.number(40, 1, 0),
    },
    tags: ["RewiredSanjay"],
    schemeStyles: mergedSchemeStyles,
    requirements: { volumeProfiles: true },
    plotter: [
        predef.plotters.dots('bearishDivergence'),
        predef.plotters.dots('bullishDivergence')
    ],
    plots: {
        bullishDivergence: { title: 'Bullish Absorption Icon', displayOnly: true },
        bearishDivergence: { title: 'Bearish Absorption Icon', displayOnly: true }
    },
};