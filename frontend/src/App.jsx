import { useEffect, useEffectEvent, useRef, useState } from "react";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { BrowserQRCodeReader } from "@zxing/browser";
import "./App.css";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});
const imageFallback =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80";
const recoverableQrDecodeErrors = new Set([
  "NotFoundException",
  "FormatException",
  "ChecksumException",
]);
const blankEvent = {
  title: "",
  description: "",
  category: "Music",
  location: "",
  date: "",
  price: "",
  currency: "USD",
  capacity: "",
  image: null,
};
const getCancellationEligibility = (eventDateValue, nowValue) => {
  if (!eventDateValue) return { canCancel: false, cancelReason: "The event date is unavailable" };
  const eventDate = new Date(eventDateValue);
  const now = new Date(nowValue);
  if (Number.isNaN(eventDate.getTime())) return { canCancel: false, cancelReason: "The event date is unavailable" };
  if (eventDate < now) return { canCancel: false, cancelReason: "This event has already ended." };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  if (eventDay.getTime() === today.getTime()) {
    return { canCancel: false, cancelReason: "Cancellation is unavailable because the event is today." };
  }
  if (eventDate.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000) {
    return { canCancel: false, cancelReason: "Cancellation is unavailable because the event is within 7 days." };
  }
  return { canCancel: true, cancelReason: "" };
};

function App() {
  const [session, setSession] = useState(() =>
    JSON.parse(localStorage.getItem("event-session") || "null"),
  );
  const [events, setEvents] = useState([]);

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState("");

  const [adminBookings, setAdminBookings] = useState([]);
  const [adminBookingsLoading, setAdminBookingsLoading] = useState(false);
  const [adminBookingSearch, setAdminBookingSearch] = useState("");

  const [reviews, setReviews] = useState({ reviews: [], average: 0, count: 0 });
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [checkInToken, setCheckInToken] = useState("");
  const [scannedTicketCode, setScannedTicketCode] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [verifiedTicket, setVerifiedTicket] = useState(null);
  const [ticketValidationError, setTicketValidationError] = useState("");
  const [ticketValidationStatus, setTicketValidationStatus] = useState("");
  const [ticketValidationLoading, setTicketValidationLoading] = useState(false);
  const [ticketCheckInLoading, setTicketCheckInLoading] = useState(false);
  const [ticketCheckedIn, setTicketCheckedIn] = useState(false);
  const scannerVideoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scanHandledRef = useRef(false);
  const [cancellingBookingId, setCancellingBookingId] = useState(null);
  const [cancellingEventId, setCancellingEventId] = useState(null);
  const [cancellationClock, setCancellationClock] = useState(0);
  const [view, setView] = useState("discover");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [reviewClock, setReviewClock] = useState(0);
  const [authMode, setAuthMode] = useState(null);
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    date: "upcoming",
  });
  const [tickets, setTickets] = useState(1);
  const [reminderOptIn, setReminderOptIn] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminForm, setAdminForm] = useState(blankEvent);

  const request = (config) =>
    api({
      ...config,
      headers: {
        ...(config.headers || {}),
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
    });
  const loadEvents = async () => {
    try {
      const { data } = session?.user.role === "admin" && view === "admin"
        ? await request({ method: "get", url: "/events/admin" })
        : await api.get("/events", { params: filters });
      setEvents(data);
    } catch (error) {
      setNotice(error.response?.data?.message || "Could not load events");
    }
  };

  const loadAdminBookings = async () => {
    if (!session || session.user.role !== "admin") {
      setAdminBookings([]);
      return;
    }
    setAdminBookingsLoading(true);

    try {
      const { data } = await request({
      method: "get",
      url: "/bookings/all",
     });
     setAdminBookings(data);
    } catch (error) {
      notify(error.response?.data?.message || "Could not load bookings");
    } finally {
    setAdminBookingsLoading(false);
    }
  };

  const loadBookings = async () => {
    if (!session) {
      setBookings([]);
      return;
    }
    setBookingsLoading(true);
    setBookingsError("");
    try {
      const { data } = await request({ method: "get", url: "/bookings/mine" });
      setBookings(data);
    } catch (error) {
      setBookingsError(error.response?.data?.message || "Could not load your bookings");
    } finally {
      setBookingsLoading(false);
    }
  };
  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };
  const navigateToView = (nextView) => {
    if (nextView !== "admin") {
      setScannerOpen(false);
      setScannerActive(false);
    }
    setView(nextView);
  };
  const refreshEvents = useEffectEvent(() => loadEvents());
  const refreshBookings = useEffectEvent(() => loadBookings());
  const validateEntryTicket = async (token) => {
    const normalizedToken = token.trim();
    setTicketValidationStatus("loading");
    setTicketValidationError("");
    setVerifiedTicket(null);
    setTicketCheckedIn(false);
    if (!normalizedToken) {
      setTicketValidationStatus("invalid");
      setTicketValidationError("The QR code did not contain a ticket code.");
      setTicketValidationLoading(false);
      return;
    }
    setCheckInToken(normalizedToken);
    setTicketValidationLoading(true);
    try {
      const { data } = await request({ method: "get", url: `/bookings/check-in/${encodeURIComponent(normalizedToken)}` });
      if (!data?.booking) {
        console.error("Ticket validation API returned no booking", { status: 200 });
        setTicketValidationStatus("error");
        setTicketValidationError("The validation service returned an incomplete response.");
        return;
      }
      setVerifiedTicket(data.booking);
      setTicketValidationStatus("valid");
    } catch (error) {
      const message = error.response?.data?.message || "Ticket could not be validated";
      const alreadyCheckedIn = error.response?.status === 409 || message.toLowerCase().includes("already been used");
      const validationUnavailable = !error.response || error.response.status >= 500 || [401, 403].includes(error.response.status);
      setTicketValidationStatus(alreadyCheckedIn ? "already" : validationUnavailable ? "error" : "invalid");
      setTicketValidationError(alreadyCheckedIn ? "Ticket has already been used." : validationUnavailable ? "Ticket validation is unavailable. Please try again." : message);
      if (error.response) {
        const log = validationUnavailable ? console.error : console.warn;
        log("Ticket validation backend response", { status: error.response.status, message });
      } else {
        console.error("Ticket validation request failed", error);
      }
    } finally {
      setTicketValidationLoading(false);
    }
  };
  const validateScannedEntryTicket = useEffectEvent((token) => validateEntryTicket(token));
  useEffect(() => {
    refreshEvents();
  }, [filters, view, session]);
  useEffect(() => {
    refreshBookings();
  }, [session]);

  useEffect(() => {
    if (view === "admin" && session?.user.role === "admin") {
      loadAdminBookings();
    }
  }, [view, session]);

  useEffect(() => {
    if (view !== "bookings" || !session) return;
    const interval = window.setInterval(refreshBookings, 15_000);
    return () => window.clearInterval(interval);
  }, [view, session]);
  useEffect(() => {
    if (view !== "admin" || !session || !scannerOpen || !scannerActive) return;
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 100,
      delayBetweenScanSuccess: 0,
    });
    let disposed = false;
    let detectionTimeout;
    scanHandledRef.current = false;
    setScannerError("");
    reader.decodeFromVideoDevice(undefined, scannerVideoRef.current, async (result, decodeError, controls) => {
      if (disposed || scanHandledRef.current) return;
      if (!result) {
        if (decodeError && !recoverableQrDecodeErrors.has(decodeError.name)) {
          console.warn("QR frame could not be decoded; continuing scan", decodeError);
        }
        return;
      }
      scanHandledRef.current = true;
      window.clearTimeout(detectionTimeout);
      controls.stop();
      scannerControlsRef.current = null;
      let token;
      try {
        token = result.getText().trim();
      } catch (error) {
        console.error("Could not read decoded QR content", error);
        setScannedTicketCode("");
        setTicketValidationStatus("invalid");
        setTicketValidationError("QR code could not be read. Try scanning it again.");
        setScannerActive(false);
        return;
      }
      setScannedTicketCode(token);
      setCheckInToken(token);
      setTicketValidationStatus("loading");
      setTicketValidationError("");
      setScannerActive(false);
      await validateScannedEntryTicket(token);
    }).then((controls) => {
      if (disposed || scanHandledRef.current) {
        controls.stop();
        return;
      }
      scannerControlsRef.current = controls;
      detectionTimeout = window.setTimeout(() => {
        if (disposed || scanHandledRef.current) return;
        setScannerError("QR not detected, please try again");
        setScannerActive(false);
        controls.stop();
        scannerControlsRef.current = null;
      }, 20000);
    }).catch((error) => {
      if (!disposed) {
        console.error("Could not start QR scanner", error);
        setScannerError(error.name === "NotAllowedError"
          ? "Camera access was denied. Allow camera access or enter the ticket code manually."
          : "Could not start the camera. Enter the ticket code manually.");
        setScannerActive(false);
      }
    });
    return () => {
      disposed = true;
      window.clearTimeout(detectionTimeout);
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [view, session, scannerOpen, scannerActive]);
  useEffect(() => {
    if (view !== "admin") {
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    }
  }, [view]);
  useEffect(() => {
    if (!selectedEvent) return;
    const refreshClock = () => setReviewClock(Date.now());
    const initialTimer = window.setTimeout(refreshClock, 0);
    const interval = window.setInterval(refreshClock, 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [selectedEvent]);
  useEffect(() => {
    const refreshClock = () => setCancellationClock(Date.now());
    const initialTimer = window.setTimeout(refreshClock, 0);
    const interval = window.setInterval(refreshClock, 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);
  const submitAuth = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post(`/auth/${authMode}`, authForm);
      localStorage.setItem("event-session", JSON.stringify(data));
      setSession(data);
      setAuthMode(null);
      notify(`Welcome, ${data.user.name}`);
    } catch (error) {
      notify(error.response?.data?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };
  const logout = () => {
    localStorage.removeItem("event-session");
    setSession(null);
    navigateToView("discover");
    notify("You have been signed out");
  };
  const bookEvent = async () => {
    if (!session) return setAuthMode("login");

    const eventDate = new Date(selectedEvent.date);

    if (eventDate <= new Date()) {
      notify("This event has ended. Tickets are no longer available.");
      return;
    }

    try {
      const { data } = await request({
        method: "post",
        url: "/bookings",
        data: { eventId: selectedEvent._id, quantity: tickets, reminderOptIn },
      });
      await loadBookings();
      await loadEvents();
      setSelectedEvent(null);
      notify(data.message || "Tickets reserved.");
    } catch (error) {
      notify(error.response?.data?.message || "Booking could not be completed");
    }
  };
  const selectEvent = async (event, { reviewOnly: openReviewOnly = false } = {}) => {
    setSelectedEvent(event);
    setReviewOnly(openReviewOnly);
    setTickets(1);
    setReviewForm({ rating: 5, comment: "" });
    try {
      const { data } = await api.get(`/reviews/${event._id}`);
      setReviews(data);
    } catch {
      setReviews({ reviews: [], average: 0, count: 0 });
    }
  };
  const submitReview = async (event) => {
    event.preventDefault();
    if (!session) return setAuthMode("login");
    if (new Date(selectedEvent.date).getTime() > Date.now()) {
      return notify("Reviews can be submitted after the event.");
    }
    const hasConfirmedBooking = bookings.some(
      (booking) => String(booking.event?._id || booking.event) === selectedEvent._id && booking.status === "confirmed",
    );
    if (!hasConfirmedBooking) return notify("A confirmed booking is required to review this event.");
    try {
      await request({ method: "post", url: `/reviews/${selectedEvent._id}`, data: reviewForm });
      const { data } = await api.get(`/reviews/${selectedEvent._id}`);
      setReviews(data);
      setReviewForm({ rating: 5, comment: "" });
      notify("Your review has been saved");
    } catch (error) {
      notify(error.response?.data?.message || "Could not save your review");
    }
  };
  const cancelBooking = async (booking) => {
    const eligibility = getCancellationEligibility(booking.event?.date, cancellationClock);
    if (!eligibility.canCancel) return notify(eligibility.cancelReason);
    const confirmed = window.confirm("Are you sure you want to cancel this ticket?");
    if (!confirmed) return;
    setCancellingBookingId(booking._id);
    try {
      const { data } = await request({ method: "post", url: `/bookings/${booking._id}/cancel` });
      setBookings((currentBookings) => currentBookings.filter((item) => item._id !== booking._id));
      await loadEvents();
      notify(data.message);
    } catch (error) {
      notify(error.response?.data?.message || "Booking could not be cancelled");
    } finally {
      setCancellingBookingId(null);
    }
  };
  const checkInTicket = async (event) => {
    event.preventDefault();
    if (!verifiedTicket) return;
    setTicketCheckInLoading(true);
    try {
      const { data } = await request({ method: "post", url: `/bookings/check-in/${encodeURIComponent(checkInToken)}` });
      setVerifiedTicket(data.booking);
      setTicketCheckedIn(true);
      setTicketValidationError("");
    } catch (error) {
      const message = error.response?.data?.message || "Ticket could not be checked in";
      const alreadyCheckedIn = error.response?.status === 409 || message.toLowerCase().includes("already been used");
      const validationUnavailable = !error.response || error.response.status >= 500 || [401, 403].includes(error.response.status);
      setTicketValidationStatus(alreadyCheckedIn ? "already" : validationUnavailable ? "error" : "invalid");
      setTicketValidationError(alreadyCheckedIn ? "Ticket has already been used." : validationUnavailable ? "Ticket check-in is unavailable. Please try again." : message);
      if (error.response) {
        const log = validationUnavailable ? console.error : console.warn;
        log("Ticket check-in backend response", { status: error.response.status, message });
      }
      else console.error("Ticket check-in request failed", error);
    } finally {
      setTicketCheckInLoading(false);
    }
  };
  const saveEvent = async (event) => {
    event.preventDefault();
    const body = new FormData();
    Object.entries(adminForm).forEach(
      ([key, value]) => value !== null && body.append(key, value),
    );
    try {
      await request({
        method: adminForm._id ? "put" : "post",
        url: `/events${adminForm._id ? `/${adminForm._id}` : ""}`,
        data: body,
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAdminForm(blankEvent);
      notify("Event saved");
      loadEvents();
    } catch (error) {
      notify(error.response?.data?.message || "Event could not be saved");
    }
  };
  const cancelEvent = async (event) => {
    try {
      const { data: impact } = await request({
        method: "get",
        url: `/events/${event._id}/cancellation-impact`,
      });
      if (impact.alreadyCancelled) return notify("This event is already cancelled");
      const affectedBookings = impact.affectedBookings || 0;
      const bookingWord = affectedBookings === 1 ? "booking" : "bookings";
      if (!window.confirm(`Cancel "${event.title}"? ${affectedBookings} ${bookingWord} will be marked cancelled. No refunds will be issued. This cannot be undone.`)) return;
      setCancellingEventId(event._id);
      const { data } = await request({ method: "post", url: `/events/${event._id}/cancel` });
      await loadEvents();
      await loadBookings();
      notify(`Event cancelled. ${data.affectedBookings} ${data.affectedBookings === 1 ? "booking" : "bookings"} updated.`);
    } catch (error) {
      notify(error.response?.data?.message || "Event could not be cancelled");
    } finally {
      setCancellingEventId(null);
    }
  };
  const categories = [...new Set(events.map((event) => event.category))];
  const imageUrl = (event) =>
    event?.image?.startsWith("http")
      ? event.image
      : event?.image
        ? `http://localhost:5000${event.image}`
        : imageFallback;
  const formatPrice = (amount, currency = "USD") =>
    new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount));
  const selectedEventHasPassed = selectedEvent && new Date(selectedEvent.date).getTime() <= reviewClock;
  const hasConfirmedSelectedEventBooking = selectedEvent && bookings.some(
    (booking) => String(booking.event?._id || booking.event) === selectedEvent._id && booking.status === "confirmed",
  );
  const bookingsWithCancellationEligibility = bookings.map((booking) => ({
    ...booking,
    ...(cancellationClock
      ? getCancellationEligibility(booking.event?.date, cancellationClock)
      : { canCancel: booking.canCancel, cancelReason: booking.cancelReason }),
  }));

  const adminBookingSummary = Object.values(
  adminBookings.reduce((summary, booking) => {
    const event = booking.event || booking.eventSnapshot;
    if (!event) return summary;
    const eventId = event._id;

    if (!summary[eventId]) {
      summary[eventId] = {
        event,
        totalTickets: 0,
        bookingCount: 0,
      };
    }

    summary[eventId].totalTickets += Number(booking.quantity || 1);
    summary[eventId].bookingCount += 1;

    return summary;
  }, {})
  );

  const filteredAdminBookingSummary = adminBookingSummary.filter((item) =>
    item.event?.title
    ?.toLowerCase()
    .includes(adminBookingSearch.trim().toLowerCase())
  );

  const isEventCancelled = (booking) => booking.status === "event_cancelled" || booking.event?.status === "cancelled";
  const isPastBooking = (booking) => Boolean(booking.event?.date) && new Date(booking.event.date).getTime() <= cancellationClock;
  const cancelledBookings = bookingsWithCancellationEligibility.filter(isEventCancelled);
  const pastBookings = bookingsWithCancellationEligibility.filter((booking) => !isEventCancelled(booking) && isPastBooking(booking));
  const upcomingBookings = bookingsWithCancellationEligibility.filter((booking) => !isEventCancelled(booking) && !isPastBooking(booking));
  const renderBookingCard = (booking, section) => {
    const eventCancelled = section === "cancelled";
    const eventPast = section === "past";
    return (
      <article className="booking-row" key={booking._id}>
        <div
          className="booking-thumb"
          style={{ backgroundImage: `url(${imageUrl(booking.event)})` }}
        ></div>
        <div>

          {eventCancelled && <p className="event-cancelled-message">This event was cancelled by the organizer.</p>}
          <h3>{booking.event?.title || "Event no longer available"}</h3>
          {booking.event ? (
            <p className="muted">
              {new Date(booking.event.date).toLocaleDateString("en-US", { dateStyle: "long" })} · {booking.event.location}
            </p>
          ) : <p className="muted">The event details are no longer available.</p>}
        </div>
        <div className="booking-meta">
          <div className="booking-total">
            <strong>{booking.quantity} {booking.quantity === 1 ? "ticket" : "tickets"}</strong>
            <span>{formatPrice(booking.totalPrice, booking.currency || booking.event?.currency || "USD")}</span>
          </div>
          {!eventCancelled && !eventPast && booking.status === "confirmed" && booking.event?.status !== "cancelled" && (
            <div className="ticket-code">
              <QRCodeSVG value={booking.ticketToken} size={96} level="M" />
              <small>Entry ticket QR</small>
            </div>
          )}

          {eventPast && booking.status === "confirmed" && booking.event && (
            <button className="text-button review-booking-button" onClick={() => selectEvent(booking.event, { reviewOnly: true })}>
              Review event
            </button>
          )}
          {!eventCancelled && !eventPast && booking.status === "confirmed" && booking.event?.status !== "cancelled" && (
            <div className="booking-cancellation">
              <button
                className={`cancel-booking-button ${booking.canCancel ? "" : "cancel-booking-unavailable"}`}
                disabled={cancellingBookingId === booking._id}
                title={booking.canCancel ? "Cancel this ticket" : booking.cancelReason}
                onClick={() => cancelBooking(booking)}
              >
                {cancellingBookingId === booking._id ? "Cancelling..." : "Cancel ticket"}
              </button>
              {!booking.canCancel && booking.cancelReason && (
                <small className="cancel-booking-reason">{booking.cancelReason}</small>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#discover"
          onClick={() => navigateToView("discover")}
        >
          <span className="brand-mark">eb</span>
          <span>
            event<span className="brand-accent">bird</span>
          </span>
        </a>
        <nav>
          <button
            className={view === "discover" ? "nav-active" : ""}
            onClick={() => navigateToView("discover")}
          >
            Discover
          </button>
          <button
            className={view === "bookings" ? "nav-active" : ""}
            onClick={() => {
              navigateToView("bookings");
              if (!session) setAuthMode("login");
            }}
          >
            My bookings
          </button>
          {session?.user.role === "admin" && (
            <button
              className={view === "admin" ? "nav-active" : ""}
              onClick={() => navigateToView("admin")}
            >
              Admin
            </button>
          )}
        </nav>
        <div className="account">
          {session ? (
            <>
              <span className="avatar">{session.user.name[0]}</span>
              <span className="user-name">{session.user.name}</span>
              <button className="ghost-button" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                className="ghost-button"
                onClick={() => setAuthMode("login")}
              >
                Log in
              </button>
              <button
                className="dark-button"
                onClick={() => setAuthMode("register")}
              >
                Join free
              </button>
            </>
          )}
        </div>
      </header>
      <main>
        {view === "discover" && (
          <>
            <section className="hero-section">
              <div className="hero-copy">
                <p className="eyebrow">YOUR NEXT GREAT MEMORY</p>
                <h1>
                  Make plans
                  <br />
                  <em>worth keeping.</em>
                </h1>
                <p className="hero-text">
                  Find the concerts, workshops, adventures and little moments
                  that make a week feel like yours.
                </p>
              </div>
              <div className="hero-art">
                <div className="hero-photo"></div>
                <div className="hero-note">
                  <strong>03</strong>
                  <span>
                    Find your
                    <br />
                    kind of fun
                  </span>
                </div>
              </div>
            </section>
            <section className="discover-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">CURATED FOR YOU</p>
                  <h2>
                    Find your next <em>yes.</em>
                  </h2>
                </div>
                <span className="event-count">
                  {events.length} events in your orbit
                </span>
              </div>
              <div className="filters">
                <label className="search-box">
                  <span>⌕</span>
                  <input
                    placeholder="Search by event, place or feeling"
                    value={filters.search}
                    onChange={(e) =>
                      setFilters({ ...filters, search: e.target.value })
                    }
                  />
                </label>
                <select
                  value={filters.category}
                  onChange={(e) =>
                    setFilters({ ...filters, category: e.target.value })
                  }
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
                <select
                  value={filters.date}
                  onChange={(e) =>
                    setFilters({ ...filters, date: e.target.value })
                  }
                >
                  <option value="upcoming">Upcoming only</option>
                  <option value="">All dates</option>
                </select>
              </div>
              <div className="event-grid">
                {events.map((event) => (
                  <article
                    className="event-card"
                    key={event._id}
                    onClick={() => selectEvent(event)}
                  >
                    <div
                      className="event-image"
                      style={{ backgroundImage: `url(${imageUrl(event)})` }}
                    >
                      <span className="category-pill">{event.category}</span>
                      <span className="date-badge">
                        <b>
                          {new Date(event.date).toLocaleDateString("en-US", {
                            day: "2-digit",
                          })}
                        </b>
                        <small>
                          {new Date(event.date).toLocaleDateString("en-US", {
                            month: "short",
                          })}
                        </small>
                      </span>
                    </div>
                    <div className="event-content">
                      <h3>{event.title}</h3>
                      <p className="muted">
                        {event.location} ·{" "}
                        {new Date(event.date).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <div className="event-footer">
                        <strong>{formatPrice(event.price, event.currency)}</strong>
                        <span>
                          {event.capacity - event.bookedSeats} spots left{" "}
                          <span className="arrow">↗</span>
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!events.length && (
                <div className="empty-state">
                  <span>✦</span>
                  <h3>No events match that search.</h3>
                  <p>Try a different place, category, or keyword.</p>
                </div>
              )}
            </section>
          </>
        )}
        {view === "bookings" && (
          <section className="page-section">
            <p className="eyebrow">YOUR PLANS</p>
            <h1 className="page-title">
              My <em>bookings.</em>
            </h1>
            <div className="booking-page-content">
              {!session ? (
                <div className="empty-state">
                  <h3>Sign in to see your bookings.</h3>
                  <button className="dark-button" onClick={() => setAuthMode("login")}>Log in</button>
                </div>
              ) : bookingsLoading ? (
                <div className="empty-state"><p>Loading your bookings...</p></div>
              ) : bookingsError ? (
                <div className="empty-state">
                  <h3>Your bookings could not be loaded.</h3>
                  <p>{bookingsError}</p>
                  <button className="dark-button" onClick={loadBookings}>Try again</button>
                </div>
              ) : (
                <div className="booking-groups">
                  <section className="booking-group">
                    <div className="booking-group-heading"><h2>Upcoming Events</h2><span>{upcomingBookings.length}</span></div>
                    <div className="booking-list">
                      {upcomingBookings.map((booking) => renderBookingCard(booking, "upcoming"))}
                      {!upcomingBookings.length && <div className="empty-state"><p>No upcoming bookings.</p></div>}
                    </div>
                  </section>
                  <section className="booking-group">
                    <div className="booking-group-heading"><h2>Past Events</h2><span>{pastBookings.length}</span></div>
                    <div className="booking-list">
                      {pastBookings.map((booking) => renderBookingCard(booking, "past"))}
                      {!pastBookings.length && <div className="empty-state"><p>Past event bookings will appear here.</p></div>}
                    </div>
                  </section>
                  {cancelledBookings.length > 0 && (
                    <section className="booking-group">
                      <div className="booking-group-heading"><h2>Cancelled Events</h2><span>{cancelledBookings.length}</span></div>
                      <div className="booking-list">
                        {cancelledBookings.map((booking) => renderBookingCard(booking, "cancelled"))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
        {view === "admin" && (
          <section className="page-section admin-page">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CONTROL ROOM</p>
                <h1 className="page-title">
                  Event <em>studio.</em>
                </h1>
              </div>
              <span className="admin-tag">ADMIN ACCESS</span>
            </div>
            <section className="checkin-section">
              <div className="checkin-heading">
                <div>
                  <p className="eyebrow">ENTRY MANAGEMENT</p>
                  <h2>Ticket <em>check-in.</em></h2>
                </div>
                <span className="checkin-status"><i /> GUEST SERVICES</span>
              </div>
              <div className="checkin-content">
                <section className="scanner-panel" aria-label="QR code scanner">
                  <div className="scanner-panel-heading">
                    <div><p className="eyebrow">01 / CAMERA</p><h3>Scan a ticket</h3></div>
                    <span className={`scanner-state ${scannerActive ? "scanner-state-live" : ""}`}>
                      {scannerActive ? "LIVE" : scannerOpen ? "PAUSED" : "READY"}
                    </span>
                  </div>
                  {scannerOpen ? (
                    <div className={`scanner-frame ${scannerActive ? "scanner-running" : ""}`}>
                      <video ref={scannerVideoRef} className="scanner-video" muted playsInline />
                      {scannerActive && !scannerError && <span className="scanner-line" aria-hidden="true" />}
                      {scannerActive && !scannerError && <span className="scanner-hint">Point the camera at a ticket QR code</span>}
                      {!scannerActive && !scannerError && <span className="scanner-hint">Scanner stopped</span>}
                      {scannerError && <span className="scanner-hint">{scannerError}</span>}
                    </div>
                  ) : (
                    <div className="scanner-idle">
                      <span className="scanner-mark" aria-hidden="true"><i /><i /><i /><i /></span>
                      <p>Camera is off</p>
                      <span>Start scanning when you are ready to check in a guest.</span>
                    </div>
                  )}
                  <div className="scanner-controls">
                    {!scannerOpen && <button className="dark-button" type="button" onClick={() => { setScannerError(""); setTicketValidationError(""); setTicketValidationStatus(""); setScannedTicketCode(null); setVerifiedTicket(null); setTicketCheckedIn(false); setCheckInToken(""); setScannerOpen(true); setScannerActive(true); }}>Scan QR Code</button>}
                    {scannerOpen && scannerActive && <button className="light-button" type="button" onClick={() => setScannerActive(false)}>Stop Scanner</button>}
                    {scannerOpen && !scannerActive && <button className="dark-button" type="button" onClick={() => { setScannerError(""); setScannerActive(true); }}>Scan QR Code</button>}
                    {scannerOpen && <button className="light-button" type="button" onClick={() => { setScannerActive(false); setScannerOpen(false); setScannerError(""); }}>Close</button>}
                  </div>
                </section>

                <section className="manual-panel" aria-label="Manual ticket validation">
                  <div className="scanner-panel-heading">
                    <div><p className="eyebrow">02 / LOOKUP</p><h3>Enter ticket code</h3></div>
                  </div>
                  <form className="checkin-manual-form" onSubmit={(event) => { event.preventDefault(); setScannerActive(false); setScannedTicketCode(null); validateEntryTicket(checkInToken); }}>
                    <label>Entry Ticket<input required value={checkInToken} onChange={(event) => setCheckInToken(event.target.value)} placeholder="Enter ticket code" /></label>
                    <button className="light-button" type="submit" disabled={ticketValidationLoading}>{ticketValidationLoading ? "Validating..." : "Validate ticket"}</button>
                  </form>
                  <p className="manual-note">QR scanning is optional. Ticket codes can be checked here.</p>
                </section>

                {scannedTicketCode !== null && (
                  <p className="scanned-ticket-code"><span>SCANNED TICKET CODE</span><code>{scannedTicketCode || "(empty QR payload)"}</code></p>
                )}
                {ticketValidationLoading && <p className="checkin-message" role="status">Validating ticket...</p>}
                {!ticketValidationLoading && ticketValidationStatus === "valid" && <p className="checkin-message checkin-success" role="status">Ticket Valid</p>}
                {!ticketValidationLoading && ticketValidationStatus === "already" && (
                  <p className="checkin-message checkin-error" role="alert"><strong>Ticket Already Checked In</strong><span>{ticketValidationError}</span></p>
                )}
                {!ticketValidationLoading && ticketValidationStatus === "invalid" && (
                  <p className="checkin-message checkin-error" role="alert"><strong>Invalid Ticket</strong><span>{ticketValidationError}</span></p>
                )}
                {!ticketValidationLoading && ticketValidationStatus === "error" && (
                  <p className="checkin-message checkin-error" role="alert"><strong>Could Not Validate Ticket</strong><span>{ticketValidationError}</span></p>
                )}
                {ticketCheckedIn && <p className="checkin-message checkin-success" role="status">Ticket checked in successfully.</p>}
                {verifiedTicket && (
                  <dl className="verified-ticket">
                    <div><dt>Event</dt><dd>{verifiedTicket.event?.title || "Event unavailable"}</dd></div>
                    <div><dt>Tickets</dt><dd>{verifiedTicket.quantity} {verifiedTicket.quantity === 1 ? "ticket" : "tickets"}</dd></div>
                    <div><dt>Ticket ID</dt><dd>{verifiedTicket.ticketToken || checkInToken}</dd></div>
                  </dl>
                )}
                <form className="checkin-submit-form" onSubmit={checkInTicket}>
                  <button className="dark-button" type="submit" disabled={!verifiedTicket || ticketCheckInLoading || ticketCheckedIn}>
                    {ticketCheckInLoading ? "Checking in..." : "Check In"}
                  </button>
                </form>
              </div>
            </section>
            <div className="admin-layout">
              <form className="admin-form" onSubmit={saveEvent}>
                <h3>{adminForm._id ? "Edit event" : "Create an event"}</h3>
                {[
                  "title",
                  "location",
                  "category",
                  "date",
                  "price",
                  "capacity",
                ].map((field) => (
                  <label key={field}>
                    {field}
                    <input
                      required
                      value={adminForm[field]}
                      type={
                        field === "date"
                          ? "datetime-local"
                          : field === "price" || field === "capacity"
                            ? "number"
                            : "text"
                      }
                      onChange={(e) =>
                        setAdminForm({ ...adminForm, [field]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  price currency
                  <select
                    required
                    value={adminForm.currency}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, currency: e.target.value })
                    }
                  >
                    <option value="USD">$ USD</option>
                    <option value="INR">₹ INR</option>
                  </select>
                </label>
                <label>
                  description
                  <textarea
                    required
                    value={adminForm.description}
                    onChange={(e) =>
                      setAdminForm({
                        ...adminForm,
                        description: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  event image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, image: e.target.files[0] })
                    }
                  />
                </label>
                <div className="form-actions">
                  <button type="submit" className="dark-button">
                    {adminForm._id ? "Update event" : "Publish event"}
                  </button>
                  {adminForm._id && (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setAdminForm(blankEvent)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
              <div className="admin-events">
                <h3>
                  Events <span>{events.length}</span>
                </h3>
                {events.map((event) => (
                  <div className="admin-event-row" key={event._id}>
                    <div>
                      <strong>{event.title}</strong>
                      <span>
                        {event.status === "cancelled"
                          ? "Cancelled by organizer"
                          : `${event.category} · ${event.bookedSeats}/${event.capacity} booked`}
                      </span>
                    </div>
                    <div>
                      <button
                        className="text-button"
                        onClick={() =>
                          setAdminForm({
                            ...event,
                            date: event.date.slice(0, 16),
                            image: null,
                          })
                        }
                      >
                        Edit
                      </button>
                      {event.status === "cancelled" ? (
                        <span className="event-cancelled-badge">Cancelled</span>
                      ) : (
                        <button
                          className="text-button danger"
                          disabled={cancellingEventId === event._id}
                          onClick={() => cancelEvent(event)}
                        >
                          {cancellingEventId === event._id ? "Cancelling..." : "Cancel event"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <section className="admin-bookings-section">
              <div className="admin-bookings-header">
                <div>
                  <p className="eyebrow">BOOKING MANAGEMENT</p>
                  <h2>Search <em>bookings.</em></h2>
                  <p className="muted">
                    Search an event to see how many tickets have been booked.
                  </p>
                </div>

                <div className="admin-booking-search-wrapper">
                  <span className="admin-booking-search-icon">⌕</span>

                  <input
                    type="text"
                    value={adminBookingSearch}
                    onChange={(event) => setAdminBookingSearch(event.target.value)}
                    placeholder="Search event name..."
                    className="admin-booking-search"
                  />
                </div>
              </div>

              {adminBookingsLoading ? (
                <p className="muted">Loading bookings...</p>
              ) : filteredAdminBookingSummary.length === 0 ? (
                <p className="muted">No bookings found.</p>
              ) : (
                <div className="admin-booking-results">
                  {filteredAdminBookingSummary.map((item) => (
                    <div
                      className="admin-booking-card"
                      key={item.event._id}
                    >
                      <div>
                        <h3>{item.event.title}</h3>
                        <p className="muted">
                          {item.bookingCount}{" "}
                          {item.bookingCount === 1 ? "booking" : "bookings"}
                        </p>
                      </div>

                      <strong>
                        {item.totalTickets}{" "}
                        {item.totalTickets === 1 ? "ticket" : "tickets"} booked
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}
      </main>
      <footer>
        <span>eventbird © 2025</span>
        <span>Good times, thoughtfully gathered.</span>
      </footer>
      {selectedEvent && (
        <div className="modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="event-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="close-button"
              onClick={() => setSelectedEvent(null)}
            >
              ×
            </button>
            <div
              className="modal-image"
              style={{ backgroundImage: `url(${imageUrl(selectedEvent)})` }}
            ></div>
            <div className="modal-body">
              <p className="eyebrow">
                {selectedEvent.category} ·{" "}
                {new Date(selectedEvent.date).toLocaleDateString("en-US", {
                  dateStyle: "long",
                })}
              </p>
              <h2>{selectedEvent.title}</h2>
              <p className="muted">{selectedEvent.location}</p>
              <p className="description">{selectedEvent.description}</p>
              {!reviewOnly && (
                new Date(selectedEvent.date) > new Date() ? (
                 <div className="booking-action">
                  <label>  Tickets
                  <input
                    type="number"
                    min="1"
                    max={selectedEvent.capacity - selectedEvent.bookedSeats}
                    value={tickets}
                    onChange={(e) => setTickets(Number(e.target.value))}
                  />
                  </label>
                  <label className="reminder-toggle">
                    <input type="checkbox" checked={reminderOptIn} onChange={(e) => setReminderOptIn(e.target.checked)} />
                    Email me a reminder 24 hours before
                  </label>
                  <button className="dark-button" onClick={bookEvent}>
                    Reserve tickets
                  </button>
                 </div>
                ) : (
                <div className="event-ended">
                  <strong>Event has ended</strong>
                  <p>Tickets are no longer available for this event.</p>
                </div>
                )
              )}

              <section className="reviews-section">
                <div className="reviews-heading"><h3>Guest notes</h3><span>{reviews.count ? `${reviews.average.toFixed(1)} / 5 · ${reviews.count} reviews` : "No reviews yet"}</span></div>
                {reviews.reviews.map((review) => (
                  <article className="review-row" key={review._id}>
                    <strong>{review.user.name} <span>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></strong>
                    {review.comment && <p>{review.comment}</p>}
                  </article>
                ))}
                {!selectedEventHasPassed ? (
                  <p className="review-gate-message">Reviews can be submitted after the event.</p>
                ) : !session ? (
                  <div className="review-gate-message">
                    <p>Log in after the event to share your review.</p>
                    <button type="button" className="dark-button" onClick={() => setAuthMode("login")}>Log in to review</button>
                  </div>
                ) : !hasConfirmedSelectedEventBooking ? (
                  <p className="review-gate-message">A confirmed booking is required to review this event.</p>
                ) : (
                  <form className="review-form" onSubmit={submitReview}>
                    <label>Rating<select value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
                    <label>Your review<textarea maxLength="1000" value={reviewForm.comment} onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })} placeholder="What made the experience memorable?" /></label>
                    <button className="dark-button">Post review</button>
                  </form>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
      {authMode && (
        <div className="modal-backdrop" onClick={() => setAuthMode(null)}>
          <form
            className="auth-modal"
            onSubmit={submitAuth}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="close-button"
              onClick={() => setAuthMode(null)}
            >
              ×
            </button>
            <p className="eyebrow">WELCOME TO EVENTBIRD</p>
            <h2>
              {authMode === "login" ? "Come on in." : "Make room for fun."}
            </h2>
            {authMode === "register" && (
              <label>
                Your name
                <input
                  required
                  value={authForm.name}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, name: e.target.value })
                  }
                />
              </label>
            )}
            <label>
              Email address
              <input
                required
                type="email"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm({ ...authForm, email: e.target.value })
                }
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                minLength="6"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm({ ...authForm, password: e.target.value })
                }
              />
            </label>
            <button className="dark-button full-button" disabled={loading}>
              {loading
                ? "Please wait..."
                : authMode === "login"
                  ? "Log in"
                  : "Create account"}
            </button>
            <button
              type="button"
              className="switch-auth"
              onClick={() =>
                setAuthMode(authMode === "login" ? "register" : "login")
              }
            >
              {authMode === "login"
                ? "New here? Create an account"
                : "Already have an account? Log in"}
            </button>
          </form>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

export default App;
