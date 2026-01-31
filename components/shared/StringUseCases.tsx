'use client'

import { useState } from 'react'
import {
  Droplets, Bird, TreePine, XCircle, Cable, Unplug,
  TrendingDown, Snowflake, ChevronDown, ChevronUp, Lightbulb,
} from 'lucide-react'

const USE_CASES = [
  {
    icon: Droplets,
    title: 'Dirty / Dusty Panels',
    pattern: 'Current drops 10–30% on affected string',
    detection: 'Compare string current trend — if one drops while others stay stable',
    action: 'Schedule panel cleaning',
    color: 'text-yellow-600 bg-yellow-50',
  },
  {
    icon: Bird,
    title: 'Bird Droppings',
    pattern: 'One string significantly lower than others',
    detection: 'Gap % exceeds 25% on a single string',
    action: 'Inspect and clean affected panels',
    color: 'text-orange-600 bg-orange-50',
  },
  {
    icon: TreePine,
    title: 'Tree Shadow',
    pattern: 'Current drops at specific times of day',
    detection: 'Compare string performance by hour — if one drops at 3 PM daily',
    action: 'Trim trees or adjust panel layout',
    color: 'text-green-600 bg-green-50',
  },
  {
    icon: XCircle,
    title: 'Faulty Panel',
    pattern: 'String current consistently 30–50% lower',
    detection: 'Gap stays above 30% across multiple polls',
    action: 'Replace or repair the damaged panel',
    color: 'text-red-600 bg-red-50',
  },
  {
    icon: Cable,
    title: 'Loose Cable',
    pattern: 'String current drops suddenly to near-zero',
    detection: 'Sudden current drop alert from poller',
    action: 'Emergency inspection — check cables and connections',
    color: 'text-red-600 bg-red-50',
  },
  {
    icon: Unplug,
    title: 'Broken / Disconnected',
    pattern: 'String shows 0V and 0A',
    detection: 'String disappears from measurements',
    action: 'Immediate inspection — reconnect or replace',
    color: 'text-gray-600 bg-gray-50',
  },
  {
    icon: TrendingDown,
    title: 'Panel Degradation',
    pattern: 'Gradual decline over months compared to others',
    detection: 'Monthly comparison — one string degrades 15% while others only 2%',
    action: 'Inspect for micro-cracks, water ingress, or connector corrosion',
    color: 'text-purple-600 bg-purple-50',
  },
  {
    icon: Snowflake,
    title: 'Micro-Cracks',
    pattern: 'String underperforms in specific weather conditions',
    detection: 'Inconsistent performance compared to other strings',
    action: 'Thermal imaging inspection recommended',
    color: 'text-blue-600 bg-blue-50',
  },
]

export function StringUseCases() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-gray-400" /> What String Data Reveals
        </h3>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />
        }
      </button>
      {expanded && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {USE_CASES.map((uc) => {
            const Icon = uc.icon
            return (
              <div key={uc.title} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center ${uc.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-900">{uc.title}</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <span className="text-gray-400">Pattern: </span>
                    <span className="text-gray-600">{uc.pattern}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Detection: </span>
                    <span className="text-gray-600">{uc.detection}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Action: </span>
                    <span className="text-gray-700 font-medium">{uc.action}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
