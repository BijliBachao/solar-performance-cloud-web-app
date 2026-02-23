export const PROVIDERS = { HUAWEI: 'huawei', SOLIS: 'solis' } as const
export type Provider = typeof PROVIDERS[keyof typeof PROVIDERS]

export const DEVICE_TYPE_IDS = {
  HUAWEI_STRING_INVERTER: 1,
  HUAWEI_RESIDENTIAL_INVERTER: 38,
  SOLIS_INVERTER: 100,
} as const

export const INVERTER_DEVICE_TYPE_IDS = [1, 38, 100]
