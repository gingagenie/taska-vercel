# Replit.md

## Overview

Taska is a comprehensive field service management application built with a modern full-stack architecture. The application enables service businesses to manage jobs, customers, equipment, teams, quotes, and invoices through an intuitive web interface. It features a React frontend with TypeScript, an Express.js backend API, and PostgreSQL database with Drizzle ORM for data management.

## Recent Changes (August 2025)

### Email/Password Authentication System (August 23, 2025)
- **Session-Based Authentication**: Replaced header-based dev auth with proper email/password authentication
- **PostgreSQL Session Store**: Implemented secure session storage using connect-pg-simple with existing database
- **User Registration & Login**: Built complete auth flow with bcrypt password hashing and email validation
- **Multi-tenant Session Support**: Sessions properly scope to organization context for data isolation
- **Backward Compatibility**: Maintained header-based auth for development while adding session support
- **Landing Page System**: Created marketing landing page for unauthenticated users with feature highlights
- **Demo Account Ready**: `demo@taska.com` / `demo123` for testing and demonstrations
- **Session Security**: 30-day session expiry, httpOnly cookies, proper logout with session destruction

### Complete Members Management Fix (August 23, 2025)
- **Database Schema Resolution**: Created missing `team_members` table and ensured all user table columns exist
- **SQL Query Fixes**: Removed all unnecessary UUID casting (`::uuid`) that was causing type mismatch errors
- **API Improvements**: POST endpoints now return complete user data for immediate UI updates
- **Optimistic UI Updates**: Added real-time cache updates with automatic invalidation fallbacks
- **Error Resolution**: Fixed "relation team_members does not exist" and "operator does not exist" SQL errors
- **Full CRUD Operations**: Add, delete, and list members now work seamlessly with proper error handling

### Route-Aware Header System & Avatar Fixes (January 23, 2025)
- **Route-Aware Headers**: Implemented intelligent header component that detects current route and displays proper page titles
- **Dynamic Route Support**: Fixed "Page Not Found" issue on dynamic routes like /customers/123, /jobs/456 showing correct context
- **React Hooks Compliance**: Resolved hooks violation by ensuring all useRoute hooks called at top level before conditional logic  
- **Mobile Header Enhancement**: Updated mobile header to use route detection instead of hardcoded title props
- **Comprehensive Route Coverage**: Added support for all application routes including Settings, Notes & Charges, and dynamic paths
- **Avatar System Completion**: Fixed missing colors prop in boring-avatars components enabling full avatar selection functionality
- **Sidebar Auto-Collapse**: Implemented proper sidebar closing behavior when navigating to profile or other pages
- **Graceful Fallbacks**: Unknown routes show "Taska" instead of error messages, maintaining professional appearance

## Recent Changes (January 2025)

### Complete Mobile-Friendly Design System (January 23, 2025)
- **Mobile CSS Framework**: Comprehensive responsive design system with breakpoint-based patterns, touch-optimized interactions, and adaptive layouts
- **Mobile Header System**: Hamburger menu opens sidebar drawer on phones, proper z-index layering, automatic menu close on navigation
- **Responsive Layout Patterns**: Header rows stack on mobile/inline on desktop, header actions distribute width properly, table horizontal scrolling
- **Page Updates**: All key pages (Jobs, Members, Equipment, Customers, Job View) now mobile-responsive with proper button layouts
- **Touch-Friendly Design**: Button groups adapt to screen width, full-width options for mobile, proper gap spacing and flex distribution
- **Dashboard Rebuild**: Clean, mobile-friendly dashboard with KPI cards, today's schedule, upcoming jobs, and quick actions using responsive design patterns

### Auto-Refresh Cache Management
- **Customer Operations**: Create/edit customers automatically refresh customer lists and detail pages
- **Job Operations**: Create/delete jobs automatically refresh job lists without manual reload
- **Cache Invalidation**: React Query cache properly invalidated after all CRUD operations
- **Optimistic Updates**: Customer detail pages update immediately after edits
- **Navigation Sync**: Delete operations navigate to list pages with refreshed data

### Enhanced Customers Page with Tabbed Interface
- **Professional Table Design**: Replaced card grid with polished table featuring sticky header, zebra rows, hover effects
- **Full-Width Tabs**: All, With Email, With Phone, Missing Address filtering with smart customer segmentation
- **Visual Enhancements**: Colorful customer avatars with initials, icons for email/phone/address fields
- **Advanced Actions**: Dropdown menus with View/Edit/Delete actions, proper click event handling
- **Responsive Design**: Horizontal scroll for mobile, proper column truncation, consistent spacing

### Complete Team Members Management System
- **Professional Members Interface**: Comprehensive members page with search, add, edit, and delete functionality
- **Role-Based Management**: Admin, Manager, and Technician roles with proper role guards and validation
- **Email-Based Deduplication**: Smart member creation that updates existing users or creates new ones
- **Backend API**: Full CRUD operations with organization scoping and team relationship management
- **Database Integration**: Extended users table with email, role, phone, and avatar support
- **Avatar Upload System**: File picker integration for member profile pictures with automatic sidebar display

### Job Delete Functionality  
- **Backend DELETE Endpoint**: Secure job deletion with UUID validation and organization scoping
- **Frontend Confirmation**: Professional delete dialog with loading states and error handling
- **Safety Features**: Two-step confirmation prevents accidental deletion, clear error messages
- **Navigation**: Proper redirect to jobs list after successful deletion

### Equipment Management System
- **Complete CRUD Operations**: Create, edit, and view equipment with comprehensive field support
- **Database Schema**: Extended equipment table with make, model, serial, notes, and customer_id foreign key
- **Customer Integration**: Equipment can be linked to customers with auto-populated addresses
- **Professional UI**: Clean equipment cards showing make/model, serial, customer, and location details  
- **Advanced Features**: Search across all equipment fields, edit in-place modal, React Query cache management
- **Backend API**: Full REST endpoints with multi-tenant organization scoping and UUID validation

### Customer Management Upgrade
- **Database Schema**: Added comprehensive customer fields (contact_name, street, suburb, state, postcode) while maintaining backward compatibility
- **Backend API**: Full CRUD operations with auth/tenancy middleware, validation, and error handling
- **Frontend Features**: 
  - Clean table layout with advanced search functionality
  - Professional customer view pages with detailed contact information  
  - Enhanced customer modal for create/edit operations
  - Customer view header actions: Navigate (maps integration), Copy address, Create Job
- **Integration**: JobModal supports pre-selecting customers; job creation flows from equipment pages

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client is built using React 18 with TypeScript and follows a component-based architecture:

- **UI Framework**: React with TypeScript for type safety
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: React Query (TanStack Query) for server state management and caching
- **Styling**: Tailwind CSS with Shadcn/ui component library for consistent design
- **Build Tool**: Vite for fast development and optimized builds
- **Component Structure**: Organized into pages, components, and modals with clear separation of concerns

### Backend Architecture
The server uses Express.js with TypeScript in a RESTful API pattern:

- **Framework**: Express.js with TypeScript for type safety
- **API Design**: RESTful endpoints organized by resource (/api/jobs, /api/customers, etc.)
- **Authentication**: Header-based authentication system (x-user-id, x-org-id) for development
- **Multi-tenancy**: Organization-based data isolation with middleware
- **Request Handling**: JSON parsing with CORS support and comprehensive error handling

### Data Storage
PostgreSQL database with Drizzle ORM for type-safe database operations:

- **Database**: PostgreSQL with Drizzle ORM for schema definition and queries
- **Connection**: Neon Database serverless PostgreSQL for scalable cloud hosting
- **Schema Management**: Drizzle Kit for migrations and schema evolution
- **Type Safety**: Generated TypeScript types from database schema

### Authentication and Authorization
Session-based authentication with PostgreSQL storage and organization-level access control:

- **Session Authentication**: Email/password login with bcrypt hashing and secure session management
- **PostgreSQL Session Store**: Sessions stored in database with 30-day expiry and httpOnly cookies
- **Multi-tenancy**: Organization scoping maintained through session context (orgId stored in session)
- **Authorization Middleware**: Role-based access control with pro feature gating, supports both session and header auth
- **Development Compatibility**: Header-based auth (x-user-id, x-org-id) maintained for development convenience
- **Demo Account**: `demo@taska.com` / `demo123` available for testing and demonstrations

### Component Design System
Shadcn/ui component library with Tailwind CSS for consistent styling:

- **Design System**: Radix UI primitives with custom styling via class-variance-authority
- **Theme**: CSS custom properties for easy customization and dark mode support
- **Typography**: Inter font family with consistent spacing and sizing
- **Responsive**: Mobile-first design with breakpoint utilities

## External Dependencies

### Core Technologies
- **React 18**: Frontend framework with hooks and concurrent features
- **TypeScript**: Type safety across frontend and backend
- **Express.js**: Backend web framework
- **Drizzle ORM**: Type-safe database toolkit
- **Vite**: Build tool and development server

### Database and Hosting
- **PostgreSQL**: Primary database (via Neon Database serverless)
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling

### UI and Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn/ui**: Component library built on Radix UI
- **Radix UI**: Headless component primitives
- **Lucide React**: Icon library
- **React Hook Form**: Form handling with validation

### State Management and Data Fetching
- **TanStack React Query**: Server state management and caching
- **Wouter**: Lightweight client-side routing

### Development Tools
- **Replit Integration**: Development environment support with hot reload
- **ESBuild**: Fast bundling for production builds
- **PostCSS**: CSS processing with Autoprefixer

### Form Handling and Validation
- **React Hook Form**: Form state management
- **Hookform Resolvers**: Integration with validation libraries
- **Zod**: Runtime type validation (via Drizzle schema)