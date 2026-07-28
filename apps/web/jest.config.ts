import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          module: 'commonjs',
          moduleResolution: 'node',
          types: ['jest', 'node', '@testing-library/jest-dom'],
        },
      },
    ],
  },
  moduleNameMapper: {
    '\\.css$': 'identity-obj-proxy',
    // The web suite runs as CommonJS, but @assembled/types only publishes an
    // ESM export condition. Resolve it to source and let ts-jest transpile it.
    '^@assembled/types$': '<rootDir>/../../packages/types/src/index.ts',
    // NodeNext source uses explicit .js specifiers that CJS cannot resolve.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}

export default config
