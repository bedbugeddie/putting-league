import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import toast from 'react-hot-toast'
import { useAuth, authStore } from '../store/auth'
import { api } from '../api/client'

const INFO_MD = `
## 📅 When
Every Tuesday Starting Nov 4th through March 2026

---

## ⏰ Check-In & Start Time
**Check-In:** 5:15 PM (but for Nov 4 as early as 4:30 PM for BBQ fun!) | **Putting Starts:** 5:45 PM sharp

Please plan extra travel time — highway construction and rush-hour traffic have been rough lately!

---

## 🎯 What to Bring
- 3 Putters
- Cash (exact change appreciated!)
- Your best putting game!

---

## 🏆 Scoring
- 1 point for each made putt
- Bonus point if you make all three (4 total!)

---

## 📍 Location
**Cricket Bunting Club**
449 Boylston Street, Lowell, MA

👉 Enter through the side wooden stairs to the 2nd floor and check in with Dee at the registration table.

🅿️ Park along the softball field (all the way around, including the far side of the dirt road). Use the left/side entrance to head up the wooden stairs.

---

## 💰 League Fees (Cash Only)
ATM available near the bar downstairs. We may switch to PayPal soon—stay tuned!

- **D Pool** (Ages 55+ Amateur Division): $8
- **C Pool** (Women's Division): $8
- **B Pool** (Men's Beginner): $8 — If your PDGA rating is above 900, please register in A Pool.
- **A Pool** (Men's Intermediate+): $13 — great for those ready for friendly competition and a chance at extra cash! 💵

Lower entry for D, C & B Pools helps grow the sport for newer players — thank you for supporting that!

---

## 🍻 Bar & Venue Support
Everyone is required to support the bar each week. If not, the admission fee will be $20 per person. This helps us keep league fees among the lowest in Massachusetts ($8–$13 vs. $20+ elsewhere). Thank you for helping make that possible! 🙌

The bar is cash only and located on the lower level. They offer beer, wine, liquor, soda, and energy drinks. Please no outside beverages in the building.

---

## 🎟 Weekly 50/50 Raffle *(Supports Throw Pink)*
**50%** → Throw Pink 💖 | **50%** → Winner 💵

2nd place wins a prize 🎁 · Disc donations welcome!

**Tickets:** 1 for $1 | 6 for $5 | 15 for $10 — Winners drawn at halftime.

---

## 🎀 About Throw Pink
Non-profit encouraging women & girls to get active, build community, and enjoy disc golf 🥏. Raises funds to support breast cancer patients & families with treatment-related & essential living expenses.

---

## 📧 Questions?
Email [MVputtingleague@gmail.com](mailto:MVputtingleague@gmail.com) — add this email to your contacts so you don't miss weekly sign-up links.
`.trim()

export default function LeagueInfoPage() {
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)

  const needsAck = isAuthenticated && !user?.hasAcknowledgedInfo

  async function handleAcknowledge() {
    if (!checked || saving) return
    setSaving(true)
    try {
      const { token, user: fresh } = await api.post<{ token: string; user: any }>(
        '/auth/acknowledge-info', {}
      )
      authStore.setAuth(token, fresh)
      // Navigate to the normal post-login destination
      const dest = fresh.player?.divisionId ? '/' : '/choose-division'
      navigate(dest, { replace: true })
    } catch (err: any) {
      toast.error(err.message ?? 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          League Information
        </h1>
      </div>

      <div className="bg-white dark:bg-forest-surface rounded-2xl border border-gray-200 dark:border-forest-border p-6 sm:p-8">
        <div className="
          prose prose-sm sm:prose-base dark:prose-invert max-w-none
          prose-headings:font-bold
          prose-headings:text-gray-900 dark:prose-headings:text-white
          prose-p:text-gray-700 dark:prose-p:text-gray-200 prose-p:leading-relaxed
          prose-strong:text-gray-900 dark:prose-strong:text-white
          prose-a:text-brand-600 dark:prose-a:text-brand-400
          prose-li:text-gray-700 dark:prose-li:text-gray-200
          prose-hr:border-gray-200 dark:prose-hr:border-forest-border
        ">
          <ReactMarkdown>{INFO_MD}</ReactMarkdown>
        </div>
      </div>

      {needsAck && (
        <div className="mt-6 bg-brand-50 dark:bg-forest-surface border border-brand-200 dark:border-forest-border rounded-2xl p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">
            Before you continue…
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Please read the league information above, then check the box below to confirm
            you understand the rules and requirements.
          </p>
          <label className="flex items-start gap-3 cursor-pointer select-none mb-5">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              I have read and understand the league rules, fees, and bar support requirement.
            </span>
          </label>
          <button
            onClick={handleAcknowledge}
            disabled={!checked || saving}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Continue to League →'}
          </button>
        </div>
      )}
    </div>
  )
}
