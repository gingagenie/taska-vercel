# Replit.md

## Overview
Taska is a comprehensive field service management application designed for service businesses. It provides tools to manage jobs, customers, equipment, teams, quotes, and invoices through a responsive web interface. The project aims to deliver an intuitive solution for streamlining field service operations, with a strong focus on reliability, data integrity, and a seamless user experience. Key capabilities include job management, customer relationship management, equipment tracking, quoting, invoicing, photo uploads, and a bidirectional SMS confirmation system.

## User Preferences
Preferred communication style: Simple, everyday language.
Development workflow: Check all changes on preview screen first, then deploy to production once verified working.
Deployment preference: All changes should go to production after preview verification.
Problem-solving approach: Thorough analysis and comprehensive solutions on the first attempt rather than iterative fixes. Take time upfront for proper investigation, architect analysis, and complete implementation to avoid multiple attempts that risk breaking existing functionality.

## System Architecture

### UI/UX Decisions
The application utilizes a responsive, mobile-first design leveraging Tailwind CSS and Shadcn/ui for a professional and intuitive user experience. Key UX enhancements include clickable cards for navigation, camera badges for jobs with photos, and smart content formatting for blog posts. Dark mode support is integrated through CSS custom properties.

### Technical Implementations
*   **Photo Storage System**: Successfully migrated from Replit Object Storage to Supabase Storage (October 2025).
    *   **Current State**: All photos now stored in and served from Supabase Storage. Migration complete as of October 5, 2025.
    *   **Supabase Storage**:
        1. `server/services/supabase-storage.ts`: Supabase Storage client with signed URL generation for uploads/downloads.
        2. `server/routes/jobs.ts`: Job photo upload endpoint (POST /:jobId/photos) uses Supabase with automatic fallback to local storage if Supabase unavailable.
        3. `server/routes/jobs.ts`: Completed job photos endpoint (GET /completed/:jobId/photos) transforms Supabase keys into signed URLs for secure viewing.
        4. `media` table: Tracks photo metadata (key, size, dimensions) with org/job isolation.
        5. Key pattern: `org/{orgId}/{yyyy}/{mm}/{dd}/{jobId}/{uuid}.{ext}` for hierarchical organization.
    *   **Legacy Migration** (October 5, 2025):
        1. Migration script `server/scripts/migrate-replit-photos-to-supabase.ts` successfully copied all 10 legacy photos from Replit GCS to Supabase Storage.
        2. Uses Google Cloud Storage client to access Replit bucket (replit-objstore-43849873-2f8f-4b8d-a84d-7997bd426a6a) as data source.
        3. Database URLs updated from `/api/objects/...` format to Supabase keys (`org/...` format).
        4. All historical photos now permanently accessible via Supabase signed URLs.
    *   **Security**: Organization-based isolation enforced at both API and storage levels. Signed URLs expire after 15 minutes.
    *   **Photo Viewer**: Modal-based viewer in `job-view.tsx` and `completed-job-view.tsx` displays photos within app (maintains authentication context).
    *   **Environment Variables**: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY for Supabase Storage access.

*   **Stripe Subscription System**: Comprehensive webhook monitoring and alerting system to prevent silent subscription failures.
    *   **Card-Required Trial Signup** (November 2025): Production-ready trial registration flow requiring payment method upfront to prevent spam.
        1. **Flow**: User selects plan → enters card on Stripe Checkout → 14-day trial starts → auto-charge on day 15
        2. **Database-Backed**: `pending_registrations` table stores user data during checkout (token, email, password hash, plan, price ID) with 24-hour auto-cleanup
        3. **Security**: Email locked via `customer_email` in Stripe session, email validation on completion (Stripe email must match pending registration), price validation using database-stored price ID (not metadata which can be tampered)
        4. **Reliability**: Pending registrations survive server restarts, uses Stripe's actual `trial_end` timestamp (not local calculation), prevents duplicate account creation on page refresh
        5. **Endpoints**: POST `/auth/register-with-trial` (creates pending registration + Stripe checkout), GET `/auth/complete-registration` (validates and completes signup after payment method added)
        6. **Stripe Integration**: Uses fixed AUD Price IDs, trial_period_days=14, subscription metadata includes registration_token for linking
    *   **Database-Backed Monitoring** (`stripe_webhook_monitoring` table): Persistent tracking of webhook health (consecutive failures, timestamps, totals) across server restarts with automatic record creation.
    *   **Startup Validation** (Production Only): Automatic verification of critical environment variables (STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY, DATABASE_URL). Queries Stripe API to confirm webhook endpoints exist for production domains with status validation.
    *   **Enhanced Webhook Handler**: Detailed logging for all webhook events, records successes/failures to database, automatic failure counter reset on success, clear diagnostic messages for common issues (secret not linked, signature verification failures, wrong URL).
    *   **Health Check Endpoint** (`/api/subscriptions/health`): Real-time system status across all monitoring components, stale webhook detection (alerts if no webhooks received when active subscriptions exist), returns comprehensive status with actionable recommendations.
    *   **Email Alert System** (MailerSend): Automatic non-blocking alerts sent when consecutive failures reach threshold (5 failures). Includes failure count, last error, timestamp, troubleshooting guide, and links to health check endpoint and Stripe dashboard. Alerts sent to business owner email.
    *   **Configuration Requirements**: STRIPE_WEBHOOK_SECRET (linked to Replit app), STRIPE_SECRET_KEY, DATABASE_URL, MAILERSEND_API_KEY. Webhook URL must point to production domain (https://www.taska.info/api/subscriptions/webhook). All plans configured with AUD currency.
    *   **Monitoring Workflow**: Server startup validates configuration and checks Stripe API → webhooks received/failed are recorded to database → at failure threshold, email alert sent automatically → health check available anytime for current status.
    *   **Troubleshooting**: Stale webhooks = verify URL in Stripe dashboard matches production domain and endpoint is enabled. Consecutive failures = check server logs, verify secret matches Stripe dashboard, test webhook in Stripe. No webhooks received = check startup logs for endpoint verification, confirm production URL matches Stripe config.

*   **Bidirectional SMS**: Twilio integration for automated job confirmation SMS, including inbound reply processing for automatic job status updates and comprehensive logging.
*   **Xero Integration**: OAuth2 integration for one-way push of quotes and invoices to Xero as drafts, with secure token storage and refresh.
*   **Customer Support**: Integrated customer-facing support ticket system with dedicated pages for dashboard, ticket creation, details, and listing, scoped by organization.
*   **Newsletter Subscription**: Secure email collection, normalization, duplicate prevention, and unsubscribe token security for blog pages.
*   **Customer/Job Management**: Features include customer notes, equipment-customer relationships (filtering equipment by customer), and job assignments to technicians.

### System Design Choices
*   **Multi-tenancy**: Organization-based data isolation is implemented across the system.
*   **Authentication**: Session-based authentication using email/password with bcrypt hashing, secured in PostgreSQL. Supports both session-based (production) and header-based (development) authentication.
*   **Database**: PostgreSQL with Drizzle ORM for type-safe operations and Drizzle Kit for migrations. Neon Database is used for hosting.
*   **Error Handling**: Comprehensive error handling and logging, particularly for critical integrations like Stripe webhooks.
*   **Timezone Management**: Backend handles `timestamptz` for timezone-aware storage and conversion, with ongoing efforts to resolve frontend display issues.
*   **Deployment Safety**: Production deployments include measures like session-only authentication, double-validation for organization existence, and careful FK constraint management for zero-downtime data integrity.

## External Dependencies
*   **React 18**: Frontend framework
*   **TypeScript**: Type safety
*   **Express.js**: Backend web framework
*   **Drizzle ORM**: Database toolkit
*   **Vite**: Build tool
*   **PostgreSQL**: Primary database
*   **Neon Database**: Serverless PostgreSQL hosting
*   **Tailwind CSS**: CSS framework
*   **Shadcn/ui**: Component library
*   **Radix UI**: Headless component primitives
*   **Lucide React**: Icon library
*   **React Hook Form**: Form handling
*   **TanStack React Query**: Server state management
*   **Wouter**: Client-side routing
*   **Zod**: Runtime type validation
*   **connect-pg-simple**: PostgreSQL session store
*   **bcrypt**: Password hashing
*   **Stripe**: Payment processing and subscription management
*   **Google Cloud Storage (GCS)**: Object storage for photo uploads
*   **Twilio**: SMS service for bidirectional communication
*   **Xero**: Accounting software integration
*   **MailerSend**: Email alert system