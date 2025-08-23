import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <header className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="text-xl font-bold text-blue-600">Taska</div>
        <div className="flex gap-3">
          <Link href="/auth/login">
            <Button variant="ghost" data-testid="button-login">Log in</Button>
          </Link>
          <Link href="/auth/register">
            <Button data-testid="button-get-started">Get Started</Button>
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h1 className="text-4xl font-extrabold leading-tight text-gray-900" data-testid="text-hero-title">
            Field service, simplified.
          </h1>
          <p className="mt-4 text-gray-600 text-lg" data-testid="text-hero-description">
            Jobs, customers, equipment, invoices—everything in one fast app.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/auth/register">
              <Button size="lg" data-testid="button-start-free">Start free</Button>
            </Link>
            <Link href="/auth/login">
              <Button variant="outline" size="lg" data-testid="button-login-hero">Log in</Button>
            </Link>
          </div>
          <div className="mt-6 text-sm text-gray-500">
            ✓ No credit card required  ✓ 30-day free trial  ✓ Setup in minutes
          </div>
        </div>
        <div className="rounded-xl border bg-white h-72 shadow-sm flex items-center justify-center text-gray-400" data-testid="app-preview">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="font-medium text-gray-600">See Taska in action</p>
            <p className="text-sm text-gray-400 mt-1">Interactive demo coming soon</p>
          </div>
        </div>
      </main>
      
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900" data-testid="text-features-title">
            Everything you need to run your field service business
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center" data-testid="card-feature-jobs">
            <div className="w-12 h-12 bg-green-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Job Management</h3>
            <p className="text-gray-600 text-sm">Schedule, track, and complete jobs with real-time updates and photo documentation.</p>
          </div>
          <div className="text-center" data-testid="card-feature-customers">
            <div className="w-12 h-12 bg-blue-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Customer Portal</h3>
            <p className="text-gray-600 text-sm">Manage customer information, service history, and equipment all in one place.</p>
          </div>
          <div className="text-center" data-testid="card-feature-invoices">
            <div className="w-12 h-12 bg-purple-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Invoicing & Quotes</h3>
            <p className="text-gray-600 text-sm">Generate professional quotes and invoices automatically from completed jobs.</p>
          </div>
        </div>
      </section>
    </div>
  );
}