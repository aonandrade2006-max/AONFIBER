import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  loading: boolean
  error: string | null
  data: T | null
  reload: () => void
}

type AsyncSnapshot<T> = {
  loading: boolean
  error: string | null
  data: T | null
}

function toMessage(caught: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (caught instanceof Error) return caught.message || fallback
  if (typeof caught === 'string' && caught.trim()) return caught
  if (caught && typeof caught === 'object' && 'message' in caught) {
    const message = (caught as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

/**
 * Runs an async loader and keeps its result in component state.
 * `deps` behaves like a normal React dependency list, and `reload()` refetches.
 */
export function useAsync<T>(run: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [snapshot, setSnapshot] = useState<AsyncSnapshot<T>>({
    loading: true,
    error: null,
    data: null,
  })
  const [nonce, setNonce] = useState(0)
  const runRef = useRef(run)
  runRef.current = run

  useEffect(() => {
    let cancelled = false
    setSnapshot((previous) => ({ ...previous, loading: true, error: null }))
    runRef
      .current()
      .then((data) => {
        if (cancelled) return
        setSnapshot({ loading: false, error: null, data })
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setSnapshot({ loading: false, error: toMessage(caught), data: null })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return { loading: snapshot.loading, error: snapshot.error, data: snapshot.data, reload }
}

export interface ActionOptions<T> {
  success?: string
  error?: string
  onSuccess?: (payload: T) => void
  onError?: (message: string) => void
}

export interface ActionState {
  busy: boolean
  error: string | null
  success: string | null
  setError: (message: string | null) => void
  run: <T>(task: () => Promise<T>, options?: ActionOptions<T>) => Promise<boolean>
}

/** Tracks the state of a user-triggered submit: busy, error message and success message. */
export function useAction(): ActionState {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const run = useCallback(
    async <T,>(task: () => Promise<T>, options?: ActionOptions<T>): Promise<boolean> => {
      setBusy(true)
      setError(null)
      setSuccess(null)
      try {
        const payload = await task()
        options?.onSuccess?.(payload)
        setSuccess(options?.success ?? null)
        return true
      } catch (caught) {
        const message = toMessage(caught, options?.error ?? 'Something went wrong. Please try again.')
        setError(message)
        options?.onError?.(message)
        return false
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  return { busy, error, success, setError, run }
}
