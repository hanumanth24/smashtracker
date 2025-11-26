import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="footer-brand">
          <div className="brand-mark">⚡</div>
          <div>
            <div className="brand-title">SmashTrack 3D</div>
            <p className="footer-copy">
              Fast Firestore-powered badminton tracker with a neon arena and admin PIN
              safeguards.
            </p>
          </div>
        </div>

        <div className="footer-columns">
          <div>
            <div className="footer-heading">Product</div>
            <Link href="#league" className="footer-link">
              League Table
            </Link>
            <Link href="#tournament" className="footer-link">
              Tournament
            </Link>
            <Link href="#arena" className="footer-link">
              3D Court
            </Link>
          </div>
          <div>
            <div className="footer-heading">Support</div>
            <a className="footer-link" href="mailto:team@smashtrack.local">
              Email support
            </a>
            <a className="footer-link" href="https://firebase.google.com/">
              Firestore status
            </a>
            <span className="footer-pill success">Live sync</span>
          </div>
        </div>

        <div className="footer-meta">
          <span>© {new Date().getFullYear()} SmashTrack</span>
          <span className="dot" />
          <span>Built for friends & clubs</span>
        </div>
      </div>
    </footer>
  );
}
