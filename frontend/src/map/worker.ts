// MapLibre 6 locates its web worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`
// at runtime, which neither the Vite dev pre-bundler nor the production bundle
// can serve. Registering a Vite-managed worker URL makes the worker a proper
// bundled asset in both modes (still same-origin, still offline).
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)
