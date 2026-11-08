import type { ReactNode } from 'react'
export function SectionHeader({
  title,
  children,
}: {
  number: string
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <>
      <div className="section-heading">
        <h2>{title}</h2>
        {children}
      </div>
    </>
  )
}
