# Tutorial confirmation and class guidance — v0.02.143

The stat-save tutorial reused its highlight target as its complete input allowlist. When the confirmation appeared, only Confirm was accepted; Cancel and Escape's synthesized Cancel click were blocked. The input allowlist now includes both decisions, while the guide still highlights Confirm. Escape cancels a visible confirmation in every viewport. Cancel closes only the confirmation: the unsaved preview and tutorial step remain, with no committed stat change.

Non-Mage basic training now names the actual basic skill and explains tap/release versus hold/aim/release. Skill detail and upgrade targets follow that class's basic skill. This adapts a copy of the shared tutorial data; Mage data, step identifiers, combat input, class art and reward behavior are unchanged.

Before-fix Chromium reproduction failed both Cancel and Escape on desktop, portrait and landscape. After-fix tests use real clicks and keyboard events to verify Cancel, Escape, keyboard activation, repeated reopening, unchanged saved INT=3 at step 5/12, and explicit confirmation alone saving INT=4 and advancing. Desktop follows genuine D movement and J combat from a fresh profile; touch layouts skip only the prior movement/combat steps through a fixture. Separate actual browser cases verify Witch, Warrior and Archer instructions and basic skill detail/upgrade progression. Evidence: `reports/tutorial-stat-cancel-v143`.

UI, profile persistence, runtime integration, approved-art preservation and mobile tutorial exit/reentry checks passed locally. The deployment workflow runs the new regression tests and verifies the new tutorial runtime files against public Hosting hashes.
