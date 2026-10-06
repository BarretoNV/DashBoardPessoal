import type { ReactNode } from 'react'
export function SectionHeader({
  number,
  title,
  children,
}: {
  number: string
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <>
      <span className="edge-scan" aria-hidden="true"><span /></span>
      <div className="section-heading">
        <h2>
          <span className="section-number" aria-hidden="true">
            {number}
          </span>
          {title}
        </h2>
        {children}
      </div>
    </>
  )
}
