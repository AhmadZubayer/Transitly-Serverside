# Transitly - Seamless Ticket Booking & Management

This repository contains the serverside source code and documentation for the Transitly web project.

**Clientside Repository: [https://github.com/AhmadZubayer/Transitly-Clientside](https://github.com/AhmadZubayer/Transitly-Clientside)**


# [Live Link: https://transitly-b857b.web.app](https://transitly-b857b.web.app)

**Transitly** is a robust web application designed to simplify the process of browsing, managing, and booking tickets online. Whether you are a traveler looking for a ride or a vendor managing a fleet, Transitly provides a seamless experience for everyone.

---

## Entities & User Roles

Transitly supports three primary user roles, each with a tailored experience:
1.  **Customers (General Users)**
2.  **Vendors**
3.  **Admins**

---


### File-to-API Map

API routes and collection logic are organized into separate files (for example, `collections/users.js`, `collections/tickets.js`, and `collections/bookings.js`) to keep related code modular and maintainable. 

| File | What it contains | Main APIs |
| :--- | :--- | :--- |
| `index.js` | Express app bootstrap, middleware, route registration, server start | `GET /` |
| `config/database.js` | MongoDB connection and collection handles | Shared by all route modules |
| `firebase/firebaseVerify.js` | Firebase token verification and role guards | Middleware only |
| `collections/users.js` | User profile creation, lookup, role management | `POST /users`, `GET /users`, `GET /users/:email`, `GET /users/:email/role`, `PATCH /users/:id/role` |
| `collections/tickets.js` | Ticket creation, listing, admin verification, vendor stats | `POST /tickets`, `GET /tickets`, `GET /tickets/all`, `GET /tickets/vendor/:email`, `PATCH /tickets/:id/verify`, `PATCH /tickets/:id`, `DELETE /tickets/:id`, `GET /tickets/featured`, `GET /tickets/user/:email`, `GET /tickets/vendor/:email/stats`, `GET /tickets/vendor/:email/summary`, `GET /tickets/vendor/:email/analytics` |
| `collections/bookings.js` | Booking creation and booking status updates | `POST /bookings`, `GET /bookings/user/:email`, `GET /bookings/vendor/:email`, `PATCH /bookings/:id/status` |
| `collections/payments.js` | Stripe checkout, payment storage, revenue analytics | `POST /create-checkout-session`, `POST /store-payment`, `GET /vendor-analytics/:email`, `GET /platform-analytics` |
| `collections/staticData.js` | Static lookup data for the client | `GET /districts`, `GET /bus-type`, `GET /bus-company`, `GET /bus-brand`, `GET /bus-features`, `GET /policies` |
| `firebase/firebaseAdmin.js` | Firebase Admin initialization | Used by auth middleware |
| `data/*.json` | Lookup data consumed by the static-data routes | Not an API file |

## Business Logic

The platform operates on a revenue-sharing model for every successful booking (Validated by the serverside):
*   **Platform Share**: 30% of the customer's payment.
*   **Vendor Share**: 70% of the customer's payment.

## Implementations
* Sorting & Searching are handled in the serverside. 
* Pagination & payload size — the API returns a configurable number of tickets per request (controlled by the `limit` and `skip` query parameters).  Limiting the number of tickets per page reduces response payloads and latency, lowers database and server load, decreases client memory and rendering time, and improves perceived performance.

---

## Tech Stack

### Backend
*   **ExpressJS** (Node.js)
*   **MongoDB** (Database)

### Hosting
*   **Frontend**: Firebase Hosting
*   **Server**: Vercel

---



---

## Security

Security in this backend is enforced with Firebase authentication, role-based middleware, and request-time ownership checks.

| Data | Who can access | Protection used |
| :--- | :--- | :--- |
| Static lookup data | Anyone | Public read routes only |
| Public ticket listings | Anyone | Admin-verified only, fraud vendors excluded |
| User profile | The owner or admin | Firebase token check plus email ownership check |
| All users | Admin only | `verifyFBToken` + `verifyAdmin` |
| Vendor tickets | The vendor owner | `verifyFBToken` + `verifyVendor` + email match |
| Admin moderation of tickets | Admin only | `verifyFBToken` + `verifyAdmin` |
| User bookings | The booking owner | `verifyFBToken` + email match |
| Vendor bookings | The vendor owner | `verifyFBToken` + `verifyVendor` + ticket ownership check |
| Payment records | Backend-controlled | Stored after checkout and linked to ticket and booking IDs |

### Firebase middleware usage

`firebase/firebaseVerify.js` centralizes the auth logic so the route modules do not repeat token handling.

* `verifyFBToken` confirms identity with Firebase Admin.
* `verifyAdmin` enforces admin-only access.
* `verifyVendor` enforces vendor-only access.

This middleware chain is reused across `users.js`, `tickets.js`, `bookings.js`, and the payment routes so the access rules stay consistent across the backend.

### Frontend integration (useAxiosSecure)

Attach the Firebase ID token as `Authorization: Bearer <TOKEN>` on protected requests; the server verifies it via `verifyFBToken` and returns 401/403 for invalid or unauthorized tokens.

* Firebase service key credentials was encrypted through  base64 string convertion. 



---


## Use of AI

This project utilized AI tools for development and optimization under student subscription plans:
*   **GitHub Copilot (Claude)**
*   **Gemini CLI**

AI was utilized responsibly in the following scenarios:
*   **Get Ticket API:** AI was used to undertsand and modify how the advanced Ticket Sorting feature interacts with the /GET ticket API. 
*   **Payment Integration**: Troubleshooting and resolving payment route errors.
*   **Data Generation**: Generating 1,000+ testing tickets for initial development and performance testing.
*   **General Debugging**: Identifying and resolving various  bugs.
* Formatting the README file. 
