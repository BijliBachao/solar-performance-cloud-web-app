import Link from 'next/link'
import { Sun, BarChart3, GitCompareArrows, Bell, FileText } from 'lucide-react'

const features = [
  {
    icon: BarChart3,
    title: 'Real-time Monitoring',
    description: 'Track PV string performance with live data from Huawei SmartPVMS.',
  },
  {
    icon: GitCompareArrows,
    title: 'String Comparison',
    description: 'Compare string currents side-by-side to identify underperformers.',
  },
  {
    icon: Bell,
    title: 'Alert System',
    description: 'Automatic alerts when strings deviate from expected performance.',
  },
  {
    icon: FileText,
    title: 'Monthly Reports',
    description: 'Health score tracking and monthly performance reports per string.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Sun className="h-7 w-7 text-primary-500" />
          <span className="font-bold text-gray-900">Solar Performance Cloud</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Sign Up
          </Link>
        </div>
      </header>

      <main>
        <section className="px-6 py-24 text-center max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 animate-fade-in">
            Solar Performance Cloud
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Monitor your PV strings in real-time
          </p>
          <p className="text-sm text-gray-400 mb-8">by Bijli Bachao</p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/sign-in"
              className="px-6 py-3 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-orange-200"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="px-6 py-3 text-sm font-medium text-primary-700 bg-white border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
            >
              Create Account
            </Link>
          </div>
        </section>

        <section className="px-6 py-16 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="rounded-lg bg-primary-50 p-3 w-fit mb-4">
                  <feature.icon className="h-6 w-6 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-6 py-8 text-center border-t border-gray-200">
        <p className="text-sm text-gray-500">Bijli Bachao</p>
      </footer>
    </div>
  )
}
