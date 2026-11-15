import { DISCLAIMER_TEXT } from '../config.js';

/** Thin strip fixed to the bottom of every page. */
export default function Disclaimer() {
  return (
    <div className="disclaimer" role="note">
      <strong>{DISCLAIMER_TEXT}</strong> Simulated data where labeled. Not for clinical use.
    </div>
  );
}
