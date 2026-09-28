import Link from "next/link";
import styles from "./SiteHeader.module.scss";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        eaiku
      </Link>
      <nav className={styles.nav}>
        <Link href="/plugins" className={styles.link}>
          Plugins
        </Link>
      </nav>
    </header>
  );
}
