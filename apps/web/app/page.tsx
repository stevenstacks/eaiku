import Link from "next/link";
import styles from "./page.module.scss";

export default function HomePage() {
  return (
    <main className={styles.placeholder}>
      <h1 className={styles.title}>EAIKU</h1>
      <Link href="/p/catat" className={`glass ${styles.cta}`}>
        My notes →
      </Link>
    </main>
  );
}
