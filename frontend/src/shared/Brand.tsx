import styles from './Brand.module.css'

interface BrandProps {
  tagline?: string
  large?: boolean
}

export function Brand({ tagline, large = false }: BrandProps) {
  return (
    <div className={large ? `${styles.brand} ${styles.large}` : styles.brand}>
      <span className={styles.isotype} aria-hidden="true">
        CD
      </span>
      <span className={styles.text}>
        <span className={styles.name}>Casa Diaco</span>
        {tagline !== undefined && <span className={styles.tagline}>{tagline}</span>}
      </span>
    </div>
  )
}
