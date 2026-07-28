import { createDeliveryStore, type DeliveryStore } from './deliveryStore.js'
import { createInboxChannel, type DeliveryChannel } from './channels.js'
import { createRulesRepository, type RulesRepository } from './rulesRepository.js'

/**
 * Process-wide wiring. Constructed once so the delivery store and the rules
 * file are shared across requests rather than rebuilt per call.
 */
export interface AppContext {
  rules: RulesRepository
  store: DeliveryStore
  channels: DeliveryChannel[]
}

/** `dataDir` is injectable so tests never write to the committed data folder. */
export function createContext(dataDir?: string): AppContext {
  const store = createDeliveryStore()
  return {
    rules: createRulesRepository(dataDir),
    store,
    channels: [createInboxChannel(store)],
  }
}
