export function SiteFooter() {
  return (
    <footer className="footer"><div className="shell footer-inner">
      <nav className="footer-primary" aria-label="Footer navigation">
        <a href="/about">About</a><a href="/blog">Blog</a><a href="/contact">Contact</a>
        <a href="/guidelines">Guidelines</a><a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a><a href="/refund-policy">Refund Policy</a>
      </nav>
      <nav className="footer-secondary" aria-label="Directory topics">
        <a href="/backpage-alternative">Backpage Alternative</a><a href="/personals">Local Personals</a>
        <a href="/casual-encounters">Casual Encounters</a><a href="/classifieds">Free Classifieds</a>
      </nav>
      <p>© 2026 BackpageNew.com</p>
      <a className="back-to-top" href="#top">↑ Top</a>
    </div></footer>
  );
}
