import type {
  AuditRecord,
  BusinessUnit,
  Dimension,
  Grid,
  Opportunity,
  Period,
} from '../types'

let currentUser = localStorage.getItem('fp.user') || 'demo.user'

export function getUser() {
  return currentUser
}

export function setUser(user: string) {
  currentUser = user
  localStorage.setItem('fp.user', user)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User': currentUser,
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status}: ${body}`)
  }
  return res.json()
}

export const api = {
  businessUnits: () => request<BusinessUnit[]>('/api/business-units'),
  periods: () => request<Period[]>('/api/periods'),
  dimensions: () => request<Dimension[]>('/api/dimensions'),

  grid: (configId: number, periods: string[], asOf?: string) => {
    const qs = new URLSearchParams({ config_id: String(configId) })
    periods.forEach((p) => qs.append('periods', p))
    if (asOf) qs.set('as_of', asOf)
    return request<Grid>(`/api/forecast/grid?${qs}`)
  },

  sliceOpportunities: (configId: number, periodCode: string, sliceValues: Record<string, string>) =>
    request<Opportunity[]>(`/api/forecast/configs/${configId}/slice-opportunities`, {
      method: 'POST',
      body: JSON.stringify({ period_code: periodCode, slice_values: sliceValues }),
    }),

  saveEntry: (
    configId: number,
    payload: {
      period_code: string
      slice_values: Record<string, string>
      adjustment?: number | null
      total_forecast?: number | null
      comment?: string | null
      set_fields: string[]
    },
  ) =>
    request(`/api/forecast/configs/${configId}/entries`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  audit: (configId: number, params?: { period_code?: string; slice_key?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>)
    return request<AuditRecord[]>(`/api/forecast/configs/${configId}/audit?${qs}`)
  },

  createBusinessUnit: (payload: { code: string; name: string; description?: string }) =>
    request<BusinessUnit>('/api/business-units', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createConfig: (buId: number, payload: unknown) =>
    request(`/api/business-units/${buId}/configs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
