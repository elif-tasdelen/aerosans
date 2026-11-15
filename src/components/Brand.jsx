import { useState } from 'react';

const BASE = import.meta.env.BASE_URL;
export const LOGO_SRC = `${BASE}aerosans-logo.png`;
export const MARK_SRC = `${BASE}aerosans-mark.png`;

/** Eye symbol for the top bar. Renders nothing if the image file is missing. */
export function BrandMark({ height = 36 }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img className="brand-mark" src={MARK_SRC} alt="" height={height} onError={() => setOk(false)} />;
}

/** Full team logo for the empty state. Falls back to the name as text if the image file is missing. */
export function BrandLogo() {
  const [ok, setOk] = useState(true);
  if (!ok) return <div className="brand-logo-text">AeroSANS</div>;
  return <img className="brand-logo" src={LOGO_SRC} alt="AeroSANS logo" onError={() => setOk(false)} />;
}

/** Small (i) button with a short explanation shown on hover, focus or tap. */
export function Info({ label, text }) {
  return (
    <span className="info" tabIndex={0} role="button" aria-label={`${label}: ${text}`}>
      <span className="info-icon" aria-hidden="true">
        i
      </span>
      <span className="info-tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}
