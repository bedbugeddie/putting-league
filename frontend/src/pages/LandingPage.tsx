import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <div className="w-full rounded-2xl bg-brand-800 dark:bg-forest-surface flex flex-col items-center py-16 px-6 text-center shadow-lg">
        <img
          src="/mvpl.png"
          alt="Merrimack Valley Putting League"
          className="w-48 sm:w-64 mb-8"
        />
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
          Merrimack Valley Putting League
        </h1>
        <p className="text-brand-200 text-lg sm:text-xl mb-10 max-w-md">
          Track your scores. Follow the standings. Compete with friends.
        </p>
        <div className="flex items-center gap-4">
          <Link
            to="/login?signup=1"
            className="px-8 py-3 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl text-lg transition-colors shadow"
          >
            Sign Up
          </Link>
          <Link
            to="/login"
            className="px-8 py-3 bg-brand-800 hover:bg-brand-700 text-white font-semibold rounded-xl text-lg transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
