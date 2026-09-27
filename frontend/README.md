# Event Booking Platform – Frontend

A modern and responsive React frontend for an **Event Ticketing & Experience Booking Platform**.

The frontend allows users to discover events, view event details, register/login, book tickets, and manage their bookings. It also provides an interface for administrators to manage events and bookings.

---

## Tech Stack

* React
* Vite
* React Router DOM
* Axios
* JavaScript
* CSS
* JWT Authentication

---

## Project Structure

```text
frontend/
│
├── public/
│
├── src/
│   ├── assets/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
│
├── .gitignore
├── package.json
├── vite.config.js
└── README.md
```

---

## Features

### User Features

* User registration
* User login
* JWT-based authentication
* Browse available events
* Search events
* Filter events by category
* View event details
* Select ticket quantity
* Book tickets
* View booking history
* Logout

---

### Event Features

* Event name
* Event description
* Event image
* Event date and time
* Event location
* Ticket price
* Available tickets
* Event category

---

### Admin Features

* Admin login
* Admin dashboard
* Create new events
* Edit events
* Delete events
* Upload event images
* View bookings

---

## Backend API

The frontend communicates with the Express.js backend through REST APIs.

Development backend:

```text
http://localhost:5000
```

The API base URL can be configured in the frontend API service.

Example:

```javascript
const API_URL = "http://localhost:5000/api";
```

---

## Installation

Make sure Node.js is installed on your computer.

Open PowerShell inside the `frontend` folder:

```bash
npm install
```

---

## Run the Development Server

```bash
npm run dev
```

Vite will display a local URL similar to:

```text
http://localhost:5173
```

Open that URL in your browser.

---

## Build for Production

To create a production build:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

---

## Authentication

The application uses JWT authentication.

After successful login, the authentication token is stored on the client and sent with protected API requests.

Protected pages include:

* Dashboard
* My Bookings
* Admin Dashboard
* Event Management

---

## Project

**Event Ticketing & Experience Booking Platform**

Built using the MERN stack as part of a full-stack web development internship.

---

## Author

Falguni Rathod

---

## License

This project is created for educational and internship purposes.
