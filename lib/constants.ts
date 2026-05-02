export const PROVIDERS = { HUAWEI: 'huawei', SOLIS: 'solis', GROWATT: 'growatt', SUNGROW: 'sungrow' } as const
export type Provider = typeof PROVIDERS[keyof typeof PROVIDERS]

export const DEVICE_TYPE_IDS = {
  HUAWEI_STRING_INVERTER: 1,
  HUAWEI_RESIDENTIAL_INVERTER: 38,
  SOLIS_INVERTER: 100,
  GROWATT_MAX_INVERTER: 200,
  GROWATT_SPHS_INVERTER: 201,
  SUNGROW_INVERTER: 300,
} as const

export const INVERTER_DEVICE_TYPE_IDS = [1, 38, 100, 200, 201, 300]

// How many devices a single provider's poller may process concurrently.
// Bounded by the shared RDS connection budget (connection_limit=20 per app
// on bijli-bachao-db, co-tenanted with Wattey). With ~3-5 awaited DB ops
// per device, 4 in-flight devices peak at ~16-20 connections — leaves
// headroom for the other 3 providers polling at the same time.
export const POLLER_DEVICE_CONCURRENCY = 4
