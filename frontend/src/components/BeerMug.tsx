/** The Pub's mark: a beer mug with a foam head. */
export function BeerMug({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      {/* handle */}
      <path
        d="M17 10h2.2A2.8 2.8 0 0 1 22 12.8v2.4A2.8 2.8 0 0 1 19.2 18H17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* mug body */}
      <path
        d="M5 9h12v9.5A2.5 2.5 0 0 1 14.5 21h-7A2.5 2.5 0 0 1 5 18.5V9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* beer line */}
      <path d="M5 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      {/* foam */}
      <path
        d="M6.6 9a2.1 2.1 0 0 1 .3-4.1 2.6 2.6 0 0 1 4.6-1.6 2.4 2.4 0 0 1 4 1.2 2.2 2.2 0 0 1 .1 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
