import type { ReactNode } from 'react'
import SensingCheckIn from '../../features/sensing/SensingCheckIn'
import Journal from '../../features/journal/Journal'
import Medication from '../../features/medication/Medication'
import Settings from '../../features/settings/Settings'

export interface Route {
  path: string
  label: string
  component: () => ReactNode
}

export const routes: Route[] = [
  { path: '/', label: 'Dashboard', component: () => <div>Dashboard — today&apos;s logged entries.</div> },
  { path: '/journal', label: 'Journal', component: () => <Journal /> },
  { path: '/medication', label: 'Medication', component: () => <Medication /> },
  { path: '/reports', label: 'Reports', component: () => <div>Reports — summaries and CSV export.</div> },
  { path: '/settings', label: 'Settings', component: () => <Settings /> },
  { path: '/sensing', label: 'Check-in', component: () => <SensingCheckIn /> },
]