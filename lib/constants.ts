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
// Each in-flight worker holds 1 Prisma pool slot at a time (sequential
// awaits inside the worker), so 4 workers per provider = ~4 connections
// peak per provider per process. Across 4 providers running concurrently
// in pollAll(), the poller process peaks ~16 of its connection_limit=20
// pool — leaves 4-slot headroom for ad-hoc queries (sync-plants,
// fetchAlarms, vendor_alarms upserts) that run alongside string-data.
// Shared RDS bijli-bachao-db has max_connections=181 (co-tenanted with Wattey).
export const POLLER_DEVICE_CONCURRENCY = 4
