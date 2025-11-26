import Link from "next/link";
import { useState } from "react";

export default function SiteHeader({
  tab,
  onTabChange,
  notificationsCount = 0,
  hydrated = false,
  activePage = "league",
}) {
  const displayCount = hydrated ? notificationsCount : "—";
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div className="site-brand">
          <div className="brand-mark">🏸</div>
          <div>
            <div className="brand-title">SmashTrack 3D</div>
            <div className="brand-sub">League · Tournaments</div>
          </div>
        </div>

        <button
          type="button"
          className={`hamburger ${menuOpen ? "is-open" : ""}`}
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav
          id="primary-nav"
          className={`view-toggle ${menuOpen ? "nav-open" : "nav-closed"}`}
          aria-label="Primary navigation"
        >
          <Link
            href="/"
            onClick={closeMenu}
            className={"view-btn " + (activePage === "league" ? "view-active" : "")}
          >
            League View
          </Link>
          <Link
            href="/nrrc"
            onClick={closeMenu}
            className={"view-btn " + (activePage === "nrrc" ? "view-active" : "")}
          >
            NRRC
          </Link>
          <div className="nav-extra-mobile">
            <Link className="btn btn-ghost notif-btn nav-btn-full" href="/notifications" onClick={closeMenu}>
              Notifications
              <span
                className={"notif-count " + (notificationsCount ? "has-count" : "")}
                suppressHydrationWarning
              >
                {displayCount}
              </span>
            </Link>
            <a className="btn btn-primary nav-btn-full" href="mailto:team@smashtrack.local?subject=SmashTrack%203D%20Invite">
              Share Link
            </a>
          </div>
        </nav>

        <div className="header-actions">
          <Link className="btn btn-ghost notif-btn" href="/notifications">
            Notifications
            <span
              className={"notif-count " + (notificationsCount ? "has-count" : "")}
              suppressHydrationWarning
            >
              {displayCount}
            </span>
          </Link>
          <a
            className="btn btn-primary"
            href="mailto:team@smashtrack.local?subject=SmashTrack%203D%20Invite"
          >
            Share Link
          </a>
        </div>
      </div>
    </header>
  );
}
