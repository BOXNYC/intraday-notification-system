import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'

// jsdom omits these Web APIs; react-router requires them at import time.
Object.assign(globalThis, {
  TextEncoder: globalThis.TextEncoder ?? TextEncoder,
  TextDecoder: globalThis.TextDecoder ?? TextDecoder,
})
