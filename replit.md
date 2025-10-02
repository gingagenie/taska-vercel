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
*   **Photo Storage System**: Centralized storage architecture with automatic fallback (October 2025 refactor).
    *   **Architecture**: Single source of truth pattern preventing path drift between upload/retrieval/delete operations.
    *   **Storage Modules** (`server/storage/`):
        1. `paths.ts`: Runtime flag `useObjectStorage` controls storage location. Provides `absolutePathForKey()` for all path resolution, `jobPhotoKey()` for canonical key generation, and `disableObjectStorage()` to switch to fallback.
        2. `log.ts`: Consistent structured logging for all storage events (UPLOAD, VIEW, DELETE, etc.).
        3. `selftest.ts`: Boot validation that tests write→read cycle, automatically switches to local fallback if object storage unavailable.
    *   **Database Schema**: `job_photos.object_key` stores canonical keys (e.g., `job-photos/{orgId}/{jobId}/file.jpg`). URLs built at runtime via `/api/objects/{key}` (note: `/api/objects/` prefix is critical).
    *   **Automatic Fallback**: When object storage unavailable (ENOENT/EACCES), system disables object storage flag and switches to local `uploads/.private` directory. All operations (upload/retrieval/delete) have retry logic to ensure graceful degradation.
    *   **Critical Files**: `server/storage/paths.ts` (MUST be single source for ALL path logic), `server/routes/jobs.ts` (upload/delete with retry), `server/routes/objects.ts` (retrieval with retry, route pattern `/:objectPath(*)` mounts at `/api/objects`).
    *   **Photo Viewer**: Modal-based viewer in `job-view.tsx` and `completed-job-view.tsx` displays photos within app (maintains authentication context). Clicking photo thumbnails opens full-size image in dialog, preventing authentication failures from opening in new tabs.
    *   **Security**: Organization-based isolation - users from Org A cannot access Org B photos even if they know the URLs (403 on cross-org, 404 on missing).
    *   **Verification**: Check startup logs for `SELFTEST_OK` showing which storage is active. Storage events logged with UPLOAD/VIEW/DELETE prefix.

*   **Stripe Subscription System**: Comprehensive webhook monitoring and alerting system to prevent silent subscription failures.
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