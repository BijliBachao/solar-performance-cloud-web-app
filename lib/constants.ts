export const PROVIDERS = { HUAWEI: 'huawei', SOLIS: 'solis', GROWATT: 'growatt', SUNGROW: 'sungrow', CSI: 'csi' } as const
export type Provider = typeof PROVIDERS[keyof typeof PROVIDERS]

/** Human-readable inverter-brand labels for the provider column chip. */
export const PROVIDER_LABELS: Record<string, string> = {
  huawei: 'Huawei',
  solis: 'Solis',
  growatt: 'Growatt',
  sungrow: 'Sungrow',
  csi: 'Canadian Solar',
}

/** Display label for a provider code; falls back to a capitalized code. */
export function providerLabel(provider?: string | null): string {
  if (!provider) return 'Unknown'
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1)
}

export const DEVICE_TYPE_IDS = {
  HUAWEI_STRING_INVERTER: 1,
  HUAWEI_RESIDENTIAL_INVERTER: 38,
  SOLIS_INVERTER: 100,
  GROWATT_MAX_INVERTER: 200,
  GROWATT_SPHS_INVERTER: 201,
  SUNGROW_INVERTER: 300,
  CSI_INVERTER: 400,
} as const

export const INVERTER_DEVICE_TYPE_IDS = [1, 38, 100, 200, 201, 300, 400]

// How many devices a single provider's poller may process concurrently.
// Each in-flight worker holds 1 Prisma pool slot at a time (sequential
// awaits inside the worker), so 3 workers per provider = ~3 connections
// peak per provider per process. With 5 providers (Huawei + Solis +
// Growatt + Sungrow + Canadian Solar) running concurrently in pollAll(),
// peak is ~15 of the connection_limit=20 pool — leaves ~5-slot headroom
// for ad-hoc queries (sync-plants, fetchAlarms, vendor_alarms upserts).
// Was 4 when only 4 providers existed; dropped to 3 ahead of CSI onboard.
// Shared RDS bijli-bachao-db: t4g.small since 2026-04-30 -> max_connections=145
// (co-tenanted with Wattey; smartswitch arriving as 3rd tenant). NOTE: the
// real scaling lever is round-trips per device (batched generateAlerts,
// future writeDeviceSnapshot pipeline), NOT raising this concurrency.
export const POLLER_DEVICE_CONCURRENCY = 3
