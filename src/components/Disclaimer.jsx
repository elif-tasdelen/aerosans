// AeroSANS — NASA Space Apps Challenge 2026
// Portions of this file were generated with AI assistance (Claude Code, Anthropic) and reviewed by the team.

import { DISCLAIMER_TEXT } from '../config.js';

/** Persistent banner shown on every page. */
export default function Disclaimer() {
  return (
    <div className="disclaimer" role="note">
      <span className="disclaimer-icon" aria-hidden="true">⚠</span>
      <strong>{DISCLAIMER_TEXT}</strong>
    </div>
  );
}
