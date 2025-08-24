# Replit.md

## Overview

Taska is a comprehensive field service management application designed for service businesses. It provides tools to manage jobs, customers, equipment, teams, quotes, and invoices through a responsive web interface. The project aims to deliver an intuitive solution for streamlining field service operations.

## Recent Changes (August 2024)

**Production Deployment Success:**
- Successfully deployed to production after resolving FK constraint conflicts
- Implemented bulletproof safety measures with session-only authentication in production
- Added double-validation for org existence at both middleware and endpoint levels
- Enhanced logging for 400/401 errors with org/user ID tracking for monitoring

**Database Schema & Safety:**
- Removed problematic FK constraint that caused deployment loops, replaced with application-level validation
- Production uses NOT VALID FK constraint approach for zero-downtime data integrity
- Added comprehensive cleanup scripts for production database hygiene
- Session-based authentication in production, header-based auth only for development

**Customer Notes Feature:**
- Added `notes` text field to customers table with safe migration
- Enhanced customer modal UI with notes textarea input
- Added notes display in customer cards and search functionality
- Complete CRUD operations for customer notes working in development and production

**Technology Stack:**
- **Frontend**: React 18 + TypeScript + Tailwind CSS (responsive web)
- **Backend**: Express.js + TypeScript with RESTful API
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based with email/password login
- **Mobile Support**: Responsive web design optimized for mobile browsers

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client is built using React 18 with TypeScript and a component-based architecture. It uses Wouter for routing, React Query for server state management, and Tailwind CSS with Shadcn/ui for styling. Vite is used for builds.

### Backend Architecture
The server uses Express.js with TypeScript, following a RESTful API pattern. It includes multi-tenancy for organization-based data isolation and comprehensive error handling. Authentication supports both session-based and header-based methods for development convenience.

### Data Storage
PostgreSQL is used as the database, managed with Drizzle ORM for type-safe operations. Neon Database provides serverless PostgreSQL hosting, and Drizzle Kit is used for migrations.

### Authentication and Authorization
The system employs session-based authentication with email/password login and bcrypt hashing. Sessions are securely stored in PostgreSQL using `connect-pg-simple` and are organization-scoped for multi-tenancy. Role-based access control is implemented, supporting both session and header authentication for flexibility.

### Component Design System
The application leverages the Shadcn/ui component library, built on Radix UI primitives and styled with Tailwind CSS. It uses CSS custom properties for theming, including dark mode support, and features a responsive, mobile-first design.

## External Dependencies

- **React 18**: Frontend framework
- **TypeScript**: Type safety across the stack
- **Express.js**: Backend web framework
- **Drizzle ORM**: Type-safe database toolkit
- **Vite**: Build tool and development server
- **PostgreSQL**: Primary database
- **Neon Database**: Serverless PostgreSQL hosting
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn/ui**: Component library
- **Radix UI**: Headless component primitives
- **Lucide React**: Icon library
- **React Hook Form**: Form handling
- **TanStack React Query**: Server state management and caching
- **Wouter**: Client-side routing
- **Zod**: Runtime type validation
- **connect-pg-simple**: PostgreSQL session store
- **bcrypt**: Password hashing