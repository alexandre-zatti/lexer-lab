import { useEffect, useRef } from 'react'

/**
 * Fires `onFire(value)` after a debounce delay that adapts to the
 * most recent observed backend latency:
 *
 *  - last fetch < 500 ms   → 200 ms debounce (feels snappy on fast input)
 *  - 500 ms ≤ last ≤ 1500  → 400 ms debounce (compromise)
 *  - last fetch > 1500 ms  → 800 ms debounce (don't self-DoS the worker pool)
 *
 * Plan Concern v2 #6: "A/B with one pilot student before class." The
 * 200/400/800 thresholds are a starting point — easy to re-tune once
 * we have classroom data.
 *
 * `onFire` is read via a ref so parent re-renders don't reset the timer.
 */
export function useAdaptiveDebounce<T>(
  value: T,
  lastLatencyMs: number,
  onFire: (value: T) => void,
): void {
  // Both `onFire` and `lastLatencyMs` live in refs so the effect only
  // re-runs on `value` change. Including `lastLatencyMs` in deps would
  // self-trigger: fetch completes → latency updates → effect re-fires
  // → new timer → another fetch, ad infinitum (caught in Evening 5
  // headless browser test, 17+ POSTs for a single input).
  const cbRef = useRef(onFire)
  const latencyRef = useRef(lastLatencyMs)
  useEffect(() => {
    cbRef.current = onFire
  }, [onFire])
  useEffect(() => {
    latencyRef.current = lastLatencyMs
  }, [lastLatencyMs])

  useEffect(() => {
    const ms = latencyRef.current
    const delay = ms > 0 && ms < 500 ? 200 : ms > 1500 ? 800 : 400
    const t = window.setTimeout(() => cbRef.current(value), delay)
    return () => window.clearTimeout(t)
  }, [value])
}
