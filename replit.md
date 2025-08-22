# Replit.md

## Overview

Taska is a comprehensive field service management application built with a modern full-stack architecture. The application enables service businesses to manage jobs, customers, equipment, teams, quotes, and invoices through an intuitive web interface. It features a React frontend with TypeScript, an Express.js backend API, and PostgreSQL database with Drizzle ORM for data management.

## Recent Changes (January 2025)

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
Header-based authentication with organization-level access control:

- **Development Auth**: Temporary header-based system (x-user-id) for rapid development
- **Multi-tenancy**: Organization scoping with x-org-id header
- **Authorization Middleware**: Role-based access control with pro feature gating
- **Future-ready**: Architecture designed for easy JWT/session replacement

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