import type { Config } from 'jest'
import { createDefaultEsmPreset } from 'ts-jest'

const config: Config = {
  ...createDefaultEsmPreset(),
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}

export default config
